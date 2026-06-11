import Link from "next/link";
import { Plus } from "lucide-react";
import { isTaskOverdue, type TaskPriority, type TaskStatus } from "@/lib/tasks/status";
import { formatDate } from "@/lib/format/date";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TaskStatusBadge } from "@/app/(app)/tasks/task-status-badge";
import { TaskFormDialog } from "@/app/(app)/tasks/task-form";

type Row = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_at: string | null;
  assignee_name: string | null;
};

/** Operational tasks for one project, shown inside the project detail page. No amounts. */
export function ProjectTasksCard({
  projectId,
  projectName,
  tasks,
  canCreate,
  engineers,
}: {
  projectId: string;
  projectName: string;
  tasks: Row[];
  canCreate: boolean;
  engineers: { id: string; full_name: string }[];
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">مهام المشروع</CardTitle>
        {canCreate ? (
          <TaskFormDialog
            projects={[{ id: projectId, name: projectName }]}
            engineers={engineers}
            lockedProjectId={projectId}
            trigger={
              <Button variant="outline" size="sm">
                <Plus className="size-4" />
                مهمة
              </Button>
            }
          />
        ) : null}
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد مهام لهذا المشروع بعد.</p>
        ) : (
          <ul className="space-y-2">
            {tasks.map((t) => {
              const overdue = isTaskOverdue(t.due_at, t.status);
              return (
                <li key={t.id}>
                  <Link
                    href={`/tasks/${t.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 hover:bg-muted"
                  >
                    <span className="flex min-w-0 items-center gap-2 text-sm">
                      <TaskStatusBadge status={t.status} />
                      <span className="font-medium">{t.title}</span>
                    </span>
                    <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{t.assignee_name ?? "غير مُسندة"}</span>
                      {t.due_at ? (
                        <span
                          className={cn(
                            "tabular-nums",
                            overdue ? "font-medium text-red-600 dark:text-red-400" : "",
                          )}
                        >
                          {formatDate(t.due_at.slice(0, 10))}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
