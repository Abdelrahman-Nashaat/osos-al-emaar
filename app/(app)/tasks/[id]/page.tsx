import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getEffectivePermissions, getSessionProfile } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/auth/permission-keys";
import { isTaskOverdue, nextActions } from "@/lib/tasks/status";
import { cn } from "@/lib/utils";
import { PermissionDenied } from "@/components/permission-denied";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressBar } from "../../projects/progress-bar";
import { TaskStatusBadge } from "../task-status-badge";
import { TaskPriorityBadge } from "../task-priority-badge";
import { TaskActions } from "../task-actions";
import { TaskTimeline, type TimelineItem } from "../task-timeline";

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await getSessionProfile();
  if (!session) redirect("/login");
  const perms = await getEffectivePermissions();
  if (!can(perms, "tasks.view")) return <PermissionDenied />;

  const canAssign = can(perms, "tasks.assign");
  const isManager = session.profile.role === "manager";

  const supabase = await createClient();
  const { data: task } = await supabase
    .from("tasks")
    .select(
      "id, title, description, status, priority, progress, due_at, current_assignee_id, project_id",
    )
    .eq("id", id)
    .single();
  if (!task) notFound();

  // Parent project — operational only. No project_financials is fetched here, so an
  // engineer's task page never reads or emits any amount.
  const { data: project } = await supabase
    .from("projects")
    .select("id, name, status")
    .eq("id", task.project_id)
    .single();

  // History + the names-only directory (task_events has several FKs to profiles,
  // so we resolve names via a map instead of an ambiguous embed).
  const [{ data: events }, { data: directory }] = await Promise.all([
    supabase
      .from("task_events")
      .select(
        "id, event_type, created_at, note, actor_id, from_status, to_status, from_assignee, to_assignee, metadata",
      )
      .eq("task_id", id)
      .order("created_at", { ascending: false }),
    supabase.rpc("team_directory"),
  ]);
  const nameById = new Map((directory ?? []).map((p) => [p.id, p.full_name] as const));

  const assigneeName = task.current_assignee_id
    ? (nameById.get(task.current_assignee_id) ?? null)
    : null;
  const isAssignee = task.current_assignee_id === session.userId;
  const actions = nextActions(task.status, { isAssignee, canAssign, isManager });
  const assignable = canAssign
    ? (directory ?? [])
        .filter((p) => p.role === "engineer" && p.is_active)
        .map((p) => ({ id: p.id, full_name: p.full_name }))
    : [];

  const items: TimelineItem[] = (events ?? []).map((e) => {
    const meta = (e.metadata ?? {}) as unknown as { progress?: number; label?: string };
    return {
      id: e.id,
      event_type: e.event_type,
      created_at: e.created_at,
      note: e.note,
      actor_name: e.actor_id ? (nameById.get(e.actor_id) ?? null) : null,
      from_status: e.from_status,
      to_status: e.to_status,
      from_assignee_name: e.from_assignee ? (nameById.get(e.from_assignee) ?? null) : null,
      to_assignee_name: e.to_assignee ? (nameById.get(e.to_assignee) ?? null) : null,
      progress: typeof meta.progress === "number" ? meta.progress : null,
      label: typeof meta.label === "string" ? meta.label : null,
    };
  });

  const overdue = isTaskOverdue(task.due_at, task.status);
  const dueDay = task.due_at ? task.due_at.slice(0, 10) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <Link href="/tasks" className="text-sm text-muted-foreground hover:underline">
          → المهام
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{task.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <TaskStatusBadge status={task.status} />
          <TaskPriorityBadge priority={task.priority} />
        </div>
      </div>

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">الإجراءات</CardTitle>
        </CardHeader>
        <CardContent>
          <TaskActions
            taskId={task.id}
            projectId={task.project_id}
            progress={task.progress}
            actions={actions}
            assignable={assignable}
          />
        </CardContent>
      </Card>

      {/* Operational details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">التفاصيل</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <div className="text-xs text-muted-foreground">نسبة الإنجاز</div>
            <ProgressBar value={task.progress} />
          </div>
          <Field
            label="المشروع"
            value={
              project ? (
                <Link href={`/projects/${project.id}`} className="hover:underline">
                  {project.name}
                </Link>
              ) : (
                "—"
              )
            }
          />
          <Field label="المسند إليه" value={assigneeName ?? "غير مُسندة"} />
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">تاريخ الاستحقاق</div>
            <div
              className={cn(
                "text-sm tabular-nums text-end",
                overdue ? "font-medium text-red-600 dark:text-red-400" : "",
              )}
              dir="ltr"
            >
              {dueDay ?? "—"}
              {overdue ? <span className="ms-1">(متأخرة)</span> : null}
            </div>
          </div>
          {task.description ? (
            <div className="space-y-1 sm:col-span-2">
              <div className="text-xs text-muted-foreground">الوصف</div>
              <p className="text-sm whitespace-pre-wrap">{task.description}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* History timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">السجل</CardTitle>
        </CardHeader>
        <CardContent>
          <TaskTimeline items={items} />
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}
