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
import { VAT_RATES } from "@/lib/finance/invoice";
import type { OfferStatus } from "@/lib/offers/offer";

export type ActionState = { error?: string; success?: string };
export type ConvertState = { error?: string; success?: string; projectId?: string };

const uuidSchema = z.uuid();
const isUuid = (v: string) => uuidSchema.safeParse(v).success;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function field(v: FormDataEntryValue | null): string | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length ? s : undefined;
}

function money(v: FormDataEntryValue | null): { ok: true; value: number } | { ok: false } {
  const s = typeof v === "string" ? v.trim().replace(/,/g, "") : "";
  if (!s) return { ok: false };
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return { ok: false };
  return { ok: true, value: n };
}

const RPC_ERRORS: Record<string, string> = {
  not_authorized: "لا تملك صلاحية تنفيذ هذا الإجراء.",
  invalid_title: "أدخل عنواناً صحيحاً للعرض (حرفان على الأقل).",
  invalid_subtotal: "أدخل مبلغاً صحيحاً أكبر من صفر.",
  invalid_vat_rate: "نسبة الضريبة يجب أن تكون ٠٪ أو ١٥٪.",
  invalid_client: "اختر عميلاً صحيحاً.",
  invalid_dates: "تاريخ البدء يجب أن يسبق تاريخ الاستحقاق.",
  not_draft: "لا يمكن تعديل عرض بعد إرساله.",
  illegal_state: "لا يمكن تنفيذ هذا الإجراء على حالة العرض الحالية.",
  already_converted: "هذا العرض مُحوَّل إلى مشروع مسبقاً.",
  offer_not_found: "العرض غير موجود.",
  empty_note: "الملاحظة فارغة.",
};
function rpcError(error: { message?: string } | null): string {
  const msg = error?.message ?? "";
  for (const key of Object.keys(RPC_ERRORS)) {
    if (msg.includes(key)) return RPC_ERRORS[key];
  }
  return "تعذّر تنفيذ العملية.";
}

function revalidateOffers(offerId?: string) {
  revalidatePath("/offers");
  revalidatePath("/dashboard");
  if (offerId) revalidatePath(`/offers/${offerId}`);
}

/** offers.edit holders (manager by default) — DB functions re-check the same. */
async function requireOffersEditor(): Promise<SessionProfile | null> {
  const session = await getSessionProfile();
  if (!session) return null;
  const perms = await getEffectivePermissions();
  return can(perms, "offers.edit") && can(perms, "financials.view") ? session : null;
}

async function requireFinancials(): Promise<SessionProfile | null> {
  const session = await getSessionProfile();
  if (!session) return null;
  const perms = await getEffectivePermissions();
  return can(perms, "financials.view") ? session : null;
}

function parseOfferForm(formData: FormData):
  | { ok: true; title: string; subtotal: number; vat: number; validUntil?: string; scope?: string }
  | { ok: false; error: string } {
  const title = field(formData.get("title"));
  if (!title || title.length < 2) return { ok: false, error: "أدخل عنواناً صحيحاً للعرض." };

  const sub = money(formData.get("subtotal"));
  if (!sub.ok) return { ok: false, error: "أدخل مبلغاً صحيحاً أكبر من صفر." };

  const vat = Number(field(formData.get("vat_rate")) ?? "0");
  if (!(VAT_RATES as readonly number[]).includes(vat)) {
    return { ok: false, error: "نسبة الضريبة يجب أن تكون ٠٪ أو ١٥٪." };
  }

  const validUntil = field(formData.get("valid_until"));
  if (validUntil && !DATE_RE.test(validUntil)) return { ok: false, error: "تاريخ غير صحيح." };

  return { ok: true, title, subtotal: sub.value, vat, validUntil, scope: field(formData.get("scope")) };
}

/** Create an offer (draft). offers.edit-gated; DB assigns OFR-xxxxx + events + audit. */
export async function createOffer(formData: FormData): Promise<ActionState> {
  const session = await requireOffersEditor();
  if (!session) return { error: "إدارة عروض الأسعار للمدير العام فقط." };

  const clientId = field(formData.get("client_id"));
  if (!clientId || !isUuid(clientId)) return { error: "اختر عميلاً صحيحاً." };

  const parsed = parseOfferForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase.rpc("offer_create", {
    p_client: clientId,
    p_title: parsed.title,
    p_subtotal: parsed.subtotal,
    p_vat_rate: parsed.vat,
    ...(parsed.validUntil ? { p_valid_until: parsed.validUntil } : {}),
    ...(parsed.scope ? { p_scope: parsed.scope } : {}),
    ...(field(formData.get("note")) ? { p_note: field(formData.get("note")) } : {}),
  });
  if (error) return { error: rpcError(error) };

  revalidateOffers();
  return { success: "تم إنشاء عرض السعر." };
}

/** Edit a DRAFT offer. offers.edit-gated; the DB rejects non-drafts. */
export async function updateOffer(formData: FormData): Promise<ActionState> {
  const session = await requireOffersEditor();
  if (!session) return { error: "غير مصرّح." };

  const offerId = field(formData.get("offer_id"));
  if (!offerId || !isUuid(offerId)) return { error: "مدخل غير صالح." };

  const parsed = parseOfferForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase.rpc("offer_update", {
    p_offer: offerId,
    p_title: parsed.title,
    p_subtotal: parsed.subtotal,
    p_vat_rate: parsed.vat,
    ...(parsed.validUntil ? { p_valid_until: parsed.validUntil } : {}),
    ...(parsed.scope ? { p_scope: parsed.scope } : {}),
  });
  if (error) return { error: rpcError(error) };

  revalidateOffers(offerId);
  return { success: "تم تحديث العرض." };
}

const TRANSITION_LABEL: Record<Exclude<OfferStatus, "draft">, string> = {
  sent: "تم إرسال العرض.",
  accepted: "تم قبول العرض. يمكنك الآن تحويله إلى مشروع.",
  rejected: "سُجّل رفض العرض.",
  expired: "سُجّل انتهاء صلاحية العرض.",
};

/** draft→sent, sent→accepted/rejected/expired. offers.edit-gated. */
export async function transitionOffer(formData: FormData): Promise<ActionState> {
  const session = await requireOffersEditor();
  if (!session) return { error: "غير مصرّح." };

  const offerId = field(formData.get("offer_id"));
  const to = field(formData.get("to")) as Exclude<OfferStatus, "draft"> | undefined;
  if (!offerId || !isUuid(offerId)) return { error: "مدخل غير صالح." };
  if (!to || !["sent", "accepted", "rejected", "expired"].includes(to)) {
    return { error: "حالة غير صالحة." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("offer_transition", {
    p_offer: offerId,
    p_to: to,
    ...(field(formData.get("note")) ? { p_note: field(formData.get("note")) } : {}),
  });
  if (error) return { error: rpcError(error) };

  revalidateOffers(offerId);
  return { success: TRANSITION_LABEL[to] };
}

/** Delete a DRAFT offer. MANAGER ONLY (DB-enforced). */
export async function deleteOffer(formData: FormData): Promise<ActionState> {
  const session = await getSessionProfile();
  if (!session || session.profile.role !== "manager") {
    return { error: "حذف العروض للمدير العام فقط." };
  }

  const offerId = field(formData.get("offer_id"));
  if (!offerId || !isUuid(offerId)) return { error: "مدخل غير صالح." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("offer_delete", {
    p_offer: offerId,
    ...(field(formData.get("note")) ? { p_note: field(formData.get("note")) } : {}),
  });
  if (error) return { error: rpcError(error) };

  revalidateOffers();
  return { success: "تم حذف العرض." };
}

/** Follow-up note (manager + accountant). */
export async function addOfferNote(formData: FormData): Promise<ActionState> {
  const session = await requireFinancials();
  if (!session) return { error: "غير مصرّح." };

  const offerId = field(formData.get("offer_id"));
  const note = field(formData.get("note"));
  if (!offerId || !isUuid(offerId)) return { error: "مدخل غير صالح." };
  if (!note) return { error: "الملاحظة فارغة." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("offer_add_note", { p_offer: offerId, p_note: note });
  if (error) return { error: rpcError(error) };

  revalidateOffers(offerId);
  return { success: "تمت إضافة الملاحظة." };
}

/**
 * Convert an ACCEPTED offer into a project (atomic in the DB: project +
 * project_financials.contract_value + link + audit). MANAGER ONLY.
 */
export async function convertOffer(formData: FormData): Promise<ConvertState> {
  const session = await getSessionProfile();
  if (!session || session.profile.role !== "manager") {
    return { error: "تحويل العروض إلى مشاريع للمدير العام فقط." };
  }

  const offerId = field(formData.get("offer_id"));
  if (!offerId || !isUuid(offerId)) return { error: "مدخل غير صالح." };

  const startDate = field(formData.get("start_date"));
  const dueDate = field(formData.get("due_date"));
  if ((startDate && !DATE_RE.test(startDate)) || (dueDate && !DATE_RE.test(dueDate))) {
    return { error: "تاريخ غير صحيح." };
  }
  if (startDate && dueDate && dueDate < startDate) {
    return { error: "تاريخ البدء يجب أن يسبق تاريخ الاستحقاق." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("offer_convert_to_project", {
    p_offer: offerId,
    ...(field(formData.get("name")) ? { p_name: field(formData.get("name")) } : {}),
    ...(startDate ? { p_start_date: startDate } : {}),
    ...(dueDate ? { p_due_date: dueDate } : {}),
  });
  if (error) return { error: rpcError(error) };

  revalidateOffers(offerId);
  revalidatePath("/projects");
  return {
    success: "تم إنشاء المشروع من العرض مع نقل قيمة العقد.",
    projectId: (data as unknown as string) ?? undefined,
  };
}
