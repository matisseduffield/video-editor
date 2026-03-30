import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import type { OverlaySettings as OverlaySettingsType } from "@/types";

interface OverlaySettingsProps {
  settings: OverlaySettingsType;
  onChange: (settings: OverlaySettingsType) => void;
}

export function OverlaySettings({ settings, onChange }: OverlaySettingsProps) {
  const update = <K extends keyof OverlaySettingsType>(
    key: K,
    value: OverlaySettingsType[K]
  ) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <div className="space-y-5">
      {/* Progress Bar */}
      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="progress-bar">Progress Bar</Label>
          <p className="text-xs text-muted-foreground">
            Retention timer bar overlay
          </p>
        </div>
        <Switch
          id="progress-bar"
          checked={settings.progressBar}
          onCheckedChange={(v) => update("progressBar", v)}
        />
      </div>

      {/* Dynamic Watermark */}
      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="watermark">Dynamic Watermark</Label>
          <p className="text-xs text-muted-foreground">
            Bouncing logo overlay
          </p>
        </div>
        <Switch
          id="watermark"
          checked={settings.dynamicWatermark}
          onCheckedChange={(v) => update("dynamicWatermark", v)}
        />
      </div>

      {/* Blurred Background */}
      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="blur-bg">Blurred Background Fill</Label>
          <p className="text-xs text-muted-foreground">
            For portrait/vertical videos
          </p>
        </div>
        <Switch
          id="blur-bg"
          checked={settings.blurredBackground}
          onCheckedChange={(v) => update("blurredBackground", v)}
        />
      </div>

      {/* Typewriter Hook */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="typewriter">Typewriter Hook</Label>
            <p className="text-xs text-muted-foreground">
              Animated intro text with generated voice
            </p>
          </div>
          <Switch
            id="typewriter"
            checked={settings.typewriterHook}
            onCheckedChange={(v) => update("typewriterHook", v)}
          />
        </div>

        {settings.typewriterHook && (
          <Input
            value={settings.typewriterText}
            onChange={(e) => update("typewriterText", e.target.value)}
            placeholder="Watch until the end…"
          />
        )}
      </div>
    </div>
  );
}
