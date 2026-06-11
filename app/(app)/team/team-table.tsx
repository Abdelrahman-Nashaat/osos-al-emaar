"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setMemberActive, setMemberRole, type ActionState } from "./actions";
import { ResetPasswordButton } from "./reset-password-button";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Role = "manager" | "engineer" | "accountant";
type Member = {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  is_active: boolean;
};

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "manager", label: "مدير عام" },
  { value: "engineer", label: "مهندس" },
  { value: "accountant", label: "محاسب" },
];

const SELECT_CLASS =
  "h-10 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50";

export function TeamTable({
  members,
  currentUserId,
}: {
  members: Member[];
  currentUserId: string;
}) {
  const [pending, startTransition] = useTransition();
  // Optimistic role per member while a change is in flight. When the action
  // settles we drop the entry and fall back to the prop: on success the page
  // has revalidated to the new role; on rejection (e.g. the last-manager guard)
  // the prop is unchanged, so the dropdown reverts to the old role on its own.
  const [optimisticRoles, setOptimisticRoles] = useState<Record<string, Role>>({});

  function notify(result: ActionState) {
    if (result.error) toast.error(result.error);
    else toast.success(result.success ?? "تم");
  }

  function changeRole(id: string, nextRole: Role) {
    setOptimisticRoles((r) => ({ ...r, [id]: nextRole }));
    startTransition(async () => {
      notify(await setMemberRole(id, nextRole));
      setOptimisticRoles((r) => {
        const next = { ...r };
        delete next[id];
        return next;
      });
    });
  }
  function changeActive(id: string, active: boolean) {
    startTransition(async () => notify(await setMemberActive(id, active)));
  }

  function roleSelect(m: Member, className?: string) {
    const value = optimisticRoles[m.id] ?? m.role;
    return (
      <select
        aria-label="الدور"
        value={value}
        disabled={m.id === currentUserId || pending}
        onChange={(e) => changeRole(m.id, e.target.value as Role)}
        className={cn(SELECT_CLASS, className)}
      >
        {ROLE_OPTIONS.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
    );
  }
  function activeSwitch(m: Member) {
    return (
      <Switch
        aria-label="نشط"
        checked={m.is_active}
        disabled={m.id === currentUserId || pending}
        onCheckedChange={(v) => changeActive(m.id, v)}
      />
    );
  }

  return (
    <>
      {/* Desktop: table */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>الاسم</TableHead>
              <TableHead>البريد</TableHead>
              <TableHead>الدور</TableHead>
              <TableHead>نشط</TableHead>
              <TableHead>كلمة المرور</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => {
              const self = m.id === currentUserId;
              return (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">
                    {m.full_name}
                    {self ? (
                      <Badge variant="outline" className="ms-2">
                        أنت
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell dir="ltr" className="text-start text-muted-foreground">
                    {m.email}
                  </TableCell>
                  <TableCell>{roleSelect(m)}</TableCell>
                  <TableCell>{activeSwitch(m)}</TableCell>
                  <TableCell>
                    <ResetPasswordButton userId={m.id} disabled={self || pending} />
                  </TableCell>
                </TableRow>
              );
            })}
            {members.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  لا يوجد أعضاء بعد.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      {/* Mobile: stacked cards (no horizontal scroll) */}
      <div className="space-y-3 md:hidden">
        {members.length === 0 ? (
          <p className="rounded-lg border border-border p-4 text-center text-sm text-muted-foreground">
            لا يوجد أعضاء بعد.
          </p>
        ) : (
          members.map((m) => {
            const self = m.id === currentUserId;
            return (
              <div key={m.id} className="space-y-3 rounded-lg border border-border p-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-medium">
                    {m.full_name}
                    {self ? <Badge variant="outline">أنت</Badge> : null}
                  </div>
                  <div dir="ltr" className="text-start text-sm text-muted-foreground">
                    {m.email}
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">الدور</span>
                  {roleSelect(m, "w-full")}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">نشط</span>
                  {activeSwitch(m)}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">كلمة المرور</span>
                  <ResetPasswordButton userId={m.id} disabled={self || pending} />
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
