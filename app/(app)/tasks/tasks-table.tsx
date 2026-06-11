import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format/date";
import { isTaskOverdue, type TaskPriority, type TaskStatus } from "@/lib/tasks/status";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TaskStatusBadge } from "./task-status-badge";
import { TaskPriorityBadge } from "./task-priority-badge";

export type TaskListItem = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_at: string | null;
  project_name: string | null;
  assignee_name: string | null;
  is_mine: boolean;
};

export function TasksTable({ tasks }: { tasks: TaskListItem[] }) {
  if (tasks.length === 0) {
    return (
      <p className="rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">
        لا توجد مهام مطابقة.
      </p>
    );
  }

  return (
    <>
      {/* Desktop: table */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>المهمة</TableHead>
              <TableHead>المشروع</TableHead>
              <TableHead>المسند إليه</TableHead>
              <TableHead>الأولوية</TableHead>
              <TableHead>الحالة</TableHead>
              <TableHead>الاستحقاق</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">
                  <Link href={`/tasks/${t.id}`} className="hover:underline">
                    {t.title}
                  </Link>
                  {t.is_mine ? (
                    <Badge variant="secondary" className="ms-2 align-middle">
                      مهمتي
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell className="text-muted-foreground">{t.project_name ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{t.assignee_name ?? "—"}</TableCell>
                <TableCell>
                  <TaskPriorityBadge priority={t.priority} />
                </TableCell>
                <TableCell>
                  <TaskStatusBadge status={t.status} />
                </TableCell>
                <TableCell>
                  <DueAt dueAt={t.due_at} status={t.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile: stacked cards (no horizontal scroll) */}
      <div className="space-y-3 md:hidden">
        {tasks.map((t) => (
          <Link
            key={t.id}
            href={`/tasks/${t.id}`}
            className="flex flex-col gap-3 rounded-lg border border-border p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="font-medium">
                {t.title}
                {t.is_mine ? (
                  <Badge variant="secondary" className="ms-2 align-middle">
                    مهمتي
                  </Badge>
                ) : null}
              </div>
              <TaskStatusBadge status={t.status} />
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              {t.project_name ? <span>{t.project_name}</span> : null}
              {t.assignee_name ? <span>• {t.assignee_name}</span> : null}
              <TaskPriorityBadge priority={t.priority} />
            </div>
            <DueAt dueAt={t.due_at} status={t.status} />
          </Link>
        ))}
      </div>
    </>
  );
}

function DueAt({ dueAt, status }: { dueAt: string | null; status: TaskStatus }) {
  if (!dueAt) return <span className="text-sm text-muted-foreground">بدون موعد</span>;
  const overdue = isTaskOverdue(dueAt, status);
  return (
    <span
      className={cn(
        "text-sm tabular-nums",
        overdue ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground",
      )}
    >
      <span className="inline-block">{formatDate(dueAt.slice(0, 10))}</span>
      {overdue ? <span className="ms-1">(متأخرة)</span> : null}
    </span>
  );
}
