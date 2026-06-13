/**
 * Live three-role isolation proof against the DEMO database. Signs in as the
 * seeded personas (anon key + password) and asserts RLS holds: engineers read
 * ZERO financial rows; manager/accountant read financials; the deactivated
 * engineer cannot sign in.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.demo.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PW = process.env.DEMO_PASSWORD ?? "OsosDemo!2026";

let fails = 0;
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"}: ${m}`); if (!c) fails++; };

async function signed(email) {
  const c = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PW });
  return { c, error };
}
async function count(c, table, filter) {
  let q = c.from(table).select("*", { count: "exact", head: true });
  if (filter) q = filter(q);
  const { count, error } = await q;
  return error ? -1 : (count ?? 0);
}

const mgr = await signed("manager@osos-demo.example");
ok(!mgr.error, "manager signs in");
ok((await count(mgr.c, "invoices")) > 0, "manager reads invoices (>0)");
ok((await count(mgr.c, "project_financials")) > 0, "manager reads project_financials (>0)");
ok((await count(mgr.c, "offers")) > 0, "manager reads offers (>0)");

const eng = await signed("eng.abdullah@osos-demo.example");
ok(!eng.error, "engineer signs in");
ok((await count(eng.c, "project_financials")) === 0, "engineer reads 0 project_financials (ISOLATION)");
ok((await count(eng.c, "invoices")) === 0, "engineer reads 0 invoices (ISOLATION)");
ok((await count(eng.c, "payments")) === 0, "engineer reads 0 payments (ISOLATION)");
ok((await count(eng.c, "offers")) === 0, "engineer reads 0 offers (ISOLATION)");
ok((await count(eng.c, "tasks")) > 0, "engineer reads tasks operationally (>0)");
ok((await count(eng.c, "projects")) > 0, "engineer reads projects operationally (>0)");

const acc = await signed("accountant@osos-demo.example");
ok(!acc.error, "accountant signs in");
ok((await count(acc.c, "invoices")) > 0, "accountant reads invoices (>0)");
ok((await count(acc.c, "payments")) > 0, "accountant reads payments (>0)");
ok((await count(acc.c, "tasks")) === 0, "accountant reads 0 tasks (no tasks.view)");

const majed = await signed("eng.majed@osos-demo.example");
ok(!!majed.error, "DEACTIVATED engineer cannot sign in (banned)");

console.log(fails === 0 ? "\nDEMO ISOLATION VERIFIED — all checks passed." : `\n${fails} CHECK(S) FAILED.`);
process.exit(fails === 0 ? 0 : 1);
