import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getPublicEnv, getServiceRoleKey } from "@/lib/env";

/**
 * Service-role Supabase client. SERVER-ONLY — never import into a client component.
 * Bypasses RLS; use only in server actions / route handlers for privileged admin tasks
 * (e.g. a manager creating staff accounts). Every privileged action must write to audit_log.
 */
export function createAdminClient() {
  const { NEXT_PUBLIC_SUPABASE_URL } = getPublicEnv();
  return createClient<Database>(NEXT_PUBLIC_SUPABASE_URL, getServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
