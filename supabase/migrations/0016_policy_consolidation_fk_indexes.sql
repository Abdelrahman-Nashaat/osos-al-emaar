-- 0016_policy_consolidation_fk_indexes.sql
-- Phase 4.5 / Slice C5 — clears the two `multiple_permissive_policies` WARNs
-- and adds the four FK indexes that future "activity by user" queries will use.
--
-- The `*_write` policies were FOR ALL, overlapping the `*_select` policies on
-- SELECT (two permissive policies evaluated per read). Splitting write into
-- insert/update/delete keeps the EXACT same effective access with one SELECT
-- policy per table.
-- Remaining unindexed-FK INFOs are accepted: those columns are never filtered
-- or joined (names resolve via team_directory() maps) and staff are
-- deactivated, not deleted (docs/SECURITY_DEFINER_REVIEW.md).
-- ROLLBACK: recreate the FOR ALL policies; drop the four indexes.

drop policy if exists role_permissions_write on public.role_permissions;
create policy role_permissions_insert on public.role_permissions
  for insert to authenticated with check (public.is_manager());
create policy role_permissions_update on public.role_permissions
  for update to authenticated using (public.is_manager()) with check (public.is_manager());
create policy role_permissions_delete on public.role_permissions
  for delete to authenticated using (public.is_manager());

drop policy if exists overrides_write on public.user_permission_overrides;
create policy overrides_insert on public.user_permission_overrides
  for insert to authenticated with check (public.is_manager());
create policy overrides_update on public.user_permission_overrides
  for update to authenticated using (public.is_manager()) with check (public.is_manager());
create policy overrides_delete on public.user_permission_overrides
  for delete to authenticated using (public.is_manager());

create index if not exists task_events_actor_idx         on public.task_events (actor_id);
create index if not exists task_events_from_assignee_idx on public.task_events (from_assignee);
create index if not exists task_events_to_assignee_idx   on public.task_events (to_assignee);
create index if not exists invoice_events_actor_idx      on public.invoice_events (actor_id);
