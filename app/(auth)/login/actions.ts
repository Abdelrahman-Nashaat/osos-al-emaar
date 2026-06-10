"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string };

const DISABLED_MESSAGE = "تم تعطيل حسابك. تواصل مع المدير العام.";

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { error: "أدخل البريد الإلكتروني وكلمة المرور." };
  }

  const supabase = await createClient();
  const { data: signedIn, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Deactivation bans the auth user (team.set_active) — surface that as
    // "disabled", not "wrong credentials".
    const code = ((error as { code?: string }).code ?? "").toLowerCase();
    if (code.includes("banned") || error.message.toLowerCase().includes("banned")) {
      return { error: DISABLED_MESSAGE };
    }
    return { error: "بيانات الدخول غير صحيحة." };
  }

  // A deactivated (or profile-less) account gets a clear Arabic message instead
  // of the /login⇄/dashboard redirect loop (Phase 4.5 A4).
  const userId = signedIn.user?.id;
  if (userId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_active")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.is_active) {
      await supabase.auth.signOut();
      return { error: DISABLED_MESSAGE };
    }
  }

  redirect("/dashboard");
}
