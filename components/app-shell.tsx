"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  Contact,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  Users,
} from "lucide-react";
import { brand } from "@/lib/config/brand";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/components/auth/permissions-provider";
import { signOut } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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
  { href: "/clients", label: "العملاء", icon: Contact, perm: "clients.view" },
  { href: "/team", label: "الفريق", icon: Users, perm: "team.manage" },
  { href: "/settings/permissions", label: "الصلاحيات", icon: ShieldCheck, perm: "permissions.manage" },
];

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
  const items = NAV.filter((item) => !item.perm || perms[item.perm] === true);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

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

        <main className="flex-1 p-4 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-6">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 border-t-2 border-transparent px-1 py-2 text-xs",
              isActive(item.href) ? "border-primary text-primary" : "text-muted-foreground",
            )}
          >
            <item.icon className="size-5 shrink-0" />
            <span className="max-w-full truncate">{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
