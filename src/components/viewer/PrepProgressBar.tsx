import { memo } from "react";
import { cn } from "@/lib/utils";

interface PrepProgressBarProps {
  percent: number;
  active: boolean;
  className?: string;
  size?: number;
  variant?: "default" | "overlay";
}

export const PrepProgressBar = memo(function PrepProgressBar({
  percent,
  active,
  className,
  size = 20,
  variant = "default",
}: PrepProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, percent));
  const stroke = size <= 16 ? 1.5 : 2;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;
  const center = size / 2;
  const isOverlay = variant === "overlay";

  return (
    <div
      className={cn("flex shrink-0 items-center gap-1.5", className)}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Preparación de audio: ${clamped}%`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className={cn(
          "-rotate-90 shrink-0",
          active && clamped < 100 && !isOverlay && "opacity-90",
        )}
        aria-hidden="true"
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className={
            isOverlay ? "text-primary/25" : "text-foreground/15"
          }
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={isOverlay ? (size <= 16 ? 2 : 3) : stroke}
          strokeLinecap="round"
          className={
            isOverlay ? "text-primary drop-shadow-sm" : "text-foreground/55"
          }
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span
        className={cn(
          "tabular-nums",
          isOverlay
            ? "text-[9px] font-semibold text-primary"
            : "font-medium text-muted-foreground",
          !isOverlay && (size <= 20 ? "text-[10px]" : "text-xs"),
        )}
      >
        {clamped}%
      </span>
    </div>
  );
});
