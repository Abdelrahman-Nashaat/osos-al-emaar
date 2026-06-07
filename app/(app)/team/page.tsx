import { redirect } from "next/navigation";
import { getEffectivePermissions, getSessionProfile } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/auth/permission-keys";
import { PermissionDenied } from "@/components/permission-denied";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AddMemberForm } from "./add-member-form";
import { TeamTable } from "./team-table";

export default async function TeamPage() {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  const perms = await getEffectivePermissions();
  if (!can(perms, "team.manage")) return <PermissionDenied />;

  const supabase = await createClient();
  const { data: members } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, is_active")
    .order("created_at", { ascending: true });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">الفريق</h1>
        <p className="text-sm text-muted-foreground">
          أنشئ حسابات الموظفين، وسلّمهم البريد وكلمة المرور، وحدّد أدوارهم.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">إضافة موظف جديد</CardTitle>
        </CardHeader>
        <CardContent>
          <AddMemberForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">أعضاء الفريق</CardTitle>
        </CardHeader>
        <CardContent>
          <TeamTable members={members ?? []} currentUserId={session.userId} />
        </CardContent>
      </Card>
    </div>
  );
}
