-- 0013_invoice_void_payment_guard.sql
-- Phase 4.5 / Slice A — approved product ruling (plan Decision 2 / S18):
-- "collected" always means real, non-reversed cash on ISSUED invoices. An invoice
-- carrying non-reversed payments can therefore NOT be voided — the manager
-- reverses the payments first (payment_reverse, non-destructive), then voids.
-- This removes the dashboard/reports ambiguity about payments on voided invoices.
--
-- Body identical to 0010_finance.sql invoice_void plus the live-payments check
-- (raise 'has_live_payments'). Manager-only + audited as before; grants preserved
-- by CREATE OR REPLACE.
--
-- ROLLBACK: re-apply the prior body from 0010_finance.sql (invoice_void).

create or replace function public.invoice_void(p_invoice uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_status public.invoice_status;
begin
  if not public.is_manager() then raise exception 'not_authorized'; end if;

  select status into v_status from public.invoices where id = p_invoice;
  if not found then raise exception 'invoice_not_found'; end if;
  if v_status = 'void' then raise exception 'illegal_state'; end if;

  -- Approved ruling: reverse payments first, then void. A voided invoice must
  -- never hold live (non-reversed) collected cash.
  if exists (
    select 1 from public.payments
    where invoice_id = p_invoice and not is_reversed
  ) then
    raise exception 'has_live_payments';
  end if;

  update public.invoices set status = 'void' where id = p_invoice;
  insert into public.invoice_events (invoice_id, actor_id, event_type, from_status, to_status, note)
  values (p_invoice, v_actor, 'voided', v_status, 'void', p_note);

  insert into public.audit_log (actor_id, action, target_type, target_id, metadata)
  values (v_actor, 'invoices.void', 'invoice', p_invoice::text,
          jsonb_build_object('from', v_status));
end;
$$;
