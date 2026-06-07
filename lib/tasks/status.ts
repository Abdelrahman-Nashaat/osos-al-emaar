import type { Database } from "@/lib/supabase/database.types";

/**
 * Task domain helpers — pure module (no server deps) so it is safe to import from
 * server components, client components, and unit tests. Mirrors the DB state
 * machine in supabase/migrations/0008_tasks_lifecycle.sql; the SECURITY DEFINER
 * functions there remain the real gate (this only drives UI affordance + tests).
 */
export type TaskStatus = Database["public"]["Enums"]["task_status"];
export type TaskPriority = Database["public"]["Enums"]["task_priority"];
export type TaskEventType = Database["public"]["Enums"]["task_event_type"];

export const TASK_STATUSES = [
  "new",
  "assigned",
  "in_progress",
  "submitted",
  "closed",
] as const satisfies readonly TaskStatus[];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  new: "جديدة",
  assigned: "مُعيّنة",
  in_progress: "قيد التنفيذ",
  submitted: "بانتظار المراجعة",
  closed: "مغلقة",
};

export const TASK_STATUS_BADGE: Record<TaskStatus, string> = {
  new: "bg-muted text-muted-foreground",
  assigned: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  in_progress: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  submitted: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  closed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
};

export const TASK_PRIORITIES = [
  "low",
  "normal",
  "high",
  "urgent",
] as const satisfies readonly TaskPriority[];

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "منخفضة",
  normal: "عادية",
  high: "عالية",
  urgent: "عاجلة",
};

export const TASK_PRIORITY_BADGE: Record<TaskPriority, string> = {
  low: "bg-muted text-muted-foreground",
  normal: "bg-muted text-muted-foreground",
  high: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  urgent: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
};

/** Arabic phrasing for the task-history timeline (one per event type). */
export const TASK_EVENT_LABELS: Record<TaskEventType, string> = {
  created: "أُنشئت المهمة",
  assigned: "تم التعيين",
  reassigned: "نُقلت إلى مهندس آخر",
  started: "بدأ التنفيذ",
  progress: "تحديث نسبة الإنجاز",
  note: "ملاحظة",
  submitted: "أُرسلت للمراجعة",
  reopened: "أُعيد فتحها",
  closed: "أُغلقت",
  milestone: "مَعلَم",
};

/** Closed is the only terminal status; overdue detection ignores it. */
const TERMINAL: ReadonlySet<TaskStatus> = new Set<TaskStatus>(["closed"]);

/**
 * Legal status transitions — the pure mirror of the DB state machine. A status
 * appears in its own list when an action keeps the status while changing another
 * field (e.g. a reassignment/handoff keeps 'assigned'/'in_progress'/'submitted').
 */
export const LEGAL_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  new: ["assigned"],
  assigned: ["assigned", "in_progress"],
  in_progress: ["in_progress", "submitted", "closed"],
  submitted: ["submitted", "closed", "in_progress"],
  closed: ["in_progress"],
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return LEGAL_TRANSITIONS[from].includes(to);
}

/**
 * A task is overdue when it has a real due instant strictly in the past AND it is
 * still open (not closed). Compares absolute instants (timestamptz).
 *
 * @param dueAt  ISO timestamp string or null.
 * @param status current task status.
 * @param now    reference "now" (defaults to current time) — pass a fixed Date in tests.
 */
export function isTaskOverdue(
  dueAt: string | null | undefined,
  status: TaskStatus,
  now: Date = new Date(),
): boolean {
  if (!dueAt) return false;
  if (TERMINAL.has(status)) return false;
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return false;
  return due.getTime() < now.getTime();
}

export type TaskAction =
  | "assign"
  | "handoff"
  | "start"
  | "progress"
  | "note"
  | "submit"
  | "close"
  | "reopen"
  | "milestone"
  | "delete";

/**
 * Which lifecycle actions the viewer may take on a task in a given status — the
 * pure mirror of the DB authority + transition rules, used to decide which action
 * controls to render. Worker actions (start/progress/submit) are assignee-scoped;
 * assign/handoff need tasks.assign; close/reopen/delete are manager-only. The DB
 * functions are a safe superset and remain the real gate.
 */
export function nextActions(
  status: TaskStatus,
  viewer: { isAssignee: boolean; canAssign: boolean; isManager: boolean },
): TaskAction[] {
  const { isAssignee, canAssign, isManager } = viewer;
  const actions: TaskAction[] = [];
  const open = status !== "closed";

  // Worker actions — the current assignee progressing their own task.
  if (isAssignee && status === "assigned") actions.push("start");
  if (isAssignee && (status === "assigned" || status === "in_progress")) actions.push("progress");
  if (isAssignee && status === "in_progress") actions.push("submit");

  // Notes & milestones — assignee or anyone who can assign, while the task is open.
  if ((isAssignee || canAssign) && open) actions.push("note", "milestone");

  // Assign (new) / handoff (already-owned) — tasks.assign holders, non-closed.
  if (canAssign && open) actions.push(status === "new" ? "assign" : "handoff");

  // Manager review controls.
  if (isManager) {
    if (status === "submitted" || status === "in_progress") actions.push("close");
    if (status === "closed" || status === "submitted") actions.push("reopen");
    actions.push("delete");
  }

  return actions.filter((a, i) => actions.indexOf(a) === i);
}
