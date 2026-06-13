import Link from "next/link";
import { cn } from "@/lib/utils";

export const TASK_FILTERS = [
  "all",
  "mine",
  "submitted",
  "overdue",
  "urgent",
  "incomplete",
  "completed",
] as const;
export type TaskFilter = (typeof TASK_FILTERS)[number];

const LABELS: Record<TaskFilter, string> = {
  all: "الكل",
  mine: "مهامي",
  submitted: "بانتظار المراجعة",
  overdue: "متأخرة",
  urgent: "عاجلة",
  incomplete: "غير مكتملة",
  completed: "مكتملة",
};

export function parseFilter(value: string | undefined): TaskFilter {
  return (TASK_FILTERS as readonly string[]).includes(value ?? "")
    ? (value as TaskFilter)
    : "all";
}

export function TaskFilters({
  active,
  counts,
}: {
  active: TaskFilter;
  counts: Record<TaskFilter, number>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {TASK_FILTERS.map((key) => (
        <Link
          key={key}
          href={key === "all" ? "/tasks" : `/tasks?filter=${key}`}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
            active === key
              ? "border-primary bg-primary/10 font-medium text-primary"
              : "border-border text-muted-foreground hover:bg-muted",
          )}
        >
          {LABELS[key]}
          <span className="tabular-nums text-xs opacity-70">{counts[key]}</span>
        </Link>
      ))}
    </div>
  );
}
