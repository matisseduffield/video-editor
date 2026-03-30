use std::path::PathBuf;
use std::process::Stdio;
use tauri::Manager;
use tokio::process::Command;

/// Resolves the path to the bundled FFmpeg binary.
/// In development, looks in src-tauri/binaries/ffmpeg/
/// In production, looks in the Tauri resource directory.
pub fn get_ffmpeg_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    // Try resource directory first (production builds)
    if let Ok(resource_dir) = app_handle.path().resource_dir() {
        let ffmpeg: PathBuf = resource_dir.join("binaries").join("ffmpeg").join(ffmpeg_binary_name());
        if ffmpeg.exists() {
            return Ok(ffmpeg);
        }
    }

    // Fallback: check if ffmpeg is on PATH (development)
    Ok(PathBuf::from(ffmpeg_binary_name()))
}

/// Resolves the path to the bundled FFprobe binary.
pub fn get_ffprobe_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Ok(resource_dir) = app_handle.path().resource_dir() {
        let ffprobe: PathBuf = resource_dir.join("binaries").join("ffmpeg").join(ffprobe_binary_name());
        if ffprobe.exists() {
            return Ok(ffprobe);
        }
    }

    Ok(PathBuf::from(ffprobe_binary_name()))
}

fn ffmpeg_binary_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    }
}

fn ffprobe_binary_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "ffprobe.exe"
    } else {
        "ffprobe"
    }
}

/// Resolves the path to the bundled Python executable.
/// In development, falls back to system PATH python.
/// In production, uses the bundled embeddable Python.
pub fn get_python_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Ok(resource_dir) = app_handle.path().resource_dir() {
        let python = resource_dir.join("binaries").join("python").join(python_binary_name());
        if python.exists() {
            return Ok(python);
        }
    }

    // Fallback: system PATH (development)
    Ok(PathBuf::from(python_binary_name()))
}

fn python_binary_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "python.exe"
    } else {
        "python3"
    }
}

/// Resolves the path to the bundled watermark image.
pub fn get_watermark_path(app_handle: &tauri::AppHandle) -> Option<PathBuf> {
    if let Ok(resource_dir) = app_handle.path().resource_dir() {
        let wm = resource_dir.join("binaries").join("watermark.png");
        if wm.exists() {
            return Some(wm);
        }
    }
    // Dev fallback: check src-tauri/binaries/
    let dev_path = PathBuf::from("binaries").join("watermark.png");
    if dev_path.exists() {
        return Some(dev_path);
    }
    None
}

/// Probe a video file and return metadata as JSON.
pub async fn probe_video(ffprobe_path: &PathBuf, file_path: &str) -> Result<serde_json::Value, String> {
    let mut cmd = Command::new(ffprobe_path);
    cmd.args([
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            file_path,
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let output = cmd.output().await
        .map_err(|e| format!("Failed to run ffprobe: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffprobe failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str(&stdout).map_err(|e| format!("Failed to parse ffprobe output: {}", e))
}

/// Build FFmpeg command arguments for a processing job.
/// This is the core function that translates our settings into FFmpeg CLI args.
pub fn build_ffmpeg_args(
    input_path: &str,
    output_path: &str,
    config: &crate::types::ProcessingConfig,
    watermark_path: Option<&str>,
    duration_secs: f64,
    caption_segments: Option<&[crate::whisper::TranscriptionSegment]>,
) -> Vec<String> {
    let mut args = Vec::new();

    // Input
    args.extend(["-i".to_string(), input_path.to_string()]);

    // Add watermark as second input if enabled
    let use_watermark = config.overlays.dynamic_watermark && watermark_path.is_some();
    if let Some(wm) = watermark_path {
        if config.overlays.dynamic_watermark {
            args.extend(["-i".to_string(), wm.to_string()]);
        }
    }

    // Overwrite without asking
    args.push("-y".to_string());

    // Video codec
    let vcodec = get_video_codec(&config.render.codec, config.render.gpu_acceleration);
    args.extend(["-c:v".to_string(), vcodec.to_string()]);

    // Bitrate
    args.extend(["-b:v".to_string(), format!("{}M", config.render.bitrate)]);

    // Parse target aspect ratio from output path (format suffix e.g. "9x16")
    let target_aspect = parse_aspect_from_output(output_path);

    if let Some((tw, th)) = target_aspect {
        // Zoom logic (fill_percent 0–100):
        //   0%   → video fits width-wise inside target (letterbox), blur/black fills top+bottom
        //   100% → video fills height-wise (crops sides to fully fill frame)
        //   In between → linear interpolation of scale factor
        let zoom = config.render.fill_percent.min(100) as f64 / 100.0;

        let has_blur = config.overlays.blurred_background;

        // Build the background layer
        let bg_filter = if has_blur {
            format!(
                "[0:v]scale={tw}:{th}:force_original_aspect_ratio=increase,crop={tw}:{th},boxblur=20:5[bg]",
                tw = tw, th = th
            )
        } else {
            format!("color=black:size={tw}x{th}:rate=30[bg]", tw = tw, th = th)
        };

        // Foreground: interpolate between fit-by-width and fill-by-height using zoom
        let fg_filter = format!(
            "[0:v]scale=\
             'trunc(({tw} + {z}*({th}*iw/ih - {tw}))/2)*2':\
             'trunc(({tw}*ih/iw + {z}*({th} - {tw}*ih/iw))/2)*2'\
             :flags=lanczos[fg]",
            tw = tw, th = th, z = zoom
        );

        let mut filter = format!(
            "{bg};{fg};[bg][fg]overlay=(W-w)/2:(H-h)/2",
            bg = bg_filter, fg = fg_filter
        );

        // Progress bar overlay
        if config.overlays.progress_bar && duration_secs > 0.0 {
            filter = format!(
                "{prev}[pbase];[pbase]drawbox=x=0:y=ih-6:w='iw*t/{dur:.2}':h=6:color=0x8b5cf6@0.85:t=fill",
                prev = filter, dur = duration_secs
            );
        }

        // Bouncing watermark overlay
        if use_watermark {
            let wm_w = (tw as f64 * 0.20).round() as i32;
            filter = format!(
                "{prev}[wmbase];\
                 [1:v]scale={wm_w}:-1:flags=lanczos,format=rgba,colorchannelmixer=aa=0.6[wm];\
                 [wmbase][wm]overlay=\
                 'abs(mod(t*80\\,2*(W-w))-(W-w))':\
                 'abs(mod(t*60\\,2*(H-h))-(H-h))'",
                prev = filter, wm_w = wm_w
            );
        }

        // Caption overlays (drawtext for each word group)
        if let Some(segments) = caption_segments {
            if config.captions.enabled && !segments.is_empty() {
                let caption_filters = build_caption_filters(segments, &config.captions, tw, th);
                if !caption_filters.is_empty() {
                    filter = format!("{}[capbase];[capbase]{}", filter, caption_filters);
                }
            }
        }

        // Label final video output as [vout]
        filter = format!("{}[vout]", filter);

        // Add audio processing in the same graph
        if config.audio.loudness_normalization {
            filter = format!(
                "{};[0:a]loudnorm=I={}:TP=-1.5:LRA=11[aout]",
                filter, config.audio.target_lufs
            );
        }

        args.extend(["-filter_complex".to_string(), filter]);
        args.extend(["-map".to_string(), "[vout]".to_string()]);
        if config.audio.loudness_normalization {
            args.extend(["-map".to_string(), "[aout]".to_string()]);
        } else {
            args.extend(["-map".to_string(), "0:a?".to_string()]);
        }

    } else if use_watermark {
        // No target aspect but has watermark
        let mut filter =
            "[1:v]scale='iw*0.20':-1:flags=lanczos,format=rgba,colorchannelmixer=aa=0.6[wm];\
             [0:v][wm]overlay=\
             'abs(mod(t*80\\,2*(W-w))-(W-w))':\
             'abs(mod(t*60\\,2*(H-h))-(H-h))'\
             [vout]"
            .to_string();

        if config.audio.loudness_normalization {
            filter = format!(
                "{};[0:a]loudnorm=I={}:TP=-1.5:LRA=11[aout]",
                filter, config.audio.target_lufs
            );
        }

        args.extend(["-filter_complex".to_string(), filter]);
        args.extend(["-map".to_string(), "[vout]".to_string()]);
        if config.audio.loudness_normalization {
            args.extend(["-map".to_string(), "[aout]".to_string()]);
        } else {
            args.extend(["-map".to_string(), "0:a?".to_string()]);
        }
    } else if config.audio.loudness_normalization {
        // No video filter_complex, just audio filter
        args.extend([
            "-af".to_string(),
            format!("loudnorm=I={}:TP=-1.5:LRA=11", config.audio.target_lufs),
        ]);
    }

    // Audio codec
    args.extend(["-c:a".to_string(), "aac".to_string()]);
    args.extend(["-b:a".to_string(), "192k".to_string()]);

    // Pixel format — required for NVENC compatibility
    args.extend(["-pix_fmt".to_string(), "yuv420p".to_string()]);

    // Dry run: lower resolution for fast preview
    if config.render.dry_run {
        let preset = if config.render.gpu_acceleration { "fast" } else { "ultrafast" };
        args.extend(["-preset".to_string(), preset.to_string()]);
    }

    // Output
    args.push(output_path.to_string());

    // Debug: log the full FFmpeg command
    #[cfg(debug_assertions)]
    eprintln!("[FFmpeg] args: {:?}", args);

    args
}

/// Parse target resolution from output path format suffix (e.g. "..._9x16.mp4" → (1080, 1920))
fn parse_aspect_from_output(output_path: &str) -> Option<(i32, i32)> {
    let stem = std::path::Path::new(output_path)
        .file_stem()
        .and_then(|s| s.to_str())?;
    // Look for the last "_WxH" pattern
    let suffix = stem.rsplit('_').next()?;
    let parts: Vec<&str> = suffix.split('x').collect();
    if parts.len() == 2 {
        let w_ratio: i32 = parts[0].parse().ok()?;
        let h_ratio: i32 = parts[1].parse().ok()?;
        // Convert aspect ratio to resolution
        let (w, h) = aspect_to_resolution(w_ratio, h_ratio);
        Some((w, h))
    } else {
        None
    }
}

/// Convert an aspect ratio like 9:16 to a target resolution
fn aspect_to_resolution(w: i32, h: i32) -> (i32, i32) {
    match (w, h) {
        (9, 16) => (1080, 1920),
        (16, 9) => (1920, 1080),
        (1, 1) => (1080, 1080),
        (4, 5) => (1080, 1350),
        (4, 3) => (1440, 1080),
        _ => {
            // Generic: scale so the larger dimension is 1920
            let scale = 1920.0 / (w.max(h) as f64);
            let rw = ((w as f64 * scale) as i32 / 2) * 2; // ensure even
            let rh = ((h as f64 * scale) as i32 / 2) * 2;
            (rw, rh)
        }
    }
}

/// Build drawtext filter string for word-by-word captions.
/// Groups words into chunks of ~3, shows them timed to speech, with highlight support.
fn build_caption_filters(
    segments: &[crate::whisper::TranscriptionSegment],
    captions: &crate::types::CaptionSettings,
    _width: i32,
    height: i32,
) -> String {
    if segments.is_empty() {
        return String::new();
    }

    let font_size = captions.font_size.max(20).min(200);
    let stroke_w = captions.stroke_width;
    let fontfile = font_to_path(&captions.font);

    // Y position based on user setting
    let y_expr = match captions.position.as_str() {
        "top" => format!("{}", (height as f64 * 0.10).round() as i32),
        "center" => "(h-text_h)/2".to_string(),
        _ => format!("{}", (height as f64 * 0.82).round() as i32), // bottom
    };

    // Shadow offset
    let shadow_x = if captions.shadow { 3 } else { 0 };
    let shadow_y = if captions.shadow { 3 } else { 0 };

    // Highlight words (lowercased for comparison)
    let highlight_words: Vec<String> = captions
        .highlight_words
        .iter()
        .map(|w| w.trim().to_lowercase())
        .filter(|w| !w.is_empty())
        .collect();
    let highlight_color = if captions.highlight_color.is_empty() {
        "yellow".to_string()
    } else {
        captions.highlight_color.clone()
    };

    // Group words into chunks of 3-4
    let chunk_size = 3;
    let chunks: Vec<&[crate::whisper::TranscriptionSegment]> =
        segments.chunks(chunk_size).collect();

    let mut filters: Vec<String> = Vec::new();

    for chunk in &chunks {
        let Some(first) = chunk.first() else { continue };
        let Some(last) = chunk.last() else { continue };
        let start_s = first.start_ms as f64 / 1000.0;
        let end_s = last.end_ms as f64 / 1000.0;
        // Small padding so captions don't flicker
        let end_s = end_s + 0.05;

        // Build the full chunk text
        let words: Vec<&str> = chunk.iter().map(|w| w.text.as_str()).collect();
        let full_text = words.join(" ");
        let escaped = escape_drawtext_text(&full_text);

        // Check if any word in this chunk should be highlighted
        let has_highlight = !highlight_words.is_empty()
            && chunk.iter().any(|w| {
                let lower = w.text.to_lowercase();
                highlight_words.iter().any(|hw| lower.contains(hw.as_str()))
            });

        // Main text (white or default color)
        filters.push(format!(
            "drawtext=text='{txt}':\
             fontfile={ff}:\
             fontsize={fs}:\
             fontcolor=white:\
             borderw={bw}:\
             bordercolor=black:\
             shadowx={sx}:shadowy={sy}:shadowcolor=black@0.6:\
             x=(w-text_w)/2:y={yp}:\
             enable='between(t\\,{s:.3}\\,{e:.3})'",
            txt = escaped,
            ff = fontfile,
            fs = font_size,
            bw = stroke_w,
            sx = shadow_x,
            sy = shadow_y,
            yp = y_expr,
            s = start_s,
            e = end_s,
        ));

        // Highlight overlay: draw individual highlighted words on top
        if has_highlight {
            for word_seg in chunk.iter() {
                let lower = word_seg.text.to_lowercase();
                if highlight_words.iter().any(|hw| lower.contains(hw.as_str())) {
                    let ws = word_seg.start_ms as f64 / 1000.0;
                    let we = word_seg.end_ms as f64 / 1000.0 + 0.05;
                    let word_escaped = escape_drawtext_text(&word_seg.text);
                    filters.push(format!(
                        "drawtext=text='{txt}':\
                         fontfile={ff}:\
                         fontsize={fs}:\
                         fontcolor={hc}:\
                         borderw={bw}:\
                         bordercolor=black:\
                         shadowx={sx}:shadowy={sy}:shadowcolor=black@0.6:\
                         x=(w-text_w)/2:y={yp}:\
                         enable='between(t\\,{s:.3}\\,{e:.3})'",
                        txt = word_escaped,
                        ff = fontfile,
                        fs = font_size,
                        hc = highlight_color,
                        bw = stroke_w,
                        sx = shadow_x,
                        sy = shadow_y,
                        yp = y_expr,
                        s = ws,
                        e = we,
                    ));
                }
            }
        }
    }

    filters.join(",")
}

/// Map font name from UI to an FFmpeg-compatible font file path.
/// Platform-aware: resolves fonts on Windows, macOS, and Linux.
/// Falls back through system fonts, then to a bundled fallback font.
fn font_to_path(font: &str) -> String {
    let candidates = font_candidates(font);
    for path in &candidates {
        if std::path::Path::new(path).exists() {
            return escape_font_path(path);
        }
    }
    // Final fallback: use the first system candidate (FFmpeg will use its own default if missing)
    escape_font_path(candidates.first().unwrap_or(&fallback_font_path()))
}

/// Escape a font file path for use in FFmpeg drawtext filter.
/// On Windows, colons need triple-escaping for FFmpeg's parser.
fn escape_font_path(path: &str) -> String {
    if cfg!(target_os = "windows") {
        path.replace('\\', "/").replace(':', "\\\\\\:")
    } else {
        path.replace(':', "\\:")
    }
}

/// Get the platform-specific font file candidates for a given font name.
fn font_candidates(font: &str) -> Vec<String> {
    let mut paths = Vec::new();

    #[cfg(target_os = "windows")]
    {
        let fonts_dir = "C:/Windows/Fonts";
        let filenames = match font {
            "Arial Black" => vec!["ariblk.ttf"],
            "Impact" => vec!["impact.ttf"],
            "Montserrat" => vec!["Montserrat-Bold.ttf", "Montserrat-SemiBold.ttf", "arial.ttf"],
            "Bebas Neue" => vec!["BebasNeue-Regular.ttf", "arial.ttf"],
            "Oswald" => vec!["Oswald-Bold.ttf", "Oswald-SemiBold.ttf", "arial.ttf"],
            "Poppins" => vec!["Poppins-Bold.ttf", "Poppins-SemiBold.ttf", "arial.ttf"],
            "Roboto Bold" => vec!["Roboto-Bold.ttf", "arialbd.ttf"],
            _ => vec!["ariblk.ttf", "arial.ttf"],
        };
        for f in filenames {
            paths.push(format!("{}/{}", fonts_dir, f));
        }
    }

    #[cfg(target_os = "macos")]
    {
        let dirs = ["/System/Library/Fonts", "/Library/Fonts", "~/Library/Fonts"];
        let filenames = match font {
            "Arial Black" => vec!["Arial Black.ttf", "Arial Bold.ttf"],
            "Impact" => vec!["Impact.ttf"],
            "Montserrat" => vec!["Montserrat-Bold.ttf", "Montserrat-SemiBold.otf"],
            "Bebas Neue" => vec!["BebasNeue-Regular.ttf", "BebasNeue-Regular.otf"],
            "Oswald" => vec!["Oswald-Bold.ttf"],
            "Poppins" => vec!["Poppins-Bold.ttf"],
            "Roboto Bold" => vec!["Roboto-Bold.ttf"],
            _ => vec!["Arial Black.ttf", "Arial Bold.ttf", "Helvetica.ttc"],
        };
        for dir in &dirs {
            let expanded = if dir.starts_with('~') {
                if let Some(home) = std::env::var_os("HOME") {
                    format!("{}{}", home.to_string_lossy(), &dir[1..])
                } else {
                    dir.to_string()
                }
            } else {
                dir.to_string()
            };
            for f in &filenames {
                paths.push(format!("{}/{}", expanded, f));
            }
        }
        // macOS universal fallback
        paths.push("/System/Library/Fonts/Helvetica.ttc".to_string());
    }

    #[cfg(target_os = "linux")]
    {
        let dirs = [
            "/usr/share/fonts/truetype",
            "/usr/share/fonts",
            "/usr/local/share/fonts",
        ];
        let filenames = match font {
            "Arial Black" => vec!["msttcorefonts/Arial_Black.ttf", "dejavu/DejaVuSans-Bold.ttf"],
            "Impact" => vec!["msttcorefonts/Impact.ttf", "dejavu/DejaVuSans-Bold.ttf"],
            "Montserrat" => vec!["montserrat/Montserrat-Bold.ttf"],
            "Bebas Neue" => vec!["bebas-neue/BebasNeue-Regular.ttf"],
            "Oswald" => vec!["oswald/Oswald-Bold.ttf"],
            "Poppins" => vec!["poppins/Poppins-Bold.ttf"],
            "Roboto Bold" => vec!["roboto/Roboto-Bold.ttf"],
            _ => vec!["dejavu/DejaVuSans-Bold.ttf", "liberation/LiberationSans-Bold.ttf"],
        };
        for dir in &dirs {
            for f in &filenames {
                paths.push(format!("{}/{}", dir, f));
            }
        }
        // Linux universal fallback
        paths.push("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf".to_string());
    }

    paths
}

/// Get a platform-appropriate fallback font path (last resort).
fn fallback_font_path() -> String {
    if cfg!(target_os = "windows") {
        "C:/Windows/Fonts/arial.ttf".to_string()
    } else if cfg!(target_os = "macos") {
        "/System/Library/Fonts/Helvetica.ttc".to_string()
    } else {
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf".to_string()
    }
}

/// Get a platform-appropriate monospace font path for typewriter effects.
fn monospace_font_path() -> String {
    let candidates: Vec<&str> = if cfg!(target_os = "windows") {
        vec!["C:/Windows/Fonts/consola.ttf", "C:/Windows/Fonts/cour.ttf"]
    } else if cfg!(target_os = "macos") {
        vec!["/System/Library/Fonts/Menlo.ttc", "/System/Library/Fonts/Courier.dfont"]
    } else {
        vec![
            "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationMono-Bold.ttf",
        ]
    };
    for path in &candidates {
        if std::path::Path::new(path).exists() {
            return escape_font_path(path);
        }
    }
    escape_font_path(candidates.first().unwrap_or(&""))
}

/// Get the video codec string, optionally GPU-accelerated.
pub fn get_video_codec(codec: &str, gpu: bool) -> &'static str {
    match codec {
        "h264" => if gpu { "h264_nvenc" } else { "libx264" },
        "h265" => if gpu { "hevc_nvenc" } else { "libx265" },
        "vp9" => "libvpx-vp9",
        _ => "libx264",
    }
}

/// Get the CPU-only fallback codec string.
pub fn get_cpu_codec(codec: &str) -> &'static str {
    match codec {
        "h264" => "libx264",
        "h265" => "libx265",
        "vp9" => "libvpx-vp9",
        _ => "libx264",
    }
}

/// Convert an export format string like "9:16" to a target resolution
pub fn format_to_resolution(format: &str) -> Option<(i32, i32)> {
    let parts: Vec<&str> = format.split(':').collect();
    if parts.len() == 2 {
        let w: i32 = parts[0].parse().ok()?;
        let h: i32 = parts[1].parse().ok()?;
        Some(aspect_to_resolution(w, h))
    } else {
        None
    }
}

/// Escape text for use inside single-quoted drawtext text='...' values.
/// FFmpeg drawtext requires escaping: \ : ' and the text-level escaping
fn escape_drawtext_text(text: &str) -> String {
    text.replace('\\', "\\\\")
        .replace(':', "\\:")
        .replace('\'', "\u{2019}")
}

/// Generate TTS audio from text using edge-tts (Microsoft Neural voices)
pub async fn generate_tts_audio(python_path: &PathBuf, text: &str, output_path: &std::path::Path) -> Result<(), String> {
    let mut cmd = Command::new(python_path);
    cmd.args([
            "-m", "edge_tts",
            "--voice", "en-US-AndrewNeural",
            "--rate=-10%",
            "--text", text,
            "--write-media", &output_path.to_string_lossy(),
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let output = cmd.output().await
        .map_err(|e| format!("edge-tts failed: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("edge-tts failed: {}", stderr));
    }

    if !output_path.exists() {
        return Err("edge-tts produced no output file".to_string());
    }

    Ok(())
}

/// Get duration of a media file in seconds using ffprobe
pub async fn get_media_duration(
    ffprobe_path: &PathBuf,
    file_path: &std::path::Path,
) -> Result<f64, String> {
    let mut cmd = Command::new(ffprobe_path);
    cmd.args([
            "-v", "quiet",
            "-show_entries", "format=duration",
            "-of", "csv=p=0",
            &file_path.to_string_lossy(),
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let output = cmd.output().await
        .map_err(|e| format!("ffprobe error: {}", e))?;

    String::from_utf8_lossy(&output.stdout)
        .trim()
        .parse::<f64>()
        .map_err(|_| "Could not parse duration".to_string())
}

/// Build FFmpeg args for creating a typewriter intro video.
/// Uses the first frame of the source video (blurred) as the background,
/// with typewriter text overlay and TTS audio.
pub fn build_typewriter_intro_args(
    source_video: &str,
    audio_path: &str,
    output_path: &str,
    text: &str,
    duration: f64,
    width: i32,
    height: i32,
) -> Vec<String> {
    let mut args = Vec::new();

    // Input 0: source video (we only use the first frame)
    args.extend(["-i".to_string(), source_video.to_string()]);

    // Input 1: TTS audio
    args.extend(["-i".to_string(), audio_path.to_string()]);

    args.push("-y".to_string());

    // Duration: TTS + 1s breathing room
    let video_dur = duration + 1.0;

    // Build typewriter drawtext filters
    let chars: Vec<char> = text.chars().collect();
    let char_delay = 0.065; // ~15 chars/sec
    let total_type_time = chars.len() as f64 * char_delay;

    let font_size = (height as f64 * 0.038).round() as i32;
    let fontfile = monospace_font_path();

    // filter_complex: freeze first frame, scale+blur it, overlay typewriter text
    // [0:v] → take 1 frame, loop it for the duration → scale to target → blur
    let mut filter_parts = Vec::new();

    // Freeze the first frame and loop it for video_dur seconds
    // Then scale to target resolution and apply heavy blur + slight darken
    filter_parts.push(format!(
        "[0:v]trim=start=0:end=0.1,loop={}:1:0,setpts=N/FRAME_RATE/TB,\
         scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},\
         boxblur=25:10,eq=brightness=-0.15[bg]",
        (video_dur * 30.0).ceil() as i32,
        w = width, h = height
    ));

    // Typewriter: progressive character reveal
    let mut drawtext_parts = Vec::new();

    for i in 0..chars.len() {
        let visible: String = chars[..=i].iter().collect();
        let escaped = escape_drawtext_text(&visible);

        let start = i as f64 * char_delay;
        let end = (i + 1) as f64 * char_delay;

        drawtext_parts.push(format!(
            "drawtext=text='{txt}':\
             fontfile={ff}:\
             fontsize={fs}:\
             fontcolor=white:\
             borderw=2:bordercolor=black:\
             shadowx=2:shadowy=2:shadowcolor=black@0.7:\
             x=(w-text_w)/2:y=(h-text_h)/2:\
             enable='between(t,{s:.4},{e:.4})'",
            txt = escaped, ff = fontfile, fs = font_size,
            s = start, e = end,
        ));
    }

    // After typing: full text with blinking cursor
    let full_escaped = escape_drawtext_text(text);
    let cursor_escaped = escape_drawtext_text(&format!("{}|", text));
    let blink_start = total_type_time;

    drawtext_parts.push(format!(
        "drawtext=text='{txt}':\
         fontfile={ff}:\
         fontsize={fs}:\
         fontcolor=white:\
         borderw=2:bordercolor=black:\
         shadowx=2:shadowy=2:shadowcolor=black@0.7:\
         x=(w-text_w)/2:y=(h-text_h)/2:\
         enable='gte(t,{s:.4})*lt(mod(t-{s:.4},0.8),0.4)'",
        txt = cursor_escaped, ff = fontfile, fs = font_size, s = blink_start,
    ));

    drawtext_parts.push(format!(
        "drawtext=text='{txt}':\
         fontfile={ff}:\
         fontsize={fs}:\
         fontcolor=white:\
         borderw=2:bordercolor=black:\
         shadowx=2:shadowy=2:shadowcolor=black@0.7:\
         x=(w-text_w)/2:y=(h-text_h)/2:\
         enable='gte(t,{s:.4})*gte(mod(t-{s:.4},0.8),0.4)'",
        txt = full_escaped, ff = fontfile, fs = font_size, s = blink_start,
    ));

    // Combine: blurred bg → drawtext chain → trim to duration
    let filter = format!(
        "{bg};[bg]{dt},trim=duration={dur:.2},setpts=PTS-STARTPTS[vout]",
        bg = filter_parts.join(";"),
        dt = drawtext_parts.join(","),
        dur = video_dur,
    );

    args.extend(["-filter_complex".to_string(), filter]);
    args.extend(["-map".to_string(), "[vout]".to_string()]);
    args.extend(["-map".to_string(), "1:a".to_string()]);
    args.extend(["-c:v".to_string(), "libx264".to_string()]);
    args.extend(["-pix_fmt".to_string(), "yuv420p".to_string()]);
    args.extend(["-c:a".to_string(), "aac".to_string()]);
    args.extend(["-b:a".to_string(), "192k".to_string()]);
    args.push("-shortest".to_string());
    args.push(output_path.to_string());

    #[cfg(debug_assertions)]
    eprintln!("[FFmpeg intro] args: {:?}", args);

    args
}

/// Build FFmpeg args to concatenate intro + main video using the concat filter.
/// Normalizes both inputs to matching resolution, frame rate, and pixel format.
/// When `main_has_audio` is false, generates silence for the main video's audio track.
pub fn build_concat_args(
    intro_path: &str,
    main_path: &str,
    output_path: &str,
    codec: &str,
    gpu: bool,
    bitrate: u32,
    width: i32,
    height: i32,
    main_has_audio: bool,
) -> Vec<String> {
    let vcodec = get_video_codec(codec, gpu);
    // If main video has no audio, use anullsrc filter to generate silence
    let a1_line = if main_has_audio {
        "[1:a]aresample=44100,aformat=channel_layouts=stereo[a1]".to_string()
    } else {
        "anullsrc=r=44100:cl=stereo[a1]".to_string()
    };
    let filter = format!(
        "[0:v]scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p,setsar=1[v0];\
         [1:v]scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p,setsar=1[v1];\
         [0:a]aresample=44100,aformat=channel_layouts=stereo[a0];\
         {a1};\
         [v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]",
        w = width, h = height, a1 = a1_line
    );
    let mut args = vec![
        "-y".to_string(),
        "-i".to_string(), intro_path.to_string(),
        "-i".to_string(), main_path.to_string(),
        "-filter_complex".to_string(), filter,
        "-map".to_string(), "[v]".to_string(),
        "-map".to_string(), "[a]".to_string(),
        "-c:v".to_string(), vcodec.to_string(),
        "-pix_fmt".to_string(), "yuv420p".to_string(),
        "-b:v".to_string(), format!("{}M", bitrate),
        "-c:a".to_string(), "aac".to_string(),
        "-b:a".to_string(), "192k".to_string(),
        "-movflags".to_string(), "+faststart".to_string(),
    ];
    // When main has no audio, anullsrc generates infinite silence;
    // -shortest stops encoding when the video stream ends.
    if !main_has_audio {
        args.push("-shortest".to_string());
    }
    args.push(output_path.to_string());
    args
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::*;

    fn default_config() -> ProcessingConfig {
        ProcessingConfig {
            captions: CaptionSettings {
                enabled: false,
                highlight_words: vec![],
                highlight_color: "#FFFF00".to_string(),
                font: "Arial Black".to_string(),
                font_size: 80,
                stroke_width: 4,
                shadow: false,
                position: "bottom".to_string(),
                whisper_model: "base".to_string(),
            },
            overlays: OverlaySettings {
                progress_bar: false,
                dynamic_watermark: false,
                watermark_path: None,
                blurred_background: true,
                typewriter_hook: false,
                typewriter_text: String::new(),
            },
            audio: AudioSettings {
                loudness_normalization: false,
                target_lufs: -14.0,
            },
            render: RenderSettings {
                bitrate: 8,
                codec: "h264".to_string(),
                gpu_acceleration: false,
                dry_run: false,
                export_formats: vec!["9:16".to_string()],
                fill_percent: 0,
                output_directory: "/tmp".to_string(),
            },
        }
    }

    #[test]
    fn test_get_video_codec() {
        assert_eq!(get_video_codec("h264", false), "libx264");
        assert_eq!(get_video_codec("h264", true), "h264_nvenc");
        assert_eq!(get_video_codec("h265", false), "libx265");
        assert_eq!(get_video_codec("h265", true), "hevc_nvenc");
        assert_eq!(get_video_codec("vp9", false), "libvpx-vp9");
        assert_eq!(get_video_codec("vp9", true), "libvpx-vp9");
        assert_eq!(get_video_codec("unknown", false), "libx264");
    }

    #[test]
    fn test_format_to_resolution() {
        assert_eq!(format_to_resolution("9:16"), Some((1080, 1920)));
        assert_eq!(format_to_resolution("16:9"), Some((1920, 1080)));
        assert_eq!(format_to_resolution("1:1"), Some((1080, 1080)));
        assert_eq!(format_to_resolution("invalid"), None);
        assert_eq!(format_to_resolution(""), None);
    }

    #[test]
    fn test_aspect_to_resolution() {
        assert_eq!(aspect_to_resolution(9, 16), (1080, 1920));
        assert_eq!(aspect_to_resolution(16, 9), (1920, 1080));
        assert_eq!(aspect_to_resolution(1, 1), (1080, 1080));
        assert_eq!(aspect_to_resolution(4, 5), (1080, 1350));
        assert_eq!(aspect_to_resolution(4, 3), (1440, 1080));
        // Generic fallback: larger dim → 1920
        let (w, h) = aspect_to_resolution(3, 2);
        assert!(w > 0 && h > 0);
        assert!(w % 2 == 0 && h % 2 == 0); // even dimensions
    }

    #[test]
    fn test_parse_aspect_from_output() {
        assert_eq!(
            parse_aspect_from_output("/tmp/video_9x16.mp4"),
            Some((1080, 1920))
        );
        assert_eq!(
            parse_aspect_from_output("/tmp/video_16x9.mp4"),
            Some((1920, 1080))
        );
        assert_eq!(
            parse_aspect_from_output("/tmp/video_1x1.mp4"),
            Some((1080, 1080))
        );
        assert_eq!(parse_aspect_from_output("/tmp/video.mp4"), None);
    }

    #[test]
    fn test_build_ffmpeg_args_basic() {
        let config = default_config();
        let args = build_ffmpeg_args(
            "input.mp4",
            "/tmp/output_9x16.mp4",
            &config,
            None,
            60.0,
            None,
        );
        assert!(args.contains(&"-i".to_string()));
        assert!(args.contains(&"input.mp4".to_string()));
        assert!(args.contains(&"-c:v".to_string()));
        assert!(args.contains(&"libx264".to_string()));
        assert!(args.contains(&"-b:v".to_string()));
        assert!(args.contains(&"8M".to_string()));
        assert!(args.contains(&"-y".to_string()));
        assert_eq!(args.last().unwrap(), "/tmp/output_9x16.mp4");
    }

    #[test]
    fn test_build_ffmpeg_args_gpu() {
        let mut config = default_config();
        config.render.gpu_acceleration = true;
        let args = build_ffmpeg_args(
            "input.mp4",
            "/tmp/output_9x16.mp4",
            &config,
            None,
            60.0,
            None,
        );
        assert!(args.contains(&"h264_nvenc".to_string()));
    }

    #[test]
    fn test_build_ffmpeg_args_loudness_normalization() {
        let mut config = default_config();
        config.audio.loudness_normalization = true;
        config.audio.target_lufs = -16.0;
        let args = build_ffmpeg_args(
            "input.mp4",
            "/tmp/output_9x16.mp4",
            &config,
            None,
            60.0,
            None,
        );
        let filter_idx = args.iter().position(|a| a == "-filter_complex" || a == "-af");
        assert!(filter_idx.is_some(), "Should have audio filter for loudness normalization");
    }

    #[test]
    fn test_build_concat_args_with_audio() {
        let args = build_concat_args(
            "intro.mp4",
            "main.mp4",
            "output.mp4",
            "h264",
            false,
            8,
            1080,
            1920,
            true,
        );
        assert!(args.contains(&"-y".to_string()));
        assert!(args.contains(&"intro.mp4".to_string()));
        assert!(args.contains(&"main.mp4".to_string()));
        assert!(args.contains(&"libx264".to_string()));
        assert!(args.contains(&"aac".to_string()));
        assert_eq!(args.last().unwrap(), "output.mp4");
        // Should NOT have -shortest when main has audio
        assert!(!args.contains(&"-shortest".to_string()));
    }

    #[test]
    fn test_build_concat_args_without_audio() {
        let args = build_concat_args(
            "intro.mp4",
            "main.mp4",
            "output.mp4",
            "h264",
            false,
            8,
            1080,
            1920,
            false,
        );
        // Should have -shortest when main lacks audio
        assert!(args.contains(&"-shortest".to_string()));
        // Filter should contain anullsrc
        let filter_idx = args.iter().position(|a| a == "-filter_complex").unwrap();
        let filter = &args[filter_idx + 1];
        assert!(filter.contains("anullsrc"));
    }

    #[test]
    fn test_build_typewriter_intro_args() {
        let args = build_typewriter_intro_args(
            "source.mp4",
            "tts.mp3",
            "output.mp4",
            "Hello World",
            3.0,
            1080,
            1920,
        );
        assert!(args.contains(&"-i".to_string()));
        assert!(args.contains(&"source.mp4".to_string()));
        assert!(args.contains(&"tts.mp3".to_string()));
        assert!(args.contains(&"-y".to_string()));
        assert_eq!(args.last().unwrap(), "output.mp4");
        // Should have filter_complex with drawtext
        let filter_idx = args.iter().position(|a| a == "-filter_complex").unwrap();
        let filter = &args[filter_idx + 1];
        assert!(filter.contains("drawtext"));
    }

    #[test]
    fn test_escape_font_path_windows() {
        // On Windows, colons should be escaped
        if cfg!(target_os = "windows") {
            let result = escape_font_path("C:/Windows/Fonts/arial.ttf");
            assert!(result.contains("C\\\\\\:"));
        }
    }

    #[test]
    fn test_escape_drawtext_text() {
        assert_eq!(escape_drawtext_text("hello"), "hello");
        assert_eq!(escape_drawtext_text("a:b"), "a\\:b");
        // Single quotes should be replaced with Unicode right single quote
        assert!(escape_drawtext_text("it's").contains('\u{2019}'));
    }
}
