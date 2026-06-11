import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { getEffectivePermissions, getSessionProfile } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/auth/permission-keys";
import {
  isInvoiceOverdue,
  outstanding,
  agingBucket,
  AGING_LABELS,
  type AgingBucket,
} from "@/lib/finance/invoice";
import { formatMoney } from "@/lib/projects/money";
import { must } from "@/lib/supabase/fetch";
import { PermissionDenied } from "@/components/permission-denied";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { InvoicesTable, type InvoiceListItem } from "./invoices-table";
import {
  InvoiceFilters,
  parseInvoiceFilter,
  INVOICE_FILTERS,
  type InvoiceFilter,
} from "./invoice-filters";
import { InvoiceFormDialog } from "./invoice-form";

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const session = await getSessionProfile();
  if (!session) redirect("/login");

  const perms = await getEffectivePermissions();
  if (!can(perms, "financials.view")) return <PermissionDenied />;

  const { filter: filterParam } = await searchParams;
  const filter = parseInvoiceFilter(filterParam);

  const supabase = await createClient();
  // Load-bearing finance reads → throw to error.tsx instead of fake-empty (B4).
  const [rows, clientRows, projectRows] = await Promise.all([
    must(
      "invoices.list",
      supabase
        .from("invoices")
        .select("id, invoice_number, client_id, project_id, total, amount_paid, status, due_date, currency")
        .order("created_at", { ascending: false }),
    ),
    must("invoices.clients", supabase.from("clients").select("id, name").order("name")),
    must("invoices.projects", supabase.from("projects").select("id, name").order("name")),
  ]);
  const clientName = new Map(clientRows.map((c) => [c.id, c.name] as const));
  const projectName = new Map(projectRows.map((p) => [p.id, p.name] as const));

  const all = rows.map((inv) => ({
    id: inv.id,
    invoice_number: inv.invoice_number,
    client_name: clientName.get(inv.client_id) ?? null,
    project_name: projectName.get(inv.project_id) ?? null,
    total: inv.total,
    amount_paid: inv.amount_paid,
    status: inv.status,
    due_date: inv.due_date,
    currency: inv.currency,
  }));

  const matches = (inv: (typeof all)[number], f: InvoiceFilter): boolean => {
    switch (f) {
      case "draft":
        return inv.status === "draft";
      case "unpaid":
        return inv.status === "sent" || inv.status === "partially_paid";
      case "overdue":
        return isInvoiceOverdue(inv.due_date, inv.status);
      case "paid":
        return inv.status === "paid";
      case "void":
        return inv.status === "void";
      default:
        return true;
    }
  };

  const counts = Object.fromEntries(
    INVOICE_FILTERS.map((f) => [f, all.filter((i) => matches(i, f)).length]),
  ) as Record<InvoiceFilter, number>;
  const invoices: InvoiceListItem[] = all.filter((i) => matches(i, filter));

  // Collections aging — shown on the «متأخرة» filter over the outstanding invoices.
  const aging = filter === "overdue" ? buildAging(invoices) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">الفواتير</h1>
          <p className="text-sm text-muted-foreground">
            إصدار الفواتير وتسجيل الدفعات ومتابعة التحصيل.
          </p>
        </div>
        <InvoiceFormDialog
          projects={projectRows}
          trigger={
            <Button className="shrink-0" aria-label="فاتورة جديدة">
              <Plus className="size-4" />
              <span className="hidden sm:inline">فاتورة جديدة</span>
            </Button>
          }
        />
      </div>

      <InvoiceFilters active={filter} counts={counts} />

      {aging ? <AgingSummary aging={aging} /> : null}

      <Card>
        <CardContent className="pt-6">
          <InvoicesTable invoices={invoices} />
        </CardContent>
      </Card>
    </div>
  );
}

type AgingData = Record<AgingBucket, { count: number; amount: number }>;

function buildAging(invoices: InvoiceListItem[]): AgingData {
  const data: AgingData = {
    current: { count: 0, amount: 0 },
    d1_30: { count: 0, amount: 0 },
    d31_60: { count: 0, amount: 0 },
    d60_plus: { count: 0, amount: 0 },
  };
  for (const inv of invoices) {
    const bucket = agingBucket(inv.due_date);
    data[bucket].count += 1;
    data[bucket].amount += outstanding(inv.total, inv.amount_paid);
  }
  return data;
}

function AgingSummary({ aging }: { aging: AgingData }) {
  const buckets: AgingBucket[] = ["d1_30", "d31_60", "d60_plus"];
  return (
    <Card>
      <CardContent className="grid gap-3 pt-6 sm:grid-cols-3">
        {buckets.map((b) => (
          <div key={b} className="rounded-lg border border-border p-3">
            <div className="text-xs text-muted-foreground">{AGING_LABELS[b]}</div>
            <div className="mt-1 font-semibold tabular-nums">{formatMoney(aging[b].amount)}</div>
            <div className="text-xs tabular-nums text-muted-foreground">{aging[b].count} فاتورة</div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
