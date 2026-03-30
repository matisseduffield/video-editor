import { DropZone } from "@/components/dashboard/DropZone";
import { JobQueue } from "@/components/dashboard/JobQueue";
import { QueueToolbar } from "@/components/dashboard/QueueToolbar";
import type { AppSettings, Job, JobStatus } from "@/types";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  addJobs as addJobsToBackend,
  cancelJob as cancelJobBackend,
  retryJob as retryJobBackend,
  removeJob as removeJobBackend,
  moveJob as moveJobBackend,
  startProcessing,
  onJobProgress,
  onJobStatus,
  probeVideo,
  validateFfmpeg,
} from "@/hooks/useTauri";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { toast } from "sonner";

const ACCEPTED_EXTENSIONS = [".mp4", ".mov", ".mkv", ".avi", ".webm"];

interface MainPanelProps {
  settings: AppSettings;
}

export function MainPanel({ settings }: MainPanelProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const isProcessingRef = useRef(false);
  const unlistenRefs = useRef<UnlistenFn[]>([]);

  // Listen for job progress events from Rust backend
  useEffect(() => {
    let cancelled = false;

    async function setupListeners() {
      const unProgress = await onJobProgress((payload) => {
        if (!cancelled) {
          setJobs((prev) =>
            prev.map((j) =>
              j.id === payload.jobId ? { ...j, progress: payload.progress } : j
            )
          );
        }
      });

      const unStatus = await onJobStatus((payload) => {
        if (!cancelled) {
          setJobs((prev) =>
            prev.map((j) =>
              j.id === payload.jobId
                ? {
                    ...j,
                    status: payload.status as JobStatus,
                    error: payload.error,
                    outputPaths: payload.outputPaths ?? j.outputPaths,
                    completedAt:
                      payload.status === "completed" || payload.status === "failed"
                        ? new Date().toISOString()
                        : j.completedAt,
                  }
                : j
            )
          );

          // Show detail warnings (e.g. captions skipped, TTS failed)
          if (payload.detail) {
            toast.warning(payload.detail, { duration: 6000 });
          }

          // Toast on completion or failure
          if (payload.status === "completed") {
            setJobs((prev) => {
              const job = prev.find((j) => j.id === payload.jobId);
              if (job) toast.success(`Completed: ${job.fileName}`);
              return prev;
            });
          } else if (payload.status === "failed") {
            setJobs((prev) => {
              const job = prev.find((j) => j.id === payload.jobId);
              if (job) toast.error(`Failed: ${job.fileName}`, { description: payload.error });
              return prev;
            });
          }
          // If all jobs are done, stop the processing state
          setJobs((prev) => {
            const stillActive = prev.some(
              (j) => j.status === "processing" || j.status === "queued"
            );
            if (!stillActive) {
              setIsProcessing(false);
              isProcessingRef.current = false;
            }
            return prev;
          });
        }
      });

      if (cancelled) {
        unProgress();
        unStatus();
      } else {
        unlistenRefs.current = [unProgress, unStatus];
      }
    }

    setupListeners();

    return () => {
      cancelled = true;
      unlistenRefs.current.forEach((fn) => fn());
      unlistenRefs.current = [];
    };
  }, []);

  // Listen for Tauri native drag-drop anywhere in the window
  useEffect(() => {
    const unlisteners: Promise<UnlistenFn>[] = [];

    unlisteners.push(
      listen<{ paths: string[] }>("tauri://drag-drop", (event) => {
        const paths = event.payload.paths;
        const files: { name: string; path: string }[] = [];
        let rejected = 0;
        for (const p of paths) {
          const name = p.split(/[/\\]/).pop() ?? p;
          const ext = "." + name.split(".").pop()?.toLowerCase();
          if (ACCEPTED_EXTENSIONS.includes(ext)) {
            files.push({ name, path: p });
          } else {
            rejected++;
          }
        }
        if (rejected > 0) {
          toast.warning(`${rejected} file(s) skipped — unsupported format`);
        }
        if (files.length > 0) {
          addJobsToBackend(files)
            .then((created) => {
              setJobs((prev) => [...prev, ...created]);
              probeAndEnrich(created);
            })
            .catch((err) => toast.error("Failed to add files", { description: String(err) }));
        }
      })
    );

    return () => {
      unlisteners.forEach((p) => p.then((fn) => fn()));
    };
  }, []);

  // Probe videos for metadata and enrich job objects
  const probeAndEnrich = useCallback(async (created: Job[]) => {
    for (const job of created) {
      try {
        const raw = await probeVideo(job.filePath);
        // ffprobe JSON: { format: { duration, size }, streams: [{ width, height, codec_type }] }
        const format = raw.format as Record<string, unknown> | undefined;
        const streams = raw.streams as Array<Record<string, unknown>> | undefined;
        const videoStream = streams?.find((s) => s.codec_type === "video");

        const duration = format?.duration ? parseFloat(String(format.duration)) : undefined;
        const fileSize = format?.size ? parseInt(String(format.size), 10) : undefined;
        const width = videoStream?.width as number | undefined;
        const height = videoStream?.height as number | undefined;
        const resolution = width && height ? `${width}x${height}` : undefined;

        setJobs((prev) =>
          prev.map((j) =>
            j.id === job.id ? { ...j, duration, resolution, fileSize } : j
          )
        );
      } catch {
        // Probe failed — non-critical, skip
      }
    }
  }, []);

  const addJobs = useCallback(
    async (files: { name: string; path: string }[]) => {
      try {
        const created = await addJobsToBackend(files);
        setJobs((prev) => [...prev, ...created]);
        probeAndEnrich(created);
      } catch (err) {
        toast.error("Failed to add jobs", { description: String(err) });
        // Fallback: create jobs locally if backend fails
        const newJobs: Job[] = files.map((file) => ({
          id: crypto.randomUUID(),
          fileName: file.name,
          filePath: file.path,
          status: "queued" as const,
          progress: 0,
          createdAt: new Date().toISOString(),
        }));
        setJobs((prev) => [...prev, ...newJobs]);
      }
    },
    [probeAndEnrich]
  );

  const cancelJob = async (id: string) => {
    try {
      await cancelJobBackend(id);
    } catch {
      /* local fallback */
    }
    setJobs((prev) =>
      prev.map((j) =>
        j.id === id && (j.status === "queued" || j.status === "processing")
          ? { ...j, status: "cancelled" }
          : j
      )
    );
  };

  const retryJob = async (id: string) => {
    try {
      await retryJobBackend(id);
    } catch {
      /* local fallback */
    }
    setJobs((prev) =>
      prev.map((j) =>
        j.id === id && j.status === "failed"
          ? { ...j, status: "queued", progress: 0, error: undefined }
          : j
      )
    );
  };

  const removeJob = async (id: string) => {
    try {
      await removeJobBackend(id);
    } catch {
      /* local fallback */
    }
    setJobs((prev) => prev.filter((j) => j.id !== id));
  };

  const cancelAll = () => {
    jobs.forEach((j) => {
      if (j.status === "queued" || j.status === "processing") {
        cancelJobBackend(j.id).catch(() => {});
      }
    });
    setJobs((prev) =>
      prev.map((j) =>
        j.status === "queued" || j.status === "processing"
          ? { ...j, status: "cancelled" }
          : j
      )
    );
    setIsProcessing(false);
    isProcessingRef.current = false;
  };

  const retryAllFailed = () => {
    jobs.forEach((j) => {
      if (j.status === "failed") {
        retryJobBackend(j.id).catch(() => {});
      }
    });
    setJobs((prev) =>
      prev.map((j) =>
        j.status === "failed"
          ? { ...j, status: "queued", progress: 0, error: undefined }
          : j
      )
    );
  };

  const clearCompleted = () => {
    jobs.forEach((j) => {
      if (j.status === "completed" || j.status === "cancelled") {
        removeJobBackend(j.id).catch(() => {});
      }
    });
    setJobs((prev) =>
      prev.filter((j) => j.status !== "completed" && j.status !== "cancelled")
    );
  };

  const moveJob = async (id: string, direction: "up" | "down") => {
    try {
      await moveJobBackend(id, direction);
    } catch {
      /* local fallback */
    }
    setJobs((prev) => {
      const idx = prev.findIndex((j) => j.id === id);
      if (idx === -1) return prev;
      const targetIdx = direction === "up" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
      return next;
    });
  };

  const handleStartProcessing = async () => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    // Pre-validate FFmpeg
    try {
      await validateFfmpeg();
    } catch {
      toast.error("FFmpeg not found", { description: "Ensure FFmpeg is bundled or on PATH" });
      isProcessingRef.current = false;
      return;
    }

    setIsProcessing(true);
    toast.info("Processing started");
    try {
      await startProcessing(settings);
    } catch (err) {
      toast.error("Processing failed", { description: String(err) });
      setIsProcessing(false);
      isProcessingRef.current = false;
    }
  };

  const hasJobs = jobs.length > 0;
  const queuedCount = jobs.filter((j) => j.status === "queued").length;
  const processingCount = jobs.filter((j) => j.status === "processing").length;
  const failedCount = jobs.filter((j) => j.status === "failed").length;

  const overallProgress = jobs.length > 0
    ? Math.round(
        jobs.reduce((sum, j) => {
          if (j.status === "completed") return sum + 100;
          if (j.status === "processing") return sum + j.progress;
          return sum;
        }, 0) / jobs.length
      )
    : 0;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Toolbar */}
      <QueueToolbar
        queuedCount={queuedCount}
        processingCount={processingCount}
        failedCount={failedCount}
        onCancelAll={cancelAll}
        onRetryAllFailed={retryAllFailed}
        onClearCompleted={clearCompleted}
        onStartProcessing={handleStartProcessing}
        isProcessing={isProcessing}
        hasJobs={hasJobs}
        overallProgress={overallProgress}
      />

      {/* Drop Zone + Queue */}
      <div className="flex-1 overflow-hidden p-4">
        {hasJobs ? (
          <JobQueue
            jobs={jobs}
            onCancel={cancelJob}
            onRetry={retryJob}
            onRemove={removeJob}
            onMove={moveJob}
            onAddMore={addJobs}
          />
        ) : (
          <DropZone onFilesAdded={addJobs} />
        )}
      </div>
    </div>
  );
}
