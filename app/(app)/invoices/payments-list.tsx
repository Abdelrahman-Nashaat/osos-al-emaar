"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ReceiptText, Undo2 } from "lucide-react";
import { useActionResult } from "@/components/use-action-result";
import { reversePayment } from "./actions";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/lib/finance/invoice";
import { formatMoney } from "@/lib/projects/money";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export type PaymentRow = {
  id: string;
  amount: number;
  paid_at: string;
  method: PaymentMethod;
  reference: string | null;
  recorded_by_name: string | null;
  is_reversed: boolean;
  reversal_note: string | null;
};

/**
 * Payments for one invoice. A reversed payment stays visible (struck-through with a
 * «معكوسة» badge) and is excluded from the paid total — it is never deleted.
 * `canReverse` (manager) shows a non-destructive reverse action on live payments.
 */
export function PaymentsList({
  payments,
  invoiceId,
  projectId,
  currency = "SAR",
  canReverse,
}: {
  payments: PaymentRow[];
  invoiceId: string;
  projectId: string;
  currency?: string;
  canReverse: boolean;
}) {
  if (payments.length === 0) {
    return <p className="text-sm text-muted-foreground">لا توجد دفعات بعد.</p>;
  }

  return (
    <ul className="space-y-2">
      {payments.map((p) => (
        <li
          key={p.id}
          className={cn("rounded-md border border-border px-3 py-2", p.is_reversed ? "opacity-70" : "")}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "text-sm font-medium tabular-nums",
                  p.is_reversed ? "line-through" : "",
                )}
              >
                {formatMoney(p.amount, currency)}
              </span>
              <span className="text-xs text-muted-foreground">{PAYMENT_METHOD_LABELS[p.method]}</span>
              {p.is_reversed ? (
                <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                  معكوسة
                </span>
              ) : null}
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span dir="ltr" className="tabular-nums">
                {p.paid_at.slice(0, 10)}
              </span>
              {p.reference ? (
                <span dir="ltr" className="truncate">
                  {p.reference}
                </span>
              ) : null}
              {p.recorded_by_name ? <span>{p.recorded_by_name}</span> : null}
              {!p.is_reversed ? (
                <Link
                  href={`/invoices/${invoiceId}/receipt/${p.id}`}
                  className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-xs hover:bg-muted hover:text-foreground"
                  title="طباعة سند قبض"
                >
                  <ReceiptText className="size-3.5" />
                  سند قبض
                </Link>
              ) : null}
              {canReverse && !p.is_reversed ? (
                <ReverseDialog paymentId={p.id} invoiceId={invoiceId} projectId={projectId} />
              ) : null}
            </div>
          </div>
          {p.is_reversed && p.reversal_note ? (
            <p className="mt-1 text-xs text-muted-foreground">سبب العكس: {p.reversal_note}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function ReverseDialog({
  paymentId,
  invoiceId,
  projectId,
}: {
  paymentId: string;
  invoiceId: string;
  projectId: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const onResult = useActionResult();
  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      if (onResult(await reversePayment(formData))) setOpen(false);
    });
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 text-destructive">
          <Undo2 className="size-3.5" />
          عكس
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>عكس الدفعة</DialogTitle>
          <DialogDescription>
            لن تُحذف الدفعة — ستبقى ظاهرة كدفعة معكوسة، وسيُعاد احتساب المتبقّي على الفاتورة.
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="grid gap-3">
          <input type="hidden" name="payment_id" value={paymentId} />
          <input type="hidden" name="invoice_id" value={invoiceId} />
          <input type="hidden" name="project_id" value={projectId} />
          <div className="space-y-2">
            <Label htmlFor="r-note">سبب العكس (اختياري)</Label>
            <Textarea id="r-note" name="note" rows={2} />
          </div>
          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "جارٍ التنفيذ…" : "عكس الدفعة"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
