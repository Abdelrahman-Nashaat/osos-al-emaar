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
let mgrId = "";
let clientId = "";
let projectId = "";

test.beforeAll(async () => {
  const created = await admin.auth.admin.createUser({
    email: mgr.email,
    password: mgr.password,
    email_confirm: true,
  });
  mgrId = created.data.user?.id ?? "";
  await admin
    .from("profiles")
    .insert({ id: mgrId, full_name: mgr.name, email: mgr.email, role: "manager" });

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
  if (mgrId) {
    await admin.from("profiles").delete().eq("id", mgrId);
    await admin.auth.admin.deleteUser(mgrId);
  }
});

async function loginManager(page: Page) {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill(mgr.email);
  await page.getByLabel("كلمة المرور").fill(mgr.password);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await page.waitForURL("**/dashboard");
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

test("notifications panel shows the push enable toggle @pwa", async ({ page }) => {
  await loginManager(page);
  await page.getByRole("button", { name: "الإشعارات", exact: true }).click();
  await expect(page.getByRole("button", { name: "تفعيل الإشعارات" })).toBeVisible();
});
