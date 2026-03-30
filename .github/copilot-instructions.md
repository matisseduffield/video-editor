# Video Editor — Copilot Instructions

## Project Overview
Video Editor is a Tauri v2 desktop app for automated video processing. It uses a React+TypeScript frontend with Tailwind CSS, and a Rust backend that spawns FFmpeg/Whisper as child processes.

## Architecture
- **Frontend:** `src/` — React components, shadcn/ui, Tailwind v4 with CSS-first config
- **Backend:** `src-tauri/src/` — Rust modules for commands, FFmpeg, Whisper, jobs, presets
- **Binaries:** `src-tauri/binaries/` — Bundled FFmpeg and Whisper model files (not in git)

## Conventions
- Use `@/` path alias for imports (maps to `src/`)
- UI components in `src/components/ui/` follow shadcn/ui patterns (forwardRef, cn utility, cva variants)
- Settings types are defined in `src/types/index.ts` and mirrored in `src-tauri/src/types.rs`
- Tauri IPC commands are in `src-tauri/src/commands/mod.rs`
- All Rust types use `#[serde(rename_all = "camelCase")]` for JS interop
- Theme colors are CSS custom properties defined in `src/index.css` via `@theme`

## Key Commands
- `npm run tauri dev` — Development mode
- `npm run tauri build` — Production build
- `npx tsc --noEmit` — Type-check frontend
- `npx vite build` — Build frontend only
