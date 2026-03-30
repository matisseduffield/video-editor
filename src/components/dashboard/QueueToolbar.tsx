import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  StopCircle,
  RotateCcw,
  Trash2,
  Activity,
  Play,
  Loader2,
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
}: QueueToolbarProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/50">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Job Queue</span>
        </div>

        {hasJobs && (
          <div className="flex items-center gap-2">
            {processingCount > 0 && (
              <Badge variant="default">{processingCount} processing</Badge>
            )}
            {queuedCount > 0 && (
              <Badge variant="secondary">{queuedCount} queued</Badge>
            )}
            {failedCount > 0 && (
              <Badge variant="destructive">{failedCount} failed</Badge>
            )}
          </div>
        )}
      </div>

      {hasJobs && (
        <div className="flex items-center gap-2">
          {queuedCount > 0 && (
            <Button
              size="sm"
              onClick={onStartProcessing}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5 mr-1.5" />
              )}
              {isProcessing ? "Processing..." : "Start Processing"}
            </Button>
          )}
          {failedCount > 0 && (
            <Button variant="ghost" size="sm" onClick={onRetryAllFailed}>
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Retry Failed
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClearCompleted}>
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            Clear Done
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancelAll}
            className="text-destructive hover:text-destructive"
          >
            <StopCircle className="h-3.5 w-3.5 mr-1.5" />
            Cancel All
          </Button>
        </div>
      )}
    </div>
  );
}
