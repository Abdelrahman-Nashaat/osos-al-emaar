import type { Database } from "@/lib/supabase/database.types";

/**
 * Project domain helpers — pure module (no server deps) so it is safe to import
 * from server components, client components, and unit tests.
 */
export type ProjectStatus = Database["public"]["Enums"]["project_status"];

export const PROJECT_STATUSES = [
  "planning",
  "active",
  "on_hold",
  "completed",
  "cancelled",
] as const satisfies readonly ProjectStatus[];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  planning: "تخطيط",
  active: "قيد التنفيذ",
  on_hold: "متوقف مؤقتاً",
  completed: "مكتمل",
  cancelled: "ملغى",
};

/** Tailwind classes for the status badge (kept here so list + detail agree). */
export const PROJECT_STATUS_BADGE: Record<ProjectStatus, string> = {
  planning: "bg-muted text-muted-foreground",
  active: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  on_hold: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  cancelled: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
};

/** A project is "closed" when its due date no longer matters for overdue detection. */
const CLOSED_STATUSES: ReadonlySet<ProjectStatus> = new Set<ProjectStatus>([
  "completed",
  "cancelled",
]);

/** Format a Date as a local "YYYY-MM-DD" string (no timezone shift). */
function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * A project/task is overdue when it has a real due date strictly in the past AND
 * it is still open (not completed/cancelled). Compares date strings ("YYYY-MM-DD"),
 * which sort chronologically, so there is no timezone ambiguity.
 *
 * @param dueDate ISO date ("YYYY-MM-DD", optionally with a time suffix) or null.
 * @param status  current project status.
 * @param today   reference "today" (defaults to now) — pass a fixed Date in tests.
 */
export function isOverdue(
  dueDate: string | null | undefined,
  status: ProjectStatus,
  today: Date = new Date(),
): boolean {
  if (!dueDate) return false;
  if (CLOSED_STATUSES.has(status)) return false;
  return dueDate.slice(0, 10) < toISODate(today);
}
