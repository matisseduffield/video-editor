import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Film,
  X,
  RotateCcw,
  Trash2,
  ChevronUp,
  ChevronDown,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Ban,
  FolderOpen,
  Copy,
} from "lucide-react";
import type { Job, JobStatus } from "@/types";
import { openOutputFolder } from "@/hooks/useTauri";
import { toast } from "sonner";

interface JobCardProps {
  job: Job;
  index: number;
  totalJobs: number;
  onCancel: () => void;
  onRetry: () => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

const statusConfig: Record<
  JobStatus,
  {
    icon: React.ElementType;
    variant: "default" | "secondary" | "destructive" | "success" | "warning";
    label: string;
  }
> = {
  queued: { icon: Clock, variant: "secondary", label: "Queued" },
  processing: { icon: Loader2, variant: "default", label: "Processing" },
  completed: { icon: CheckCircle2, variant: "success", label: "Completed" },
  failed: { icon: XCircle, variant: "destructive", label: "Failed" },
  cancelled: { icon: Ban, variant: "warning", label: "Cancelled" },
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export function JobCard({
  job,
  index,
  totalJobs,
  onCancel,
  onRetry,
  onRemove,
  onMoveUp,
  onMoveDown,
}: JobCardProps) {
  const config = statusConfig[job.status];
  const StatusIcon = config.icon;
  const isActive = job.status === "queued" || job.status === "processing";

  return (
    <Card className={`p-3 transition-all duration-200 rounded-xl ${job.status === "processing" ? "bg-primary/[0.04] border-primary/15 shadow-sm shadow-primary/5" : job.status === "completed" ? "bg-success/[0.03] border-success/10" : "bg-card/60 hover:bg-card border-border/50"}`}>
      <div className="flex items-start gap-3">
        {/* File icon */}
        <div className={`p-2 rounded-lg shrink-0 ${job.status === "completed" ? "bg-success/10" : job.status === "processing" ? "bg-primary/10" : "bg-accent/50"}`}>
          <Film className={`h-4 w-4 ${job.status === "completed" ? "text-success" : job.status === "processing" ? "text-primary" : "text-muted-foreground"}`} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium truncate">{job.fileName}</span>
            <Badge variant={config.variant} className="shrink-0">
              <StatusIcon
                className={`h-3 w-3 mr-1 ${
                  job.status === "processing" ? "animate-spin" : ""
                }`}
              />
              {config.label}
            </Badge>
          </div>

          {/* Progress bar for active jobs */}
          {job.status === "processing" && (
            <div className="flex items-center gap-2 mt-1.5">
              <Progress value={job.progress} shimmer className="flex-1" />
              <span className="text-xs text-muted-foreground w-8 text-right">
                {job.progress}%
              </span>
            </div>
          )}

          {/* Metadata for jobs with probe info */}
          {(job.duration || job.resolution || job.fileSize) && (
            <div className="flex items-center gap-3 mt-1">
              {job.duration != null && (
                <span className="text-xs text-muted-foreground">
                  {formatDuration(job.duration)}
                </span>
              )}
              {job.resolution && (
                <span className="text-xs text-muted-foreground">
                  {job.resolution}
                </span>
              )}
              {job.fileSize != null && (
                <span className="text-xs text-muted-foreground">
                  {formatFileSize(job.fileSize)}
                </span>
              )}
            </div>
          )}

          {/* Error message */}
          {job.error && (
            <p className="text-xs text-destructive mt-1 truncate">
              {job.error}
            </p>
          )}

          {/* Output paths for completed jobs */}
          {job.status === "completed" && job.outputPaths && job.outputPaths.length > 0 && (
            <div className="mt-1.5 space-y-1">
              {job.outputPaths.map((p, i) => (
                <div key={i} className="flex items-center gap-1.5 group">
                  <span className="text-xs text-muted-foreground truncate flex-1">
                    {p.split(/[\\/]/).pop()}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => {
                      navigator.clipboard.writeText(p);
                      toast.success("Path copied");
                    }}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => openOutputFolder(p).catch(() => toast.error("Failed to open folder"))}
                  >
                    <FolderOpen className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 shrink-0">
          {/* Reorder buttons for queued jobs */}
          {job.status === "queued" && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onMoveUp}
                disabled={index === 0}
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onMoveDown}
                disabled={index === totalJobs - 1}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </>
          )}

          {/* Cancel for active jobs */}
          {isActive && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={onCancel}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}

          {/* Retry for failed jobs */}
          {job.status === "failed" && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRetry}>
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          )}

          {/* Remove for completed/failed/cancelled */}
          {!isActive && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onRemove}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
