import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import {
  computeEffectivePermissions,
  emptyPermissions,
  type Permissions,
} from "@/lib/auth/permission-keys";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type SessionProfile = { userId: string; profile: Profile };

/** Current authenticated user + their active profile, or null. Cached per request. */
export const getSessionProfile = cache(async (): Promise<SessionProfile | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  if (!profile || !profile.is_active) return null;

  return { userId: user.id, profile };
});

/** Redirects to /login if there is no active session; otherwise returns it. */
export async function requireAuth(): Promise<SessionProfile> {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  return session;
}

/** Effective permissions for the current user (override ?? role default; financials role-only). */
export const getEffectivePermissions = cache(async (): Promise<Permissions> => {
  const session = await getSessionProfile();
  if (!session) return emptyPermissions();

  const supabase = await createClient();
  const [{ data: roleRows }, { data: overrideRows }] = await Promise.all([
    supabase
      .from("role_permissions")
      .select("permission_key, allowed")
      .eq("role", session.profile.role),
    supabase
      .from("user_permission_overrides")
      .select("permission_key, allowed")
      .eq("user_id", session.userId),
  ]);

  return computeEffectivePermissions({
    role: session.profile.role,
    roleDefaults: roleRows ?? [],
    overrides: overrideRows ?? [],
  });
});
