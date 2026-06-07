"use client";

import { createContext, useContext } from "react";
import type { Permissions } from "@/lib/auth/permission-keys";

const PermissionsContext = createContext<Permissions>({});

export function PermissionsProvider({
  value,
  children,
}: {
  value: Permissions;
  children: React.ReactNode;
}) {
  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

export function usePermissions(): Permissions {
  return useContext(PermissionsContext);
}

export function useCan(key: string): boolean {
  return useContext(PermissionsContext)[key] === true;
}
