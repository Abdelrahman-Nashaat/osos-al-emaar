/**
 * Make-or-break security proof for Phase 1 (run: npm run verify:rls).
 * Creates an ephemeral engineer, signs in as them, and asserts the RBAC
 * guarantees hold at the database layer. Cleans up afterwards.
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log("  PASS:", msg);
  } else {
    console.error("  FAIL:", msg);
    failures += 1;
  }
}

async function main() {
  if (!url || !anon || !service) {
    console.error("Missing Supabase env (.env.local).");
    process.exit(1);
  }

  const admin = createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const ts = Date.now();
  const engEmail = `rls-eng-${ts}@example.com`;
  const password = `Test!${ts}aA`;
  let engId = "";

  try {
    const { data: created, error } = await admin.auth.admin.createUser({
      email: engEmail,
      password,
      email_confirm: true,
    });
    if (error || !created.user) throw new Error("create engineer failed: " + error?.message);
    engId = created.user.id;
    await admin
      .from("profiles")
      .insert({ id: engId, full_name: "RLS Test Engineer", email: engEmail, role: "engineer" });

    const eng = createClient(url, anon, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: signErr } = await eng.auth.signInWithPassword({ email: engEmail, password });
    if (signErr) throw new Error("engineer sign-in failed: " + signErr.message);

    // Engineer can read their own profile.
    const { data: own } = await eng.from("profiles").select("id").eq("id", engId).maybeSingle();
    assert(!!own, "engineer can read OWN profile");

    // Engineer can read role defaults (needed for UI) ...
    const { error: rpSelErr } = await eng.from("role_permissions").select("permission_key").limit(1);
    assert(!rpSelErr, "engineer can SELECT role_permissions");

    // ... but cannot modify them (write policy = manager) → 0 rows affected.
    const { data: updated } = await eng
      .from("role_permissions")
      .update({ allowed: true })
      .eq("role", "engineer")
      .eq("permission_key", "projects.edit")
      .select("permission_key");
    assert((updated?.length ?? 0) === 0, "engineer UPDATE on role_permissions affects 0 rows (RLS)");

    // Engineer cannot grant themselves any override (write policy = manager).
    const { error: ovRlsErr } = await eng
      .from("user_permission_overrides")
      .insert({ user_id: engId, permission_key: "projects.edit", allowed: true });
    assert(!!ovRlsErr, "engineer INSERT override is blocked by RLS");

    // The CHECK constraint blocks financials.view even for the service role (most privileged).
    const { error: checkErr } = await admin
      .from("user_permission_overrides")
      .insert({ user_id: engId, permission_key: "financials.view", allowed: true });
    assert(!!checkErr, "service_role INSERT override financials.view is REJECTED by CHECK constraint");

    // Engineer cannot read the audit log (manager only).
    const { data: audit } = await eng.from("audit_log").select("id").limit(1);
    assert((audit?.length ?? 0) === 0, "engineer SELECT audit_log returns 0 rows");
  } finally {
    if (engId) {
      await admin.from("profiles").delete().eq("id", engId);
      await admin.auth.admin.deleteUser(engId);
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} RLS check(s) FAILED.`);
    process.exit(1);
  }
  console.log("\nAll RLS checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
