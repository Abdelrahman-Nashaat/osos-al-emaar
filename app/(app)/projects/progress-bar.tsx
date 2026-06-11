import { cn } from "@/lib/utils";

/**
 * Operational progress bar. The fill is a block child, so it grows from the
 * inline-start edge — i.e. from the right under dir="rtl" — which is correct for Arabic.
 */
export function ProgressBar({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="نسبة الإنجاز"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${pct}%`}
      >
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-9 shrink-0 text-start text-xs tabular-nums text-muted-foreground">
        {pct}%
      </span>
    </div>
  );
}
