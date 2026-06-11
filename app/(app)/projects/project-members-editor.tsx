"use client";

import { useState, useTransition } from "react";
import { UserPlus, X } from "lucide-react";
import { useActionResult } from "@/components/use-action-result";
import { addProjectMember, removeProjectMember } from "./actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Member = { user_id: string; full_name: string; role: string };
type Assignable = { id: string; full_name: string; role: string };

const ROLE_LABEL: Record<string, string> = {
  manager: "مدير عام",
  engineer: "مهندس",
  accountant: "محاسب",
};

const SELECT_CLASS =
  "h-10 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50";

export function ProjectMembersEditor({
  projectId,
  members,
  assignable,
  canEdit,
}: {
  projectId: string;
  members: Member[];
  assignable: Assignable[];
  canEdit: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState("");
  const onResult = useActionResult();

  const memberIds = new Set(members.map((m) => m.user_id));
  const options = assignable.filter((a) => !memberIds.has(a.id));

  function add() {
    if (!selected) return;
    startTransition(async () => {
      onResult(await addProjectMember(projectId, selected));
      setSelected("");
    });
  }
  function remove(userId: string) {
    startTransition(async () => {
      onResult(await removeProjectMember(projectId, userId));
    });
  }

  return (
    <div className="space-y-3">
      {members.length === 0 ? (
        <p className="text-sm text-muted-foreground">لا يوجد مهندسون معيّنون بعد.</p>
      ) : (
        <ul className="space-y-2">
          {members.map((m) => (
            <li
              key={m.user_id}
              className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
            >
              <span className="flex items-center gap-2 text-sm">
                <span className="font-medium">{m.full_name}</span>
                <Badge variant="secondary">{ROLE_LABEL[m.role] ?? m.role}</Badge>
              </span>
              {canEdit ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-10"
                  aria-label={`إزالة ${m.full_name}`}
                  disabled={pending}
                  onClick={() => remove(m.user_id)}
                >
                  <X className="size-4" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canEdit ? (
        <div className="flex items-center gap-2">
          <select
            aria-label="إضافة مهندس للمشروع"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={pending || options.length === 0}
            className={SELECT_CLASS}
          >
            <option value="">{options.length === 0 ? "لا يوجد مزيد" : "اختر عضواً…"}</option>
            {options.map((a) => (
              <option key={a.id} value={a.id}>
                {a.full_name} — {ROLE_LABEL[a.role] ?? a.role}
              </option>
            ))}
          </select>
          <Button onClick={add} disabled={pending || !selected}>
            <UserPlus className="size-4" />
            إضافة
          </Button>
        </div>
      ) : null}
    </div>
  );
}
