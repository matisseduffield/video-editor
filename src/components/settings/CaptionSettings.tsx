import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CaptionSettings as CaptionSettingsType, CaptionFont, CaptionPosition, WhisperModel } from "@/types";

interface CaptionSettingsProps {
  settings: CaptionSettingsType;
  onChange: (settings: CaptionSettingsType) => void;
}

const fonts: CaptionFont[] = [
  "Arial Black",
  "Impact",
  "Montserrat",
  "Bebas Neue",
  "Oswald",
  "Poppins",
  "Roboto Bold",
];

const positions: { value: CaptionPosition; label: string }[] = [
  { value: "top", label: "Top" },
  { value: "center", label: "Center" },
  { value: "bottom", label: "Bottom" },
];

const whisperModels: { value: WhisperModel; label: string; desc: string }[] = [
  { value: "tiny", label: "Tiny", desc: "Fastest, lower accuracy (~75MB)" },
  { value: "base", label: "Base", desc: "Good balance (~150MB)" },
  { value: "small", label: "Small", desc: "Better accuracy (~500MB)" },
  { value: "medium", label: "Medium", desc: "High accuracy (~1.5GB)" },
  { value: "large-v3", label: "Large V3", desc: "Best accuracy (~3GB)" },
];

export function CaptionSettings({ settings, onChange }: CaptionSettingsProps) {
  const update = <K extends keyof CaptionSettingsType>(
    key: K,
    value: CaptionSettingsType[K]
  ) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <div className="space-y-5">
      {/* Enable Captions */}
      <div className="flex items-center justify-between">
        <Label htmlFor="captions-enabled">Auto-Generated Captions</Label>
        <Switch
          id="captions-enabled"
          checked={settings.enabled}
          onCheckedChange={(v) => update("enabled", v)}
        />
      </div>

      {settings.enabled && (
        <>
          <p className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-widest">Transcription</p>

          {/* Whisper Model */}
          <div className="space-y-2">
            <Label>Whisper Model</Label>
            <Select
              value={settings.whisperModel}
              onValueChange={(v) => update("whisperModel", v as WhisperModel)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {whisperModels.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    <span>{m.label}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{m.desc}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Larger models are more accurate but slower. Downloaded on first use.
            </p>
          </div>

          <p className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-widest pt-1">Typography</p>

          {/* Font */}
          <div className="space-y-2">
            <Label>Caption Font</Label>
            <Select
              value={settings.font}
              onValueChange={(v) => update("font", v as CaptionFont)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {fonts.map((font) => (
                  <SelectItem key={font} value={font}>
                    {font}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Font Size */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Font Size</Label>
              <span className="text-xs text-muted-foreground tabular-nums">
                {settings.fontSize}px
              </span>
            </div>
            <Slider
              value={[settings.fontSize]}
              onValueChange={([v]) => update("fontSize", v)}
              min={40}
              max={160}
              step={2}
            />
          </div>

          {/* Stroke Width */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Stroke Width</Label>
              <span className="text-xs text-muted-foreground tabular-nums">
                {settings.strokeWidth}px
              </span>
            </div>
            <Slider
              value={[settings.strokeWidth]}
              onValueChange={([v]) => update("strokeWidth", v)}
              min={0}
              max={15}
              step={1}
            />
          </div>

          {/* Shadow */}
          <div className="flex items-center justify-between">
            <Label htmlFor="caption-shadow">Drop Shadow</Label>
            <Switch
              id="caption-shadow"
              checked={settings.shadow}
              onCheckedChange={(v) => update("shadow", v)}
            />
          </div>

          {/* Position */}
          <div className="space-y-2">
            <Label>Position</Label>
            <Select
              value={settings.position}
              onValueChange={(v) => update("position", v as CaptionPosition)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {positions.map((pos) => (
                  <SelectItem key={pos.value} value={pos.value}>
                    {pos.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <p className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-widest pt-1">Highlighting</p>

          {/* Highlight Color */}
          <div className="space-y-2">
            <Label>Highlight Colour</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={settings.highlightColor}
                onChange={(e) => update("highlightColor", e.target.value)}
                className="h-9 w-9 rounded-md border border-input cursor-pointer bg-transparent"
              />
              <Input
                value={settings.highlightColor}
                onChange={(e) => update("highlightColor", e.target.value)}
                className="flex-1 font-mono text-xs"
              />
            </div>
          </div>

          {/* Highlight Words */}
          <div className="space-y-2">
            <Label>Highlight Words</Label>
            <Input
              defaultValue={settings.highlightWords.join(", ")}
              onBlur={(e) =>
                update(
                  "highlightWords",
                  e.target.value
                    .split(",")
                    .map((w) => w.trim())
                    .filter(Boolean)
                )
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const target = e.target as HTMLInputElement;
                  update(
                    "highlightWords",
                    target.value
                      .split(",")
                      .map((w) => w.trim())
                      .filter(Boolean)
                  );
                }
              }}
              placeholder="Money, Free, Secret..."
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated keywords to highlight in captions
            </p>
          </div>

          {/* Live Preview */}
          <div className="rounded-xl border border-border/50 bg-muted/10 p-4 text-center">
            <p
              className="font-bold"
              style={{ fontSize: `${Math.min(settings.fontSize / 4, 32)}px` }}
            >
              <span>Your </span>
              <span style={{ color: settings.highlightColor }}>caption</span>
              <span> preview</span>
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Live preview will render here during processing
            </p>
          </div>
        </>
      )}
    </div>
  );
}
