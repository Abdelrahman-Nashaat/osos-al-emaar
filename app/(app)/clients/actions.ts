"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePermissions, getSessionProfile, type SessionProfile } from "@/lib/auth/permissions";
import { can } from "@/lib/auth/permission-keys";

export type ActionState = { error?: string; success?: string };

const clientSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2).max(200),
  company: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.email().max(200).optional(),
  address: z.string().trim().max(400).optional(),
  country: z.string().trim().max(60).optional(),
  notes: z.string().trim().max(2000).optional(),
});

/** Only clients.edit (manager) may write clients. RLS enforces the same at the DB. */
async function requireClientsEditor(): Promise<SessionProfile | null> {
  const session = await getSessionProfile();
  if (!session) return null;
  const perms = await getEffectivePermissions();
  return can(perms, "clients.edit") ? session : null;
}

/** Trim a FormData field to a non-empty string, else undefined. */
function field(v: FormDataEntryValue | null): string | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length ? s : undefined;
}

/** Create (no id) or update (with id) a client. Operational data only — no money. */
export async function saveClient(formData: FormData): Promise<ActionState> {
  const session = await requireClientsEditor();
  if (!session) return { error: "هذه العملية للمدير العام فقط." };

  const parsed = clientSchema.safeParse({
    id: field(formData.get("id")),
    name: formData.get("name"),
    company: field(formData.get("company")),
    phone: field(formData.get("phone")),
    email: field(formData.get("email")),
    address: field(formData.get("address")),
    country: field(formData.get("country")),
    notes: field(formData.get("notes")),
  });
  if (!parsed.success) {
    return { error: "تحقق من الحقول: الاسم مطلوب (حرفان على الأقل) وبريد صحيح إن وُجد." };
  }
  const { id, name, company, phone, email, address, country, notes } = parsed.data;

  const supabase = await createClient();
  const row = {
    name,
    company: company ?? null,
    phone: phone ?? null,
    email: email ?? null,
    address: address ?? null,
    country: country ?? "SA",
    notes: notes ?? null,
  };

  if (id) {
    const { error } = await supabase.from("clients").update(row).eq("id", id);
    if (error) return { error: "تعذّر تحديث العميل." };
    await supabase.from("audit_log").insert({
      actor_id: session.userId,
      action: "clients.update",
      target_type: "client",
      target_id: id,
      metadata: { name },
    });
    revalidatePath("/clients");
    return { success: `تم تحديث «${name}».` };
  }

  const { data: inserted, error } = await supabase
    .from("clients")
    .insert({ ...row, created_by: session.userId })
    .select("id")
    .single();
  if (error) return { error: "تعذّر حفظ العميل." };
  await supabase.from("audit_log").insert({
    actor_id: session.userId,
    action: "clients.create",
    target_type: "client",
    target_id: inserted?.id ?? null,
    metadata: { name },
  });
  revalidatePath("/clients");
  return { success: `تم حفظ العميل «${name}».` };
}

export async function deleteClient(id: string): Promise<ActionState> {
  const session = await requireClientsEditor();
  if (!session) return { error: "غير مصرّح." };

  const supabase = await createClient();
  const { error } = await supabase.from("clients").delete().eq("id", id);
  if (error) {
    // FK is ON DELETE RESTRICT: a client linked to any project cannot be deleted.
    return { error: "تعذّر حذف العميل. تأكد أنه غير مرتبط بأي مشروع." };
  }
  await supabase.from("audit_log").insert({
    actor_id: session.userId,
    action: "clients.delete",
    target_type: "client",
    target_id: id,
    metadata: {},
  });
  revalidatePath("/clients");
  return { success: "تم حذف العميل." };
}
