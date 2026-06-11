import Link from "next/link";
import { Button } from "@/components/ui/button";

/** Arabic 404 (Phase 4.5 B4) — replaces Next's default English page. */
export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-bold">الصفحة غير موجودة</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        تعذّر العثور على ما تبحث عنه. ربما حُذف العنصر أو تغيّر الرابط.
      </p>
      <Button asChild>
        <Link href="/dashboard">العودة إلى الرئيسية</Link>
      </Button>
    </div>
  );
}
