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

  return (
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
        {PERMISSION_KEYS.map((key) => {
          const locked = key === "financials.view";
          return (
            <TableRow key={key}>
              <TableCell className="font-medium">{PERMISSION_LABELS[key]}</TableCell>
              {ROLES.map((role) => (
                <TableCell key={role} className="text-center">
                  {locked ? (
                    <span
                      className="inline-flex items-center justify-center gap-1 text-xs text-muted-foreground"
                      title="مرتبطة بالدور — غير قابلة للتعديل"
                    >
                      <Lock className="size-3" aria-hidden />
                      {role === "engineer" ? "✗" : "✓"}
                    </span>
                  ) : (
                    <div className="flex justify-center">
                      <Switch
                        aria-label={`${PERMISSION_LABELS[key]} — ${ROLE_LABELS[role]}`}
                        checked={matrix[role]?.[key] ?? false}
                        disabled={pending}
                        onCheckedChange={(v) => toggle(role, key, v)}
                      />
                    </div>
                  )}
                </TableCell>
              ))}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
