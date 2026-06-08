import Link from "next/link";
import { cn } from "@/lib/utils";
import { isInvoiceOverdue, outstanding, type InvoiceStatus } from "@/lib/finance/invoice";
import { formatMoney } from "@/lib/projects/money";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InvoiceStatusBadge } from "./invoice-status-badge";

export type InvoiceListItem = {
  id: string;
  invoice_number: string;
  client_name: string | null;
  project_name: string | null;
  total: number;
  amount_paid: number;
  status: InvoiceStatus;
  due_date: string | null;
  currency: string;
};

export function InvoicesTable({ invoices }: { invoices: InvoiceListItem[] }) {
  if (invoices.length === 0) {
    return (
      <p className="rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">
        لا توجد فواتير مطابقة.
      </p>
    );
  }

  return (
    <>
      {/* Desktop: table */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>الفاتورة</TableHead>
              <TableHead>العميل</TableHead>
              <TableHead>المشروع</TableHead>
              <TableHead>الإجمالي</TableHead>
              <TableHead>مدفوع</TableHead>
              <TableHead>المتبقّي</TableHead>
              <TableHead>الحالة</TableHead>
              <TableHead>الاستحقاق</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell className="font-medium">
                  <Link href={`/invoices/${inv.id}`} className="hover:underline" dir="ltr">
                    {inv.invoice_number}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{inv.client_name ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{inv.project_name ?? "—"}</TableCell>
                <TableCell className="tabular-nums">{formatMoney(inv.total, inv.currency)}</TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {formatMoney(inv.amount_paid, inv.currency)}
                </TableCell>
                <TableCell className="tabular-nums font-medium">
                  {formatMoney(outstanding(inv.total, inv.amount_paid), inv.currency)}
                </TableCell>
                <TableCell>
                  <InvoiceStatusBadge status={inv.status} />
                </TableCell>
                <TableCell>
                  <DueDate due={inv.due_date} status={inv.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile: stacked cards (no horizontal scroll) */}
      <div className="space-y-3 md:hidden">
        {invoices.map((inv) => (
          <Link
            key={inv.id}
            href={`/invoices/${inv.id}`}
            className="flex flex-col gap-3 rounded-lg border border-border p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="font-medium" dir="ltr">
                {inv.invoice_number}
              </div>
              <InvoiceStatusBadge status={inv.status} />
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              {inv.client_name ? <span>{inv.client_name}</span> : null}
              {inv.project_name ? <span>• {inv.project_name}</span> : null}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="tabular-nums">{formatMoney(inv.total, inv.currency)}</span>
              <span className="text-muted-foreground">
                المتبقّي:{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {formatMoney(outstanding(inv.total, inv.amount_paid), inv.currency)}
                </span>
              </span>
            </div>
            <DueDate due={inv.due_date} status={inv.status} />
          </Link>
        ))}
      </div>
    </>
  );
}

function DueDate({ due, status }: { due: string | null; status: InvoiceStatus }) {
  if (!due) return <span className="text-sm text-muted-foreground">—</span>;
  const overdue = isInvoiceOverdue(due, status);
  return (
    <span
      className={cn(
        "text-sm tabular-nums",
        overdue ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground",
      )}
      dir="ltr"
    >
      <span className="inline-block">{due.slice(0, 10)}</span>
      {overdue ? <span className="ms-1">(متأخرة)</span> : null}
    </span>
  );
}
