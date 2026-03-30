import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Save, Trash2, Upload } from "lucide-react";
import {
  savePreset as savePresetToBackend,
  loadPresets,
  deletePreset as deletePresetFromBackend,
} from "@/hooks/useTauri";
import type { AppSettings, Preset } from "@/types";

interface PresetManagerProps {
  settings: AppSettings;
  onLoadPreset: (preset: Preset) => void;
}

export function PresetManager({ settings, onLoadPreset }: PresetManagerProps) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [newPresetName, setNewPresetName] = useState("");

  // Load presets from disk on mount
  useEffect(() => {
    loadPresets()
      .then(setPresets)
      .catch((err) => console.error("Failed to load presets:", err));
  }, []);

  const savePreset = async () => {
    if (!newPresetName.trim()) return;

    const preset: Preset = {
      id: crypto.randomUUID(),
      name: newPresetName.trim(),
      captions: { ...settings.captions },
      overlays: { ...settings.overlays },
      audio: { ...settings.audio },
      render: { ...settings.render },
    };

    try {
      await savePresetToBackend(preset);
      setPresets((prev) => [...prev, preset]);
      setNewPresetName("");
    } catch (err) {
      console.error("Failed to save preset:", err);
    }
  };

  const handleDeletePreset = async (id: string) => {
    try {
      await deletePresetFromBackend(id);
      setPresets((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      console.error("Failed to delete preset:", err);
    }
  };

  return (
    <div className="space-y-5">
      {/* Save new preset */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <Input
            value={newPresetName}
            onChange={(e) => setNewPresetName(e.target.value)}
            placeholder="Preset name..."
            onKeyDown={(e) => e.key === "Enter" && savePreset()}
          />
          <Button
            onClick={savePreset}
            disabled={!newPresetName.trim()}
            size="icon"
            className="shrink-0"
          >
            <Save className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Save current settings as a reusable preset
        </p>
      </div>

      {/* Preset list */}
      {presets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="p-3 rounded-xl bg-muted/20 mb-3">
            <Save className="h-6 w-6 text-muted-foreground/40" />
          </div>
          <p className="text-sm text-muted-foreground">No presets saved yet</p>
          <p className="text-xs text-muted-foreground/50 mt-1">
            Configure your settings and save them here
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {presets.map((preset) => (
            <Card key={preset.id}>
              <CardContent className="flex items-center justify-between p-3">
                <div>
                  <span className="text-sm font-medium">{preset.name}</span>
                  <p className="text-xs text-muted-foreground">
                    {preset.captions.enabled ? "Captions" : "No captions"} ·{" "}
                    {preset.render.codec.toUpperCase()} ·{" "}
                    {preset.render.exportFormats.join(", ")}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => onLoadPreset(preset)}
                  >
                    <Upload className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => handleDeletePreset(preset.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
