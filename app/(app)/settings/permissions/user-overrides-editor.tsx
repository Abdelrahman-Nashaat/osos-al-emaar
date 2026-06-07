"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { clearUserOverride, setUserOverride, type ActionState } from "./actions";
import {
  PERMISSION_KEYS,
  PERMISSION_LABELS,
  ROLE_LABELS,
  isGrantableKey,
  type AppRole,
} from "@/lib/auth/permission-keys";
import { Label } from "@/components/ui/label";

const GRANTABLE = PERMISSION_KEYS.filter(isGrantableKey);

const SELECT_CLASS =
  "h-9 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

type AppUser = { id: string; full_name: string; role: AppRole };
type OverridesByUser = Record<string, Record<string, boolean>>;

export function UserOverridesEditor({
  users,
  overridesByUser,
}: {
  users: AppUser[];
  overridesByUser: OverridesByUser;
}) {
  const [userId, setUserId] = useState(users[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  const current = overridesByUser[userId] ?? {};

  function notify(result: ActionState) {
    if (result.error) toast.error(result.error);
    else toast.success(result.success ?? "تم");
  }

  function change(key: string, value: "inherit" | "allow" | "deny") {
    startTransition(async () => {
      if (value === "inherit") notify(await clearUserOverride(userId, key));
      else notify(await setUserOverride(userId, key, value === "allow"));
    });
  }

  if (users.length === 0) {
    return <p className="text-sm text-muted-foreground">أضف موظفين أولاً من قسم «الفريق».</p>;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="override-user">الموظف</Label>
        <select
          id="override-user"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className={SELECT_CLASS}
        >
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name} — {ROLE_LABELS[u.role]}
            </option>
          ))}
        </select>
      </div>

      <div className="divide-y divide-border rounded-md border border-border">
        {GRANTABLE.map((key) => {
          const value =
            current[key] === true ? "allow" : current[key] === false ? "deny" : "inherit";
          return (
            <div key={key} className="flex items-center justify-between gap-3 p-3">
              <span className="text-sm">{PERMISSION_LABELS[key]}</span>
              <select
                aria-label={PERMISSION_LABELS[key]}
                value={value}
                disabled={pending}
                onChange={(e) => change(key, e.target.value as "inherit" | "allow" | "deny")}
                className={SELECT_CLASS}
              >
                <option value="inherit">حسب الدور</option>
                <option value="allow">مسموح</option>
                <option value="deny">ممنوع</option>
              </select>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        المبالغ والفواتير غير قابلة للتخصيص لأي فرد — مرتبطة بالدور (المدير والمحاسب فقط).
      </p>
    </div>
  );
}
