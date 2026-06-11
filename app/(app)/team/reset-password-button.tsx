"use client";

import { useState, useTransition } from "react";
import { KeyRound } from "lucide-react";
import { resetMemberPassword } from "./actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Manager-only password reset (C5). The generated temp password is shown ONCE
 * inside this dialog (dir=ltr, selectable) — it is never logged or stored.
 */
export function ResetPasswordButton({ userId, disabled }: { userId: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [temp, setTemp] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const res = await resetMemberPassword(userId);
      if (res.error) setError(res.error);
      else setTemp(res.success ?? null);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setTemp(null);
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" disabled={disabled} aria-label="إعادة تعيين كلمة المرور">
          <KeyRound className="size-4" />
          <span className="hidden lg:inline">إعادة تعيين</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>إعادة تعيين كلمة المرور</DialogTitle>
          <DialogDescription>
            سيُنشأ للموظف كلمة مرور مؤقتة، وسيُطلب منه تعيين كلمة مرور خاصة به عند أول
            تسجيل دخول.
          </DialogDescription>
        </DialogHeader>

        {temp ? (
          <div className="space-y-3">
            <p className="text-sm font-medium">سلّم هذه الكلمة للموظف — لن تظهر مرة أخرى:</p>
            <code
              dir="ltr"
              className="block select-all rounded-md border border-border bg-muted px-3 py-2 text-center text-base tabular-nums"
            >
              {temp}
            </code>
          </div>
        ) : (
          <>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button onClick={run} disabled={pending}>
                {pending ? "جارٍ التنفيذ…" : "إنشاء كلمة مؤقتة"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
