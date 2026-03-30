import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X, Clapperboard } from "lucide-react";

const appWindow = getCurrentWindow();

export function TitleBar() {
  return (
    <div
      data-tauri-drag-region
      className="flex items-center justify-between h-9 bg-card border-b border-border/50 select-none shrink-0"
    >
      {/* App brand */}
      <div
        data-tauri-drag-region
        className="flex items-center gap-2 pl-3 pointer-events-none"
      >
        <Clapperboard className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-medium text-muted-foreground">
          Video Editor
        </span>
      </div>

      {/* Window controls */}
      <div className="flex items-center h-full">
        <button
          onClick={() => appWindow.minimize()}
          className="inline-flex items-center justify-center w-11 h-full hover:bg-accent transition-colors cursor-pointer"
          tabIndex={-1}
        >
          <Minus className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        <button
          onClick={() => appWindow.toggleMaximize()}
          className="inline-flex items-center justify-center w-11 h-full hover:bg-accent transition-colors cursor-pointer"
          tabIndex={-1}
        >
          <Square className="h-3 w-3 text-muted-foreground" />
        </button>
        <button
          onClick={() => appWindow.close()}
          className="inline-flex items-center justify-center w-11 h-full hover:bg-destructive/80 hover:text-white transition-colors cursor-pointer"
          tabIndex={-1}
        >
          <X className="h-4 w-4 text-muted-foreground hover:text-white" />
        </button>
      </div>
    </div>
  );
}
