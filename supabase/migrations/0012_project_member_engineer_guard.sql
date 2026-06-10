-- 0012_project_member_engineer_guard.sql
-- Phase 4.5 / Slice A — «المهندسون المعيّنون» must actually be engineers.
--
-- project_members writes are direct RLS inserts (has_perm('projects.edit')); the
-- 0004 policy never constrained WHO can be a member, so a manager/accountant
-- could be inserted as an "assigned engineer" (UAT finding 2). Enforce the same
-- invariant task_assign already enforces in-DB: the target profile must be an
-- ACTIVE ENGINEER. A BEFORE INSERT trigger catches every write path (UI action,
-- raw REST, even the server-only admin client).
--
-- SECURITY DEFINER is required: the inserting user may be a granted engineer who
-- cannot read colleagues' profiles rows under RLS (profiles SELECT = self or
-- manager); the validation lookup must bypass that to check role/is_active.
--
-- Additive only: existing rows are NOT validated retroactively (no UPDATE path
-- exists for this table — rows are inserted/deleted). Any legacy non-engineer
-- member is removed manually via the UI.
--
-- ROLLBACK: drop trigger project_members_engineer_guard on public.project_members;
--           drop function public.project_members_enforce_engineer();

create or replace function public.project_members_enforce_engineer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = new.user_id and role = 'engineer' and is_active
  ) then
    raise exception 'invalid_member';  -- only active engineers may be project members
  end if;
  return new;
end;
$$;

-- Not callable via the API (trigger-only); strip the default PUBLIC execute.
revoke all on function public.project_members_enforce_engineer() from public, anon, authenticated;

create trigger project_members_engineer_guard
  before insert on public.project_members
  for each row execute function public.project_members_enforce_engineer();
