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
import { TASK_PRIORITIES } from "@/lib/tasks/status";

export type ActionState = { error?: string; success?: string };

const uuidSchema = z.uuid();
const isUuid = (v: string) => uuidSchema.safeParse(v).success;

/** Trim a FormData field to a non-empty string, else undefined. */
function field(v: FormDataEntryValue | null): string | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length ? s : undefined;
}

/** Map a raised DB-function error (e.g. 'not_authorized') to an Arabic message. */
const RPC_ERRORS: Record<string, string> = {
  not_authorized: "لا تملك صلاحية تنفيذ هذا الإجراء.",
  illegal_transition: "لا يمكن تنفيذ هذا الإجراء على حالة المهمة الحالية.",
  same_assignee: "المهمة مُسندة بالفعل لهذا المهندس.",
  invalid_assignee: "يجب إسناد المهمة إلى مهندس نشِط.",
  task_not_found: "المهمة غير موجودة.",
  invalid_project: "المشروع غير صالح.",
  invalid_title: "عنوان المهمة مطلوب.",
  empty_note: "الملاحظة فارغة.",
  empty_label: "اسم المَعلَم مطلوب.",
};
function rpcError(error: { message?: string } | null): string {
  const msg = error?.message ?? "";
  for (const key of Object.keys(RPC_ERRORS)) {
    if (msg.includes(key)) return RPC_ERRORS[key];
  }
  return "تعذّر تنفيذ العملية.";
}

/** Revalidate every surface a task change can touch. */
function revalidateTask(taskId?: string, projectId?: string) {
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  if (taskId) revalidatePath(`/tasks/${taskId}`);
  if (projectId) revalidatePath(`/projects/${projectId}`);
}

/** tasks.assign holders (manager, or an engineer granted the override) may create/assign. */
async function requireTasksAssigner(): Promise<SessionProfile | null> {
  const session = await getSessionProfile();
  if (!session) return null;
  const perms = await getEffectivePermissions();
  return can(perms, "tasks.assign") ? session : null;
}

const taskSchema = z.object({
  title: z.string().trim().min(2).max(200),
  project_id: z.uuid(),
  description: z.string().trim().max(4000).optional(),
  priority: z.enum(TASK_PRIORITIES),
  due_at: z.string().trim().min(1).optional(),
  assignee: z.uuid().optional(),
});

/**
 * Create a task. tasks.assign-gated. Delegates to the SECURITY DEFINER
 * task_create function, which forces status new/assigned + progress 0, validates
 * the project and (if given) an active-engineer assignee, and writes the
 * created/assigned history events atomically. The action never inserts directly.
 */
export async function createTask(formData: FormData): Promise<ActionState> {
  const session = await requireTasksAssigner();
  if (!session) return { error: "لا تملك صلاحية إضافة المهام." };

  const parsed = taskSchema.safeParse({
    title: formData.get("title"),
    project_id: field(formData.get("project_id")),
    description: field(formData.get("description")),
    priority: field(formData.get("priority")) ?? "normal",
    due_at: field(formData.get("due_at")),
    assignee: field(formData.get("assignee")),
  });
  if (!parsed.success) {
    return { error: "تحقق من الحقول: عنوان المهمة والمشروع مطلوبان." };
  }
  const { title, project_id, description, priority, due_at, assignee } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("task_create", {
    p_title: title,
    p_project: project_id,
    p_priority: priority,
    ...(description ? { p_description: description } : {}),
    ...(due_at ? { p_due_at: due_at } : {}),
    ...(assignee ? { p_assignee: assignee } : {}),
  });
  if (error) return { error: rpcError(error) };

  revalidateTask(undefined, project_id);
  return { success: `تم إنشاء «${title}».` };
}

/** Assign or hand off a task to an active engineer (DB task_assign). tasks.assign-gated. */
export async function assignTask(formData: FormData): Promise<ActionState> {
  const taskId = field(formData.get("task_id"));
  const assignee = field(formData.get("assignee"));
  const projectId = field(formData.get("project_id"));
  if (!taskId || !assignee || !isUuid(taskId) || !isUuid(assignee)) {
    return { error: "مدخل غير صالح." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("task_assign", {
    p_task: taskId,
    p_assignee: assignee,
    ...(field(formData.get("note")) ? { p_note: field(formData.get("note")) } : {}),
  });
  if (error) return { error: rpcError(error) };

  revalidateTask(taskId, projectId);
  return { success: "تم تحديث الإسناد." };
}

/** Start work (assigned → in_progress). Assignee or tasks.assign. */
export async function startTask(formData: FormData): Promise<ActionState> {
  const taskId = field(formData.get("task_id"));
  const projectId = field(formData.get("project_id"));
  if (!taskId || !isUuid(taskId)) return { error: "مدخل غير صالح." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("task_start", { p_task: taskId });
  if (error) return { error: rpcError(error) };

  revalidateTask(taskId, projectId);
  return { success: "تم بدء التنفيذ." };
}

/** Update progress (0–100). Assignee or tasks.assign; allowed in assigned/in_progress. */
export async function updateTaskProgress(formData: FormData): Promise<ActionState> {
  const taskId = field(formData.get("task_id"));
  const projectId = field(formData.get("project_id"));
  if (!taskId || !isUuid(taskId)) return { error: "مدخل غير صالح." };

  const raw = Number(field(formData.get("progress")) ?? "");
  if (!Number.isFinite(raw)) return { error: "أدخل نسبة إنجاز صحيحة." };
  const progress = Math.max(0, Math.min(100, Math.round(raw)));

  const supabase = await createClient();
  const { error } = await supabase.rpc("task_set_progress", {
    p_task: taskId,
    p_progress: progress,
    ...(field(formData.get("note")) ? { p_note: field(formData.get("note")) } : {}),
  });
  if (error) return { error: rpcError(error) };

  revalidateTask(taskId, projectId);
  return { success: "تم تحديث نسبة الإنجاز." };
}

/** Submit for review (in_progress → submitted). ASSIGNEE ONLY (enforced in DB). */
export async function submitTask(formData: FormData): Promise<ActionState> {
  const taskId = field(formData.get("task_id"));
  const projectId = field(formData.get("project_id"));
  if (!taskId || !isUuid(taskId)) return { error: "مدخل غير صالح." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("task_submit", {
    p_task: taskId,
    ...(field(formData.get("note")) ? { p_note: field(formData.get("note")) } : {}),
  });
  if (error) return { error: rpcError(error) };

  revalidateTask(taskId, projectId);
  return { success: "تم إرسال المهمة للمراجعة." };
}

/** Close after review (submitted/in_progress → closed). MANAGER ONLY (enforced in DB). */
export async function closeTask(formData: FormData): Promise<ActionState> {
  const taskId = field(formData.get("task_id"));
  const projectId = field(formData.get("project_id"));
  if (!taskId || !isUuid(taskId)) return { error: "مدخل غير صالح." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("task_close", {
    p_task: taskId,
    ...(field(formData.get("note")) ? { p_note: field(formData.get("note")) } : {}),
  });
  if (error) return { error: rpcError(error) };

  revalidateTask(taskId, projectId);
  return { success: "تم إغلاق المهمة." };
}

/** Reopen / return (closed or submitted → in_progress). MANAGER ONLY (enforced in DB). */
export async function reopenTask(formData: FormData): Promise<ActionState> {
  const taskId = field(formData.get("task_id"));
  const projectId = field(formData.get("project_id"));
  if (!taskId || !isUuid(taskId)) return { error: "مدخل غير صالح." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("task_reopen", {
    p_task: taskId,
    ...(field(formData.get("note")) ? { p_note: field(formData.get("note")) } : {}),
  });
  if (error) return { error: rpcError(error) };

  revalidateTask(taskId, projectId);
  return { success: "تمت إعادة فتح المهمة." };
}

/** Append a note to the history (no state change). Assignee or tasks.assign. */
export async function addTaskNote(formData: FormData): Promise<ActionState> {
  const taskId = field(formData.get("task_id"));
  const projectId = field(formData.get("project_id"));
  const note = field(formData.get("note"));
  if (!taskId || !isUuid(taskId)) return { error: "مدخل غير صالح." };
  if (!note) return { error: "الملاحظة فارغة." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("task_add_note", { p_task: taskId, p_note: note });
  if (error) return { error: rpcError(error) };

  revalidateTask(taskId, projectId);
  return { success: "تمت إضافة الملاحظة." };
}

/** Record a named milestone (e.g. «أصدرنا الرخصة»). Assignee or tasks.assign. */
export async function addTaskMilestone(formData: FormData): Promise<ActionState> {
  const taskId = field(formData.get("task_id"));
  const projectId = field(formData.get("project_id"));
  const label = field(formData.get("label"));
  if (!taskId || !isUuid(taskId)) return { error: "مدخل غير صالح." };
  if (!label) return { error: "اسم المَعلَم مطلوب." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("task_milestone", {
    p_task: taskId,
    p_label: label,
    ...(field(formData.get("note")) ? { p_note: field(formData.get("note")) } : {}),
  });
  if (error) return { error: rpcError(error) };

  revalidateTask(taskId, projectId);
  return { success: "تم تسجيل المَعلَم." };
}

/** Delete a task. MANAGER ONLY + audited (enforced atomically in DB task_delete). */
export async function deleteTask(taskId: string, projectId?: string): Promise<ActionState> {
  if (!isUuid(taskId)) return { error: "مدخل غير صالح." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("task_delete", { p_task: taskId });
  if (error) return { error: rpcError(error) };

  revalidateTask(undefined, projectId);
  revalidatePath("/tasks");
  return { success: "تم حذف المهمة." };
}
