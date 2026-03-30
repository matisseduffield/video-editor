import { useState, useCallback, useEffect } from "react";
import { Upload, Film, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openVideoFiles } from "@/hooks/useTauri";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

interface DropZoneProps {
  onFilesAdded: (files: { name: string; path: string }[]) => void;
}

export function DropZone({ onFilesAdded }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  // Visual feedback from Tauri drag events (actual drop handled by MainPanel)
  useEffect(() => {
    const unlisteners: Promise<UnlistenFn>[] = [];

    unlisteners.push(
      listen("tauri://drag-enter", () => setIsDragging(true))
    );
    unlisteners.push(
      listen("tauri://drag-leave", () => setIsDragging(false))
    );
    unlisteners.push(
      listen("tauri://drag-drop", () => setIsDragging(false))
    );

    return () => {
      unlisteners.forEach((p) => p.then((fn) => fn()));
    };
  }, []);

  // Prevent browser default file-open on drag/drop
  const preventDefaults = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleBrowse = useCallback(async () => {
    const files = await openVideoFiles();
    if (files.length > 0) {
      onFilesAdded(files);
    }
  }, [onFilesAdded]);

  return (
    <div
      className={`flex flex-col items-center justify-center h-full rounded-2xl border-2 border-dashed transition-all duration-300 ${
        isDragging
          ? "border-primary/50 bg-primary/[0.03] scale-[1.005]"
          : "border-border/40 bg-card/20 hover:border-muted-foreground/20 hover:bg-card/30"
      }`}
      onDragOver={preventDefaults}
      onDragLeave={preventDefaults}
      onDrop={preventDefaults}
    >
      <div className="flex flex-col items-center gap-5 max-w-sm text-center">
        <div
          className={`p-6 rounded-2xl transition-all duration-300 ${
            isDragging
              ? "bg-primary/10 scale-110 ring-2 ring-primary/20 shadow-lg shadow-primary/5"
              : "bg-accent/40 ring-1 ring-border/30"
          }`}
        >
          {isDragging ? (
            <Upload className="h-10 w-10 text-primary animate-bounce" />
          ) : (
            <Film className="h-10 w-10 text-muted-foreground/60" />
          )}
        </div>

        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold tracking-tight">
            {isDragging ? "Drop your videos" : "Drop videos to start"}
          </h2>
          <p className="text-sm text-muted-foreground">
            MP4, MOV, MKV, AVI, WebM
          </p>
        </div>

        <Button onClick={handleBrowse} variant="outline" className="gap-2 rounded-xl border-border/50 hover:border-primary/30 hover:bg-primary/5 hover:scale-105 transition-all">
          <FolderOpen className="h-4 w-4" />
          Browse Files
        </Button>

        <p className="text-xs text-muted-foreground/30">
          Configure settings from the sidebar icons
        </p>
      </div>
    </div>
  );
}
