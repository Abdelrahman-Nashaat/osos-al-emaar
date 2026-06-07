-- 0009_task_assign_noop_guard.sql
-- Phase 3 review fix (M2): task_assign emitted a spurious 'assigned' history event
-- when a task was "reassigned" to the SAME engineer it already had. Task history is
-- a product feature (the «اتقلت لوين» trail), so reject a no-op reassignment instead
-- of recording a misleading event. Only the body changes; signature/grants are
-- preserved by CREATE OR REPLACE.

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

  -- No-op guard: an already-assigned task cannot be "reassigned" to the same holder
  -- (would forge a misleading history event with no real change).
  if v_from_status <> 'new' and p_assignee = v_from_assignee then
    raise exception 'illegal_transition';
  end if;

  if v_from_status = 'new' then
    v_to_status := 'assigned';
    v_event := 'assigned';
  else
    v_to_status := v_from_status;
    v_event := 'reassigned';
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
