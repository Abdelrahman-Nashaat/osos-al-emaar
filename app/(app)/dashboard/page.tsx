import { requireAuth } from "@/lib/auth/permissions";

const ROLE_LABEL: Record<string, string> = {
  manager: "المدير العام",
  engineer: "مهندس",
  accountant: "محاسب",
};

export default async function DashboardPage() {
  const { profile } = await requireAuth();

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">مرحباً، {profile.full_name}</h1>
        <p className="text-sm text-muted-foreground">
          دورك في النظام: {ROLE_LABEL[profile.role] ?? profile.role}
        </p>
      </div>
      <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
        لوحة التحكم قيد الإنشاء. ستظهر هنا إحصائيات المشاريع والمهام والمتأخرات ونشاط الفريق في
        المراحل القادمة.
      </div>
    </div>
  );
}
