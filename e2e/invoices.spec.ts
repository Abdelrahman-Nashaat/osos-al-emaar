import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const admin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ts = Date.now();
const mgr = { email: `e2e-i-mgr-${ts}@example.com`, password: `Test!${ts}Mm`, name: "مدير المالية" };
const acc = { email: `e2e-i-acc-${ts}@example.com`, password: `Test!${ts}Ac`, name: "محاسب المالية" };
const eng = { email: `e2e-i-eng-${ts}@example.com`, password: `Test!${ts}En`, name: "مهندس المالية" };

let mgrId = "";
let accId = "";
let engId = "";
let clientId = "";
let projectId = "";

// Distinctive invoice amount that must NEVER appear on any engineer-facing surface.
const INVOICE_AMOUNT = 7654321;
const INVOICE_AMOUNT_TEXT = "7,654,321";
const SEED_BUDGET = 998877;

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

/** A user-scoped Supabase client (anon key + signed-in session) → RLS applies. */
async function authedClient(email: string, password: string): Promise<SupabaseClient> {
  const c = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return c;
}

/** Create an invoice through the lifecycle RPC (the only creation path). Returns its id. */
async function rpcCreateInvoice(
  c: SupabaseClient,
  opts: { subtotal: number; vat: number; due?: string },
): Promise<string> {
  const { data, error } = await c.rpc("invoice_create", {
    p_project: projectId,
    p_subtotal: opts.subtotal,
    p_vat_rate: opts.vat,
    ...(opts.due ? { p_due_date: opts.due } : {}),
  });
  if (error) throw error;
  return data as unknown as string;
}

test.beforeAll(async () => {
  mgrId = await seedUser(mgr, "manager");
  accId = await seedUser(acc, "accountant");
  engId = await seedUser(eng, "engineer");

  const { data: c } = await admin
    .from("clients")
    .insert({ name: `عميل مالية ${ts}`, created_by: mgrId })
    .select("id")
    .single();
  clientId = c?.id ?? "";

  const { data: p } = await admin
    .from("projects")
    .insert({ name: `مشروع مالية ${ts}`, client_id: clientId, status: "active", created_by: mgrId })
    .select("id")
    .single();
  projectId = p?.id ?? "";

  await admin
    .from("project_financials")
    .insert({ project_id: projectId, budget: SEED_BUDGET, updated_by: mgrId });
});

test.afterAll(async () => {
  if (projectId) {
    const { data: invs } = await admin.from("invoices").select("id").eq("project_id", projectId);
    const invIds = (invs ?? []).map((i) => i.id);
    if (invIds.length) {
      await admin.from("payments").delete().in("invoice_id", invIds); // restrict → before invoices
      await admin.from("invoices").delete().in("id", invIds); // invoice_events cascade
    }
    await admin.from("project_financials").delete().eq("project_id", projectId);
    await admin.from("projects").delete().eq("id", projectId);
  }
  if (clientId) await admin.from("clients").delete().eq("id", clientId);
  for (const id of [mgrId, accId, engId]) {
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

// ───────────────────── RLS / RPC proof (DB-level enforcement) ────────────────

test("engineer JWT: 0 rows from every finance table; direct writes + finance RPCs denied", async () => {
  const ac = await authedClient(acc.email, acc.password);
  const invId = await rpcCreateInvoice(ac, { subtotal: 1000, vat: 15 });

  const e = await authedClient(eng.email, eng.password);

  expect((await e.from("invoices").select("*")).data ?? []).toHaveLength(0);
  expect((await e.from("payments").select("*")).data ?? []).toHaveLength(0);
  expect((await e.from("invoice_events").select("*")).data ?? []).toHaveLength(0);
  expect((await e.from("project_financials").select("*")).data ?? []).toHaveLength(0);

  // Direct writes are impossible — the finance tables have no INSERT/UPDATE/DELETE policy.
  const insInv = await e
    .from("invoices")
    .insert({ invoice_number: `X-${ts}`, project_id: projectId, client_id: clientId, subtotal: 1, total: 1 })
    .select("id");
  expect(insInv.error).not.toBeNull();
  const insPay = await e.from("payments").insert({ invoice_id: invId, amount: 1 }).select("id");
  expect(insPay.error).not.toBeNull();

  // Every finance RPC is denied for an engineer (not_authorized).
  expect((await e.rpc("invoice_create", { p_project: projectId, p_subtotal: 100 })).error).not.toBeNull();
  expect((await e.rpc("invoice_send", { p_invoice: invId })).error).not.toBeNull();
  expect((await e.rpc("invoice_record_payment", { p_invoice: invId, p_amount: 10 })).error).not.toBeNull();
  expect((await e.rpc("invoice_void", { p_invoice: invId })).error).not.toBeNull();
  expect((await e.rpc("payment_reverse", { p_payment: invId })).error).not.toBeNull();
});

test("accountant: creates (VAT computed + audited), sends, records payments; cannot void/delete/reverse", async () => {
  const ac = await authedClient(acc.email, acc.password);

  // VAT is DB-enforced to {0, 15}: 7.5 (or any other value) is rejected.
  expect((await ac.rpc("invoice_create", { p_project: projectId, p_subtotal: 1000, p_vat_rate: 7.5 })).error).not.toBeNull();

  const invId = await rpcCreateInvoice(ac, { subtotal: 1000, vat: 15 });
  const created = await admin
    .from("invoices")
    .select("status, vat_amount, total")
    .eq("id", invId)
    .single();
  expect(created.data?.status).toBe("draft");
  expect(Number(created.data?.total)).toBe(1150); // subtotal + 15% VAT
  expect(Number(created.data?.vat_amount)).toBe(150);
  expect(
    ((await admin.from("audit_log").select("id").eq("action", "invoices.create").eq("target_id", invId)).data ?? []).length,
  ).toBeGreaterThan(0);

  expect((await ac.rpc("invoice_send", { p_invoice: invId })).error).toBeNull();

  // Partial payment → partially_paid.
  expect((await ac.rpc("invoice_record_payment", { p_invoice: invId, p_amount: 400 })).error).toBeNull();
  let row = await admin.from("invoices").select("status, amount_paid").eq("id", invId).single();
  expect(row.data?.status).toBe("partially_paid");
  expect(Number(row.data?.amount_paid)).toBe(400);
  expect(
    ((await admin.from("audit_log").select("id").eq("action", "payments.record").eq("target_id", invId)).data ?? []).length,
  ).toBeGreaterThan(0);

  // Overpayment is rejected; the exact remaining settles it to paid.
  expect((await ac.rpc("invoice_record_payment", { p_invoice: invId, p_amount: 99999 })).error).not.toBeNull();
  expect((await ac.rpc("invoice_record_payment", { p_invoice: invId, p_amount: 750 })).error).toBeNull();
  row = await admin.from("invoices").select("status, amount_paid").eq("id", invId).single();
  expect(row.data?.status).toBe("paid");
  expect(Number(row.data?.amount_paid)).toBe(1150);

  // Reads allowed.
  expect(((await ac.from("invoices").select("id").eq("id", invId)).data ?? []).length).toBe(1);

  // Destructive/admin actions are MANAGER-ONLY → the accountant is denied.
  expect((await ac.rpc("invoice_void", { p_invoice: invId })).error).not.toBeNull();
  const { data: pay } = await admin.from("payments").select("id").eq("invoice_id", invId).limit(1).single();
  expect((await ac.rpc("payment_reverse", { p_payment: pay?.id ?? "" })).error).not.toBeNull();
  const draftId = await rpcCreateInvoice(ac, { subtotal: 500, vat: 0 });
  expect((await ac.rpc("invoice_delete", { p_invoice: draftId })).error).not.toBeNull();
});

test("manager: void (audited), delete empty draft, and NON-DESTRUCTIVE payment reversal", async () => {
  const mc = await authedClient(mgr.email, mgr.password);

  // Delete is only for empty drafts.
  const draftId = await rpcCreateInvoice(mc, { subtotal: 200, vat: 0 });
  expect((await mc.rpc("invoice_delete", { p_invoice: draftId })).error).toBeNull();
  expect((await admin.from("invoices").select("id").eq("id", draftId).maybeSingle()).data?.id).toBeUndefined();

  // A sent invoice with a payment cannot be deleted (has_payments) — it must be voided.
  const inv3 = await rpcCreateInvoice(mc, { subtotal: 300, vat: 0 });
  await mc.rpc("invoice_send", { p_invoice: inv3 });
  await mc.rpc("invoice_record_payment", { p_invoice: inv3, p_amount: 100 });
  expect((await mc.rpc("invoice_delete", { p_invoice: inv3 })).error).not.toBeNull();

  // Recording a payment on a draft is illegal (must send first).
  const inv2 = await rpcCreateInvoice(mc, { subtotal: 1000, vat: 0 });
  expect((await mc.rpc("invoice_record_payment", { p_invoice: inv2, p_amount: 100 })).error).not.toBeNull();

  // Send, fully pay (two payments), then reverse the first.
  await mc.rpc("invoice_send", { p_invoice: inv2 });
  const pay1 = (await mc.rpc("invoice_record_payment", { p_invoice: inv2, p_amount: 600 })).data as unknown as string;
  const pay2 = (await mc.rpc("invoice_record_payment", { p_invoice: inv2, p_amount: 400 })).data as unknown as string;
  expect((await admin.from("invoices").select("status").eq("id", inv2).single()).data?.status).toBe("paid");

  // Reversal preserves the original row (NOT deleted) and recomputes the balance.
  expect((await mc.rpc("payment_reverse", { p_payment: pay1 })).error).toBeNull();
  const reversed = await admin.from("payments").select("is_reversed, reversed_by").eq("id", pay1).single();
  expect(reversed.data?.is_reversed).toBe(true);
  expect(reversed.data?.reversed_by).toBe(mgrId);
  let row = await admin.from("invoices").select("status, amount_paid").eq("id", inv2).single();
  expect(Number(row.data?.amount_paid)).toBe(400);
  expect(row.data?.status).toBe("partially_paid");

  // amount_paid equals the sum of NON-reversed payments.
  const { data: livePays } = await admin
    .from("payments")
    .select("amount")
    .eq("invoice_id", inv2)
    .eq("is_reversed", false);
  expect((livePays ?? []).reduce((s, p) => s + Number(p.amount), 0)).toBe(400);

  // Reversing an already-reversed payment → error.
  expect((await mc.rpc("payment_reverse", { p_payment: pay1 })).error).not.toBeNull();

  // Approved ruling (0013): an invoice with LIVE (non-reversed) payments cannot be
  // voided — reverse first, then void. "Collected" never sits on a voided invoice.
  const voidBlocked = await mc.rpc("invoice_void", { p_invoice: inv2 });
  expect(voidBlocked.error?.message ?? "").toContain("has_live_payments");
  expect((await mc.rpc("payment_reverse", { p_payment: pay2 })).error).toBeNull();
  expect((await admin.from("invoices").select("status").eq("id", inv2).single()).data?.status).toBe("sent");

  // Void → ok + audited; then record-payment and edit are both illegal on a void invoice.
  expect((await mc.rpc("invoice_void", { p_invoice: inv2 })).error).toBeNull();
  row = await admin.from("invoices").select("status").eq("id", inv2).single();
  expect(row.data?.status).toBe("void");
  expect(
    ((await admin.from("audit_log").select("id").eq("action", "invoices.void").eq("target_id", inv2)).data ?? []).length,
  ).toBeGreaterThan(0);
  expect((await mc.rpc("invoice_record_payment", { p_invoice: inv2, p_amount: 10 })).error).not.toBeNull();
  expect((await mc.rpc("invoice_update", { p_invoice: inv2, p_subtotal: 5 })).error).not.toBeNull();
});

test("issued-only accounting: drafts and void never count in dashboard or reports (A1)", async ({
  page,
}) => {
  // Isolated project so the /reports per-project row is exact regardless of the
  // other tests' invoices on the shared project.
  const REPORT_PROJECT = `مشروع كشوف ${ts}`;
  const { data: p2 } = await admin
    .from("projects")
    .insert({ name: REPORT_PROJECT, client_id: clientId, status: "active", created_by: mgrId })
    .select("id")
    .single();
  const proj2 = p2?.id ?? "";
  await admin
    .from("project_financials")
    .insert({ project_id: proj2, contract_value: 10000, updated_by: mgrId });

  const mc = await authedClient(mgr.email, mgr.password);
  const mkInv = async (subtotal: number) => {
    const { data, error } = await mc.rpc("invoice_create", {
      p_project: proj2,
      p_subtotal: subtotal,
      p_vat_rate: 0,
    });
    if (error) throw error;
    return data as unknown as string;
  };

  // draft 9,876,543 (counts NOWHERE) · sent 2,000 · partially_paid 500 (paid 200)
  // · void 3,000 (counts nowhere).
  await mkInv(9876543);
  const sentInv = await mkInv(2000);
  await mc.rpc("invoice_send", { p_invoice: sentInv });
  const partInv = await mkInv(500);
  await mc.rpc("invoice_send", { p_invoice: partInv });
  await mc.rpc("invoice_record_payment", { p_invoice: partInv, p_amount: 200 });
  const voidInv = await mkInv(3000);
  await mc.rpc("invoice_send", { p_invoice: voidInv });
  await mc.rpc("invoice_void", { p_invoice: voidInv }); // no payments → voidable

  try {
    await login(page, mgr.email, mgr.password);

    // Dashboard money KPIs never include the draft's distinctive amount.
    await page.goto("/dashboard");
    await expect(page.locator("body")).not.toContainText("9,876,543");

    // Reports per-project row (all periods): issued only →
    // invoiced 2,500 · collected 200 · remaining-to-invoice 10,000 − 2,500 = 7,500.
    await page.goto("/reports?period=all");
    const row = page.getByRole("row", { name: new RegExp(REPORT_PROJECT) });
    await expect(row).toContainText("2,500");
    await expect(row).toContainText("7,500");
    await expect(row).not.toContainText("9,876,543");
    await expect(page.locator("body")).not.toContainText("9,876,543");

    // The draft still exists as workflow state in the invoices list.
    await page.goto("/invoices?filter=draft");
    await expect(page.getByText("9,876,543").first()).toBeVisible();
  } finally {
    const { data: invs2 } = await admin.from("invoices").select("id").eq("project_id", proj2);
    const ids2 = (invs2 ?? []).map((i) => i.id);
    if (ids2.length) {
      await admin.from("payments").delete().in("invoice_id", ids2);
      await admin.from("invoices").delete().in("id", ids2);
    }
    await admin.from("project_financials").delete().eq("project_id", proj2);
    await admin.from("projects").delete().eq("id", proj2);
  }
});

// ─────────────────────────── UI / role visibility ───────────────────────────

test("accountant UI: edits project financials (audited); engineer still reads 0 rows", async ({ page }) => {
  await login(page, acc.email, acc.password);

  // The accountant reaches a project for financial context (no Projects nav, though).
  await expect(page.getByRole("link", { name: "المشاريع" })).toHaveCount(0);
  await page.goto(`/projects/${projectId}`);
  await expect(page.getByText("المالية").first()).toBeVisible();

  await page.getByRole("button", { name: "تعديل" }).first().click();
  await expect(page.getByText("تعديل المبالغ")).toBeVisible();
  const contract = 555000;
  await page.getByLabel("قيمة العقد (ر.س)").fill(String(contract));
  await page.getByRole("button", { name: "حفظ" }).click();
  await expect(page.getByText("تم حفظ المبالغ").first()).toBeVisible();

  // The accountant's financial edit is audited.
  const audit = await admin
    .from("audit_log")
    .select("actor_id")
    .eq("action", "project_financials.set")
    .eq("target_id", projectId);
  expect((audit.data ?? []).some((r) => r.actor_id === accId)).toBe(true);

  // The write landed; an engineer JWT still reads 0 financial rows.
  expect(
    Number(
      (await admin.from("project_financials").select("contract_value").eq("project_id", projectId).single()).data
        ?.contract_value,
    ),
  ).toBe(contract);
  const e = await authedClient(eng.email, eng.password);
  expect((await e.from("project_financials").select("*")).data ?? []).toHaveLength(0);
});

test("manager UI: records a payment and an overdue invoice shows red", async ({ page }) => {
  const mc = await authedClient(mgr.email, mgr.password);
  const invId = await rpcCreateInvoice(mc, { subtotal: 1000, vat: 0, due: "2026-01-01" });
  await mc.rpc("invoice_send", { p_invoice: invId });

  await login(page, mgr.email, mgr.password);
  await expect(page.getByRole("link", { name: "الفواتير" }).first()).toBeVisible();

  await page.goto("/invoices?filter=overdue");
  await expect(page.getByText("(متأخرة)").first()).toBeVisible();

  await page.goto(`/invoices/${invId}`);
  await page.getByRole("button", { name: "تسجيل دفعة" }).click();
  await page.getByLabel("المبلغ (ر.س)").fill("400");
  await page.getByRole("button", { name: "تسجيل الدفعة" }).click();
  await expect(page.getByText("مدفوعة جزئياً").first()).toBeVisible();

  // B8: a future payment date is rejected with the precise Arabic rule, inline.
  await page.getByRole("button", { name: "تسجيل دفعة" }).click();
  await page.getByLabel("المبلغ (ر.س)").fill("50");
  await page.locator("#pay-date").fill("2030-01-01");
  await page.getByRole("button", { name: "تسجيل الدفعة" }).click();
  // The message appears inline (role=alert) and as a toast — assert the inline one.
  await expect(
    page.getByRole("alert").filter({ hasText: "تاريخ الدفع لا يمكن أن يكون في المستقبل." }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  // B5 freshness: a تحصيل note shows up in the timeline WITHOUT a reload.
  await page.getByRole("button", { name: "ملاحظة تحصيل" }).click();
  await page.locator("#c-note").fill(`متابعة تحصيل ${ts}`);
  await page.getByRole("button", { name: "إضافة", exact: true }).click();
  // Post-mutation router.refresh() re-renders the whole RSC tree; on a busy dev
  // server (attachments + bell render here too) that can exceed 5s.
  await expect(page.getByText(`متابعة تحصيل ${ts}`)).toBeVisible({ timeout: 15_000 });
});

test("invoice form rejects due-before-issue with an inline Arabic message (B8)", async ({
  page,
}) => {
  await login(page, mgr.email, mgr.password);
  await page.goto("/invoices");
  await page.getByRole("button", { name: "فاتورة جديدة" }).click();
  await page.locator("#i-project").selectOption(projectId);
  await page.locator("#i-subtotal").fill("100");
  await page.locator("#i-issue").fill("2026-06-10");
  await page.locator("#i-due").fill("2026-06-01");
  await page.getByRole("button", { name: "إنشاء الفاتورة" }).click();
  await expect(
    page.getByText("تاريخ الإصدار يجب أن يسبق تاريخ الاستحقاق أو يساويه."),
  ).toBeVisible();
  await page.keyboard.press("Escape");
});

test("accountant UI: has Invoices + Reports nav, can record a payment, but no Void/Delete", async ({
  page,
}) => {
  const ac = await authedClient(acc.email, acc.password);
  const invId = await rpcCreateInvoice(ac, { subtotal: 800, vat: 0 });
  await ac.rpc("invoice_send", { p_invoice: invId });

  await login(page, acc.email, acc.password);
  await expect(page.getByRole("link", { name: "الفواتير" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "التقارير" }).first()).toBeVisible();

  await page.goto(`/invoices/${invId}`);
  await expect(page.getByRole("button", { name: "تسجيل دفعة" })).toBeVisible();
  await expect(page.getByRole("button", { name: "إلغاء", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "حذف" })).toHaveCount(0);
});

test("engineer UI: no Invoices/Reports nav, /invoices denied, zero amounts anywhere", async ({
  page,
}) => {
  const mc = await authedClient(mgr.email, mgr.password);
  await rpcCreateInvoice(mc, { subtotal: INVOICE_AMOUNT, vat: 0 });

  await login(page, eng.email, eng.password);
  await expect(page.getByRole("link", { name: "الفواتير" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "التقارير" })).toHaveCount(0);

  await page.goto("/invoices");
  await expect(page.getByText("لا تملك صلاحية الوصول")).toBeVisible();

  await page.goto("/dashboard");
  await expect(page.locator("body")).not.toContainText(INVOICE_AMOUNT_TEXT);
  await page.goto(`/projects/${projectId}`);
  await expect(page.locator("body")).not.toContainText(INVOICE_AMOUNT_TEXT);
});
