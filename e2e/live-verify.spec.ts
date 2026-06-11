import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Phase 4.5 Slice D — three-role verification against the LIVE deployment.
// Skipped unless LIVE_URL is set:  LIVE_URL=https://osos-al-emaar.vercel.app
// Seeds ONLY ZZZ-prefixed disposable rows and removes them in afterAll.

const LIVE = process.env.LIVE_URL ?? "";
test.skip(!LIVE, "LIVE_URL not set — live verification only runs on demand");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const admin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ts = Date.now();
const mgr = { email: `zzz-verify-mgr-${ts}@example.com`, password: `Zzz!${ts}Mgr#1`, name: "ZZZ مدير تحقق" };
const eng = { email: `zzz-verify-eng-${ts}@example.com`, password: `Zzz!${ts}Eng#1`, name: "ZZZ مهندس تحقق" };
const acc = { email: `zzz-verify-acc-${ts}@example.com`, password: `Zzz!${ts}Acc#1`, name: "ZZZ محاسب تحقق" };
const CLIENT_NAME = `ZZZ-VERIFY عميل ${ts}`;
const PROJECT_NAME = `ZZZ-VERIFY مشروع ${ts}`;
const TASK_TITLE = `ZZZ-VERIFY مهمة ${ts}`;
const BUDGET_TEXT = "333,333";
const CONTRACT_TEXT = "555,555";

let mgrId = "";
let engId = "";
let accId = "";
let clientId = "";
let projectId = "";
let taskId = "";
let invoiceId = "";
let invoiceNumber = "";

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
  mgrId = await seedUser(mgr, "manager");
  engId = await seedUser(eng, "engineer");
  accId = await seedUser(acc, "accountant");

  const { data: c } = await admin
    .from("clients")
    .insert({ name: CLIENT_NAME, created_by: mgrId })
    .select("id")
    .single();
  clientId = c?.id ?? "";

  const { data: p } = await admin
    .from("projects")
    .insert({ name: PROJECT_NAME, client_id: clientId, status: "active", created_by: mgrId })
    .select("id")
    .single();
  projectId = p?.id ?? "";

  await admin.from("project_financials").insert({
    project_id: projectId,
    budget: 333333,
    contract_value: 555555,
    updated_by: mgrId,
  });

  // Task + invoice via the real RPCs (manager-scoped client).
  const mc: SupabaseClient = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  await mc.auth.signInWithPassword({ email: mgr.email, password: mgr.password });
  const { data: t } = await mc.rpc("task_create", {
    p_title: TASK_TITLE,
    p_project: projectId,
    p_priority: "urgent",
    p_assignee: engId,
  });
  taskId = (t as unknown as string) ?? "";
  const { data: inv } = await mc.rpc("invoice_create", {
    p_project: projectId,
    p_subtotal: 1000,
    p_vat_rate: 15,
  });
  invoiceId = (inv as unknown as string) ?? "";
  const { data: invRow } = await admin
    .from("invoices")
    .select("invoice_number")
    .eq("id", invoiceId)
    .single();
  invoiceNumber = invRow?.invoice_number ?? "";
});

test.afterAll(async () => {
  // ZZZ cleanup — dependency order, never truncate.
  if (invoiceId) {
    await admin.from("payments").delete().eq("invoice_id", invoiceId);
    await admin.from("invoices").delete().eq("id", invoiceId);
  }
  if (projectId) {
    await admin.from("tasks").delete().eq("project_id", projectId);
    await admin.from("project_financials").delete().eq("project_id", projectId);
    await admin.from("project_members").delete().eq("project_id", projectId);
    await admin.from("projects").delete().eq("id", projectId);
  }
  if (clientId) await admin.from("clients").delete().eq("id", clientId);
  for (const id of [mgrId, engId, accId]) {
    if (!id) continue;
    await admin.from("audit_log").delete().eq("actor_id", id);
    await admin.from("profiles").delete().eq("id", id);
    await admin.auth.admin.deleteUser(id);
  }
});

async function liveLogin(page: Page, email: string, password: string) {
  await page.goto(`${LIVE}/login`);
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByLabel("كلمة المرور").fill(password);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await page.waitForURL("**/dashboard", { timeout: 30_000 });
}

test("manager: finance loop on the live deployment (send → pay → fresh → reports → backup)", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await liveLogin(page, mgr.email, mgr.password);

  // Finance widgets render (amounts visible to the manager).
  await expect(page.getByText("إجمالي المتبقّي")).toBeVisible();

  // Find the seeded draft via search, open it, send it, record a payment.
  await page.goto(`${LIVE}/invoices?q=${encodeURIComponent(invoiceNumber)}`);
  await page.getByRole("link", { name: new RegExp(invoiceNumber) }).first().click();
  await page.waitForURL("**/invoices/**");
  await page.getByRole("button", { name: "إرسال", exact: true }).click();
  await page.getByRole("button", { name: "إرسال", exact: true }).last().click();
  await expect(page.getByText("مُرسلة").first()).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "تسجيل دفعة" }).click();
  await page.getByLabel("المبلغ (ر.س)").fill("400");
  await page.getByRole("button", { name: "تسجيل الدفعة" }).click();
  // B5 freshness on the LIVE build: status + payment appear without reload.
  await expect(page.getByText("مدفوعة جزئياً").first()).toBeVisible({ timeout: 15_000 });

  // DB probe: the UI flow really committed (status + running balance).
  const probe = await admin
    .from("invoices")
    .select("status, amount_paid")
    .eq("id", invoiceId)
    .single();
  expect(probe.data?.status).toBe("partially_paid");
  expect(Number(probe.data?.amount_paid)).toBe(400);

  // Reports row for the ZZZ project (issued-only math: 1150 invoiced, 400 paid).
  await page.goto(`${LIVE}/reports?period=all`);
  const row = page.getByRole("row", { name: new RegExp(PROJECT_NAME) });
  await expect(row).toContainText("1,150");
  await expect(row).toContainText("400");

  // Backup page renders for the manager.
  await page.goto(`${LIVE}/settings/backup`);
  await expect(page.getByText("النسخ الاحتياطي والتصدير").first()).toBeVisible();

  // Arabic 404 for an authed user on the live build.
  await page.goto(`${LIVE}/zzz-bogus-${ts}`);
  await expect(page.getByText("الصفحة غير موجودة")).toBeVisible();
});

test("engineer: zero amounts anywhere; runs the task; nav is operational-only", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await liveLogin(page, eng.email, eng.password);

  // Sidebar (desktop): exactly the operational destinations.
  await expect(page.getByRole("link", { name: "المشاريع" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "المهام" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "الفواتير" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "التقارير" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "العملاء" })).toHaveCount(0);

  // Project detail: operational info, ZERO money digits (hard DOM check).
  await page.goto(`${LIVE}/projects/${projectId}`);
  await expect(page.getByRole("heading", { name: PROJECT_NAME })).toBeVisible();
  await expect(page.getByText(CLIENT_NAME).first()).toBeVisible();
  for (const amount of [BUDGET_TEXT, CONTRACT_TEXT, "1,150", invoiceNumber]) {
    await expect(page.locator("body")).not.toContainText(amount);
  }
  await expect(page.locator("body")).not.toContainText("المالية");

  // The tasks list shows the assignment with the «مهمتي» badge.
  await page.goto(`${LIVE}/tasks?filter=mine`);
  await expect(page.getByText(TASK_TITLE).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("مهمتي").first()).toBeVisible();

  // Works the task: start → submit; no close control.
  await page.goto(`${LIVE}/tasks/${taskId}`);
  await page.getByRole("button", { name: "بدء التنفيذ" }).click();
  await expect(page.getByRole("button", { name: "إرسال للمراجعة" })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "إرسال للمراجعة" }).click();
  await page.getByRole("button", { name: "إرسال", exact: true }).click();
  await expect(page.getByText("بانتظار المراجعة").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "إغلاق المهمة" })).toHaveCount(0);
});

test("accountant: records a payment, cannot void/delete, projects list denied", async ({
  page,
}) => {
  test.setTimeout(120_000);
  // Self-contained precondition: the invoice must be collectible regardless of
  // the manager test's UI path. Probe first (logs any cross-test anomaly).
  const pre = await admin.from("invoices").select("status").eq("id", invoiceId).single();
  console.log(`[live-verify] invoice status before accountant test: ${pre.data?.status}`);
  if (pre.data?.status === "draft") {
    const mc2: SupabaseClient = createClient(url, anon, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await mc2.auth.signInWithPassword({ email: mgr.email, password: mgr.password });
    await mc2.rpc("invoice_send", { p_invoice: invoiceId });
    await mc2.rpc("invoice_record_payment", { p_invoice: invoiceId, p_amount: 400 });
  }

  await liveLogin(page, acc.email, acc.password);

  await page.goto(`${LIVE}/invoices/${invoiceId}`);
  await expect(page.getByText(invoiceNumber).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "تسجيل دفعة" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "إلغاء", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "حذف" })).toHaveCount(0);

  await page.goto(`${LIVE}/projects`);
  await expect(page.getByText("لا تملك صلاحية الوصول")).toBeVisible();
});

test("deactivated account: Arabic disabled screen on the live build", async ({ browser }) => {
  test.setTimeout(90_000);
  await admin.from("profiles").update({ is_active: false }).eq("id", engId);
  try {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${LIVE}/login`);
    await page.getByLabel("البريد الإلكتروني").fill(eng.email);
    await page.getByLabel("كلمة المرور").fill(eng.password);
    await page.getByRole("button", { name: "تسجيل الدخول" }).click();
    await expect(page.getByText("تم تعطيل حسابك")).toBeVisible({ timeout: 20_000 });
    await ctx.close();
  } finally {
    await admin.from("profiles").update({ is_active: true }).eq("id", engId);
  }
});

test("mobile 360 on the live build: «المزيد» nav works for the manager", async ({ browser }) => {
  test.setTimeout(90_000);
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 } });
  const page = await ctx.newPage();
  await liveLogin(page, mgr.email, mgr.password);

  const nav = page.locator("nav.fixed.bottom-0");
  await expect(nav.getByRole("link", { name: "الرئيسية" })).toBeVisible();
  const more = nav.getByRole("button", { name: "المزيد" });
  await expect(more).toBeVisible();
  await more.click();
  await expect(page.locator("#more-sheet").getByRole("link", { name: "الفواتير" })).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await ctx.close();
});
