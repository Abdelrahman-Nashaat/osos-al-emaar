import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, ChevronRight, ChevronLeft } from "lucide-react";
import { getEffectivePermissions, getSessionProfile } from "@/lib/auth/permissions";
import { can } from "@/lib/auth/permission-keys";
import { createClient } from "@/lib/supabase/server";
import { must } from "@/lib/supabase/fetch";
import {
  WEEKDAYS_AR,
  addMonths,
  monthBounds,
  monthGrid,
  monthKey,
  monthTitle,
  parseMonthParam,
  todayIso,
} from "@/lib/calendar/month";
import { formatDate } from "@/lib/format/date";
import { PermissionDenied } from "@/components/permission-denied";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

type CalEntry = {
  kind: "task" | "project" | "invoice";
  date: string;
  label: string;
  href: string;
  overdueish: boolean;
};

const KIND_META: Record<CalEntry["kind"], { label: string; dot: string }> = {
  task: { label: "مهمة", dot: "bg-blue-500" },
  project: { label: "مشروع", dot: "bg-emerald-500" },
  invoice: { label: "فاتورة", dot: "bg-amber-500" },
};

/**
 * «التقويم» — month view of due dates (Hamza: «وابغاه يرتبط بالتقويم»).
 * Tasks + projects for tasks.view holders; invoice due dates ONLY for
 * financial roles (server-gated fetch — an engineer request never queries
 * invoices at all, and RLS would return 0 rows regardless).
 */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  const perms = await getEffectivePermissions();
  const seesTasks = can(perms, "tasks.view");
  const seesFinance = can(perms, "financials.view");
  if (!seesTasks && !seesFinance) return <PermissionDenied />;

  const params = await searchParams;
  const ref = parseMonthParam(params.month);
  const { from, to } = monthBounds(ref);
  const today = todayIso();

  const supabase = await createClient();

  const [tasks, projects, invoices] = await Promise.all([
    seesTasks
      ? must(
          "calendar.tasks",
          supabase
            .from("tasks")
            .select("id, title, due_at, status")
            .not("due_at", "is", null)
            .gte("due_at", `${from}T00:00:00Z`)
            .lte("due_at", `${to}T23:59:59Z`)
            .neq("status", "closed"),
        )
      : Promise.resolve([]),
    // Tolerant fetch: the accountant may lack projects.view → RLS returns 0 rows.
    supabase
      .from("projects")
      .select("id, name, due_date, status")
      .not("due_date", "is", null)
      .gte("due_date", from)
      .lte("due_date", to)
      .neq("status", "completed")
      .neq("status", "cancelled")
      .then(({ data }) => data ?? []),
    seesFinance
      ? must(
          "calendar.invoices",
          supabase
            .from("invoices")
            .select("id, invoice_number, due_date, status")
            .not("due_date", "is", null)
            .gte("due_date", from)
            .lte("due_date", to)
            .in("status", ["sent", "partially_paid"]),
        )
      : Promise.resolve([]),
  ]);

  const entries: CalEntry[] = [
    ...tasks.map((t) => ({
      kind: "task" as const,
      date: (t.due_at ?? "").slice(0, 10),
      label: t.title,
      href: `/tasks/${t.id}`,
      overdueish: (t.due_at ?? "").slice(0, 10) < today,
    })),
    ...projects.map((p) => ({
      kind: "project" as const,
      date: p.due_date ?? "",
      label: p.name,
      href: `/projects/${p.id}`,
      overdueish: (p.due_date ?? "") < today,
    })),
    ...invoices.map((i) => ({
      kind: "invoice" as const,
      date: i.due_date ?? "",
      label: `استحقاق ${i.invoice_number}`,
      href: `/invoices/${i.id}`,
      overdueish: (i.due_date ?? "") < today,
    })),
  ];

  const byDay = new Map<string, CalEntry[]>();
  for (const e of entries) {
    if (!e.date) continue;
    const list = byDay.get(e.date) ?? [];
    list.push(e);
    byDay.set(e.date, list);
  }

  const weeks = monthGrid(ref);
  const prev = monthKey(addMonths(ref, -1));
  const next = monthKey(addMonths(ref, 1));
  const agendaDays = [...byDay.keys()].sort();

  const navBtn =
    "inline-flex h-9 items-center gap-1 rounded-md border border-border px-3 text-sm hover:bg-muted";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">التقويم</h1>
          <p className="text-sm text-muted-foreground">
            مواعيد استحقاق المهام والمشاريع{seesFinance ? " والفواتير" : ""} في شهر واحد.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/calendar?month=${prev}`} className={navBtn} aria-label="الشهر السابق">
            <ChevronRight className="size-4" />
            السابق
          </Link>
          <Link href="/calendar" className={navBtn}>
            اليوم
          </Link>
          <Link href={`/calendar?month=${next}`} className={navBtn} aria-label="الشهر التالي">
            التالي
            <ChevronLeft className="size-4" />
          </Link>
        </div>
      </div>

      <p className="text-lg font-semibold">{monthTitle(ref)}</p>

      {/* Month grid (≥md). Mobile uses the agenda below. */}
      <div className="hidden overflow-hidden rounded-xl border border-border md:block">
        <div className="grid grid-cols-7 border-b border-border bg-muted/40 text-center text-xs font-medium text-muted-foreground">
          {WEEKDAYS_AR.map((d, i) => (
            <div key={d} className={cn("py-2", (i === 5 || i === 6) && "text-muted-foreground/70")}>
              {d}
            </div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b border-border last:border-b-0">
            {week.map((cell, ci) => {
              const dayEntries = byDay.get(cell.date) ?? [];
              const isToday = cell.date === today;
              return (
                <div
                  key={cell.date}
                  className={cn(
                    "min-h-24 space-y-1 border-e border-border p-1.5 last:border-e-0",
                    !cell.inMonth && "bg-muted/30 text-muted-foreground",
                    (ci === 5 || ci === 6) && cell.inMonth && "bg-muted/15",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                      isToday && "bg-primary font-bold text-primary-foreground",
                    )}
                  >
                    {cell.day}
                  </span>
                  <div className="space-y-1">
                    {dayEntries.slice(0, 3).map((e, i) => (
                      <Link
                        key={`${e.href}-${i}`}
                        href={e.href}
                        className={cn(
                          "flex items-center gap-1 truncate rounded px-1 py-0.5 text-[11px] leading-4 hover:bg-muted",
                          e.overdueish && "text-destructive",
                        )}
                        title={e.label}
                      >
                        <span className={cn("size-1.5 shrink-0 rounded-full", KIND_META[e.kind].dot)} />
                        <span className="truncate">{e.label}</span>
                      </Link>
                    ))}
                    {dayEntries.length > 3 ? (
                      <p className="px-1 text-[10px] text-muted-foreground">
                        +{dayEntries.length - 3} أخرى
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        {Object.entries(KIND_META)
          .filter(([k]) => (k === "invoice" ? seesFinance : k === "task" ? seesTasks : true))
          .map(([k, m]) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span className={cn("size-2 rounded-full", m.dot)} />
              {m.label}
            </span>
          ))}
      </div>

      {/* Agenda list (always; the mobile primary view) */}
      <Card>
        <CardContent className="pt-0">
          {agendaDays.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
              <CalendarDays className="size-8" aria-hidden />
              لا توجد استحقاقات في هذا الشهر.
            </div>
          ) : (
            <ol className="divide-y divide-border">
              {agendaDays.map((day) => (
                <li key={day} className="py-3">
                  <p
                    className={cn(
                      "mb-1.5 text-sm font-semibold tabular-nums",
                      day === today && "text-primary",
                    )}
                  >
                    {formatDate(day)}
                    {day === today ? " — اليوم" : ""}
                  </p>
                  <ul className="space-y-1.5">
                    {(byDay.get(day) ?? []).map((e, i) => (
                      <li key={`${e.href}-${i}`}>
                        <Link
                          href={e.href}
                          className="flex min-h-10 items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted"
                        >
                          <span className={cn("size-2 shrink-0 rounded-full", KIND_META[e.kind].dot)} />
                          <span className={cn("truncate", e.overdueish && "text-destructive")}>
                            {e.label}
                          </span>
                          <span className="ms-auto shrink-0 text-xs text-muted-foreground">
                            {KIND_META[e.kind].label}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
