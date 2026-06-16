import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Per-page authorization regression guard. Each page gates itself with its own
 * `can(perms, …)` check, so a regression can drop the gate on ONE route without
 * touching the others — these tests pin the routes NOT already covered by
 * rbac.spec (engineer→/team) and invoices.spec (engineer→/invoices):
 *   • accountant is denied the manager-only admin pages (/team, /settings/*)
 *   • engineer is denied the finance pages /reports and /offers
 *
 * ⚠️ Creates + deletes ephemeral users via the service role. Run ONLY against a
 * disposable/test Supabase — never the production project.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const admin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ts = Date.now();
const acc = { email: `e2e-iso-acc-${ts}@example.com`, password: `Test!${ts}Ac`, name: "محاسب العزل" };
const eng = { email: `e2e-iso-eng-${ts}@example.com`, password: `Test!${ts}En`, name: "مهندس العزل" };
let accId = "";
let engId = "";

async function seedUser(u: { email: string; password: string; name: string }, role: string) {
  const created = await admin.auth.admin.createUser({
    email: u.email,
    password: u.password,
    email_confirm: true,
  });
  const id = created.data.user?.id ?? "";
  await admin.from("profiles").insert({ id, full_name: u.name, email: u.email, role });
  return id;
}

test.beforeAll(async () => {
  accId = await seedUser(acc, "accountant");
  engId = await seedUser(eng, "engineer");
});

test.afterAll(async () => {
  for (const id of [accId, engId]) {
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

const DENIED = "لا تملك صلاحية الوصول";

test("accountant: sees finance nav but is denied the manager-only admin pages", async ({ page }) => {
  await login(page, acc.email, acc.password);

  // Finance surfaces ARE available to the accountant.
  await expect(page.getByRole("link", { name: "الفواتير" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "التقارير" }).first()).toBeVisible();

  // Admin surfaces are hidden from nav…
  await expect(page.getByRole("link", { name: "الفريق" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "الصلاحيات" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "النسخ الاحتياطي" })).toHaveCount(0);

  // …and blocked on direct navigation (defense beyond hiding the link).
  await page.goto("/team");
  await expect(page.getByText(DENIED)).toBeVisible();
  await page.goto("/settings/permissions");
  await expect(page.getByText(DENIED)).toBeVisible();
});

test("engineer: no finance nav and denied on /reports and /offers (zero money surfaces)", async ({
  page,
}) => {
  await login(page, eng.email, eng.password);

  await expect(page.getByRole("link", { name: "التقارير" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "العروض" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "الفواتير" })).toHaveCount(0);

  await page.goto("/reports");
  await expect(page.getByText(DENIED)).toBeVisible();
  await page.goto("/offers");
  await expect(page.getByText(DENIED)).toBeVisible();
});
