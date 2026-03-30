import { Download, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useUpdater } from "@/hooks/useUpdater";

export function UpdateBanner() {
  const { status, progress, newVersion, installUpdate } = useUpdater();

  if (status === "idle" || status === "checking" || status === "error") {
    return null;
  }

  if (status === "available") {
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-2 bg-primary/10 border-b border-primary/20">
        <div className="flex items-center gap-2 text-sm">
          <Download className="h-4 w-4 text-primary" />
          <span>
            Update <strong>{newVersion}</strong> is available
          </span>
        </div>
        <Button size="sm" variant="default" onClick={installUpdate}>
          <RefreshCw className="h-3 w-3 mr-1" />
          Update now
        </Button>
      </div>
    );
  }

  if (status === "downloading") {
    return (
      <div className="flex items-center gap-3 px-4 py-2 bg-primary/10 border-b border-primary/20">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span className="text-sm">Downloading update...</span>
        <Progress value={progress} className="flex-1 max-w-48 h-2" />
        <span className="text-xs text-muted-foreground">{progress}%</span>
      </div>
    );
  }

  if (status === "ready") {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-green-500/10 border-b border-green-500/20">
        <span className="text-sm">Update installed — restarting...</span>
      </div>
    );
  }

  return null;
}
