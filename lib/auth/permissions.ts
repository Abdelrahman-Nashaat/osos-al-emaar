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

export type AuthState =
  | { kind: "none" }
  | { kind: "inactive" }
  | { kind: "active"; session: SessionProfile };

/**
 * Distinguishes "no session" from "authenticated but deactivated" so deactivated
 * users land on /account-disabled instead of looping /login⇄/dashboard
 * (Phase 4.5 A4). A user without a profile row is treated as inactive too.
 * Cached per request.
 */
export const getAuthState = cache(async (): Promise<AuthState> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "none" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  if (!profile || !profile.is_active) return { kind: "inactive" };

  return { kind: "active", session: { userId: user.id, profile } };
});

/** Current authenticated user + their active profile, or null. Cached per request. */
export const getSessionProfile = cache(async (): Promise<SessionProfile | null> => {
  const state = await getAuthState();
  return state.kind === "active" ? state.session : null;
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
