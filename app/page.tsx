import { brand } from "@/lib/config/brand";
import { getHealth } from "@/lib/health";

export const dynamic = "force-dynamic";

function StatusRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <span className="text-sm text-card-foreground">{label}</span>
      <span
        className={`inline-flex items-center gap-2 text-xs font-medium ${
          ok ? "text-emerald-600" : "text-muted-foreground"
        }`}
      >
        <span
          className={`size-2 rounded-full ${ok ? "bg-emerald-500" : "bg-zinc-300"}`}
          aria-hidden
        />
        {ok ? "متوفّر" : "غير مُهيّأ"}
      </span>
    </div>
  );
}

export default async function Home() {
  const health = await getHealth();

  const supabaseLabel =
    health.supabase.status === "ok"
      ? "متّصل بـ Supabase"
      : health.supabase.status === "not_configured"
        ? "Supabase غير مُهيّأ بعد"
        : `تعذّر الاتصال بـ Supabase${health.supabase.detail ? ` (${health.supabase.detail})` : ""}`;

  const supabaseOk = health.supabase.status === "ok";

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <header className="space-y-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight">{brand.nameAr}</h1>
          <p className="text-sm text-muted-foreground">{brand.taglineAr}</p>
          <span className="inline-block rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
            المرحلة ٠ — تهيئة الأساس
          </span>
        </header>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">حالة النظام</h2>
          <div
            className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 ${
              supabaseOk
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-border bg-card text-card-foreground"
            }`}
          >
            <span className="text-sm font-medium">{supabaseLabel}</span>
            <span className={`size-2.5 rounded-full ${supabaseOk ? "bg-emerald-500" : "bg-amber-400"}`} aria-hidden />
          </div>

          <StatusRow label="عنوان Supabase (NEXT_PUBLIC_SUPABASE_URL)" ok={health.env.NEXT_PUBLIC_SUPABASE_URL} />
          <StatusRow label="مفتاح anon (NEXT_PUBLIC_SUPABASE_ANON_KEY)" ok={health.env.NEXT_PUBLIC_SUPABASE_ANON_KEY} />
          <StatusRow label="مفتاح service_role (خادمي فقط)" ok={health.env.SUPABASE_SERVICE_ROLE_KEY} />
        </section>

        <p className="text-center text-xs text-muted-foreground">
          واجهة عربية · يمين-لليسار · مهيّأة للجوال
        </p>
      </div>
    </main>
  );
}
