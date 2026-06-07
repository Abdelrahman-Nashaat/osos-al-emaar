import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { getEffectivePermissions, getSessionProfile } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/auth/permission-keys";
import { PermissionDenied } from "@/components/permission-denied";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ProjectsTable, type ProjectListItem } from "./projects-table";
import { ProjectFormDialog } from "./project-form";

export default async function ProjectsPage() {
  const session = await getSessionProfile();
  if (!session) redirect("/login");

  const perms = await getEffectivePermissions();
  if (!can(perms, "projects.view")) return <PermissionDenied />;
  const canEdit = can(perms, "projects.edit");
  const showFinancials = can(perms, "financials.view");

  const supabase = await createClient();

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, code, client_id, status, progress, due_date")
    .order("created_at", { ascending: false });

  // Client names (engineers may read these via projects.view RLS — operational only).
  const { data: allClients } = await supabase.from("clients").select("id, name").order("name");
  const clientName = new Map((allClients ?? []).map((c) => [c.id, c.name] as const));
  const clientOptions = canEdit ? (allClients ?? []) : [];

  // Budgets are fetched ONLY for financial viewers — engineers never receive amounts.
  const budgetByProject = new Map<string, { budget: number | null; currency: string }>();
  if (showFinancials) {
    const { data: fin } = await supabase
      .from("project_financials")
      .select("project_id, budget, currency");
    for (const f of fin ?? []) {
      budgetByProject.set(f.project_id, { budget: f.budget, currency: f.currency });
    }
  }

  const items: ProjectListItem[] = (projects ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    status: p.status,
    progress: p.progress,
    due_date: p.due_date,
    client_name: p.client_id ? (clientName.get(p.client_id) ?? null) : null,
    ...(showFinancials
      ? {
          budget: budgetByProject.get(p.id)?.budget ?? null,
          currency: budgetByProject.get(p.id)?.currency ?? "SAR",
        }
      : {}),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">المشاريع</h1>
          <p className="text-sm text-muted-foreground">
            متابعة حالة المشاريع ونسب الإنجاز والمواعيد.
          </p>
        </div>
        {canEdit ? (
          <ProjectFormDialog
            clients={clientOptions}
            trigger={
              <Button className="shrink-0">
                <Plus className="size-4" />
                <span className="hidden sm:inline">مشروع جديد</span>
              </Button>
            }
          />
        ) : null}
      </div>

      <Card>
        <CardContent className="pt-6">
          <ProjectsTable projects={items} showFinancials={showFinancials} />
        </CardContent>
      </Card>
    </div>
  );
}
