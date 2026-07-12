-- 0028_push_subscriptions.sql
-- Web Push device subscriptions (mobile-elevation phase). One row per
-- browser/device per user, so a notification can reach a user while the app is
-- closed. Purely additive — no existing table or data is touched.
--
-- RLS: a user sees/deletes ONLY their own rows. Registration goes through a
-- SECURITY DEFINER function (no direct INSERT policy). The dispatch sender reads
-- rows with the service role (server-only), never the client.
-- Financial isolation is unaffected: notifications are already role-scoped, and
-- a push only ever targets the recipient of its own notification row.

create table public.push_subscriptions (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- Read/delete own rows only. No INSERT/UPDATE policy (the definer fn writes).
create policy push_subs_select_own on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
create policy push_subs_delete_own on public.push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));

-- Upsert the caller's subscription. Re-subscribing on the same endpoint
-- refreshes keys + last_seen and re-homes it to the caller.
create or replace function public.push_subscribe(
  p_endpoint text, p_p256dh text, p_auth text, p_ua text
) returns void
language sql security definer set search_path = '' as $$
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values ((select auth.uid()), p_endpoint, p_p256dh, p_auth, p_ua)
  on conflict (endpoint) do update
    set user_id = (select auth.uid()),
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent,
        last_seen_at = now();
$$;

create or replace function public.push_unsubscribe(p_endpoint text)
returns void
language sql security definer set search_path = '' as $$
  delete from public.push_subscriptions
  where endpoint = p_endpoint and user_id = (select auth.uid());
$$;

revoke all on function public.push_subscribe(text, text, text, text) from public, anon;
revoke all on function public.push_unsubscribe(text)                 from public, anon;
grant execute on function public.push_subscribe(text, text, text, text) to authenticated;
grant execute on function public.push_unsubscribe(text)                 to authenticated;
