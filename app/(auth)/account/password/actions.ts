"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthState } from "@/lib/auth/permissions";

export type PasswordState = { error?: string };

const schema = z
  .object({
    password: z.string().min(12),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "mismatch" });

/**
 * Self-service password change (Phase 4.5 C5). Used by the forced first-login
 * flow and as a normal "change my password" page. Clears must_change_password
 * via the server-only admin client (profiles has no self-UPDATE policy, so the
 * flag can never be cleared from the browser) and audits the change.
 */
export async function changeOwnPassword(
  _prev: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const state = await getAuthState();
  if (state.kind !== "active") return { error: "انتهت الجلسة. سجّل الدخول مرة أخرى." };

  const parsed = schema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    const mismatch = parsed.error.issues.some((i) => i.message === "mismatch");
    return {
      error: mismatch
        ? "كلمتا المرور غير متطابقتين."
        : "كلمة المرور يجب ألا تقل عن ١٢ حرفاً.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    const msg = (error.message ?? "").toLowerCase();
    if (msg.includes("different from the old") || msg.includes("same")) {
      return { error: "اختر كلمة مرور مختلفة عن الحالية." };
    }
    console.error("[account.password] updateUser failed", {
      status: (error as { status?: number }).status,
      message: error.message,
    });
    return { error: "تعذّر تغيير كلمة المرور. حاول مرة أخرى." };
  }

  try {
    const admin = createAdminClient();
    await admin
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", state.session.userId);
    await admin.from("audit_log").insert({
      actor_id: state.session.userId,
      action: "account.password_changed",
      target_type: "profile",
      target_id: state.session.userId,
      metadata: {},
    });
  } catch (err) {
    // The password DID change; the flag is cosmetic-gating only — log and move on.
    console.error(
      "[account.password] flag clear failed:",
      err instanceof Error ? err.message : String(err),
    );
  }

  redirect("/dashboard");
}
