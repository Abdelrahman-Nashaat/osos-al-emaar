/**
 * Creates the FIRST general-manager account. Idempotent: if any manager already
 * exists, it does nothing. Reads credentials from .env.local ONLY:
 *   BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD, BOOTSTRAP_ADMIN_NAME
 * Run once:  npm run bootstrap   — then remove those vars from .env.local.
 * The password is never printed.
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const name = process.env.BOOTSTRAP_ADMIN_NAME;

  if (!url || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local.");
    process.exit(1);
  }
  if (!email || !password || !name) {
    console.error(
      "Set BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD and BOOTSTRAP_ADMIN_NAME in .env.local, then re-run.",
    );
    process.exit(1);
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { count, error: countErr } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "manager");
  if (countErr) {
    console.error("Failed to check existing managers:", countErr.message);
    process.exit(1);
  }
  if ((count ?? 0) > 0) {
    console.log("A manager already exists — bootstrap skipped.");
    return;
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (createErr || !created.user) {
    console.error("Failed to create the manager auth user:", createErr?.message);
    process.exit(1);
  }

  const { error: profileErr } = await admin.from("profiles").insert({
    id: created.user.id,
    full_name: name,
    email,
    role: "manager",
    is_active: true,
  });
  if (profileErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    console.error("Failed to insert the manager profile:", profileErr.message);
    process.exit(1);
  }

  await admin.from("audit_log").insert({
    actor_id: created.user.id,
    action: "bootstrap.create_manager",
    target_type: "profile",
    target_id: created.user.id,
  });

  console.log(`OK: manager created for ${email}.`);
  console.log("Now REMOVE BOOTSTRAP_ADMIN_EMAIL/PASSWORD/NAME from .env.local.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
