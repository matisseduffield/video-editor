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

## Auto-Updater
The app uses `tauri-plugin-updater` and `tauri-plugin-process` for automatic updates.
- **Hook:** `src/hooks/useUpdater.ts` — checks for updates on app launch
- **UI:** `src/components/UpdateBanner.tsx` — banner shown when an update is available
- **Config:** `tauri.conf.json` → `plugins.updater` — contains the public signing key and GitHub endpoint
- **Signing key:** `~/.tauri/video-editor.key` (no password) — must be set as `TAURI_SIGNING_PRIVATE_KEY` env var during builds
- **Endpoint:** The updater checks `https://github.com/matisseduffield/video-editor/releases/latest/download/latest.json`

## Releasing a New Version
A GitHub Actions workflow (`.github/workflows/release.yml`) automates builds when you push a version tag.

### Steps
1. Bump the `"version"` field in both `src-tauri/tauri.conf.json` and `package.json`
2. Commit the version bump: `git commit -am "v1.0.1"`
3. Tag and push: `git tag v1.0.1 && git push && git push --tags`
4. GitHub Actions will build the MSI/EXE with signatures and create a GitHub Release automatically

### Required GitHub Secrets
- `TAURI_SIGNING_PRIVATE_KEY` — contents of `~/.tauri/video-editor.key`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — empty string (`""`)

### Manual Release (without CI)
1. Set env vars:
   ```powershell
   $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content "$HOME/.tauri/video-editor.key" -Raw
   $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
   ```
2. Build: `npm run tauri build`
3. Create a GitHub Release tagged with the version (e.g. `v1.0.1`)
4. Upload from `src-tauri/target/release/bundle/`: `.msi`, `.msi.sig`, `.exe`, `.exe.sig`, and `latest.json`
