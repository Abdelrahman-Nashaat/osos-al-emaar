import { test, expect } from "@playwright/test";

test("app shell loads in Arabic RTL", async ({ page }) => {
  await page.goto("/");

  const html = page.locator("html");
  await expect(html).toHaveAttribute("dir", "rtl");
  await expect(html).toHaveAttribute("lang", "ar");

  await expect(page.getByText("أسس الإعمار")).toBeVisible();
  await expect(page.getByText("المرحلة ٠")).toBeVisible();
});
