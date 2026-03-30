import { useEffect, useState } from "react";
import { Clapperboard } from "lucide-react";

interface SplashScreenProps {
  onComplete: () => void;
}

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const [phase, setPhase] = useState<"enter" | "exit">("enter");

  useEffect(() => {
    const exitTimer = setTimeout(() => setPhase("exit"), 1200);
    const doneTimer = setTimeout(onComplete, 1600);
    return () => {
      clearTimeout(exitTimer);
      clearTimeout(doneTimer);
    };
  }, [onComplete]);

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background transition-opacity duration-400 ${
        phase === "exit" ? "opacity-0" : "opacity-100"
      }`}
    >
      <div
        className={`flex flex-col items-center gap-4 transition-all duration-500 ${
          phase === "enter" ? "animate-splash-in" : ""
        }`}
      >
        <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20">
          <Clapperboard className="h-10 w-10 text-primary" />
        </div>
        <div className="text-center">
          <h1 className="text-lg font-semibold tracking-tight">Video Editor</h1>
          <p className="text-xs text-muted-foreground mt-1">Automated video processing</p>
        </div>
      </div>
    </div>
  );
}
