import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { getEffectivePermissions, getSessionProfile } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/auth/permission-keys";
import { PermissionDenied } from "@/components/permission-denied";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ClientsTable } from "./clients-table";
import { ClientFormDialog } from "./client-form";

export default async function ClientsPage() {
  const session = await getSessionProfile();
  if (!session) redirect("/login");

  const perms = await getEffectivePermissions();
  // The Clients module is for manager (full) + accountant (read-only). Engineers
  // never reach this page (no nav item + denied here); they see client detail
  // only read-only inside project views.
  if (!can(perms, "clients.view")) return <PermissionDenied />;
  const canEdit = can(perms, "clients.edit");

  const supabase = await createClient();
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, company, phone, email, address, country, notes")
    .order("name", { ascending: true });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">العملاء</h1>
          <p className="text-sm text-muted-foreground">
            بيانات العملاء ومعلومات التواصل. {canEdit ? "أضف وعدّل العملاء وحدّد المرتبطين بالمشاريع." : "عرض فقط."}
          </p>
        </div>
        {canEdit ? (
          <ClientFormDialog
            trigger={
              <Button className="shrink-0" aria-label="إضافة عميل">
                <Plus className="size-4" />
                <span className="hidden sm:inline">إضافة عميل</span>
              </Button>
            }
          />
        ) : null}
      </div>

      <Card>
        <CardContent className="pt-6">
          <ClientsTable clients={clients ?? []} canEdit={canEdit} />
        </CardContent>
      </Card>
    </div>
  );
}
