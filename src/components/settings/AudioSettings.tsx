import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import type { AudioSettings as AudioSettingsType } from "@/types";

interface AudioSettingsProps {
  settings: AudioSettingsType;
  onChange: (settings: AudioSettingsType) => void;
}

export function AudioSettings({ settings, onChange }: AudioSettingsProps) {
  const update = <K extends keyof AudioSettingsType>(
    key: K,
    value: AudioSettingsType[K]
  ) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <div className="space-y-5">
      <p className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-widest">Normalisation</p>

      {/* Loudness Normalisation */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="loudness">Loudness Normalisation</Label>
            <p className="text-xs text-muted-foreground">
              Level audio to target LUFS
            </p>
          </div>
          <Switch
            id="loudness"
            checked={settings.loudnessNormalization}
            onCheckedChange={(v) => update("loudnessNormalization", v)}
          />
        </div>

        {settings.loudnessNormalization && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Target LUFS</Label>
              <span className="text-xs text-muted-foreground tabular-nums">
                {settings.targetLufs} LUFS
              </span>
            </div>
            <Slider
              value={[settings.targetLufs]}
              onValueChange={([v]) => update("targetLufs", v)}
              min={-24}
              max={-6}
              step={1}
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>-24 (quiet)</span>
              <span>-14 (standard)</span>
              <span>-6 (loud)</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
