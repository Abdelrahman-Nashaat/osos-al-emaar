/**
 * One-shot removal of the two disposable test accounts created manually by
 * the operator (eng1@gmail.com / accountant1@gmail.com).
 *
 * Safety:
 *  - hard allowlist — refuses to touch any other account;
 *  - re-verifies the accounts own ZERO business rows before deleting;
 *  - prints before/after proof that all business data is untouched.
 *
 * Run AFTER `npm run backup:snapshot`. Usage: npx tsx scripts/cleanup-test-accounts.ts
 */
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

loadEnvConfig(process.cwd());

const DISPOSABLE = ["eng1@gmail.com", "accountant1@gmail.com"];
const PRESERVED = ["emara01111@gmail.com", "alhemyari003@gmail.com"];

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// (table, column) pairs that could reference a user as owner/actor/assignee.
const OWNERSHIP: Array<[string, string]> = [
  ["clients", "created_by"],
  ["projects", "created_by"],
  ["project_financials", "updated_by"],
  ["project_members", "user_id"],
  ["project_members", "added_by"],
  ["tasks", "created_by"],
  ["tasks", "current_assignee_id"],
  ["task_events", "actor_id"],
  ["invoices", "created_by"],
  ["payments", "recorded_by"],
  ["invoice_events", "actor_id"],
  ["offers", "created_by"],
  ["offer_events", "actor_id"],
  ["attachments", "uploaded_by"],
  ["portfolio_items", "created_by"],
  ["notifications", "user_id"],
  ["user_permission_overrides", "user_id"],
  ["office_settings", "updated_by"],
];

const BUSINESS_TABLES = [
  "clients", "projects", "project_financials", "project_members", "tasks",
  "task_events", "invoices", "payments", "invoice_events", "offers",
  "offer_events", "attachments", "portfolio_items", "office_settings",
  "role_permissions", "audit_log",
];

async function counts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of BUSINESS_TABLES) {
    const { count, error } = await admin.from(t).select("*", { count: "exact", head: true });
    if (error) throw new Error(`${t}: ${error.message}`);
    out[t] = count ?? 0;
  }
  return out;
}

async function main() {
  const { data: list, error } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (error) throw error;

  const targets = list.users.filter((u) => DISPOSABLE.includes(u.email ?? ""));
  const preserved = list.users.filter((u) => PRESERVED.includes(u.email ?? ""));

  console.log(`Found ${targets.length} disposable target(s):`, targets.map((u) => u.email));
  console.log(`Preserved accounts present:`, preserved.map((u) => u.email));
  if (preserved.length !== PRESERVED.length) {
    throw new Error("SAFETY ABORT: not all preserved accounts found — refusing to proceed.");
  }

  // Re-verify zero ownership before deleting anything.
  for (const u of targets) {
    for (const [table, col] of OWNERSHIP) {
      const { count, error: e } = await admin
        .from(table)
        .select("*", { count: "exact", head: true })
        .eq(col, u.id);
      if (e) throw new Error(`${table}.${col}: ${e.message}`);
      if ((count ?? 0) > 0) {
        throw new Error(
          `SAFETY ABORT: ${u.email} owns ${count} row(s) in ${table}.${col} — manual review required.`,
        );
      }
    }
    console.log(`Verified: ${u.email} owns 0 rows across ${OWNERSHIP.length} ownership columns.`);
  }

  const before = await counts();

  for (const u of targets) {
    const { error: delErr } = await admin.auth.admin.deleteUser(u.id);
    if (delErr) throw new Error(`delete ${u.email}: ${delErr.message}`);
    console.log(`Deleted auth user + cascaded profile: ${u.email}`);
  }

  const after = await counts();
  let intact = true;
  for (const t of BUSINESS_TABLES) {
    const same = before[t] === after[t];
    if (!same) intact = false;
    console.log(`${same ? "OK " : "CHANGED"} ${t}: ${before[t]} -> ${after[t]}`);
  }

  const { data: remaining } = await admin.auth.admin.listUsers({ perPage: 200 });
  console.log("Remaining accounts:", remaining?.users.map((u) => u.email).sort());

  const { count: profileCount } = await admin
    .from("profiles")
    .select("*", { count: "exact", head: true });
  console.log("Remaining profiles:", profileCount);

  if (!intact) throw new Error("BUSINESS DATA CHANGED — restore from snapshot and investigate!");
  console.log("CLEANUP COMPLETE: business data fully intact.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
