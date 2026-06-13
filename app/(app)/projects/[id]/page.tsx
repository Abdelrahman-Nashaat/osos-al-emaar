import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Pencil } from "lucide-react";
import { getEffectivePermissions, getSessionProfile } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/auth/permission-keys";
import { isOverdue } from "@/lib/projects/status";
import { formatDate } from "@/lib/format/date";
import { PhoneLinks, EmailLink } from "@/lib/format/contact";
import { fetchAttachments } from "@/lib/attachments/list";
import { cn } from "@/lib/utils";
import { PermissionDenied } from "@/components/permission-denied";
import { AttachmentsCard } from "@/components/attachments-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "../status-badge";
import { ProgressEditor } from "../progress-editor";
import { ProjectFormDialog } from "../project-form";
import { ProjectMembersEditor } from "../project-members-editor";
import { ProjectFinancialsCard } from "../project-financials-card";
import { DeleteProjectButton } from "../delete-project-button";
import { ProjectTasksCard } from "./project-tasks-card";
import { ProjectInvoicesCard } from "./project-invoices-card";
import type { InvoiceStatus } from "@/lib/finance/invoice";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await getSessionProfile();
  if (!session) redirect("/login");
  const perms = await getEffectivePermissions();
  const canEdit = can(perms, "projects.edit");
  const showFinancials = can(perms, "financials.view");
  // Operational viewers (projects.view) OR finance viewers (manager/accountant) — the
  // accountant reaches a project for financial context via an invoice/report link
  // (they have no Projects nav). Engineers without projects.view are still denied.
  if (!can(perms, "projects.view") && !showFinancials) return <PermissionDenied />;
  const isManager = session.profile.role === "manager";
  const canViewTasks = can(perms, "tasks.view");
  const canAssignTasks = can(perms, "tasks.assign");

  const supabase = await createClient();

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, name, code, status, progress, start_date, due_date, description, client_id")
    .eq("id", id)
    .single();
  // PGRST116 = zero rows → true 404; anything else surfaces in error.tsx (B4).
  if (projectError && projectError.code !== "PGRST116") {
    throw new Error(`fetch_failed: project ${projectError.message}`);
  }
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

  // Assigned members.
  const { data: memberRows } = await supabase
    .from("project_members")
    .select("user_id")
    .eq("project_id", id);
  const memberIds = (memberRows ?? []).map((m) => m.user_id);
  const isMember = memberIds.includes(session.userId);

  // Project tasks — operational, shown to anyone with tasks.view (no amounts).
  let taskRows: {
    id: string;
    title: string;
    status: import("@/lib/tasks/status").TaskStatus;
    priority: import("@/lib/tasks/status").TaskPriority;
    due_at: string | null;
    current_assignee_id: string | null;
  }[] = [];
  if (canViewTasks) {
    const { data } = await supabase
      .from("tasks")
      .select("id, title, status, priority, due_at, current_assignee_id")
      .eq("project_id", id)
      .order("created_at", { ascending: false });
    taskRows = data ?? [];
  }

  // Names-only directory — fetched ONCE and reused for member names, task-assignee
  // names, and the edit/assign pickers (profiles has multiple FKs → no embed).
  let directory:
    | { id: string; full_name: string; role: string; is_active: boolean }[]
    | null = null;
  if (memberIds.length > 0 || canEdit || canViewTasks) {
    const { data } = await supabase.rpc("team_directory");
    directory = data;
  }
  const byId = new Map((directory ?? []).map((p) => [p.id, p] as const));

  const members = memberIds.map((uid) => ({
    user_id: uid,
    full_name: byId.get(uid)?.full_name ?? "—",
    role: byId.get(uid)?.role ?? "",
  }));

  // Financials + invoices — fetched ONLY when allowed. Engineers never reach this
  // branch, so no amount is ever read or sent to them.
  let financials = null;
  let projectInvoices: {
    id: string;
    invoice_number: string;
    total: number;
    amount_paid: number;
    status: InvoiceStatus;
    due_date: string | null;
    currency: string;
  }[] = [];
  if (showFinancials) {
    const [finRes, invRes] = await Promise.all([
      supabase
        .from("project_financials")
        .select("budget, contract_value, cost, currency, notes")
        .eq("project_id", id)
        .maybeSingle(),
      supabase
        .from("invoices")
        .select("id, invoice_number, total, amount_paid, status, due_date, currency")
        .eq("project_id", id)
        .order("created_at", { ascending: false }),
    ]);
    // Money surfaces never degrade silently (B4).
    if (finRes.error || invRes.error) {
      throw new Error(
        `fetch_failed: project financials ${finRes.error?.message ?? invRes.error?.message}`,
      );
    }
    financials = finRes.data ?? null;
    projectInvoices = invRes.data ?? [];
  }

  // Pickers for the edit form + member assignment — only when the viewer can edit.
  const assignable: { id: string; full_name: string; role: string }[] = [];
  let clientOptions: { id: string; name: string }[] = [];
  if (canEdit) {
    const { data: cs } = await supabase.from("clients").select("id, name").order("name");
    // «المهندسون المعيّنون» = ACTIVE ENGINEERS only (same rule the DB trigger
    // project_members_engineer_guard enforces; mirrors taskEngineers below).
    for (const p of directory ?? []) {
      if (p.role === "engineer" && p.is_active) {
        assignable.push({ id: p.id, full_name: p.full_name, role: p.role });
      }
    }
    clientOptions = cs ?? [];
  }

  // Task-section data: assignee names + the active-engineer picker (tasks.assign only).
  const projectTasks = taskRows.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    due_at: t.due_at,
    assignee_name: t.current_assignee_id ? (byId.get(t.current_assignee_id)?.full_name ?? null) : null,
  }));
  const taskEngineers = canAssignTasks
    ? (directory ?? [])
        .filter((p) => p.role === "engineer" && p.is_active)
        .map((p) => ({ id: p.id, full_name: p.full_name }))
    : [];

  const overdue = isOverdue(project.due_date, project.status);
  const attachments = await fetchAttachments("project", project.id);

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
              <bdi dir="ltr" className="text-sm tabular-nums text-muted-foreground">
                {project.code}
              </bdi>
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
            <ProgressEditor
              projectId={project.id}
              value={project.progress}
              canEdit={canEdit || isMember}
            />
          </div>
          <Field label="تاريخ البدء" value={formatDate(project.start_date)} />
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">تاريخ الاستحقاق</div>
            <div
              className={cn(
                "text-sm tabular-nums",
                overdue ? "font-medium text-red-600 dark:text-red-400" : "",
              )}
            >
              {formatDate(project.due_date)}
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
            {client.phone ? (
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">الجوال</div>
                <PhoneLinks phone={client.phone} />
              </div>
            ) : null}
            {client.email ? (
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">البريد</div>
                <EmailLink email={client.email} />
              </div>
            ) : null}
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

      {/* Project tasks (operational) */}
      {canViewTasks ? (
        <ProjectTasksCard
          projectId={project.id}
          projectName={project.name}
          tasks={projectTasks}
          canCreate={canAssignTasks}
          engineers={taskEngineers}
        />
      ) : null}

      {/* Attachments — drawings, permits, site photos. Anyone who can open the
          project can contribute files (engineers upload deliverables here). */}
      <AttachmentsCard
        entityType="project"
        entityId={project.id}
        items={attachments}
        canUpload={true}
        currentUserId={session.userId}
        isManager={isManager}
      />

      {/* Financials — rendered ONLY for manager + accountant */}
      {showFinancials ? (
        <ProjectFinancialsCard
          projectId={project.id}
          financials={financials}
          canEdit={showFinancials}
        />
      ) : null}

      {/* Project invoices — manager + accountant only (same DOM-level gate) */}
      {showFinancials ? (
        <ProjectInvoicesCard
          projectId={project.id}
          projectName={project.name}
          invoices={projectInvoices}
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
