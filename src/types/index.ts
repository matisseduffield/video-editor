export type JobStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export interface Job {
  id: string;
  fileName: string;
  filePath: string;
  status: JobStatus;
  progress: number; // 0-100
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  outputPaths?: string[];
  duration?: number; // seconds, from ffprobe
  resolution?: string; // e.g. "1920x1080"
  fileSize?: number; // bytes
}

export type CaptionPosition = "top" | "center" | "bottom";

export type CaptionFont =
  | "Arial Black"
  | "Impact"
  | "Montserrat"
  | "Bebas Neue"
  | "Oswald"
  | "Poppins"
  | "Roboto Bold";

export type AspectRatio = "9:16" | "1:1" | "16:9";

export type Codec = "h264" | "h265" | "vp9";

export type WhisperModel = "tiny" | "base" | "small" | "medium" | "large-v3";

export interface CaptionSettings {
  enabled: boolean;
  highlightWords: string[];
  highlightColor: string;
  font: CaptionFont;
  fontSize: number; // 40-160
  strokeWidth: number; // 0-15
  shadow: boolean;
  position: CaptionPosition;
  whisperModel: WhisperModel;
}

export interface OverlaySettings {
  progressBar: boolean;
  dynamicWatermark: boolean;
  watermarkPath?: string;
  blurredBackground: boolean;
  typewriterHook: boolean;
  typewriterText: string;
}

export interface AudioSettings {
  loudnessNormalization: boolean;
  targetLufs: number; // -24 to -6
}

export interface RenderSettings {
  bitrate: number; // 1-20 Mbps
  codec: Codec;
  gpuAcceleration: boolean;
  dryRun: boolean;
  exportFormats: AspectRatio[];
  fillPercent: number; // 0-100
  outputDirectory: string;
}

export interface Preset {
  id: string;
  name: string;
  captions: CaptionSettings;
  overlays: OverlaySettings;
  audio: AudioSettings;
  render: RenderSettings;
}

export interface AppSettings {
  captions: CaptionSettings;
  overlays: OverlaySettings;
  audio: AudioSettings;
  render: RenderSettings;
  watchFolder?: string;
  maxParallelJobs: number; // 1-6
}

export const DEFAULT_SETTINGS: AppSettings = {
  captions: {
    enabled: true,
    highlightWords: ["Money", "Free", "Secret", "Hack", "Tips"],
    highlightColor: "#facc15",
    font: "Arial Black",
    fontSize: 80,
    strokeWidth: 4,
    shadow: true,
    position: "bottom",
    whisperModel: "large-v3",
  },
  overlays: {
    progressBar: false,
    dynamicWatermark: false,
    blurredBackground: true,
    typewriterHook: false,
    typewriterText: "Watch until the end…",
  },
  audio: {
    loudnessNormalization: true,
    targetLufs: -14,
  },
  render: {
    bitrate: 8,
    codec: "h264",
    gpuAcceleration: true,
    dryRun: false,
    exportFormats: ["9:16"],
    fillPercent: 75,
    outputDirectory: "",
  },
  maxParallelJobs: 3,
};
