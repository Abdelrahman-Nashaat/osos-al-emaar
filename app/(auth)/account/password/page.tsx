import { redirect } from "next/navigation";
import { getAuthState } from "@/lib/auth/permissions";
import { PasswordForm } from "./password-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Set/change the account password (Phase 4.5 C5). Reached normally, or forced
 * by the (app) layout while profiles.must_change_password is true.
 */
export default async function AccountPasswordPage() {
  const state = await getAuthState();
  if (state.kind === "none") redirect("/login");
  if (state.kind === "inactive") redirect("/account-disabled");

  const forced = state.session.profile.must_change_password;

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>تعيين كلمة المرور</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {forced ? (
          <p className="text-sm text-muted-foreground">
            هذه كلمة مرور مؤقتة سلّمها لك المدير. عيّن كلمة مرور خاصة بك للمتابعة
            (١٢ حرفاً على الأقل).
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            عيّن كلمة مرور جديدة لحسابك (١٢ حرفاً على الأقل).
          </p>
        )}
        <PasswordForm />
      </CardContent>
    </Card>
  );
}
