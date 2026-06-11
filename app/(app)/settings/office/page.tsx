import { redirect } from "next/navigation";
import { getEffectivePermissions, getSessionProfile } from "@/lib/auth/permissions";
import { can } from "@/lib/auth/permission-keys";
import { getOfficeSettings } from "@/lib/office/settings";
import { PermissionDenied } from "@/components/permission-denied";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OfficeSettingsForm } from "./office-form";

/** «إعدادات المكتب» — identity/letterhead data feeding prints and headers. Manager-only. */
export default async function OfficeSettingsPage() {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  const perms = await getEffectivePermissions();
  if (!can(perms, "settings.manage")) return <PermissionDenied />;

  const settings = await getOfficeSettings();

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">إعدادات المكتب</h1>
        <p className="text-sm text-muted-foreground">
          هوية المكتب التي تظهر على الفواتير وعروض الأسعار المطبوعة: الاسم،
          السجل التجاري، الرقم الضريبي، وبيانات التواصل.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">بيانات المكتب</CardTitle>
        </CardHeader>
        <CardContent>
          <OfficeSettingsForm settings={settings} />
        </CardContent>
      </Card>
    </div>
  );
}
