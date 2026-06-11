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

export type ActionState = { error?: string; success?: string };

const itemSchema = z.object({
  id: z.uuid().optional(),
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).optional(),
  category: z.string().trim().max(80).optional(),
  city: z.string().trim().max(100).optional(),
  year: z.coerce.number().int().min(1980).max(2100).optional(),
  project_id: z.uuid().optional(),
  is_published: z.boolean(),
});

function field(v: FormDataEntryValue | null): string | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length ? s : undefined;
}

/** portfolio.edit holders (manager by default) — RLS enforces the same. */
async function requirePortfolioEditor(): Promise<SessionProfile | null> {
  const session = await getSessionProfile();
  if (!session) return null;
  const perms = await getEffectivePermissions();
  return can(perms, "portfolio.edit") ? session : null;
}

/** Create (no id) or update (with id) a portfolio item. Operational — no money. */
export async function savePortfolioItem(formData: FormData): Promise<ActionState> {
  const session = await requirePortfolioEditor();
  if (!session) return { error: "إدارة معرض الأعمال للمدير العام فقط." };

  const parsed = itemSchema.safeParse({
    id: field(formData.get("id")),
    title: formData.get("title"),
    description: field(formData.get("description")),
    category: field(formData.get("category")),
    city: field(formData.get("city")),
    year: field(formData.get("year")),
    project_id: field(formData.get("project_id")),
    is_published: formData.get("is_published") === "on",
  });
  if (!parsed.success) {
    return { error: "تحقق من الحقول: العنوان مطلوب والسنة بين 1980 و2100." };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const row = {
    title: d.title,
    description: d.description ?? null,
    category: d.category ?? null,
    city: d.city ?? null,
    year: d.year ?? null,
    project_id: d.project_id ?? null,
    is_published: d.is_published,
  };

  if (d.id) {
    const { error } = await supabase.from("portfolio_items").update(row).eq("id", d.id);
    if (error) return { error: "تعذّر تحديث العنصر." };
    await supabase.from("audit_log").insert({
      actor_id: session.userId,
      action: "portfolio.update",
      target_type: "portfolio",
      target_id: d.id,
      metadata: { title: d.title },
    });
    revalidatePath("/portfolio");
    revalidatePath(`/portfolio/${d.id}`);
    return { success: `تم تحديث «${d.title}».` };
  }

  const { data: inserted, error } = await supabase
    .from("portfolio_items")
    .insert({ ...row, created_by: session.userId })
    .select("id")
    .single();
  if (error) return { error: "تعذّر حفظ العنصر." };
  await supabase.from("audit_log").insert({
    actor_id: session.userId,
    action: "portfolio.create",
    target_type: "portfolio",
    target_id: inserted?.id ?? null,
    metadata: { title: d.title },
  });
  revalidatePath("/portfolio");
  return { success: `أُضيف «${d.title}» إلى معرض الأعمال.` };
}

/** Delete an item. Its gallery files stay in storage history unless removed separately. */
export async function deletePortfolioItem(id: string): Promise<ActionState> {
  const session = await requirePortfolioEditor();
  if (!session) return { error: "غير مصرّح." };
  if (!z.uuid().safeParse(id).success) return { error: "مدخل غير صالح." };

  const supabase = await createClient();

  // Remove gallery attachments first (rows + objects) so nothing orphans.
  const { data: files } = await supabase
    .from("attachments")
    .select("id, storage_path")
    .eq("entity_type", "portfolio")
    .eq("entity_id", id);
  if (files && files.length > 0) {
    await supabase.storage.from("attachments").remove(files.map((f) => f.storage_path));
    await supabase.from("attachments").delete().eq("entity_type", "portfolio").eq("entity_id", id);
  }

  const { error } = await supabase.from("portfolio_items").delete().eq("id", id);
  if (error) return { error: "تعذّر حذف العنصر." };

  await supabase.from("audit_log").insert({
    actor_id: session.userId,
    action: "portfolio.delete",
    target_type: "portfolio",
    target_id: id,
    metadata: {},
  });
  revalidatePath("/portfolio");
  return { success: "تم حذف العنصر من المعرض." };
}

/** Choose one of the item's gallery images as its cover. */
export async function setPortfolioCover(formData: FormData): Promise<ActionState> {
  const session = await requirePortfolioEditor();
  if (!session) return { error: "غير مصرّح." };

  const itemId = field(formData.get("item_id"));
  const attachmentId = field(formData.get("attachment_id"));
  if (!itemId || !z.uuid().safeParse(itemId).success) return { error: "مدخل غير صالح." };

  const supabase = await createClient();
  let coverPath: string | null = null;
  if (attachmentId) {
    const { data: att } = await supabase
      .from("attachments")
      .select("storage_path, entity_id, entity_type")
      .eq("id", attachmentId)
      .maybeSingle();
    if (!att || att.entity_type !== "portfolio" || att.entity_id !== itemId) {
      return { error: "الصورة غير تابعة لهذا العنصر." };
    }
    coverPath = att.storage_path;
  }

  const { error } = await supabase
    .from("portfolio_items")
    .update({ cover_path: coverPath })
    .eq("id", itemId);
  if (error) return { error: "تعذّر تعيين الغلاف." };

  revalidatePath("/portfolio");
  revalidatePath(`/portfolio/${itemId}`);
  return { success: coverPath ? "تم تعيين صورة الغلاف." : "أُزيلت صورة الغلاف." };
}
