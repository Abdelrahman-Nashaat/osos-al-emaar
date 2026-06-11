"use client";

import { useState, useTransition } from "react";
import { useActionResult } from "@/components/use-action-result";
import { createInvoice, updateInvoice } from "./actions";
import { VAT_RATES, VAT_RATE_LABELS } from "@/lib/finance/invoice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

type EditInvoice = {
  id: string;
  project_id: string;
  subtotal: number;
  vat_rate: number;
  due_date: string | null;
  description: string | null;
};

/**
 * Create / edit-draft invoice dialog. financials.view holders only (the page renders
 * the trigger only then). On create, `lockedProjectId` fixes the project (project
 * detail page). On edit, the project is fixed and the DB rejects non-drafts.
 */
export function InvoiceFormDialog({
  projects,
  lockedProjectId,
  invoice,
  trigger,
}: {
  projects: { id: string; name: string }[];
  lockedProjectId?: string;
  invoice?: EditInvoice;
  trigger: React.ReactNode;
}) {
  const isEdit = !!invoice;
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const onResult = useActionResult();

  function handleSubmit(formData: FormData) {
    // Instant cross-field check (the server re-validates — B8).
    const issue = String(formData.get("issue_date") ?? "");
    const due = String(formData.get("due_date") ?? "");
    if (issue && due && due < issue) {
      setFormError("تاريخ الإصدار يجب أن يسبق تاريخ الاستحقاق أو يساويه.");
      return;
    }
    startTransition(async () => {
      const res = isEdit ? await updateInvoice(formData) : await createInvoice(formData);
      if (onResult(res)) {
        setFormError(null);
        setOpen(false);
      } else {
        setFormError(res.error ?? null);
      }
    });
  }

  const fixedProjectId = invoice?.project_id ?? lockedProjectId;
  const fixedProjectName = fixedProjectId
    ? (projects.find((p) => p.id === fixedProjectId)?.name ?? "")
    : "";

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setFormError(null);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "تعديل الفاتورة" : "فاتورة جديدة"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "يمكن تعديل المسودة فقط قبل إرسالها."
              : "أنشئ فاتورة لمشروع — تُحسب الضريبة والإجمالي تلقائياً."}
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} noValidate className="grid gap-3 sm:grid-cols-2">
          {isEdit ? <input type="hidden" name="invoice_id" value={invoice.id} /> : null}

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="i-project">المشروع</Label>
            {fixedProjectId ? (
              <>
                <input type="hidden" name="project_id" value={fixedProjectId} />
                <Input value={fixedProjectName} disabled readOnly />
              </>
            ) : (
              <select id="i-project" name="project_id" required defaultValue="" className={SELECT_CLASS}>
                <option value="" disabled>
                  — اختر مشروعاً —
                </option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="i-subtotal">المبلغ قبل الضريبة (ر.س)</Label>
            <Input
              id="i-subtotal"
              name="subtotal"
              type="number"
              min={0}
              step="0.01"
              dir="ltr"
              required
              defaultValue={invoice?.subtotal ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="i-vat">الضريبة</Label>
            <select
              id="i-vat"
              name="vat_rate"
              defaultValue={String(invoice?.vat_rate ?? 15)}
              className={SELECT_CLASS}
            >
              {VAT_RATES.map((r) => (
                <option key={r} value={r}>
                  {VAT_RATE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>

          {!isEdit ? (
            <div className="space-y-2">
              <Label htmlFor="i-issue">تاريخ الإصدار</Label>
              <Input id="i-issue" name="issue_date" type="date" dir="ltr" />
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="i-due">تاريخ الاستحقاق</Label>
            <Input
              id="i-due"
              name="due_date"
              type="date"
              dir="ltr"
              defaultValue={invoice?.due_date ?? ""}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="i-desc">الوصف / البيان</Label>
            <Textarea id="i-desc" name="description" rows={2} defaultValue={invoice?.description ?? ""} />
          </div>

          {!isEdit ? (
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="i-note">ملاحظة (اختياري)</Label>
              <Textarea id="i-note" name="note" rows={2} />
            </div>
          ) : null}

          {formError ? (
            <p role="alert" className="text-sm text-destructive sm:col-span-2">
              {formError}
            </p>
          ) : null}
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "جارٍ الحفظ…" : isEdit ? "حفظ" : "إنشاء الفاتورة"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
