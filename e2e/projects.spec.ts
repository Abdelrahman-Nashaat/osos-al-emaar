import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const admin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ts = Date.now();
const mgr = { email: `e2e-p-mgr-${ts}@example.com`, password: `Test!${ts}Mm`, name: "مدير المشاريع" };
const eng = { email: `e2e-p-eng-${ts}@example.com`, password: `Test!${ts}Ee`, name: "مهندس المشاريع" };
const acc = { email: `e2e-p-acc-${ts}@example.com`, password: `Test!${ts}Aa`, name: "محاسب المشاريع" };

let mgrId = "";
let engId = "";
let accId = "";
let clientId = "";
let projectId = "";

const CLIENT_NAME = `عميل اختبار ${ts}`;
const CLIENT_PHONE = "0500000777";
const PROJECT_NAME = `مشروع اختبار ${ts}`;
// Distinctive amount that must NEVER appear on any engineer-facing surface.
const BUDGET = 7654321;
const BUDGET_TEXT = "7,654,321";

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

/** A user-scoped Supabase client (anon key + signed-in session) → RLS applies. */
async function authedClient(email: string, password: string): Promise<SupabaseClient> {
  const c = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return c;
}

test.beforeAll(async () => {
  mgrId = await seedUser(mgr, "manager");
  engId = await seedUser(eng, "engineer");
  accId = await seedUser(acc, "accountant");

  const { data: c } = await admin
    .from("clients")
    .insert({ name: CLIENT_NAME, phone: CLIENT_PHONE, created_by: mgrId })
    .select("id")
    .single();
  clientId = c?.id ?? "";

  const { data: p } = await admin
    .from("projects")
    .insert({
      name: PROJECT_NAME,
      client_id: clientId,
      status: "active",
      progress: 40,
      due_date: "2026-01-01", // in the past → overdue
      created_by: mgrId,
    })
    .select("id")
    .single();
  projectId = p?.id ?? "";

  await admin
    .from("project_financials")
    .insert({ project_id: projectId, budget: BUDGET, updated_by: mgrId });
});

test.afterAll(async () => {
  if (projectId) {
    await admin.from("project_financials").delete().eq("project_id", projectId);
    await admin.from("project_members").delete().eq("project_id", projectId);
    await admin.from("projects").delete().eq("id", projectId);
  }
  // Any stray project created by the granted-engineer RLS test.
  await admin.from("projects").delete().ilike("name", "RLS مشروع%");
  await admin.from("user_permission_overrides").delete().eq("user_id", engId);
  if (clientId) await admin.from("clients").delete().eq("id", clientId);
  for (const id of [mgrId, engId, accId]) {
    if (!id) continue;
    await admin.from("profiles").delete().eq("id", id);
    await admin.auth.admin.deleteUser(id);
  }
});

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByLabel("كلمة المرور").fill(password);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await page.waitForURL("**/dashboard");
}

// ───────────────────── RLS proof (DB-level enforcement) ─────────────────────

test("engineer JWT: 0 rows from project_financials, but can read clients operationally", async () => {
  const c = await authedClient(eng.email, eng.password);

  const fin = await c.from("project_financials").select("*");
  expect(fin.data ?? []).toHaveLength(0); // hard financial isolation

  const cl = await c.from("clients").select("id, name");
  expect((cl.data ?? []).some((r) => r.id === clientId)).toBe(true); // operational read allowed
});

test("engineer JWT cannot write projects / clients / financials / members", async () => {
  const c = await authedClient(eng.email, eng.password);

  // INSERT project → blocked by with_check has_perm('projects.edit').
  const ins = await c
    .from("projects")
    .insert({ name: `RLS مشروع ${ts}`, status: "planning", progress: 0 })
    .select("id");
  expect(ins.error).not.toBeNull();

  // UPDATE client → policy filters all rows (0 updated, no error) → value unchanged.
  await c.from("clients").update({ name: "تلاعب" }).eq("id", clientId);
  const afterClient = await admin.from("clients").select("name").eq("id", clientId).single();
  expect(afterClient.data?.name).toBe(CLIENT_NAME);

  // INSERT financials → blocked by with_check is_manager().
  const finIns = await c.from("project_financials").insert({ project_id: projectId, budget: 1 });
  expect(finIns.error).not.toBeNull();

  // INSERT project_members → blocked (no projects.edit).
  const memIns = await c.from("project_members").insert({ project_id: projectId, user_id: engId });
  expect(memIns.error).not.toBeNull();
});

test("a granted engineer can add a project but cannot delete it, write financials, or read amounts", async () => {
  await admin
    .from("user_permission_overrides")
    .insert({ user_id: engId, permission_key: "projects.edit", allowed: true });

  const c = await authedClient(eng.email, eng.password);
  const ins = await c
    .from("projects")
    .insert({ name: `RLS مشروع منح ${ts}`, status: "planning", progress: 0 })
    .select("id")
    .single();
  expect(ins.error).toBeNull();
  expect(ins.data?.id).toBeTruthy();

  // Financial isolation holds even for a granted engineer.
  const fin = await c.from("project_financials").select("*");
  expect(fin.data ?? []).toHaveLength(0);

  // Granted projects.edit must NOT grant project delete (manager-only) → unchanged.
  await c.from("projects").delete().eq("id", projectId);
  const stillThere = await admin.from("projects").select("id").eq("id", projectId).maybeSingle();
  expect(stillThere.data?.id).toBe(projectId);

  // …nor any financial write (manager-only).
  const finWrite = await c.from("project_financials").insert({ project_id: projectId, budget: 1 });
  expect(finWrite.error).not.toBeNull();

  if (ins.data?.id) await admin.from("projects").delete().eq("id", ins.data.id);
  await admin
    .from("user_permission_overrides")
    .delete()
    .eq("user_id", engId)
    .eq("permission_key", "projects.edit");
});

test("accountant JWT reads clients + financials; writes financials (Phase 4) but not clients", async () => {
  const c = await authedClient(acc.email, acc.password);

  const cl = await c.from("clients").select("id, name");
  expect((cl.data ?? []).some((r) => r.id === clientId)).toBe(true);

  const fin = await c
    .from("project_financials")
    .select("project_id, budget")
    .eq("project_id", projectId);
  expect(fin.data ?? []).toHaveLength(1);
  expect(Number(fin.data?.[0]?.budget)).toBe(BUDGET);

  // UPDATE client → blocked (no clients.edit) → unchanged.
  await c.from("clients").update({ name: "تلاعب محاسب" }).eq("id", clientId);
  const afterClient = await admin.from("clients").select("name").eq("id", clientId).single();
  expect(afterClient.data?.name).toBe(CLIENT_NAME);

  // UPDATE financials → ALLOWED now: Phase 4 relaxed the write from is_manager() to
  // can_view_financials() so the accountant gets the finance UI. (Write `cost` to
  // prove it lands while leaving the seeded `budget` intact for the later UI tests.)
  await c.from("project_financials").update({ cost: 12345 }).eq("project_id", projectId);
  const afterFin = await admin
    .from("project_financials")
    .select("budget, cost")
    .eq("project_id", projectId)
    .single();
  expect(Number(afterFin.data?.cost)).toBe(12345); // accountant write landed
  expect(Number(afterFin.data?.budget)).toBe(BUDGET); // budget untouched
});

// ─────────────────────────── UI / role visibility ───────────────────────────

test("manager sees Projects + Clients nav, project detail, amount and overdue", async ({ page }) => {
  await login(page, mgr.email, mgr.password);
  await expect(page.getByRole("link", { name: "المشاريع" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "العملاء" }).first()).toBeVisible();

  await page.goto("/projects");
  await expect(page.getByText(PROJECT_NAME).first()).toBeVisible();
  await expect(page.getByText("متأخر").first()).toBeVisible(); // overdue detection

  await page.goto(`/projects/${projectId}`);
  await expect(page.getByRole("heading", { name: PROJECT_NAME })).toBeVisible();
  await expect(page.getByText(CLIENT_NAME).first()).toBeVisible();
  await expect(page.getByText(BUDGET_TEXT).first()).toBeVisible(); // manager sees the money
});

test("engineer sees project + client info but NEVER the amount; Clients module hidden", async ({
  page,
}) => {
  await login(page, eng.email, eng.password);

  await expect(page.getByRole("link", { name: "المشاريع" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "العملاء" })).toHaveCount(0);

  await page.goto("/projects");
  await expect(page.getByText(PROJECT_NAME).first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText(BUDGET_TEXT);

  await page.goto(`/projects/${projectId}`);
  await expect(page.getByText(CLIENT_NAME).first()).toBeVisible(); // operational client detail
  await expect(page.getByText(CLIENT_PHONE).first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText(BUDGET_TEXT); // no amount, anywhere
  await expect(page.locator("body")).not.toContainText("المالية"); // financials card absent

  await page.goto("/clients");
  await expect(page.getByText("لا تملك صلاحية الوصول")).toBeVisible();
});

test("accountant sees Clients (read-only) and is denied on Projects", async ({ page }) => {
  await login(page, acc.email, acc.password);

  await expect(page.getByRole("link", { name: "العملاء" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "المشاريع" })).toHaveCount(0);

  await page.goto("/clients");
  await expect(page.getByText(CLIENT_NAME).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "إضافة عميل" })).toHaveCount(0); // read-only

  await page.goto("/projects");
  await expect(page.getByText("لا تملك صلاحية الوصول")).toBeVisible();
});
