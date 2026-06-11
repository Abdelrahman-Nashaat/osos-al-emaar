import Link from "next/link";
import { formatMoney } from "@/lib/projects/money";
import { formatDate } from "@/lib/format/date";
import { isOfferStale, type OfferStatus } from "@/lib/offers/offer";
import { OfferStatusBadge } from "./offer-status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type OfferListRow = {
  id: string;
  offer_number: string;
  title: string;
  status: OfferStatus;
  total: number;
  valid_until: string | null;
  issue_date: string;
  client_name: string;
  converted: boolean;
};

/** Desktop table ≥md + stacked cards <md (house responsive pattern). */
export function OffersTable({ offers }: { offers: OfferListRow[] }) {
  if (offers.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">لا توجد عروض مطابقة.</p>;
  }

  return (
    <>
      {/* Desktop */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>العرض</TableHead>
              <TableHead>العميل</TableHead>
              <TableHead>الموضوع</TableHead>
              <TableHead>الإجمالي</TableHead>
              <TableHead>الحالة</TableHead>
              <TableHead>صالح حتى</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {offers.map((o) => {
              const stale = isOfferStale(o.status, o.valid_until);
              return (
                <TableRow key={o.id}>
                  <TableCell className="font-medium" dir="ltr">
                    <Link href={`/offers/${o.id}`} className="hover:underline">
                      {o.offer_number}
                    </Link>
                  </TableCell>
                  <TableCell>{o.client_name}</TableCell>
                  <TableCell className="max-w-56 truncate">{o.title}</TableCell>
                  <TableCell dir="ltr">{formatMoney(o.total)}</TableCell>
                  <TableCell>
                    <OfferStatusBadge status={o.status} />
                    {o.converted ? (
                      <span className="ms-1 text-xs text-muted-foreground">(مشروع)</span>
                    ) : null}
                  </TableCell>
                  <TableCell className={stale ? "font-medium text-destructive" : ""}>
                    {formatDate(o.valid_until)}
                    {stale ? " (تجاوز الصلاحية)" : ""}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile stacked cards */}
      <ul className="space-y-3 md:hidden">
        {offers.map((o) => {
          const stale = isOfferStale(o.status, o.valid_until);
          return (
            <li key={o.id}>
              <Link
                href={`/offers/${o.id}`}
                className="flex flex-col gap-2 rounded-lg border border-border p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium" dir="ltr">
                    {o.offer_number}
                  </span>
                  <OfferStatusBadge status={o.status} />
                </div>
                <p className="text-sm">{o.title}</p>
                <p className="text-sm text-muted-foreground">{o.client_name}</p>
                <div className="flex items-center justify-between text-sm">
                  <span dir="ltr">{formatMoney(o.total)}</span>
                  <span className={stale ? "font-medium text-destructive" : "text-muted-foreground"}>
                    {formatDate(o.valid_until)}
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
