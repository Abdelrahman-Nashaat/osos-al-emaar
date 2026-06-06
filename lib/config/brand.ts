/**
 * Single source of truth for the app's brand identity.
 * Confirmed name (operator): «شركة أسس الإعمار المتقدمة».
 * Change it here only — every screen reads from this object.
 */
export const brand = {
  nameAr: "شركة أسس الإعمار المتقدمة",
  shortNameAr: "أسس الإعمار",
  nameEn: "Osos Al-Emaar Advanced Company",
  taglineAr: "نظام إدارة المكتب الهندسي",
  locale: "ar",
  dir: "rtl",
  /** Default currency for financial values (international-ready). */
  defaultCurrency: "SAR",
} as const;

export type Brand = typeof brand;
