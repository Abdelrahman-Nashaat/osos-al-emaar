import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// Phase 4.5 B3 — @mobile: icon-only create buttons must keep an accessible name
// below the sm breakpoint (their visible label is hidden there).

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const admin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ts = Date.now();
const mgr = { email: `e2e-a11y-mgr-${ts}@example.com`, password: `Test!${ts}Mm`, name: "مدير وصول" };
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

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByLabel("كلمة المرور").fill(password);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await page.waitForURL("**/dashboard");
}

test("create buttons keep accessible names on small screens @mobile", async ({ page }) => {
  await login(page, mgr.email, mgr.password);

  const checks: Array<[string, string]> = [
    ["/projects", "مشروع جديد"],
    ["/tasks", "مهمة جديدة"],
    ["/invoices", "فاتورة جديدة"],
    ["/clients", "إضافة عميل"],
  ];
  for (const [path, name] of checks) {
    await page.goto(path);
    await expect(page.getByRole("button", { name })).toBeVisible();
  }
});
