import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { getEffectivePermissions, getSessionProfile } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/auth/permission-keys";
import { isInvoiceOverdue, nextInvoiceActions, outstanding } from "@/lib/finance/invoice";
import { formatMoney } from "@/lib/projects/money";
import { formatDate } from "@/lib/format/date";
import { getOfficeSettings } from "@/lib/office/settings";
import { buildZatcaTlvBase64 } from "@/lib/zatca/qr";
import { fetchAttachments } from "@/lib/attachments/list";
import { cn } from "@/lib/utils";
import { PermissionDenied } from "@/components/permission-denied";
import { AttachmentsCard } from "@/components/attachments-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InvoiceStatusBadge } from "../invoice-status-badge";
import { InvoiceActions } from "../invoice-actions";
import { PaymentsList, type PaymentRow } from "../payments-list";
import { InvoiceTimeline, type InvoiceTimelineItem } from "../invoice-timeline";
import { PrintButton } from "../print-button";
import { InvoicePrintDocument } from "./invoice-print-document";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await getSessionProfile();
  if (!session) redirect("/login");
  const perms = await getEffectivePermissions();
  if (!can(perms, "financials.view")) return <PermissionDenied />;

  const isManager = session.profile.role === "manager";
  const canViewProject = can(perms, "projects.view");

  const supabase = await createClient();
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select(
      "id, invoice_number, project_id, client_id, status, issue_date, due_date, subtotal, vat_rate, vat_amount, total, amount_paid, currency, description, created_at",
    )
    .eq("id", id)
    .single();
  // PGRST116 = zero rows → true 404; any other failure surfaces in error.tsx (B4).
  if (invoiceError && invoiceError.code !== "PGRST116") {
    throw new Error(`fetch_failed: invoice ${invoiceError.message}`);
  }
  if (!invoice) notFound();

  const [
    { data: client },
    { data: project },
    { data: payments },
    { data: events },
    { data: directory },
    office,
    attachments,
  ] = await Promise.all([
    supabase.from("clients").select("id, name, address").eq("id", invoice.client_id).maybeSingle(),
    supabase.from("projects").select("id, name").eq("id", invoice.project_id).maybeSingle(),
    supabase
      .from("payments")
      .select("id, amount, paid_at, method, reference, recorded_by, is_reversed, reversal_note")
      .eq("invoice_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("invoice_events")
      .select("id, event_type, created_at, note, actor_id, amount")
      .eq("invoice_id", id)
      .order("created_at", { ascending: false }),
    supabase.rpc("team_directory"),
    getOfficeSettings(),
    fetchAttachments("invoice", id),
  ]);
  const nameById = new Map((directory ?? []).map((p) => [p.id, p.full_name] as const));

  const actions = nextInvoiceActions(invoice.status, { isManager });
  const overdue = isInvoiceOverdue(invoice.due_date, invoice.status);
  const due = outstanding(invoice.total, invoice.amount_paid);

  // ZATCA Phase-1 QR — only when the office is VAT-registered (إعدادات المكتب).
  let qrDataUrl: string | null = null;
  if (office.vat_number) {
    const payload = buildZatcaTlvBase64({
      sellerName: office.office_name,
      vatNumber: office.vat_number,
      timestamp: invoice.created_at,
      total: invoice.total,
      vatAmount: invoice.vat_amount,
    });
    qrDataUrl = await QRCode.toDataURL(payload, { margin: 1, width: 256 });
  }

  const paymentRows: PaymentRow[] = (payments ?? []).map((p) => ({
    id: p.id,
    amount: p.amount,
    paid_at: p.paid_at,
    method: p.method,
    reference: p.reference,
    recorded_by_name: p.recorded_by ? (nameById.get(p.recorded_by) ?? null) : null,
    is_reversed: p.is_reversed,
    reversal_note: p.reversal_note,
  }));

  const timeline: InvoiceTimelineItem[] = (events ?? []).map((e) => ({
    id: e.id,
    event_type: e.event_type,
    created_at: e.created_at,
    note: e.note,
    actor_name: e.actor_id ? (nameById.get(e.actor_id) ?? null) : null,
    amount: e.amount,
  }));

  return (
    <div className="space-y-6">
      {/* The screen UI hides in print; the letterhead document below replaces it. */}
      <div className="space-y-6 print:hidden">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Link href="/invoices" className="no-print text-sm text-muted-foreground hover:underline">
            → الفواتير
          </Link>
          <h1 className="text-2xl font-bold tracking-tight" dir="ltr">
            {invoice.invoice_number}
          </h1>
          <div className="flex items-center gap-2">
            <InvoiceStatusBadge status={invoice.status} />
          </div>
        </div>
        <PrintButton />
      </div>

      {/* Actions */}
      <Card className="no-print">
        <CardHeader>
          <CardTitle className="text-base">الإجراءات</CardTitle>
        </CardHeader>
        <CardContent>
          <InvoiceActions
            invoiceId={invoice.id}
            projectId={invoice.project_id}
            projectName={project?.name ?? ""}
            actions={actions}
            editData={{
              subtotal: invoice.subtotal,
              vat_rate: invoice.vat_rate,
              due_date: invoice.due_date,
              description: invoice.description,
            }}
          />
        </CardContent>
      </Card>

      {/* Amounts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">المبالغ</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="المبلغ قبل الضريبة" value={formatMoney(invoice.subtotal, invoice.currency)} />
          <Stat
            label={`الضريبة (${invoice.vat_rate}%)`}
            value={formatMoney(invoice.vat_amount, invoice.currency)}
          />
          <Stat label="الإجمالي" value={formatMoney(invoice.total, invoice.currency)} />
          <Stat label="المتبقّي" value={formatMoney(due, invoice.currency)} highlight={due > 0} />
        </CardContent>
      </Card>

      {/* Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">التفاصيل</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="العميل" value={client?.name ?? "—"} />
          <Field
            label="المشروع"
            value={
              project ? (
                canViewProject ? (
                  <Link href={`/projects/${project.id}`} className="hover:underline">
                    {project.name}
                  </Link>
                ) : (
                  project.name
                )
              ) : (
                "—"
              )
            }
          />
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">تاريخ الإصدار</div>
            <div className="text-sm tabular-nums">{formatDate(invoice.issue_date)}</div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">تاريخ الاستحقاق</div>
            <div
              className={cn(
                "text-sm tabular-nums",
                overdue ? "font-medium text-red-600 dark:text-red-400" : "",
              )}
            >
              {formatDate(invoice.due_date)}
              {overdue ? <span className="ms-1">(متأخرة)</span> : null}
            </div>
          </div>
          {invoice.description ? (
            <div className="space-y-1 sm:col-span-2">
              <div className="text-xs text-muted-foreground">البيان</div>
              <p className="text-sm whitespace-pre-wrap">{invoice.description}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Payments */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">الدفعات</CardTitle>
        </CardHeader>
        <CardContent>
          <PaymentsList
            payments={paymentRows}
            invoiceId={invoice.id}
            projectId={invoice.project_id}
            currency={invoice.currency}
            canReverse={isManager}
          />
        </CardContent>
      </Card>

      <AttachmentsCard
        entityType="invoice"
        entityId={invoice.id}
        items={attachments}
        canUpload={true}
        currentUserId={session.userId}
        isManager={isManager}
      />

      {/* History timeline */}
      <Card className="no-print">
        <CardHeader>
          <CardTitle className="text-base">السجل</CardTitle>
        </CardHeader>
        <CardContent>
          <InvoiceTimeline items={timeline} currency={invoice.currency} />
        </CardContent>
      </Card>
      </div>

      <InvoicePrintDocument
        office={office}
        invoice={invoice}
        clientName={client?.name ?? "—"}
        clientAddress={client?.address ?? null}
        projectName={project?.name ?? "—"}
        payments={paymentRows.map((p) => ({
          id: p.id,
          amount: p.amount,
          paid_at: p.paid_at,
          method: p.method,
          is_reversed: p.is_reversed,
        }))}
        qrDataUrl={qrDataUrl}
      />
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

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}
