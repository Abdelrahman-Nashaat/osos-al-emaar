import type { Database } from "@/lib/supabase/database.types";

/**
 * Finance domain helpers — pure module (no server deps) so it is safe to import
 * from server components, client components, and unit tests. Mirrors
 * `lib/tasks/status.ts`. Only ever used on financials-gated surfaces.
 */
export type InvoiceStatus = Database["public"]["Enums"]["invoice_status"];
export type PaymentMethod = Database["public"]["Enums"]["payment_method"];
export type InvoiceEventType = Database["public"]["Enums"]["invoice_event_type"];

export const INVOICE_STATUSES = [
  "draft",
  "sent",
  "partially_paid",
  "paid",
  "void",
] as const satisfies readonly InvoiceStatus[];

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "مسودة",
  sent: "مُرسلة",
  partially_paid: "مدفوعة جزئياً",
  paid: "مدفوعة",
  void: "ملغاة",
};

/** Tailwind classes for the status badge (kept here so list + detail agree). */
export const INVOICE_STATUS_BADGE: Record<InvoiceStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  partially_paid: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  paid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  void: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
};

/**
 * Statuses that represent a real, ISSUED receivable. Only these may count toward
 * revenue / outstanding / aging / contract-remaining aggregates: drafts are not
 * receivables yet and void invoices are cancelled — neither may ever inflate a
 * money KPI (Phase 4.5 A1).
 */
export const ISSUED_STATUSES = [
  "sent",
  "partially_paid",
  "paid",
] as const satisfies readonly InvoiceStatus[];

export function isIssued(status: InvoiceStatus): boolean {
  return (ISSUED_STATUSES as readonly InvoiceStatus[]).includes(status);
}

export const PAYMENT_METHODS = [
  "cash",
  "bank_transfer",
  "cheque",
  "card",
  "other",
] as const satisfies readonly PaymentMethod[];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "نقداً",
  bank_transfer: "تحويل بنكي",
  cheque: "شيك",
  card: "بطاقة",
  other: "أخرى",
};

/** The only legal VAT rates in v1 (mirrors the DB CHECK on invoices.vat_rate). */
export const VAT_RATES = [0, 15] as const;
export type VatRate = (typeof VAT_RATES)[number];
export const VAT_RATE_LABELS: Record<VatRate, string> = {
  0: "بدون ضريبة (0%)",
  15: "ضريبة القيمة المضافة 15%",
};

export const INVOICE_EVENT_LABELS: Record<InvoiceEventType, string> = {
  created: "أُنشئت",
  sent: "أُرسلت",
  payment: "دفعة",
  payment_reversed: "عُكست دفعة",
  voided: "أُلغيت",
  note: "ملاحظة",
};

/** Statuses where the due date no longer matters for overdue/collections. */
const SETTLED_STATUSES: ReadonlySet<InvoiceStatus> = new Set<InvoiceStatus>([
  "draft",
  "paid",
  "void",
]);

/** Format a Date as a local "YYYY-MM-DD" string (no timezone shift). */
function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * An invoice is overdue when it has a real due date strictly in the past AND it is
 * still awaiting collection (sent / partially_paid). Draft/paid/void are never
 * overdue. Compares "YYYY-MM-DD" strings, which sort chronologically.
 */
export function isInvoiceOverdue(
  dueDate: string | null | undefined,
  status: InvoiceStatus,
  today: Date = new Date(),
): boolean {
  if (!dueDate) return false;
  if (SETTLED_STATUSES.has(status)) return false;
  return dueDate.slice(0, 10) < toISODate(today);
}

/** Outstanding balance = max(0, total − amount_paid), rounded to 2 decimals. */
export function outstanding(total: number, amountPaid: number): number {
  return Math.max(0, Math.round((total - amountPaid) * 100) / 100);
}

export type AgingBucket = "current" | "d1_30" | "d31_60" | "d60_plus";

/**
 * Collections aging bucket for an outstanding invoice's due date. "current" means
 * not yet overdue (or no due date). Buckets count whole days past the due date.
 */
export function agingBucket(
  dueDate: string | null | undefined,
  today: Date = new Date(),
): AgingBucket {
  if (!dueDate) return "current";
  const due = new Date(`${dueDate.slice(0, 10)}T00:00:00`);
  const now = new Date(`${toISODate(today)}T00:00:00`);
  const days = Math.floor((now.getTime() - due.getTime()) / 86_400_000);
  if (days <= 0) return "current";
  if (days <= 30) return "d1_30";
  if (days <= 60) return "d31_60";
  return "d60_plus";
}

export const AGING_LABELS: Record<AgingBucket, string> = {
  current: "غير مستحقة",
  d1_30: "متأخرة 1–30 يوماً",
  d31_60: "متأخرة 31–60 يوماً",
  d60_plus: "متأخرة أكثر من 60 يوماً",
};

/** Whole days past the due date (0 if not overdue or no due date). */
export function daysOverdue(
  dueDate: string | null | undefined,
  today: Date = new Date(),
): number {
  if (!dueDate) return 0;
  const due = new Date(`${dueDate.slice(0, 10)}T00:00:00`);
  const now = new Date(`${toISODate(today)}T00:00:00`);
  const days = Math.floor((now.getTime() - due.getTime()) / 86_400_000);
  return days > 0 ? days : 0;
}

export type InvoiceAction = "send" | "record_payment" | "edit" | "note" | "void" | "delete";

/**
 * The allowed actions for a viewer given the invoice status. Pure → drives which
 * buttons render and is unit-tested. Mirrors the DB authority/state rules:
 *   • edit/send only on a draft; record_payment only on sent/partially_paid;
 *   • note on anything not void (finance follow-up / تحصيل);
 *   • void on anything not void, and delete only on a draft — both MANAGER ONLY.
 * The DB functions are the real gate; this only governs affordance.
 */
export function nextInvoiceActions(
  status: InvoiceStatus,
  opts: { isManager: boolean },
): InvoiceAction[] {
  const actions: InvoiceAction[] = [];
  if (status === "draft") actions.push("edit", "send");
  if (status === "sent" || status === "partially_paid") actions.push("record_payment");
  if (status !== "void") actions.push("note");
  if (opts.isManager) {
    if (status !== "void") actions.push("void");
    if (status === "draft") actions.push("delete");
  }
  return actions;
}
