use std::fs;
use std::path::PathBuf;
use tauri::Manager;

use crate::types::Preset;

/// Get the directory where presets are stored.
fn presets_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Could not resolve app data directory: {}", e))?;

    let presets_dir = app_dir.join("presets");
    fs::create_dir_all(&presets_dir)
        .map_err(|e| format!("Failed to create presets directory: {}", e))?;

    Ok(presets_dir)
}

/// Save a preset to disk as JSON.
pub fn save_preset(app_handle: &tauri::AppHandle, preset: &Preset) -> Result<(), String> {
    let dir = presets_dir(app_handle)?;
    let file_path = dir.join(format!("{}.json", preset.id));
    let json = serde_json::to_string_pretty(preset)
        .map_err(|e| format!("Failed to serialize preset: {}", e))?;
    fs::write(&file_path, json)
        .map_err(|e| format!("Failed to write preset file: {}", e))?;
    Ok(())
}

/// Load all presets from disk.
pub fn load_all_presets(app_handle: &tauri::AppHandle) -> Result<Vec<Preset>, String> {
    let dir = presets_dir(app_handle)?;
    let mut presets = Vec::new();

    let entries = fs::read_dir(&dir)
        .map_err(|e| format!("Failed to read presets directory: {}", e))?;

    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(e) => {
                eprintln!("Skipping unreadable directory entry: {}", e);
                continue;
            }
        };
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("json") {
            let content = match fs::read_to_string(&path) {
                Ok(c) => c,
                Err(e) => {
                    eprintln!("Skipping unreadable preset {:?}: {}", path, e);
                    continue;
                }
            };
            match serde_json::from_str::<Preset>(&content) {
                Ok(preset) => presets.push(preset),
                Err(e) => {
                    eprintln!("Skipping invalid preset {:?}: {}", path, e);
                }
            }
        }
    }

    Ok(presets)
}

/// Delete a preset from disk.
pub fn delete_preset(app_handle: &tauri::AppHandle, preset_id: &str) -> Result<(), String> {
    let dir = presets_dir(app_handle)?;
    let file_path = dir.join(format!("{}.json", preset_id));
    if file_path.exists() {
        fs::remove_file(&file_path)
            .map_err(|e| format!("Failed to delete preset: {}", e))?;
    }
    Ok(())
}
