"use client";

import { useActionState } from "react";
import { changeOwnPassword, type PasswordState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: PasswordState = {};

export function PasswordForm() {
  const [state, action, pending] = useActionState(changeOwnPassword, initialState);

  return (
    <form action={action} noValidate className="grid gap-3">
      <div className="space-y-2">
        <Label htmlFor="pw-new">كلمة المرور الجديدة</Label>
        <Input id="pw-new" name="password" type="password" dir="ltr" minLength={12} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="pw-confirm">تأكيد كلمة المرور</Label>
        <Input id="pw-confirm" name="confirm" type="password" dir="ltr" minLength={12} required />
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "جارٍ الحفظ…" : "حفظ كلمة المرور"}
      </Button>
    </form>
  );
}
