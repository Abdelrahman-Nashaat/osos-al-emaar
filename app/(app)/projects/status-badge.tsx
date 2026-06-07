import { cn } from "@/lib/utils";
import {
  PROJECT_STATUS_BADGE,
  PROJECT_STATUS_LABELS,
  type ProjectStatus,
} from "@/lib/projects/status";

export function StatusBadge({
  status,
  className,
}: {
  status: ProjectStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        PROJECT_STATUS_BADGE[status],
        className,
      )}
    >
      {PROJECT_STATUS_LABELS[status]}
    </span>
  );
}
