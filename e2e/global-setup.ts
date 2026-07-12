import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

/**
 * Production safety gate for the whole Playwright suite.
 *
 * The functional specs create tasks / invoices / payments, and the DB triggers
 * (migrations 0022/0026) turn those into notifications for EVERY active manager
 * and accountant — including the client's REAL staff once the project has them.
 * After the mobile-elevation launch (migration 0029) each such notification also
 * fires a real Web Push to their phones. So the suite must run against a
 * DISPOSABLE project, never the live one.
 *
 * This refuses to start if the target DB contains any non-`@example.com` profile
 * (the signal that real people are using it). Point NEXT_PUBLIC_SUPABASE_URL at
 * the demo project, or set E2E_ALLOW_PROD=1 to override for a one-off (then clean
 * up residue — see docs/OPERATIONS.md). verify:rls is unaffected: it is a
 * separate script that is read-only / self-cleaning and never notifies anyone.
 */
export default async function globalSetup() {
  if (process.env.E2E_ALLOW_PROD === "1") return;
  loadEnvConfig(process.cwd());
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !service) return; // missing env — let the specs fail with their own message

  const admin = createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { count } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .not("email", "like", "%@example.com");

  if ((count ?? 0) > 0) {
    throw new Error(
      `\n\n⛔  Playwright refuses to run against a Supabase project with REAL users ` +
        `(${count} non-@example.com profile${count === 1 ? "" : "s"}).\n` +
        `    The functional suite creates tasks/invoices/payments whose DB triggers notify — and now ` +
        `Web-Push — the real managers/accountants.\n` +
        `    Fix: point NEXT_PUBLIC_SUPABASE_URL at the demo project (osos-al-emaar-demo).\n` +
        `    Override (pollutes real bells — then clean up per docs/OPERATIONS.md): E2E_ALLOW_PROD=1\n`,
    );
  }
}
