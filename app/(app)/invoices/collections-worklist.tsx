"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CreditCard, MessageSquarePlus } from "lucide-react";
import { useActionResult } from "@/components/use-action-result";
import { recordPayment, addInvoiceNote } from "./actions";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/finance/invoice";
import { formatMoney } from "@/lib/projects/money";
import { formatDate } from "@/lib/format/date";
import { PhoneLinks } from "@/lib/format/contact";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export type CollectionRow = {
  id: string;
  invoice_number: string;
  project_id: string;
  client_name: string | null;
  client_phone: string | null;
  outstanding: number;
  currency: string;
  due_date: string | null;
  days_overdue: number;
  aging_label: string;
  last_follow_up: { date: string; note: string } | null;
};

/**
 * Collections worklist (التحصيل) — the accountant's age-ordered overdue queue.
 * Oldest debt first, client contact one tap away, last follow-up in view, and
 * record-payment / add-note without leaving the page. All finance-gated.
 */
export function CollectionsWorklist({
  rows,
  noDueDate,
}: {
  rows: CollectionRow[];
  noDueDate: { id: string; invoice_number: string }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">قائمة التحصيل ({rows.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد فواتير متأخرة. أحسنت 👍</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/invoices/${r.id}`}
                        className="text-sm font-medium hover:underline"
                        dir="ltr"
                      >
                        {r.invoice_number}
                      </Link>
                      <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                        {r.aging_label}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {r.client_name ?? "—"}
                      {r.client_phone ? (
                        <span className="ms-2 inline-flex align-middle">
                          <PhoneLinks phone={r.client_phone} />
                        </span>
                      ) : null}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      الاستحقاق: {formatDate(r.due_date)} · متأخرة {r.days_overdue} يوماً
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {r.last_follow_up ? (
                        <>
                          آخر متابعة: {formatDate(r.last_follow_up.date)} —{" "}
                          <span className="text-foreground/80">{r.last_follow_up.note}</span>
                        </>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400">لا توجد متابعة بعد</span>
                      )}
                    </div>
                  </div>
                  <div className="text-end">
                    <div className="text-base font-semibold tabular-nums" dir="ltr">
                      {formatMoney(r.outstanding, r.currency)}
                    </div>
                    <div className="text-xs text-muted-foreground">المتبقّي</div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <PaymentDialog invoiceId={r.id} projectId={r.project_id} />
                  <NoteDialog invoiceId={r.id} projectId={r.project_id} />
                </div>
              </li>
            ))}
          </ul>
        )}

        {noDueDate.length > 0 ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/40">
            <p className="font-medium text-amber-800 dark:text-amber-300">
              فواتير غير محددة تاريخ الاستحقاق ({noDueDate.length})
            </p>
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
              هذه الفواتير مُرسلة بلا تاريخ استحقاق، فلن تظهر ضمن المتأخرات. حدّد لها تاريخ استحقاق
              لمتابعتها في التحصيل.
            </p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {noDueDate.map((n) => (
                <li key={n.id}>
                  <Link
                    href={`/invoices/${n.id}`}
                    className="text-xs underline"
                    dir="ltr"
                  >
                    {n.invoice_number}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function PaymentDialog({ invoiceId, projectId }: { invoiceId: string; projectId: string }) {
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const onResult = useActionResult();
  const today = new Date().toISOString().slice(0, 10);
  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const res = await recordPayment(formData);
      if (onResult(res)) {
        setFormError(null);
        setOpen(false);
      } else {
        setFormError(res.error ?? null);
      }
    });
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setFormError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <CreditCard className="size-4" />
          تسجيل دفعة
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>تسجيل دفعة</DialogTitle>
          <DialogDescription>لا يمكن أن تتجاوز الدفعة المبلغ المتبقّي على الفاتورة.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} noValidate className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="invoice_id" value={invoiceId} />
          <input type="hidden" name="project_id" value={projectId} />
          <div className="space-y-2">
            <Label htmlFor={`wpay-amount-${invoiceId}`}>المبلغ (ر.س)</Label>
            <Input id={`wpay-amount-${invoiceId}`} name="amount" type="number" min={0} step="0.01" dir="ltr" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`wpay-method-${invoiceId}`}>طريقة الدفع</Label>
            <select id={`wpay-method-${invoiceId}`} name="method" defaultValue="bank_transfer" className={SELECT_CLASS}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`wpay-date-${invoiceId}`}>تاريخ الدفع</Label>
            <Input id={`wpay-date-${invoiceId}`} name="paid_at" type="date" dir="ltr" max={today} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`wpay-ref-${invoiceId}`}>مرجع (اختياري)</Label>
            <Input id={`wpay-ref-${invoiceId}`} name="reference" dir="ltr" />
          </div>
          {formError ? (
            <p role="alert" className="text-sm text-destructive sm:col-span-2">
              {formError}
            </p>
          ) : null}
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "جارٍ الحفظ…" : "تسجيل الدفعة"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NoteDialog({ invoiceId, projectId }: { invoiceId: string; projectId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const onResult = useActionResult();
  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      if (onResult(await addInvoiceNote(formData))) setOpen(false);
    });
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <MessageSquarePlus className="size-4" />
          متابعة
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>ملاحظة تحصيل</DialogTitle>
          <DialogDescription>سجّل متابعة التحصيل (مثل: اتصلنا بالعميل ووعد بالسداد الأسبوع القادم).</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="grid gap-3">
          <input type="hidden" name="invoice_id" value={invoiceId} />
          <input type="hidden" name="project_id" value={projectId} />
          <div className="space-y-2">
            <Label htmlFor={`wnote-${invoiceId}`}>الملاحظة</Label>
            <Textarea id={`wnote-${invoiceId}`} name="note" rows={3} required />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "جارٍ الإضافة…" : "إضافة المتابعة"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
