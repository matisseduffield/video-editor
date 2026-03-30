import { useState, useEffect } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { toast } from "sonner";

export type UpdateStatus = "idle" | "checking" | "available" | "downloading" | "ready" | "error";

export function useUpdater() {
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [newVersion, setNewVersion] = useState<string | null>(null);

  const checkForUpdate = async () => {
    try {
      setStatus("checking");
      const update = await check();

      if (update) {
        setNewVersion(update.version);
        setStatus("available");
        toast.info(`Update ${update.version} available!`, {
          description: "Click the update banner to install.",
          duration: 10000,
        });
      } else {
        setStatus("idle");
      }
    } catch {
      // Silently fail — update check is non-critical
      setStatus("idle");
    }
  };

  const installUpdate = async () => {
    try {
      setStatus("downloading");
      const update = await check();
      if (!update) return;

      let totalBytes = 0;
      let downloadedBytes = 0;

      await update.downloadAndInstall((event) => {
        if (event.event === "Started" && event.data.contentLength) {
          totalBytes = event.data.contentLength;
        } else if (event.event === "Progress") {
          downloadedBytes += event.data.chunkLength;
          if (totalBytes > 0) {
            setProgress(Math.round((downloadedBytes / totalBytes) * 100));
          }
        } else if (event.event === "Finished") {
          setStatus("ready");
        }
      });

      setStatus("ready");
      toast.success("Update installed! Restarting...");
      await relaunch();
    } catch (err) {
      setStatus("error");
      toast.error("Update failed", { description: String(err) });
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const update = await check();
        if (cancelled) return;
        if (update) {
          setNewVersion(update.version);
          setStatus("available");
          toast.info(`Update ${update.version} available!`, {
            description: "Click the update banner to install.",
            duration: 10000,
          });
        }
      } catch {
        // Silently fail — update check is non-critical
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { status, progress, newVersion, checkForUpdate, installUpdate };
}
