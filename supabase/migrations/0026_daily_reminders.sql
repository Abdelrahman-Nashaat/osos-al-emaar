-- 0026 — Daily due/overdue reminders (التذكيرات اليومية)
-- Notifications today are event-triggered only; nothing fires as TIME passes.
-- Automatic overdue detection was a headline client requirement, so a once-a-day
-- job derives reminder notifications into the SAME table the bell already reads:
--   • invoices that crossed their due date  → finance roles (manager+accountant)
--   • tasks due today / newly overdue        → assignee (+ managers for overdue)
--   • offers past valid_until still 'sent'   → managers (dead offers inflate the
--                                              "awaiting response" dashboard count)
-- Financial isolation: task reminders carry title/due only (no amounts, ever);
-- invoice/offer reminders go ONLY to manager/accountant — identical to 0022.
-- Each reminder is sent AT MOST ONCE per entity (deduped by type+href), so the
-- bell never spams the same overdue item every morning.
--
-- Runs entirely inside Postgres (pg_cron) — no HTTP surface, no CRON_SECRET,
-- service_role stays unused. SECURITY DEFINER + EXECUTE revoked from end users.

create extension if not exists pg_cron;

create or replace function public.run_daily_reminders()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
begin
  -- (1) Invoices that became overdue — once per invoice, to active finance roles.
  insert into public.notifications (user_id, type, title, body, href)
  select p.id, 'invoice_overdue', 'فاتورة متأخرة',
         'تأخّر سداد ' || coalesce(i.invoice_number, 'فاتورة'), '/invoices/' || i.id
  from public.invoices i
  cross join public.profiles p
  where i.status in ('sent', 'partially_paid')
    and i.due_date is not null
    and i.due_date < v_today
    and p.role in ('manager', 'accountant')
    and p.is_active
    and not exists (
      select 1 from public.notifications n
      where n.user_id = p.id
        and n.type = 'invoice_overdue'
        and n.href = '/invoices/' || i.id
    );

  -- (2a) Tasks due TODAY (still open) — to the assignee, once.
  insert into public.notifications (user_id, type, title, body, href)
  select t.current_assignee_id, 'task_due_today', 'مهمة مستحقة اليوم',
         coalesce(t.title, 'مهمة'), '/tasks/' || t.id
  from public.tasks t
  where t.status <> 'closed'
    and t.current_assignee_id is not null
    and t.due_at is not null
    and (t.due_at at time zone 'Asia/Riyadh')::date = v_today
    and not exists (
      select 1 from public.notifications n
      where n.user_id = t.current_assignee_id
        and n.type = 'task_due_today'
        and n.href = '/tasks/' || t.id
    );

  -- (2b) Tasks that became OVERDUE — to the assignee, once.
  insert into public.notifications (user_id, type, title, body, href)
  select t.current_assignee_id, 'task_overdue', 'مهمة متأخرة',
         coalesce(t.title, 'مهمة'), '/tasks/' || t.id
  from public.tasks t
  where t.status <> 'closed'
    and t.current_assignee_id is not null
    and t.due_at is not null
    and (t.due_at at time zone 'Asia/Riyadh')::date < v_today
    and not exists (
      select 1 from public.notifications n
      where n.user_id = t.current_assignee_id
        and n.type = 'task_overdue'
        and n.href = '/tasks/' || t.id
    );

  -- (2c) Overdue tasks — also alert active managers (coordination), once each.
  insert into public.notifications (user_id, type, title, body, href)
  select p.id, 'task_overdue', 'مهمة متأخرة',
         coalesce(t.title, 'مهمة'), '/tasks/' || t.id
  from public.tasks t
  cross join public.profiles p
  where t.status <> 'closed'
    and t.due_at is not null
    and (t.due_at at time zone 'Asia/Riyadh')::date < v_today
    and p.role = 'manager'
    and p.is_active
    and p.id is distinct from t.current_assignee_id
    and not exists (
      select 1 from public.notifications n
      where n.user_id = p.id
        and n.type = 'task_overdue'
        and n.href = '/tasks/' || t.id
    );

  -- (3) Offers past validity still in 'sent' — to active managers, once.
  insert into public.notifications (user_id, type, title, body, href)
  select p.id, 'offer_expired_unhandled', 'عرض انتهت صلاحيته',
         coalesce(o.offer_number, 'عرض') || ' — ' || coalesce(o.title, ''), '/offers/' || o.id
  from public.offers o
  cross join public.profiles p
  where o.status = 'sent'
    and o.valid_until is not null
    and o.valid_until < v_today
    and p.role = 'manager'
    and p.is_active
    and not exists (
      select 1 from public.notifications n
      where n.user_id = p.id
        and n.type = 'offer_expired_unhandled'
        and n.href = '/offers/' || o.id
    );
end;
$$;

-- End users can never trigger the batch; only the scheduler (postgres) runs it.
revoke all on function public.run_daily_reminders() from public, anon, authenticated;

-- Schedule daily at 05:00 UTC (08:00 Asia/Riyadh). Re-running this migration
-- replaces the job of the same name (pg_cron upserts by name).
select cron.schedule('daily-reminders', '0 5 * * *', $job$select public.run_daily_reminders()$job$);
