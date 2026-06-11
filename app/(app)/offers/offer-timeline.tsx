import { formatDateTime } from "@/lib/format/date";
import { formatMoney } from "@/lib/projects/money";
import { OFFER_EVENT_LABELS, type OfferEventType } from "@/lib/offers/offer";

export type OfferEventItem = {
  id: number;
  event_type: OfferEventType;
  amount: number | null;
  note: string | null;
  created_at: string;
  actor_name: string | null;
};

/** Append-only offer history (financial surface — manager + accountant only). */
export function OfferTimeline({ events }: { events: OfferEventItem[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">لا توجد أحداث بعد.</p>;
  }
  return (
    <ol className="space-y-3">
      {events.map((e) => (
        <li key={e.id} className="flex gap-3">
          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary/60" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm">
              <span className="font-medium">{OFFER_EVENT_LABELS[e.event_type]}</span>
              {e.amount != null && (e.event_type === "created" || e.event_type === "updated") ? (
                <span className="text-muted-foreground"> — {formatMoney(e.amount)}</span>
              ) : null}
            </p>
            {e.note ? (
              <p className="text-sm text-muted-foreground" dir="auto">
                {e.note}
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {e.actor_name ? `بواسطة ${e.actor_name} · ` : ""}
              {formatDateTime(e.created_at)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
