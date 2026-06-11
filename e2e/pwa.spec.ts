import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// Phase 4.5 C1 — @pwa (runs only on the "pwa" project, service workers ALLOWED):
// the worker must never cache authenticated HTML/RSC/API, and offline must show
// the Arabic fallback page.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const admin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ts = Date.now();
const mgr = { email: `e2e-pwa-mgr-${ts}@example.com`, password: `Test!${ts}Mm`, name: "مدير PWA" };
let mgrId = "";

test.beforeAll(async () => {
  const created = await admin.auth.admin.createUser({
    email: mgr.email,
    password: mgr.password,
    email_confirm: true,
  });
  mgrId = created.data.user?.id ?? "";
  await admin.from("profiles").insert({ id: mgrId, full_name: mgr.name, email: mgr.email, role: "manager" });
});

test.afterAll(async () => {
  if (mgrId) {
    await admin.from("profiles").delete().eq("id", mgrId);
    await admin.auth.admin.deleteUser(mgrId);
  }
});

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill(mgr.email);
  await page.getByLabel("كلمة المرور").fill(mgr.password);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await page.waitForURL("**/dashboard");
}

test("service worker never caches authenticated pages; offline shows the Arabic page @pwa", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await login(page);

  // pwa-register only runs in production builds — register manually (same file).
  await page.evaluate(async () => {
    await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
  });

  // Browse authenticated pages THROUGH the worker.
  await page.goto("/tasks");
  await page.goto("/dashboard");

  const cacheInfo = await page.evaluate(async () => {
    const names = await caches.keys();
    const osos = await caches.open("osos-v2");
    const keys = (await osos.keys()).map((r) => new URL(r.url).pathname);
    return { names, keys };
  });

  expect(cacheInfo.names).toContain("osos-v2");
  expect(cacheInfo.names).not.toContain("osos-shell-v1"); // old cache strategy purged
  expect(cacheInfo.keys).toContain("/offline.html");
  // The locked rule: NO authenticated document or API response in CacheStorage.
  const forbidden = cacheInfo.keys.filter(
    (k) => k === "/" || k === "/dashboard" || k === "/tasks" || k.startsWith("/api/"),
  );
  expect(forbidden).toEqual([]);

  // Offline navigation falls back to the Arabic page (financial data is never
  // available offline — by design).
  await context.setOffline(true);
  await page.goto("/projects").catch(() => {});
  await expect(page.getByText("لا يوجد اتصال بالإنترنت")).toBeVisible();
  await context.setOffline(false);
});
