import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getEffectivePermissions, getSessionProfile } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/auth/permission-keys";
import { getOfficeSettings } from "@/lib/office/settings";
import { PermissionDenied } from "@/components/permission-denied";
import { PaymentReceiptDocument } from "@/components/print/payment-receipt-document";
import { PrintButton } from "../../../print-button";

/**
 * Re-printable «سند قبض» for one payment. Finance-gated (financials.view); all
 * rows are RLS-scoped so engineers reach 0 rows even by URL. The remaining
 * balance is computed as of THIS payment (sum of non-reversed payments up to
 * and including it), so a receipt printed later still reflects that moment.
 */
export default async function PaymentReceiptPage({
  params,
}: {
  params: Promise<{ id: string; paymentId: string }>;
}) {
  const { id, paymentId } = await params;

  const session = await getSessionProfile();
  if (!session) redirect("/login");
  const perms = await getEffectivePermissions();
  if (!can(perms, "financials.view")) return <PermissionDenied />;

  const supabase = await createClient();
  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select("id, invoice_number, project_id, client_id, total, currency")
    .eq("id", id)
    .single();
  if (invErr && invErr.code !== "PGRST116") {
    throw new Error(`fetch_failed: invoice ${invErr.message}`);
  }
  if (!invoice) notFound();

  const [{ data: payment }, { data: allPayments }, { data: client }, { data: project }, office] =
    await Promise.all([
      supabase
        .from("payments")
        .select("id, amount, paid_at, method, reference, is_reversed, created_at")
        .eq("id", paymentId)
        .eq("invoice_id", id)
        .maybeSingle(),
      supabase
        .from("payments")
        .select("amount, paid_at, is_reversed, created_at")
        .eq("invoice_id", id)
        .order("created_at", { ascending: true }),
      supabase.from("clients").select("name").eq("id", invoice.client_id).maybeSingle(),
      supabase.from("projects").select("name").eq("id", invoice.project_id).maybeSingle(),
      getOfficeSettings(),
    ]);

  // A reversed payment is void — it must have no printable receipt by any path.
  if (!payment || payment.is_reversed) notFound();

  // Paid total up to and including this payment (non-reversed only).
  const ordered = allPayments ?? [];
  const idx = ordered.findIndex(
    (p) => p.created_at === payment.created_at && p.amount === payment.amount,
  );
  const paidThrough = ordered
    .slice(0, idx < 0 ? ordered.length : idx + 1)
    .filter((p) => !p.is_reversed)
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const remainingAfter = Math.max(0, Math.round((invoice.total - paidThrough) * 100) / 100);
  const seq = (idx < 0 ? ordered.length : idx + 1).toString().padStart(2, "0");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 no-print">
        <Link href={`/invoices/${id}`} className="text-sm text-muted-foreground hover:underline">
          → الفاتورة
        </Link>
        <PrintButton label="طباعة سند القبض" />
      </div>

      <div className="rounded-lg border border-border bg-white text-black print:border-0">
        <PaymentReceiptDocument
          office={office}
          receiptNumber={`${invoice.invoice_number}/R${seq}`}
          clientName={client?.name ?? "—"}
          projectName={project?.name ?? "—"}
          invoiceNumber={invoice.invoice_number}
          amount={payment.amount}
          method={payment.method}
          reference={payment.reference}
          paidAt={payment.paid_at}
          remainingAfter={remainingAfter}
          currency={invoice.currency}
        />
      </div>
    </div>
  );
}
