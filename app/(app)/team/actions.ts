"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile, type SessionProfile } from "@/lib/auth/permissions";

const ROLES = ["manager", "engineer", "accountant"] as const;
type Role = (typeof ROLES)[number];

// Password minimum is 12 while leaked-password protection is unavailable on the
// Free plan (Phase 4.5 A7; the HIBP toggle arrives at the Pre-Launch Gate).
const createSchema = z.object({
  fullName: z.string().trim().min(2),
  email: z.email(),
  password: z.string().min(12),
  role: z.enum(ROLES),
});

export type ActionState = { error?: string; success?: string };

/** Returns the session only if the caller is an active manager. */
async function requireManager(): Promise<SessionProfile | null> {
  const session = await getSessionProfile();
  if (!session || session.profile.role !== "manager") return null;
  return session;
}

/** True when no OTHER active manager exists besides `excludeUserId`. */
async function isLastActiveManager(
  supabase: Awaited<ReturnType<typeof createClient>>,
  excludeUserId: string,
): Promise<boolean> {
  const { count } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "manager")
    .eq("is_active", true)
    .neq("id", excludeUserId);
  return (count ?? 0) === 0;
}

/**
 * Maps a Supabase Auth admin error to a precise Arabic message. The decisive case:
 * a present-but-invalid service-role key (or a URL↔key project mismatch) makes GoTrue
 * reject with 401/403 — surfaced here as a clear "server config" message so a setup
 * fault is never mistaken for a user-input fault (the old code blanket-treated any 422
 * as "email already registered", which also swallowed weak-password/validation errors).
 */
function createUserErrorMessage(
  err: { status?: number; code?: string; message?: string } | null,
): string {
  const code = (err?.code ?? "").toLowerCase();
  const message = (err?.message ?? "").toLowerCase();
  const status = err?.status;

  if (code.includes("email_exists") || code.includes("user_already_exists") || message.includes("already")) {
    return "هذا البريد مسجّل بالفعل.";
  }
  if (code.includes("weak_password") || message.includes("password")) {
    return "كلمة المرور ضعيفة. اختر كلمة مرور أقوى (١٢ حرفاً فأكثر).";
  }
  if (code.includes("email_address_invalid") || message.includes("email")) {
    return "البريد الإلكتروني غير صالح.";
  }
  // Present-but-invalid service-role key / wrong project / not authorized → GoTrue 401/403.
  if (
    status === 401 ||
    status === 403 ||
    code.includes("not_admin") ||
    code.includes("no_authorization") ||
    message.includes("api key") ||
    message.includes("unauthorized") ||
    message.includes("not allowed") ||
    message.includes("invalid")
  ) {
    return "تعذّر إنشاء الحساب — إعداد الخادم غير صحيح (مفتاح الخدمة). أبلغ المطوّر.";
  }
  if (status === 429 || message.includes("rate")) {
    return "محاولات كثيرة. انتظر قليلاً ثم حاول مرة أخرى.";
  }
  return "تعذّر إنشاء الحساب.";
}

export async function createTeamMember(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireManager();
  if (!session) return { error: "هذه العملية للمدير العام فقط." };

  const parsed = createSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { error: "تحقق من الحقول: الاسم، وبريد صحيح، وكلمة مرور لا تقل عن ١٢ حرفاً." };
  }
  const { fullName, email, password, role } = parsed.data;

  // The privileged work runs inside try/catch so a configuration fault (a missing or
  // invalid service-role key) returns a clear Arabic message instead of THROWING — a
  // thrown server action never updates useActionState, leaving a silent dead button
  // (which is exactly how this bug presented in production).
  try {
    // Only the server-only admin client may create auth users.
    const admin = createAdminClient();
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (createErr || !created?.user) {
      const e = createErr as { status?: number; code?: string; message?: string } | null;
      // Server log (no secrets, no password) so the real GoTrue status/message is visible
      // in Vercel runtime logs — the action used to log nothing on failure.
      console.error("[team.create_member] createUser failed", {
        status: e?.status,
        code: e?.code,
        message: e?.message,
      });
      return { error: createUserErrorMessage(e) };
    }

    const { error: profileErr } = await admin.from("profiles").insert({
      id: created.user.id,
      full_name: fullName,
      email,
      role,
      is_active: true,
      // The manager hands over a TEMP password; the account must set its own
      // on first login (C5 — enforced by the (app) layout gate).
      must_change_password: true,
    });
    if (profileErr) {
      console.error("[team.create_member] profile insert failed", {
        code: profileErr.code,
        message: profileErr.message,
      });
      // Avoid an orphaned auth user if the profile insert fails.
      await admin.auth.admin.deleteUser(created.user.id);
      return { error: "تعذّر حفظ بيانات الموظف." };
    }

    await admin.from("audit_log").insert({
      actor_id: session.userId,
      action: "team.create_member",
      target_type: "profile",
      target_id: created.user.id,
      metadata: { role },
    });

    revalidatePath("/team");
    return { success: `تم إنشاء حساب «${fullName}».` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[team.create_member] unexpected failure:", message);
    if (message.includes("SUPABASE_SERVICE_ROLE_KEY")) {
      return {
        error: "تعذّر إنشاء الحساب — إعداد الخادم غير مكتمل (مفتاح الخدمة مفقود). أبلغ المطوّر.",
      };
    }
    return { error: "تعذّر إنشاء الحساب — خطأ غير متوقع. حاول مرة أخرى." };
  }
}

/**
 * Manager resets a member's password to a generated TEMP one (Phase 4.5 C5):
 * sets must_change_password so the member is forced to pick their own at next
 * login, and returns the temp to the manager's screen ONCE (never logged).
 */
export async function resetMemberPassword(userId: string): Promise<ActionState> {
  const session = await requireManager();
  if (!session) return { error: "غير مصرّح." };
  if (userId === session.userId) {
    return { error: "استخدم صفحة تعيين كلمة المرور لحسابك أنت." };
  }

  // URL-safe random temp, ≥16 chars (well above the 12 minimum).
  const temp = `Osos-${crypto.randomUUID().replace(/-/g, "").slice(0, 14)}`;

  try {
    const admin = createAdminClient();
    const { error: pwErr } = await admin.auth.admin.updateUserById(userId, { password: temp });
    if (pwErr) {
      console.error("[team.reset_password] updateUserById failed", {
        status: (pwErr as { status?: number }).status,
        message: pwErr.message,
      });
      return { error: "تعذّر إعادة تعيين كلمة المرور." };
    }
    await admin.from("profiles").update({ must_change_password: true }).eq("id", userId);
    await admin.from("audit_log").insert({
      actor_id: session.userId,
      action: "team.reset_password",
      target_type: "profile",
      target_id: userId,
      metadata: {}, // never the password
    });
  } catch (err) {
    console.error(
      "[team.reset_password] unexpected failure:",
      err instanceof Error ? err.message : String(err),
    );
    return { error: "تعذّر إعادة تعيين كلمة المرور — خطأ غير متوقع." };
  }

  revalidatePath("/team");
  return { success: temp };
}

export async function setMemberRole(userId: string, role: Role): Promise<ActionState> {
  const session = await requireManager();
  if (!session) return { error: "غير مصرّح." };
  if (!ROLES.includes(role)) return { error: "دور غير صالح." };

  const supabase = await createClient();

  // Never let the office demote its last active manager (lock-out protection).
  if (role !== "manager") {
    const { data: target } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", userId)
      .single();
    if (target?.role === "manager" && target.is_active && (await isLastActiveManager(supabase, userId))) {
      return { error: "لا يمكن إزالة آخر مدير عام نشط." };
    }
  }

  const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);
  if (error) return { error: "تعذّر تحديث الدور." };

  await supabase.from("audit_log").insert({
    actor_id: session.userId,
    action: "team.set_role",
    target_type: "profile",
    target_id: userId,
    metadata: { role },
  });
  revalidatePath("/team");
  return { success: "تم تحديث الدور." };
}

export async function setMemberActive(userId: string, isActive: boolean): Promise<ActionState> {
  const session = await requireManager();
  if (!session) return { error: "غير مصرّح." };

  const supabase = await createClient();

  // Never let the office deactivate its last active manager (lock-out protection).
  if (!isActive) {
    const { data: target } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();
    if (target?.role === "manager" && (await isLastActiveManager(supabase, userId))) {
      return { error: "لا يمكن تعطيل آخر مدير عام نشط." };
    }
  }

  const { error } = await supabase.from("profiles").update({ is_active: isActive }).eq("id", userId);
  if (error) return { error: "تعذّر تحديث الحالة." };

  // Sync the auth-layer ban with the flag (S17): a deactivated employee must not
  // keep a working refresh token or sign in again. The ≤1h residual access token
  // is covered by the 0011 has_perm hardening. Failure here is logged + audited
  // but does not undo the flag (the DB layer already denies the user everything).
  let authBanSynced = false;
  try {
    const admin = createAdminClient();
    const { error: banErr } = await admin.auth.admin.updateUserById(userId, {
      ban_duration: isActive ? "none" : "87600h",
    });
    authBanSynced = !banErr;
    if (banErr) {
      console.error("[team.set_active] auth ban sync failed", {
        status: (banErr as { status?: number }).status,
        message: banErr.message,
      });
    }
  } catch (err) {
    console.error(
      "[team.set_active] auth ban sync threw:",
      err instanceof Error ? err.message : String(err),
    );
  }

  await supabase.from("audit_log").insert({
    actor_id: session.userId,
    action: "team.set_active",
    target_type: "profile",
    target_id: userId,
    metadata: { is_active: isActive, auth_ban_synced: authBanSynced },
  });
  revalidatePath("/team");

  // A failed unban on REACTIVATION would leave the employee unable to sign in
  // while the manager sees plain success — surface it (security review LOW-1).
  // A failed ban on deactivation is only informational: the DB layer and the
  // login is_active check both deny the user regardless.
  if (isActive) {
    return {
      success: authBanSynced
        ? "تم تفعيل الحساب."
        : "تم تفعيل الحساب، لكن تعذّرت مزامنة تسجيل الدخول — بدّل الحالة مرة أخرى إذا لم يستطع الموظف الدخول.",
    };
  }
  return {
    success: authBanSynced
      ? "تم تعطيل الحساب."
      : "تم تعطيل الحساب (تعذّر إنهاء الجلسات الحالية — الوصول ممنوع على مستوى قاعدة البيانات).",
  };
}
