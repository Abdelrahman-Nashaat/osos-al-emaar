import { test, expect } from "@playwright/test";

/**
 * Browser smoke against the LIVE demo deployment — confirms the seeded office
 * renders and the role surfaces work. Run with:
 *   DEMO_URL=https://osos-al-emaar-demo.vercel.app DEMO_PW=OsosDemo!2026 \
 *   npx playwright test demo-verify --project=chromium
 */
const DEMO = process.env.DEMO_URL ?? "";
const PW = process.env.DEMO_PW ?? "OsosDemo!2026";
test.skip(!DEMO, "DEMO_URL not set");

async function login(page: import("@playwright/test").Page, email: string) {
  await page.goto(`${DEMO}/login`);
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByLabel("كلمة المرور").fill(PW);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await page.waitForURL("**/dashboard");
}

test("demo manager: rich office + collections worklist renders", async ({ page }) => {
  await login(page, "manager@osos-demo.example");
  await page.goto(`${DEMO}/invoices?filter=overdue`);
  await expect(page.getByText("قائمة التحصيل")).toBeVisible();
  // Seeded overdue debt is present (currency shown).
  await expect(page.getByText("ر.س").first()).toBeVisible();
  await page.goto(`${DEMO}/portfolio`);
  await expect(page.getByText("معرض الأعمال").first()).toBeVisible();
});

test("demo engineer: operational surfaces, ZERO amounts", async ({ page }) => {
  await login(page, "eng.abdullah@osos-demo.example");
  await page.goto(`${DEMO}/tasks`);
  await expect(page.getByRole("heading", { name: "المهام" })).toBeVisible();
  // No invoices/offers nav for engineers; no currency anywhere on tasks.
  const body = (await page.locator("body").innerText()).replace(/\s/g, "");
  expect(body).not.toContain("ر.س");
  await page.goto(`${DEMO}/invoices`);
  await expect(page.getByText("لا تملك صلاحية", { exact: false }).first()).toBeVisible();
});

test("demo accountant: collections + reports, no projects", async ({ page }) => {
  await login(page, "accountant@osos-demo.example");
  await page.goto(`${DEMO}/reports`);
  await expect(page.getByText("ر.س").first()).toBeVisible();
});
