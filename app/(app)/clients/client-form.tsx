"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveClient } from "./actions";
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

export type ClientRow = {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  country: string | null;
  notes: string | null;
};

export function ClientFormDialog({
  client,
  trigger,
}: {
  client?: ClientRow;
  trigger: React.ReactNode;
}) {
  const isEdit = Boolean(client);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const res = await saveClient(formData);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(res.success ?? "تم");
        setOpen(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "تعديل العميل" : "إضافة عميل"}</DialogTitle>
          <DialogDescription>بيانات التواصل والمعلومات التشغيلية للعميل (بدون أي مبالغ).</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="grid gap-3 sm:grid-cols-2">
          {isEdit ? <input type="hidden" name="id" defaultValue={client!.id} /> : null}
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="c-name">اسم العميل</Label>
            <Input id="c-name" name="name" defaultValue={client?.name ?? ""} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-company">الجهة / الشركة</Label>
            <Input id="c-company" name="company" defaultValue={client?.company ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-phone">الجوال</Label>
            <Input id="c-phone" name="phone" dir="ltr" inputMode="tel" defaultValue={client?.phone ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-email">البريد الإلكتروني</Label>
            <Input id="c-email" name="email" type="email" dir="ltr" defaultValue={client?.email ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-country">الدولة</Label>
            <Input id="c-country" name="country" defaultValue={client?.country ?? "SA"} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="c-address">العنوان / الموقع</Label>
            <Input id="c-address" name="address" defaultValue={client?.address ?? ""} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="c-notes">ملاحظات</Label>
            <Textarea id="c-notes" name="notes" rows={3} defaultValue={client?.notes ?? ""} />
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "جارٍ الحفظ…" : isEdit ? "حفظ التغييرات" : "إضافة العميل"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
