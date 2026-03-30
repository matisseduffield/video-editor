# Content Factory

Desktop video processing application built with **Tauri v2** (Rust backend) + **React** (TypeScript frontend). Drop in raw videos, configure settings, and export polished platform-ready content.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Tauri v2 (native desktop) |
| Frontend | React 19 + TypeScript + Vite |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Backend | Rust (Tauri commands) |
| Video Engine | FFmpeg (bundled) |
| Transcription | Whisper.cpp (bundled) |

## Project Structure

```
content-factory/
├── src/                          # React frontend
│   ├── components/
│   │   ├── ui/                   # shadcn/ui base components
│   │   ├── layout/               # AppLayout, Sidebar, MainPanel
│   │   ├── dashboard/            # DropZone, JobQueue, JobCard, QueueToolbar
│   │   └── settings/             # CaptionSettings, OverlaySettings, etc.
│   ├── hooks/                    # Custom React hooks
│   ├── lib/                      # Utilities (cn helper)
│   ├── stores/                   # State management (future)
│   ├── types/                    # TypeScript type definitions
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css                 # Tailwind + theme variables
│
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── commands/             # Tauri IPC command handlers
│   │   ├── ffmpeg/               # FFmpeg binary resolution + arg builder
│   │   ├── whisper/              # Whisper model path + transcription
│   │   ├── jobs/                 # Job queue manager (thread-safe)
│   │   ├── presets/              # Preset save/load/delete
│   │   ├── types.rs              # Shared Rust types
│   │   └── lib.rs                # App setup + command registration
│   ├── binaries/
│   │   ├── ffmpeg/               # Place ffmpeg + ffprobe binaries here
│   │   └── whisper/              # Place ggml model files here
│   ├── Cargo.toml
│   └── tauri.conf.json
│
├── package.json
├── vite.config.ts
└── tsconfig.app.json
```

## Getting Started

### Prerequisites

1. **Node.js** 18+ and npm
2. **Rust** toolchain — install from https://rustup.rs
3. **FFmpeg binaries** — place in `src-tauri/binaries/ffmpeg/`

### Development

```bash
npm install
npm run tauri dev
```

### Build

```bash
npm run tauri build
```

---

## Architecture: Rust-to-FFmpeg Communication Plan

### Overview

The Rust backend spawns `ffmpeg` and `ffprobe` as child processes and communicates via CLI arguments + stderr parsing. No FFmpeg library linking required.

### Processing Pipeline

```
React UI  ──IPC invoke──→  Tauri Commands (Rust)  ──spawn──→  FFmpeg/FFprobe/Whisper
          ←─IPC events───                          ←─stderr──
```

### Per-Job Steps

1. **Probe** — `ffprobe -print_format json` → get metadata
2. **Extract Audio** — `ffmpeg -vn -ar 16000 -ac 1` → WAV for Whisper
3. **Transcribe** — Whisper.cpp → timestamped word segments
4. **Build Filter Graph** — Compose FFmpeg `-filter_complex`
5. **Encode** — Spawn FFmpeg with full filter graph + codec settings
6. **Track Progress** — Parse stderr `time=` field → emit progress events
7. **Multi-Format** — Separate FFmpeg pass per aspect ratio

### FFmpeg Feature Mapping

| Feature | FFmpeg Implementation |
|---------|----------------------|
| Caption burn-in | `drawtext` filter with `enable='between(t,start,end)'` |
| Highlight words | Separate `drawtext` per word with color override |
| Progress bar | `drawbox` with `w=iw*t/duration` |
| Blurred background | `split→scale→boxblur→overlay` chain |
| Bouncing watermark | `overlay` with sine position expression |
| Loudness norm | `-af loudnorm=I=-14:TP=-1.5:LRA=11` |
| GPU encode | `-c:v h264_nvenc` / `hevc_nvenc` |
