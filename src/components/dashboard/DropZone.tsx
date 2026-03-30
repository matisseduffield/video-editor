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
      className={`flex flex-col items-center justify-center h-full rounded-xl border-2 border-dashed transition-all duration-200 ${
        isDragging
          ? "border-primary bg-primary/5 scale-[1.01]"
          : "border-border hover:border-muted-foreground/50"
      }`}
      onDragOver={preventDefaults}
      onDragLeave={preventDefaults}
      onDrop={preventDefaults}
    >
      <div className="flex flex-col items-center gap-4 max-w-md text-center">
        <div
          className={`p-5 rounded-full transition-colors ${
            isDragging ? "bg-primary/10" : "bg-muted"
          }`}
        >
          {isDragging ? (
            <Upload className="h-10 w-10 text-primary animate-bounce" />
          ) : (
            <Film className="h-10 w-10 text-muted-foreground" />
          )}
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-1">
            {isDragging ? "Drop your videos here" : "Drop videos to get started"}
          </h2>
          <p className="text-sm text-muted-foreground">
            Supports MP4, MOV, MKV, AVI, and WebM files
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={handleBrowse} variant="outline" className="gap-2">
            <FolderOpen className="h-4 w-4" />
            Browse Files
          </Button>
        </div>

        <p className="text-xs text-muted-foreground/60 mt-2">
          Configure captions, overlays, and output settings in the sidebar before processing
        </p>
      </div>
    </div>
  );
}
