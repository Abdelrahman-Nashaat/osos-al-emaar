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
import { PAYMENT_METHODS, VAT_RATES, type PaymentMethod } from "@/lib/finance/invoice";

export type ActionState = { error?: string; success?: string };

const uuidSchema = z.uuid();
const isUuid = (v: string) => uuidSchema.safeParse(v).success;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Trim a FormData field to a non-empty string, else undefined. */
function field(v: FormDataEntryValue | null): string | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length ? s : undefined;
}

/** Parse a strictly-positive money field; { ok:false } on an invalid value. */
function money(v: FormDataEntryValue | null): { ok: true; value: number } | { ok: false } {
  const s = typeof v === "string" ? v.trim().replace(/,/g, "") : "";
  if (!s) return { ok: false };
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return { ok: false };
  return { ok: true, value: n };
}

/** Map a raised DB-function error (e.g. 'overpayment') to an Arabic message. */
const RPC_ERRORS: Record<string, string> = {
  not_authorized: "لا تملك صلاحية تنفيذ هذا الإجراء.",
  invalid_subtotal: "أدخل مبلغاً صحيحاً أكبر من صفر.",
  invalid_amount: "أدخل مبلغ دفعة صحيحاً.",
  invalid_vat_rate: "نسبة الضريبة يجب أن تكون ٠٪ أو ١٥٪.",
  invalid_project: "المشروع غير صالح.",
  no_client: "يجب ربط المشروع بعميل قبل إصدار فاتورة.",
  not_draft: "لا يمكن تعديل فاتورة بعد إرسالها.",
  illegal_state: "لا يمكن تنفيذ هذا الإجراء على حالة الفاتورة الحالية.",
  overpayment: "المبلغ يتجاوز المتبقّي على الفاتورة.",
  has_payments: "لا يمكن حذف فاتورة مُرسلة أو عليها دفعات — استخدم الإلغاء.",
  has_live_payments: "لا يمكن إلغاء فاتورة عليها دفعات غير معكوسة — اعكس الدفعات أولاً.",
  already_reversed: "هذه الدفعة معكوسة مسبقاً.",
  invoice_not_found: "الفاتورة غير موجودة.",
  payment_not_found: "الدفعة غير موجودة.",
  empty_note: "الملاحظة فارغة.",
};
function rpcError(error: { message?: string } | null): string {
  const msg = error?.message ?? "";
  for (const key of Object.keys(RPC_ERRORS)) {
    if (msg.includes(key)) return RPC_ERRORS[key];
  }
  return "تعذّر تنفيذ العملية.";
}

/** Revalidate every surface a finance change can touch. */
function revalidateFinance(invoiceId?: string, projectId?: string) {
  revalidatePath("/invoices");
  revalidatePath("/reports");
  revalidatePath("/dashboard");
  if (invoiceId) revalidatePath(`/invoices/${invoiceId}`);
  if (projectId) revalidatePath(`/projects/${projectId}`);
}

/** Finance roles (manager + accountant) — maps to can_view_financials() at the DB. */
async function requireFinancials(): Promise<SessionProfile | null> {
  const session = await getSessionProfile();
  if (!session) return null;
  const perms = await getEffectivePermissions();
  return can(perms, "financials.view") ? session : null;
}

/** Manager-only finance actions (void / delete / payment reversal). */
async function requireManager(): Promise<SessionProfile | null> {
  const session = await getSessionProfile();
  if (!session || session.profile.role !== "manager") return null;
  return session;
}

function validVat(v: number): boolean {
  return (VAT_RATES as readonly number[]).includes(v);
}

/**
 * Create an invoice. financials.view-gated. Delegates to the SECURITY DEFINER
 * invoice_create function, which captures the project's client, forces status
 * 'draft' + progress 0, enforces VAT ∈ {0,15}, computes the total, assigns the
 * number, and writes the created event + audit_log atomically.
 */
export async function createInvoice(formData: FormData): Promise<ActionState> {
  const session = await requireFinancials();
  if (!session) return { error: "إدارة الفواتير للمدير العام والمحاسب فقط." };

  const projectId = field(formData.get("project_id"));
  if (!projectId || !isUuid(projectId)) return { error: "اختر مشروعاً صحيحاً." };

  const sub = money(formData.get("subtotal"));
  if (!sub.ok) return { error: "أدخل مبلغاً صحيحاً أكبر من صفر." };

  const vat = Number(field(formData.get("vat_rate")) ?? "0");
  if (!validVat(vat)) return { error: "نسبة الضريبة يجب أن تكون ٠٪ أو ١٥٪." };

  const dueDate = field(formData.get("due_date"));
  const issueDate = field(formData.get("issue_date"));
  if ((dueDate && !DATE_RE.test(dueDate)) || (issueDate && !DATE_RE.test(issueDate))) {
    return { error: "تاريخ غير صحيح." };
  }
  // Cross-field date rules (B8). +48h grace absorbs the KSA/UTC offset.
  const farFuture = new Date(Date.now() + 48 * 3600 * 1000).toISOString().slice(0, 10);
  if (issueDate && issueDate > farFuture) {
    return { error: "تاريخ الإصدار غير منطقي (في المستقبل)." };
  }
  const effectiveIssue = issueDate ?? new Date().toISOString().slice(0, 10);
  if (dueDate && dueDate < effectiveIssue) {
    return { error: "تاريخ الإصدار يجب أن يسبق تاريخ الاستحقاق أو يساويه." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("invoice_create", {
    p_project: projectId,
    p_subtotal: sub.value,
    p_vat_rate: vat,
    ...(dueDate ? { p_due_date: dueDate } : {}),
    ...(issueDate ? { p_issue_date: issueDate } : {}),
    ...(field(formData.get("description")) ? { p_description: field(formData.get("description")) } : {}),
    ...(field(formData.get("note")) ? { p_note: field(formData.get("note")) } : {}),
  });
  if (error) return { error: rpcError(error) };

  revalidateFinance(undefined, projectId);
  return { success: "تم إنشاء الفاتورة." };
}

/** Edit a DRAFT invoice. financials.view-gated; the DB rejects non-drafts. */
export async function updateInvoice(formData: FormData): Promise<ActionState> {
  const session = await requireFinancials();
  if (!session) return { error: "غير مصرّح." };

  const invoiceId = field(formData.get("invoice_id"));
  const projectId = field(formData.get("project_id"));
  if (!invoiceId || !isUuid(invoiceId)) return { error: "مدخل غير صالح." };

  const sub = money(formData.get("subtotal"));
  if (!sub.ok) return { error: "أدخل مبلغاً صحيحاً أكبر من صفر." };

  const vat = Number(field(formData.get("vat_rate")) ?? "0");
  if (!validVat(vat)) return { error: "نسبة الضريبة يجب أن تكون ٠٪ أو ١٥٪." };

  const dueDate = field(formData.get("due_date"));
  if (dueDate && !DATE_RE.test(dueDate)) return { error: "تاريخ غير صحيح." };

  const supabase = await createClient();

  // The due date may not precede the stored issue date (B8).
  if (dueDate) {
    const { data: inv } = await supabase
      .from("invoices")
      .select("issue_date")
      .eq("id", invoiceId)
      .maybeSingle();
    if (inv?.issue_date && dueDate < inv.issue_date) {
      return { error: "تاريخ الإصدار يجب أن يسبق تاريخ الاستحقاق أو يساويه." };
    }
  }

  const { error } = await supabase.rpc("invoice_update", {
    p_invoice: invoiceId,
    p_subtotal: sub.value,
    p_vat_rate: vat,
    ...(dueDate ? { p_due_date: dueDate } : {}),
    ...(field(formData.get("description")) ? { p_description: field(formData.get("description")) } : {}),
  });
  if (error) return { error: rpcError(error) };

  revalidateFinance(invoiceId, projectId);
  return { success: "تم تحديث الفاتورة." };
}

/** Send a draft invoice (draft → sent). financials.view-gated. */
export async function sendInvoice(formData: FormData): Promise<ActionState> {
  const session = await requireFinancials();
  if (!session) return { error: "غير مصرّح." };

  const invoiceId = field(formData.get("invoice_id"));
  const projectId = field(formData.get("project_id"));
  if (!invoiceId || !isUuid(invoiceId)) return { error: "مدخل غير صالح." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("invoice_send", {
    p_invoice: invoiceId,
    ...(field(formData.get("note")) ? { p_note: field(formData.get("note")) } : {}),
  });
  if (error) return { error: rpcError(error) };

  revalidateFinance(invoiceId, projectId);
  return { success: "تم إرسال الفاتورة." };
}

/** Record a payment; the DB maintains the running balance + status atomically. */
export async function recordPayment(formData: FormData): Promise<ActionState> {
  const session = await requireFinancials();
  if (!session) return { error: "تسجيل الدفعات للمدير العام والمحاسب فقط." };

  const invoiceId = field(formData.get("invoice_id"));
  const projectId = field(formData.get("project_id"));
  if (!invoiceId || !isUuid(invoiceId)) return { error: "مدخل غير صالح." };

  const amt = money(formData.get("amount"));
  if (!amt.ok) return { error: "أدخل مبلغ دفعة صحيحاً." };

  const method = field(formData.get("method")) ?? "bank_transfer";
  if (!(PAYMENT_METHODS as readonly string[]).includes(method)) {
    return { error: "طريقة دفع غير صالحة." };
  }

  const paidAt = field(formData.get("paid_at"));
  if (paidAt && !DATE_RE.test(paidAt)) return { error: "تاريخ غير صحيح." };

  const supabase = await createClient();

  // Payment-date sanity (B8): not in the future (+48h UTC grace) and not before
  // the invoice's issue date.
  if (paidAt) {
    const farFuture = new Date(Date.now() + 48 * 3600 * 1000).toISOString().slice(0, 10);
    if (paidAt > farFuture) {
      return { error: "تاريخ الدفع لا يمكن أن يكون في المستقبل." };
    }
    const { data: inv } = await supabase
      .from("invoices")
      .select("issue_date")
      .eq("id", invoiceId)
      .maybeSingle();
    if (inv?.issue_date && paidAt < inv.issue_date) {
      return { error: "تاريخ الدفع لا يمكن أن يسبق تاريخ إصدار الفاتورة." };
    }
  }

  const { error } = await supabase.rpc("invoice_record_payment", {
    p_invoice: invoiceId,
    p_amount: amt.value,
    p_method: method as PaymentMethod,
    ...(paidAt ? { p_paid_at: paidAt } : {}),
    ...(field(formData.get("reference")) ? { p_reference: field(formData.get("reference")) } : {}),
    ...(field(formData.get("note")) ? { p_note: field(formData.get("note")) } : {}),
  });
  if (error) return { error: rpcError(error) };

  revalidateFinance(invoiceId, projectId);
  return { success: "تم تسجيل الدفعة." };
}

/** Append a تحصيل follow-up note (no state change). financials.view-gated. */
export async function addInvoiceNote(formData: FormData): Promise<ActionState> {
  const session = await requireFinancials();
  if (!session) return { error: "غير مصرّح." };

  const invoiceId = field(formData.get("invoice_id"));
  const projectId = field(formData.get("project_id"));
  const note = field(formData.get("note"));
  if (!invoiceId || !isUuid(invoiceId)) return { error: "مدخل غير صالح." };
  if (!note) return { error: "الملاحظة فارغة." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("invoice_add_note", { p_invoice: invoiceId, p_note: note });
  if (error) return { error: rpcError(error) };

  revalidateFinance(invoiceId, projectId);
  return { success: "تمت إضافة الملاحظة." };
}

/** Void an invoice. MANAGER ONLY + audited (enforced in DB invoice_void). */
export async function voidInvoice(formData: FormData): Promise<ActionState> {
  const session = await requireManager();
  if (!session) return { error: "إلغاء الفواتير للمدير العام فقط." };

  const invoiceId = field(formData.get("invoice_id"));
  const projectId = field(formData.get("project_id"));
  if (!invoiceId || !isUuid(invoiceId)) return { error: "مدخل غير صالح." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("invoice_void", {
    p_invoice: invoiceId,
    ...(field(formData.get("note")) ? { p_note: field(formData.get("note")) } : {}),
  });
  if (error) return { error: rpcError(error) };

  revalidateFinance(invoiceId, projectId);
  return { success: "تم إلغاء الفاتورة." };
}

/** Delete a DRAFT invoice (no payments). MANAGER ONLY + audited (DB invoice_delete). */
export async function deleteInvoice(formData: FormData): Promise<ActionState> {
  const session = await requireManager();
  if (!session) return { error: "حذف الفواتير للمدير العام فقط." };

  const invoiceId = field(formData.get("invoice_id"));
  const projectId = field(formData.get("project_id"));
  if (!invoiceId || !isUuid(invoiceId)) return { error: "مدخل غير صالح." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("invoice_delete", {
    p_invoice: invoiceId,
    ...(field(formData.get("note")) ? { p_note: field(formData.get("note")) } : {}),
  });
  if (error) return { error: rpcError(error) };

  revalidateFinance(undefined, projectId);
  return { success: "تم حذف الفاتورة." };
}

/**
 * Reverse a payment NON-DESTRUCTIVELY. MANAGER ONLY. The DB payment_reverse flags
 * the original row (is_reversed) — it is never deleted — recomputes amount_paid
 * from non-reversed payments, resets status, and writes audit_log atomically.
 */
export async function reversePayment(formData: FormData): Promise<ActionState> {
  const session = await requireManager();
  if (!session) return { error: "عكس الدفعات للمدير العام فقط." };

  const paymentId = field(formData.get("payment_id"));
  const invoiceId = field(formData.get("invoice_id"));
  const projectId = field(formData.get("project_id"));
  if (!paymentId || !isUuid(paymentId)) return { error: "مدخل غير صالح." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("payment_reverse", {
    p_payment: paymentId,
    ...(field(formData.get("note")) ? { p_note: field(formData.get("note")) } : {}),
  });
  if (error) return { error: rpcError(error) };

  revalidateFinance(invoiceId, projectId);
  return { success: "تم عكس الدفعة." };
}
