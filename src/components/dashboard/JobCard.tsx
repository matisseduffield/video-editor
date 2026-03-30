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
  GripVertical,
  PlayCircle,
} from "lucide-react";
import type { Job, JobStatus } from "@/types";
import { openOutputFolder } from "@/hooks/useTauri";
import { toast } from "sonner";
import { useState } from "react";
import { VideoPlayer } from "@/components/dashboard/VideoPlayer";
import { AnimatePresence, motion } from "framer-motion";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";

interface JobCardProps {
  job: Job;
  index: number;
  totalJobs: number;
  onCancel: () => void;
  onRetry: () => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  dragListeners?: SyntheticListenerMap;
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

function formatEta(job: Job): string | null {
  if (job.status !== "processing" || !job.startedAt || job.progress < 2) return null;
  const elapsed = (Date.now() - new Date(job.startedAt).getTime()) / 1000;
  const remaining = (elapsed / job.progress) * (100 - job.progress);
  if (remaining < 60) return `~${Math.ceil(remaining)}s left`;
  return `~${Math.ceil(remaining / 60)}m left`;
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
  dragListeners,
}: JobCardProps) {
  const config = statusConfig[job.status];
  const StatusIcon = config.icon;
  const isActive = job.status === "queued" || job.status === "processing";
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);
  const [errorExpanded, setErrorExpanded] = useState(false);

  return (
    <>
      <AnimatePresence>
        {playingVideo && (
          <VideoPlayer filePath={playingVideo} onClose={() => setPlayingVideo(null)} />
        )}
      </AnimatePresence>
      <Card className={`p-3 transition-all duration-200 rounded-xl hover:translate-y-[-1px] hover:shadow-md hover:shadow-black/20 ${job.status === "processing" ? "bg-primary/[0.04] border-primary/15 shadow-sm shadow-primary/5" : job.status === "completed" ? "bg-success/[0.03] border-success/10" : "bg-card/60 hover:bg-card border-border/50"}`}>
      <div className="flex items-start gap-3">
        {/* Drag handle */}
        <button
          {...dragListeners}
          className="mt-1.5 cursor-grab active:cursor-grabbing active:scale-110 text-muted-foreground/40 hover:text-muted-foreground hover:scale-110 transition-all shrink-0 touch-none"
          tabIndex={-1}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {/* Thumbnail or file icon */}
        {job.thumbnailPath ? (
          <img
            src={job.thumbnailPath}
            alt=""
            className="w-14 h-10 rounded-lg object-cover shrink-0 bg-accent/50"
          />
        ) : (
          <div className={`p-2 rounded-lg shrink-0 ${job.status === "completed" ? "bg-success/10" : job.status === "processing" ? "bg-primary/10" : "bg-accent/50"}`}>
            <Film className={`h-4 w-4 ${job.status === "completed" ? "text-success" : job.status === "processing" ? "text-primary" : "text-muted-foreground"}`} />
          </div>
        )}

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
            <div className="mt-1.5">
              {job.statusDetail && (
                <span className="text-[10px] text-muted-foreground/70 block mb-0.5">
                  {job.statusDetail}
                </span>
              )}
              <div className="flex items-center gap-2">
                <Progress value={job.progress} shimmer className="flex-1" />
                <span className="text-xs text-muted-foreground w-8 text-right">
                  {job.progress}%
                </span>
              </div>
              {formatEta(job) && (
                <span className="text-[10px] text-muted-foreground/60 mt-0.5 block">
                  {formatEta(job)}
                </span>
              )}
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

          {/* Error message with expandable details */}
          {job.error && (
            <div className="mt-1">
              <button
                onClick={() => setErrorExpanded(!errorExpanded)}
                className="text-xs text-destructive hover:underline flex items-center gap-1"
              >
                {errorExpanded ? "Hide details" : "Show error details"}
              </button>
              <AnimatePresence>
                {errorExpanded && (
                  <motion.pre
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="text-[10px] text-destructive/80 mt-1 p-2 bg-destructive/5 rounded-md overflow-x-auto whitespace-pre-wrap break-all max-h-32 overflow-y-auto"
                  >
                    {job.error}
                  </motion.pre>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Completed timestamp */}
          {job.status === "completed" && job.completedAt && (
            <span className="text-[10px] text-muted-foreground/60 mt-0.5 block">
              Completed {new Date(job.completedAt).toLocaleString()}
            </span>
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
                    onClick={() => setPlayingVideo(p)}
                    title="Play video"
                  >
                    <PlayCircle className="h-3 w-3" />
                  </Button>
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
    </>
  );
}
