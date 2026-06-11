"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePermissions, getSessionProfile } from "@/lib/auth/permissions";
import { can } from "@/lib/auth/permission-keys";

export type ActionState = { error?: string; success?: string };

const settingsSchema = z.object({
  office_name: z.string().trim().min(2).max(200),
  office_name_en: z.string().trim().max(200).optional(),
  cr_number: z.string().trim().max(40).optional(),
  vat_number: z
    .string()
    .trim()
    .regex(/^\d{15}$/, "vat")
    .optional(),
  address: z.string().trim().max(400).optional(),
  city: z.string().trim().max(100).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.email().max(200).optional(),
  website: z.string().trim().max(200).optional(),
  invoice_footer: z.string().trim().max(600).optional(),
});

function field(v: FormDataEntryValue | null): string | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length ? s : undefined;
}

/** Manager-only (settings.manage is role-bound). RLS enforces the same at the DB. */
export async function saveOfficeSettings(formData: FormData): Promise<ActionState> {
  const session = await getSessionProfile();
  if (!session) return { error: "غير مصرّح." };
  const perms = await getEffectivePermissions();
  if (!can(perms, "settings.manage")) return { error: "إعدادات المكتب للمدير العام فقط." };

  const parsed = settingsSchema.safeParse({
    office_name: formData.get("office_name"),
    office_name_en: field(formData.get("office_name_en")),
    cr_number: field(formData.get("cr_number")),
    vat_number: field(formData.get("vat_number")),
    address: field(formData.get("address")),
    city: field(formData.get("city")),
    phone: field(formData.get("phone")),
    email: field(formData.get("email")),
    website: field(formData.get("website")),
    invoice_footer: field(formData.get("invoice_footer")),
  });
  if (!parsed.success) {
    const vatIssue = parsed.error.issues.some((i) => i.message === "vat");
    return {
      error: vatIssue
        ? "الرقم الضريبي يجب أن يكون 15 رقماً (كما في شهادة التسجيل الضريبي)، أو اتركه فارغاً."
        : "تحقق من الحقول: اسم المكتب مطلوب وبريد صحيح إن وُجد.",
    };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("office_settings")
    .update({
      office_name: d.office_name,
      office_name_en: d.office_name_en ?? null,
      cr_number: d.cr_number ?? null,
      vat_number: d.vat_number ?? null,
      address: d.address ?? null,
      city: d.city ?? null,
      phone: d.phone ?? null,
      email: d.email ?? null,
      website: d.website ?? null,
      invoice_footer: d.invoice_footer ?? null,
      updated_by: session.userId,
    })
    .eq("id", true);
  if (error) return { error: "تعذّر حفظ الإعدادات." };

  await supabase.from("audit_log").insert({
    actor_id: session.userId,
    action: "settings.update",
    target_type: "office_settings",
    target_id: "singleton",
    metadata: { office_name: d.office_name, vat_registered: Boolean(d.vat_number) },
  });

  revalidatePath("/settings/office");
  revalidatePath("/invoices");
  return { success: "تم حفظ إعدادات المكتب." };
}
