"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Building2,
  Contact,
  FolderKanban,
  LayoutDashboard,
  ListChecks,
  LogOut,
  MoreHorizontal,
  ReceiptText,
  ShieldCheck,
  Users,
} from "lucide-react";
import { brand } from "@/lib/config/brand";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/components/auth/permissions-provider";
import { signOut } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

const ROLE_LABEL: Record<string, string> = {
  manager: "المدير العام",
  engineer: "مهندس",
  accountant: "محاسب",
};

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  perm?: string;
};

const NAV: NavItem[] = [
  { href: "/dashboard", label: "الرئيسية", icon: LayoutDashboard },
  { href: "/projects", label: "المشاريع", icon: FolderKanban, perm: "projects.view" },
  { href: "/tasks", label: "المهام", icon: ListChecks, perm: "tasks.view" },
  { href: "/clients", label: "العملاء", icon: Contact, perm: "clients.view" },
  { href: "/invoices", label: "الفواتير", icon: ReceiptText, perm: "financials.view" },
  { href: "/reports", label: "التقارير", icon: BarChart3, perm: "financials.view" },
  { href: "/team", label: "الفريق", icon: Users, perm: "team.manage" },
  { href: "/settings/permissions", label: "الصلاحيات", icon: ShieldCheck, perm: "permissions.manage" },
];

/**
 * Mobile bottom-nav primaries per role (Phase 4.5 B1): the bar holds at most
 * 4 cells. ≤4 visible items render flat; otherwise 3 primaries + «المزيد»
 * opening a bottom sheet with the rest. Data-driven so Phase 5 modules slot
 * into «المزيد» automatically. The DESKTOP sidebar always shows everything.
 */
const PRIMARY: Record<string, string[]> = {
  manager: ["/dashboard", "/tasks", "/projects"],
  engineer: ["/dashboard", "/tasks", "/projects"],
  accountant: ["/dashboard", "/invoices", "/reports"],
};

export function AppShell({
  userName,
  role,
  children,
}: {
  userName: string;
  role: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const perms = usePermissions();
  const [moreOpen, setMoreOpen] = useState(false);

  const items = NAV.filter((item) => !item.perm || perms[item.perm] === true);
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const primaryHrefs = PRIMARY[role] ?? [];
  const flat = items.length <= 4;
  const primary = flat
    ? items
    : (() => {
        const picked = items.filter((i) => primaryHrefs.includes(i.href)).slice(0, 3);
        return picked.length > 0 ? picked : items.slice(0, 3);
      })();
  const overflow = flat ? [] : items.filter((i) => !primary.includes(i));
  const moreActive = overflow.some((i) => isActive(i.href));

  const cellClass = (active: boolean) =>
    cn(
      "flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 border-t-2 border-transparent px-1 py-2 text-xs",
      active ? "border-primary text-primary" : "text-muted-foreground",
    );

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-20 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center justify-between border-b border-border bg-background px-4 pt-[env(safe-area-inset-top)]">
        <div className="flex items-center gap-2">
          <Building2 className="size-5 text-primary" aria-hidden />
          <span className="text-sm font-bold">{brand.shortNameAr}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-sm font-medium sm:inline">{userName}</span>
          <Badge variant="secondary">{ROLE_LABEL[role] ?? role}</Badge>
          <form action={signOut}>
            <Button type="submit" variant="ghost" size="icon" className="size-10" aria-label="تسجيل الخروج">
              <LogOut className="size-4" />
            </Button>
          </form>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Desktop sidebar — always the FULL permitted list. */}
        <aside className="hidden w-56 shrink-0 border-e border-border p-3 md:block">
          <nav className="space-y-1">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive(item.href)
                    ? "bg-secondary font-medium text-secondary-foreground"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        {/* min-w-0: a flex item defaults to min-width:auto, letting wide content
            inflate the page (the /projects/[id] 16px overflow at 360px — B2). */}
        <main className="min-w-0 flex-1 p-4 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-6">{children}</main>
      </div>

      {/* Mobile bottom nav: ≤4 cells, overflow lives in the «المزيد» sheet. */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
        {primary.map((item) => (
          <Link key={item.href} href={item.href} className={cellClass(isActive(item.href))}>
            <item.icon className="size-5 shrink-0" />
            <span className="max-w-full truncate">{item.label}</span>
          </Link>
        ))}
        {overflow.length > 0 ? (
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            aria-controls="more-sheet"
            className={cellClass(moreActive)}
          >
            <MoreHorizontal className="size-5 shrink-0" />
            <span className="max-w-full truncate">المزيد</span>
          </button>
        ) : null}
      </nav>

      {/* «المزيد» bottom sheet — built on the existing Radix Dialog (focus trap,
          ESC/overlay close, focus return). Hidden in print along with all nav. */}
      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent
          id="more-sheet"
          aria-describedby={undefined}
          showCloseButton={false}
          className="top-auto bottom-0 left-1/2 w-full max-w-none -translate-x-1/2 translate-y-0 rounded-b-none rounded-t-xl p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:hidden"
        >
          <DialogTitle className="px-2 pb-1 text-base">المزيد</DialogTitle>
          <nav className="grid gap-1">
            {overflow.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMoreOpen(false)}
                className={cn(
                  "flex min-h-12 items-center gap-3 rounded-md px-3 text-sm",
                  isActive(item.href)
                    ? "bg-secondary font-medium text-secondary-foreground"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                <item.icon className="size-5 shrink-0" />
                {item.label}
              </Link>
            ))}
          </nav>
        </DialogContent>
      </Dialog>
    </div>
  );
}
