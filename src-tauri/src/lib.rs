mod commands;
mod ffmpeg;
mod jobs;
mod presets;
mod types;
mod whisper;

use jobs::JobManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let job_manager = JobManager::new();
    let watch_state = commands::WatchFolderState::new();

    tauri::Builder::default()
        .manage(job_manager)
        .manage(watch_state)
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            commands::add_jobs,
            commands::get_jobs,
            commands::cancel_job,
            commands::retry_job,
            commands::remove_job,
            commands::move_job,
            commands::clear_completed,
            commands::start_processing,
            commands::probe_video,
            commands::save_preset,
            commands::load_presets,
            commands::delete_preset,
            commands::save_settings,
            commands::load_settings,
            commands::open_output_folder,
            commands::validate_ffmpeg,
            commands::validate_dependencies,
            commands::extract_thumbnail,
            commands::start_watch_folder,
            commands::stop_watch_folder,
            commands::detect_gpu,
        ])
        .setup(|app| {
            use tauri::Manager;
            let log_level = if cfg!(debug_assertions) {
                log::LevelFilter::Debug
            } else {
                log::LevelFilter::Info
            };
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log_level)
                    .build(),
            )?;

            // Initialize job persistence and load saved queue
            let app_data_dir = app.path().app_data_dir()
                .expect("failed to resolve app data dir");
            let mgr: tauri::State<'_, JobManager> = app.state();
            let mgr = mgr.inner().clone();
            // Spawn async init on the Tauri runtime
            tauri::async_runtime::spawn(async move {
                mgr.init_persistence(app_data_dir).await;
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
