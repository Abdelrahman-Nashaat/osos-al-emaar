import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { getEffectivePermissions, getSessionProfile } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/auth/permission-keys";
import {
  isInvoiceOverdue,
  outstanding,
  agingBucket,
  daysOverdue,
  AGING_LABELS,
  type AgingBucket,
} from "@/lib/finance/invoice";
import { formatMoney } from "@/lib/projects/money";
import { must } from "@/lib/supabase/fetch";
import { LIST_PAGE_SIZE, Pager, parseListParams, SearchBox } from "@/components/list-controls";
import { PermissionDenied } from "@/components/permission-denied";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { InvoicesTable, type InvoiceListItem } from "./invoices-table";
import { CollectionsWorklist, type CollectionRow } from "./collections-worklist";
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
  searchParams: Promise<{ filter?: string; q?: string; page?: string }>;
}) {
  const session = await getSessionProfile();
  if (!session) redirect("/login");

  const perms = await getEffectivePermissions();
  if (!can(perms, "financials.view")) return <PermissionDenied />;

  const sp = await searchParams;
  const filter = parseInvoiceFilter(sp.filter);
  const { q, page, from } = parseListParams(sp);

  const supabase = await createClient();
  // Load-bearing finance reads → throw to error.tsx instead of fake-empty (B4).
  const [rows, clientRows, projectRows] = await Promise.all([
    must(
      "invoices.list",
      q
        ? supabase
            .from("invoices")
            .select("id, invoice_number, client_id, project_id, total, amount_paid, status, due_date, currency")
            .ilike("invoice_number", `%${q}%`)
            .order("created_at", { ascending: false })
        : supabase
            .from("invoices")
            .select("id, invoice_number, client_id, project_id, total, amount_paid, status, due_date, currency")
            .order("created_at", { ascending: false }),
    ),
    must("invoices.clients", supabase.from("clients").select("id, name, phone").order("name")),
    must("invoices.projects", supabase.from("projects").select("id, name").order("name")),
  ]);
  const clientName = new Map(clientRows.map((c) => [c.id, c.name] as const));
  const clientPhone = new Map(clientRows.map((c) => [c.id, c.phone] as const));
  const projectName = new Map(projectRows.map((p) => [p.id, p.name] as const));

  const all = rows.map((inv) => ({
    id: inv.id,
    invoice_number: inv.invoice_number,
    client_id: inv.client_id,
    project_id: inv.project_id,
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
  const filtered: InvoiceListItem[] = all.filter((i) => matches(i, filter));
  const hasMore = filtered.length > from + LIST_PAGE_SIZE;
  const invoices: InvoiceListItem[] = filtered.slice(from, from + LIST_PAGE_SIZE);

  // Collections aging — over the WHOLE overdue set (not just the visible page).
  const aging = filter === "overdue" ? buildAging(filtered) : null;

  // Collections worklist (التحصيل) — built only on the overdue filter. Oldest
  // debt first, with each invoice's latest follow-up note and the client phone.
  let collectionRows: CollectionRow[] = [];
  let noDueDate: { id: string; invoice_number: string }[] = [];
  if (filter === "overdue") {
    const overdueInvoices = all.filter((i) => matches(i, "overdue"));
    const overdueIds = overdueInvoices.map((i) => i.id);
    const lastNoteByInvoice = new Map<string, { date: string; note: string }>();
    if (overdueIds.length > 0) {
      const { data: noteEvents } = await supabase
        .from("invoice_events")
        .select("invoice_id, note, created_at")
        .in("invoice_id", overdueIds)
        .eq("event_type", "note")
        .order("created_at", { ascending: false });
      for (const e of noteEvents ?? []) {
        if (!lastNoteByInvoice.has(e.invoice_id) && e.note) {
          lastNoteByInvoice.set(e.invoice_id, { date: e.created_at, note: e.note });
        }
      }
    }
    collectionRows = overdueInvoices
      .slice()
      .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? "")) // oldest debt first
      .map((inv) => ({
        id: inv.id,
        invoice_number: inv.invoice_number,
        project_id: inv.project_id,
        client_name: inv.client_name,
        client_phone: clientPhone.get(inv.client_id) ?? null,
        outstanding: outstanding(inv.total, inv.amount_paid),
        currency: inv.currency,
        due_date: inv.due_date,
        days_overdue: daysOverdue(inv.due_date),
        aging_label: AGING_LABELS[agingBucket(inv.due_date)],
        last_follow_up: lastNoteByInvoice.get(inv.id) ?? null,
      }));
    // Sent / partially-paid invoices with NO due date silently escape overdue
    // detection — surface them so the accountant can set a due date.
    noDueDate = all
      .filter(
        (i) => !i.due_date && (i.status === "sent" || i.status === "partially_paid"),
      )
      .map((i) => ({ id: i.id, invoice_number: i.invoice_number }));
  }

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

      <SearchBox
        placeholder="ابحث برقم الفاتورة…"
        q={q}
        hidden={{ filter: filter === "all" ? undefined : filter }}
      />

      {aging ? <AgingSummary aging={aging} /> : null}

      {filter === "overdue" ? (
        <CollectionsWorklist rows={collectionRows} noDueDate={noDueDate} />
      ) : (
        <>
          <Card>
            <CardContent className="pt-6">
              <InvoicesTable invoices={invoices} />
            </CardContent>
          </Card>

          <Pager
            page={page}
            hasMore={hasMore}
            basePath="/invoices"
            params={{ q, filter: filter === "all" ? undefined : filter }}
          />
        </>
      )}
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
