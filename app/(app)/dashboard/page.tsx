import Link from "next/link";
import { requireAuth, getEffectivePermissions } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/auth/permission-keys";
import { isTaskOverdue, TASK_EVENT_LABELS } from "@/lib/tasks/status";
import { isInvoiceOverdue, isIssued, outstanding } from "@/lib/finance/invoice";
import { formatMoney } from "@/lib/projects/money";
import { formatDate } from "@/lib/format/date";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const ROLE_LABEL: Record<string, string> = {
  manager: "المدير العام",
  engineer: "مهندس",
  accountant: "محاسب",
};

export default async function DashboardPage() {
  const { profile, userId } = await requireAuth();
  const perms = await getEffectivePermissions();
  const isManager = profile.role === "manager";
  const showFinance = can(perms, "financials.view");
  const showTasks = can(perms, "tasks.view");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">مرحباً، {profile.full_name}</h1>
        <p className="text-sm text-muted-foreground">
          دورك في النظام: {ROLE_LABEL[profile.role] ?? profile.role}
        </p>
      </div>

      {/* Finance widgets — manager + accountant only (amounts; engineers never reach this). */}
      {showFinance ? <FinanceWidgets /> : null}

      {showTasks ? <TaskWidgets userId={userId} isManager={isManager} /> : null}

      {!showFinance && !showTasks ? (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          لوحة التحكم قيد الإنشاء. ستظهر هنا إحصائيات إضافية في المراحل القادمة.
        </div>
      ) : null}
    </div>
  );
}

async function FinanceWidgets() {
  const supabase = await createClient();
  const [invRes, payRes, offersRes] = await Promise.all([
    supabase.from("invoices").select("id, status, issue_date, due_date, total, amount_paid"),
    supabase.from("payments").select("invoice_id, amount, paid_at, is_reversed"),
    supabase.from("offers").select("id", { count: "exact", head: true }).eq("status", "sent"),
  ]);
  // Secondary widget: surface a fetch failure inline — never render zeros (B4).
  if (invRes.error || payRes.error) {
    console.error("[dashboard.finance]", {
      inv: invRes.error?.message,
      pay: payRes.error?.message,
    });
    return <WidgetError label="البيانات المالية" />;
  }
  const invoices = invRes.data;
  const payments = payRes.data;
  const pendingOffers = offersRes.count ?? 0;

  // Money KPIs count ISSUED invoices only (sent/partially_paid/paid) — drafts are
  // not receivables and void is cancelled. Collected = non-reversed payments on
  // issued invoices, matching /reports (Phase 4.5 A1/S18).
  const issued = (invoices ?? []).filter((i) => isIssued(i.status));
  const issuedIds = new Set(issued.map((i) => i.id));
  const today = new Date();
  const monthFrom = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;

  const outstandingTotal = issued.reduce((s, i) => s + outstanding(i.total, i.amount_paid), 0);
  const overdue = issued.filter((i) => isInvoiceOverdue(i.due_date, i.status));
  const overdueAmount = overdue.reduce((s, i) => s + outstanding(i.total, i.amount_paid), 0);
  const collectedMonth = (payments ?? [])
    .filter((p) => !p.is_reversed && issuedIds.has(p.invoice_id) && p.paid_at >= monthFrom)
    .reduce((s, p) => s + p.amount, 0);
  const invoicedMonth = issued
    .filter((i) => i.issue_date >= monthFrom)
    .reduce((s, i) => s + i.total, 0);

  const stats = [
    { label: "إجمالي المتبقّي", value: formatMoney(outstandingTotal), href: "/invoices?filter=unpaid" },
    { label: "محصّل هذا الشهر", value: formatMoney(collectedMonth), href: "/reports" },
    {
      label: `متأخر (${overdue.length})`,
      value: formatMoney(overdueAmount),
      href: "/invoices?filter=overdue",
      danger: overdueAmount > 0,
    },
    { label: "فواتير هذا الشهر", value: formatMoney(invoicedMonth), href: "/invoices" },
    // Quotation pipeline — only when something actually awaits a client reply.
    ...(pendingOffers > 0
      ? [{ label: "عروض بانتظار الرد", value: String(pendingOffers), href: "/offers?filter=sent" }]
      : []),
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((s) => (
        <Link
          key={s.label}
          href={s.href}
          className="rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted"
        >
          <div className="text-xs text-muted-foreground">{s.label}</div>
          <div
            className={cn(
              "mt-1 text-2xl font-bold tabular-nums",
              s.danger ? "text-red-600 dark:text-red-400" : "",
            )}
          >
            {s.value}
          </div>
        </Link>
      ))}
    </div>
  );
}

async function TaskWidgets({ userId, isManager }: { userId: string; isManager: boolean }) {
  const supabase = await createClient();

  const { data: tasks, error } = await supabase
    .from("tasks")
    .select("id, title, status, priority, due_at, current_assignee_id");
  if (error) {
    console.error("[dashboard.tasks]", { message: error.message });
    return <WidgetError label="بيانات المهام" />;
  }
  const list = tasks ?? [];

  const mineOpen = list.filter(
    (t) =>
      t.current_assignee_id === userId &&
      (t.status === "assigned" || t.status === "in_progress"),
  ).length;
  const submitted = list.filter((t) => t.status === "submitted").length;
  const urgentOpen = list.filter((t) => t.priority === "urgent" && t.status !== "closed").length;
  const overdueAll = list.filter((t) => isTaskOverdue(t.due_at, t.status)).length;
  const overdueMine = list.filter(
    (t) => t.current_assignee_id === userId && isTaskOverdue(t.due_at, t.status),
  ).length;

  const stats = isManager
    ? [
        { label: "بانتظار المراجعة", value: submitted, href: "/tasks?filter=incomplete" },
        { label: "مهام متأخرة", value: overdueAll, href: "/tasks?filter=incomplete", danger: true },
        { label: "مهام عاجلة", value: urgentOpen, href: "/tasks?filter=urgent" },
      ]
    : [
        { label: "مهامي المفتوحة", value: mineOpen, href: "/tasks?filter=mine" },
        { label: "متأخرة عليّ", value: overdueMine, href: "/tasks?filter=mine", danger: true },
        { label: "مهام عاجلة", value: urgentOpen, href: "/tasks?filter=urgent" },
      ];

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted"
          >
            <div className="text-xs text-muted-foreground">{s.label}</div>
            <div
              className={
                "mt-1 text-3xl font-bold tabular-nums" +
                (s.danger && s.value > 0 ? " text-red-600 dark:text-red-400" : "")
              }
            >
              {s.value}
            </div>
          </Link>
        ))}
      </div>

      {isManager ? (
        <RecentActivity titles={new Map(list.map((t) => [t.id, t.title]))} />
      ) : (
        <MyNextTasks
          tasks={list
            .filter((t) => t.current_assignee_id === userId && t.status !== "closed")
            .sort((a, b) => (a.due_at ?? "9999") < (b.due_at ?? "9999") ? -1 : 1)
            .slice(0, 5)}
        />
      )}
    </div>
  );
}

/** The engineer lands on his actual work list, not just counters. */
function MyNextTasks({
  tasks,
}: {
  tasks: { id: string; title: string; due_at: string | null; status: string }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">مهامي القادمة</CardTitle>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            لا توجد مهام مسندة إليك حالياً — راجع قائمة المهام العامة.
          </p>
        ) : (
          <ul className="space-y-1">
            {tasks.map((t) => {
              const overdue = isTaskOverdue(t.due_at, t.status as Parameters<typeof isTaskOverdue>[1]);
              return (
                <li key={t.id}>
                  <Link
                    href={`/tasks/${t.id}`}
                    className="flex min-h-10 flex-wrap items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                  >
                    <span className="min-w-0 truncate font-medium">{t.title}</span>
                    <span
                      className={cn(
                        "shrink-0 text-xs tabular-nums",
                        overdue ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground",
                      )}
                    >
                      {t.due_at ? formatDate(t.due_at.slice(0, 10)) : "بدون موعد"}
                      {overdue ? " (متأخرة)" : ""}
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

function WidgetError({ label }: { label: string }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
    >
      تعذّر تحميل {label}. أعد تحميل الصفحة.
    </div>
  );
}

async function RecentActivity({ titles }: { titles: Map<string, string> }) {
  const supabase = await createClient();
  const [{ data: events, error: eventsError }, { data: directory }] = await Promise.all([
    supabase
      .from("task_events")
      .select("id, event_type, created_at, actor_id, task_id")
      .order("created_at", { ascending: false })
      .limit(6),
    supabase.rpc("team_directory"),
  ]);
  if (eventsError) {
    console.error("[dashboard.activity]", { message: eventsError.message });
    return <WidgetError label="آخر النشاط" />;
  }
  const nameById = new Map((directory ?? []).map((p) => [p.id, p.full_name] as const));
  const rows = events ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">آخر النشاط</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا يوجد نشاط بعد.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/tasks/${e.task_id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <span>
                    <span className="font-medium">{TASK_EVENT_LABELS[e.event_type]}</span>
                    <span className="text-muted-foreground">
                      {" — "}
                      {titles.get(e.task_id) ?? "مهمة"}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {e.actor_id ? (nameById.get(e.actor_id) ?? "") : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
