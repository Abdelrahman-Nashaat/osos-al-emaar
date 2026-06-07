-- 0000_ensure_rls.sql
-- Safety net: an event trigger that auto-enables Row Level Security on every new
-- table created in the public schema. Runs BEFORE 0001 so all tables get RLS, and
-- BEFORE 0002/0003 which revoke EXECUTE on this function. Idempotent, so it is safe
-- to (re)apply to an existing database.
--
-- IMPORTANT: this is a backstop only. Financial tables (invoices, payments,
-- project_financials, …) must still ship explicit deny-by-default RLS policies in
-- their own migration — never rely on this trigger alone for financial isolation.

create or replace function public.rls_auto_enable()
  returns event_trigger
  language plpgsql
  security definer
  set search_path to 'pg_catalog'
as $function$
declare
  cmd record;
begin
  for cmd in
    select *
    from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type in ('table', 'partitioned table')
  loop
    if cmd.schema_name is not null
       and cmd.schema_name in ('public')
       and cmd.schema_name not in ('pg_catalog', 'information_schema')
       and cmd.schema_name not like 'pg_toast%'
       and cmd.schema_name not like 'pg_temp%' then
      begin
        execute format('alter table if exists %s enable row level security', cmd.object_identity);
        raise log 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      exception
        when others then
          raise log 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      end;
    else
      raise log 'rls_auto_enable: skip % (system schema or not enforced: %)', cmd.object_identity, cmd.schema_name;
    end if;
  end loop;
end;
$function$;

do $$
begin
  if not exists (select 1 from pg_event_trigger where evtname = 'ensure_rls') then
    create event trigger ensure_rls on ddl_command_end execute function public.rls_auto_enable();
  end if;
end $$;

-- Event-trigger function: never callable via the API by anyone.
revoke execute on function public.rls_auto_enable() from anon, authenticated, public;
