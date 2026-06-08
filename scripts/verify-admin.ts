/**
 * Verifies that SUPABASE_SERVICE_ROLE_KEY is a VALID service-role secret for the
 * configured project — the check /api/health does NOT do (it only checks presence).
 * Builds the admin client from env and performs a privileged read. Prints OK / FAIL
 * only — NEVER the key. Run:  npm run verify:admin   (or  npx tsx scripts/verify-admin.ts)
 *
 * Run it against any environment by loading that environment's vars first
 * (locally it reads .env.local; on Vercel run it with the project's env pulled).
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.error("FAIL: missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env.");
    process.exit(1);
  }
  // Print only the project host (never the key) so a URL↔key project mismatch is obvious.
  console.log(`Project URL host: ${new URL(url).host}`);

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // A privileged admin endpoint: succeeds only with a valid service-role key for THIS project.
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (error) {
    console.error(`FAIL: admin call rejected — status ${error.status ?? "?"}: ${error.message}`);
    console.error(
      "→ The service-role key is missing/invalid for this project, or the URL and key belong to different projects.",
    );
    process.exit(1);
  }

  console.log(`OK: service-role key is valid for this project (admin listUsers returned ${data.users.length} user(s)).`);
}

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
