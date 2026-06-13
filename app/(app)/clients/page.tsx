import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { getEffectivePermissions, getSessionProfile } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/auth/permission-keys";
import { PermissionDenied } from "@/components/permission-denied";
import { LIST_PAGE_SIZE, Pager, parseListParams, SearchBox } from "@/components/list-controls";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ClientsTable } from "./clients-table";
import { ClientFormDialog } from "./client-form";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q, page, from, to } = parseListParams(await searchParams);
  const session = await getSessionProfile();
  if (!session) redirect("/login");

  const perms = await getEffectivePermissions();
  // The Clients module is for manager (full) + accountant (read-only). Engineers
  // never reach this page (no nav item + denied here); they see client detail
  // only read-only inside project views.
  if (!can(perms, "clients.view")) return <PermissionDenied />;
  const canEdit = can(perms, "clients.edit");

  const supabase = await createClient();
  let clientsQuery = supabase
    .from("clients")
    .select("id, name, company, phone, email, address, country, vat_number, cr_number, notes")
    .order("name", { ascending: true })
    .range(from, to); // one extra row → hasMore
  if (q) clientsQuery = clientsQuery.or(`name.ilike.%${q}%,company.ilike.%${q}%,phone.ilike.%${q}%`);
  const { data: clientRows } = await clientsQuery;
  const hasMore = (clientRows ?? []).length > LIST_PAGE_SIZE;
  const clients = (clientRows ?? []).slice(0, LIST_PAGE_SIZE);

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

      <SearchBox placeholder="ابحث باسم العميل أو الجهة أو الجوال…" q={q} />

      <Card>
        <CardContent className="pt-6">
          <ClientsTable clients={clients} canEdit={canEdit} />
        </CardContent>
      </Card>

      <Pager page={page} hasMore={hasMore} basePath="/clients" params={{ q }} />
    </div>
  );
}
