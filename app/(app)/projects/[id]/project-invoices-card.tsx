import Link from "next/link";
import { Plus } from "lucide-react";
import { isInvoiceOverdue, outstanding, type InvoiceStatus } from "@/lib/finance/invoice";
import { formatMoney } from "@/lib/projects/money";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InvoiceStatusBadge } from "@/app/(app)/invoices/invoice-status-badge";
import { InvoiceFormDialog } from "@/app/(app)/invoices/invoice-form";

type Row = {
  id: string;
  invoice_number: string;
  total: number;
  amount_paid: number;
  status: InvoiceStatus;
  due_date: string | null;
  currency: string;
};

/**
 * Invoices for one project, shown inside the project detail page. Rendered ONLY in
 * the showFinancials branch (manager + accountant) — engineers never reach it.
 */
export function ProjectInvoicesCard({
  projectId,
  projectName,
  invoices,
}: {
  projectId: string;
  projectName: string;
  invoices: Row[];
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">فواتير المشروع</CardTitle>
        <InvoiceFormDialog
          projects={[{ id: projectId, name: projectName }]}
          lockedProjectId={projectId}
          trigger={
            <Button variant="outline" size="sm">
              <Plus className="size-4" />
              فاتورة
            </Button>
          }
        />
      </CardHeader>
      <CardContent>
        {invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد فواتير لهذا المشروع بعد.</p>
        ) : (
          <ul className="space-y-2">
            {invoices.map((inv) => {
              const overdue = isInvoiceOverdue(inv.due_date, inv.status);
              return (
                <li key={inv.id}>
                  <Link
                    href={`/invoices/${inv.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 hover:bg-muted"
                  >
                    <span className="flex items-center gap-2 text-sm">
                      <InvoiceStatusBadge status={inv.status} />
                      <span className="font-medium" dir="ltr">
                        {inv.invoice_number}
                      </span>
                    </span>
                    <span className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="tabular-nums">{formatMoney(inv.total, inv.currency)}</span>
                      <span className="tabular-nums">
                        المتبقّي {formatMoney(outstanding(inv.total, inv.amount_paid), inv.currency)}
                      </span>
                      {inv.due_date ? (
                        <span
                          className={cn(
                            "tabular-nums",
                            overdue ? "font-medium text-red-600 dark:text-red-400" : "",
                          )}
                          dir="ltr"
                        >
                          {inv.due_date.slice(0, 10)}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
