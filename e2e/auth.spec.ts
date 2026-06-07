import { test, expect } from "@playwright/test";

test("invalid credentials show an Arabic error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill("nobody@example.com");
  await page.getByLabel("كلمة المرور").fill("wrongpassword");
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();

  await expect(page.getByText("بيانات الدخول غير صحيحة")).toBeVisible();
});
