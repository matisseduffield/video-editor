import {
  Captions,
  Layers,
  Volume2,
  Film,
  Save,
  Clapperboard,
  X,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CaptionSettings } from "@/components/settings/CaptionSettings";
import { OverlaySettings } from "@/components/settings/OverlaySettings";
import { AudioSettings } from "@/components/settings/AudioSettings";
import { RenderSettings } from "@/components/settings/RenderSettings";
import { PresetManager } from "@/components/settings/PresetManager";
import type { AppSettings, Preset } from "@/types";
import { cn } from "@/lib/utils";
import { useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface SidebarProps {
  settings: AppSettings;
  updateSettings: <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K]
  ) => void;
  activeTab: string | null;
  setActiveTab: (tab: string | null) => void;
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
  const handleTabClick = (tabId: string) => {
    setActiveTab(activeTab === tabId ? null : tabId);
  };

  const activeTabData = tabs.find((t) => t.id === activeTab);
  const colorInputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      {/* Icon Rail — always visible */}
      <div className="flex flex-col w-14 min-w-14 bg-card border-r border-border z-30">
        <div className="flex items-center justify-center h-14 border-b border-border/50">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <Clapperboard className="h-5 w-5 text-primary" />
          </div>
        </div>
        <nav className="flex flex-col items-center gap-1.5 py-3 flex-1">
          {tabs.map((tab, i) => (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={cn(
                "flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-150 relative cursor-pointer group active:scale-90",
                activeTab === tab.id
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
              title={`${tab.label} (Ctrl+${i + 1})`}
            >
              <tab.icon className="h-[18px] w-[18px]" />
              {activeTab === tab.id && (
                <div className="absolute left-0 w-0.5 h-5 bg-primary rounded-r" />
              )}
            </button>
          ))}
        </nav>
        <div className="flex flex-col items-center gap-2 py-3 border-t border-border/50">
          <button
            onClick={() => colorInputRef.current?.click()}
            className="w-6 h-6 rounded-full border-2 border-border hover:border-foreground/30 hover:scale-110 active:scale-95 transition-all cursor-pointer"
            style={{ backgroundColor: settings.accentColor }}
            title="Accent color"
          />
          <input
            ref={colorInputRef}
            type="color"
            value={settings.accentColor}
            onChange={(e) => updateSettings("accentColor", e.target.value)}
            className="sr-only"
          />
          <span className="text-[10px] text-muted-foreground/40 font-mono">v0.3.0</span>
        </div>
      </div>

      {/* Settings Panel — overlay */}
      <AnimatePresence>
        {activeTab && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 left-14 z-10"
              onClick={() => setActiveTab(null)}
            />
            <motion.div
              key="panel"
              initial={{ x: -12, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -12, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="absolute left-14 top-0 bottom-0 w-[340px] bg-card/[0.97] backdrop-blur-xl border-r border-border z-20 flex flex-col shadow-2xl shadow-black/50"
            >
            <div className="flex items-center justify-between px-4 h-14 border-b border-border/50 shrink-0">
              <div className="flex items-center gap-2.5">
                {activeTabData && (
                  <div className="p-1 rounded-md bg-primary/10">
                    <activeTabData.icon className="h-3.5 w-3.5 text-primary" />
                  </div>
                )}
                <h2 className="text-sm font-semibold tracking-tight">
                  {activeTabData?.label}
                </h2>
              </div>
              <button
                onClick={() => setActiveTab(null)}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent active:scale-90 transition-all cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ScrollArea className="flex-1 px-4 py-4">
              {activeTab === "captions" && (
                <CaptionSettings
                  settings={settings.captions}
                  onChange={(v) => updateSettings("captions", v)}
                />
              )}
              {activeTab === "overlays" && (
                <OverlaySettings
                  settings={settings.overlays}
                  onChange={(v) => updateSettings("overlays", v)}
                />
              )}
              {activeTab === "audio" && (
                <AudioSettings
                  settings={settings.audio}
                  onChange={(v) => updateSettings("audio", v)}
                />
              )}
              {activeTab === "render" && (
                <RenderSettings
                  settings={settings.render}
                  onChange={(v) => updateSettings("render", v)}
                  maxParallelJobs={settings.maxParallelJobs}
                  onMaxParallelJobsChange={(v) => updateSettings("maxParallelJobs", v)}
                />
              )}
              {activeTab === "presets" && (
                <PresetManager
                  settings={settings}
                  onLoadPreset={onLoadPreset}
                />
              )}
            </ScrollArea>
          </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
