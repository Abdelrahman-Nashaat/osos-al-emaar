import { cn } from "@/lib/utils";
import { OFFER_STATUS_BADGE, OFFER_STATUS_LABELS, type OfferStatus } from "@/lib/offers/offer";

export function OfferStatusBadge({
  status,
  className,
}: {
  status: OfferStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        OFFER_STATUS_BADGE[status],
        className,
      )}
    >
      {OFFER_STATUS_LABELS[status]}
    </span>
  );
}
