import { test, expect, type Browser, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Phase 4.5 C2 — operational Realtime: a manager's change appears on the
// engineer's open page WITHOUT a reload (publication 0015 + RealtimeRefresh).
// The finance-exclusion regression check runs in the gate (OPERATIONS.md):
// pg_publication_tables must never contain a finance table.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const admin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ts = Date.now();
const mgr = { email: `e2e-rt-mgr-${ts}@example.com`, password: `Test!${ts}Mm`, name: "مدير مباشر" };
const eng = { email: `e2e-rt-eng-${ts}@example.com`, password: `Test!${ts}Ee`, name: "مهندس مباشر" };
const TASK_TITLE = `مهمة مباشرة ${ts}`;
let mgrId = "";
let engId = "";
let clientId = "";
let projectId = "";

async function seedUser(u: { email: string; password: string; name: string }, role: string) {
  const created = await admin.auth.admin.createUser({
    email: u.email,
    password: u.password,
    email_confirm: true,
  });
  const id = created.data.user?.id ?? "";
  await admin.from("profiles").insert({ id, full_name: u.name, email: u.email, role });
  return id;
}

test.beforeAll(async () => {
  mgrId = await seedUser(mgr, "manager");
  engId = await seedUser(eng, "engineer");
  const { data: c } = await admin
    .from("clients")
    .insert({ name: `عميل مباشر ${ts}`, created_by: mgrId })
    .select("id")
    .single();
  clientId = c?.id ?? "";
  const { data: p } = await admin
    .from("projects")
    .insert({ name: `مشروع مباشر ${ts}`, client_id: clientId, status: "active", created_by: mgrId })
    .select("id")
    .single();
  projectId = p?.id ?? "";
});

test.afterAll(async () => {
  if (projectId) {
    await admin.from("tasks").delete().eq("project_id", projectId);
    await admin.from("projects").delete().eq("id", projectId);
  }
  if (clientId) await admin.from("clients").delete().eq("id", clientId);
  for (const id of [mgrId, engId]) {
    if (!id) continue;
    await admin.from("profiles").delete().eq("id", id);
    await admin.auth.admin.deleteUser(id);
  }
});

async function loginPage(browser: Browser, email: string, password: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByLabel("كلمة المرور").fill(password);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await page.waitForURL("**/dashboard");
  return page;
}

test("a new task appears on the engineer's open /tasks page without a reload", async ({
  browser,
}) => {
  test.setTimeout(120_000);

  // Step 1 — infra proof (node-level): an ENGINEER subscription over the 0015
  // publication receives the INSERT under RLS. Isolates publication/RLS issues
  // from UI wiring.
  const ec: SupabaseClient = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: engAuth, error: engAuthErr } = await ec.auth.signInWithPassword({
    email: eng.email,
    password: eng.password,
  });
  expect(engAuthErr).toBeNull();
  ec.realtime.setAuth(engAuth.session?.access_token ?? "");
  const gotInsert = new Promise<boolean>((resolve) => {
    const t = setTimeout(() => resolve(false), 25_000);
    ec.channel("e2e-rt-proof")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "tasks" }, () => {
        clearTimeout(t);
        resolve(true);
      })
      .subscribe();
  });
  await new Promise((r) => setTimeout(r, 2000)); // allow the join to settle

  const probe = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  await probe.auth.signInWithPassword({ email: mgr.email, password: mgr.password });
  const { error: probeErr } = await probe.rpc("task_create", {
    p_title: `مسبار مباشر ${ts}`,
    p_project: projectId,
    p_priority: "normal",
  });
  expect(probeErr).toBeNull();
  expect(await gotInsert, "engineer subscription must receive the INSERT (publication/RLS)").toBe(
    true,
  );
  await ec.removeAllChannels();

  // Step 2 — UI proof: the open page refreshes itself.
  const engineerPage = await loginPage(browser, eng.email, eng.password);
  await engineerPage.goto("/tasks");
  await expect(engineerPage.getByText(TASK_TITLE)).toHaveCount(0);
  // Give the realtime channel a moment to join before the change happens.
  await engineerPage.waitForTimeout(2500);

  const mc: SupabaseClient = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  await mc.auth.signInWithPassword({ email: mgr.email, password: mgr.password });
  const { error } = await mc.rpc("task_create", {
    p_title: TASK_TITLE,
    p_project: projectId,
    p_priority: "urgent",
    p_assignee: engId,
  });
  expect(error).toBeNull();

  // RealtimeRefresh → router.refresh() — the row shows up with NO reload call.
  await expect(engineerPage.getByText(TASK_TITLE).first()).toBeVisible({ timeout: 20_000 });
  await engineerPage.context().close();
});
