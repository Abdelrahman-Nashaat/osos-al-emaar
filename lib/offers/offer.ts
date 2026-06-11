import type { Database } from "@/lib/supabase/database.types";

/**
 * Offers domain helpers — pure module (mirrors lib/finance/invoice.ts).
 * Offers are FINANCIAL surfaces (manager + accountant only).
 */
export type OfferStatus = Database["public"]["Enums"]["offer_status"];
export type OfferEventType = Database["public"]["Enums"]["offer_event_type"];

export const OFFER_STATUSES = [
  "draft",
  "sent",
  "accepted",
  "rejected",
  "expired",
] as const satisfies readonly OfferStatus[];

export const OFFER_STATUS_LABELS: Record<OfferStatus, string> = {
  draft: "مسودة",
  sent: "مُرسل",
  accepted: "مقبول",
  rejected: "مرفوض",
  expired: "منتهي الصلاحية",
};

export const OFFER_STATUS_BADGE: Record<OfferStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  accepted: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  rejected: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  expired: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
};

export const OFFER_EVENT_LABELS: Record<OfferEventType, string> = {
  created: "أُنشئ",
  updated: "عُدّل",
  sent: "أُرسل",
  accepted: "قُبل",
  rejected: "رُفض",
  expired: "انتهت صلاحيته",
  note: "ملاحظة",
  converted: "حُوّل إلى مشروع",
};

export type OfferAction =
  | "edit"
  | "send"
  | "accept"
  | "reject"
  | "expire"
  | "note"
  | "convert"
  | "delete";

/**
 * Allowed actions per status (pure; unit-tested). Mirrors the DB rules:
 *   draft → edit/send (+delete, manager); sent → accept/reject/expire;
 *   accepted & not converted → convert (manager); note anywhere.
 * The DEFINER functions are the real gate; this governs affordance only.
 */
export function nextOfferActions(
  status: OfferStatus,
  opts: { isManager: boolean; canEdit: boolean; converted: boolean },
): OfferAction[] {
  const actions: OfferAction[] = [];
  if (opts.canEdit) {
    if (status === "draft") actions.push("edit", "send");
    if (status === "sent") actions.push("accept", "reject", "expire");
  }
  if (opts.isManager && status === "accepted" && !opts.converted) actions.push("convert");
  actions.push("note");
  if (opts.isManager && status === "draft") actions.push("delete");
  return actions;
}

/** An offer still awaiting an answer past its validity date deserves a flag. */
export function isOfferStale(
  status: OfferStatus,
  validUntil: string | null,
  today: Date = new Date(),
): boolean {
  if (status !== "sent" || !validUntil) return false;
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  return validUntil.slice(0, 10) < `${y}-${m}-${d}`;
}
