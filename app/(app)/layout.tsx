import { redirect } from "next/navigation";
import { getEffectivePermissions, getSessionProfile } from "@/lib/auth/permissions";
import { PermissionsProvider } from "@/components/auth/permissions-provider";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  const perms = await getEffectivePermissions();

  return (
    <PermissionsProvider value={perms}>
      <AppShell userName={session.profile.full_name} role={session.profile.role}>
        {children}
      </AppShell>
    </PermissionsProvider>
  );
}
