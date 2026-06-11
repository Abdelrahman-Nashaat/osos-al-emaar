-- 0020_attachments_storage.sql
-- Product-completion phase, Slice 2 — «المرفقات» (files everywhere).
-- An engineering office lives on files (drawings, permits, site photos, contract
-- scans); until now every deliverable left the system via WhatsApp. This adds a
-- private Storage bucket + one polymorphic metadata table covering project /
-- task / client / offer / invoice / portfolio attachments.
--
-- Visibility = the audience class of the parent entity:
--   project   → projects.view holders OR financial roles (accountant opens
--               project detail for financial context already);
--   task      → tasks.view holders (manager + engineers);
--   client    → clients.view holders (manager + accountant — client files can
--               include contracts; engineers get project/task files instead);
--   offer / invoice → can_view_financials() ONLY (hard financial isolation —
--               an engineer JWT reads 0 attachment rows and 0 storage objects
--               for financial entities);
--   portfolio → portfolio.view holders (all staff).
-- Whoever can SEE an entity's files can ADD there (engineers upload deliverables
-- without needing projects.edit); DELETE = uploader or manager.
-- Downloads go through short-lived signed URLs created server-side; uploads go
-- through server actions using the USER-scoped client, so these policies are
-- the real gate at both layers.

create type public.attachment_entity as enum (
  'project', 'task', 'client', 'offer', 'invoice', 'portfolio'
);

create table public.attachments (
  id           uuid primary key default gen_random_uuid(),
  entity_type  public.attachment_entity not null,
  entity_id    uuid not null,
  storage_path text not null unique,
  file_name    text not null,
  mime_type    text,
  size_bytes   bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  uploaded_by  uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index attachments_entity_idx on public.attachments (entity_type, entity_id, created_at desc);

alter table public.attachments enable row level security;

-- Audience-class visibility for an entity type (SECURITY DEFINER → usable in
-- both table and storage policies without RLS recursion).
create or replace function public.attachment_visible(p_type public.attachment_entity)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select case p_type
    when 'project'   then public.has_perm('projects.view') or public.can_view_financials()
    when 'task'      then public.has_perm('tasks.view')
    when 'client'    then public.has_perm('clients.view')
    when 'offer'     then public.can_view_financials()
    when 'invoice'   then public.can_view_financials()
    when 'portfolio' then public.has_perm('portfolio.view')
    else false
  end
$$;

-- Storage object names follow  <entity_type>/<entity_id>/<uuid>-<filename> .
-- Safe parser: returns the audience-class answer, false on any malformed path.
create or replace function public.storage_attachment_visible(p_name text)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_type public.attachment_entity;
begin
  if p_name !~ '^(project|task|client|offer|invoice|portfolio)/[0-9a-f-]{36}/' then
    return false;
  end if;
  v_type := split_part(p_name, '/', 1)::public.attachment_entity;
  return public.attachment_visible(v_type);
exception when others then
  return false;
end;
$$;

revoke all on function public.attachment_visible(public.attachment_entity) from public, anon;
revoke all on function public.storage_attachment_visible(text)             from public, anon;
grant execute on function public.attachment_visible(public.attachment_entity) to authenticated;
grant execute on function public.storage_attachment_visible(text)             to authenticated;
-- storage policies evaluate as the requesting role through PostgREST/storage-api;
-- supabase_storage_admin and service paths bypass RLS anyway.

-- attachments table policies
create policy attachments_select on public.attachments
  for select to authenticated
  using (public.attachment_visible(entity_type));

create policy attachments_insert on public.attachments
  for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and public.attachment_visible(entity_type)
  );

create policy attachments_delete on public.attachments
  for delete to authenticated
  using (uploaded_by = (select auth.uid()) or public.is_manager());

-- ───────────────────────── Storage bucket + policies ─────────────────────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 10485760)
on conflict (id) do nothing;

create policy attachments_objects_select on storage.objects
  for select to authenticated
  using (bucket_id = 'attachments' and public.storage_attachment_visible(name));

create policy attachments_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and owner_id = (select auth.uid()::text)
    and public.storage_attachment_visible(name)
  );

create policy attachments_objects_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'attachments'
    and (owner_id = (select auth.uid()::text) or public.is_manager())
    and public.storage_attachment_visible(name)
  );
