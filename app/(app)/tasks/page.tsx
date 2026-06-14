import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { getEffectivePermissions, getSessionProfile } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { must } from "@/lib/supabase/fetch";
import { can } from "@/lib/auth/permission-keys";
import { PermissionDenied } from "@/components/permission-denied";
import { LIST_PAGE_SIZE, Pager, parseListParams, SearchBox } from "@/components/list-controls";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TasksTable, type TaskListItem } from "./tasks-table";
import { TaskFilters, parseFilter, TASK_FILTERS, type TaskFilter } from "./task-filters";
import { TaskFormDialog } from "./task-form";
import { isTaskOverdue } from "@/lib/tasks/status";

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string; page?: string }>;
}) {
  const session = await getSessionProfile();
  if (!session) redirect("/login");

  const perms = await getEffectivePermissions();
  if (!can(perms, "tasks.view")) return <PermissionDenied />;
  const canAssign = can(perms, "tasks.assign");
  const myId = session.userId;

  const sp = await searchParams;
  const { filter: filterParam } = sp;
  const filter = parseFilter(filterParam);
  const { q, page, from } = parseListParams(sp);

  const supabase = await createClient();
  const tasksQuery = q
    ? supabase
        .from("tasks")
        .select("id, title, status, priority, progress, due_at, current_assignee_id, project_id")
        .ilike("title", `%${q}%`)
        .order("created_at", { ascending: false })
    : supabase
        .from("tasks")
        .select("id, title, status, priority, progress, due_at, current_assignee_id, project_id")
        .order("created_at", { ascending: false });
  const [rows, { data: directory }, { data: projectRows }] = await Promise.all([
    must("tasks.list", tasksQuery),
    supabase.rpc("team_directory"),
    supabase.from("projects").select("id, name").order("name"),
  ]);

  const nameById = new Map((directory ?? []).map((p) => [p.id, p.full_name] as const));
  const projectName = new Map((projectRows ?? []).map((p) => [p.id, p.name] as const));

  const now = new Date();
  const all = rows.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    due_at: t.due_at,
    project_name: projectName.get(t.project_id) ?? null,
    assignee_name: t.current_assignee_id ? (nameById.get(t.current_assignee_id) ?? null) : null,
    is_mine: t.current_assignee_id === myId,
    is_overdue: isTaskOverdue(t.due_at, t.status, now),
  }));

  const matches = (t: (typeof all)[number], f: TaskFilter): boolean => {
    switch (f) {
      case "mine":
        return t.is_mine;
      case "submitted":
        return t.status === "submitted";
      case "overdue":
        return t.is_overdue;
      case "urgent":
        return t.priority === "urgent";
      case "incomplete":
        return t.status !== "closed";
      case "completed":
        return t.status === "closed";
      default:
        return true;
    }
  };

  const counts = Object.fromEntries(
    TASK_FILTERS.map((f) => [f, all.filter((t) => matches(t, f)).length]),
  ) as Record<TaskFilter, number>;
  const filtered: TaskListItem[] = all.filter((t) => matches(t, filter));
  const hasMore = filtered.length > from + LIST_PAGE_SIZE;
  const tasks: TaskListItem[] = filtered.slice(from, from + LIST_PAGE_SIZE);

  // Active engineers for the create dialog's assignee picker (tasks.assign only).
  const engineers = canAssign
    ? (directory ?? [])
        .filter((p) => p.role === "engineer" && p.is_active)
        .map((p) => ({ id: p.id, full_name: p.full_name }))
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">المهام</h1>
          <p className="text-sm text-muted-foreground">
            متابعة المهام وحالاتها والمسند إليهم والمتأخرات.
          </p>
        </div>
        {canAssign ? (
          <TaskFormDialog
            projects={projectRows ?? []}
            engineers={engineers}
            trigger={
              <Button className="shrink-0" aria-label="مهمة جديدة">
                <Plus className="size-4" />
                <span className="hidden sm:inline">مهمة جديدة</span>
              </Button>
            }
          />
        ) : null}
      </div>

      <TaskFilters active={filter} counts={counts} />

      <SearchBox
        placeholder="ابحث بعنوان المهمة…"
        q={q}
        hidden={{ filter: filter === "all" ? undefined : filter }}
      />

      <Card>
        <CardContent className="pt-6">
          <TasksTable tasks={tasks} />
        </CardContent>
      </Card>

      <Pager
        page={page}
        hasMore={hasMore}
        basePath="/tasks"
        params={{ q, filter: filter === "all" ? undefined : filter }}
      />
    </div>
  );
}
