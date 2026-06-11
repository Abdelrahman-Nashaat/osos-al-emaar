import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// Phase 4.5 C3 — manager-only export; the route self-authenticates (the proxy
// matcher excludes /api/*).

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const admin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ts = Date.now();
const mgr = { email: `e2e-x-mgr-${ts}@example.com`, password: `Test!${ts}Mm`, name: "مدير تصدير" };
const eng = { email: `e2e-x-eng-${ts}@example.com`, password: `Test!${ts}Ee`, name: "مهندس تصدير" };
const CLIENT_NAME = `عميل تصدير ${ts}`;
let mgrId = "";
let engId = "";
let clientId = "";

test.beforeAll(async () => {
  for (const [u, role] of [
    [mgr, "manager"],
    [eng, "engineer"],
  ] as const) {
    const created = await admin.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
    });
    const id = created.data.user?.id ?? "";
    await admin.from("profiles").insert({ id, full_name: u.name, email: u.email, role });
    if (u === mgr) mgrId = id;
    else engId = id;
  }
  const { data: c } = await admin
    .from("clients")
    .insert({ name: CLIENT_NAME, created_by: mgrId })
    .select("id")
    .single();
  clientId = c?.id ?? "";
});

test.afterAll(async () => {
  if (clientId) await admin.from("clients").delete().eq("id", clientId);
  for (const id of [mgrId, engId]) {
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

test("manager gets the full JSON snapshot and per-entity CSV; both audited", async ({ page }) => {
  await login(page, mgr.email, mgr.password);

  const res = await page.request.get("/api/export?format=json");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-disposition"] ?? "").toContain("attachment");
  expect(res.headers()["cache-control"] ?? "").toContain("no-store");
  const body = (await res.json()) as Record<string, unknown>;
  for (const key of ["clients", "projects", "invoices", "payments", "tasks", "audit_log"]) {
    expect(Array.isArray(body[key]), `missing ${key}`).toBe(true);
  }
  expect(JSON.stringify(body.clients)).toContain(CLIENT_NAME);

  const csv = await page.request.get("/api/export?format=csv&entity=clients");
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"] ?? "").toContain("text/csv");
  expect(await csv.text()).toContain(CLIENT_NAME);

  const { data: audits } = await admin
    .from("audit_log")
    .select("id")
    .eq("action", "export.run")
    .eq("actor_id", mgrId);
  expect((audits ?? []).length).toBeGreaterThanOrEqual(2);

  // The backup page itself renders for the manager.
  await page.goto("/settings/backup");
  await expect(page.getByText("النسخ الاحتياطي والتصدير").first()).toBeVisible();
});

test("engineer and anonymous callers are denied", async ({ page, request }) => {
  // Anonymous (no cookies at all).
  const anon = await request.get("/api/export?format=json");
  expect(anon.status()).toBe(403);

  await login(page, eng.email, eng.password);
  const res = await page.request.get("/api/export?format=json");
  expect(res.status()).toBe(403);

  await page.goto("/settings/backup");
  await expect(page.getByText("لا تملك صلاحية الوصول")).toBeVisible();
});
