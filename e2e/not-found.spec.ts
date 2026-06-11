import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// Phase 4.5 B4 — authenticated users must get the ARABIC not-found page (the
// English Next default was a UAT finding) on bad routes and missing entities.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const admin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ts = Date.now();
const mgr = { email: `e2e-nf-mgr-${ts}@example.com`, password: `Test!${ts}Mm`, name: "مدير ٤٠٤" };
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

test("bad routes and missing entities show the Arabic not-found page", async ({ page }) => {
  await login(page, mgr.email, mgr.password);

  const paths = [
    "/this-route-does-not-exist",
    `/tasks/${randomUUID()}`,
    `/invoices/${randomUUID()}`,
    `/projects/${randomUUID()}`,
  ];
  for (const path of paths) {
    await page.goto(path);
    await expect(
      page.getByText("الصفحة غير موجودة"),
      `expected Arabic 404 on ${path}`,
    ).toBeVisible();
    await expect(page.getByText("404: This page could not be found")).toHaveCount(0);
  }

  // The recovery link works.
  await page.getByRole("link", { name: "العودة إلى الرئيسية" }).click();
  await page.waitForURL("**/dashboard");
});
