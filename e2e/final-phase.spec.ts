import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Final-phase features — make-or-break + UI proofs for the product-completion
 * additions: collections worklist, task review/overdue tabs, payment receipt
 * (finance-gated), contact deep-links, temp-password generator, member project
 * progress, client tax fields, and the financial-isolation regression guard.
 * Seeds ZZZ users via the admin SDK; drives the real RPCs for finance state.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const admin: SupabaseClient = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ts = Date.now();
const mgr = { email: `zzz-fp-mgr-${ts}@example.com`, password: `Zzz!${ts}Mgr#1`, name: "ZZZ مدير ختامي" };
const eng = { email: `zzz-fp-eng-${ts}@example.com`, password: `Zzz!${ts}Eng#1`, name: "ZZZ مهندس عضو" };
const acc = { email: `zzz-fp-acc-${ts}@example.com`, password: `Zzz!${ts}Acc#1`, name: "ZZZ محاسب ختامي" };

let mgrId = "", engId = "", accId = "", clientId = "", projectId = "";
let overdueInvId = "", nullDueInvId = "", paidInvId = "", paidPaymentId = "";
let reversedInvId = "", reversedPaymentId = "";
let ec: SupabaseClient;

async function seedUser(u: { email: string; password: string; name: string }, role: string) {
  const created = await admin.auth.admin.createUser({ email: u.email, password: u.password, email_confirm: true });
  const id = created.data.user?.id ?? "";
  await admin.from("profiles").insert({ id, full_name: u.name, email: u.email, role });
  return id;
}
async function signed(u: { email: string; password: string }) {
  const c = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email: u.email, password: u.password });
  if (error) throw new Error(`sign-in: ${error.message}`);
  return c;
}
async function login(page: Page, u: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill(u.email);
  await page.getByLabel("كلمة المرور").fill(u.password);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await page.waitForURL("**/dashboard");
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  mgrId = await seedUser(mgr, "manager");
  engId = await seedUser(eng, "engineer");
  accId = await seedUser(acc, "accountant");

  // Client with phone + tax identity (so contact links + tax-invoice buyer block show).
  const { data: c } = await admin
    .from("clients")
    .insert({
      name: `ZZZ-FP عميل ${ts}`, phone: "0551234567", vat_number: "300999888700003",
      cr_number: "2050999888", created_by: mgrId,
    })
    .select("id").single();
  clientId = c?.id ?? "";

  // Project with the engineer as a member (so the progress editor shows for them).
  const { data: p } = await admin
    .from("projects")
    .insert({ name: `ZZZ-FP مشروع ${ts}`, client_id: clientId, status: "active", progress: 20, created_by: mgrId })
    .select("id").single();
  projectId = p?.id ?? "";
  await admin.from("project_financials").insert({ project_id: projectId, contract_value: 50000, cost: 20000, updated_by: mgrId });
  await admin.from("project_members").insert({ project_id: projectId, user_id: engId, added_by: mgrId });

  const mc = await signed(mgr);
  ec = await signed(eng);

  const past = (days: number) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

  // Overdue invoice: issued + sent, due 40 days ago, a partial payment + a follow-up note.
  overdueInvId = (await mc.rpc("invoice_create", {
    p_project: projectId, p_subtotal: 20000, p_vat_rate: 15, p_issue_date: past(60), p_due_date: past(40),
    p_description: "دفعة أولى — اختبار التحصيل",
  })).data as string;
  await mc.rpc("invoice_send", { p_invoice: overdueInvId });
  await mc.rpc("invoice_record_payment", { p_invoice: overdueInvId, p_amount: 5000, p_paid_at: past(35), p_method: "bank_transfer" });
  await mc.rpc("invoice_add_note", { p_invoice: overdueInvId, p_note: "اتصلنا بالعميل ووعد بالسداد نهاية الشهر." });

  // Invoice with NULL due date (sent) — should surface in the worklist warning.
  nullDueInvId = (await mc.rpc("invoice_create", {
    p_project: projectId, p_subtotal: 8000, p_vat_rate: 15, p_issue_date: past(20),
    p_description: "فاتورة بلا تاريخ استحقاق",
  })).data as string;
  await mc.rpc("invoice_send", { p_invoice: nullDueInvId });

  // Paid invoice → its payment drives the receipt route.
  paidInvId = (await mc.rpc("invoice_create", {
    p_project: projectId, p_subtotal: 10000, p_vat_rate: 15, p_issue_date: past(30), p_due_date: past(5),
    p_description: "أتعاب — مدفوعة بالكامل",
  })).data as string;
  await mc.rpc("invoice_send", { p_invoice: paidInvId });
  paidPaymentId = (await mc.rpc("invoice_record_payment", { p_invoice: paidInvId, p_amount: 11500, p_paid_at: past(3), p_method: "cheque" })).data as string;

  // A reversed payment (error-correction) — its receipt must NOT be printable (F1).
  reversedInvId = (await mc.rpc("invoice_create", {
    p_project: projectId, p_subtotal: 6000, p_vat_rate: 15, p_issue_date: past(25), p_due_date: past(10),
    p_description: "دفعة سُجِّلت بالخطأ ثم عُكِست",
  })).data as string;
  await mc.rpc("invoice_send", { p_invoice: reversedInvId });
  reversedPaymentId = (await mc.rpc("invoice_record_payment", { p_invoice: reversedInvId, p_amount: 6900, p_paid_at: past(8), p_method: "cash" })).data as string;
  await mc.rpc("payment_reverse", { p_payment: reversedPaymentId, p_note: "سُجِّلت على فاتورة خاطئة." });
});

test.afterAll(async () => {
  for (const id of [overdueInvId, nullDueInvId, paidInvId, reversedInvId]) {
    if (id) {
      await admin.from("payments").delete().eq("invoice_id", id);
      await admin.from("invoice_events").delete().eq("invoice_id", id);
      await admin.from("invoices").delete().eq("id", id);
    }
  }
  if (projectId) {
    await admin.from("project_members").delete().eq("project_id", projectId);
    await admin.from("project_financials").delete().eq("project_id", projectId);
    await admin.from("projects").delete().eq("id", projectId);
  }
  if (clientId) await admin.from("clients").delete().eq("id", clientId);
  await admin.from("audit_log").delete().in("actor_id", [mgrId, engId, accId].filter(Boolean));
  for (const id of [mgrId, engId, accId]) {
    if (id) { await admin.from("profiles").delete().eq("id", id); await admin.auth.admin.deleteUser(id); }
  }
});

test("collections worklist shows overdue debt, last follow-up, contact, and no-due-date warning", async ({ page }) => {
  await login(page, mgr);
  await page.goto("/invoices?filter=overdue");
  await expect(page.getByText("قائمة التحصيل")).toBeVisible();
  await expect(page.getByText("اتصلنا بالعميل ووعد بالسداد", { exact: false })).toBeVisible();
  // Outstanding (23000 - 5000 = 18000 incl. VAT) shown; client phone is a tel: link.
  await expect(page.locator('a[href^="tel:"]').first()).toBeVisible();
  // The NULL-due-date invoice is surfaced as a warning.
  await expect(page.getByText("غير محددة تاريخ الاستحقاق", { exact: false })).toBeVisible();
});

test("tasks page exposes the review + overdue filter tabs", async ({ page }) => {
  await login(page, mgr);
  await page.goto("/tasks");
  await expect(page.getByRole("link", { name: /بانتظار المراجعة/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /متأخرة/ })).toBeVisible();
});

test("payment receipt is finance-gated: accountant sees سند قبض, engineer is denied", async ({ page }) => {
  // Probe: confirm the seed produced a real, non-reversed payment id.
  const probe = await admin.from("payments").select("id, is_reversed, invoice_id").eq("id", paidPaymentId).maybeSingle();
  expect(probe.data, `paidPaymentId=${paidPaymentId} should exist`).not.toBeNull();
  expect(probe.data?.is_reversed).toBe(false);
  expect(probe.data?.invoice_id).toBe(paidInvId);

  await login(page, acc);
  // Sanity: the accountant session loads the plain invoice detail first.
  await page.goto(`/invoices/${paidInvId}`);
  await expect(page.getByText("أتعاب — مدفوعة بالكامل", { exact: false }).first()).toBeVisible();
  // Then the receipt route specifically.
  await page.goto(`/invoices/${paidInvId}/receipt/${paidPaymentId}`);
  await expect(page.getByText("سند قبض")).toBeVisible();
  await expect(page.getByText("استلمنا من", { exact: false })).toBeVisible();

  // Engineer hitting the same URL must NOT see the receipt (no financials.view).
  const ctx = await page.context().browser()!.newContext();
  const ep = await ctx.newPage();
  await login(ep, eng);
  await ep.goto(`/invoices/${paidInvId}/receipt/${paidPaymentId}`);
  await expect(ep.getByText("سند قبض")).toHaveCount(0);
  await ctx.close();

  // A reversed payment yields NO printable receipt by any path (F1 guard).
  await page.goto(`/invoices/${reversedInvId}/receipt/${reversedPaymentId}`);
  await expect(page.getByText("سند قبض")).toHaveCount(0);
});

test("client detail shows tap-to-call / WhatsApp deep links", async ({ page }) => {
  await login(page, mgr);
  await page.goto(`/clients/${clientId}`);
  await expect(page.locator('a[href^="tel:+966"]').first()).toBeVisible();
  await expect(page.locator('a[href^="https://wa.me/966"]').first()).toBeVisible();
  // Tax identity rendered.
  await expect(page.getByText("300999888700003")).toBeVisible();
});

test("team add-member: generate fills a strong password", async ({ page }) => {
  await login(page, mgr);
  await page.goto("/team");
  await page.getByRole("button", { name: "توليد" }).click();
  const value = await page.locator("#password").inputValue();
  expect(value.length).toBeGreaterThanOrEqual(12);
});

test("assigned engineer can update project progress; financial isolation holds", async ({ page }) => {
  await login(page, eng);
  await page.goto(`/projects/${projectId}`);
  // The member engineer sees the progress save control.
  await expect(page.getByRole("button", { name: "حفظ" })).toBeVisible();
  // And still reads ZERO financial rows for this project (regression guard).
  const { data: fin } = await ec.from("project_financials").select("*").eq("project_id", projectId);
  expect(fin?.length ?? 0).toBe(0);
  const { data: inv } = await ec.from("invoices").select("*").eq("project_id", projectId);
  expect(inv?.length ?? 0).toBe(0);
  const { data: pay } = await ec.from("payments").select("*");
  expect(pay?.length ?? 0).toBe(0);
});

test("invoice print carries the client's tax identity (buyer block)", async ({ page }) => {
  // The client has vat_number + cr_number → the printable invoice document
  // (hidden on screen, print:block) carries the buyer block. The «فاتورة ضريبية»
  // vs «مبسطة» heading additionally depends on the OFFICE being VAT-registered
  // (office_settings.vat_number) — not asserted here so we never mutate the
  // clean project's real letterhead settings.
  await login(page, mgr);
  await page.goto(`/invoices/${paidInvId}`);
  await expect(page.getByText("الرقم الضريبي للعميل", { exact: false })).toBeAttached();
  await expect(page.getByText("300999888700003")).toBeAttached();
  await expect(page.getByText("السجل التجاري", { exact: false }).first()).toBeAttached();
});
