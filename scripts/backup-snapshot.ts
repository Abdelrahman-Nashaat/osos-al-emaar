/**
 * Full-database JSON snapshot for operational backup.
 *
 * Dumps every public business table + auth user metadata (no password hashes)
 * + storage object listing into .backups/snapshot-<ISO date>.json, then
 * re-reads the file and verifies row counts against the live database.
 *
 * Usage:  npm run backup:snapshot            (uses .env.local)
 *         ENV_FILE=.env.demo.local npm run backup:snapshot
 */
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

if (process.env.ENV_FILE && existsSync(process.env.ENV_FILE)) {
  // Minimal KEY=VALUE parser so alternate env files (e.g. demo) work.
  for (const line of readFileSync(process.env.ENV_FILE, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
} else {
  loadEnvConfig(process.cwd());
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const TABLES = [
  "profiles",
  "role_permissions",
  "user_permission_overrides",
  "clients",
  "projects",
  "project_financials",
  "project_members",
  "tasks",
  "task_events",
  "invoices",
  "payments",
  "invoice_events",
  "offers",
  "offer_events",
  "attachments",
  "portfolio_items",
  "notifications",
  "office_settings",
  "audit_log",
] as const;

const PAGE = 1000;

async function main() {
  const admin = createClient(url!, serviceKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const snapshot: Record<string, unknown> = {
    taken_at: new Date().toISOString(),
    project_url: url,
  };
  const counts: Record<string, number> = {};

  for (const table of TABLES) {
    const rows: unknown[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await admin
        .from(table)
        .select("*")
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`${table}: ${error.message}`);
      rows.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }
    snapshot[table] = rows;
    counts[table] = rows.length;
  }

  // Auth users: metadata only — never export password hashes.
  const authUsers: unknown[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`auth.users: ${error.message}`);
    authUsers.push(
      ...data.users.map((u) => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        email_confirmed_at: u.email_confirmed_at,
        banned_until: (u as { banned_until?: string }).banned_until ?? null,
      })),
    );
    if (data.users.length < 200) break;
  }
  snapshot["auth_users"] = authUsers;
  counts["auth_users"] = authUsers.length;

  // Storage listing (attachments bucket) — names + sizes, not contents.
  const { data: objects } = await admin.storage.from("attachments").list("", {
    limit: 1000,
  });
  snapshot["storage_attachments_top_level"] = objects ?? [];

  mkdirSync(".backups", { recursive: true });
  const file = join(
    ".backups",
    `snapshot-${new Date().toISOString().slice(0, 10)}.json`,
  );
  writeFileSync(file, JSON.stringify(snapshot, null, 1), "utf8");

  // Verification: re-read the file and compare counts against live DB.
  const reread = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown[]>;
  let ok = true;
  for (const [table, n] of Object.entries(counts)) {
    const fileN = Array.isArray(reread[table]) ? reread[table].length : -1;
    if (fileN !== n) {
      ok = false;
      console.error(`MISMATCH ${table}: file=${fileN} live=${n}`);
    }
  }
  console.log(`Snapshot written: ${file}`);
  console.table(counts);
  if (!ok) {
    console.error("VERIFICATION FAILED");
    process.exit(1);
  }
  console.log("Snapshot verified: file row counts match live reads.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
