# Video Editor — Roadmap to v1.0

> Current: **v0.5.0** → Target: **v1.0.0**
> Estimated milestones: **v0.6** → **v0.7** → **v0.8** → **v0.9** → **v1.0**

---

## ~~v0.5.0 — Reliability & Core Pipeline~~ ✅

### Job Queue Persistence ✅
- [x] Save job queue to disk (JSON in app data dir) on every state change
- [x] Restore queue on app launch — queued/processing jobs reset to "queued", completed/failed preserved
- [x] Add "completed_at" timestamp display on JobCard
- [x] Add "Clear completed" button to QueueToolbar (currently "Clear" removes everything)

### Error Handling Hardening ✅
- [x] Wrap all FFmpeg spawns in timeout guards (configurable, default 30 min per job)
- [x] Surface FFmpeg stderr in a collapsible "Show details" section on failed JobCards
- [x] Validate FFmpeg/FFprobe/Python existence on app launch with a diagnostic toast
- [x] Handle missing font files gracefully — fall back to system default instead of crashing

### Cross-Platform Font Resolution ✅
- [x] Replace hardcoded `C:\Windows\Fonts\...` with platform-aware font resolution
- [x] macOS: `/System/Library/Fonts/` and `/Library/Fonts/`
- [x] Linux: `/usr/share/fonts/truetype/` font directories
- [x] Windows: Keep current paths but verify file existence before use
- [x] Monospace font resolution for typewriter intro (Consolas / Menlo / DejaVu Sans Mono)

### Progress Tracking Polish ✅
- [x] Show ETA (estimated time remaining) based on elapsed time and current progress %
- [x] Add per-phase labels in the progress area: "Generating TTS…", "Transcribing…", "Rendering (2/3)…"
- [x] Ensure progress reaches exactly 100% on completion (no stuck-at-99% edge cases)
- [x] Add overall queue progress bar in the toolbar (X of Y jobs complete)

### Testing Infrastructure ✅
- [x] Set up Rust unit tests for `build_ffmpeg_args`, `build_concat_args`, `build_typewriter_intro_args`
- [x] CI: Run `cargo test` and `npx tsc --noEmit` in release workflow before building

---

## v0.6.0 — Preview & Playback

Users need to see what they're going to get before committing to a full render.

### Live Preview Panel
- [ ] Add a preview panel that shows the source video with current settings applied
- [ ] Preview aspect ratio framing (show how 16:9 source looks in 9:16 with fill/fit)
- [ ] Preview blurred background fill in real-time
- [ ] Preview caption positioning and font styling (static mockup overlay, not real-time FFmpeg)
- [ ] Preview progress bar overlay position
- [ ] Preview watermark bounce path

### Video Trimming
- [ ] Add start/end trim controls (time inputs + drag handles on a timeline scrubber)
- [ ] Pass `-ss` and `-to` flags to FFmpeg based on trim values
- [ ] Store trim points per-job (not global settings)
- [ ] Visual timeline with frame thumbnails at key points

### Enhanced Video Player
- [ ] Add playback speed controls (0.5x, 1x, 1.5x, 2x)
- [ ] Add volume control
- [ ] Add fullscreen toggle
- [ ] Show video metadata overlay (resolution, duration, codec, bitrate)
- [ ] Side-by-side comparison: source vs. output (for completed jobs)

---

## v0.7.0 — Advanced Effects & Customization

### Custom Watermark Support
- [ ] Add watermark file picker in OverlaySettings (PNG/SVG with transparency)
- [ ] Watermark position presets: corners, center, custom X/Y
- [ ] Watermark size slider (5-50% of frame width)
- [ ] Watermark opacity slider (0-100%)
- [ ] Watermark animation modes: bounce (current), static, scroll, fade in/out
- [ ] Remove dependency on bundled `watermark.png` — make it fully user-driven

### Caption Styling Overhaul
- [ ] Per-word color customization (not just highlight words)
- [ ] Caption background box (semi-transparent, rounded) — like YouTube/TikTok style
- [ ] Animation modes: fade in, pop in, slide up, karaoke-highlight
- [ ] Multi-line caption support with word wrap
- [ ] Caption preview in settings panel
- [ ] SRT/WebVTT subtitle file export alongside video

### Color & Filter Adjustments
- [ ] Brightness, contrast, saturation sliders (FFmpeg `eq` filter)
- [ ] Color temperature (warm/cool shift)
- [ ] Vignette effect toggle + intensity
- [ ] Apply filters per-job or globally

### Audio Enhancements
- [ ] Background music track: file picker + volume slider
- [ ] Audio ducking: auto-lower music during speech
- [ ] Noise reduction (FFmpeg `afftdn` or `anlmdn` filter)
- [ ] Audio fade in/out at video boundaries
- [ ] TTS voice selection (multiple edge-tts voices in a dropdown)
- [ ] TTS rate slider (exposed in UI, currently hardcoded at -10%)

---

## v0.8.0 — Templates & Batch Workflows

### Preset System v2
- [ ] Preset categories (e.g., "TikTok", "YouTube", "Instagram")
- [ ] Built-in starter presets shipped with the app
- [ ] Preset import/export (JSON files) for sharing
- [ ] Preset thumbnail preview (auto-generated from a sample frame)
- [ ] "Last used" preset quick-apply button

### Template System
- [ ] Templates = preset + intro hook text + watermark + export formats bundled together
- [ ] Template gallery with visual previews
- [ ] One-click "apply template to all queued jobs"
- [ ] Template editor with live preview

### Batch Processing Improvements
- [ ] Per-job settings overrides (different caption text, different output format)
- [ ] Batch rename output files with pattern (e.g., `{name}_{format}_{date}`)
- [ ] Auto-organize outputs into folders by format or date
- [ ] Job priority levels (high/normal/low) — high-priority jobs process first
- [ ] Scheduled processing: "Start batch at 2 AM" timer

### Watch Folder Enhancements
- [ ] Configurable file filters (only .mp4, .mov, etc.)
- [ ] Auto-apply a specific preset/template to watched files
- [ ] Multiple watch folders with different presets each
- [ ] "Process immediately" vs. "Queue only" mode
- [ ] Watch folder activity log

---

## v0.9.0 — Performance & Polish

### Rendering Performance
- [ ] Hardware-accelerated decoding (NVDEC, VAAPI, VideoToolbox input)
- [ ] Smart encoding: skip re-encoding streams that don't need changes
- [ ] Segment-based parallel encoding: split long videos into chunks, encode in parallel, concat
- [ ] RAM usage monitoring — warn if system is low
- [ ] Disk space check before rendering — warn if insufficient

### UI/UX Polish
- [ ] Onboarding flow: first-launch wizard that validates FFmpeg, picks output dir, chooses a preset
- [ ] Keyboard shortcuts help panel (? key)
- [ ] Dark/light theme toggle (currently dark only)
- [ ] System tray integration: minimize to tray, progress notifications
- [ ] Drag-and-drop files directly onto the app icon / taskbar icon
- [ ] Notification sound on batch completion
- [ ] Undo/redo for settings changes

### Accessibility
- [ ] Full keyboard navigation for all settings controls
- [ ] Screen reader labels (aria-label) on all interactive elements
- [ ] Focus ring visibility on all interactive elements
- [ ] Reduced motion mode (disable Framer Motion animations)
- [ ] High contrast mode

### Logging & Diagnostics
- [ ] Structured log file (not just stderr) — saved to app data dir
- [ ] "Export logs" button for bug reports
- [ ] FFmpeg command log: view exact commands that were run for each job
- [ ] Performance metrics: render time per job, average speed (x realtime)

---

## v1.0.0 — Release-Ready

### Installer & Distribution
- [ ] Windows: MSI + EXE installers (already working via Tauri)
- [ ] macOS: DMG installer + code signing + notarization
- [ ] Linux: AppImage + .deb packagesub
- [ ] Auto-updater fully tested across all platforms
- [ ] EULA / license agreement screen on first install

### Documentation
- [ ] README with screenshots, feature list, and download links
- [ ] User guide: getting started, settings explained, common workflows
- [ ] FAQ / troubleshooting: FFmpeg not found, GPU not detected, etc.
- [ ] Contributing guide for open-source contributors
- [ ] Changelog maintained across all versions

### Final QA
- [ ] Full regression test: every feature tested on Windows 10, Windows 11
- [ ] Full regression test on macOS (if supporting)
- [ ] Stress test: 50+ videos queued, all formats, all features enabled
- [ ] Memory leak testing: process 100 videos sequentially, monitor RAM
- [ ] Updater test: install v0.9.0, verify auto-update to v1.0.0 works
- [ ] Clean install test: fresh Windows machine, no prior dependencies

### Nice-to-Haves (if time permits)
- [ ] Plugin system: allow community FFmpeg filter plugins
- [ ] Cloud rendering offload (optional, future)
- [ ] Multi-language UI (i18n)
- [ ] Video stabilization filter
- [ ] AI-powered auto-crop (detect face/subject for 9:16 framing)
- [ ] Thumbnail generator: export best frame as PNG for social media

---

## Version Summary

| Version | Theme | Key Deliverables |
|---------|-------|-----------------|
| **v0.5** | Reliability | Job persistence, error handling, cross-platform fonts, tests |
| **v0.6** | Preview | Live preview panel, video trimming, enhanced player |
| **v0.7** | Effects | Custom watermarks, caption styling, filters, audio, TTS settings |
| **v0.8** | Workflows | Templates, batch improvements, watch folder v2 |
| **v0.9** | Performance | HW decode, smart encoding, UI polish, accessibility, logging |
| **v1.0** | Release | Multi-platform installers, docs, full QA, final polish |

---

## Completed Versions

### v0.1.0 — Foundation
- Tauri v2 app scaffold
- FFmpeg integration (encoding, probing)
- Whisper transcription (faster-whisper via Python)
- Basic job queue (add, process, cancel)
- Settings panel (captions, overlays, audio, render)
- Preset system (save/load/delete)

### v0.2.0 — UI Overhaul
- Visual redesign (dark theme, card-based layout, accent colors)
- Progress bar with gradient shimmer
- Settings persistence to disk
- Auto-updater integration

### v0.3.0 — UX Features
- Custom frameless title bar
- Video thumbnails in job cards
- Drag-to-reorder queue (dnd-kit)
- Watch folder mode
- Inline video playback
- Custom accent color
- Splash screen
- Framer Motion animations
- Parallel job processing (1-6 concurrent)
- GPU auto-detection

### v0.4.0 — Stability
- Fixed title bar drag & window controls (Tauri permissions)
- Fixed edge-tts --rate argument parsing
- Phased progress tracking (TTS → transcription → render)
- Blurred-frame hook intro (replaces black background)
- GPU detection loading spinner
- Preset error notifications
- Safer caption rendering (removed unwrap panic)
- Production debug output cleanup
