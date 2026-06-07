-- 0007_team_directory_function.sql
-- Replaces the 0006 team_directory VIEW with a SECURITY DEFINER FUNCTION.
--
-- Why: Supabase flags SECURITY DEFINER *views* as an ERROR-level advisor
-- (0010_security_definer_view), because such views silently bypass RLS. A
-- SECURITY DEFINER *function* reaches the same goal — expose a MINIMAL team
-- directory (id / full_name / role / is_active; never email, contact, or money)
-- to every authenticated user so "assigned engineers" (Phase 2) and task handoffs
-- (Phase 3) can resolve colleague names — and is only the WARN-level advisor class
-- already accepted for is_manager()/has_perm()/can_view_financials().
--
-- profiles SELECT stays self + manager (set in 0006), so emails/timestamps are
-- never exposed to non-managers. This keeps the financial isolation untouched
-- (profiles holds no money).

drop view if exists public.team_directory;

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
  select id, full_name, role, is_active from public.profiles
$$;

revoke all on function public.team_directory() from public, anon;
grant execute on function public.team_directory() to authenticated;
