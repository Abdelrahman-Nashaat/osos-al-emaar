-- 0006_team_directory.sql
-- Security review M1: 0005 relaxed profiles SELECT to ALL authenticated, which
-- exposed every staff member's email + timestamps to every engineer/accountant —
-- more PII than the app needs (the UI only reads id/full_name/role of others).
--
-- Tighten it:
--   • Revert profiles SELECT to the Phase 1 posture (self + manager).
--   • Expose a MINIMAL team directory (id, full_name, role, is_active) to every
--     authenticated user via a definer view, so "assigned engineers" (Phase 2) and
--     task handoffs (Phase 3) can resolve colleague names WITHOUT leaking emails.
-- The view carries no money and no contact details. It deliberately runs as its
-- owner (security_invoker = off) to bypass the stricter profiles RLS for these
-- non-sensitive columns only — a reviewed, scoped exception.

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.is_manager());

create or replace view public.team_directory
  with (security_invoker = off) as
  select id, full_name, role, is_active
  from public.profiles;

revoke all on public.team_directory from anon;
grant select on public.team_directory to authenticated;
