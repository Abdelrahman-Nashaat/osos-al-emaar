import { redirect } from "next/navigation";
import { getEffectivePermissions, getSessionProfile } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/auth/permission-keys";
import { PermissionDenied } from "@/components/permission-denied";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RoleDefaultsEditor } from "./role-defaults-editor";
import { UserOverridesEditor } from "./user-overrides-editor";

export default async function PermissionsPage() {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  const perms = await getEffectivePermissions();
  if (!can(perms, "permissions.manage")) return <PermissionDenied />;

  const supabase = await createClient();
  const [{ data: rolePerms }, { data: users }, { data: overrides }] = await Promise.all([
    supabase.from("role_permissions").select("role, permission_key, allowed"),
    supabase.from("profiles").select("id, full_name, role").order("created_at", { ascending: true }),
    supabase.from("user_permission_overrides").select("user_id, permission_key, allowed"),
  ]);

  const matrix: Record<string, Record<string, boolean>> = {};
  for (const r of rolePerms ?? []) {
    (matrix[r.role] ??= {})[r.permission_key] = r.allowed;
  }
  const overridesByUser: Record<string, Record<string, boolean>> = {};
  for (const o of overrides ?? []) {
    (overridesByUser[o.user_id] ??= {})[o.permission_key] = o.allowed;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">الصلاحيات</h1>
        <p className="text-sm text-muted-foreground">
          عدّل الصلاحيات الافتراضية لكل دور، وخصّص صلاحيات تشغيلية لأفراد بعينهم.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">الصلاحيات الافتراضية للأدوار</CardTitle>
          <CardDescription>تُطبَّق على كل من يحمل الدور ما لم يُخصَّص له استثناء.</CardDescription>
        </CardHeader>
        <CardContent>
          <RoleDefaultsEditor matrix={matrix} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">تخصيص صلاحيات لفرد</CardTitle>
          <CardDescription>للمشاريع والمهام فقط — يتجاوز افتراضي الدور لهذا الموظف.</CardDescription>
        </CardHeader>
        <CardContent>
          <UserOverridesEditor users={users ?? []} overridesByUser={overridesByUser} />
        </CardContent>
      </Card>
    </div>
  );
}
