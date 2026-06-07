import { cn } from "@/lib/utils";
import {
  TASK_PRIORITY_BADGE,
  TASK_PRIORITY_LABELS,
  type TaskPriority,
} from "@/lib/tasks/status";

export function TaskPriorityBadge({
  priority,
  className,
}: {
  priority: TaskPriority;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        TASK_PRIORITY_BADGE[priority],
        className,
      )}
    >
      {TASK_PRIORITY_LABELS[priority]}
    </span>
  );
}
