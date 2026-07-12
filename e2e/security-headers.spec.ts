import { test, expect } from "@playwright/test";

// Phase 4.5 A5 (static headers) + C7 (ENFORCED nonce CSP from proxy.ts).

test("security headers + enforced CSP are present on responses", async ({ request }) => {
  const res = await request.get("/login");
  const h = res.headers();

  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["permissions-policy"] ?? "").toContain("camera=(self)");
  expect(h["strict-transport-security"] ?? "").toContain("max-age=");

  const csp = h["content-security-policy"] ?? "";
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("'strict-dynamic'");
  expect(csp).toContain("'nonce-");
  expect(csp).toContain("worker-src 'self'"); // PWA service worker stays registrable
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  // Supabase REST + Realtime must stay reachable under the enforced policy.
  expect(csp).toMatch(/connect-src [^;]*https:\/\/[a-z0-9]+\.supabase\.co/);
  expect(csp).toMatch(/connect-src [^;]*wss:\/\/[a-z0-9]+\.supabase\.co/);
  // Signed Storage images (portfolio covers / inline attachments) must render.
  expect(csp).toMatch(/img-src [^;]*https:\/\/[a-z0-9]+\.supabase\.co/);

  // The Report-Only phase is over.
  expect(h["content-security-policy-report-only"]).toBeUndefined();
});

test("the app renders with zero CSP violations on the login page", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (msg) => {
    if (msg.text().includes("Content-Security-Policy") || msg.text().includes("Refused to")) {
      violations.push(msg.text());
    }
  });
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "تسجيل الدخول" })).toBeVisible();
  expect(violations).toEqual([]);
});
