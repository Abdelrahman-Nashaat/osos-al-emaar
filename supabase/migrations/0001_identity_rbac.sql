-- 0001_identity_rbac.sql
-- Identity & RBAC backbone for the engineering office app (Osos Al-Emaar).
-- Financials are manager + accountant ONLY; engineers can never be granted financials.view
-- (enforced by the CHECK on user_permission_overrides and by can_view_financials()).

-- ───────────────────────────── Enum ─────────────────────────────
create type public.app_role as enum ('manager', 'engineer', 'accountant');

-- ───────────────────────────── Tables ────────────────────────────
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null,
  email      text not null,
  role       public.app_role not null default 'engineer',
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_role_idx on public.profiles (role);

create table public.role_permissions (
  role           public.app_role not null,
  permission_key text not null,
  allowed        boolean not null default false,
  primary key (role, permission_key)
);

create table public.user_permission_overrides (
  user_id        uuid not null references public.profiles (id) on delete cascade,
  permission_key text not null,
  allowed        boolean not null,
  primary key (user_id, permission_key),
  -- Hard guarantee (Amendment 1): only operational permissions can be overridden per-user.
  -- financials.view (and any non projects/tasks key) can NEVER be granted to an individual.
  constraint overrides_grantable_only check (
    permission_key like 'projects.%' or permission_key like 'tasks.%'
  )
);
create index user_permission_overrides_user_idx on public.user_permission_overrides (user_id);

create table public.audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.profiles (id) on delete set null,
  action      text not null,
  target_type text,
  target_id   text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log (created_at desc);

-- ──────────────────────── updated_at trigger ─────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- ─────────── Helper functions (SECURITY DEFINER, locked path) ─────
-- SECURITY DEFINER so RLS policies can call them without recursing through RLS.
create or replace function public.current_app_role()
returns public.app_role
language sql stable security definer set search_path = ''
as $$
  select role from public.profiles
  where id = (select auth.uid()) and is_active
$$;

create or replace function public.is_manager()
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce(public.current_app_role() = 'manager', false) $$;

create or replace function public.is_accountant()
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce(public.current_app_role() = 'accountant', false) $$;

create or replace function public.can_view_financials()
returns boolean
language sql stable security definer set search_path = ''
as $$ select public.is_manager() or public.is_accountant() $$;

-- Effective permission: financials.view is always role-bound (never overridable);
-- everything else is override (if any) then role default, defaulting to false.
create or replace function public.has_perm(perm_key text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select case
    when perm_key = 'financials.view' then public.can_view_financials()
    else coalesce(
      (select allowed from public.user_permission_overrides
         where user_id = (select auth.uid()) and permission_key = perm_key),
      (select allowed from public.role_permissions
         where role = public.current_app_role() and permission_key = perm_key),
      false
    )
  end
$$;

-- ───────────────────────────── RLS ───────────────────────────────
alter table public.profiles                  enable row level security;
alter table public.role_permissions          enable row level security;
alter table public.user_permission_overrides enable row level security;
alter table public.audit_log                 enable row level security;

-- profiles: users see their own row; managers see all. Only managers write.
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.is_manager());

create policy profiles_insert_manager on public.profiles
  for insert to authenticated
  with check (public.is_manager());

create policy profiles_update_manager on public.profiles
  for update to authenticated
  using (public.is_manager())
  with check (public.is_manager());

-- role_permissions: any authenticated user may read (UI needs effective perms); managers write.
create policy role_permissions_select on public.role_permissions
  for select to authenticated
  using (true);

create policy role_permissions_write on public.role_permissions
  for all to authenticated
  using (public.is_manager())
  with check (public.is_manager());

-- user_permission_overrides: users read their own; managers read all and write (CHECK blocks financials).
create policy overrides_select on public.user_permission_overrides
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_manager());

create policy overrides_write on public.user_permission_overrides
  for all to authenticated
  using (public.is_manager())
  with check (public.is_manager());

-- audit_log: managers read; any authenticated user may append rows about themselves only.
create policy audit_select_manager on public.audit_log
  for select to authenticated
  using (public.is_manager());

create policy audit_insert_self on public.audit_log
  for insert to authenticated
  with check (actor_id = (select auth.uid()));

-- ─────────────────────── Seed role defaults ──────────────────────
-- Defaults match Hamza's confirmed permission matrix. Manager edits these later via UI.
insert into public.role_permissions (role, permission_key, allowed) values
  ('manager','projects.view',true),   ('manager','projects.edit',true),
  ('manager','tasks.view',true),      ('manager','tasks.assign',true),  ('manager','tasks.delete',true),
  ('manager','clients.view',true),    ('manager','clients.edit',true),
  ('manager','financials.view',true),
  ('manager','team.manage',true),     ('manager','permissions.manage',true),
  ('manager','portfolio.view',true),  ('manager','portfolio.edit',true),
  ('manager','offers.view',true),     ('manager','offers.edit',true),

  ('engineer','projects.view',true),  ('engineer','projects.edit',false),
  ('engineer','tasks.view',true),     ('engineer','tasks.assign',false), ('engineer','tasks.delete',false),
  ('engineer','clients.view',false),  ('engineer','clients.edit',false),
  ('engineer','financials.view',false),
  ('engineer','team.manage',false),   ('engineer','permissions.manage',false),
  ('engineer','portfolio.view',true), ('engineer','portfolio.edit',false),
  ('engineer','offers.view',true),    ('engineer','offers.edit',false),

  ('accountant','projects.view',false), ('accountant','projects.edit',false),
  ('accountant','tasks.view',false),    ('accountant','tasks.assign',false), ('accountant','tasks.delete',false),
  ('accountant','clients.view',true),   ('accountant','clients.edit',false),
  ('accountant','financials.view',true),
  ('accountant','team.manage',false),   ('accountant','permissions.manage',false),
  ('accountant','portfolio.view',true), ('accountant','portfolio.edit',false),
  ('accountant','offers.view',true),    ('accountant','offers.edit',false);
