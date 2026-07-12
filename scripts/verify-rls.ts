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
  let eng2Id = "";
  let tmpClientId = "";
  let tmpProjectId = "";

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

    // ── project_set_progress authority (migration 0025) ──
    const { data: cl } = await admin
      .from("clients")
      .insert({ name: `RLS Temp Client ${ts}` })
      .select("id")
      .single();
    tmpClientId = cl?.id ?? "";
    const { data: pr } = await admin
      .from("projects")
      .insert({ name: `RLS Temp Project ${ts}`, client_id: tmpClientId, progress: 10 })
      .select("id")
      .single();
    tmpProjectId = pr?.id ?? "";

    // Non-member engineer cannot move the progress.
    const { error: progDenied } = await eng.rpc("project_set_progress", {
      p_project: tmpProjectId,
      p_progress: 80,
    });
    assert(!!progDenied, "non-member engineer project_set_progress is DENIED (not_authorized)");
    const { data: afterDeny } = await admin
      .from("projects")
      .select("progress")
      .eq("id", tmpProjectId)
      .single();
    assert(afterDeny?.progress === 10, "denied call did NOT change progress");

    // Once added as a member, the engineer CAN move the progress.
    await admin.from("project_members").insert({ user_id: engId, project_id: tmpProjectId });
    const { error: progOk } = await eng.rpc("project_set_progress", {
      p_project: tmpProjectId,
      p_progress: 65,
    });
    assert(!progOk, "member engineer project_set_progress SUCCEEDS");
    const { data: afterOk } = await admin
      .from("projects")
      .select("progress")
      .eq("id", tmpProjectId)
      .single();
    assert(afterOk?.progress === 65, "member call updated progress to 65");

    // ── push_subscriptions isolation (migration 0028) ──
    // A second engineer owns a "foreign" subscription the first must never see.
    const eng2Email = `rls-eng2-${ts}@example.com`;
    const { data: created2 } = await admin.auth.admin.createUser({
      email: eng2Email,
      password,
      email_confirm: true,
    });
    eng2Id = created2.user?.id ?? "";
    await admin
      .from("profiles")
      .insert({ id: eng2Id, full_name: "RLS Test Engineer 2", email: eng2Email, role: "engineer" });
    await admin.from("push_subscriptions").insert({
      user_id: eng2Id,
      endpoint: `https://push.example/${ts}-foreign`,
      p256dh: "x",
      auth: "y",
    });

    // eng1 registers their own device through the definer RPC (no INSERT policy).
    const { error: subErr } = await eng.rpc("push_subscribe", {
      p_endpoint: `https://push.example/${ts}-eng1`,
      p_p256dh: "aa",
      p_auth: "bb",
      p_ua: "rls-test",
    });
    assert(!subErr, "engineer push_subscribe (own device) SUCCEEDS");

    // eng1 sees ONLY their own subscription (RLS: own rows only).
    const { data: mySubs } = await eng.from("push_subscriptions").select("endpoint, user_id");
    assert(
      (mySubs?.length ?? 0) === 1 && mySubs?.[0]?.user_id === engId,
      "engineer SELECT push_subscriptions returns ONLY their own row",
    );
    assert(
      !mySubs?.some((s) => s.endpoint.endsWith("-foreign")),
      "engineer canNOT see another user's subscription",
    );

    // eng1 cannot INSERT directly (writes must go through the definer fn).
    const { error: directIns } = await eng.from("push_subscriptions").insert({
      user_id: engId,
      endpoint: `https://push.example/${ts}-direct`,
      p256dh: "a",
      auth: "b",
    });
    assert(!!directIns, "engineer direct INSERT into push_subscriptions is blocked by RLS");

    // anon cannot read any subscriptions.
    const anonClient = createClient(url, anon, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: anonSubs } = await anonClient.from("push_subscriptions").select("id").limit(1);
    assert((anonSubs?.length ?? 0) === 0, "anon SELECT push_subscriptions returns 0 rows");

    // ── Financial push isolation (migrations 0022 + 0029) ──
    // Web Push (0029) forwards notification ROWS as-is; financial rows are only
    // ever created for manager/accountant (notify_invoice_event, 0022). So the
    // load-bearing invariant is: no engineer OWNS a financial notification — if
    // that holds, a financial push can never reach an engineer. Assert it across
    // ALL live data (read-only). (A behavioural proof — fire an invoice event,
    // confirm engineers get 0 recipients — can't run against a live project
    // because notify_invoice_event notifies every real manager/accountant; it is
    // verified in a rolled-back transaction during release checks instead.)
    const { data: engRows } = await admin.from("profiles").select("id").eq("role", "engineer");
    const engIds = (engRows ?? []).map((r) => r.id);
    if (engIds.length > 0) {
      const { data: engFin } = await admin
        .from("notifications")
        .select("id")
        .like("type", "invoice_%")
        .in("user_id", engIds);
      assert(
        (engFin?.length ?? 0) === 0,
        "no engineer owns any invoice_* notification (financial push isolation)",
      );
    }
  } finally {
    if (tmpProjectId) await admin.from("projects").delete().eq("id", tmpProjectId);
    if (tmpClientId) await admin.from("clients").delete().eq("id", tmpClientId);
    if (engId) {
      await admin.from("profiles").delete().eq("id", engId);
      await admin.auth.admin.deleteUser(engId);
    }
    if (eng2Id) {
      await admin.from("profiles").delete().eq("id", eng2Id);
      await admin.auth.admin.deleteUser(eng2Id);
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
