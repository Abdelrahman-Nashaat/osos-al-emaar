import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// Phase 4.5 C5 — forced first-login password change + manager reset (no SMTP).

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const admin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ts = Date.now();
const mgr = { email: `e2e-pw-mgr-${ts}@example.com`, password: `Test!${ts}Mm`, name: "مدير كلمات" };
const emp = { email: `e2e-pw-emp-${ts}@example.com`, password: `Temp!${ts}Ee`, name: "موظف مؤقت" };
const NEW_PASSWORD = `MyOwn!${ts}Secret`;
let mgrId = "";
let empId = "";

test.beforeAll(async () => {
  for (const [u, role, flag] of [
    [mgr, "manager", false],
    [emp, "engineer", true],
  ] as const) {
    const created = await admin.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
    });
    const id = created.data.user?.id ?? "";
    await admin.from("profiles").insert({
      id,
      full_name: u.name,
      email: u.email,
      role,
      must_change_password: flag,
    });
    if (u === mgr) mgrId = id;
    else empId = id;
  }
});

test.afterAll(async () => {
  for (const id of [mgrId, empId]) {
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
}

test("a temp-password account is forced to set its own password before using the app", async ({
  page,
}) => {
  await login(page, emp.email, emp.password);
  await page.waitForURL("**/account/password");
  await expect(page.getByText("تعيين كلمة المرور").first()).toBeVisible();

  // The gate is not skippable by direct navigation.
  await page.goto("/dashboard");
  await page.waitForURL("**/account/password");

  // Mismatch → inline Arabic error.
  await page.locator("#pw-new").fill(NEW_PASSWORD);
  await page.locator("#pw-confirm").fill(`${NEW_PASSWORD}x`);
  await page.getByRole("button", { name: "حفظ كلمة المرور" }).click();
  await expect(page.getByText("كلمتا المرور غير متطابقتين.")).toBeVisible();

  // Valid → lands on the dashboard; the flag is cleared in the DB.
  await page.locator("#pw-new").fill(NEW_PASSWORD);
  await page.locator("#pw-confirm").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "حفظ كلمة المرور" }).click();
  await page.waitForURL("**/dashboard");

  const { data } = await admin
    .from("profiles")
    .select("must_change_password")
    .eq("id", empId)
    .single();
  expect(data?.must_change_password).toBe(false);

  // Next login with the NEW password goes straight in.
  await page.context().clearCookies();
  await login(page, emp.email, NEW_PASSWORD);
  await page.waitForURL("**/dashboard");
});

test("manager reset issues a temp shown once and re-forces the change", async ({ page }) => {
  await login(page, mgr.email, mgr.password);
  await page.waitForURL("**/dashboard");
  await page.goto("/team");

  // Open the reset dialog for the employee row (manager's own button is disabled).
  await page.getByRole("button", { name: "إعادة تعيين كلمة المرور" }).last().click();
  await page.getByRole("button", { name: "إنشاء كلمة مؤقتة" }).click();
  const temp = (await page.locator("code").innerText()).trim();
  expect(temp.length).toBeGreaterThanOrEqual(16);

  // Audited, password never in the metadata.
  const { data: audits } = await admin
    .from("audit_log")
    .select("metadata")
    .eq("action", "team.reset_password")
    .eq("target_id", empId);
  expect((audits ?? []).length).toBeGreaterThan(0);
  expect(JSON.stringify(audits)).not.toContain(temp);

  // The employee logs in with the temp and is forced to change it again.
  await page.context().clearCookies();
  await login(page, emp.email, temp);
  await page.waitForURL("**/account/password");
});
