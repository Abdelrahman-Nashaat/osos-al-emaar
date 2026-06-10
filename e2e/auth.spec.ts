import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const admin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ts = Date.now();
const dis = { email: `e2e-auth-dis-${ts}@example.com`, password: `Test!${ts}Dd`, name: "موظف معطّل" };
let disId = "";

test.beforeAll(async () => {
  const created = await admin.auth.admin.createUser({
    email: dis.email,
    password: dis.password,
    email_confirm: true,
  });
  disId = created.data.user?.id ?? "";
  await admin
    .from("profiles")
    .insert({ id: disId, full_name: dis.name, email: dis.email, role: "engineer" });
});

test.afterAll(async () => {
  if (disId) {
    await admin.from("profiles").delete().eq("id", disId);
    await admin.auth.admin.deleteUser(disId);
  }
});

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByLabel("كلمة المرور").fill(password);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
}

test("invalid credentials show an Arabic error", async ({ page }) => {
  await login(page, "nobody@example.com", "wrongpassword");
  await expect(page.getByText("بيانات الدخول غير صحيحة")).toBeVisible();
});

test("a deactivated account sees the Arabic disabled message at login — no redirect loop (A4)", async ({
  page,
}) => {
  await admin.from("profiles").update({ is_active: false }).eq("id", disId);

  // Flag-only deactivation: sign-in succeeds upstream, the action signs out + explains.
  await login(page, dis.email, dis.password);
  await expect(page.getByText("تم تعطيل حسابك")).toBeVisible();
  expect(page.url()).toContain("/login");

  // Banned variant (what team.set_active applies): same Arabic message.
  await admin.auth.admin.updateUserById(disId, { ban_duration: "87600h" });
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page.getByText("تم تعطيل حسابك")).toBeVisible();
  await admin.auth.admin.updateUserById(disId, { ban_duration: "none" });
});

test("mid-session deactivation lands on /account-disabled with a working sign-out (A4)", async ({
  page,
}) => {
  await admin.from("profiles").update({ is_active: true }).eq("id", disId);

  await login(page, dis.email, dis.password);
  await page.waitForURL("**/dashboard");

  await admin.from("profiles").update({ is_active: false }).eq("id", disId);

  await page.goto("/dashboard");
  await page.waitForURL("**/account-disabled");
  await expect(page.getByText("الحساب معطّل").first()).toBeVisible();
  await expect(page.getByText("تم تعطيل حسابك")).toBeVisible();

  await page.getByRole("button", { name: "تسجيل الخروج" }).click();
  await page.waitForURL("**/login");
});
