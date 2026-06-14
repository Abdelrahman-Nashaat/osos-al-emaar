-- 0027: Data-integrity hardening — enforce the project start/due date rule at the DB.
--
-- saveProject() (app/(app)/projects/actions.ts) already rejects due_date < start_date,
-- but projects are written through a DIRECT table insert/update (not a SECURITY DEFINER
-- RPC), so a direct PostgREST call by any holder of `projects.edit` (manager, or an
-- engineer granted the permission) could persist an inverted range and silently corrupt
-- overdue detection — a client non-negotiable ("real date fields so overdue projects/
-- tasks can be detected", CLAUDE.md). offer_convert_to_project (0019) already mirrors
-- this same rule at the DB for the conversion path; this closes the direct-write path.
--
-- Idempotent: safe to re-run. NULL start/due are allowed (open-ended projects).

alter table public.projects
  drop constraint if exists projects_dates_order_check;

alter table public.projects
  add constraint projects_dates_order_check
  check (start_date is null or due_date is null or due_date >= start_date);
