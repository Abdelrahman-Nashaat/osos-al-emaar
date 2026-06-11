import { PrintLetterhead } from "@/components/print/letterhead";
import type { OfficeSettings } from "@/lib/office/settings";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/lib/finance/invoice";
import { formatMoney } from "@/lib/projects/money";
import { formatDateLong } from "@/lib/format/date";

export type PrintInvoice = {
  invoice_number: string;
  issue_date: string;
  due_date: string | null;
  subtotal: number;
  vat_rate: number;
  vat_amount: number;
  total: number;
  amount_paid: number;
  currency: string;
  description: string | null;
};

export type PrintPayment = {
  id: string;
  amount: number;
  paid_at: string;
  method: PaymentMethod;
  is_reversed: boolean;
};

/**
 * The client-facing printable invoice («فاتورة ضريبية مبسطة» with the ZATCA
 * Phase-1 QR when the office is VAT-registered, plain «فاتورة» otherwise).
 * Renders inside `hidden print:block` — the screen view stays the app UI.
 */
export function InvoicePrintDocument({
  office,
  invoice,
  clientName,
  clientAddress,
  projectName,
  payments,
  qrDataUrl,
}: {
  office: OfficeSettings;
  invoice: PrintInvoice;
  clientName: string;
  clientAddress: string | null;
  projectName: string;
  payments: PrintPayment[];
  qrDataUrl: string | null;
}) {
  const isTax = Boolean(office.vat_number);
  const due = Math.max(0, Math.round((invoice.total - invoice.amount_paid) * 100) / 100);
  const activePayments = payments.filter((p) => !p.is_reversed);

  return (
    <div className="hidden print:block">
      <div className="space-y-5 text-black">
        <PrintLetterhead office={office} />

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{isTax ? "فاتورة ضريبية مبسطة" : "فاتورة"}</h1>
            <p className="text-sm text-neutral-700" dir="ltr">
              {invoice.invoice_number}
            </p>
          </div>
          <div className="text-end text-sm leading-6">
            <p>تاريخ الإصدار: {formatDateLong(invoice.issue_date)}</p>
            {invoice.due_date ? <p>تاريخ الاستحقاق: {formatDateLong(invoice.due_date)}</p> : null}
          </div>
        </div>

        <div className="rounded border border-neutral-300 p-3 text-sm leading-6">
          <p>
            <span className="font-bold">العميل/</span> {clientName}
          </p>
          {clientAddress ? <p>{clientAddress}</p> : null}
          <p>
            <span className="font-bold">المشروع/</span> {projectName}
          </p>
        </div>

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-black">
              <th className="py-2 text-start">البيان</th>
              <th className="py-2 text-end">المبلغ ({invoice.currency === "SAR" ? "ر.س" : invoice.currency})</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-neutral-300 align-top">
              <td className="py-3">{invoice.description?.trim() || `أتعاب خدمات هندسية — ${projectName}`}</td>
              <td className="py-3 text-end" dir="ltr">
                {formatMoney(invoice.subtotal, invoice.currency)}
              </td>
            </tr>
            <tr className="border-b border-neutral-300">
              <td className="py-2">ضريبة القيمة المضافة ({invoice.vat_rate}%)</td>
              <td className="py-2 text-end" dir="ltr">
                {formatMoney(invoice.vat_amount, invoice.currency)}
              </td>
            </tr>
            <tr className="border-b border-neutral-300 font-bold">
              <td className="py-2">الإجمالي شامل الضريبة</td>
              <td className="py-2 text-end" dir="ltr">
                {formatMoney(invoice.total, invoice.currency)}
              </td>
            </tr>
            {invoice.amount_paid > 0 ? (
              <>
                <tr className="border-b border-neutral-300">
                  <td className="py-2">المدفوع</td>
                  <td className="py-2 text-end" dir="ltr">
                    {formatMoney(invoice.amount_paid, invoice.currency)}
                  </td>
                </tr>
                <tr className="font-bold">
                  <td className="py-2">المتبقّي</td>
                  <td className="py-2 text-end" dir="ltr">
                    {formatMoney(due, invoice.currency)}
                  </td>
                </tr>
              </>
            ) : null}
          </tbody>
        </table>

        {activePayments.length > 0 ? (
          <div className="text-sm">
            <p className="mb-1 font-bold">الدفعات المستلمة:</p>
            <ul className="space-y-0.5 text-neutral-700">
              {activePayments.map((p) => (
                <li key={p.id}>
                  {formatDateLong(p.paid_at)} — {formatMoney(p.amount, invoice.currency)} (
                  {PAYMENT_METHOD_LABELS[p.method]})
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex items-end justify-between gap-4 pt-2">
          <div className="max-w-[70%] text-sm leading-6 text-neutral-700">
            {office.invoice_footer ? <p>{office.invoice_footer}</p> : null}
            <p className="mt-6 font-bold text-black">{office.office_name}</p>
            <p className="mt-8 border-t border-neutral-400 pt-1 text-neutral-600">التوقيع والختم</p>
          </div>
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URL for print
            <img src={qrDataUrl} alt="رمز الفاتورة (ZATCA QR)" className="size-32" />
          ) : null}
        </div>
      </div>
    </div>
  );
}
