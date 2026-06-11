"use client";

import { useState, useTransition } from "react";
import { saveOfficeSettings } from "./actions";
import { useActionResult } from "@/components/use-action-result";
import type { OfficeSettings } from "@/lib/office/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function OfficeSettingsForm({ settings }: { settings: OfficeSettings }) {
  const [pending, startTransition] = useTransition();
  const [inlineError, setInlineError] = useState<string | null>(null);
  const handle = useActionResult();

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          const res = await saveOfficeSettings(fd);
          setInlineError(res.error ?? null);
          handle(res);
        });
      }}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="os-name">اسم المكتب (عربي)</Label>
          <Input id="os-name" name="office_name" defaultValue={settings.office_name} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="os-name-en">الاسم (إنجليزي)</Label>
          <Input id="os-name-en" name="office_name_en" dir="ltr" defaultValue={settings.office_name_en ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="os-cr">رقم السجل التجاري</Label>
          <Input id="os-cr" name="cr_number" dir="ltr" inputMode="numeric" defaultValue={settings.cr_number ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="os-vat">الرقم الضريبي (اختياري)</Label>
          <Input
            id="os-vat"
            name="vat_number"
            dir="ltr"
            inputMode="numeric"
            maxLength={15}
            placeholder="15 رقماً — اتركه فارغاً إن لم يكن المكتب مسجلاً في الضريبة"
            defaultValue={settings.vat_number ?? ""}
          />
          <p className="text-xs text-muted-foreground">
            عند تعبئته تُطبع الفواتير بعنوان «فاتورة ضريبية مبسطة» مع رمز QR
            متوافق مع متطلبات هيئة الزكاة والضريبة (فاتورة).
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="os-city">المدينة</Label>
          <Input id="os-city" name="city" defaultValue={settings.city ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="os-address">العنوان</Label>
          <Input id="os-address" name="address" defaultValue={settings.address ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="os-phone">الهاتف</Label>
          <Input id="os-phone" name="phone" dir="ltr" inputMode="tel" defaultValue={settings.phone ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="os-email">البريد الإلكتروني</Label>
          <Input id="os-email" name="email" type="email" dir="ltr" defaultValue={settings.email ?? ""} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="os-web">الموقع الإلكتروني</Label>
          <Input id="os-web" name="website" dir="ltr" defaultValue={settings.website ?? ""} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="os-footer">نص أسفل الفاتورة (اختياري)</Label>
          <Textarea
            id="os-footer"
            name="invoice_footer"
            rows={2}
            placeholder="مثال: يُسدَّد المبلغ خلال 15 يوماً على حساب الآيبان SA…"
            defaultValue={settings.invoice_footer ?? ""}
          />
        </div>
      </div>

      {inlineError ? (
        <p role="alert" className="text-sm text-destructive">
          {inlineError}
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "جارٍ الحفظ…" : "حفظ الإعدادات"}
      </Button>
    </form>
  );
}
