import { redirect } from "next/navigation";
import { getAuthState } from "@/lib/auth/permissions";
import { signOut } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Landing screen for an authenticated-but-deactivated account (Phase 4.5 A4).
 * Self-guards: anonymous visitors go to /login, active users to /dashboard.
 */
export default async function AccountDisabledPage() {
  const state = await getAuthState();
  if (state.kind === "none") redirect("/login");
  if (state.kind === "active") redirect("/dashboard");

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>الحساب معطّل</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          تم تعطيل حسابك. تواصل مع المدير العام لإعادة التفعيل.
        </p>
        <form action={signOut}>
          <Button type="submit" variant="outline" className="w-full">
            تسجيل الخروج
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
