"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile, type SessionProfile } from "@/lib/auth/permissions";

const ROLES = ["manager", "engineer", "accountant"] as const;
type Role = (typeof ROLES)[number];

const createSchema = z.object({
  fullName: z.string().trim().min(2),
  email: z.email(),
  password: z.string().min(8),
  role: z.enum(ROLES),
});

export type ActionState = { error?: string; success?: string };

/** Returns the session only if the caller is an active manager. */
async function requireManager(): Promise<SessionProfile | null> {
  const session = await getSessionProfile();
  if (!session || session.profile.role !== "manager") return null;
  return session;
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
    return { error: "تحقق من الحقول: الاسم، وبريد صحيح، وكلمة مرور لا تقل عن ٨ أحرف." };
  }
  const { fullName, email, password, role } = parsed.data;

  // Privileged: only the server-only admin client may create auth users.
  const admin = createAdminClient();
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createErr || !created?.user) {
    const duplicate =
      createErr?.message?.toLowerCase().includes("already") || createErr?.status === 422;
    return { error: duplicate ? "هذا البريد مسجّل بالفعل." : "تعذّر إنشاء الحساب." };
  }

  const { error: profileErr } = await admin.from("profiles").insert({
    id: created.user.id,
    full_name: fullName,
    email,
    role,
    is_active: true,
  });
  if (profileErr) {
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
}

export async function setMemberRole(userId: string, role: Role): Promise<ActionState> {
  const session = await requireManager();
  if (!session) return { error: "غير مصرّح." };
  if (!ROLES.includes(role)) return { error: "دور غير صالح." };

  const supabase = await createClient();
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
  const { error } = await supabase.from("profiles").update({ is_active: isActive }).eq("id", userId);
  if (error) return { error: "تعذّر تحديث الحالة." };

  await supabase.from("audit_log").insert({
    actor_id: session.userId,
    action: "team.set_active",
    target_type: "profile",
    target_id: userId,
    metadata: { is_active: isActive },
  });
  revalidatePath("/team");
  return { success: isActive ? "تم تفعيل الحساب." : "تم تعطيل الحساب." };
}
