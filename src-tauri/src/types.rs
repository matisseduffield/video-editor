use serde::{Deserialize, Serialize};

/// Status of a processing job
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum JobStatus {
    Queued,
    Processing,
    Completed,
    Failed,
    Cancelled,
}

/// A single processing job
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    pub id: String,
    pub file_name: String,
    pub file_path: String,
    pub status: JobStatus,
    pub progress: u8,
    pub created_at: String,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub error: Option<String>,
    pub output_paths: Vec<String>,
}

/// Caption settings from the frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptionSettings {
    pub enabled: bool,
    pub highlight_words: Vec<String>,
    pub highlight_color: String,
    pub font: String,
    pub font_size: u32,
    pub stroke_width: u32,
    pub shadow: bool,
    pub position: String,
    pub whisper_model: String,
}

/// Overlay settings from the frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlaySettings {
    pub progress_bar: bool,
    pub dynamic_watermark: bool,
    pub watermark_path: Option<String>,
    pub blurred_background: bool,
    pub typewriter_hook: bool,
    pub typewriter_text: String,
}

/// Audio settings from the frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioSettings {
    pub loudness_normalization: bool,
    pub target_lufs: f32,
}

/// Render/output settings from the frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderSettings {
    pub bitrate: u32,
    pub codec: String,
    pub gpu_acceleration: bool,
    pub dry_run: bool,
    pub export_formats: Vec<String>,
    pub fill_percent: u32,
    pub output_directory: String,
}

/// Complete processing configuration sent from the frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessingConfig {
    pub captions: CaptionSettings,
    pub overlays: OverlaySettings,
    pub audio: AudioSettings,
    pub render: RenderSettings,
}

/// A saved preset
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Preset {
    pub id: String,
    pub name: String,
    pub captions: CaptionSettings,
    pub overlays: OverlaySettings,
    pub audio: AudioSettings,
    pub render: RenderSettings,
}

/// Full application settings (mirrors frontend AppSettings)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub captions: CaptionSettings,
    pub overlays: OverlaySettings,
    pub audio: AudioSettings,
    pub render: RenderSettings,
    pub watch_folder: Option<String>,
    pub max_parallel_jobs: u32,
    #[serde(default = "default_accent_color")]
    pub accent_color: String,
}

fn default_accent_color() -> String {
    "#38BDF8".to_string()
}
