"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { createTeamMember, type ActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ActionState = {};

const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function AddMemberForm() {
  const [state, action, pending] = useActionState(createTeamMember, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
      formRef.current?.reset();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <form ref={formRef} action={action} className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="fullName">الاسم الكامل</Label>
        <Input id="fullName" name="fullName" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">البريد الإلكتروني</Label>
        <Input id="email" name="email" type="email" dir="ltr" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">كلمة المرور المبدئية</Label>
        <Input id="password" name="password" type="text" dir="ltr" minLength={8} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="role">الدور</Label>
        <select id="role" name="role" defaultValue="engineer" className={SELECT_CLASS}>
          <option value="engineer">مهندس</option>
          <option value="accountant">محاسب</option>
          <option value="manager">مدير عام</option>
        </select>
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "جارٍ الإضافة…" : "إضافة موظف"}
        </Button>
        {state.error ? (
          <p className="text-sm text-destructive" role="alert">
            {state.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
