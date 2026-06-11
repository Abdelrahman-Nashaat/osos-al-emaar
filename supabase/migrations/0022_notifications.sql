-- 0022_notifications.sql
-- Product-completion phase, Slice 5 — in-app notifications («الإشعارات»).
-- Hamza's flow today: an engineer doesn't know a task landed on him, the manager
-- doesn't know work was submitted, the accountant misses payments recorded by
-- the manager. Notifications are DERIVED rows written by AFTER-INSERT triggers
-- on the existing append-only event tables, so they can never disagree with the
-- timeline and need no app-code changes in the lifecycle functions.
--
-- Financial isolation: task notifications carry no amounts by construction;
-- notifications derived from invoice events go ONLY to manager/accountant
-- recipients. RLS lets a user read exactly their own rows, so the Realtime
-- channel (RLS-filtered, setAuth pattern) delivers only their stream.
-- Mark-as-read goes through definer functions — no client UPDATE policy at all.

create table public.notifications (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  type       text not null,
  title      text not null,
  body       text,
  href       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx   on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;

create policy notifications_select_own on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()));
-- No INSERT/UPDATE/DELETE policies: triggers write, definer fns mark read.

-- ─────────────────────── mark-read functions ───────────────────────
create or replace function public.notifications_mark_read(p_ids bigint[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications
  set read_at = now()
  where user_id = (select auth.uid()) and read_at is null and id = any (p_ids);
$$;

create or replace function public.notifications_mark_all_read()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications
  set read_at = now()
  where user_id = (select auth.uid()) and read_at is null;
$$;

revoke all on function public.notifications_mark_read(bigint[]) from public, anon;
revoke all on function public.notifications_mark_all_read()     from public, anon;
grant execute on function public.notifications_mark_read(bigint[]) to authenticated;
grant execute on function public.notifications_mark_all_read()     to authenticated;

-- ─────────────────────── task_events → notifications ───────────────────────
create or replace function public.notify_task_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_task  record;
begin
  select t.title, t.current_assignee_id into v_task
  from public.tasks t where t.id = new.task_id;
  if not found then return new; end if;
  v_title := coalesce(v_task.title, 'مهمة');

  if new.event_type in ('assigned', 'reassigned') then
    -- Tell the engineer a task landed on him (unless he did it himself).
    if new.to_assignee is not null and new.to_assignee <> coalesce(new.actor_id, '00000000-0000-0000-0000-000000000000'::uuid) then
      insert into public.notifications (user_id, type, title, body, href)
      values (new.to_assignee, 'task_assigned',
              'أُسندت إليك مهمة', v_title, '/tasks/' || new.task_id);
    end if;

  elsif new.event_type = 'submitted' then
    -- Tell every active manager work is waiting for review.
    insert into public.notifications (user_id, type, title, body, href)
    select p.id, 'task_submitted', 'مهمة بانتظار مراجعتك', v_title, '/tasks/' || new.task_id
    from public.profiles p
    where p.role = 'manager' and p.is_active
      and p.id <> coalesce(new.actor_id, '00000000-0000-0000-0000-000000000000'::uuid);

  elsif new.event_type in ('reopened', 'closed') then
    -- Tell the assignee the verdict on his submission.
    if v_task.current_assignee_id is not null
       and v_task.current_assignee_id <> coalesce(new.actor_id, '00000000-0000-0000-0000-000000000000'::uuid) then
      insert into public.notifications (user_id, type, title, body, href)
      values (v_task.current_assignee_id,
              case when new.event_type = 'reopened' then 'task_reopened' else 'task_closed' end,
              case when new.event_type = 'reopened' then 'أُعيدت مهمتك للتعديل' else 'اعتُمدت مهمتك' end,
              v_title, '/tasks/' || new.task_id);
    end if;
  end if;

  return new;
end;
$$;

create trigger task_events_notify
after insert on public.task_events
for each row execute function public.notify_task_event();

-- ───────────────────── invoice_events → notifications ─────────────────────
-- Recipients are FINANCIAL ROLES ONLY (manager + accountant), never engineers.
create or replace function public.notify_invoice_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_number text;
begin
  if new.event_type not in ('payment', 'voided') then return new; end if;

  select invoice_number into v_number from public.invoices where id = new.invoice_id;

  insert into public.notifications (user_id, type, title, body, href)
  select p.id,
         case when new.event_type = 'payment' then 'invoice_payment' else 'invoice_voided' end,
         case when new.event_type = 'payment' then 'دفعة جديدة' else 'أُلغيت فاتورة' end,
         case when new.event_type = 'payment'
              then 'استلام ' || trim(to_char(coalesce(new.amount, 0), 'FM999,999,999,990.##')) || ' ر.س على ' || coalesce(v_number, 'فاتورة')
              else coalesce(v_number, 'فاتورة') end,
         '/invoices/' || new.invoice_id
  from public.profiles p
  where p.role in ('manager', 'accountant') and p.is_active
    and p.id <> coalesce(new.actor_id, '00000000-0000-0000-0000-000000000000'::uuid);

  return new;
end;
$$;

create trigger invoice_events_notify
after insert on public.invoice_events
for each row execute function public.notify_invoice_event();

-- ───────────────────────── Realtime publication ─────────────────────────
-- notifications join the operational publication: RLS restricts the stream to
-- the recipient's own rows (the client subscribes with its user JWT).
-- portfolio_items are operational (no amounts) — included for cross-device
-- freshness like the other five operational tables.
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.portfolio_items;
