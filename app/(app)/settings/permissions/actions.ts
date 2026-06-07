"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth/permissions";
import { PERMISSION_KEYS, isGrantableKey } from "@/lib/auth/permission-keys";

const ROLES = ["manager", "engineer", "accountant"] as const;
type Role = (typeof ROLES)[number];

export type ActionState = { error?: string; success?: string };

async function requireManager() {
  const session = await getSessionProfile();
  if (!session || session.profile.role !== "manager") return null;
  return session;
}

const isKnownKey = (key: string) => (PERMISSION_KEYS as readonly string[]).includes(key);

export async function setRolePermission(
  role: Role,
  key: string,
  allowed: boolean,
): Promise<ActionState> {
  const session = await requireManager();
  if (!session) return { error: "غير مصرّح." };
  if (!ROLES.includes(role) || !isKnownKey(key)) return { error: "مدخل غير صالح." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("role_permissions")
    .update({ allowed })
    .eq("role", role)
    .eq("permission_key", key);
  if (error) return { error: "تعذّر حفظ الصلاحية." };

  await supabase.from("audit_log").insert({
    actor_id: session.userId,
    action: "permissions.set_role_default",
    target_type: "role",
    target_id: role,
    metadata: { key, allowed },
  });
  revalidatePath("/settings/permissions");
  return { success: "تم الحفظ." };
}

export async function setUserOverride(
  userId: string,
  key: string,
  allowed: boolean,
): Promise<ActionState> {
  const session = await requireManager();
  if (!session) return { error: "غير مصرّح." };
  // Defense in depth: the DB CHECK also blocks non projects/tasks keys.
  if (!isGrantableKey(key)) return { error: "لا يمكن تخصيص هذه الصلاحية لفرد." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("user_permission_overrides")
    .upsert({ user_id: userId, permission_key: key, allowed });
  if (error) return { error: "تعذّر حفظ التخصيص." };

  await supabase.from("audit_log").insert({
    actor_id: session.userId,
    action: "permissions.set_user_override",
    target_type: "profile",
    target_id: userId,
    metadata: { key, allowed },
  });
  revalidatePath("/settings/permissions");
  return { success: "تم الحفظ." };
}

export async function clearUserOverride(userId: string, key: string): Promise<ActionState> {
  const session = await requireManager();
  if (!session) return { error: "غير مصرّح." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("user_permission_overrides")
    .delete()
    .eq("user_id", userId)
    .eq("permission_key", key);
  if (error) return { error: "تعذّر الحذف." };

  await supabase.from("audit_log").insert({
    actor_id: session.userId,
    action: "permissions.clear_user_override",
    target_type: "profile",
    target_id: userId,
    metadata: { key },
  });
  revalidatePath("/settings/permissions");
  return { success: "تمت الإعادة إلى افتراضي الدور." };
}
