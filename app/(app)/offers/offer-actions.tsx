"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  CheckCircle2,
  Clock4,
  MessageSquarePlus,
  Send,
  Trash2,
  XCircle,
} from "lucide-react";
import { useActionResult } from "@/components/use-action-result";
import {
  addOfferNote,
  convertOffer,
  deleteOffer,
  transitionOffer,
} from "./actions";
import type { OfferAction, OfferStatus } from "@/lib/offers/offer";
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
} from "@/components/ui/dialog";

type DialogKind = "send" | "accept" | "reject" | "expire" | "note" | "convert" | "delete" | null;

const TRANSITION_META: Record<
  "send" | "accept" | "reject" | "expire",
  { to: OfferStatus; title: string; desc: string; cta: string }
> = {
  send: {
    to: "sent",
    title: "إرسال العرض",
    desc: "بعد الإرسال لا يمكن تعديل العرض — فقط قبوله أو رفضه أو انتهاء صلاحيته.",
    cta: "إرسال",
  },
  accept: {
    to: "accepted",
    title: "قبول العرض",
    desc: "وافق العميل على العرض. بعد القبول يمكن تحويله إلى مشروع بقيمة العقد نفسها.",
    cta: "تأكيد القبول",
  },
  reject: {
    to: "rejected",
    title: "رفض العرض",
    desc: "سجّل اعتذار العميل عن العرض مع سبب الرفض إن وُجد.",
    cta: "تأكيد الرفض",
  },
  expire: {
    to: "expired",
    title: "انتهاء صلاحية العرض",
    desc: "انقضت مدة صلاحية العرض دون رد من العميل.",
    cta: "تأكيد الانتهاء",
  },
};

/** Role-gated action bar for the offer detail page (mirrors invoice-actions). */
export function OfferActions({
  offerId,
  offerTitle,
  actions,
}: {
  offerId: string;
  offerTitle: string;
  actions: OfferAction[];
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const onResult = useActionResult();

  const close = () => {
    setDialog(null);
    setFormError(null);
  };

  function run(action: () => Promise<{ error?: string; success?: string }>) {
    startTransition(async () => {
      const res = await action();
      if (onResult(res)) close();
      else setFormError(res.error ?? null);
    });
  }

  const has = (a: OfferAction) => actions.includes(a);
  const transitionKind = dialog && dialog in TRANSITION_META ? (dialog as keyof typeof TRANSITION_META) : null;

  return (
    <>
      <div className="no-print flex flex-wrap gap-2">
        {has("send") ? (
          <Button size="sm" onClick={() => setDialog("send")}>
            <Send className="size-4" /> إرسال
          </Button>
        ) : null}
        {has("accept") ? (
          <Button size="sm" onClick={() => setDialog("accept")}>
            <CheckCircle2 className="size-4" /> قبول
          </Button>
        ) : null}
        {has("reject") ? (
          <Button size="sm" variant="outline" onClick={() => setDialog("reject")}>
            <XCircle className="size-4" /> رفض
          </Button>
        ) : null}
        {has("expire") ? (
          <Button size="sm" variant="outline" onClick={() => setDialog("expire")}>
            <Clock4 className="size-4" /> انتهت الصلاحية
          </Button>
        ) : null}
        {has("convert") ? (
          <Button size="sm" onClick={() => setDialog("convert")}>
            <ArrowLeftRight className="size-4" /> تحويل إلى مشروع
          </Button>
        ) : null}
        {has("note") ? (
          <Button size="sm" variant="outline" onClick={() => setDialog("note")}>
            <MessageSquarePlus className="size-4" /> ملاحظة
          </Button>
        ) : null}
        {has("delete") ? (
          <Button size="sm" variant="destructive" onClick={() => setDialog("delete")}>
            <Trash2 className="size-4" /> حذف
          </Button>
        ) : null}
      </div>

      {/* Transition dialogs (send/accept/reject/expire) share one form. */}
      <Dialog open={transitionKind !== null} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          {transitionKind ? (
            <>
              <DialogHeader>
                <DialogTitle>{TRANSITION_META[transitionKind].title}</DialogTitle>
                <DialogDescription>{TRANSITION_META[transitionKind].desc}</DialogDescription>
              </DialogHeader>
              <form
                action={(fd) => {
                  fd.set("offer_id", offerId);
                  fd.set("to", TRANSITION_META[transitionKind].to);
                  run(() => transitionOffer(fd));
                }}
                noValidate
                className="space-y-3"
              >
                <div className="space-y-2">
                  <Label htmlFor="ot-note">ملاحظة (اختياري)</Label>
                  <Textarea id="ot-note" name="note" rows={2} />
                </div>
                {formError ? (
                  <p role="alert" className="text-sm text-destructive">
                    {formError}
                  </p>
                ) : null}
                <DialogFooter>
                  <Button type="submit" disabled={pending}>
                    {pending ? "لحظة…" : TRANSITION_META[transitionKind].cta}
                  </Button>
                </DialogFooter>
              </form>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Note */}
      <Dialog open={dialog === "note"} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إضافة ملاحظة متابعة</DialogTitle>
            <DialogDescription>تظهر في سجل العرض للمدير العام والمحاسب.</DialogDescription>
          </DialogHeader>
          <form
            action={(fd) => {
              fd.set("offer_id", offerId);
              run(() => addOfferNote(fd));
            }}
            noValidate
            className="space-y-3"
          >
            <div className="space-y-2">
              <Label htmlFor="on-note">الملاحظة</Label>
              <Textarea id="on-note" name="note" rows={3} required />
            </div>
            {formError ? (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? "لحظة…" : "إضافة"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Convert to project */}
      <Dialog open={dialog === "convert"} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تحويل العرض إلى مشروع</DialogTitle>
            <DialogDescription>
              يُنشأ مشروع جديد لعميل العرض وتُسجَّل قيمة العقد تلقائياً من إجمالي
              العرض (تظهر للمدير والمحاسب فقط).
            </DialogDescription>
          </DialogHeader>
          <form
            action={(fd) => {
              fd.set("offer_id", offerId);
              startTransition(async () => {
                const res = await convertOffer(fd);
                if (onResult(res)) {
                  close();
                  if (res.projectId) router.push(`/projects/${res.projectId}`);
                } else {
                  setFormError(res.error ?? null);
                }
              });
            }}
            noValidate
            className="space-y-3"
          >
            <div className="space-y-2">
              <Label htmlFor="oc-name">اسم المشروع</Label>
              <Input id="oc-name" name="name" defaultValue={offerTitle} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="oc-start">تاريخ البدء</Label>
                <Input id="oc-start" name="start_date" type="date" dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="oc-due">تاريخ الاستحقاق</Label>
                <Input id="oc-due" name="due_date" type="date" dir="ltr" />
              </div>
            </div>
            {formError ? (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? "جارٍ الإنشاء…" : "إنشاء المشروع"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete draft */}
      <Dialog open={dialog === "delete"} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>حذف العرض</DialogTitle>
            <DialogDescription>
              يُحذف مسودة العرض نهائياً مع سجله. العروض المُرسلة لا تُحذف — تُرفض
              أو تنتهي صلاحيتها حفظاً للتاريخ.
            </DialogDescription>
          </DialogHeader>
          <form
            action={(fd) => {
              fd.set("offer_id", offerId);
              startTransition(async () => {
                const res = await deleteOffer(fd);
                if (onResult(res)) {
                  close();
                  router.push("/offers");
                } else {
                  setFormError(res.error ?? null);
                }
              });
            }}
            noValidate
            className="space-y-3"
          >
            {formError ? (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="submit" variant="destructive" disabled={pending}>
                {pending ? "لحظة…" : "حذف نهائي"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
