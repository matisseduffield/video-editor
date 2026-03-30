import { useState, useCallback, useEffect, useRef } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { MainPanel } from "@/components/layout/MainPanel";
import { TitleBar } from "@/components/layout/TitleBar";
import { UpdateBanner } from "@/components/UpdateBanner";
import { SplashScreen } from "@/components/SplashScreen";
import type { AppSettings, Preset } from "@/types";
import { DEFAULT_SETTINGS } from "@/types";
import {
  saveSettings,
  loadSettings,
} from "@/hooks/useTauri";

export function AppLayout() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [showSplash, setShowSplash] = useState(true);
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

  // Apply accent color to CSS custom property
  useEffect(() => {
    document.documentElement.style.setProperty("--color-primary", settings.accentColor);
    document.documentElement.style.setProperty("--color-ring", settings.accentColor);
  }, [settings.accentColor]);

  // Close settings panel on Escape, Ctrl+1-5 to open tabs
  useEffect(() => {
    const tabIds = ["captions", "overlays", "audio", "render", "presets"];
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && activeTab) {
        setActiveTab(null);
        return;
      }
      // Ctrl+1 through Ctrl+5 to toggle tabs
      if (e.ctrlKey && !e.shiftKey && !e.altKey) {
        const idx = parseInt(e.key) - 1;
        if (idx >= 0 && idx < tabIds.length) {
          e.preventDefault();
          setActiveTab(activeTab === tabIds[idx] ? null : tabIds[idx]);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTab]);

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
      {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}
      <TitleBar />
      <UpdateBanner />
      <div className="flex flex-1 overflow-hidden relative">
        <Sidebar
          settings={settings}
          updateSettings={updateSettings}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onLoadPreset={loadPreset}
        />
        <MainPanel settings={settings} />
      </div>
    </div>
  );
}
