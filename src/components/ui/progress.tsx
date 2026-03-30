import * as React from "react";
import { cn } from "@/lib/utils";

const Progress = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { value?: number; shimmer?: boolean }
>(({ className, value = 0, shimmer = false, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "relative h-2 w-full overflow-hidden rounded-full bg-primary/10",
      className
    )}
    {...props}
  >
    <div
      className={cn(
        "h-full transition-all duration-500 ease-out rounded-full",
        shimmer ? "progress-gradient" : "bg-primary"
      )}
      style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
    />
  </div>
));
Progress.displayName = "Progress";

export { Progress };
