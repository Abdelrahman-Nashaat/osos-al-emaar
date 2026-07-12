"use client";

import Link from "next/link";
import { useState } from "react";
import { Plus, ListChecks, FolderKanban, ReceiptText } from "lucide-react";
import { usePermissions } from "@/components/auth/permissions-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Action = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  perm: string;
};

/**
 * Mobile-only floating quick-add. Opens a small menu of role-appropriate create
 * actions that deep link (`?compose=1`) into the EXISTING composers — no new
 * business logic, and each entry is gated by the SAME permission that guards the
 * real "new" button on its page, so the FAB can never offer an action the user
 * couldn't otherwise perform:
 *   • مهمة جديدة   → tasks.assign     (who may create/assign tasks)
 *   • مشروع جديد   → projects.edit
 *   • فاتورة جديدة → financials.view  (manager/accountant only)
 * Hidden entirely when the role has no quick actions (e.g. a view-only engineer).
 */
export function QuickAddFab() {
  const perms = usePermissions();
  const [open, setOpen] = useState(false);
  const all: Action[] = [
    { href: "/tasks?compose=1", label: "مهمة جديدة", icon: ListChecks, perm: "tasks.assign" },
    { href: "/projects?compose=1", label: "مشروع جديد", icon: FolderKanban, perm: "projects.edit" },
    { href: "/invoices?compose=1", label: "فاتورة جديدة", icon: ReceiptText, perm: "financials.view" },
  ];
  const actions = all.filter((a) => perms[a.perm] === true);
  if (actions.length === 0) return null;

  return (
    <div className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] end-4 z-30 no-print md:hidden">
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="إضافة سريعة"
            className="flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg active:scale-95"
          >
            <Plus className="size-6" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="mb-2">
          {actions.map((a) => (
            <DropdownMenuItem key={a.href} asChild>
              <Link href={a.href} onClick={() => setOpen(false)} className="flex items-center gap-2">
                <a.icon className="size-4" />
                {a.label}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
