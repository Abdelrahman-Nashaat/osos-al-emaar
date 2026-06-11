"use client";

import { Button } from "@/components/ui/button";

/**
 * In-app error boundary (Phase 4.5 B4). Sits inside the (app) layout, so the
 * shell/nav stay usable; only the page content is replaced. Load-bearing reads
 * throw here via lib/supabase/fetch.ts must() instead of rendering fake zeros.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error("[app-error]", { digest: error.digest, message: error.message });
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-border bg-card p-10 text-center">
      <h1 className="text-xl font-bold">حدث خطأ غير متوقع</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        تعذّر تحميل هذه الصفحة. لم تُعرض أي أرقام غير صحيحة — حاول مرة أخرى.
      </p>
      <Button onClick={() => reset()}>إعادة المحاولة</Button>
    </div>
  );
}
