"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePermissions, getSessionProfile } from "@/lib/auth/permissions";
import type { Permissions } from "@/lib/auth/permission-keys";
import {
  MAX_ATTACHMENT_BYTES,
  fileExtension,
  isAllowedFile,
  type AttachmentEntity,
} from "@/lib/attachments/shared";

export type ActionState = { error?: string; success?: string };
export type UrlState = { error?: string; url?: string };

const ENTITY_TYPES: AttachmentEntity[] = [
  "project", "task", "client", "offer", "invoice", "portfolio",
];
const uuidSchema = z.uuid();

/**
 * Server-side mirror of the DB attachment_visible() audience classes — the UI
 * gate. The DB + storage policies re-enforce the same rule, so a forged call
 * fails there too. Portfolio UPLOADS are curator-only (portfolio.edit).
 */
function canSee(perms: Permissions, type: AttachmentEntity): boolean {
  switch (type) {
    case "project":
      return perms["projects.view"] === true || perms["financials.view"] === true;
    case "task":
      return perms["tasks.view"] === true;
    case "client":
      return perms["clients.view"] === true;
    case "offer":
    case "invoice":
      return perms["financials.view"] === true;
    case "portfolio":
      return perms["portfolio.view"] === true;
  }
}

function canUpload(perms: Permissions, type: AttachmentEntity): boolean {
  if (type === "portfolio") return perms["portfolio.edit"] === true;
  return canSee(perms, type);
}

/** The parent row must exist AND be visible to this user (RLS does the filtering). */
async function entityExists(
  supabase: Awaited<ReturnType<typeof createClient>>,
  type: AttachmentEntity,
  id: string,
): Promise<boolean> {
  const table = (
    {
      project: "projects",
      task: "tasks",
      client: "clients",
      offer: "offers",
      invoice: "invoices",
      portfolio: "portfolio_items",
    } as const
  )[type];
  const { data } = await supabase.from(table).select("id").eq("id", id).maybeSingle();
  return Boolean(data);
}

function revalidateEntity(type: AttachmentEntity, id: string) {
  const base = (
    {
      project: `/projects/${id}`,
      task: `/tasks/${id}`,
      client: `/clients/${id}`,
      offer: `/offers/${id}`,
      invoice: `/invoices/${id}`,
      portfolio: `/portfolio/${id}`,
    } as const
  )[type];
  revalidatePath(base);
}

/** Upload one file to the private bucket + record its metadata row. */
export async function uploadAttachment(formData: FormData): Promise<ActionState> {
  const session = await getSessionProfile();
  if (!session) return { error: "غير مصرّح." };

  const type = String(formData.get("entity_type") ?? "") as AttachmentEntity;
  const entityId = String(formData.get("entity_id") ?? "");
  if (!ENTITY_TYPES.includes(type) || !uuidSchema.safeParse(entityId).success) {
    return { error: "مدخل غير صالح." };
  }

  const perms = await getEffectivePermissions();
  if (!canUpload(perms, type)) return { error: "لا تملك صلاحية إضافة مرفقات هنا." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "اختر ملفاً أولاً." };
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { error: "حجم الملف يتجاوز الحد (10 م.ب)." };
  }
  if (!isAllowedFile(file.name)) {
    return { error: "نوع الملف غير مدعوم. الأنواع المسموحة: PDF، صور، DWG/DXF، Office، ZIP." };
  }

  const supabase = await createClient();
  if (!(await entityExists(supabase, type, entityId))) {
    return { error: "العنصر غير موجود أو لا تملك صلاحية الوصول إليه." };
  }

  const ext = fileExtension(file.name);
  const path = `${type}/${entityId}/${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await supabase.storage.from("attachments").upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (upErr) return { error: "تعذّر رفع الملف. حاول مجدداً." };

  const { error: insErr } = await supabase.from("attachments").insert({
    entity_type: type,
    entity_id: entityId,
    storage_path: path,
    file_name: file.name.slice(0, 200),
    mime_type: file.type || null,
    size_bytes: file.size,
    uploaded_by: session.userId,
  });
  if (insErr) {
    // Compensate: never leave an orphan object behind a failed metadata write.
    await supabase.storage.from("attachments").remove([path]);
    return { error: "تعذّر حفظ بيانات المرفق." };
  }

  await supabase.from("audit_log").insert({
    actor_id: session.userId,
    action: "attachments.upload",
    target_type: type,
    target_id: entityId,
    metadata: { file_name: file.name.slice(0, 200), size: file.size },
  });

  revalidateEntity(type, entityId);
  return { success: `تم رفع «${file.name}».` };
}

/** Delete an attachment (uploader or manager — also enforced by RLS/storage). */
export async function deleteAttachment(attachmentId: string): Promise<ActionState> {
  const session = await getSessionProfile();
  if (!session) return { error: "غير مصرّح." };
  if (!uuidSchema.safeParse(attachmentId).success) return { error: "مدخل غير صالح." };

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("attachments")
    .select("*")
    .eq("id", attachmentId)
    .maybeSingle();
  if (!row) return { error: "المرفق غير موجود." };
  if (row.uploaded_by !== session.userId && session.profile.role !== "manager") {
    return { error: "حذف المرفق متاح لرافعه أو للمدير العام." };
  }

  const { error: rmErr } = await supabase.storage.from("attachments").remove([row.storage_path]);
  if (rmErr) return { error: "تعذّر حذف الملف من التخزين." };

  const { error: delErr } = await supabase.from("attachments").delete().eq("id", attachmentId);
  if (delErr) return { error: "تعذّر حذف بيانات المرفق." };

  await supabase.from("audit_log").insert({
    actor_id: session.userId,
    action: "attachments.delete",
    target_type: row.entity_type,
    target_id: row.entity_id,
    metadata: { file_name: row.file_name },
  });

  revalidateEntity(row.entity_type, row.entity_id);
  return { success: "تم حذف المرفق." };
}

/** Short-lived signed URL for download/preview (object must be RLS-visible). */
export async function getAttachmentUrl(attachmentId: string): Promise<UrlState> {
  const session = await getSessionProfile();
  if (!session) return { error: "غير مصرّح." };
  if (!uuidSchema.safeParse(attachmentId).success) return { error: "مدخل غير صالح." };

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("attachments")
    .select("storage_path, file_name, mime_type")
    .eq("id", attachmentId)
    .maybeSingle();
  if (!row) return { error: "المرفق غير موجود." };

  const inlinePreview = Boolean(row.mime_type?.startsWith("image/") || row.mime_type === "application/pdf");
  const { data, error } = await supabase.storage
    .from("attachments")
    .createSignedUrl(row.storage_path, 300, inlinePreview ? undefined : { download: row.file_name });
  if (error || !data?.signedUrl) return { error: "تعذّر إنشاء رابط التنزيل." };

  return { url: data.signedUrl };
}
