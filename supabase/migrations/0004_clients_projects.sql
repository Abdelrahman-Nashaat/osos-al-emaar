-- 0004_clients_projects.sql
-- Phase 2 — Clients & Projects, with the financial layer kept in a SEPARATE,
-- isolated table (project_financials). Operator-locked rule (Hamza):
--   • Engineers may read all OPERATIONAL client/project detail (name, phone,
--     address, notes, status, dates, progress, assigned engineers).
--   • Engineers must NEVER read any amount (budget / contract_value / cost — and
--     later invoices/payments). Money lives ONLY in project_financials, gated by
--     can_view_financials() (manager + accountant). Enforced at the DB/RLS layer.
--   • The Clients *module* is hidden from engineers (nav/page gated on clients.view),
--     but client rows are readable to anyone with projects.view so client detail can
--     surface read-only INSIDE project views.
-- No new permission keys and no new helpers: reuses the Phase 1 catalog
-- (projects.*, clients.*, financials.view) and helpers is_manager() /
-- can_view_financials() / has_perm().

-- ───────────────────────────── Enum ─────────────────────────────
create type public.project_status as enum (
  'planning', 'active', 'on_hold', 'completed', 'cancelled'
);

-- ──────────────────────────── Tables ─────────────────────────────
-- clients — OPERATIONAL ONLY. Never add an amount column here; client financial
-- totals are DERIVED from invoices/payments in Phase 4 behind can_view_financials().
create table public.clients (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  company    text,
  phone      text,
  email      text,
  address    text,
  country    text not null default 'SA',
  notes      text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index clients_name_idx on public.clients (name);

-- projects — OPERATIONAL ONLY. No cost/budget columns (those live in
-- project_financials). Engineers can read these rows (projects.view).
create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  code        text,
  client_id   uuid references public.clients (id) on delete restrict,
  status      public.project_status not null default 'planning',
  progress    integer not null default 0 check (progress >= 0 and progress <= 100),
  start_date  date,
  due_date    date,
  description text,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index projects_client_idx on public.projects (client_id);
create index projects_status_idx on public.projects (status);
create index projects_due_idx    on public.projects (due_date);

-- project_financials — ISOLATED. Manager + accountant ONLY (can_view_financials()).
-- An engineer JWT must get 0 rows from this table; this is the make-or-break of Phase 2.
create table public.project_financials (
  project_id     uuid primary key references public.projects (id) on delete cascade,
  budget         numeric(14, 2),
  contract_value numeric(14, 2),
  cost           numeric(14, 2),
  currency       text not null default 'SAR',
  notes          text,
  updated_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- project_members — lightweight engineer↔project assignment (operational).
create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  added_by   uuid references public.profiles (id) on delete set null,
  added_at   timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index project_members_user_idx on public.project_members (user_id);

-- ──────────────────────── updated_at triggers ────────────────────
-- Reuse the Phase 1 helper public.set_updated_at().
create trigger clients_set_updated_at
before update on public.clients
for each row execute function public.set_updated_at();

create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

create trigger project_financials_set_updated_at
before update on public.project_financials
for each row execute function public.set_updated_at();

-- ───────────────────────────── RLS ───────────────────────────────
-- (0000_ensure_rls auto-enables RLS on create; these explicit enables are
--  idempotent and self-documenting. Deny-by-default still requires the policies below.)
alter table public.clients            enable row level security;
alter table public.projects           enable row level security;
alter table public.project_financials enable row level security;
alter table public.project_members    enable row level security;

-- clients: readable by clients.view (manager+accountant) OR projects.view (engineers,
-- so client detail shows inside project views). Only clients.edit (manager) writes.
create policy clients_select on public.clients
  for select to authenticated
  using (public.has_perm('clients.view') or public.has_perm('projects.view'));

create policy clients_insert on public.clients
  for insert to authenticated
  with check (public.has_perm('clients.edit'));

create policy clients_update on public.clients
  for update to authenticated
  using (public.has_perm('clients.edit'))
  with check (public.has_perm('clients.edit'));

create policy clients_delete on public.clients
  for delete to authenticated
  using (public.is_manager());

-- projects: readable by projects.view (manager+engineer) OR financials viewers
-- (accountant — needed for Phase 4 finance context). Write = projects.edit
-- (manager always; engineer only if granted the projects.edit override). Delete = manager.
create policy projects_select on public.projects
  for select to authenticated
  using (public.has_perm('projects.view') or public.can_view_financials());

create policy projects_insert on public.projects
  for insert to authenticated
  with check (public.has_perm('projects.edit'));

create policy projects_update on public.projects
  for update to authenticated
  using (public.has_perm('projects.edit'))
  with check (public.has_perm('projects.edit'));

create policy projects_delete on public.projects
  for delete to authenticated
  using (public.is_manager());

-- project_financials: the hard financial isolation. SELECT only for
-- can_view_financials() (manager+accountant) → engineers get 0 rows. Writes
-- manager-only in v2 (relax to can_view_financials() when the accountant gets
-- finance UI in Phase 4).
create policy project_financials_select on public.project_financials
  for select to authenticated
  using (public.can_view_financials());

create policy project_financials_insert on public.project_financials
  for insert to authenticated
  with check (public.is_manager());

create policy project_financials_update on public.project_financials
  for update to authenticated
  using (public.is_manager())
  with check (public.is_manager());

create policy project_financials_delete on public.project_financials
  for delete to authenticated
  using (public.is_manager());

-- project_members: readable by anyone who can see projects; write = projects.edit.
create policy project_members_select on public.project_members
  for select to authenticated
  using (public.has_perm('projects.view') or public.can_view_financials());

create policy project_members_insert on public.project_members
  for insert to authenticated
  with check (public.has_perm('projects.edit'));

create policy project_members_delete on public.project_members
  for delete to authenticated
  using (public.has_perm('projects.edit'));
