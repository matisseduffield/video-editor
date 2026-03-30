import { ScrollArea } from "@/components/ui/scroll-area";
import { JobCard } from "@/components/dashboard/JobCard";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { openVideoFiles } from "@/hooks/useTauri";
import type { Job } from "@/types";

interface JobQueueProps {
  jobs: Job[];
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  onAddMore: (files: { name: string; path: string }[]) => void;
}

export function JobQueue({
  jobs,
  onCancel,
  onRetry,
  onRemove,
  onMove,
  onAddMore,
}: JobQueueProps) {
  const handleAddMore = async () => {
    const files = await openVideoFiles();
    if (files.length > 0) {
      onAddMore(files);
    }
  };

  return (
    <div className="flex flex-col h-full gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {jobs.length} {jobs.length === 1 ? "job" : "jobs"} in queue
        </span>
        <Button variant="outline" size="sm" onClick={handleAddMore}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Add Videos
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-2 pr-2">
          {jobs.map((job, index) => (
            <JobCard
              key={job.id}
              job={job}
              index={index}
              totalJobs={jobs.length}
              onCancel={() => onCancel(job.id)}
              onRetry={() => onRetry(job.id)}
              onRemove={() => onRemove(job.id)}
              onMoveUp={() => onMove(job.id, "up")}
              onMoveDown={() => onMove(job.id, "down")}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
