import { redirect } from "next/navigation";
import { getAuthState, getEffectivePermissions } from "@/lib/auth/permissions";
import { PermissionsProvider } from "@/components/auth/permissions-provider";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const state = await getAuthState();
  if (state.kind === "none") redirect("/login");
  // Deactivated accounts get an explicit Arabic screen — never the /login bounce
  // (which the proxy would turn into a redirect loop). Phase 4.5 A4.
  if (state.kind === "inactive") redirect("/account-disabled");

  const perms = await getEffectivePermissions();

  return (
    <PermissionsProvider value={perms}>
      <AppShell userName={state.session.profile.full_name} role={state.session.profile.role}>
        {children}
      </AppShell>
    </PermissionsProvider>
  );
}
