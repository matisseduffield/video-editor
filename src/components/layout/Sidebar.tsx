import {
  Captions,
  Layers,
  Volume2,
  Film,
  Save,
  Clapperboard,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CaptionSettings } from "@/components/settings/CaptionSettings";
import { OverlaySettings } from "@/components/settings/OverlaySettings";
import { AudioSettings } from "@/components/settings/AudioSettings";
import { RenderSettings } from "@/components/settings/RenderSettings";
import { PresetManager } from "@/components/settings/PresetManager";
import type { AppSettings, Preset } from "@/types";

interface SidebarProps {
  settings: AppSettings;
  updateSettings: <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K]
  ) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onLoadPreset: (preset: Preset) => void;
}

const tabs = [
  { id: "captions", label: "Captions", icon: Captions },
  { id: "overlays", label: "Overlays", icon: Layers },
  { id: "audio", label: "Audio", icon: Volume2 },
  { id: "render", label: "Render", icon: Film },
  { id: "presets", label: "Presets", icon: Save },
];

export function Sidebar({
  settings,
  updateSettings,
  activeTab,
  setActiveTab,
  onLoadPreset,
}: SidebarProps) {
  return (
    <div className="flex flex-col w-[380px] min-w-[380px] border-r border-border bg-card">
      {/* App Header */}
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border">
        <Clapperboard className="h-6 w-6 text-primary" />
        <h1 className="text-lg font-bold tracking-tight">Video Editor</h1>
      </div>

      {/* Settings Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex flex-col flex-1 overflow-hidden"
      >
        <TabsList className="grid grid-cols-5 mx-3 mt-3 mb-0 bg-muted">
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="flex flex-col items-center gap-0.5 py-1.5 text-[10px]"
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <ScrollArea className="flex-1 px-4 py-3">
          <TabsContent value="captions" className="mt-0">
            <CaptionSettings
              settings={settings.captions}
              onChange={(v) => updateSettings("captions", v)}
            />
          </TabsContent>

          <TabsContent value="overlays" className="mt-0">
            <OverlaySettings
              settings={settings.overlays}
              onChange={(v) => updateSettings("overlays", v)}
            />
          </TabsContent>

          <TabsContent value="audio" className="mt-0">
            <AudioSettings
              settings={settings.audio}
              onChange={(v) => updateSettings("audio", v)}
            />
          </TabsContent>

          <TabsContent value="render" className="mt-0">
            <RenderSettings
              settings={settings.render}
              onChange={(v) => updateSettings("render", v)}
            />
          </TabsContent>

          <TabsContent value="presets" className="mt-0">
            <PresetManager settings={settings} onLoadPreset={onLoadPreset} />
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
}
