import type { Database } from "@/lib/supabase/database.types";

export type AppRole = Database["public"]["Enums"]["app_role"];

/**
 * Permission catalog — mirrors the seeded `role_permissions` rows.
 * Pure module (no server deps) so it is safe to import from client components and tests.
 */
export const PERMISSION_KEYS = [
  "projects.view",
  "projects.edit",
  "tasks.view",
  "tasks.assign",
  "tasks.delete",
  "clients.view",
  "clients.edit",
  "financials.view",
  "team.manage",
  "permissions.manage",
  "portfolio.view",
  "portfolio.edit",
  "offers.view",
  "offers.edit",
  "settings.manage",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];
export type Permissions = Record<string, boolean>;

/**
 * Per-individual overrides are limited to operational keys.
 * Amendment 1: `financials.view` (and anything else) can NEVER be granted per-user —
 * also enforced by a CHECK constraint on user_permission_overrides.
 */
export function isGrantableKey(key: string): boolean {
  return key.startsWith("projects.") || key.startsWith("tasks.");
}

export function can(perms: Permissions, key: PermissionKey): boolean {
  return perms[key] === true;
}

export function emptyPermissions(): Permissions {
  const perms: Permissions = {};
  for (const key of PERMISSION_KEYS) perms[key] = false;
  return perms;
}

/**
 * Pure effective-permission computation (unit-tested):
 *   effective = override (operational keys only) ?? role default ?? false,
 *   except `financials.view`, which is always role-bound (manager/accountant) and never grantable.
 */
export function computeEffectivePermissions(input: {
  role: AppRole;
  roleDefaults: ReadonlyArray<{ permission_key: string; allowed: boolean }>;
  overrides: ReadonlyArray<{ permission_key: string; allowed: boolean }>;
}): Permissions {
  const perms = emptyPermissions();
  for (const r of input.roleDefaults) perms[r.permission_key] = r.allowed;
  for (const o of input.overrides) {
    if (isGrantableKey(o.permission_key)) perms[o.permission_key] = o.allowed;
  }
  perms["financials.view"] = input.role === "manager" || input.role === "accountant";
  return perms;
}

export const ROLE_LABELS: Record<AppRole, string> = {
  manager: "المدير العام",
  engineer: "مهندس",
  accountant: "محاسب",
};

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  "projects.view": "عرض المشاريع",
  "projects.edit": "تعديل المشاريع",
  "tasks.view": "عرض المهام",
  "tasks.assign": "تعيين المهام",
  "tasks.delete": "حذف المهام",
  "clients.view": "عرض العملاء",
  "clients.edit": "تعديل العملاء",
  "financials.view": "رؤية المبالغ والفواتير",
  "team.manage": "إدارة الفريق",
  "permissions.manage": "إدارة الصلاحيات",
  "portfolio.view": "عرض معرض الأعمال",
  "portfolio.edit": "تعديل معرض الأعمال",
  "offers.view": "عرض العروض",
  "offers.edit": "تعديل العروض",
  "settings.manage": "إعدادات المكتب",
};
