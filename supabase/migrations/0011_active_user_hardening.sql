-- 0011_active_user_hardening.sql
-- Phase 4.5 / Slice A — close the deactivated-user gaps (plan findings S16 + the
-- self-actor task gap; see docs/SECURITY_DEFINER_REVIEW.md).
--
-- What was wrong:
--   • has_perm() (0001) consulted user_permission_overrides BEFORE the role
--     lookup; only the role lookup is is_active-gated (via current_app_role()).
--     → a DEACTIVATED user holding any projects.*/tasks.* override kept that
--     permission over the REST API while their JWT (~1h) / refresh token lived.
--   • task_start / task_set_progress / task_submit / task_add_note /
--     task_milestone (0008) authorize "current assignee" by id equality and never
--     re-check that the ACTOR is still active → a deactivated assignee could keep
--     progressing/submitting their own task.
--   • team_directory() (0007) returned all names/roles to ANY authenticated
--     caller, including deactivated tokens.
-- Financial functions are unaffected (can_view_financials()/is_manager() are
-- is_active-gated through current_app_role()).
--
-- Behavior change: every helper/function below now denies callers whose profile
-- is inactive (current_app_role() IS NULL). Active users are unchanged.
-- Grants are preserved by CREATE OR REPLACE (no GRANT/REVOKE here).
--
-- ROLLBACK: re-apply the prior bodies — has_perm from 0001_identity_rbac.sql
-- (lines 95-109), team_directory from 0007_team_directory_function.sql, and the
-- five task functions from 0008_tasks_lifecycle.sql.

-- ── has_perm: deny everything for inactive/no-profile callers ────────────────
create or replace function public.has_perm(perm_key text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select case
    -- Inactive (or profile-less) callers have NO permissions at all. This must
    -- run BEFORE the override lookup (the override table is not is_active-aware).
    when public.current_app_role() is null then false
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

-- ── team_directory: only active staff may read the directory ────────────────
create or replace function public.team_directory()
returns table (
  id        uuid,
  full_name text,
  role      public.app_role,
  is_active boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.full_name, p.role, p.is_active
  from public.profiles p
  where public.current_app_role() is not null
$$;

-- ── Self-actor task functions: the actor must still be ACTIVE ────────────────
-- Bodies are identical to 0008 plus the one leading actor-active guard.

create or replace function public.task_start(p_task uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    uuid := (select auth.uid());
  v_status   public.task_status;
  v_assignee uuid;
begin
  if public.current_app_role() is null then raise exception 'not_authorized'; end if;

  select status, current_assignee_id into v_status, v_assignee
  from public.tasks where id = p_task;
  if not found then raise exception 'task_not_found'; end if;

  if not (v_assignee = v_actor or public.has_perm('tasks.assign')) then
    raise exception 'not_authorized';
  end if;
  if v_status <> 'assigned' then raise exception 'illegal_transition'; end if;

  update public.tasks set status = 'in_progress' where id = p_task;
  insert into public.task_events (task_id, actor_id, event_type, from_status, to_status)
  values (p_task, v_actor, 'started', 'assigned', 'in_progress');
end;
$$;

create or replace function public.task_set_progress(
  p_task uuid, p_progress integer, p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    uuid := (select auth.uid());
  v_status   public.task_status;
  v_assignee uuid;
  v_progress integer := greatest(0, least(100, coalesce(p_progress, 0)));
begin
  if public.current_app_role() is null then raise exception 'not_authorized'; end if;

  select status, current_assignee_id into v_status, v_assignee
  from public.tasks where id = p_task;
  if not found then raise exception 'task_not_found'; end if;

  if not (v_assignee = v_actor or public.has_perm('tasks.assign')) then
    raise exception 'not_authorized';
  end if;
  if v_status not in ('assigned', 'in_progress') then
    raise exception 'illegal_transition';
  end if;

  update public.tasks set progress = v_progress where id = p_task;
  insert into public.task_events (
    task_id, actor_id, event_type, from_status, to_status, note, metadata
  ) values (
    p_task, v_actor, 'progress', v_status, v_status, p_note,
    jsonb_build_object('progress', v_progress)
  );
end;
$$;

create or replace function public.task_submit(p_task uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    uuid := (select auth.uid());
  v_status   public.task_status;
  v_assignee uuid;
begin
  if public.current_app_role() is null then raise exception 'not_authorized'; end if;

  select status, current_assignee_id into v_status, v_assignee
  from public.tasks where id = p_task;
  if not found then raise exception 'task_not_found'; end if;

  if v_assignee is distinct from v_actor then
    raise exception 'not_authorized';
  end if;
  if v_status <> 'in_progress' then raise exception 'illegal_transition'; end if;

  update public.tasks set status = 'submitted' where id = p_task;
  insert into public.task_events (task_id, actor_id, event_type, from_status, to_status, note)
  values (p_task, v_actor, 'submitted', 'in_progress', 'submitted', p_note);
end;
$$;

create or replace function public.task_add_note(p_task uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    uuid := (select auth.uid());
  v_assignee uuid;
begin
  if public.current_app_role() is null then raise exception 'not_authorized'; end if;

  if p_note is null or length(btrim(p_note)) = 0 then
    raise exception 'empty_note';
  end if;

  select current_assignee_id into v_assignee from public.tasks where id = p_task;
  if not found then raise exception 'task_not_found'; end if;

  if not (v_assignee = v_actor or public.has_perm('tasks.assign')) then
    raise exception 'not_authorized';
  end if;

  insert into public.task_events (task_id, actor_id, event_type, note)
  values (p_task, v_actor, 'note', btrim(p_note));
end;
$$;

create or replace function public.task_milestone(
  p_task uuid, p_label text, p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    uuid := (select auth.uid());
  v_assignee uuid;
begin
  if public.current_app_role() is null then raise exception 'not_authorized'; end if;

  if p_label is null or length(btrim(p_label)) = 0 then
    raise exception 'empty_label';
  end if;

  select current_assignee_id into v_assignee from public.tasks where id = p_task;
  if not found then raise exception 'task_not_found'; end if;

  if not (v_assignee = v_actor or public.has_perm('tasks.assign')) then
    raise exception 'not_authorized';
  end if;

  insert into public.task_events (task_id, actor_id, event_type, note, metadata)
  values (p_task, v_actor, 'milestone', p_note, jsonb_build_object('label', btrim(p_label)));
end;
$$;
