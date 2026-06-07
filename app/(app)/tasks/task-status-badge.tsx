import { cn } from "@/lib/utils";
import { TASK_STATUS_BADGE, TASK_STATUS_LABELS, type TaskStatus } from "@/lib/tasks/status";

export function TaskStatusBadge({
  status,
  className,
}: {
  status: TaskStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        TASK_STATUS_BADGE[status],
        className,
      )}
    >
      {TASK_STATUS_LABELS[status]}
    </span>
  );
}
