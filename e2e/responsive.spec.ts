import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// Phase 4.5 B1/B2 — @mobile: runs on the mobile-360/mobile-390/tablet-768
// projects (and never on desktop). Asserts zero page-level horizontal overflow
// and the per-role bottom-nav (≤4 cells incl. a working «المزيد» sheet).

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const admin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ts = Date.now();
const mgr = { email: `e2e-r-mgr-${ts}@example.com`, password: `Test!${ts}Mm`, name: "مدير متجاوب" };
const eng = { email: `e2e-r-eng-${ts}@example.com`, password: `Test!${ts}Ee`, name: "مهندس متجاوب" };
const acc = { email: `e2e-r-acc-${ts}@example.com`, password: `Test!${ts}Aa`, name: "محاسب متجاوب" };

let mgrId = "";
let engId = "";
let accId = "";
let clientId = "";
let projectId = "";

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
    .insert({ name: `عميل متجاوب ${ts}`, created_by: mgrId })
    .select("id")
    .single();
  clientId = c?.id ?? "";

  const { data: p } = await admin
    .from("projects")
    .insert({
      name: `مشروع متجاوب طويل الاسم للاختبار ${ts}`,
      code: "RWD-104",
      client_id: clientId,
      status: "active",
      created_by: mgrId,
    })
    .select("id")
    .single();
  projectId = p?.id ?? "";

  await admin
    .from("project_financials")
    .insert({ project_id: projectId, budget: 1234567, contract_value: 7654321, updated_by: mgrId });

  // A sent invoice with a payment so /projects/[id] + /invoices/[id] render the
  // previously-overflowing rows.
  const mgrClient = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  await mgrClient.auth.signInWithPassword({ email: mgr.email, password: mgr.password });
  const { data: invId } = await mgrClient.rpc("invoice_create", {
    p_project: projectId,
    p_subtotal: 123456,
    p_vat_rate: 15,
    p_due_date: "2026-01-01",
  });
  await mgrClient.rpc("invoice_send", { p_invoice: invId as unknown as string });
  await mgrClient.rpc("invoice_record_payment", {
    p_invoice: invId as unknown as string,
    p_amount: 1000,
    p_reference: `REF-${ts}-LONG-REFERENCE`,
  });
});

test.afterAll(async () => {
  if (projectId) {
    const { data: invs } = await admin.from("invoices").select("id").eq("project_id", projectId);
    const ids = (invs ?? []).map((i) => i.id);
    if (ids.length) {
      await admin.from("payments").delete().in("invoice_id", ids);
      await admin.from("invoices").delete().in("id", ids);
    }
    await admin.from("project_financials").delete().eq("project_id", projectId);
    await admin.from("tasks").delete().eq("project_id", projectId);
    await admin.from("projects").delete().eq("id", projectId);
  }
  if (clientId) await admin.from("clients").delete().eq("id", clientId);
  for (const id of [mgrId, engId, accId]) {
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

async function expectNoHorizontalOverflow(page: Page, path: string) {
  await page.goto(path); // server-rendered → 'load' is sufficient and stable
  const { overflow, culprits } = await page.evaluate(() => {
    const vw = window.innerWidth;
    const bad: string[] = [];
    document.querySelectorAll("body *").forEach((el) => {
      const r = el.getBoundingClientRect();
      // RTL pages overflow to the LEFT; LTR fragments to the right — check both.
      if (r.width > 0 && (r.right > vw + 1 || r.left < -1)) {
        const cls = (el as HTMLElement).className?.toString?.().slice(0, 60) ?? "";
        bad.push(`${el.tagName}[${cls}] L=${Math.round(r.left)} R=${Math.round(r.right)}`);
      }
    });
    return {
      overflow: document.documentElement.scrollWidth - vw,
      culprits: bad.slice(0, 6),
    };
  });
  expect(
    overflow,
    `${path} overflows by ${overflow}px → ${culprits.join(" | ")}`,
  ).toBeLessThanOrEqual(1);
}

const bottomNav = (page: Page) => page.locator("nav.fixed.bottom-0");

test("manager pages have no horizontal overflow @mobile", async ({ page }) => {
  test.setTimeout(120_000); // 7 routes; first-compile in dev can be slow
  await login(page, mgr.email, mgr.password);
  for (const path of [
    "/dashboard",
    "/projects",
    `/projects/${projectId}`,
    "/tasks",
    "/invoices",
    "/reports",
    "/reports?period=all",
  ]) {
    await expectNoHorizontalOverflow(page, path);
  }
});

test("manager bottom nav: 3 primaries + «المزيد» sheet navigates and highlights @mobile", async ({
  page,
}) => {
  await login(page, mgr.email, mgr.password);
  const nav = bottomNav(page);

  // ≤4 cells: الرئيسية، المهام، المشاريع + المزيد.
  await expect(nav.getByRole("link", { name: "الرئيسية" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "المهام" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "المشاريع" })).toBeVisible();
  const more = nav.getByRole("button", { name: "المزيد" });
  await expect(more).toBeVisible();
  await expect(nav.getByRole("link", { name: "الفواتير" })).toHaveCount(0);

  // The sheet holds the rest and navigates.
  await more.click();
  const sheet = page.locator("#more-sheet");
  await expect(sheet).toBeVisible();
  for (const label of ["العملاء", "الفواتير", "التقارير", "الفريق", "الصلاحيات"]) {
    await expect(sheet.getByRole("link", { name: label })).toBeVisible();
  }
  await sheet.getByRole("link", { name: "الفواتير" }).click();
  await page.waitForURL("**/invoices");
  await expect(sheet).toBeHidden();

  // Active route inside «المزيد» lights the trigger.
  await expect(bottomNav(page).getByRole("button", { name: "المزيد" })).toHaveClass(
    /text-primary/,
  );

  // ESC closes the sheet.
  await bottomNav(page).getByRole("button", { name: "المزيد" }).click();
  await expect(page.locator("#more-sheet")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#more-sheet")).toBeHidden();
});

test("engineer bottom nav: 3 primaries + «المزيد» with calendar/portfolio (no finance) @mobile", async ({
  page,
}) => {
  await login(page, eng.email, eng.password);
  const nav = bottomNav(page);
  await expect(nav.getByRole("link", { name: "الرئيسية" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "المشاريع" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "المهام" })).toBeVisible();
  const more = nav.getByRole("button", { name: "المزيد" });
  await expect(more).toBeVisible();

  // The sheet holds the product-completion modules — and NEVER finance/offers.
  await more.click();
  const sheet = page.locator("#more-sheet");
  await expect(sheet).toBeVisible();
  for (const label of ["التقويم", "معرض الأعمال"]) {
    await expect(sheet.getByRole("link", { name: label })).toBeVisible();
  }
  for (const label of ["الفواتير", "التقارير", "العروض"]) {
    await expect(sheet.getByRole("link", { name: label })).toHaveCount(0);
  }
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
});

test("accountant bottom nav: 3 primaries + «المزيد» (no projects/tasks/team) @mobile", async ({
  page,
}) => {
  await login(page, acc.email, acc.password);
  const nav = bottomNav(page);
  for (const label of ["الرئيسية", "الفواتير", "التقارير"]) {
    await expect(nav.getByRole("link", { name: label })).toBeVisible();
  }
  const more = nav.getByRole("button", { name: "المزيد" });
  await expect(more).toBeVisible();
  await more.click();
  const sheet = page.locator("#more-sheet");
  await expect(sheet).toBeVisible();
  for (const label of ["العملاء", "العروض", "التقويم", "معرض الأعمال"]) {
    await expect(sheet.getByRole("link", { name: label })).toBeVisible();
  }
  for (const label of ["المشاريع", "المهام", "الفريق", "الصلاحيات"]) {
    await expect(sheet.getByRole("link", { name: label })).toHaveCount(0);
  }
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
});

test("engineer project detail and tasks have no overflow and no amounts @mobile", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await login(page, eng.email, eng.password);
  for (const path of ["/dashboard", "/projects", `/projects/${projectId}`, "/tasks"]) {
    await expectNoHorizontalOverflow(page, path);
  }
  await page.goto(`/projects/${projectId}`);
  await expect(page.locator("body")).not.toContainText("7,654,321");
  await expect(page.locator("body")).not.toContainText("1,234,567");
});
