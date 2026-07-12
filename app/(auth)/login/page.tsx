"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Smartphone } from "lucide-react";
import { signIn, type LoginState } from "./actions";
import { brand } from "@/lib/config/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const initialState: LoginState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <div className="w-full max-w-sm space-y-4">
    <Card className="w-full">
      <CardHeader className="text-center">
        <CardTitle className="text-xl">{brand.nameAr}</CardTitle>
        <CardDescription>{brand.taglineAr}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">البريد الإلكتروني</Label>
            <Input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              dir="ltr"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">كلمة المرور</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              dir="ltr"
              required
            />
          </div>
          {state.error ? (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "جارٍ الدخول…" : "تسجيل الدخول"}
          </Button>
        </form>
      </CardContent>
    </Card>
      <Link
        href="/install"
        className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        <Smartphone className="size-4" />
        تثبيت التطبيق على الجوال
      </Link>
    </div>
  );
}
