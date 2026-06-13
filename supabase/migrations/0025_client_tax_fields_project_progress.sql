-- 0025 — Product-completion follow-up
--   (a) Client tax identity (vat_number, cr_number) so a VAT-registered B2B
--       client can receive a standard tax invoice carrying its own numbers.
--       These are IDENTITY fields, not amounts → engineer-readable like the
--       rest of the clients row; no financial-isolation impact.
--   (b) project_set_progress(): let an assigned engineer (project member) move
--       the project completion % WITHOUT granting them full projects.edit
--       (which also exposes name/dates/client). Same SECURITY DEFINER house
--       pattern as the task/finance functions: re-check authority, clamp,
--       write audit_log atomically.

-- ───────────────────────── (a) Client tax identity ─────────────────────────
alter table public.clients add column if not exists vat_number text;
alter table public.clients add column if not exists cr_number  text;

comment on column public.clients.vat_number is
  'Buyer VAT registration number (15 digits) — printed on standard tax invoices when present. Identity, not financial.';
comment on column public.clients.cr_number is
  'Buyer commercial registration number — printed on tax invoices when present.';

-- ──────────────────── (b) project_set_progress (DEFINER) ────────────────────
-- Authority: caller is an active project member of THIS project, OR holds
-- projects.edit. Progress clamped to 0..100. Audited. No financial surface.
create or replace function public.project_set_progress(p_project uuid, p_progress int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_old   int;
  v_new   int := greatest(0, least(100, p_progress));
begin
  if v_actor is null then raise exception 'not_authorized'; end if;

  select progress into v_old from public.projects where id = p_project;
  if not found then raise exception 'project_not_found'; end if;

  -- Member of this project, or anyone with full project-edit authority.
  if not (
    public.has_perm('projects.edit')
    or exists (
      select 1
      from public.project_members pm
      join public.profiles pr on pr.id = pm.user_id
      where pm.project_id = p_project
        and pm.user_id = v_actor
        and pr.is_active
    )
  ) then
    raise exception 'not_authorized';
  end if;

  update public.projects set progress = v_new, updated_at = now() where id = p_project;

  insert into public.audit_log (actor_id, action, target_type, target_id, metadata)
  values (
    v_actor, 'projects.set_progress', 'project', p_project::text,
    jsonb_build_object('from', v_old, 'to', v_new)
  );
end;
$$;

revoke all on function public.project_set_progress(uuid, int) from public, anon;
grant execute on function public.project_set_progress(uuid, int) to authenticated;
