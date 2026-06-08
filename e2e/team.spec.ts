import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// Exercises the REAL manager "add staff" path (createTeamMember server action via the
// /team UI) — the flow that failed for Hamza in production with «تعذّر إنشاء الحساب.».
// rbac.spec.ts seeds users by calling the admin SDK directly, so it never covered this
// path; this spec closes that gap.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const admin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ts = Date.now();
const mgr = { email: `e2e-team-mgr-${ts}@example.com`, password: `Test!${ts}Mm`, name: "مدير الفريق" };
// Staff created THROUGH THE UI by the manager (the real createTeamMember path).
const newEng = { email: `e2e-team-eng-${ts}@example.com`, password: `Engineer!${ts}`, name: "مهندس جديد" };
const newAcc = { email: `e2e-team-acc-${ts}@example.com`, password: `Account!${ts}`, name: "محاسب جديد" };

let mgrId = "";

async function deleteByEmail(email: string) {
  const { data } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  const id = data?.id;
  if (!id) return;
  await admin.from("audit_log").delete().eq("target_id", id);
  await admin.from("profiles").delete().eq("id", id);
  await admin.auth.admin.deleteUser(id);
}

test.beforeAll(async () => {
  const created = await admin.auth.admin.createUser({
    email: mgr.email,
    password: mgr.password,
    email_confirm: true,
  });
  mgrId = created.data.user?.id ?? "";
  await admin
    .from("profiles")
    .insert({ id: mgrId, full_name: mgr.name, email: mgr.email, role: "manager" });
});

test.afterAll(async () => {
  // Staff the test created through the UI, then the seeded manager.
  await deleteByEmail(newEng.email);
  await deleteByEmail(newAcc.email);
  if (mgrId) {
    await admin.from("audit_log").delete().eq("actor_id", mgrId);
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

async function addMember(
  page: Page,
  m: { email: string; password: string; name: string },
  role: "engineer" | "accountant",
) {
  await page.goto("/team");
  await page.getByLabel("الاسم الكامل").fill(m.name);
  await page.getByLabel("البريد الإلكتروني").fill(m.email);
  await page.getByLabel("كلمة المرور المبدئية").fill(m.password);
  await page.selectOption("#role", role);
  await page.getByRole("button", { name: "إضافة موظف" }).click();
}

test("manager creates an engineer + accountant through the UI; both are audited and can log in", async ({
  page,
}) => {
  await login(page, mgr.email, mgr.password);

  // Create an engineer via the real createTeamMember server action (the failing path).
  await addMember(page, newEng, "engineer");
  await expect(page.getByText(newEng.email).first()).toBeVisible({ timeout: 15_000 });

  // Create an accountant.
  await addMember(page, newAcc, "accountant");
  await expect(page.getByText(newAcc.email).first()).toBeVisible({ timeout: 15_000 });

  // Persisted with the correct roles (DB-level proof).
  const { data: profs } = await admin
    .from("profiles")
    .select("id, role, email")
    .in("email", [newEng.email, newAcc.email]);
  expect((profs ?? []).find((p) => p.email === newEng.email)?.role).toBe("engineer");
  expect((profs ?? []).find((p) => p.email === newAcc.email)?.role).toBe("accountant");

  // Each creation wrote a team.create_member audit row.
  const ids = (profs ?? []).map((p) => p.id);
  const { data: audits } = await admin
    .from("audit_log")
    .select("target_id")
    .eq("action", "team.create_member")
    .in("target_id", ids);
  expect((audits ?? []).length).toBe(2);

  // The freshly created engineer can actually sign in.
  await page.context().clearCookies();
  await login(page, newEng.email, newEng.password);
  await expect(page).toHaveURL(/\/dashboard/);
});

test("a created engineer cannot reach Team or create staff", async ({ page }) => {
  await login(page, newEng.email, newEng.password);
  await expect(page.getByRole("link", { name: "الفريق" })).toHaveCount(0);
  await page.goto("/team");
  await expect(page.getByText("لا تملك صلاحية الوصول")).toBeVisible();
});

test("a created accountant cannot reach Team or create staff", async ({ page }) => {
  await login(page, newAcc.email, newAcc.password);
  await expect(page.getByRole("link", { name: "الفريق" })).toHaveCount(0);
  await page.goto("/team");
  await expect(page.getByText("لا تملك صلاحية الوصول")).toBeVisible();
});
