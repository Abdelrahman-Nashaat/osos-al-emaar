import Link from "next/link";
import { FolderKanban } from "lucide-react";
import { cn } from "@/lib/utils";
import { isOverdue, type ProjectStatus } from "@/lib/projects/status";
import { formatMoney } from "@/lib/projects/money";
import { formatDate } from "@/lib/format/date";
import { ProjectCode } from "@/lib/projects/label";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "./status-badge";
import { ProgressBar } from "./progress-bar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type ProjectListItem = {
  id: string;
  name: string;
  code: string | null;
  status: ProjectStatus;
  progress: number;
  due_date: string | null;
  client_name: string | null;
  // Present ONLY when the viewer can_view_financials — engineers never receive this.
  budget?: number | null;
  currency?: string;
};

export function ProjectsTable({
  projects,
  showFinancials,
}: {
  projects: ProjectListItem[];
  showFinancials: boolean;
}) {
  if (projects.length === 0) {
    return (
      <EmptyState
        icon={FolderKanban}
        title="لا توجد مشاريع بعد."
        description="ستظهر مشاريع المكتب هنا فور إضافتها."
      />
    );
  }

  return (
    <>
      {/* Desktop: table */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>المشروع</TableHead>
              <TableHead>العميل</TableHead>
              <TableHead>الحالة</TableHead>
              <TableHead className="w-44">الإنجاز</TableHead>
              <TableHead>الاستحقاق</TableHead>
              {showFinancials ? <TableHead>الميزانية</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">
                  <Link href={`/projects/${p.id}`} className="hover:underline">
                    {p.name}
                  </Link>
                  <ProjectCode code={p.code} />
                </TableCell>
                <TableCell className="text-muted-foreground">{p.client_name ?? "—"}</TableCell>
                <TableCell>
                  <StatusBadge status={p.status} />
                </TableCell>
                <TableCell>
                  <ProgressBar value={p.progress} />
                </TableCell>
                <TableCell>
                  <DueDate dueDate={p.due_date} status={p.status} />
                </TableCell>
                {showFinancials ? (
                  <TableCell className="tabular-nums">
                    {formatMoney(p.budget ?? null, p.currency)}
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile: stacked cards (no horizontal scroll) */}
      <div className="space-y-3 md:hidden">
        {projects.map((p) => (
          <Link
            key={p.id}
            href={`/projects/${p.id}`}
            className="flex flex-col gap-3 rounded-lg border border-border p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 font-medium">
                {p.name}
                <ProjectCode code={p.code} />
              </div>
              <StatusBadge status={p.status} />
            </div>
            {p.client_name ? (
              <div className="text-sm text-muted-foreground">{p.client_name}</div>
            ) : null}
            <ProgressBar value={p.progress} />
            <div className="flex items-center justify-between text-sm">
              <DueDate dueDate={p.due_date} status={p.status} />
              {showFinancials ? (
                <span className="tabular-nums text-muted-foreground">
                  {formatMoney(p.budget ?? null, p.currency)}
                </span>
              ) : null}
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}

function DueDate({ dueDate, status }: { dueDate: string | null; status: ProjectStatus }) {
  if (!dueDate) return <span className="text-muted-foreground">—</span>;
  const overdue = isOverdue(dueDate, status);
  return (
    <span
      className={cn(
        "text-sm tabular-nums",
        overdue ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground",
      )}
    >
      {formatDate(dueDate)}
      {overdue ? <span className="ms-1">(متأخر)</span> : null}
    </span>
  );
}
