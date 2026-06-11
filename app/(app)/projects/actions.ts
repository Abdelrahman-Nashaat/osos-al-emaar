"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  getEffectivePermissions,
  getSessionProfile,
  type SessionProfile,
} from "@/lib/auth/permissions";
import { can } from "@/lib/auth/permission-keys";
import { PROJECT_STATUSES } from "@/lib/projects/status";

export type ActionState = { error?: string; success?: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const projectSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2).max(200),
  code: z.string().trim().max(60).optional(),
  client_id: z.uuid().optional(),
  status: z.enum(PROJECT_STATUSES),
  progress: z.coerce.number().int().min(0).max(100),
  start_date: z.string().regex(DATE_RE).optional(),
  due_date: z.string().regex(DATE_RE).optional(),
  description: z.string().trim().max(4000).optional(),
});

/** Trim a FormData field to a non-empty string, else undefined. */
function field(v: FormDataEntryValue | null): string | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length ? s : undefined;
}

const uuidSchema = z.uuid();
const isUuid = (v: string) => uuidSchema.safeParse(v).success;

/** projects.edit (manager, or an engineer granted the override) may write projects. */
async function requireProjectEditor(): Promise<SessionProfile | null> {
  const session = await getSessionProfile();
  if (!session) return null;
  const perms = await getEffectivePermissions();
  return can(perms, "projects.edit") ? session : null;
}

/** Manager-only actions (project delete — RLS enforces this too). */
async function requireManager(): Promise<SessionProfile | null> {
  const session = await getSessionProfile();
  if (!session || session.profile.role !== "manager") return null;
  return session;
}

/**
 * Finance roles (manager + accountant) — maps to can_view_financials() at the DB.
 * As of Phase 4 the accountant gets the finance UI, so project_financials writes
 * are gated on financials.view (the project_financials RLS was relaxed to
 * can_view_financials() in 0010). Engineers can never reach this (non-grantable).
 */
async function requireFinancials(): Promise<SessionProfile | null> {
  const session = await getSessionProfile();
  if (!session) return null;
  const perms = await getEffectivePermissions();
  return can(perms, "financials.view") ? session : null;
}

/**
 * Create (no id) or update (with id) a project. OPERATIONAL fields only — this
 * action never touches money. Budget/contract live in project_financials and are
 * written exclusively by setProjectFinancials() (manager-only), so a granted
 * engineer using this action can never reach a financial column.
 */
export async function saveProject(formData: FormData): Promise<ActionState> {
  const session = await requireProjectEditor();
  if (!session) return { error: "لا تملك صلاحية تعديل المشاريع." };

  const parsed = projectSchema.safeParse({
    id: field(formData.get("id")),
    name: formData.get("name"),
    code: field(formData.get("code")),
    client_id: field(formData.get("client_id")),
    status: field(formData.get("status")) ?? "planning",
    progress: formData.get("progress") ?? 0,
    start_date: field(formData.get("start_date")),
    due_date: field(formData.get("due_date")),
    description: field(formData.get("description")),
  });
  if (!parsed.success) {
    return { error: "تحقق من الحقول: اسم المشروع مطلوب، والنسبة بين ٠ و١٠٠، والتواريخ صحيحة." };
  }
  const { id, name, code, client_id, status, progress, start_date, due_date, description } =
    parsed.data;

  // Cross-field date rule (B8) — also checked inline in the form for instant UX.
  if (start_date && due_date && due_date < start_date) {
    return { error: "تاريخ البدء يجب أن يسبق تاريخ الاستحقاق أو يساويه." };
  }

  const supabase = await createClient();
  const row = {
    name,
    code: code ?? null,
    client_id: client_id ?? null,
    status,
    progress,
    start_date: start_date ?? null,
    due_date: due_date ?? null,
    description: description ?? null,
  };

  if (id) {
    const { error } = await supabase.from("projects").update(row).eq("id", id);
    if (error) return { error: "تعذّر تحديث المشروع." };
    await supabase.from("audit_log").insert({
      actor_id: session.userId,
      action: "projects.update",
      target_type: "project",
      target_id: id,
      metadata: { name, status },
    });
    revalidatePath("/projects");
    revalidatePath(`/projects/${id}`);
    return { success: `تم تحديث «${name}».` };
  }

  const { data: inserted, error } = await supabase
    .from("projects")
    .insert({ ...row, created_by: session.userId })
    .select("id")
    .single();
  if (error) return { error: "تعذّر إنشاء المشروع." };
  await supabase.from("audit_log").insert({
    actor_id: session.userId,
    action: "projects.create",
    target_type: "project",
    target_id: inserted?.id ?? null,
    metadata: { name, status },
  });
  revalidatePath("/projects");
  return { success: `تم إنشاء «${name}».` };
}

export async function deleteProject(id: string): Promise<ActionState> {
  // Project delete is manager-only (projects_delete RLS = is_manager()).
  const session = await requireManager();
  if (!session) return { error: "حذف المشروع للمدير العام فقط." };

  const supabase = await createClient();
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) return { error: "تعذّر حذف المشروع." };
  await supabase.from("audit_log").insert({
    actor_id: session.userId,
    action: "projects.delete",
    target_type: "project",
    target_id: id,
    metadata: {},
  });
  revalidatePath("/projects");
  return { success: "تم حذف المشروع." };
}

/** Parse an optional non-negative money field; { ok:false } on an invalid value. */
function money(v: FormDataEntryValue | null): { ok: true; value: number | null } | { ok: false } {
  const s = typeof v === "string" ? v.trim().replace(/,/g, "") : "";
  if (!s) return { ok: true, value: null };
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return { ok: false };
  return { ok: true, value: n };
}

/**
 * Set/clear a project's financials (budget / contract value / cost). MANAGER +
 * ACCOUNTANT (can_view_financials()) — matches the project_financials RLS write
 * policy relaxed in 0010. Engineers (even granted projects.edit) can never reach
 * this: financials.view is role-bound + non-grantable, and RLS rejects them too.
 * Every edit (incl. the accountant's) writes audit_log below.
 */
export async function setProjectFinancials(formData: FormData): Promise<ActionState> {
  const session = await requireFinancials();
  if (!session) return { error: "إدارة المبالغ للمدير العام والمحاسب فقط." };

  const projectId = field(formData.get("project_id"));
  if (!projectId) return { error: "مشروع غير صالح." };

  const budget = money(formData.get("budget"));
  const contract = money(formData.get("contract_value"));
  const cost = money(formData.get("cost"));
  if (!budget.ok || !contract.ok || !cost.ok) {
    return { error: "أدخل مبالغ صحيحة (أرقام موجبة)." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("project_financials").upsert(
    {
      project_id: projectId,
      budget: budget.value,
      contract_value: contract.value,
      cost: cost.value,
      notes: field(formData.get("notes")) ?? null,
      updated_by: session.userId,
    },
    { onConflict: "project_id" },
  );
  if (error) return { error: "تعذّر حفظ المبالغ." };

  await supabase.from("audit_log").insert({
    actor_id: session.userId,
    action: "project_financials.set",
    target_type: "project",
    target_id: projectId,
    metadata: { budget: budget.value, contract_value: contract.value, cost: cost.value },
  });
  revalidatePath(`/projects/${projectId}`);
  return { success: "تم حفظ المبالغ." };
}

export async function addProjectMember(projectId: string, userId: string): Promise<ActionState> {
  const session = await requireProjectEditor();
  if (!session) return { error: "غير مصرّح." };
  if (!isUuid(projectId) || !isUuid(userId)) return { error: "مدخل غير صالح." };

  const supabase = await createClient();

  // Members must be ACTIVE ENGINEERS. Checked here for a friendly early message;
  // the DB BEFORE INSERT trigger (0012 project_members_engineer_guard) is the
  // real gate and raises invalid_member on every other write path.
  const { data: directory } = await supabase.rpc("team_directory");
  const target = (directory ?? []).find((p) => p.id === userId);
  if (!target || target.role !== "engineer" || !target.is_active) {
    return { error: "يُسمح بإضافة المهندسين النشطين فقط." };
  }

  const { error } = await supabase
    .from("project_members")
    .upsert(
      { project_id: projectId, user_id: userId, added_by: session.userId },
      { onConflict: "project_id,user_id", ignoreDuplicates: true },
    );
  if (error) {
    return {
      error: error.message.includes("invalid_member")
        ? "يُسمح بإضافة المهندسين النشطين فقط."
        : "تعذّر إضافة العضو.",
    };
  }

  await supabase.from("audit_log").insert({
    actor_id: session.userId,
    action: "project_members.add",
    target_type: "project",
    target_id: projectId,
    metadata: { user_id: userId },
  });
  revalidatePath(`/projects/${projectId}`);
  return { success: "تمت إضافة العضو." };
}

export async function removeProjectMember(projectId: string, userId: string): Promise<ActionState> {
  const session = await requireProjectEditor();
  if (!session) return { error: "غير مصرّح." };
  if (!isUuid(projectId) || !isUuid(userId)) return { error: "مدخل غير صالح." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("project_members")
    .delete()
    .eq("project_id", projectId)
    .eq("user_id", userId);
  if (error) return { error: "تعذّر إزالة العضو." };

  await supabase.from("audit_log").insert({
    actor_id: session.userId,
    action: "project_members.remove",
    target_type: "project",
    target_id: projectId,
    metadata: { user_id: userId },
  });
  revalidatePath(`/projects/${projectId}`);
  return { success: "تمت إزالة العضو." };
}
