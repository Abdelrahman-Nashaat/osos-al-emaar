"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { setMemberActive, setMemberRole, type ActionState } from "./actions";
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
  "h-8 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50";

export function TeamTable({
  members,
  currentUserId,
}: {
  members: Member[];
  currentUserId: string;
}) {
  const [pending, startTransition] = useTransition();

  function notify(result: ActionState) {
    if (result.error) toast.error(result.error);
    else toast.success(result.success ?? "تم");
  }

  function changeRole(id: string, role: Role) {
    startTransition(async () => notify(await setMemberRole(id, role)));
  }
  function changeActive(id: string, active: boolean) {
    startTransition(async () => notify(await setMemberActive(id, active)));
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>الاسم</TableHead>
          <TableHead>البريد</TableHead>
          <TableHead>الدور</TableHead>
          <TableHead>نشط</TableHead>
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
              <TableCell>
                <select
                  aria-label="الدور"
                  defaultValue={m.role}
                  disabled={self || pending}
                  onChange={(e) => changeRole(m.id, e.target.value as Role)}
                  className={SELECT_CLASS}
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </TableCell>
              <TableCell>
                <Switch
                  aria-label="نشط"
                  checked={m.is_active}
                  disabled={self || pending}
                  onCheckedChange={(v) => changeActive(m.id, v)}
                />
              </TableCell>
            </TableRow>
          );
        })}
        {members.length === 0 ? (
          <TableRow>
            <TableCell colSpan={4} className="text-center text-muted-foreground">
              لا يوجد أعضاء بعد.
            </TableCell>
          </TableRow>
        ) : null}
      </TableBody>
    </Table>
  );
}
