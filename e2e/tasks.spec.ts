import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const admin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ts = Date.now();
const mgr = { email: `e2e-t-mgr-${ts}@example.com`, password: `Test!${ts}Mm`, name: "مدير المهام" };
const engA = { email: `e2e-t-enga-${ts}@example.com`, password: `Test!${ts}Ea`, name: "مهندس أ" };
const engB = { email: `e2e-t-engb-${ts}@example.com`, password: `Test!${ts}Eb`, name: "مهندس ب" };
const acc = { email: `e2e-t-acc-${ts}@example.com`, password: `Test!${ts}Ac`, name: "محاسب المهام" };

let mgrId = "";
let engAId = "";
let engBId = "";
let accId = "";
let clientId = "";
let projectId = "";

// Distinctive amount that must NEVER appear on any engineer-facing task surface.
const BUDGET = 7654321;
const BUDGET_TEXT = "7,654,321";

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

/** Create a task through the lifecycle RPC (the only creation path). Returns its id. */
async function rpcCreateTask(
  c: SupabaseClient,
  opts: { title: string; assignee?: string; dueAt?: string; priority?: string },
): Promise<string> {
  const { data, error } = await c.rpc("task_create", {
    p_title: opts.title,
    p_project: projectId,
    ...(opts.assignee ? { p_assignee: opts.assignee } : {}),
    ...(opts.dueAt ? { p_due_at: opts.dueAt } : {}),
    ...(opts.priority ? { p_priority: opts.priority } : {}),
  });
  if (error) throw error;
  return data as unknown as string;
}

test.beforeAll(async () => {
  mgrId = await seedUser(mgr, "manager");
  engAId = await seedUser(engA, "engineer");
  engBId = await seedUser(engB, "engineer");
  accId = await seedUser(acc, "accountant");

  const { data: c } = await admin
    .from("clients")
    .insert({ name: `عميل مهام ${ts}`, created_by: mgrId })
    .select("id")
    .single();
  clientId = c?.id ?? "";

  const { data: p } = await admin
    .from("projects")
    .insert({ name: `مشروع مهام ${ts}`, client_id: clientId, status: "active", created_by: mgrId })
    .select("id")
    .single();
  projectId = p?.id ?? "";

  await admin
    .from("project_financials")
    .insert({ project_id: projectId, budget: BUDGET, updated_by: mgrId });
});

test.afterAll(async () => {
  // Tasks must go before the project (on delete restrict); task_events cascade.
  if (projectId) {
    await admin.from("tasks").delete().eq("project_id", projectId);
    await admin.from("project_financials").delete().eq("project_id", projectId);
    await admin.from("projects").delete().eq("id", projectId);
  }
  for (const uid of [engAId, engBId]) {
    if (uid) await admin.from("user_permission_overrides").delete().eq("user_id", uid);
  }
  if (clientId) await admin.from("clients").delete().eq("id", clientId);
  for (const id of [mgrId, engAId, engBId, accId]) {
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

test("engineer JWT: reads tasks operationally but 0 rows from project_financials", async () => {
  const mc = await authedClient(mgr.email, mgr.password);
  const taskId = await rpcCreateTask(mc, { title: `مهمة قراءة ${ts}`, assignee: engAId });

  const c = await authedClient(engA.email, engA.password);

  const fin = await c.from("project_financials").select("*");
  expect(fin.data ?? []).toHaveLength(0); // financial isolation still holds in Phase 3

  const tk = await c.from("tasks").select("id").eq("id", taskId);
  expect((tk.data ?? []).some((r) => r.id === taskId)).toBe(true); // operational read allowed
});

test("tasks + task_events are read-only to clients (no direct insert/update/delete)", async () => {
  const mc = await authedClient(mgr.email, mgr.password);
  const taskId = await rpcCreateTask(mc, { title: `مهمة حماية ${ts}`, assignee: engAId });

  const c = await authedClient(engA.email, engA.password);

  // INSERT a forged task → blocked (no INSERT policy → creation only via task_create).
  const ins = await c
    .from("tasks")
    .insert({ title: "مزيّفة", project_id: projectId, status: "submitted" })
    .select("id");
  expect(ins.error).not.toBeNull();

  // UPDATE to self-close → no UPDATE policy filters all rows → status unchanged.
  await c.from("tasks").update({ status: "closed" }).eq("id", taskId);
  const afterUpd = await admin.from("tasks").select("status").eq("id", taskId).single();
  expect(afterUpd.data?.status).toBe("assigned");

  // DELETE directly → no DELETE policy → row remains.
  await c.from("tasks").delete().eq("id", taskId);
  const afterDel = await admin.from("tasks").select("id").eq("id", taskId).maybeSingle();
  expect(afterDel.data?.id).toBe(taskId);

  // INSERT a forged history event → blocked (history is unforgeable).
  const ev = await c.from("task_events").insert({ task_id: taskId, event_type: "closed" });
  expect(ev.error).not.toBeNull();
});

test("creation is lifecycle-safe and assignee must be an active engineer", async () => {
  // A plain engineer (no tasks.assign) cannot create.
  const eng = await authedClient(engA.email, engA.password);
  const denied = await eng.rpc("task_create", { p_title: "ممنوعة", p_project: projectId });
  expect(denied.error).not.toBeNull();

  const mc = await authedClient(mgr.email, mgr.password);

  // Manager create with no assignee → born 'new', progress 0.
  const unassigned = await rpcCreateTask(mc, { title: `جديدة ${ts}` });
  const row = await admin
    .from("tasks")
    .select("status, progress, current_assignee_id")
    .eq("id", unassigned)
    .single();
  expect(row.data?.status).toBe("new");
  expect(row.data?.progress).toBe(0);
  expect(row.data?.current_assignee_id).toBeNull();

  // Assigning a non-engineer (manager / accountant) is rejected.
  const badMgr = await mc.rpc("task_create", {
    p_title: "إسناد خاطئ",
    p_project: projectId,
    p_assignee: mgrId,
  });
  expect(badMgr.error).not.toBeNull();
  const badAcc = await mc.rpc("task_create", {
    p_title: "إسناد خاطئ",
    p_project: projectId,
    p_assignee: accId,
  });
  expect(badAcc.error).not.toBeNull();

  // Assigning an active engineer → born 'assigned'.
  const ok = await rpcCreateTask(mc, { title: `مُسندة ${ts}`, assignee: engAId });
  const okRow = await admin.from("tasks").select("status").eq("id", ok).single();
  expect(okRow.data?.status).toBe("assigned");
});

test("lifecycle: assignee works the task; only the manager can close", async () => {
  const mc = await authedClient(mgr.email, mgr.password);
  const taskId = await rpcCreateTask(mc, { title: `دورة حياة ${ts}`, assignee: engAId });

  const a = await authedClient(engA.email, engA.password);
  const b = await authedClient(engB.email, engB.password);

  expect((await a.rpc("task_start", { p_task: taskId })).error).toBeNull();
  expect((await a.rpc("task_set_progress", { p_task: taskId, p_progress: 50 })).error).toBeNull();

  // A non-assignee engineer cannot submit or start this task.
  expect((await b.rpc("task_submit", { p_task: taskId })).error).not.toBeNull();

  expect((await a.rpc("task_submit", { p_task: taskId })).error).toBeNull();

  // The assignee cannot close their own submitted task — that is manager-only.
  expect((await a.rpc("task_close", { p_task: taskId })).error).not.toBeNull();

  expect((await mc.rpc("task_close", { p_task: taskId })).error).toBeNull();
  const closed = await admin.from("tasks").select("status, progress").eq("id", taskId).single();
  expect(closed.data?.status).toBe("closed");
  expect(closed.data?.progress).toBe(100);
});

test("a granted tasks.assign engineer can create/handoff but never close/delete; 0 financial rows", async () => {
  await admin
    .from("user_permission_overrides")
    .insert({ user_id: engBId, permission_key: "tasks.assign", allowed: true });

  const b = await authedClient(engB.email, engB.password);

  const taskId = await rpcCreateTask(b, { title: `منح إسناد ${ts}`, assignee: engAId });
  expect(taskId).toBeTruthy();

  // Handoff A → B (reassign) is allowed for a tasks.assign holder.
  expect((await b.rpc("task_assign", { p_task: taskId, p_assignee: engBId })).error).toBeNull();

  // …but closing and deleting remain manager-only.
  expect((await b.rpc("task_close", { p_task: taskId })).error).not.toBeNull();
  expect((await b.rpc("task_delete", { p_task: taskId })).error).not.toBeNull();

  // Financial isolation holds for a granted engineer.
  const fin = await b.from("project_financials").select("*");
  expect(fin.data ?? []).toHaveLength(0);

  await admin
    .from("user_permission_overrides")
    .delete()
    .eq("user_id", engBId)
    .eq("permission_key", "tasks.assign");
});

test("delete is manager-only and audited; the grantable tasks.delete key is inert for engineers", async () => {
  const mc = await authedClient(mgr.email, mgr.password);
  const taskId = await rpcCreateTask(mc, { title: `حذف ${ts}`, assignee: engAId });

  // Even granted tasks.delete, an engineer cannot delete (delete is is_manager()-bound).
  await admin
    .from("user_permission_overrides")
    .insert({ user_id: engAId, permission_key: "tasks.delete", allowed: true });
  const a = await authedClient(engA.email, engA.password);
  expect((await a.rpc("task_delete", { p_task: taskId })).error).not.toBeNull();
  const still = await admin.from("tasks").select("id").eq("id", taskId).maybeSingle();
  expect(still.data?.id).toBe(taskId);

  // Manager deletes → gone, and an audit_log row is written atomically.
  expect((await mc.rpc("task_delete", { p_task: taskId })).error).toBeNull();
  const gone = await admin.from("tasks").select("id").eq("id", taskId).maybeSingle();
  expect(gone.data?.id).toBeUndefined();
  const audit = await admin
    .from("audit_log")
    .select("id")
    .eq("action", "tasks.delete")
    .eq("target_id", taskId);
  expect((audit.data ?? []).length).toBeGreaterThan(0);

  await admin
    .from("user_permission_overrides")
    .delete()
    .eq("user_id", engAId)
    .eq("permission_key", "tasks.delete");
});

test("illegal transitions are rejected (no unknown states)", async () => {
  const mc = await authedClient(mgr.email, mgr.password);
  const taskId = await rpcCreateTask(mc, { title: `انتقال غير قانوني ${ts}` }); // born 'new'

  // Manager authority passes, but closing a 'new' task is an illegal transition.
  expect((await mc.rpc("task_close", { p_task: taskId })).error).not.toBeNull();
  const row = await admin.from("tasks").select("status").eq("id", taskId).single();
  expect(row.data?.status).toBe("new");
});

test("accountant JWT: 0 task rows and no lifecycle access", async () => {
  const mc = await authedClient(mgr.email, mgr.password);
  const taskId = await rpcCreateTask(mc, { title: `محاسب ${ts}`, assignee: engAId });

  const c = await authedClient(acc.email, acc.password);
  const tk = await c.from("tasks").select("id");
  expect(tk.data ?? []).toHaveLength(0); // tasks.view = false for accountant

  expect((await c.rpc("task_create", { p_title: "x", p_project: projectId })).error).not.toBeNull();
  expect((await c.rpc("task_close", { p_task: taskId })).error).not.toBeNull();
});

// ─────────────────────────── UI / role visibility ───────────────────────────

test("engineer UI: sees «مهمتي» + overdue, runs start→submit, never a Close button or amount", async ({
  page,
}) => {
  const mc = await authedClient(mgr.email, mgr.password);
  const taskId = await rpcCreateTask(mc, {
    title: `واجهة مهندس ${ts}`,
    assignee: engAId,
    dueAt: "2026-01-01", // in the past → overdue
    priority: "urgent",
  });

  await login(page, engA.email, engA.password);
  await expect(page.getByRole("link", { name: "المهام" }).first()).toBeVisible();

  await page.goto("/tasks?filter=mine");
  await expect(page.getByText(`واجهة مهندس ${ts}`).first()).toBeVisible();
  await expect(page.getByText("مهمتي").first()).toBeVisible();
  await expect(page.getByText("متأخرة").first()).toBeVisible();

  await page.goto(`/tasks/${taskId}`);
  await expect(page.locator("body")).not.toContainText(BUDGET_TEXT); // never an amount

  // Start → in_progress → Submit. No "Close" control is ever offered to the engineer.
  await page.getByRole("button", { name: "بدء التنفيذ" }).click();
  await page.getByRole("button", { name: "إرسال للمراجعة" }).click();
  await page.getByRole("button", { name: "إرسال", exact: true }).click();
  await expect(page.getByText("بانتظار المراجعة").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "إغلاق المهمة" })).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(BUDGET_TEXT);
});

test("manager UI: reviews a submitted task and closes it", async ({ page }) => {
  const mc = await authedClient(mgr.email, mgr.password);
  const a = await authedClient(engA.email, engA.password);
  const taskId = await rpcCreateTask(mc, { title: `واجهة مدير ${ts}`, assignee: engAId });
  await a.rpc("task_start", { p_task: taskId });
  await a.rpc("task_submit", { p_task: taskId });

  await login(page, mgr.email, mgr.password);
  await page.goto(`/tasks/${taskId}`);
  await expect(page.getByText("بانتظار المراجعة").first()).toBeVisible();

  await page.getByRole("button", { name: "إغلاق المهمة" }).click();
  await page.getByRole("button", { name: "إغلاق", exact: true }).click();
  await expect(page.getByText("مغلقة").first()).toBeVisible();
});

test("accountant UI: no Tasks nav and /tasks is denied", async ({ page }) => {
  await login(page, acc.email, acc.password);
  await expect(page.getByRole("link", { name: "المهام" })).toHaveCount(0);

  await page.goto("/tasks");
  await expect(page.getByText("لا تملك صلاحية الوصول")).toBeVisible();
});
