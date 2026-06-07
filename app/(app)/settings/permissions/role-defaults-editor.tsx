"use client";

import { useTransition } from "react";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { setRolePermission, type ActionState } from "./actions";
import {
  PERMISSION_KEYS,
  PERMISSION_LABELS,
  ROLE_LABELS,
  type AppRole,
  type PermissionKey,
} from "@/lib/auth/permission-keys";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const ROLES: AppRole[] = ["manager", "engineer", "accountant"];
type Matrix = Record<string, Record<string, boolean>>;

export function RoleDefaultsEditor({ matrix }: { matrix: Matrix }) {
  const [pending, startTransition] = useTransition();

  function notify(result: ActionState) {
    if (result.error) toast.error(result.error);
    else toast.success(result.success ?? "تم");
  }

  function toggle(role: AppRole, key: PermissionKey, allowed: boolean) {
    startTransition(async () => notify(await setRolePermission(role, key, allowed)));
  }

  // One control per (role, permission), reused by the desktop matrix and the
  // mobile stacked cards. financials.view is role-bound and never editable here.
  function cell(role: AppRole, key: PermissionKey) {
    if (key === "financials.view") {
      return (
        <span
          className="inline-flex items-center justify-center gap-1 text-xs text-muted-foreground"
          title="مرتبطة بالدور — غير قابلة للتعديل"
        >
          <Lock className="size-3" aria-hidden />
          {role === "engineer" ? "✗" : "✓"}
        </span>
      );
    }
    return (
      <Switch
        aria-label={`${PERMISSION_LABELS[key]} — ${ROLE_LABELS[role]}`}
        checked={matrix[role]?.[key] ?? false}
        disabled={pending}
        onCheckedChange={(v) => toggle(role, key, v)}
      />
    );
  }

  return (
    <>
      {/* Desktop: matrix */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>الصلاحية</TableHead>
              {ROLES.map((r) => (
                <TableHead key={r} className="text-center">
                  {ROLE_LABELS[r]}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {PERMISSION_KEYS.map((key) => (
              <TableRow key={key}>
                <TableCell className="font-medium">{PERMISSION_LABELS[key]}</TableCell>
                {ROLES.map((role) => (
                  <TableCell key={role} className="text-center">
                    <div className="flex justify-center">{cell(role, key)}</div>
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile: one card per permission (no horizontal scroll) */}
      <div className="space-y-3 md:hidden">
        {PERMISSION_KEYS.map((key) => (
          <div key={key} className="rounded-lg border border-border p-4">
            <div className="mb-2 font-medium">{PERMISSION_LABELS[key]}</div>
            <div className="divide-y divide-border">
              {ROLES.map((role) => (
                <div key={role} className="flex items-center justify-between py-2">
                  <span className="text-sm text-muted-foreground">{ROLE_LABELS[role]}</span>
                  {cell(role, key)}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
