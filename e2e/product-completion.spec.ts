import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Product-completion phase — make-or-break proofs for the new modules:
 * offers (financial isolation), attachments (audience classes incl. storage),
 * notifications (derived + own-rows-only), office settings (read-all/write-
 * manager), portfolio (curation), and the role-aware nav/calendar surfaces.
 * Mirrors the rbac/live-verify style: seed ZZZ users via the admin SDK,
 * probe the DB with each role's JWT, drive the UI for the visible bits.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const admin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ts = Date.now();
const mgr = { email: `zzz-pc-mgr-${ts}@example.com`, password: `Zzz!${ts}Mgr#1`, name: "ZZZ مدير اكتمال" };
const eng = { email: `zzz-pc-eng-${ts}@example.com`, password: `Zzz!${ts}Eng#1`, name: "ZZZ مهندس اكتمال" };
const acc = { email: `zzz-pc-acc-${ts}@example.com`, password: `Zzz!${ts}Acc#1`, name: "ZZZ محاسب اكتمال" };

let mgrId = "";
let engId = "";
let accId = "";
let clientId = "";
let offerId = "";
let convertedProjectId = "";
let taskId = "";
let invoiceId = "";
let portfolioId = "";
let portfolioDraftId = "";

let mc: SupabaseClient; // manager JWT
let ec: SupabaseClient; // engineer JWT
let ac: SupabaseClient; // accountant JWT

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

async function signedClient(u: { email: string; password: string }) {
  const c = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email: u.email, password: u.password });
  if (error) throw new Error(`sign-in failed: ${error.message}`);
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

  const { data: c } = await admin
    .from("clients")
    .insert({ name: `ZZZ-PC عميل ${ts}`, created_by: mgrId })
    .select("id")
    .single();
  clientId = c?.id ?? "";

  mc = await signedClient(mgr);
  ec = await signedClient(eng);
  ac = await signedClient(acc);
});

test.afterAll(async () => {
  // ZZZ cleanup — dependency order, never truncate.
  await admin.from("notifications").delete().in("user_id", [mgrId, engId, accId].filter(Boolean));
  if (portfolioId) await admin.from("portfolio_items").delete().eq("id", portfolioId);
  if (portfolioDraftId) await admin.from("portfolio_items").delete().eq("id", portfolioDraftId);
  if (invoiceId) {
    await admin.from("payments").delete().eq("invoice_id", invoiceId);
    await admin.from("invoices").delete().eq("id", invoiceId);
  }
  if (offerId) await admin.from("offers").delete().eq("id", offerId);
  for (const pid of [convertedProjectId].filter(Boolean)) {
    await admin.from("attachments").delete().eq("entity_id", pid);
    await admin.from("tasks").delete().eq("project_id", pid);
    await admin.from("project_financials").delete().eq("project_id", pid);
    await admin.from("project_members").delete().eq("project_id", pid);
    await admin.from("projects").delete().eq("id", pid);
  }
  if (taskId) await admin.from("attachments").delete().eq("entity_id", taskId);
  if (clientId) await admin.from("clients").delete().eq("id", clientId);
  for (const id of [mgrId, engId, accId]) {
    if (!id) continue;
    await admin.from("audit_log").delete().eq("actor_id", id);
    await admin.from("profiles").delete().eq("id", id);
    await admin.auth.admin.deleteUser(id);
  }
});

// ─────────────────────────── Offers: financial isolation ───────────────────────────

test("offers: manager creates; engineer reads 0 rows and cannot call the RPCs", async () => {
  const { data, error } = await mc.rpc("offer_create", {
    p_client: clientId,
    p_title: `ZZZ-PC تصميم فيلا ${ts}`,
    p_subtotal: 100000,
    p_vat_rate: 15,
  });
  expect(error).toBeNull();
  offerId = data as unknown as string;
  expect(offerId).toBeTruthy();

  // Engineer: zero rows from offers + offer_events (RLS), RPC denied.
  const { data: engOffers } = await ec.from("offers").select("id");
  expect(engOffers ?? []).toHaveLength(0);
  const { data: engEvents } = await ec.from("offer_events").select("id");
  expect(engEvents ?? []).toHaveLength(0);
  const { error: engCreate } = await ec.rpc("offer_create", {
    p_client: clientId,
    p_title: "محاولة مهندس",
    p_subtotal: 5,
  });
  expect(engCreate?.message ?? "").toContain("not_authorized");

  // Engineer role default offers.view is OFF (flipped in 0019).
  const { data: rp } = await admin
    .from("role_permissions")
    .select("allowed")
    .eq("role", "engineer")
    .eq("permission_key", "offers.view")
    .single();
  expect(rp?.allowed).toBe(false);
});

test("offers: accountant views + notes but cannot edit/transition/delete", async () => {
  const { data: accOffers } = await ac.from("offers").select("id, total").eq("id", offerId);
  expect(accOffers).toHaveLength(1);
  expect(Number(accOffers![0].total)).toBeCloseTo(115000, 1);

  const { error: noteErr } = await ac.rpc("offer_add_note", {
    p_offer: offerId,
    p_note: "متابعة هاتفية مع العميل",
  });
  expect(noteErr).toBeNull();

  const { error: sendErr } = await ac.rpc("offer_transition", { p_offer: offerId, p_to: "sent" });
  expect(sendErr?.message ?? "").toContain("not_authorized");
  const { error: delErr } = await ac.rpc("offer_delete", { p_offer: offerId });
  expect(delErr?.message ?? "").toContain("not_authorized");
});

test("offers: lifecycle send→accept→convert carries contract value atomically", async () => {
  const { error: sendErr } = await mc.rpc("offer_transition", { p_offer: offerId, p_to: "sent" });
  expect(sendErr).toBeNull();

  // Illegal jump: sent → sent.
  const { error: dupErr } = await mc.rpc("offer_transition", { p_offer: offerId, p_to: "sent" });
  expect(dupErr?.message ?? "").toContain("illegal_state");

  const { error: acceptErr } = await mc.rpc("offer_transition", { p_offer: offerId, p_to: "accepted" });
  expect(acceptErr).toBeNull();

  const { data: projData, error: convErr } = await mc.rpc("offer_convert_to_project", {
    p_offer: offerId,
  });
  expect(convErr).toBeNull();
  convertedProjectId = projData as unknown as string;
  expect(convertedProjectId).toBeTruthy();

  // contract_value copied; offer linked; double-convert rejected.
  const { data: fin } = await admin
    .from("project_financials")
    .select("contract_value")
    .eq("project_id", convertedProjectId)
    .single();
  expect(Number(fin?.contract_value)).toBeCloseTo(115000, 1);
  const { data: linked } = await admin.from("offers").select("project_id").eq("id", offerId).single();
  expect(linked?.project_id).toBe(convertedProjectId);
  const { error: againErr } = await mc.rpc("offer_convert_to_project", { p_offer: offerId });
  expect(againErr?.message ?? "").toContain("already_converted");
});

// ───────────────────── Attachments: audience classes + storage ─────────────────────

test("attachments: financial entity rows/objects are invisible & unwritable for engineers", async () => {
  // Manager issues an invoice on the converted project.
  const { data: inv, error: invErr } = await mc.rpc("invoice_create", {
    p_project: convertedProjectId,
    p_subtotal: 1000,
    p_vat_rate: 15,
  });
  expect(invErr).toBeNull();
  invoiceId = inv as unknown as string;

  // Manager attaches metadata to the INVOICE (financial class).
  const { error: mInsErr } = await mc.from("attachments").insert({
    entity_type: "invoice",
    entity_id: invoiceId,
    storage_path: `invoice/${invoiceId}/zzz-pc-${ts}.pdf`,
    file_name: "weasel.pdf",
    size_bytes: 10,
    uploaded_by: mgrId,
  });
  expect(mInsErr).toBeNull();

  // Engineer: cannot read invoice attachments, cannot insert one.
  const { data: engAtt } = await ec
    .from("attachments")
    .select("id")
    .eq("entity_type", "invoice");
  expect(engAtt ?? []).toHaveLength(0);
  const { error: engInsErr } = await ec.from("attachments").insert({
    entity_type: "invoice",
    entity_id: invoiceId,
    storage_path: `invoice/${invoiceId}/zzz-pc-eng-${ts}.pdf`,
    file_name: "x.pdf",
    size_bytes: 5,
    uploaded_by: engId,
  });
  expect(engInsErr).not.toBeNull();

  // Engineer cannot UPLOAD an object under invoice/ (storage policy).
  const { error: engUpErr } = await ec.storage
    .from("attachments")
    .upload(`invoice/${invoiceId}/zzz-pc-eng-${ts}.pdf`, new Blob(["x"]), {
      contentType: "application/pdf",
    });
  expect(engUpErr).not.toBeNull();

  // Cleanup metadata row (object was never created for it).
  await admin.from("attachments").delete().eq("entity_id", invoiceId);
});

test("attachments: engineer CAN attach to a task; portfolio uploads are curator-only", async () => {
  const { data: t, error: tErr } = await mc.rpc("task_create", {
    p_title: `ZZZ-PC مهمة ${ts}`,
    p_project: convertedProjectId,
    p_assignee: engId,
  });
  expect(tErr).toBeNull();
  taskId = t as unknown as string;

  // Engineer uploads a real object + metadata to HIS task (the deliverable flow).
  const path = `task/${taskId}/zzz-pc-${ts}.pdf`;
  const { error: upErr } = await ec.storage
    .from("attachments")
    .upload(path, new Blob(["deliverable"]), { contentType: "application/pdf" });
  expect(upErr).toBeNull();
  const { error: metaErr } = await ec.from("attachments").insert({
    entity_type: "task",
    entity_id: taskId,
    storage_path: path,
    file_name: "واجهات.pdf",
    size_bytes: 11,
    uploaded_by: engId,
  });
  expect(metaErr).toBeNull();

  // Accountant has no tasks.view → reads 0 task attachments.
  const { data: accAtt } = await ac.from("attachments").select("id").eq("entity_type", "task");
  expect(accAtt ?? []).toHaveLength(0);

  // Engineer must NOT be able to add portfolio gallery rows (0023 curation).
  const { error: pfInsErr } = await ec.from("attachments").insert({
    entity_type: "portfolio",
    entity_id: taskId, // any uuid — policy rejects before FK semantics matter
    storage_path: `portfolio/${taskId}/zzz-pc-${ts}.png`,
    file_name: "x.png",
    size_bytes: 5,
    uploaded_by: engId,
  });
  expect(pfInsErr).not.toBeNull();

  // Cleanup the storage object + row.
  await ec.storage.from("attachments").remove([path]);
  await admin.from("attachments").delete().eq("entity_id", taskId);
});

// ─────────────────────────── Notifications: derived + own-rows ───────────────────────────

test("notifications: assignment notifies the engineer; submit notifies the manager; payment notifies finance only", async () => {
  // task_create above already assigned the engineer → expect task_assigned.
  const { data: engNotifs } = await ec
    .from("notifications")
    .select("type, title, user_id")
    .order("created_at", { ascending: false });
  expect((engNotifs ?? []).some((n) => n.type === "task_assigned")).toBe(true);
  // Own rows only: every visible row belongs to the engineer.
  expect((engNotifs ?? []).every((n) => n.user_id === engId)).toBe(true);

  // Engineer starts + submits → manager gets task_submitted.
  await ec.rpc("task_start", { p_task: taskId });
  const { error: subErr } = await ec.rpc("task_submit", { p_task: taskId });
  expect(subErr).toBeNull();
  const { data: mgrNotifs } = await mc.from("notifications").select("type");
  expect((mgrNotifs ?? []).some((n) => n.type === "task_submitted")).toBe(true);

  // Manager sends the invoice + records a payment → accountant notified; engineer NEVER.
  await mc.rpc("invoice_send", { p_invoice: invoiceId });
  const { error: payErr } = await mc.rpc("invoice_record_payment", {
    p_invoice: invoiceId,
    p_amount: 500,
  });
  expect(payErr).toBeNull();
  const { data: accNotifs } = await ac.from("notifications").select("type, body");
  const payment = (accNotifs ?? []).find((n) => n.type === "invoice_payment");
  expect(payment).toBeTruthy();
  const { data: engAfter } = await ec.from("notifications").select("type");
  expect((engAfter ?? []).some((n) => n.type === "invoice_payment")).toBe(false);

  // mark-read functions work and only touch own rows.
  const { error: markErr } = await ec.rpc("notifications_mark_all_read");
  expect(markErr).toBeNull();
  const { data: unread } = await ec.from("notifications").select("id").is("read_at", null);
  expect(unread ?? []).toHaveLength(0);
});

// ─────────────────────────── Office settings + portfolio ───────────────────────────

test("office settings: everyone reads, only the manager writes", async () => {
  const { data: engRead } = await ec.from("office_settings").select("office_name").eq("id", true);
  expect(engRead).toHaveLength(1);

  const { data: engWrite } = await ec
    .from("office_settings")
    .update({ office_name: "هجوم مهندس" })
    .eq("id", true)
    .select("id");
  expect(engWrite ?? []).toHaveLength(0); // RLS: 0 rows affected

  const { data: before } = await admin.from("office_settings").select("city").eq("id", true).single();
  const { data: mgrWrite } = await mc
    .from("office_settings")
    .update({ city: "الدمام" })
    .eq("id", true)
    .select("id");
  expect(mgrWrite).toHaveLength(1);
  await admin.from("office_settings").update({ city: before?.city ?? null }).eq("id", true);
});

test("portfolio: manager curates; staff see published only; engineers cannot write", async () => {
  const { data: pub } = await mc
    .from("portfolio_items")
    .insert({ title: `ZZZ-PC فيلا منشورة ${ts}`, is_published: true, created_by: mgrId })
    .select("id")
    .single();
  portfolioId = pub?.id ?? "";
  const { data: draft } = await mc
    .from("portfolio_items")
    .insert({ title: `ZZZ-PC مسودة ${ts}`, is_published: false, created_by: mgrId })
    .select("id")
    .single();
  portfolioDraftId = draft?.id ?? "";

  const { data: engSees } = await ec
    .from("portfolio_items")
    .select("id")
    .in("id", [portfolioId, portfolioDraftId]);
  expect((engSees ?? []).map((r) => r.id)).toEqual([portfolioId]); // published only

  const { error: engInsErr } = await ec
    .from("portfolio_items")
    .insert({ title: "محاولة مهندس", created_by: engId });
  expect(engInsErr).not.toBeNull();
});

// ─────────────────────────── UI: nav + calendar + offers page ───────────────────────────

test("UI: engineer nav hides offers, shows portfolio + calendar; /offers denied", async ({ page }) => {
  await login(page, eng);
  const nav = page.locator("aside nav");
  await expect(nav.getByRole("link", { name: "معرض الأعمال" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "التقويم" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "العروض" })).toHaveCount(0);

  await page.goto("/offers");
  await expect(page.getByText("لا تملك صلاحية الوصول")).toBeVisible();

  // Calendar renders with the engineer's task (no invoice entries for engineers).
  await page.goto("/calendar");
  await expect(page.getByRole("heading", { name: "التقويم" })).toBeVisible();
});

test("UI: accountant sees offers list; manager sees office settings and notifications bell", async ({ page }) => {
  await login(page, acc);
  await page.goto("/offers");
  await expect(page.getByRole("heading", { name: "العروض" })).toBeVisible();
  // The seeded offer number renders (financial role can read it).
  await expect(page.locator("main")).toContainText("OFR-");

  // Accountant has NO «عرض جديد» button (offers.edit is manager-only).
  await expect(page.getByRole("button", { name: "عرض جديد" })).toHaveCount(0);

  await page.getByRole("button", { name: "تسجيل الخروج" }).click();
  await page.waitForURL("**/login");

  await login(page, mgr);
  await expect(page.getByRole("button", { name: /الإشعارات/ })).toBeVisible();
  await page.goto("/settings/office");
  await expect(page.getByRole("heading", { name: "إعدادات المكتب" })).toBeVisible();
  await expect(page.getByLabel("الرقم الضريبي (اختياري)")).toBeVisible();
});
