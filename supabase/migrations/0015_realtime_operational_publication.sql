-- 0015_realtime_operational_publication.sql
-- Phase 4.5 / Slice C2 — live multi-device refresh for OPERATIONAL data only.
--
-- LOCKED RULE: finance tables (invoices, payments, invoice_events,
-- project_financials) and audit_log (its metadata embeds amounts) must NEVER
-- enter a client publication. Postgres Changes respects each table's SELECT
-- RLS per subscriber, so engineers/accountants only ever receive rows they can
-- already read; DELETE events carry only the PK (non-sensitive here).
-- Gate regression check (run every slice):
--   select count(*) from pg_publication_tables
--   where pubname='supabase_realtime'
--     and tablename in ('invoices','payments','invoice_events','project_financials','audit_log');
--   -- MUST be 0
-- ROLLBACK: alter publication supabase_realtime drop table public.<t>; (×5)

alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.task_events;
alter publication supabase_realtime add table public.projects;
alter publication supabase_realtime add table public.clients;
alter publication supabase_realtime add table public.project_members;
