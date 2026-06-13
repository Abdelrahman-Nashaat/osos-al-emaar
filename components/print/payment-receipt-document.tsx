import { PrintLetterhead } from "@/components/print/letterhead";
import type { OfficeSettings } from "@/lib/office/settings";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/lib/finance/invoice";
import { formatMoney } from "@/lib/projects/money";
import { formatDateLong } from "@/lib/format/date";

/**
 * «سند قبض» — printable payment receipt voucher handed to a client when a
 * (partial) payment is collected. Finance-gated at the route; print-only.
 */
export function PaymentReceiptDocument({
  office,
  receiptNumber,
  clientName,
  projectName,
  invoiceNumber,
  amount,
  method,
  reference,
  paidAt,
  remainingAfter,
  currency,
}: {
  office: OfficeSettings;
  receiptNumber: string;
  clientName: string;
  projectName: string;
  invoiceNumber: string;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  paidAt: string;
  remainingAfter: number;
  currency: string;
}) {
  const ccy = currency === "SAR" ? "ر.س" : currency;
  return (
    <div className="mx-auto max-w-2xl space-y-5 p-6 text-black print:p-0">
      <PrintLetterhead office={office} />

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">سند قبض</h1>
          <p className="text-sm text-neutral-700" dir="ltr">
            {receiptNumber}
          </p>
        </div>
        <div className="text-end text-sm leading-6">
          <p>التاريخ: {formatDateLong(paidAt)}</p>
        </div>
      </div>

      <div className="rounded border border-neutral-300 p-4 text-sm leading-7">
        <p>
          <span className="font-bold">استلمنا من السادة/ </span>
          {clientName}
        </p>
        <p>
          <span className="font-bold">مبلغاً وقدره/ </span>
          <span className="font-bold" dir="ltr">
            {formatMoney(amount, currency)}
          </span>{" "}
          ({ccy})
        </p>
        <p>
          <span className="font-bold">طريقة الدفع/ </span>
          {PAYMENT_METHOD_LABELS[method]}
          {reference ? (
            <>
              {" "}
              — <span dir="ltr">{reference}</span>
            </>
          ) : null}
        </p>
        <p>
          <span className="font-bold">وذلك عن/ </span>
          دفعة من الفاتورة <span dir="ltr">{invoiceNumber}</span> — مشروع {projectName}
        </p>
        <p>
          <span className="font-bold">المتبقّي على الفاتورة بعد هذه الدفعة/ </span>
          <span dir="ltr">{formatMoney(remainingAfter, currency)}</span> ({ccy})
        </p>
      </div>

      <div className="flex items-end justify-between gap-4 pt-10">
        <div className="text-sm text-neutral-600">
          <p className="border-t border-neutral-400 pt-1">توقيع المستلِم</p>
        </div>
        <div className="text-sm text-neutral-600">
          <p className="font-bold text-black">{office.office_name}</p>
          <p className="mt-8 border-t border-neutral-400 pt-1">التوقيع والختم</p>
        </div>
      </div>
    </div>
  );
}
