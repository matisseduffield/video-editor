import { ScrollArea } from "@/components/ui/scroll-area";
import { JobCard } from "@/components/dashboard/JobCard";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { openVideoFiles } from "@/hooks/useTauri";
import type { Job } from "@/types";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface JobQueueProps {
  jobs: Job[];
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  onReorder: (activeId: string, overId: string) => void;
  onAddMore: (files: { name: string; path: string }[]) => void;
}

function SortableJobCard({
  job,
  index,
  totalJobs,
  onCancel,
  onRetry,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  job: Job;
  index: number;
  totalJobs: number;
  onCancel: () => void;
  onRetry: () => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: job.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <JobCard
        job={job}
        index={index}
        totalJobs={totalJobs}
        onCancel={onCancel}
        onRetry={onRetry}
        onRemove={onRemove}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        dragListeners={listeners}
      />
    </div>
  );
}

export function JobQueue({
  jobs,
  onCancel,
  onRetry,
  onRemove,
  onMove,
  onReorder,
  onAddMore,
}: JobQueueProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onReorder(String(active.id), String(over.id));
    }
  };

  const handleAddMore = async () => {
    const files = await openVideoFiles();
    if (files.length > 0) {
      onAddMore(files);
    }
  };

  return (
    <div className="flex flex-col h-full gap-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] text-muted-foreground/60 font-medium">
          {jobs.length} {jobs.length === 1 ? "video" : "videos"}
        </span>
        <Button variant="outline" size="sm" onClick={handleAddMore} className="h-7 text-xs rounded-lg">
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add Videos
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={jobs.map((j) => j.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-2 pr-2">
              {jobs.map((job, index) => (
                <SortableJobCard
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
          </SortableContext>
        </DndContext>
      </ScrollArea>
    </div>
  );
}
