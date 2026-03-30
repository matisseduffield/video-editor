# FFmpeg Binaries

Place pre-compiled FFmpeg and FFprobe binaries here.

## Required files:
- `ffmpeg.exe` (Windows) / `ffmpeg` (macOS/Linux)
- `ffprobe.exe` (Windows) / `ffprobe` (macOS/Linux)

## Download:
- Windows: https://www.gyan.dev/ffmpeg/builds/ (get the "essentials" build)
- macOS: `brew install ffmpeg` then copy from `/opt/homebrew/bin/`
- Linux: Download static build from https://johnvansickle.com/ffmpeg/

These binaries are bundled into the Tauri app via `tauri.conf.json` → `bundle.resources`.
At runtime, the Rust backend resolves their path using `tauri::App::path_resolver().resource_dir()`.
