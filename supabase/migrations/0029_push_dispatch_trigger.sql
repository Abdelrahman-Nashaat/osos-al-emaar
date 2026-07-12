-- 0029_push_dispatch_trigger.sql
-- Bridge: each new notification row fires a Web Push to the recipient's devices.
-- An AFTER INSERT trigger calls the Vercel /api/push/dispatch route via pg_net,
-- authenticated with a Vault-held shared secret. Fire-and-forget (async);
-- delivery + pruning happen in the route. Never blocks the writing transaction.
--
-- Financial isolation holds automatically: this only forwards the NOTIFICATION
-- ROW that was inserted, which is already role-scoped (invoice_* rows exist only
-- for manager/accountant — migration 0022). An engineer therefore can never be a
-- push recipient of a financial event.
--
-- Graceful no-op until configured: if the Vault secrets are absent the function
-- returns without posting, so applying this migration before wiring Vault/Vercel
-- is safe on a live project.
--
-- NOTE: pg_net is NON-relocatable and installs into schema `net` on Supabase, so
-- we do NOT pass `with schema` (that would raise "must be installed in schema
-- net"). The function fully-qualifies net.http_post because search_path = ''.

create extension if not exists pg_net;

create or replace function public.notify_push_dispatch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'push_dispatch_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_dispatch_secret';
  if v_url is null or v_secret is null then
    return new; -- not configured yet; no-op
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body    := jsonb_build_object('notification_id', new.id),
    timeout_milliseconds := 5000
  );
  return new;
end;
$$;

-- End users can never invoke it directly; it only runs as the AFTER INSERT trigger.
revoke all on function public.notify_push_dispatch() from public, anon, authenticated;

create trigger notifications_push_dispatch
after insert on public.notifications
for each row execute function public.notify_push_dispatch();
