/**
 * Demo-seed engine — the reusable machinery, independent of the dataset.
 *
 * Philosophy: drive the REAL SECURITY DEFINER RPCs while signed in AS each
 * persona, so task/invoice/offer state, amount_paid, events, notifications and
 * audit rows are all computed by the same code that runs in production (never
 * hand-faked). Then a single service-role pass BACKDATES created_at / dates so
 * the office reads as months of history. Finally, notifications are curated to
 * a small realistic unread set.
 *
 * Target: the DEMO Supabase project only (ENV_FILE=.env.demo.local). The engine
 * refuses to run against a project whose URL matches the clean/production ref.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";

// ── Env loading (alternate file via ENV_FILE) ──────────────────────────────
const ENV_FILE = process.env.ENV_FILE ?? ".env.demo.local";
if (existsSync(ENV_FILE)) {
  for (const line of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

export const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

// Safety: never seed the clean/production project.
const PROTECTED_REF = "anqrrhqjkmvaymvkdjtj";
if (!URL || !ANON || !SERVICE) {
  console.error(`Missing demo env in ${ENV_FILE} (need URL + ANON + SERVICE_ROLE).`);
  process.exit(1);
}
if (URL.includes(PROTECTED_REF)) {
  console.error("REFUSING TO SEED: env points at the protected clean/production project.");
  process.exit(1);
}

export const admin: SupabaseClient = createClient(URL, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** A signed-in persona client (anon key + the persona's JWT). */
export type Persona = {
  key: string;
  email: string;
  fullName: string;
  role: "manager" | "engineer" | "accountant";
  active: boolean;
  id: string;
  client: SupabaseClient;
};

/** Create (or reuse) an auth user + profile, return a signed-in client. */
export async function ensurePersona(p: {
  key: string;
  email: string;
  fullName: string;
  role: "manager" | "engineer" | "accountant";
  password: string;
  active?: boolean;
}): Promise<Persona> {
  // Create the auth user (idempotent: reuse if already present).
  let id = "";
  const { data: created, error } = await admin.auth.admin.createUser({
    email: p.email,
    password: p.password,
    email_confirm: true,
  });
  if (error || !created?.user) {
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const existing = list?.users.find((u) => u.email === p.email);
    if (!existing) throw new Error(`ensurePersona ${p.email}: ${error?.message}`);
    id = existing.id;
    await admin.auth.admin.updateUserById(id, { password: p.password });
  } else {
    id = created.user.id;
  }

  await admin.from("profiles").upsert({
    id,
    email: p.email,
    full_name: p.fullName,
    role: p.role,
    is_active: p.active ?? true,
    must_change_password: false,
  });

  const client = createClient(URL, ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signErr } = await client.auth.signInWithPassword({
    email: p.email,
    password: p.password,
  });
  if (signErr) throw new Error(`sign-in ${p.email}: ${signErr.message}`);

  return {
    key: p.key,
    email: p.email,
    fullName: p.fullName,
    role: p.role,
    active: p.active ?? true,
    id,
    client,
  };
}

/** Call an RPC as a persona; throw with context on error. */
export async function rpc<T = unknown>(
  persona: Persona,
  fn: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await persona.client.rpc(fn, args);
  if (error) throw new Error(`rpc ${fn} as ${persona.key}: ${error.message}`);
  return data as T;
}

/** Backdate any table's created_at (+ optional extra columns) by primary key. */
export async function backdate(
  table: string,
  id: string | number,
  values: Record<string, unknown>,
  pk = "id",
): Promise<void> {
  const { error } = await admin.from(table).update(values).eq(pk, id);
  if (error) throw new Error(`backdate ${table}#${id}: ${error.message}`);
}

/** Deactivate a persona (mirrors the app's setMemberActive + auth ban). */
export async function deactivate(persona: Persona): Promise<void> {
  await admin.from("profiles").update({ is_active: false }).eq("id", persona.id);
  // 100 years ≈ "indefinite" — mirrors the app's ban-sync.
  await admin.auth.admin.updateUserById(persona.id, { ban_duration: "876000h" });
}

/**
 * Wipe all demo BUSINESS data (idempotent reset). Order respects FKs. Each
 * delete carries an always-true predicate on a column that always exists.
 */
export async function resetDemo(): Promise<void> {
  // [table, filterColumn] — created_at exists on most; the membership/financials
  // tables key on a project/user uuid instead.
  const steps: Array<[string, string]> = [
    ["notifications", "created_at"],
    ["invoice_events", "created_at"],
    ["payments", "created_at"],
    ["invoices", "created_at"],
    ["offer_events", "created_at"],
    ["offers", "created_at"],
    ["task_events", "created_at"],
    ["tasks", "created_at"],
    ["attachments", "created_at"],
    ["portfolio_items", "created_at"],
    ["project_members", "added_at"],
    ["project_financials", "created_at"],
    ["projects", "created_at"],
    ["clients", "created_at"],
    ["audit_log", "created_at"],
  ];
  for (const [table, col] of steps) {
    const { error } = await admin.from(table).delete().gte(col, "1900-01-01");
    if (error) throw new Error(`resetDemo ${table}: ${error.message}`);
  }
}

export function iso(date: string): string {
  return new Date(date + (date.length <= 10 ? "T09:00:00+03:00" : "")).toISOString();
}
