import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Pencil } from "lucide-react";
import { getEffectivePermissions, getSessionProfile } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/auth/permission-keys";
import { isOverdue } from "@/lib/projects/status";
import { cn } from "@/lib/utils";
import { PermissionDenied } from "@/components/permission-denied";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "../status-badge";
import { ProgressBar } from "../progress-bar";
import { ProjectFormDialog } from "../project-form";
import { ProjectMembersEditor } from "../project-members-editor";
import { ProjectFinancialsCard } from "../project-financials-card";
import { DeleteProjectButton } from "../delete-project-button";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await getSessionProfile();
  if (!session) redirect("/login");
  const perms = await getEffectivePermissions();
  if (!can(perms, "projects.view")) return <PermissionDenied />;

  const canEdit = can(perms, "projects.edit");
  const showFinancials = can(perms, "financials.view");
  const isManager = session.profile.role === "manager";

  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, code, status, progress, start_date, due_date, description, client_id")
    .eq("id", id)
    .single();
  if (!project) notFound();

  // Client — operational, read-only. Engineers see this inside the project view
  // (the Clients module itself stays hidden from them). No money lives here.
  let client: {
    id: string;
    name: string;
    company: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    notes: string | null;
  } | null = null;
  if (project.client_id) {
    const { data } = await supabase
      .from("clients")
      .select("id, name, company, phone, email, address, notes")
      .eq("id", project.client_id)
      .single();
    client = data ?? null;
  }

  // Assigned members — resolve names via a separate profiles read (avoids the
  // two-FK embed ambiguity on project_members). profiles is team-readable (0005).
  const { data: memberRows } = await supabase
    .from("project_members")
    .select("user_id")
    .eq("project_id", id);
  const memberIds = (memberRows ?? []).map((m) => m.user_id);
  let members: { user_id: string; full_name: string; role: string }[] = [];
  if (memberIds.length) {
    const { data: directory } = await supabase.rpc("team_directory");
    const byId = new Map((directory ?? []).map((p) => [p.id, p] as const));
    members = memberIds.map((uid) => ({
      user_id: uid,
      full_name: byId.get(uid)?.full_name ?? "—",
      role: byId.get(uid)?.role ?? "",
    }));
  }

  // Financials — fetched ONLY when allowed. Engineers never reach this branch,
  // so no amount is ever read or sent to them.
  let financials = null;
  if (showFinancials) {
    const { data } = await supabase
      .from("project_financials")
      .select("budget, contract_value, cost, currency, notes")
      .eq("project_id", id)
      .maybeSingle();
    financials = data ?? null;
  }

  // Pickers for the edit form + member assignment — only when the viewer can edit.
  const assignable: { id: string; full_name: string; role: string }[] = [];
  let clientOptions: { id: string; name: string }[] = [];
  if (canEdit) {
    const [{ data: directory }, { data: cs }] = await Promise.all([
      supabase.rpc("team_directory"),
      supabase.from("clients").select("id, name").order("name"),
    ]);
    for (const p of directory ?? []) {
      if (p.is_active) assignable.push({ id: p.id, full_name: p.full_name, role: p.role });
    }
    clientOptions = cs ?? [];
  }

  const overdue = isOverdue(project.due_date, project.status);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Link href="/projects" className="text-sm text-muted-foreground hover:underline">
            → المشاريع
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
          <div className="flex items-center gap-2">
            <StatusBadge status={project.status} />
            {project.code ? (
              <span className="text-sm text-muted-foreground">{project.code}</span>
            ) : null}
          </div>
        </div>
        {canEdit ? (
          <div className="flex items-center gap-2">
            <ProjectFormDialog
              clients={clientOptions}
              project={{
                id: project.id,
                name: project.name,
                code: project.code,
                client_id: project.client_id,
                status: project.status,
                progress: project.progress,
                start_date: project.start_date,
                due_date: project.due_date,
                description: project.description,
              }}
              trigger={
                <Button variant="outline">
                  <Pencil className="size-4" />
                  تعديل
                </Button>
              }
            />
            {isManager ? <DeleteProjectButton id={project.id} name={project.name} /> : null}
          </div>
        ) : null}
      </div>

      {/* Operational details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">تفاصيل المشروع</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <div className="text-xs text-muted-foreground">نسبة الإنجاز</div>
            <ProgressBar value={project.progress} />
          </div>
          <Field label="تاريخ البدء" value={project.start_date ?? "—"} ltr />
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">تاريخ الاستحقاق</div>
            <div
              className={cn(
                "text-sm tabular-nums text-end",
                overdue ? "font-medium text-red-600 dark:text-red-400" : "",
              )}
              dir="ltr"
            >
              {project.due_date ?? "—"}
              {overdue ? <span className="ms-1">(متأخر)</span> : null}
            </div>
          </div>
          {project.description ? (
            <div className="space-y-1 sm:col-span-2">
              <div className="text-xs text-muted-foreground">الوصف</div>
              <p className="text-sm whitespace-pre-wrap">{project.description}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Client (read-only operational info) */}
      {client ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">العميل</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="الاسم" value={client.name} />
            {client.company ? <Field label="الجهة" value={client.company} /> : null}
            {client.phone ? <Field label="الجوال" value={client.phone} ltr /> : null}
            {client.email ? <Field label="البريد" value={client.email} ltr /> : null}
            {client.address ? <Field label="العنوان" value={client.address} /> : null}
            {client.notes ? (
              <div className="space-y-1 sm:col-span-2">
                <div className="text-xs text-muted-foreground">ملاحظات</div>
                <p className="text-sm whitespace-pre-wrap">{client.notes}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* Assigned engineers */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">المهندسون المعيّنون</CardTitle>
        </CardHeader>
        <CardContent>
          <ProjectMembersEditor
            projectId={project.id}
            members={members}
            assignable={assignable}
            canEdit={canEdit}
          />
        </CardContent>
      </Card>

      {/* Financials — rendered ONLY for manager + accountant */}
      {showFinancials ? (
        <ProjectFinancialsCard
          projectId={project.id}
          financials={financials}
          canEdit={isManager}
        />
      ) : null}
    </div>
  );
}

function Field({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("text-sm", ltr ? "text-end" : "")} dir={ltr ? "ltr" : undefined}>
        {value}
      </div>
    </div>
  );
}
