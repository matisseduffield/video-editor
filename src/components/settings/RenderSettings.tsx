import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FolderOpen } from "lucide-react";
import { openDirectory } from "@/hooks/useTauri";
import type { RenderSettings as RenderSettingsType, Codec, AspectRatio } from "@/types";

interface RenderSettingsProps {
  settings: RenderSettingsType;
  onChange: (settings: RenderSettingsType) => void;
}

const codecs: { value: Codec; label: string }[] = [
  { value: "h264", label: "H.264 (Best compatibility)" },
  { value: "h265", label: "H.265 (Better compression)" },
  { value: "vp9", label: "VP9 (WebM)" },
];

const aspectRatios: { value: AspectRatio; label: string; desc: string }[] = [
  { value: "9:16", label: "9:16", desc: "TikTok, Reels, Shorts" },
  { value: "1:1", label: "1:1", desc: "Instagram, Facebook" },
  { value: "16:9", label: "16:9", desc: "YouTube" },
];

export function RenderSettings({ settings, onChange }: RenderSettingsProps) {
  const update = <K extends keyof RenderSettingsType>(
    key: K,
    value: RenderSettingsType[K]
  ) => {
    onChange({ ...settings, [key]: value });
  };

  const toggleFormat = (ratio: AspectRatio) => {
    const current = settings.exportFormats;
    if (current.includes(ratio)) {
      if (current.length > 1) {
        update(
          "exportFormats",
          current.filter((r) => r !== ratio)
        );
      }
    } else {
      update("exportFormats", [...current, ratio]);
    }
  };

  return (
    <div className="space-y-5">
      <p className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-widest">Quality</p>

      {/* Output Bitrate */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Output Bitrate</Label>
          <span className="text-xs text-muted-foreground tabular-nums">
            {settings.bitrate} Mbps
          </span>
        </div>
        <Slider
          value={[settings.bitrate]}
          onValueChange={([v]) => update("bitrate", v)}
          min={1}
          max={20}
          step={1}
        />
      </div>

      {/* Codec */}
      <div className="space-y-2">
        <Label>Codec</Label>
        <Select
          value={settings.codec}
          onValueChange={(v) => update("codec", v as Codec)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {codecs.map((codec) => (
              <SelectItem key={codec.value} value={codec.value}>
                {codec.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* GPU Acceleration */}
      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="gpu">GPU Acceleration</Label>
          <p className="text-xs text-muted-foreground">
            NVENC / VideoToolbox
          </p>
        </div>
        <Switch
          id="gpu"
          checked={settings.gpuAcceleration}
          onCheckedChange={(v) => update("gpuAcceleration", v)}
        />
      </div>

      {/* Dry Run */}
      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="dryrun">Dry Run Mode</Label>
          <p className="text-xs text-muted-foreground">
            Fast low-res preview
          </p>
        </div>
        <Switch
          id="dryrun"
          checked={settings.dryRun}
          onCheckedChange={(v) => update("dryRun", v)}
        />
      </div>

      <p className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-widest pt-1">Export</p>

      {/* Export Formats */}
      <div className="space-y-2">
        <Label>Export Formats</Label>
        <div className="grid grid-cols-3 gap-2">
          {aspectRatios.map((ratio) => {
            const active = settings.exportFormats.includes(ratio.value);
            return (
              <button
                key={ratio.value}
                onClick={() => toggleFormat(ratio.value)}
                className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                  active
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-muted/30 text-muted-foreground hover:bg-muted"
                }`}
              >
                <span className="font-semibold">{ratio.label}</span>
                <span className="text-[10px]">{ratio.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Zoom Control */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Zoom</Label>
          <span className="text-xs text-muted-foreground tabular-nums">
            {settings.fillPercent}%
          </span>
        </div>
        <Slider
          value={[settings.fillPercent]}
          onValueChange={([v]) => update("fillPercent", v)}
          min={0}
          max={100}
          step={5}
        />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>Fit (letterbox)</span>
          <span>Fill (crop sides)</span>
        </div>
      </div>

      <p className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-widest pt-1">Output</p>

      {/* Output Directory */}
      <div className="space-y-2">
        <Label>Output Directory</Label>
        <Button
          variant="outline"
          className="w-full justify-start text-muted-foreground"
          onClick={async () => {
            const dir = await openDirectory();
            if (dir) update("outputDirectory", dir);
          }}
        >
          <FolderOpen className="h-4 w-4 mr-2" />
          {settings.outputDirectory || "Choose output folder..."}
        </Button>
      </div>
    </div>
  );
}
