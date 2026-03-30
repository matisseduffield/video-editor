import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type { Job, Preset, AppSettings } from "@/types";

// ── Job commands ───────────────────────────────────────────────

export async function addJobs(
  files: { name: string; path: string }[]
): Promise<Job[]> {
  return invoke("add_jobs", { files });
}

export async function getJobs(): Promise<Job[]> {
  return invoke("get_jobs");
}

export async function cancelJob(jobId: string): Promise<void> {
  return invoke("cancel_job", { jobId });
}

export async function retryJob(jobId: string): Promise<void> {
  return invoke("retry_job", { jobId });
}

export async function removeJob(jobId: string): Promise<void> {
  return invoke("remove_job", { jobId });
}

export async function moveJob(
  jobId: string,
  direction: "up" | "down"
): Promise<void> {
  return invoke("move_job", { jobId, direction });
}

// ── Processing ─────────────────────────────────────────────────

export async function startProcessing(
  config: AppSettings
): Promise<void> {
  return invoke("start_processing", {
    config: {
      captions: config.captions,
      overlays: config.overlays,
      audio: config.audio,
      render: config.render,
    },
  });
}

export async function probeVideo(
  filePath: string
): Promise<Record<string, unknown>> {
  return invoke("probe_video", { filePath });
}

export async function openOutputFolder(filePath: string): Promise<void> {
  return invoke("open_output_folder", { filePath });
}

export async function validateFfmpeg(): Promise<string> {
  return invoke("validate_ffmpeg");
}

// ── Presets ────────────────────────────────────────────────────

export async function savePreset(preset: Preset): Promise<void> {
  return invoke("save_preset", { preset });
}

export async function loadPresets(): Promise<Preset[]> {
  return invoke("load_presets");
}

export async function deletePreset(presetId: string): Promise<void> {
  return invoke("delete_preset", { presetId });
}

// ── Settings persistence ───────────────────────────────────────

export async function saveSettings(settings: AppSettings): Promise<void> {
  return invoke("save_settings", { settings });
}

export async function loadSettings(): Promise<AppSettings | null> {
  return invoke("load_settings");
}

// ── Events ─────────────────────────────────────────────────────

export interface JobProgressPayload {
  jobId: string;
  progress: number;
}

export interface JobStatusPayload {
  jobId: string;
  status: string;
  error?: string;
  detail?: string;
  outputPaths?: string[];
}

export function onJobProgress(
  callback: (payload: JobProgressPayload) => void
): Promise<UnlistenFn> {
  return listen<JobProgressPayload>("job-progress", (event) =>
    callback(event.payload)
  );
}

export function onJobStatus(
  callback: (payload: JobStatusPayload) => void
): Promise<UnlistenFn> {
  return listen<JobStatusPayload>("job-status", (event) =>
    callback(event.payload)
  );
}

// ── File dialogs ───────────────────────────────────────────────

export async function openVideoFiles(): Promise<
  { name: string; path: string }[]
> {
  const selected = await openDialog({
    multiple: true,
    filters: [
      {
        name: "Video",
        extensions: ["mp4", "mov", "mkv", "avi", "webm"],
      },
    ],
  });

  if (!selected) return [];

  const paths = Array.isArray(selected) ? selected : [selected];
  return paths.map((p) => {
    const name = p.split(/[/\\]/).pop() ?? p;
    return { name, path: p };
  });
}

export async function openDirectory(): Promise<string | null> {
  const selected = await openDialog({
    directory: true,
  });
  return selected ?? null;
}
