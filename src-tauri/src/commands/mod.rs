use serde::Deserialize;
use std::sync::Arc;
use tauri::{Emitter, State};
use tokio::sync::Mutex;
use crate::jobs::JobManager;
use crate::types::{Job, JobStatus, Preset, ProcessingConfig, AppSettings};

/// Shared state for the watch folder background task
pub struct WatchFolderState {
    pub cancel_token: Mutex<Option<tokio::sync::watch::Sender<bool>>>,
}

impl WatchFolderState {
    pub fn new() -> Self {
        Self { cancel_token: Mutex::new(None) }
    }
}

#[derive(Debug, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
}

/// Add new jobs to the queue
#[tauri::command]
pub async fn add_jobs(
    manager: State<'_, JobManager>,
    files: Vec<FileEntry>,
) -> Result<Vec<Job>, String> {
    let mut created = Vec::new();

    for file in files {
        let file_name = file.name;
        let file_path = file.path;

        let job = Job {
            id: uuid::Uuid::new_v4().to_string(),
            file_name,
            file_path,
            status: JobStatus::Queued,
            progress: 0,
            created_at: chrono::Utc::now().to_rfc3339(),
            started_at: None,
            completed_at: None,
            error: None,
            output_paths: Vec::new(),
        };

        manager.add_job(job.clone()).await;
        created.push(job);
    }

    Ok(created)
}

/// Get all jobs in the queue
#[tauri::command]
pub async fn get_jobs(manager: State<'_, JobManager>) -> Result<Vec<Job>, String> {
    Ok(manager.get_all_jobs().await)
}

/// Cancel a specific job
#[tauri::command]
pub async fn cancel_job(manager: State<'_, JobManager>, job_id: String) -> Result<(), String> {
    manager.cancel_job(&job_id).await
}

/// Retry a failed job
#[tauri::command]
pub async fn retry_job(manager: State<'_, JobManager>, job_id: String) -> Result<(), String> {
    manager.retry_job(&job_id).await
}

/// Remove a job from the queue
#[tauri::command]
pub async fn remove_job(manager: State<'_, JobManager>, job_id: String) -> Result<(), String> {
    manager.remove_job(&job_id).await
}

/// Move a job up or down in the queue
#[tauri::command]
pub async fn move_job(
    manager: State<'_, JobManager>,
    job_id: String,
    direction: String,
) -> Result<(), String> {
    manager.move_job(&job_id, &direction).await
}

/// Start processing all queued jobs
#[tauri::command]
pub async fn start_processing(
    app: tauri::AppHandle,
    manager: State<'_, JobManager>,
    config: ProcessingConfig,
    max_parallel: u32,
) -> Result<(), String> {
    let ffmpeg_path = crate::ffmpeg::get_ffmpeg_path(&app)?;
    let python_path = crate::ffmpeg::get_python_path(&app)?;
    let ffprobe_path = crate::ffmpeg::get_ffprobe_path(&app).unwrap_or_default();

    // Collect queued jobs
    let queued_jobs: Vec<Job> = {
        let jobs = manager.jobs.lock().await;
        jobs.iter()
            .filter(|j| j.status == JobStatus::Queued)
            .cloned()
            .collect()
    };

    if queued_jobs.is_empty() {
        return Err("No queued jobs to process".to_string());
    }

    // Determine output directory
    let output_dir = if config.render.output_directory.is_empty() {
        String::new()
    } else {
        config.render.output_directory.clone()
    };

    // Resolve bundled watermark path
    let watermark_path = crate::ffmpeg::get_watermark_path(&app);

    // Validate output directory before starting
    if !output_dir.is_empty() {
        let out_path = std::path::Path::new(&output_dir);
        if !out_path.exists() {
            std::fs::create_dir_all(out_path)
                .map_err(|e| format!("Cannot create output directory: {}", e))?;
        }
        if !out_path.is_dir() {
            return Err("Output path is not a directory".to_string());
        }
        let test_file = out_path.join(".video-editor-write-test");
        std::fs::write(&test_file, b"test")
            .map_err(|e| format!("Output directory is not writable: {}", e))?;
        std::fs::remove_file(&test_file).ok();
    }

    // Parallel processing with semaphore
    let concurrency = (max_parallel.max(1).min(6)) as usize;
    let semaphore = Arc::new(tokio::sync::Semaphore::new(concurrency));
    let manager_clone = (*manager).clone();
    let mut join_set = tokio::task::JoinSet::new();

    for job in queued_jobs {
        let sem = semaphore.clone();
        let app = app.clone();
        let mgr = manager_clone.clone();
        let config = config.clone();
        let ffmpeg_path = ffmpeg_path.clone();
        let python_path = python_path.clone();
        let ffprobe_path = ffprobe_path.clone();
        let watermark_path = watermark_path.clone();
        let output_dir = output_dir.clone();

        join_set.spawn(async move {
            let _permit = sem.acquire().await.unwrap();
            process_single_job(
                job, app, mgr, config, ffmpeg_path, python_path,
                ffprobe_path, watermark_path, output_dir,
            ).await;
        });
    }

    while let Some(result) = join_set.join_next().await {
        if let Err(e) = result {
            eprintln!("Job task panicked: {}", e);
        }
    }

    Ok(())
}

/// Process a single job (extracted for parallel execution)
async fn process_single_job(
    job: Job,
    app: tauri::AppHandle,
    manager: JobManager,
    config: ProcessingConfig,
    ffmpeg_path: std::path::PathBuf,
    python_path: std::path::PathBuf,
    ffprobe_path: std::path::PathBuf,
    watermark_path: Option<std::path::PathBuf>,
    output_dir: String,
) {
    let job_id = job.id.clone();

    // Check if job was cancelled before we start
    let is_cancelled = {
        let jobs = manager.jobs.lock().await;
        jobs.iter().any(|j| j.id == job_id && j.status == JobStatus::Cancelled)
    };
    if is_cancelled { return; }

    // Set status to Processing
    manager.set_status(&job_id, JobStatus::Processing, None).await;
    manager.update_progress(&job_id, 0).await;
    app.emit("job-status", serde_json::json!({
        "jobId": &job_id,
        "status": "processing"
    })).ok();

    // Get video duration for progress calculation
    let duration_secs = get_video_duration(&ffprobe_path, &job.file_path).await.unwrap_or(1.0);

    // Generate TTS audio if typewriter hook is enabled
    let use_hook = config.overlays.typewriter_hook
        && !config.overlays.typewriter_text.trim().is_empty();
    let temp_dir = std::env::temp_dir().join("video-editor").join(&job_id);
    let mut tts_audio_path: Option<std::path::PathBuf> = None;
    let mut tts_duration: f64 = 0.0;

    if use_hook {
        std::fs::create_dir_all(&temp_dir).ok();
        let audio_path = temp_dir.join("tts.mp3");
        match crate::ffmpeg::generate_tts_audio(
            &python_path,
            &config.overlays.typewriter_text,
            &audio_path,
        )
        .await
        {
            Ok(()) => {
                if let Ok(dur) =
                    crate::ffmpeg::get_media_duration(&ffprobe_path, &audio_path).await
                {
                    tts_duration = dur;
                    tts_audio_path = Some(audio_path);
                }
            }
            Err(e) => {
                eprintln!("TTS generation failed, skipping hook: {}", e);
                app.emit("job-status", serde_json::json!({
                    "jobId": &job_id,
                    "status": "processing",
                    "detail": format!("TTS failed: {}. Skipping typewriter intro.", e)
                })).ok();
            }
        }
    }

    // Transcribe for captions if enabled
    let caption_segments = if config.captions.enabled {
        std::fs::create_dir_all(&temp_dir).ok();
        app.emit("job-status", serde_json::json!({
            "jobId": &job_id,
            "status": "processing",
            "detail": "Transcribing audio..."
        })).ok();
        match crate::whisper::transcribe(&ffmpeg_path, &python_path, &job.file_path, &temp_dir, &config.captions.whisper_model).await {
            Ok(segs) => Some(segs),
            Err(e) => {
                eprintln!("Transcription failed, skipping captions: {}", e);
                app.emit("job-status", serde_json::json!({
                    "jobId": &job_id,
                    "status": "processing",
                    "detail": format!("Caption transcription failed: {}. Continuing without captions.", e)
                })).ok();
                None
            }
        }
    } else {
        None
    };

    // For each export format, run FFmpeg
    for format in &config.render.export_formats {
        // Check cancellation between formats
        let is_cancelled = {
            let jobs = manager.jobs.lock().await;
            jobs.iter().any(|j| j.id == job_id && j.status == JobStatus::Cancelled)
        };
        if is_cancelled { break; }
        let output_path = build_output_path(&job.file_path, &output_dir, format);

        // Ensure output directory exists
        if let Some(parent) = std::path::Path::new(&output_path).parent() {
            std::fs::create_dir_all(parent).ok();
        }

        let wm_str = watermark_path.as_ref().map(|p| p.to_string_lossy().to_string());

        // If hook is active, process main video to temp file
        let needs_hook = tts_audio_path.is_some();
        let main_output = if needs_hook {
            let p = temp_dir
                .join(format!("main_{}.mp4", format.replace(':', "x")));
            p.to_string_lossy().to_string()
        } else {
            output_path.clone()
        };

        let args = crate::ffmpeg::build_ffmpeg_args(
            &job.file_path,
            &main_output,
            &config,
            wm_str.as_deref(),
            duration_secs,
            caption_segments.as_deref(),
        );

        // Spawn FFmpeg process, with GPU→CPU fallback
        let result = run_ffmpeg_with_progress(
            &ffmpeg_path, &args, duration_secs, &app, &job_id, &manager,
        ).await;

        let result = if result.is_err() && config.render.gpu_acceleration {
            let mut cpu_config = config.clone();
            cpu_config.render.gpu_acceleration = false;
            let cpu_args = crate::ffmpeg::build_ffmpeg_args(
                &job.file_path,
                &main_output,
                &cpu_config,
                wm_str.as_deref(),
                duration_secs,
                caption_segments.as_deref(),
            );
            run_ffmpeg_with_progress(
                &ffmpeg_path, &cpu_args, duration_secs, &app, &job_id, &manager,
            ).await
        } else {
            result
        };

        // If main processing succeeded and hook is active, build intro + concat
        let result = if result.is_ok() && needs_hook {
            let audio = tts_audio_path.as_ref().unwrap();
            let (tw, th) = crate::ffmpeg::format_to_resolution(format)
                .unwrap_or((1080, 1920));

            app.emit("job-status", serde_json::json!({
                "jobId": &job_id,
                "status": "processing",
                "detail": "Generating typewriter intro..."
            })).ok();

            let intro_path =
                temp_dir.join(format!("intro_{}.mp4", format.replace(':', "x")));
            let intro_args = crate::ffmpeg::build_typewriter_intro_args(
                &audio.to_string_lossy(),
                &intro_path.to_string_lossy(),
                &config.overlays.typewriter_text,
                tts_duration,
                tw,
                th,
            );

            let intro_result = run_ffmpeg_simple(&ffmpeg_path, &intro_args).await;

            if let Err(e) = intro_result {
                Err(format!("Intro generation failed: {}", e))
            } else {
                let main_has_audio = match crate::ffmpeg::probe_video(&ffprobe_path, &main_output).await {
                    Ok(probe) => probe["streams"].as_array()
                        .map(|s| s.iter().any(|st| st["codec_type"] == "audio"))
                        .unwrap_or(false),
                    Err(_) => true,
                };

                app.emit("job-status", serde_json::json!({
                    "jobId": &job_id,
                    "status": "processing",
                    "detail": "Concatenating intro with video..."
                })).ok();

                let concat_args = crate::ffmpeg::build_concat_args(
                    &intro_path.to_string_lossy(),
                    &main_output,
                    &output_path,
                    &config.render.codec,
                    config.render.gpu_acceleration,
                    config.render.bitrate,
                    tw,
                    th,
                    main_has_audio,
                );
                let concat_result = run_ffmpeg_simple(&ffmpeg_path, &concat_args).await;
                if concat_result.is_err() && config.render.gpu_acceleration {
                    let cpu_concat_args = crate::ffmpeg::build_concat_args(
                        &intro_path.to_string_lossy(),
                        &main_output,
                        &output_path,
                        &config.render.codec,
                        false,
                        config.render.bitrate,
                        tw,
                        th,
                        main_has_audio,
                    );
                    run_ffmpeg_simple(&ffmpeg_path, &cpu_concat_args).await
                } else {
                    concat_result
                }
            }
        } else {
            result
        };

        match result {
            Ok(()) => {
                let mut jobs = manager.jobs.lock().await;
                if let Some(j) = jobs.iter_mut().find(|j| j.id == job_id) {
                    j.output_paths.push(output_path);
                }
            }
            Err(e) => {
                manager
                    .set_status(&job_id, JobStatus::Failed, Some(e.clone()))
                    .await;
                app.emit("job-status", serde_json::json!({
                    "jobId": &job_id,
                    "status": "failed",
                    "error": &e
                })).ok();
                break;
            }
        }
    }

    // If not failed, mark as completed
    let is_still_processing = {
        let jobs = manager.jobs.lock().await;
        jobs.iter().any(|j| j.id == job_id && j.status == JobStatus::Processing)
    };
    if is_still_processing {
        let output_paths = {
            let jobs = manager.jobs.lock().await;
            jobs.iter().find(|j| j.id == job_id).map(|j| j.output_paths.clone()).unwrap_or_default()
        };
        manager.set_status(&job_id, JobStatus::Completed, None).await;
        manager.update_progress(&job_id, 100).await;
        app.emit("job-status", serde_json::json!({
            "jobId": &job_id,
            "status": "completed",
            "outputPaths": &output_paths
        })).ok();
        app.emit("job-progress", serde_json::json!({
            "jobId": &job_id,
            "progress": 100
        })).ok();
    }

    // Clean up temp files
    if temp_dir.exists() {
        std::fs::remove_dir_all(&temp_dir).ok();
    }
}

/// Run FFmpeg without progress tracking (for intro generation, concat, etc.)
async fn run_ffmpeg_simple(
    ffmpeg_path: &std::path::PathBuf,
    args: &[String],
) -> Result<(), String> {
    use tokio::process::Command;

    let mut cmd = Command::new(ffmpeg_path);
    cmd.args(args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let output = cmd.output().await
        .map_err(|e| format!("Failed to spawn FFmpeg: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // Filter out encoding stats, keep actual error lines
        let error_lines: Vec<&str> = stderr.lines()
            .filter(|l| !l.trim_start().starts_with('[') || l.contains("Error") || l.contains("error") || l.contains("Invalid"))
            .collect();
        let tail = if error_lines.is_empty() {
            stderr.lines().rev().take(10).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n")
        } else {
            error_lines.into_iter().rev().take(10).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n")
        };
        Err(format!("FFmpeg failed: {}", tail))
    }
}

/// Run FFmpeg and parse stderr for progress
async fn run_ffmpeg_with_progress(
    ffmpeg_path: &std::path::PathBuf,
    args: &[String],
    duration_secs: f64,
    app: &tauri::AppHandle,
    job_id: &str,
    manager: &JobManager,
) -> Result<(), String> {
    use tokio::io::AsyncReadExt;
    use tokio::process::Command;

    let mut cmd = Command::new(ffmpeg_path);
    cmd.args(args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let mut child = cmd.spawn()
        .map_err(|e| format!("Failed to spawn FFmpeg: {}", e))?;

    // Parse stderr for progress
    // FFmpeg uses \r (carriage return) to overwrite progress lines, not \n.
    // We must read raw bytes and split on both \r and \n to get each update.
    let mut last_lines: std::collections::VecDeque<String> = std::collections::VecDeque::with_capacity(25);

    if let Some(mut stderr) = child.stderr.take() {
        let mut raw_buf = [0u8; 4096];
        let mut line_buf = Vec::with_capacity(512);

        loop {
            let n = match stderr.read(&mut raw_buf).await {
                Ok(0) => break,
                Ok(n) => n,
                Err(_) => break,
            };

            for &byte in &raw_buf[..n] {
                if byte == b'\r' || byte == b'\n' {
                    if !line_buf.is_empty() {
                        let line = String::from_utf8_lossy(&line_buf).to_string();
                        line_buf.clear();

                        // Check if job was cancelled
                        let is_cancelled = {
                            let jobs = manager.jobs.lock().await;
                            jobs.iter().any(|j| j.id == job_id && j.status == JobStatus::Cancelled)
                        };
                        if is_cancelled {
                            child.kill().await.ok();
                            return Err("Job cancelled".to_string());
                        }

                        // FFmpeg progress lines contain "time=HH:MM:SS.ms"
                        if let Some(time_str) = extract_time_from_line(&line) {
                            let elapsed = parse_ffmpeg_time(&time_str);
                            if duration_secs > 0.0 {
                                let progress = ((elapsed / duration_secs) * 100.0).min(99.0) as u8;
                                // Throttle: only emit if progress actually changed
                                let current = {
                                    let jobs = manager.jobs.lock().await;
                                    jobs.iter().find(|j| j.id == job_id).map(|j| j.progress).unwrap_or(0)
                                };
                                if progress != current {
                                    manager.update_progress(job_id, progress).await;
                                    app.emit("job-progress", serde_json::json!({
                                        "jobId": job_id,
                                        "progress": progress
                                    })).ok();
                                }
                            }
                        }

                        // Keep last lines for error reporting (VecDeque for O(1) ops)
                        if last_lines.len() >= 20 {
                            last_lines.pop_front();
                        }
                        last_lines.push_back(line);
                    }
                } else {
                    line_buf.push(byte);
                }
            }
        }
    }

    let status = child
        .wait()
        .await
        .map_err(|e| format!("FFmpeg process error: {}", e))?;

    if status.success() {
        Ok(())
    } else {
        // Filter out encoding stats, keep actual error lines
        let error_lines: Vec<&str> = last_lines.iter()
            .map(|s| s.as_str())
            .filter(|l| !l.trim_start().starts_with('[') || l.contains("Error") || l.contains("error") || l.contains("Invalid"))
            .collect();
        let tail = if error_lines.is_empty() {
            last_lines.iter().rev().take(10).cloned().collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n")
        } else {
            error_lines.into_iter().rev().take(10).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n")
        };
        Err(format!("FFmpeg error (code {}): {}", status.code().unwrap_or(-1), tail))
    }
}

/// Extract time= value from FFmpeg stderr line
fn extract_time_from_line(line: &str) -> Option<String> {
    if let Some(idx) = line.find("time=") {
        let rest = &line[idx + 5..];
        let end = rest.find(' ').unwrap_or(rest.len());
        let time_val = rest[..end].trim();
        if time_val != "N/A" {
            return Some(time_val.to_string());
        }
    }
    None
}

/// Parse FFmpeg time format HH:MM:SS.ms into seconds
fn parse_ffmpeg_time(time: &str) -> f64 {
    let parts: Vec<&str> = time.split(':').collect();
    if parts.len() == 3 {
        let hours: f64 = parts[0].parse().unwrap_or(0.0);
        let minutes: f64 = parts[1].parse().unwrap_or(0.0);
        let seconds: f64 = parts[2].parse().unwrap_or(0.0);
        hours * 3600.0 + minutes * 60.0 + seconds
    } else {
        0.0
    }
}

/// Get video duration in seconds using ffprobe
async fn get_video_duration(ffprobe_path: &std::path::PathBuf, file_path: &str) -> Result<f64, String> {
    use tokio::process::Command;

    if ffprobe_path.as_os_str().is_empty() {
        return Err("ffprobe not found".to_string());
    }

    let mut cmd = Command::new(ffprobe_path);
    cmd.args([
            "-v", "quiet",
            "-show_entries", "format=duration",
            "-of", "csv=p=0",
            file_path,
        ])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let output = cmd.output().await
        .map_err(|e| format!("ffprobe error: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    stdout
        .trim()
        .parse::<f64>()
        .map_err(|_| "Could not parse duration".to_string())
}

/// Build output file path based on format and output directory
fn build_output_path(input_path: &str, output_dir: &str, format: &str) -> String {
    let input = std::path::Path::new(input_path);
    let stem = input.file_stem().unwrap_or_default().to_string_lossy();
    let ext = "mp4";
    let format_suffix = format.replace(':', "x"); // "9:16" → "9x16"
    let filename = format!("{}_{}.{}", stem, format_suffix, ext);

    if output_dir.is_empty() {
        // Same directory as input
        if let Some(parent) = input.parent() {
            parent.join(&filename).to_string_lossy().to_string()
        } else {
            filename
        }
    } else {
        std::path::Path::new(output_dir)
            .join(&filename)
            .to_string_lossy()
            .to_string()
    }
}

/// Probe a video file for metadata
#[tauri::command]
pub async fn probe_video(app: tauri::AppHandle, file_path: String) -> Result<serde_json::Value, String> {
    let ffprobe_path = crate::ffmpeg::get_ffprobe_path(&app)?;
    crate::ffmpeg::probe_video(&ffprobe_path, &file_path).await
}

/// Save a preset to disk
#[tauri::command]
pub fn save_preset(app: tauri::AppHandle, preset: Preset) -> Result<(), String> {
    crate::presets::save_preset(&app, &preset)
}

/// Load all presets from disk
#[tauri::command]
pub fn load_presets(app: tauri::AppHandle) -> Result<Vec<Preset>, String> {
    crate::presets::load_all_presets(&app)
}

/// Delete a preset from disk
#[tauri::command]
pub fn delete_preset(app: tauri::AppHandle, preset_id: String) -> Result<(), String> {
    crate::presets::delete_preset(&app, &preset_id)
}

/// Save settings to app data directory
#[tauri::command]
pub fn save_settings(app: tauri::AppHandle, settings: AppSettings) -> Result<(), String> {
    use tauri::Manager;
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Could not resolve app data dir: {}", e))?;
    std::fs::create_dir_all(&app_dir)
        .map_err(|e| format!("Failed to create app dir: {}", e))?;
    let path = app_dir.join("settings.json");
    let json = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    std::fs::write(&path, json)
        .map_err(|e| format!("Failed to write settings: {}", e))?;
    Ok(())
}

/// Load settings from app data directory
#[tauri::command]
pub fn load_settings(app: tauri::AppHandle) -> Result<Option<AppSettings>, String> {
    use tauri::Manager;
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Could not resolve app data dir: {}", e))?;
    let path = app_dir.join("settings.json");
    if !path.exists() {
        return Ok(None);
    }
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read settings: {}", e))?;
    let settings: AppSettings = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse settings: {}", e))?;
    Ok(Some(settings))
}

/// Open the folder containing a file in the system file explorer
#[tauri::command]
pub async fn open_output_folder(file_path: String) -> Result<(), String> {
    let path = std::path::Path::new(&file_path);
    let folder = if path.is_dir() {
        path.to_path_buf()
    } else {
        path.parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| path.to_path_buf())
    };

    if !folder.exists() {
        return Err("Folder does not exist".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        tokio::process::Command::new("explorer")
            .arg(folder.to_string_lossy().to_string())
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        tokio::process::Command::new("open")
            .arg(folder.to_string_lossy().to_string())
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        tokio::process::Command::new("xdg-open")
            .arg(folder.to_string_lossy().to_string())
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }

    Ok(())
}

/// Validate that FFmpeg is available
#[tauri::command]
pub async fn validate_ffmpeg(app: tauri::AppHandle) -> Result<String, String> {
    let ffmpeg_path = crate::ffmpeg::get_ffmpeg_path(&app)?;

    let output = tokio::process::Command::new(&ffmpeg_path)
        .arg("-version")
        .output()
        .await
        .map_err(|e| format!("Failed to run FFmpeg: {}", e))?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        // Return the first line (e.g. "ffmpeg version 6.0 ...")
        Ok(stdout.lines().next().unwrap_or("FFmpeg available").to_string())
    } else {
        Err("FFmpeg binary found but failed to run".to_string())
    }
}

/// Extract a thumbnail frame from a video file at ~1s via FFmpeg
#[tauri::command]
pub async fn extract_thumbnail(app: tauri::AppHandle, file_path: String, job_id: String) -> Result<String, String> {
    let ffmpeg_path = crate::ffmpeg::get_ffmpeg_path(&app)?;

    let thumb_dir = std::env::temp_dir().join("video-editor").join("thumbnails");
    std::fs::create_dir_all(&thumb_dir)
        .map_err(|e| format!("Failed to create thumbnail dir: {}", e))?;

    let out_path = thumb_dir.join(format!("{}.jpg", job_id));

    let mut cmd = tokio::process::Command::new(&ffmpeg_path);
    cmd.args([
        "-ss", "1",
        "-i", &file_path,
        "-vframes", "1",
        "-q:v", "6",
        "-vf", "scale=160:-2",
        "-y",
        &out_path.to_string_lossy(),
    ])
    .stdout(std::process::Stdio::null())
    .stderr(std::process::Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    let output = cmd.output().await
        .map_err(|e| format!("FFmpeg thumbnail failed: {}", e))?;

    if output.status.success() && out_path.exists() {
        Ok(out_path.to_string_lossy().to_string())
    } else {
        Err("Failed to extract thumbnail".to_string())
    }
}

const VIDEO_EXTENSIONS: &[&str] = &["mp4", "mov", "mkv", "avi", "webm"];

/// Start watching a folder for new video files
#[tauri::command]
pub async fn start_watch_folder(
    app: tauri::AppHandle,
    state: State<'_, WatchFolderState>,
    folder_path: String,
) -> Result<(), String> {
    // Stop any existing watcher
    {
        let mut token = state.cancel_token.lock().await;
        if let Some(sender) = token.take() {
            let _ = sender.send(true);
        }
    }

    let path = std::path::PathBuf::from(&folder_path);
    if !path.is_dir() {
        return Err("Not a valid directory".to_string());
    }

    let (tx, mut rx) = tokio::sync::watch::channel(false);
    {
        let mut token = state.cancel_token.lock().await;
        *token = Some(tx);
    }

    // Snapshot existing files so we only emit for NEW ones
    let mut known_files: std::collections::HashSet<String> = std::collections::HashSet::new();
    if let Ok(entries) = std::fs::read_dir(&path) {
        for entry in entries.flatten() {
            known_files.insert(entry.path().to_string_lossy().to_string());
        }
    }

    // Spawn polling task
    let app_handle = app.clone();
    tokio::spawn(async move {
        loop {
            tokio::select! {
                _ = tokio::time::sleep(std::time::Duration::from_secs(3)) => {},
                _ = rx.changed() => { break; }
            }

            if let Ok(entries) = std::fs::read_dir(&path) {
                let mut new_files = Vec::new();
                for entry in entries.flatten() {
                    let file_path = entry.path();
                    let path_str = file_path.to_string_lossy().to_string();

                    if known_files.contains(&path_str) {
                        continue;
                    }

                    if let Some(ext) = file_path.extension() {
                        let ext_lower = ext.to_string_lossy().to_lowercase();
                        if VIDEO_EXTENSIONS.contains(&ext_lower.as_str()) {
                            let name = file_path.file_name()
                                .map(|n| n.to_string_lossy().to_string())
                                .unwrap_or_default();
                            new_files.push(serde_json::json!({
                                "name": name,
                                "path": path_str.clone()
                            }));
                            known_files.insert(path_str);
                        }
                    }
                }

                if !new_files.is_empty() {
                    app_handle.emit("watch-folder-files", new_files).ok();
                }
            }
        }
    });

    Ok(())
}

/// Stop watching the folder
#[tauri::command]
pub async fn stop_watch_folder(
    state: State<'_, WatchFolderState>,
) -> Result<(), String> {
    let mut token = state.cancel_token.lock().await;
    if let Some(sender) = token.take() {
        let _ = sender.send(true);
    }
    Ok(())
}

/// Detect available GPU encoders via FFmpeg
#[tauri::command]
pub async fn detect_gpu(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let ffmpeg_path = crate::ffmpeg::get_ffmpeg_path(&app)?;

    let mut cmd = tokio::process::Command::new(&ffmpeg_path);
    cmd.args(["-encoders"])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    let output = cmd.output().await
        .map_err(|e| format!("Failed to run FFmpeg: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();

    let nvenc = stdout.contains("h264_nvenc");
    let amf = stdout.contains("h264_amf");
    let qsv = stdout.contains("h264_qsv");
    let videotoolbox = stdout.contains("h264_videotoolbox");

    let gpu_name = if nvenc { "NVIDIA NVENC" }
        else if amf { "AMD AMF" }
        else if qsv { "Intel QSV" }
        else if videotoolbox { "Apple VideoToolbox" }
        else { "" };

    Ok(serde_json::json!({
        "available": nvenc || amf || qsv || videotoolbox,
        "nvenc": nvenc,
        "amf": amf,
        "qsv": qsv,
        "videotoolbox": videotoolbox,
        "name": gpu_name,
    }))
}
