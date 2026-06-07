import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const admin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ts = Date.now();
const mgr = { email: `e2e-mgr-${ts}@example.com`, password: `Test!${ts}Mm`, name: "مدير اختبار" };
const eng = { email: `e2e-eng-${ts}@example.com`, password: `Test!${ts}Ee`, name: "مهندس اختبار" };
let mgrId = "";
let engId = "";

test.beforeAll(async () => {
  const m = await admin.auth.admin.createUser({
    email: mgr.email,
    password: mgr.password,
    email_confirm: true,
  });
  mgrId = m.data.user?.id ?? "";
  await admin
    .from("profiles")
    .insert({ id: mgrId, full_name: mgr.name, email: mgr.email, role: "manager" });

  const e = await admin.auth.admin.createUser({
    email: eng.email,
    password: eng.password,
    email_confirm: true,
  });
  engId = e.data.user?.id ?? "";
  await admin
    .from("profiles")
    .insert({ id: engId, full_name: eng.name, email: eng.email, role: "engineer" });
});

test.afterAll(async () => {
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

test("manager sees Team and Permissions navigation", async ({ page }) => {
  await login(page, mgr.email, mgr.password);
  await expect(page.getByRole("link", { name: "الفريق" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "الصلاحيات" }).first()).toBeVisible();
});

test("engineer has no Team/Permissions nav and is denied on /team", async ({ page }) => {
  await login(page, eng.email, eng.password);
  await expect(page.getByRole("link", { name: "الفريق" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "الصلاحيات" })).toHaveCount(0);

  await page.goto("/team");
  await expect(page.getByText("لا تملك صلاحية الوصول")).toBeVisible();
});
