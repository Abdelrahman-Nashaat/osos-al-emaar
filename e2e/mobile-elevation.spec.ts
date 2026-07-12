import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// Mobile-elevation slices: install metadata, camera capture, push subscribe
// (@pwa), quick-add FAB, native share, and financial-isolation guards.
// Manager seeded via the admin SDK (same pattern as e2e/pwa.spec.ts).

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const admin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ts = Date.now();
const mgr = { email: `e2e-mob-mgr-${ts}@example.com`, password: `Test!${ts}Mm`, name: "مدير موبايل" };
const eng = { email: `e2e-mob-eng-${ts}@example.com`, password: `Test!${ts}En`, name: "مهندس موبايل" };
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
    .insert({ name: `عميل موبايل ${ts}`, created_by: mgrId })
    .select("id")
    .single();
  clientId = c?.id ?? "";
  const { data: p } = await admin
    .from("projects")
    .insert({ name: `مشروع موبايل ${ts}`, client_id: clientId, status: "active", created_by: mgrId })
    .select("id")
    .single();
  projectId = p?.id ?? "";
});

test.afterAll(async () => {
  if (projectId) await admin.from("projects").delete().eq("id", projectId);
  if (clientId) await admin.from("clients").delete().eq("id", clientId);
  for (const id of [mgrId, engId]) {
    if (!id) continue;
    await admin.from("profiles").delete().eq("id", id);
    await admin.auth.admin.deleteUser(id);
  }
});

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByLabel("كلمة المرور").fill(password);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await page.waitForURL("**/dashboard");
}

async function loginManager(page: Page) {
  await loginAs(page, mgr.email, mgr.password);
}

test("manifest exposes install metadata + shortcuts", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBeTruthy();
  const m = await res.json();
  expect(m.id).toBe("/dashboard");
  expect(m.scope).toBe("/");
  expect(m.display).toBe("standalone");
  expect(Array.isArray(m.shortcuts)).toBeTruthy();
  const urls = m.shortcuts.map((s: { url: string }) => s.url);
  expect(urls).toContain("/tasks");
  expect(urls).toContain("/tasks?compose=1");
  expect(Array.isArray(m.screenshots)).toBeTruthy();
});

test("push dispatch route rejects unauthenticated callers", async ({ request }) => {
  // Security guard: the dispatch route must NEVER process a notification without
  // the shared bearer secret. A missing/wrong Authorization header must be
  // refused (401 when configured, 503 when the secret isn't set) — never 200.
  const noAuth = await request.post("/api/push/dispatch", {
    data: { notification_id: 1 },
    headers: { "Content-Type": "application/json" },
    failOnStatusCode: false,
  });
  expect([401, 503]).toContain(noAuth.status());

  const wrongAuth = await request.post("/api/push/dispatch", {
    data: { notification_id: 1 },
    headers: { "Content-Type": "application/json", Authorization: "Bearer definitely-wrong" },
    failOnStatusCode: false,
  });
  expect([401, 503]).toContain(wrongAuth.status());
});

test("Android install banner appears on beforeinstallprompt @mobile", async ({ page }) => {
  await loginManager(page);
  await page.evaluate(() => {
    const e = new Event("beforeinstallprompt") as Event & {
      prompt?: () => Promise<void>;
      userChoice?: Promise<{ outcome: string }>;
    };
    e.prompt = () => Promise.resolve();
    e.userChoice = Promise.resolve({ outcome: "accepted" });
    window.dispatchEvent(e);
  });
  await expect(page.getByRole("button", { name: "ثبّت التطبيق" })).toBeVisible();
});

test("attachments card exposes a camera capture input @mobile", async ({ page }) => {
  await loginManager(page);
  await page.goto(`/projects/${projectId}`);
  const cam = page.locator('input[accept="image/*"][capture="environment"]');
  await expect(cam).toHaveCount(1);
  await expect(page.getByRole("button", { name: "التقاط صورة", exact: true })).toBeVisible();
});

test("quick-add FAB: manager can open «مهمة جديدة» which deep-links to the composer @mobile", async ({
  page,
}) => {
  await loginManager(page);
  const fab = page.getByRole("button", { name: "إضافة سريعة" });
  await expect(fab).toBeVisible();
  await fab.click();
  await page.getByRole("menuitem", { name: "مهمة جديدة" }).click();
  // Deep link lands on /tasks and the ?compose=1 param auto-opens the composer.
  await page.waitForURL("**/tasks?compose=1");
  await expect(page.getByLabel("عنوان المهمة")).toBeVisible();
});

test("quick-add FAB: a view-only engineer sees no quick-add (no create perms) @mobile", async ({
  page,
}) => {
  await loginAs(page, eng.email, eng.password);
  await expect(page.getByRole("button", { name: "إضافة سريعة" })).toHaveCount(0);
});

test("notifications panel shows the push enable toggle @pwa", async ({ page }) => {
  await loginManager(page);
  await page.getByRole("button", { name: "الإشعارات", exact: true }).click();
  await expect(page.getByRole("button", { name: "تفعيل الإشعارات" })).toBeVisible();
});
