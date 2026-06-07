-- 0005_profiles_team_visibility.sql
-- Team collaboration needs every active member to see colleagues' basic identity
-- (name + role) — e.g. the "assigned engineers" on a project (Phase 2 project_members)
-- and task handoffs between engineers in Phase 3 ("اتقلت لوين"). Phase 1 limited
-- profiles SELECT to self + manager, which is too strict for an internal team tool.
--
-- This relaxes SELECT so any AUTHENTICATED user can read profiles. profiles holds NO
-- money (every amount lives in project_financials / future invoices+payments), so this
-- does NOT affect the financial-isolation rule. Writes stay manager-only (unchanged):
-- profiles_insert_manager / profiles_update_manager remain in force.

drop policy if exists profiles_select on public.profiles;

create policy profiles_select on public.profiles
  for select to authenticated
  using (true);
