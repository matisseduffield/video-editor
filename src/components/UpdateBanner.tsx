import { Download, RefreshCw, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useUpdater } from "@/hooks/useUpdater";
import { useState } from "react";

export function UpdateBanner() {
  const { status, progress, newVersion, currentVersion, changelog, installUpdate } = useUpdater();
  const [showChangelog, setShowChangelog] = useState(false);

  if (status === "idle" || status === "checking" || status === "error") {
    return null;
  }

  if (status === "available") {
    return (
      <div className="border-b border-primary/10">
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-primary/[0.06]">
          <div className="flex items-center gap-2 text-sm">
            <div className="p-1 rounded-md bg-primary/10">
              <Download className="h-3.5 w-3.5 text-primary" />
            </div>
            <span>
              Update <strong className="text-primary">{newVersion}</strong> is available
              {currentVersion && (
                <span className="text-muted-foreground ml-1">(current: {currentVersion})</span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {changelog && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowChangelog(!showChangelog)}
                className="h-7 text-xs"
              >
                {showChangelog ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
                Changelog
              </Button>
            )}
            <Button size="sm" variant="default" onClick={installUpdate} className="h-7 text-xs rounded-lg">
              <RefreshCw className="h-3 w-3 mr-1" />
              Update now
            </Button>
          </div>
        </div>
        {showChangelog && changelog && (
          <div className="px-4 py-2 bg-primary/[0.03] text-xs text-muted-foreground max-h-32 overflow-auto whitespace-pre-wrap">
            {changelog}
          </div>
        )}
      </div>
    );
  }

  if (status === "downloading") {
    return (
      <div className="flex items-center gap-3 px-4 py-2 bg-primary/8 border-b border-primary/15">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span className="text-sm">Downloading update...</span>
        <Progress value={progress} className="flex-1 max-w-48 h-2" />
        <span className="text-xs text-muted-foreground">{progress}%</span>
      </div>
    );
  }

  if (status === "ready") {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-success/8 border-b border-success/15">
        <span className="text-sm">Update installed — restarting...</span>
      </div>
    );
  }

  return null;
}
