import { useState, useCallback, useEffect, useRef } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { MainPanel } from "@/components/layout/MainPanel";
import { UpdateBanner } from "@/components/UpdateBanner";
import type { AppSettings, Preset } from "@/types";
import { DEFAULT_SETTINGS } from "@/types";
import {
  saveSettings,
  loadSettings,
} from "@/hooks/useTauri";

export function AppLayout() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [activeTab, setActiveTab] = useState<string>("captions");
  const initialized = useRef(false);

  // Load persisted settings on mount
  useEffect(() => {
    loadSettings()
      .then((saved) => {
        if (saved) setSettings(saved);
        initialized.current = true;
      })
      .catch(() => {
        initialized.current = true;
      });
  }, []);

  // Auto-save settings when they change (debounced)
  useEffect(() => {
    if (!initialized.current) return;
    const timer = setTimeout(() => {
      saveSettings(settings).catch((err) =>
        console.error("Failed to save settings:", err)
      );
    }, 500);
    return () => clearTimeout(timer);
  }, [settings]);

  const updateSettings = useCallback(
    <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const loadPreset = useCallback((preset: Preset) => {
    setSettings((prev) => ({
      ...prev,
      captions: preset.captions,
      overlays: preset.overlays,
      audio: preset.audio,
      render: preset.render,
    }));
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background">
      <UpdateBanner />
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar - Settings & Presets */}
        <Sidebar
          settings={settings}
          updateSettings={updateSettings}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onLoadPreset={loadPreset}
        />

        {/* Main Content - Job Queue & Drop Zone */}
        <MainPanel settings={settings} />
      </div>
    </div>
  );
}
