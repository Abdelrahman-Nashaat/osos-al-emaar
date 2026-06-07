import { test, expect } from "@playwright/test";

test("unauthenticated root redirects to the Arabic RTL login", async ({ page }) => {
  await page.goto("/");
  await page.waitForURL("**/login");

  const html = page.locator("html");
  await expect(html).toHaveAttribute("dir", "rtl");
  await expect(html).toHaveAttribute("lang", "ar");

  await expect(page.getByText("أسس الإعمار")).toBeVisible();
  await expect(page.getByRole("button", { name: "تسجيل الدخول" })).toBeVisible();
});
