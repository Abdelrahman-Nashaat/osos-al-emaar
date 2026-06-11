import { redirect } from "next/navigation";
import { Download } from "lucide-react";
import { getSessionProfile } from "@/lib/auth/permissions";
import { PermissionDenied } from "@/components/permission-denied";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const CSV_ENTITIES: { id: string; label: string }[] = [
  { id: "clients", label: "العملاء" },
  { id: "projects", label: "المشاريع" },
  { id: "project_financials", label: "ماليات المشاريع" },
  { id: "tasks", label: "المهام" },
  { id: "task_events", label: "سجل المهام" },
  { id: "invoices", label: "الفواتير" },
  { id: "payments", label: "الدفعات" },
  { id: "invoice_events", label: "سجل الفواتير" },
  { id: "offers", label: "العروض" },
  { id: "offer_events", label: "سجل العروض" },
  { id: "attachments", label: "بيانات المرفقات" },
  { id: "portfolio_items", label: "معرض الأعمال" },
  { id: "office_settings", label: "إعدادات المكتب" },
  { id: "profiles", label: "الفريق" },
  { id: "audit_log", label: "سجل التدقيق" },
];

/** Manager-only backup/export (C3) — the Free-plan recovery story until Pro. */
export default async function BackupPage() {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  if (session.profile.role !== "manager") return <PermissionDenied />;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">النسخ الاحتياطي والتصدير</h1>
        <p className="text-sm text-muted-foreground">
          نزّل نسخة كاملة من بيانات المكتب (JSON) أو جداول مفردة (CSV لبرنامج Excel).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">نسخة كاملة</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            ملف واحد يحوي كل الجداول — احتفظ به في مكان آمن خارج الجهاز. يُسجَّل كل
            تصدير في سجل التدقيق.
          </p>
          <a
            href="/api/export?format=json"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Download className="size-4" />
            تنزيل النسخة الكاملة (JSON)
          </a>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">جداول مفردة (CSV)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2">
            {CSV_ENTITIES.map((e) => (
              <a
                key={e.id}
                href={`/api/export?format=csv&entity=${e.id}`}
                className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-muted"
              >
                <Download className="size-4 shrink-0 text-muted-foreground" />
                {e.label}
              </a>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">قبل إدخال بيانات حقيقية</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            الخطة الحالية (المجانية) لا توفر نسخاً احتياطياً تلقائياً من Supabase. قبل
            تشغيل النظام ببيانات فعلية يجب ترقية المشروع إلى Pro (نسخ يومي تلقائي) —
            راجع docs/OPERATIONS.md.
          </p>
          <p>إلى ذلك الحين: نزّل نسخة كاملة بعد كل يوم عمل وقبل أي تحديث للنظام.</p>
        </CardContent>
      </Card>
    </div>
  );
}
