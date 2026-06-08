import { INVOICE_EVENT_LABELS, type InvoiceEventType } from "@/lib/finance/invoice";
import { formatMoney } from "@/lib/projects/money";

export type InvoiceTimelineItem = {
  id: number;
  event_type: InvoiceEventType;
  created_at: string;
  note: string | null;
  actor_name: string | null;
  amount: number | null;
};

// Arabic month names with Latin digits + a Gregorian calendar (matches the rest of
// the app, e.g. due dates and the task timeline).
const dateFmt = new Intl.DateTimeFormat("ar-u-nu-latn", {
  calendar: "gregory",
  dateStyle: "medium",
  timeStyle: "short",
});

/** Append-only invoice history (newest first). */
export function InvoiceTimeline({
  items,
  currency = "SAR",
}: {
  items: InvoiceTimelineItem[];
  currency?: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">لا يوجد سجل بعد.</p>;
  }

  return (
    <ol className="space-y-4">
      {items.map((e) => (
        <li key={e.id} className="relative ps-5">
          <span
            className="absolute start-0 top-1.5 size-2 rounded-full bg-primary"
            aria-hidden
          />
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-sm font-medium">{INVOICE_EVENT_LABELS[e.event_type]}</span>
            {e.actor_name ? (
              <span className="text-xs text-muted-foreground">بواسطة {e.actor_name}</span>
            ) : null}
            <span className="text-xs text-muted-foreground" dir="ltr">
              {dateFmt.format(new Date(e.created_at))}
            </span>
          </div>
          {(e.event_type === "payment" || e.event_type === "payment_reversed") &&
          e.amount != null ? (
            <div className="mt-0.5 text-sm tabular-nums">{formatMoney(e.amount, currency)}</div>
          ) : null}
          {e.note ? (
            <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground">{e.note}</p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
