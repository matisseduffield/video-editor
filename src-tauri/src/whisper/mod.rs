use std::path::PathBuf;
use std::process::Stdio;
use tauri::Manager;
use tokio::process::Command;

/// Transcription segment with timing info (word-level)
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptionSegment {
    pub start_ms: u64,
    pub end_ms: u64,
    pub text: String,
}

/// Extract audio from a video file as 16kHz mono WAV for Whisper.
pub async fn extract_audio(
    ffmpeg_path: &PathBuf,
    video_path: &str,
    output_wav: &std::path::Path,
) -> Result<(), String> {
    let mut cmd = Command::new(ffmpeg_path);
    cmd.args([
        "-y",
        "-i", video_path,
        "-vn",
        "-ar", "16000",
        "-ac", "1",
        "-c:a", "pcm_s16le",
        &output_wav.to_string_lossy(),
    ])
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    let output = cmd.output().await
        .map_err(|e| format!("Failed to extract audio: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Audio extraction failed: {}", stderr));
    }
    Ok(())
}

/// Allowed Whisper model names (whitelist to prevent injection).
const ALLOWED_MODELS: &[&str] = &["tiny", "base", "small", "medium", "large-v3"];

/// Transcribe audio using faster-whisper via Python.
/// Returns word-level segments with millisecond timing.
pub async fn transcribe(
    ffmpeg_path: &PathBuf,
    python_path: &PathBuf,
    video_path: &str,
    temp_dir: &std::path::Path,
    model_name: &str,
) -> Result<Vec<TranscriptionSegment>, String> {
    // Validate model name against whitelist
    let model = if ALLOWED_MODELS.contains(&model_name) {
        model_name
    } else {
        "large-v3" // safe default — best accuracy
    };

    // Ensure temp dir exists
    std::fs::create_dir_all(temp_dir).ok();

    // Step 1: Extract audio
    let wav_path = temp_dir.join("audio_for_whisper.wav");
    extract_audio(ffmpeg_path, video_path, &wav_path).await?;

    // Step 2: Run faster-whisper via Python
    let py_script = format!(
        r#"
import json, sys
from faster_whisper import WhisperModel
model = WhisperModel("{model}", device="cpu", compute_type="int8")
segments, info = model.transcribe(r"{audio_path}", word_timestamps=True)
words = []
for seg in segments:
    if seg.words:
        for w in seg.words:
            words.append({{"start": int(w.start * 1000), "end": int(w.end * 1000), "text": w.word.strip()}})
print(json.dumps(words))
"#,
        model = model,
        audio_path = wav_path.to_string_lossy().replace('\\', "\\\\")
    );

    let mut cmd = Command::new(python_path);
    cmd.args(["-c", &py_script])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("PYTHONIOENCODING", "utf-8");

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    // Scale timeout based on audio file size (~32KB/sec at 16kHz mono 16-bit)
    // Allow 3x real-time + 120s for model loading, minimum 10 minutes
    let timeout_secs = {
        let audio_bytes = std::fs::metadata(&wav_path).map(|m| m.len()).unwrap_or(0);
        let audio_duration_secs = audio_bytes as f64 / 32000.0;
        let estimated = (audio_duration_secs * 3.0) as u64 + 120;
        estimated.max(600)
    };

    let output = match tokio::time::timeout(
        std::time::Duration::from_secs(timeout_secs),
        cmd.output(),
    ).await {
        Ok(result) => result.map_err(|e| format!("Failed to run faster-whisper: {}", e))?,
        Err(_) => return Err(format!("Whisper transcription timed out after {} minutes", timeout_secs / 60)),
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Whisper transcription failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let words: Vec<serde_json::Value> = serde_json::from_str(stdout.trim())
        .map_err(|e| format!("Failed to parse Whisper output: {} — raw: {}", e, stdout.trim()))?;

    let segments: Vec<TranscriptionSegment> = words
        .into_iter()
        .filter_map(|w| {
            Some(TranscriptionSegment {
                start_ms: w.get("start")?.as_u64()?,
                end_ms: w.get("end")?.as_u64()?,
                text: w.get("text")?.as_str()?.to_string(),
            })
        })
        .collect();

    // Clean up WAV
    std::fs::remove_file(&wav_path).ok();

    #[cfg(debug_assertions)]
    eprintln!("[Whisper] Transcribed {} words", segments.len());
    Ok(segments)
}
