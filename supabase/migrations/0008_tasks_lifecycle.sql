-- 0008_tasks_lifecycle.sql
-- Phase 3 — Tasks & Lifecycle. A DB-guaranteed task state machine with an
-- append-only history (task_events). Operator-locked hardening:
--   • tasks + task_events are READ-ONLY to all clients (SELECT-only RLS). There
--     is NO insert/update/delete policy. Creation, every state change, and
--     deletion happen ONLY through the SECURITY DEFINER functions below — each
--     re-checks authority internally (DEFINER bypasses RLS, so the checks are
--     load-bearing) and writes the task change + its typed history event in ONE
--     transaction. → no forged status at birth, no self-close, no history drift.
--   • task_create forces status new/assigned and progress 0 → a task can never be
--     born in_progress/submitted/closed or with non-zero progress.
--   • Delete is manager-only and audited (task_delete → audit_log). The grantable
--     tasks.delete key stays a manager default but is inert for engineers.
--   • Assignees must be ACTIVE ENGINEERS (role='engineer' and is_active).
-- Tasks are OPERATIONAL ONLY (no money columns) → engineers read them fully while
-- the Phase 2 financial isolation (project_financials = can_view_financials())
-- stays untouched. No new permission keys (reuses tasks.view / tasks.assign /
-- tasks.delete from 0001) and no new RBAC helpers.

-- ───────────────────────────── Enums ─────────────────────────────
create type public.task_status as enum (
  'new', 'assigned', 'in_progress', 'submitted', 'closed'
);
create type public.task_priority as enum ('low', 'normal', 'high', 'urgent');
create type public.task_event_type as enum (
  'created', 'assigned', 'reassigned', 'started',
  'progress', 'note', 'submitted', 'reopened', 'closed', 'milestone'
);

-- ──────────────────────────── Tables ─────────────────────────────
-- tasks — OPERATIONAL ONLY (never a money column). project_id is NOT NULL so a
-- task always has clear project ownership; the assignee is optional at creation
-- (status 'new' until assigned). The "non-new task has an assignee" invariant is
-- enforced in the lifecycle functions, not a CHECK (a CHECK + on-delete-set-null
-- would make deleting a staff profile fail; staff are deactivated, not deleted).
create table public.tasks (
  id                  uuid primary key default gen_random_uuid(),
  title               text not null,
  description         text,
  project_id          uuid not null references public.projects (id) on delete restrict,
  status              public.task_status   not null default 'new',
  priority            public.task_priority not null default 'normal',
  progress            integer not null default 0 check (progress >= 0 and progress <= 100),
  due_at              timestamptz,
  current_assignee_id uuid references public.profiles (id) on delete set null,
  created_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index tasks_project_idx  on public.tasks (project_id);
create index tasks_assignee_idx on public.tasks (current_assignee_id);
create index tasks_status_idx   on public.tasks (status);
create index tasks_due_idx      on public.tasks (due_at);
create index tasks_priority_idx on public.tasks (priority);

-- task_events — append-only history (the «اتقلت لوين» / who-holds-it-now trail).
-- Written ONLY inside the lifecycle functions; clients can read (tasks.view) but
-- never write/update/delete → history is unforgeable and immutable.
create table public.task_events (
  id            bigint generated always as identity primary key,
  task_id       uuid not null references public.tasks (id) on delete cascade,
  actor_id      uuid references public.profiles (id) on delete set null,
  event_type    public.task_event_type not null,
  from_status   public.task_status,
  to_status     public.task_status,
  from_assignee uuid references public.profiles (id) on delete set null,
  to_assignee   uuid references public.profiles (id) on delete set null,
  note          text,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index task_events_task_idx on public.task_events (task_id, created_at desc);

-- ──────────────────────── updated_at trigger ─────────────────────
-- Reuse the Phase 1 helper. No insert-logging trigger: creation is itself a
-- SECURITY DEFINER function (task_create) that writes the created/assigned events.
create trigger tasks_set_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

-- ───────────────────────────── RLS ───────────────────────────────
-- (0000_ensure_rls auto-enables RLS on create; these enables are idempotent and
--  self-documenting. Deny-by-default still requires the SELECT policies below.)
alter table public.tasks       enable row level security;
alter table public.task_events enable row level security;

-- tasks: READ-ONLY to clients. Manager + engineer read every row via tasks.view;
-- accountant has tasks.view=false → 0 rows. NO INSERT/UPDATE/DELETE policy → all
-- writes flow through the SECURITY DEFINER functions below (which bypass RLS).
create policy tasks_select on public.tasks
  for select to authenticated
  using (public.has_perm('tasks.view'));

-- task_events: same read audience; append-only & unforgeable (no write policy).
create policy task_events_select on public.task_events
  for select to authenticated
  using (public.has_perm('tasks.view'));

-- ───────────────── Lifecycle functions (SECURITY DEFINER) ─────────
-- Pattern for every function: (1) authority check (raise on fail); (2) for
-- transitions, a legal from→to check (raise illegal_transition); (3) write tasks
-- + the typed task_events row (and audit_log for manager actions) in one tx.
-- DEFINER bypasses RLS, so the internal checks are the real gate.

-- task_create — the ONLY way to create a task. Requires tasks.assign. Forces
-- progress 0 and status 'assigned' (if a valid active-engineer assignee) or 'new'.
create or replace function public.task_create(
  p_title       text,
  p_project     uuid,
  p_description text default null,
  p_priority    public.task_priority default 'normal',
  p_due_at      timestamptz default null,
  p_assignee    uuid default null,
  p_note        text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_status public.task_status;
  v_task   uuid;
begin
  if not public.has_perm('tasks.assign') then
    raise exception 'not_authorized';
  end if;
  if p_title is null or length(btrim(p_title)) = 0 then
    raise exception 'invalid_title';
  end if;
  if not exists (select 1 from public.projects where id = p_project) then
    raise exception 'invalid_project';
  end if;

  if p_assignee is not null then
    if not exists (
      select 1 from public.profiles
      where id = p_assignee and role = 'engineer' and is_active
    ) then
      raise exception 'invalid_assignee';
    end if;
    v_status := 'assigned';
  else
    v_status := 'new';
  end if;

  insert into public.tasks (
    title, description, project_id, status, priority, due_at,
    current_assignee_id, created_by, progress
  ) values (
    btrim(p_title), p_description, p_project, v_status, coalesce(p_priority, 'normal'),
    p_due_at, p_assignee, v_actor, 0
  )
  returning id into v_task;

  insert into public.task_events (task_id, actor_id, event_type, to_status, note)
  values (v_task, v_actor, 'created', v_status, p_note);

  if p_assignee is not null then
    insert into public.task_events (task_id, actor_id, event_type, to_status, to_assignee)
    values (v_task, v_actor, 'assigned', 'assigned', p_assignee);
  end if;

  return v_task;
end;
$$;

-- task_assign — assign (new→assigned) or reassign/handoff (keep status, change
-- holder). Requires tasks.assign. Assignee must be an active engineer.
create or replace function public.task_assign(
  p_task     uuid,
  p_assignee uuid,
  p_note     text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor         uuid := (select auth.uid());
  v_from_status   public.task_status;
  v_from_assignee uuid;
  v_to_status     public.task_status;
  v_event         public.task_event_type;
begin
  if not public.has_perm('tasks.assign') then
    raise exception 'not_authorized';
  end if;

  select status, current_assignee_id into v_from_status, v_from_assignee
  from public.tasks where id = p_task;
  if not found then raise exception 'task_not_found'; end if;

  if not exists (
    select 1 from public.profiles
    where id = p_assignee and role = 'engineer' and is_active
  ) then
    raise exception 'invalid_assignee';
  end if;

  if v_from_status not in ('new', 'assigned', 'in_progress', 'submitted') then
    raise exception 'illegal_transition';
  end if;

  if v_from_status = 'new' then
    v_to_status := 'assigned';
    v_event := 'assigned';
  else
    v_to_status := v_from_status;
    v_event := case
      when v_from_assignee is distinct from p_assignee then 'reassigned'
      else 'assigned'
    end;
  end if;

  update public.tasks
  set status = v_to_status, current_assignee_id = p_assignee
  where id = p_task;

  insert into public.task_events (
    task_id, actor_id, event_type, from_status, to_status, from_assignee, to_assignee, note
  ) values (
    p_task, v_actor, v_event, v_from_status, v_to_status, v_from_assignee, p_assignee, p_note
  );
end;
$$;

-- task_start — assigned → in_progress. Current assignee or a tasks.assign holder.
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

-- task_set_progress — update progress in assigned/in_progress. Assignee or assign.
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

-- task_submit — in_progress → submitted. ASSIGNEE ONLY (engineers submit own work).
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

-- task_close — submitted/in_progress → closed. MANAGER ONLY (review & close). Audited.
create or replace function public.task_close(p_task uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_status public.task_status;
begin
  if not public.is_manager() then raise exception 'not_authorized'; end if;

  select status into v_status from public.tasks where id = p_task;
  if not found then raise exception 'task_not_found'; end if;
  if v_status not in ('submitted', 'in_progress') then
    raise exception 'illegal_transition';
  end if;

  update public.tasks set status = 'closed', progress = 100 where id = p_task;
  insert into public.task_events (task_id, actor_id, event_type, from_status, to_status, note)
  values (p_task, v_actor, 'closed', v_status, 'closed', p_note);

  insert into public.audit_log (actor_id, action, target_type, target_id, metadata)
  values (v_actor, 'tasks.close', 'task', p_task::text, '{}'::jsonb);
end;
$$;

-- task_reopen — closed→in_progress (reopen) or submitted→in_progress (reject/return).
-- MANAGER ONLY. Audited.
create or replace function public.task_reopen(p_task uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_status public.task_status;
begin
  if not public.is_manager() then raise exception 'not_authorized'; end if;

  select status into v_status from public.tasks where id = p_task;
  if not found then raise exception 'task_not_found'; end if;
  if v_status not in ('closed', 'submitted') then
    raise exception 'illegal_transition';
  end if;

  update public.tasks set status = 'in_progress' where id = p_task;
  insert into public.task_events (task_id, actor_id, event_type, from_status, to_status, note)
  values (p_task, v_actor, 'reopened', v_status, 'in_progress', p_note);

  insert into public.audit_log (actor_id, action, target_type, target_id, metadata)
  values (v_actor, 'tasks.reopen', 'task', p_task::text, jsonb_build_object('from', v_status));
end;
$$;

-- task_add_note — append a note event (no state change). Assignee or tasks.assign.
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

-- task_milestone — record a named milestone (e.g. «أصدرنا الرخصة»). Assignee or assign.
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

-- task_delete — MANAGER ONLY (hard-bound; the grantable tasks.delete key is inert
-- for engineers). Deletes the task (events cascade) and writes audit_log atomically.
create or replace function public.task_delete(p_task uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_title text;
begin
  if not public.is_manager() then raise exception 'not_authorized'; end if;

  select title into v_title from public.tasks where id = p_task;
  if not found then raise exception 'task_not_found'; end if;

  delete from public.tasks where id = p_task;  -- task_events cascade away

  insert into public.audit_log (actor_id, action, target_type, target_id, metadata)
  values (v_actor, 'tasks.delete', 'task', p_task::text,
          jsonb_build_object('title', v_title, 'note', p_note));
end;
$$;

-- ───────────────── Execute grants (authenticated only) ────────────
-- Same posture as the Phase 1/2 SECURITY DEFINER helpers: no anon/public execute.
revoke all on function public.task_create(text, uuid, text, public.task_priority, timestamptz, uuid, text) from public, anon;
revoke all on function public.task_assign(uuid, uuid, text)             from public, anon;
revoke all on function public.task_start(uuid)                          from public, anon;
revoke all on function public.task_set_progress(uuid, integer, text)    from public, anon;
revoke all on function public.task_submit(uuid, text)                   from public, anon;
revoke all on function public.task_close(uuid, text)                    from public, anon;
revoke all on function public.task_reopen(uuid, text)                   from public, anon;
revoke all on function public.task_add_note(uuid, text)                 from public, anon;
revoke all on function public.task_milestone(uuid, text, text)          from public, anon;
revoke all on function public.task_delete(uuid, text)                   from public, anon;

grant execute on function public.task_create(text, uuid, text, public.task_priority, timestamptz, uuid, text) to authenticated;
grant execute on function public.task_assign(uuid, uuid, text)          to authenticated;
grant execute on function public.task_start(uuid)                       to authenticated;
grant execute on function public.task_set_progress(uuid, integer, text) to authenticated;
grant execute on function public.task_submit(uuid, text)                to authenticated;
grant execute on function public.task_close(uuid, text)                 to authenticated;
grant execute on function public.task_reopen(uuid, text)                to authenticated;
grant execute on function public.task_add_note(uuid, text)              to authenticated;
grant execute on function public.task_milestone(uuid, text, text)       to authenticated;
grant execute on function public.task_delete(uuid, text)                to authenticated;
