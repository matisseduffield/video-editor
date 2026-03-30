import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  StopCircle,
  RotateCcw,
  Trash2,
  Play,
  Loader2,
  FolderSearch,
} from "lucide-react";

interface QueueToolbarProps {
  queuedCount: number;
  processingCount: number;
  failedCount: number;
  onCancelAll: () => void;
  onRetryAllFailed: () => void;
  onClearCompleted: () => void;
  onStartProcessing: () => void;
  isProcessing: boolean;
  hasJobs: boolean;
  overallProgress: number;
  watchFolder: string | null;
  onToggleWatchFolder: () => void;
}

export function QueueToolbar({
  queuedCount,
  processingCount,
  failedCount,
  onCancelAll,
  onRetryAllFailed,
  onClearCompleted,
  onStartProcessing,
  isProcessing,
  hasJobs,
  overallProgress,
  watchFolder,
  onToggleWatchFolder,
}: QueueToolbarProps) {
  return (
    <div className="flex items-center justify-between px-5 py-2.5 border-b border-border bg-card/30 relative">
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold tracking-tight">Queue</span>
        {hasJobs && (
          <div className="flex items-center gap-1.5">
            {processingCount > 0 && (
              <Badge variant="default" className="text-[10px] px-1.5 py-0">
                {processingCount} active
              </Badge>
            )}
            {queuedCount > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {queuedCount} queued
              </Badge>
            )}
            {failedCount > 0 && (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                {failedCount} failed
              </Badge>
            )}
          </div>
        )}
        <Button
          variant={watchFolder ? "default" : "ghost"}
          size="sm"
          onClick={onToggleWatchFolder}
          className="h-7 text-xs rounded-lg"
          title={watchFolder ? `Watching: ${watchFolder}` : "Watch a folder for new videos"}
        >
          <FolderSearch className="h-3 w-3 mr-1" />
          {watchFolder ? "Watching" : "Watch"}
        </Button>
      </div>

      {hasJobs && (
        <div className="flex items-center gap-1.5">
          {queuedCount > 0 && (
            <Button
              size="sm"
              onClick={onStartProcessing}
              disabled={isProcessing}
              className="h-7 text-xs rounded-lg"
            >
              {isProcessing ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Play className="h-3 w-3 mr-1" />
              )}
              {isProcessing ? "Processing..." : "Start"}
            </Button>
          )}
          {failedCount > 0 && (
            <Button variant="ghost" size="sm" onClick={onRetryAllFailed} className="h-7 text-xs">
              <RotateCcw className="h-3 w-3 mr-1" />
              Retry
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClearCompleted} className="h-7 text-xs">
            <Trash2 className="h-3 w-3 mr-1" />
            Clear
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancelAll}
            className="h-7 text-xs text-destructive hover:text-destructive"
          >
            <StopCircle className="h-3 w-3 mr-1" />
            Stop
          </Button>
        </div>
      )}
      {isProcessing && overallProgress > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary/10 overflow-hidden">
          <div
            className="h-full progress-gradient transition-all duration-700 ease-out"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
      )}
    </div>
  );
}
