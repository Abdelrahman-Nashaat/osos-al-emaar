"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Check, Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { createTeamMember, type ActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ActionState = {};

const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

// Unambiguous alphabet (no O/0, I/l/1) so a hand-copied temp password is reliable.
const PW_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789@#%&*";
const PW_LENGTH = 14;

function generatePassword(): string {
  const bytes = new Uint32Array(PW_LENGTH);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < PW_LENGTH; i++) out += PW_ALPHABET[bytes[i] % PW_ALPHABET.length];
  return out;
}

export function AddMemberForm() {
  const [state, action, pending] = useActionState(createTeamMember, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  // Uncontrolled input (ref): the form's native reset() on success clears it, so
  // we never call setState inside the effect (avoids cascading-render lint).
  const passwordRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const [hasValue, setHasValue] = useState(false);

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
      formRef.current?.reset();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  const onGenerate = () => {
    if (passwordRef.current) passwordRef.current.value = generatePassword();
    setCopied(false);
    setHasValue(true);
  };

  const onCopy = async () => {
    const value = passwordRef.current?.value ?? "";
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("تم نسخ كلمة المرور. سلّمها للموظف؛ سيُطلب منه تغييرها عند أول تسجيل دخول.");
    } catch {
      toast.error("تعذّر النسخ. حدّد كلمة المرور وانسخها يدوياً.");
    }
  };

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
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="password">كلمة المرور المبدئية</Label>
        <div className="flex items-center gap-2">
          <Input
            ref={passwordRef}
            id="password"
            name="password"
            type="text"
            dir="ltr"
            minLength={12}
            required
            onChange={(e) => {
              setCopied(false);
              setHasValue(e.target.value.length > 0);
            }}
            className="font-mono"
            placeholder="12 حرفاً على الأقل"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={onGenerate}
          >
            <RefreshCw className="size-4" />
            توليد
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-9 shrink-0"
            aria-label="نسخ كلمة المرور"
            disabled={!hasValue}
            onClick={onCopy}
          >
            {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          ولّد كلمة مرور قوية وسلّمها للموظف؛ سيُطلب منه تغييرها عند أول تسجيل دخول.
        </p>
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
