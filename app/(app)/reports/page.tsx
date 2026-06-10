import Link from "next/link";
import { redirect } from "next/navigation";
import { getEffectivePermissions, getSessionProfile } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/auth/permission-keys";
import { isInvoiceOverdue, isIssued, outstanding } from "@/lib/finance/invoice";
import { formatMoney } from "@/lib/projects/money";
import { cn } from "@/lib/utils";
import { PermissionDenied } from "@/components/permission-denied";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PrintButton } from "../invoices/print-button";

const PERIODS = ["month", "quarter", "year", "all"] as const;
type Period = (typeof PERIODS)[number];
const PERIOD_LABELS: Record<Period, string> = {
  month: "هذا الشهر",
  quarter: "هذا الربع",
  year: "هذا العام",
  all: "كل الفترات",
};

function parsePeriod(v: string | undefined): Period {
  return (PERIODS as readonly string[]).includes(v ?? "") ? (v as Period) : "month";
}

/** Lower bound (inclusive) of the selected period as a "YYYY-MM-DD" string, or null for all. */
function periodFrom(period: Period, today: Date): string | null {
  const y = today.getFullYear();
  const m = today.getMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  switch (period) {
    case "all":
      return null;
    case "year":
      return `${y}-01-01`;
    case "quarter":
      return `${y}-${pad(Math.floor(m / 3) * 3 + 1)}-01`;
    default:
      return `${y}-${pad(m + 1)}-01`;
  }
}

type Agg = { invoiced: number; collected: number; outstanding: number };
function emptyAgg(): Agg {
  return { invoiced: 0, collected: 0, outstanding: 0 };
}
function bump(map: Map<string, Agg>, key: string, field: keyof Agg, amount: number) {
  const a = map.get(key) ?? emptyAgg();
  a[field] += amount;
  map.set(key, a);
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  const perms = await getEffectivePermissions();
  if (!can(perms, "financials.view")) return <PermissionDenied />;

  const { period: periodParam } = await searchParams;
  const period = parsePeriod(periodParam);
  const from = periodFrom(period, new Date());
  const inPeriod = (d: string | null) => !from || (d != null && d >= from);

  const supabase = await createClient();
  const [
    { data: invoices },
    { data: payments },
    { data: clients },
    { data: projects },
    { data: financials },
  ] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, client_id, project_id, status, issue_date, due_date, total, amount_paid"),
    supabase.from("payments").select("invoice_id, amount, paid_at, is_reversed"),
    supabase.from("clients").select("id, name"),
    supabase.from("projects").select("id, name"),
    supabase.from("project_financials").select("project_id, contract_value"),
  ]);

  const invList = invoices ?? [];
  // Money aggregates count ISSUED invoices only (sent/partially_paid/paid) —
  // drafts and void never inflate revenue/outstanding (Phase 4.5 A1).
  const issuedInvoices = invList.filter((i) => isIssued(i.status));
  const invoiceById = new Map(invList.map((i) => [i.id, i] as const));
  const clientName = new Map((clients ?? []).map((c) => [c.id, c.name] as const));
  const projectName = new Map((projects ?? []).map((p) => [p.id, p.name] as const));
  const contractByProject = new Map(
    (financials ?? []).map((f) => [f.project_id, f.contract_value] as const),
  );

  // Revenue summary — invoiced & collected are period-bound; outstanding & overdue
  // are now. Collected counts non-reversed payments on ISSUED invoices only
  // (consistent with the dashboard — S18).
  const invoicedPeriod = issuedInvoices
    .filter((i) => inPeriod(i.issue_date))
    .reduce((s, i) => s + i.total, 0);
  const collectedPeriod = (payments ?? [])
    .filter((p) => {
      if (p.is_reversed || !inPeriod(p.paid_at)) return false;
      const inv = invoiceById.get(p.invoice_id);
      return inv != null && isIssued(inv.status);
    })
    .reduce((s, p) => s + p.amount, 0);
  const outstandingNow = issuedInvoices.reduce((s, i) => s + outstanding(i.total, i.amount_paid), 0);
  const overdueNow = issuedInvoices
    .filter((i) => isInvoiceOverdue(i.due_date, i.status))
    .reduce((s, i) => s + outstanding(i.total, i.amount_paid), 0);

  // Per-client & per-project (all-time snapshot, issued invoices only).
  const byClient = new Map<string, Agg>();
  const byProject = new Map<string, Agg>();
  for (const i of issuedInvoices) {
    bump(byClient, i.client_id, "invoiced", i.total);
    bump(byClient, i.client_id, "outstanding", outstanding(i.total, i.amount_paid));
    bump(byProject, i.project_id, "invoiced", i.total);
    bump(byProject, i.project_id, "outstanding", outstanding(i.total, i.amount_paid));
  }
  for (const p of payments ?? []) {
    if (p.is_reversed) continue;
    const inv = invoiceById.get(p.invoice_id);
    if (!inv || !isIssued(inv.status)) continue;
    bump(byClient, inv.client_id, "collected", p.amount);
    bump(byProject, inv.project_id, "collected", p.amount);
  }

  const clientRows = [...byClient.entries()]
    .map(([id, a]) => ({ name: clientName.get(id) ?? "—", ...a }))
    .sort((x, y) => y.outstanding - x.outstanding);

  const projectRows = [...byProject.entries()]
    .map(([id, a]) => {
      const contract = contractByProject.get(id) ?? null;
      return {
        name: projectName.get(id) ?? "—",
        contract,
        invoiced: a.invoiced,
        collected: a.collected,
        remaining: contract != null ? Math.max(0, contract - a.invoiced) : null,
      };
    })
    .sort((x, y) => y.invoiced - x.invoiced);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">التقارير المالية</h1>
          <p className="text-sm text-muted-foreground">
            الإيرادات والتحصيل والمتبقّي على مستوى المكتب والعملاء والمشاريع.
          </p>
        </div>
        <PrintButton />
      </div>

      {/* Period selector */}
      <div className="no-print flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <Link
            key={p}
            href={p === "month" ? "/reports" : `/reports?period=${p}`}
            className={cn(
              "inline-flex items-center rounded-full border px-3 py-1.5 text-sm transition-colors",
              period === p
                ? "border-primary bg-primary/10 font-medium text-primary"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {PERIOD_LABELS[p]}
          </Link>
        ))}
      </div>

      {/* Revenue summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">ملخص الإيرادات — {PERIOD_LABELS[period]}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="إجمالي الفواتير (الفترة)" value={formatMoney(invoicedPeriod)} />
          <Stat label="المُحصّل (الفترة)" value={formatMoney(collectedPeriod)} />
          <Stat label="إجمالي المتبقّي (الآن)" value={formatMoney(outstandingNow)} />
          <Stat label="المتأخر (الآن)" value={formatMoney(overdueNow)} highlight={overdueNow > 0} />
        </CardContent>
      </Card>

      {/* Per client */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">حسب العميل</CardTitle>
        </CardHeader>
        <CardContent>
          {clientRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجد بيانات بعد.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>العميل</TableHead>
                  <TableHead>الفواتير</TableHead>
                  <TableHead>المُحصّل</TableHead>
                  <TableHead>المتبقّي</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientRows.map((c) => (
                  <TableRow key={c.name}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="tabular-nums">{formatMoney(c.invoiced)}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {formatMoney(c.collected)}
                    </TableCell>
                    <TableCell className="tabular-nums font-medium">
                      {formatMoney(c.outstanding)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Per project vs contract */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">حسب المشروع (مقارنة بالعقد)</CardTitle>
        </CardHeader>
        <CardContent>
          {projectRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجد بيانات بعد.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>المشروع</TableHead>
                  <TableHead>قيمة العقد</TableHead>
                  <TableHead>الفواتير</TableHead>
                  <TableHead>المُحصّل</TableHead>
                  <TableHead>المتبقّي للفوترة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projectRows.map((p) => (
                  <TableRow key={p.name}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {p.contract != null ? formatMoney(p.contract) : "—"}
                    </TableCell>
                    <TableCell className="tabular-nums">{formatMoney(p.invoiced)}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {formatMoney(p.collected)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {p.remaining != null ? formatMoney(p.remaining) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 font-semibold tabular-nums",
          highlight ? "text-red-600 dark:text-red-400" : "",
        )}
      >
        {value}
      </div>
    </div>
  );
}
