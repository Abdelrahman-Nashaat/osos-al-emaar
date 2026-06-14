import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { getEffectivePermissions, getSessionProfile } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { must } from "@/lib/supabase/fetch";
import { can } from "@/lib/auth/permission-keys";
import { PermissionDenied } from "@/components/permission-denied";
import { LIST_PAGE_SIZE, Pager, parseListParams, SearchBox } from "@/components/list-controls";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ProjectsTable, type ProjectListItem } from "./projects-table";
import { ProjectFormDialog } from "./project-form";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q, page, from, to } = parseListParams(await searchParams);
  const session = await getSessionProfile();
  if (!session) redirect("/login");

  const perms = await getEffectivePermissions();
  if (!can(perms, "projects.view")) return <PermissionDenied />;
  const canEdit = can(perms, "projects.edit");
  const showFinancials = can(perms, "financials.view");

  const supabase = await createClient();

  let projectsQuery = supabase
    .from("projects")
    .select("id, name, code, client_id, status, progress, due_date")
    .order("created_at", { ascending: false })
    .range(from, to); // one extra row → hasMore
  if (q) projectsQuery = projectsQuery.or(`name.ilike.%${q}%,code.ilike.%${q}%`);
  const projectRows = await must("projects.list", projectsQuery);
  const hasMore = projectRows.length > LIST_PAGE_SIZE;
  const projects = projectRows.slice(0, LIST_PAGE_SIZE);

  // Client names (engineers may read these via projects.view RLS — operational only).
  const { data: allClients } = await supabase.from("clients").select("id, name").order("name");
  const clientName = new Map((allClients ?? []).map((c) => [c.id, c.name] as const));
  const clientOptions = canEdit ? (allClients ?? []) : [];

  // Budgets are fetched ONLY for financial viewers — engineers never receive amounts.
  const budgetByProject = new Map<string, { budget: number | null; currency: string }>();
  if (showFinancials) {
    const fin = await must(
      "projects.financials",
      supabase.from("project_financials").select("project_id, budget, currency"),
    );
    for (const f of fin) {
      budgetByProject.set(f.project_id, { budget: f.budget, currency: f.currency });
    }
  }

  const items: ProjectListItem[] = projects.map((p) => ({
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
              <Button className="shrink-0" aria-label="مشروع جديد">
                <Plus className="size-4" />
                <span className="hidden sm:inline">مشروع جديد</span>
              </Button>
            }
          />
        ) : null}
      </div>

      <SearchBox placeholder="ابحث باسم المشروع أو رمزه…" q={q} />

      <Card>
        <CardContent className="pt-6">
          <ProjectsTable projects={items} showFinancials={showFinancials} />
        </CardContent>
      </Card>

      <Pager page={page} hasMore={hasMore} basePath="/projects" params={{ q }} />
    </div>
  );
}
