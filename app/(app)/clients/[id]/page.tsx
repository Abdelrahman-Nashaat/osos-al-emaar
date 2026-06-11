import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { getEffectivePermissions, getSessionProfile } from "@/lib/auth/permissions";
import { can } from "@/lib/auth/permission-keys";
import { createClient } from "@/lib/supabase/server";
import { must } from "@/lib/supabase/fetch";
import { formatMoney } from "@/lib/projects/money";
import { formatDate, countryLabel } from "@/lib/format/date";
import { isIssued, outstanding, INVOICE_STATUS_LABELS } from "@/lib/finance/invoice";
import { PROJECT_STATUS_LABELS } from "@/lib/projects/status";
import { PermissionDenied } from "@/components/permission-denied";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PrintButton } from "../../invoices/print-button";

function Field({ label, value, ltr }: { label: string; value: React.ReactNode; ltr?: boolean }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium" dir={ltr ? "ltr" : undefined}>
        {value}
      </p>
    </div>
  );
}

type StatementRow = {
  key: string;
  date: string;
  label: string;
  href: string;
  debit: number | null; // invoice totals (مستحق)
  credit: number | null; // payments (مدفوع)
};

/**
 * «بطاقة العميل» — contact info + projects, and for financial roles the client
 * statement (كشف حساب): issued invoices vs. payments with a running balance —
 * the accountant's daily collection view. clients.view gate (manager+accountant;
 * engineers never reach the clients module).
 */
export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  const perms = await getEffectivePermissions();
  if (!can(perms, "clients.view")) return <PermissionDenied />;
  const seesFinance = can(perms, "financials.view");
  const seesProjects = can(perms, "projects.view");

  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const supabase = await createClient();
  const { data: client, error } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error("fetch_failed: client.detail");
  if (!client) notFound();

  const [projects, invoices, payments] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, status, progress, due_date")
      .eq("client_id", id)
      .order("created_at", { ascending: false })
      .then(({ data }) => data ?? []),
    seesFinance
      ? must(
          "client.invoices",
          supabase
            .from("invoices")
            .select("id, invoice_number, status, issue_date, total, amount_paid, due_date")
            .eq("client_id", id)
            .order("issue_date", { ascending: true }),
        )
      : Promise.resolve([]),
    seesFinance
      ? must(
          "client.payments",
          supabase
            .from("payments")
            .select("id, invoice_id, amount, paid_at, is_reversed")
            .eq("is_reversed", false),
        )
      : Promise.resolve([]),
  ]);

  // Statement: issued invoices (debit) + their non-reversed payments (credit).
  const issued = invoices.filter((i) => isIssued(i.status));
  const invoiceIds = new Set(issued.map((i) => i.id));
  const numberById = new Map(issued.map((i) => [i.id, i.invoice_number]));
  const rows: StatementRow[] = [
    ...issued.map((i) => ({
      key: `inv-${i.id}`,
      date: i.issue_date,
      label: `فاتورة ${i.invoice_number}`,
      href: `/invoices/${i.id}`,
      debit: i.total,
      credit: null,
    })),
    ...payments
      .filter((p) => invoiceIds.has(p.invoice_id))
      .map((p) => ({
        key: `pay-${p.id}`,
        date: p.paid_at,
        label: `دفعة على ${numberById.get(p.invoice_id) ?? "فاتورة"}`,
        href: `/invoices/${p.invoice_id}`,
        debit: null,
        credit: p.amount,
      })),
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.key.localeCompare(b.key)));

  const statement = rows.reduce<(StatementRow & { balance: number })[]>((acc, r) => {
    const prev = acc.length > 0 ? acc[acc.length - 1].balance : 0;
    const balance = Math.round((prev + (r.debit ?? 0) - (r.credit ?? 0)) * 100) / 100;
    acc.push({ ...r, balance });
    return acc;
  }, []);
  const totalInvoiced = issued.reduce((n, i) => n + i.total, 0);
  const totalPaid = issued.reduce((n, i) => n + i.amount_paid, 0);
  const totalDue = issued.reduce((n, i) => n + outstanding(i.total, i.amount_paid), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div className="space-y-1">
          <Link href="/clients" className="text-sm text-muted-foreground hover:underline">
            → العملاء
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">{client.name}</h1>
          {client.company && client.company !== client.name ? (
            <p className="text-sm text-muted-foreground">{client.company}</p>
          ) : null}
        </div>
        {seesFinance ? <PrintButton label="طباعة كشف الحساب" /> : null}
      </div>

      <Card className="print:hidden">
        <CardHeader>
          <CardTitle className="text-base">بيانات التواصل</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="الجوال" value={client.phone ?? "—"} ltr />
          <Field label="البريد" value={client.email ?? "—"} ltr />
          <Field label="الدولة" value={countryLabel(client.country)} />
          <Field label="العنوان" value={client.address ?? "—"} />
          {client.notes ? (
            <div className="space-y-1 sm:col-span-2 lg:col-span-3">
              <p className="text-xs text-muted-foreground">ملاحظات</p>
              <p className="whitespace-pre-wrap text-sm">{client.notes}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="print:hidden">
        <CardHeader>
          <CardTitle className="text-base">المشاريع ({projects.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجد مشاريع لهذا العميل بعد.</p>
          ) : (
            <ul className="divide-y divide-border">
              {projects.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                  {seesProjects || seesFinance ? (
                    <Link href={`/projects/${p.id}`} className="min-w-0 truncate text-sm font-medium hover:underline">
                      {p.name}
                    </Link>
                  ) : (
                    <span className="min-w-0 truncate text-sm font-medium">{p.name}</span>
                  )}
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {PROJECT_STATUS_LABELS[p.status]} · {p.progress}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {seesFinance ? (
        <>
          <Card className="print:hidden">
            <CardHeader>
              <CardTitle className="text-base">الملخص المالي</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">إجمالي الفواتير (الصادرة)</p>
                <p className="mt-1 font-semibold tabular-nums">{formatMoney(totalInvoiced)}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">المُحصّل</p>
                <p className="mt-1 font-semibold tabular-nums">{formatMoney(totalPaid)}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">المتبقّي</p>
                <p
                  className={
                    totalDue > 0
                      ? "mt-1 font-semibold tabular-nums text-red-600 dark:text-red-400"
                      : "mt-1 font-semibold tabular-nums"
                  }
                >
                  {formatMoney(totalDue)}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* كشف الحساب — screen + print (the print header carries the client name). */}
          <Card>
            <CardHeader className="print:hidden">
              <CardTitle className="text-base">كشف الحساب</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="hidden print:block">
                <h1 className="text-xl font-bold">كشف حساب — {client.name}</h1>
                <p className="mb-4 text-sm text-neutral-600">
                  حتى {formatDate(new Date())} · المتبقّي: {formatMoney(totalDue)}
                </p>
              </div>
              {statement.length === 0 ? (
                <p className="text-sm text-muted-foreground print:hidden">
                  لا توجد فواتير صادرة لهذا العميل بعد.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs text-muted-foreground">
                        <th className="py-2 text-start font-medium">التاريخ</th>
                        <th className="py-2 text-start font-medium">البيان</th>
                        <th className="py-2 text-end font-medium">مستحق</th>
                        <th className="py-2 text-end font-medium">مدفوع</th>
                        <th className="py-2 text-end font-medium">الرصيد</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statement.map((r) => (
                        <tr key={r.key} className="border-b border-border/60">
                          <td className="py-2 tabular-nums">{formatDate(r.date)}</td>
                          <td className="py-2">
                            <Link href={r.href} className="hover:underline print:no-underline">
                              {r.label}
                            </Link>
                          </td>
                          <td className="py-2 text-end tabular-nums" dir="ltr">
                            {r.debit != null ? formatMoney(r.debit) : "—"}
                          </td>
                          <td className="py-2 text-end tabular-nums" dir="ltr">
                            {r.credit != null ? formatMoney(r.credit) : "—"}
                          </td>
                          <td className="py-2 text-end font-medium tabular-nums" dir="ltr">
                            {formatMoney(r.balance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="print:hidden">
            <CardHeader>
              <CardTitle className="text-base">الفواتير ({invoices.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {invoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">لا توجد فواتير.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {invoices.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                      <Link href={`/invoices/${i.id}`} className="font-medium hover:underline" dir="ltr">
                        {i.invoice_number}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {INVOICE_STATUS_LABELS[i.status]} · {formatDate(i.issue_date)}
                      </span>
                      <span className="tabular-nums" dir="ltr">
                        {formatMoney(i.total)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
