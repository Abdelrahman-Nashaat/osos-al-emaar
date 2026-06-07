import { ShieldAlert } from "lucide-react";

export function PermissionDenied() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-card p-10 text-center">
      <ShieldAlert className="size-10 text-muted-foreground" aria-hidden />
      <h2 className="text-lg font-semibold">لا تملك صلاحية الوصول</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        هذه الصفحة متاحة لأدوار محددة فقط. تواصل مع المدير العام إن كنت تظن أن هذا خطأ.
      </p>
    </div>
  );
}
