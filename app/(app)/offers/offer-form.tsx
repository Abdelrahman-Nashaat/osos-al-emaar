"use client";

import { useState, useTransition } from "react";
import { useActionResult } from "@/components/use-action-result";
import { createOffer, updateOffer } from "./actions";
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

type EditOffer = {
  id: string;
  client_id: string;
  title: string;
  scope: string | null;
  subtotal: number;
  vat_rate: number;
  valid_until: string | null;
};

/** Create / edit-draft offer dialog. offers.edit holders only (page gates the trigger). */
export function OfferFormDialog({
  clients,
  offer,
  trigger,
}: {
  clients: { id: string; name: string }[];
  offer?: EditOffer;
  trigger: React.ReactNode;
}) {
  const isEdit = !!offer;
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const onResult = useActionResult();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const res = isEdit ? await updateOffer(formData) : await createOffer(formData);
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
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "تعديل عرض السعر" : "عرض سعر جديد"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "يمكن تعديل المسودة فقط قبل إرسالها للعميل."
              : "عرض سعر لعميل — تُحسب الضريبة والإجمالي تلقائياً، ويمكن تحويله لمشروع عند قبوله."}
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} noValidate className="grid gap-3 sm:grid-cols-2">
          {isEdit ? <input type="hidden" name="offer_id" value={offer.id} /> : null}

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="o-title">موضوع العرض</Label>
            <Input
              id="o-title"
              name="title"
              required
              placeholder="مثال: تصميم فيلا سكنية — حي الشاطئ"
              defaultValue={offer?.title ?? ""}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="o-client">العميل</Label>
            {isEdit ? (
              <>
                <input type="hidden" name="client_id" value={offer.client_id} />
                <Input
                  id="o-client"
                  value={clients.find((c) => c.id === offer.client_id)?.name ?? ""}
                  disabled
                  readOnly
                />
              </>
            ) : (
              <select id="o-client" name="client_id" required defaultValue="" className={SELECT_CLASS}>
                <option value="" disabled>
                  — اختر عميلاً —
                </option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="o-subtotal">المبلغ قبل الضريبة (ر.س)</Label>
            <Input
              id="o-subtotal"
              name="subtotal"
              type="number"
              min={0}
              step="0.01"
              dir="ltr"
              required
              defaultValue={offer?.subtotal ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="o-vat">الضريبة</Label>
            <select
              id="o-vat"
              name="vat_rate"
              defaultValue={String(offer?.vat_rate ?? 15)}
              className={SELECT_CLASS}
            >
              {VAT_RATES.map((r) => (
                <option key={r} value={r}>
                  {VAT_RATE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="o-valid">صالح حتى</Label>
            <Input
              id="o-valid"
              name="valid_until"
              type="date"
              dir="ltr"
              defaultValue={offer?.valid_until ?? ""}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="o-scope">نطاق العمل / التفاصيل</Label>
            <Textarea
              id="o-scope"
              name="scope"
              rows={3}
              placeholder="وصف الخدمات المشمولة بالعرض (يظهر في العرض المطبوع)"
              defaultValue={offer?.scope ?? ""}
            />
          </div>

          {!isEdit ? (
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="o-note">ملاحظة داخلية (اختياري)</Label>
              <Textarea id="o-note" name="note" rows={2} />
            </div>
          ) : null}

          {formError ? (
            <p role="alert" className="text-sm text-destructive sm:col-span-2">
              {formError}
            </p>
          ) : null}
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "جارٍ الحفظ…" : isEdit ? "حفظ" : "إنشاء العرض"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
