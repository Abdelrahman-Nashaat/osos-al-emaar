-- 0010_finance.sql
-- Phase 4 — Finance. Invoices + payments + an append-only invoice/تحصيل trail,
-- built with the Phase 3 rigor: invoices/payments/invoice_events are READ-ONLY to
-- clients (SELECT-only RLS = can_view_financials()). Creation, every state change,
-- payment recording, voiding, deletion, and payment reversal happen ONLY through
-- SECURITY DEFINER functions that re-check authority internally, maintain the
-- running balance (amount_paid/total), and write audit_log atomically.
--
-- Operator-locked hardening:
--   • Financials stay manager + accountant ONLY (can_view_financials()); an engineer
--     JWT reads 0 rows from every finance table. financials.view is role-bound and
--     never grantable (Amendment 1 + the 0001 CHECK).
--   • Authority split: create / send / record-payment / edit-draft / note =
--     can_view_financials(); void / delete / payment-reversal = is_manager()
--     (destructive/admin actions), enforced INSIDE the functions, not UI-only.
--   • VAT is DB-enforced to exactly 0 or 15 (column CHECK + invalid_vat_rate raise).
--   • Payment reversal is NON-DESTRUCTIVE: payment_reverse flags is_reversed and
--     recomputes amount_paid from non-reversed payments. There is NO payment_delete.
--   • project_financials writes are relaxed from is_manager() → can_view_financials()
--     so the accountant gets the finance UI (SELECT unchanged; engineers still 0 rows;
--     delete stays manager-only; the setProjectFinancials audit_log write is kept).
-- No new permission keys and no new RBAC helpers (reuses financials.view /
-- can_view_financials() / is_manager() / has_perm()).

-- ───────────────────────────── Enums ─────────────────────────────
create type public.invoice_status as enum (
  'draft', 'sent', 'partially_paid', 'paid', 'void'
);
create type public.payment_method as enum (
  'cash', 'bank_transfer', 'cheque', 'card', 'other'
);
create type public.invoice_event_type as enum (
  'created', 'sent', 'payment', 'payment_reversed', 'voided', 'note'
);

-- ──────────────────────── Invoice number sequence ────────────────
-- Human-friendly sequential number assigned inside invoice_create (INV-00001…).
create sequence public.invoice_number_seq;

-- ──────────────────────────── Tables ─────────────────────────────
-- invoices — FINANCIAL (can_view_financials() only). vat_amount / total / amount_paid
-- are maintained ONLY inside the lifecycle functions; the table is not client-writable.
-- client_id is captured at creation so an issued invoice's bill-to never drifts.
create table public.invoices (
  id             uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  project_id     uuid not null references public.projects (id) on delete restrict,
  client_id      uuid not null references public.clients (id) on delete restrict,
  status         public.invoice_status not null default 'draft',
  issue_date     date not null default current_date,
  due_date       date,
  subtotal       numeric(14, 2) not null check (subtotal > 0),
  vat_rate       numeric(5, 2)  not null default 0 check (vat_rate in (0, 15)),
  vat_amount     numeric(14, 2) not null default 0,
  total          numeric(14, 2) not null,
  amount_paid    numeric(14, 2) not null default 0,
  currency       text not null default 'SAR',
  description    text,
  notes          text,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index invoices_project_idx on public.invoices (project_id);
create index invoices_client_idx  on public.invoices (client_id);
create index invoices_status_idx  on public.invoices (status);
create index invoices_due_idx     on public.invoices (due_date);

-- payments — FINANCIAL. A real payment record is NEVER deleted; reversal flags the
-- row (is_reversed) so the original stays auditable forever.
create table public.payments (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid not null references public.invoices (id) on delete restrict,
  amount        numeric(14, 2) not null check (amount > 0),
  paid_at       date not null default current_date,
  method        public.payment_method not null default 'bank_transfer',
  reference     text,
  notes         text,
  recorded_by   uuid references public.profiles (id) on delete set null,
  is_reversed   boolean not null default false,
  reversed_at   timestamptz,
  reversed_by   uuid references public.profiles (id) on delete set null,
  reversal_note text,
  created_at    timestamptz not null default now()
);
create index payments_invoice_idx on public.payments (invoice_id);
create index payments_paid_idx    on public.payments (paid_at);
create index payments_active_idx  on public.payments (invoice_id, is_reversed);

-- invoice_events — append-only history (the invoice / تحصيل trail; mirrors task_events).
-- Written ONLY inside the functions; clients can read (can_view_financials) but never
-- write/update/delete → the trail is unforgeable and immutable.
create table public.invoice_events (
  id          bigint generated always as identity primary key,
  invoice_id  uuid not null references public.invoices (id) on delete cascade,
  actor_id    uuid references public.profiles (id) on delete set null,
  event_type  public.invoice_event_type not null,
  amount      numeric(14, 2),
  from_status public.invoice_status,
  to_status   public.invoice_status,
  note        text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index invoice_events_invoice_idx on public.invoice_events (invoice_id, created_at desc);

-- ──────────────────────── updated_at trigger ─────────────────────
create trigger invoices_set_updated_at
before update on public.invoices
for each row execute function public.set_updated_at();

-- ───────────────────────────── RLS ───────────────────────────────
-- (0000_ensure_rls auto-enables RLS on create; these enables are idempotent and
--  self-documenting. Deny-by-default still requires the SELECT policies below.)
alter table public.invoices       enable row level security;
alter table public.payments       enable row level security;
alter table public.invoice_events enable row level security;

-- All three finance tables: READ-ONLY to clients, manager + accountant only.
-- Engineer JWT → 0 rows. NO insert/update/delete policy → every mutation flows
-- through the SECURITY DEFINER functions below (which bypass RLS).
create policy invoices_select on public.invoices
  for select to authenticated
  using (public.can_view_financials());

create policy payments_select on public.payments
  for select to authenticated
  using (public.can_view_financials());

create policy invoice_events_select on public.invoice_events
  for select to authenticated
  using (public.can_view_financials());

-- ───────── Relax project_financials writes (Phase 2 reserved this) ─────────
-- The accountant now gets the finance UI: budget/contract/cost writes move from
-- is_manager() → can_view_financials(). SELECT unchanged (already can_view_financials);
-- engineers still read 0 rows; delete stays manager-only.
drop policy if exists project_financials_insert on public.project_financials;
drop policy if exists project_financials_update on public.project_financials;

create policy project_financials_insert on public.project_financials
  for insert to authenticated
  with check (public.can_view_financials());

create policy project_financials_update on public.project_financials
  for update to authenticated
  using (public.can_view_financials())
  with check (public.can_view_financials());

-- ───────────────── Lifecycle functions (SECURITY DEFINER) ─────────
-- Pattern (mirrors 0008): (1) authority check; (2) legal-state check; (3) write
-- row(s) + a typed invoice_events row + audit_log in ONE tx. DEFINER bypasses RLS,
-- so the internal authority checks are the real gate.

-- invoice_create — the ONLY way to create an invoice. can_view_financials().
-- Captures client_id from the project, forces status 'draft' + amount_paid 0,
-- enforces VAT ∈ {0,15}, computes vat_amount + total, assigns the INV-… number.
create or replace function public.invoice_create(
  p_project     uuid,
  p_subtotal    numeric,
  p_vat_rate    numeric default 0,
  p_due_date    date default null,
  p_issue_date  date default null,
  p_description text default null,
  p_note        text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid := (select auth.uid());
  v_client  uuid;
  v_vat_amt numeric(14,2);
  v_total   numeric(14,2);
  v_number  text;
  v_invoice uuid;
begin
  if not public.can_view_financials() then
    raise exception 'not_authorized';
  end if;
  if p_subtotal is null or p_subtotal <= 0 then
    raise exception 'invalid_subtotal';
  end if;
  if coalesce(p_vat_rate, 0) not in (0, 15) then
    raise exception 'invalid_vat_rate';
  end if;

  select client_id into v_client from public.projects where id = p_project;
  if not found then raise exception 'invalid_project'; end if;
  if v_client is null then raise exception 'no_client'; end if;

  v_vat_amt := round(p_subtotal * coalesce(p_vat_rate, 0) / 100, 2);
  v_total   := p_subtotal + v_vat_amt;
  v_number  := 'INV-' || lpad(nextval('public.invoice_number_seq')::text, 5, '0');

  insert into public.invoices (
    invoice_number, project_id, client_id, status, issue_date, due_date,
    subtotal, vat_rate, vat_amount, total, amount_paid, description, notes, created_by
  ) values (
    v_number, p_project, v_client, 'draft', coalesce(p_issue_date, current_date), p_due_date,
    p_subtotal, coalesce(p_vat_rate, 0), v_vat_amt, v_total, 0, p_description, p_note, v_actor
  )
  returning id into v_invoice;

  insert into public.invoice_events (invoice_id, actor_id, event_type, to_status, amount, note)
  values (v_invoice, v_actor, 'created', 'draft', v_total, p_note);

  insert into public.audit_log (actor_id, action, target_type, target_id, metadata)
  values (v_actor, 'invoices.create', 'invoice', v_invoice::text,
          jsonb_build_object('number', v_number, 'total', v_total));

  return v_invoice;
end;
$$;

-- invoice_update — edit a DRAFT only. can_view_financials(). Re-validates VAT.
create or replace function public.invoice_update(
  p_invoice     uuid,
  p_subtotal    numeric,
  p_vat_rate    numeric default 0,
  p_due_date    date default null,
  p_description text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid := (select auth.uid());
  v_status  public.invoice_status;
  v_vat_amt numeric(14,2);
  v_total   numeric(14,2);
begin
  if not public.can_view_financials() then
    raise exception 'not_authorized';
  end if;
  if p_subtotal is null or p_subtotal <= 0 then
    raise exception 'invalid_subtotal';
  end if;
  if coalesce(p_vat_rate, 0) not in (0, 15) then
    raise exception 'invalid_vat_rate';
  end if;

  select status into v_status from public.invoices where id = p_invoice;
  if not found then raise exception 'invoice_not_found'; end if;
  if v_status <> 'draft' then raise exception 'not_draft'; end if;

  v_vat_amt := round(p_subtotal * coalesce(p_vat_rate, 0) / 100, 2);
  v_total   := p_subtotal + v_vat_amt;

  update public.invoices set
    subtotal    = p_subtotal,
    vat_rate    = coalesce(p_vat_rate, 0),
    vat_amount  = v_vat_amt,
    total       = v_total,
    due_date    = p_due_date,
    description = p_description
  where id = p_invoice;

  insert into public.audit_log (actor_id, action, target_type, target_id, metadata)
  values (v_actor, 'invoices.update', 'invoice', p_invoice::text,
          jsonb_build_object('total', v_total));
end;
$$;

-- invoice_send — draft → sent. can_view_financials().
create or replace function public.invoice_send(p_invoice uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_status public.invoice_status;
begin
  if not public.can_view_financials() then raise exception 'not_authorized'; end if;

  select status into v_status from public.invoices where id = p_invoice;
  if not found then raise exception 'invoice_not_found'; end if;
  if v_status <> 'draft' then raise exception 'illegal_state'; end if;

  update public.invoices set status = 'sent' where id = p_invoice;
  insert into public.invoice_events (invoice_id, actor_id, event_type, from_status, to_status, note)
  values (p_invoice, v_actor, 'sent', 'draft', 'sent', p_note);

  insert into public.audit_log (actor_id, action, target_type, target_id, metadata)
  values (v_actor, 'invoices.send', 'invoice', p_invoice::text, '{}'::jsonb);
end;
$$;

-- invoice_record_payment — record a payment; maintain the running balance + status.
-- can_view_financials(). status must be sent/partially_paid; no overpayment.
create or replace function public.invoice_record_payment(
  p_invoice   uuid,
  p_amount    numeric,
  p_paid_at   date default null,
  p_method    public.payment_method default 'bank_transfer',
  p_reference text default null,
  p_note      text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor      uuid := (select auth.uid());
  v_status     public.invoice_status;
  v_total      numeric(14,2);
  v_paid       numeric(14,2);
  v_new_paid   numeric(14,2);
  v_new_status public.invoice_status;
  v_payment    uuid;
begin
  if not public.can_view_financials() then raise exception 'not_authorized'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount'; end if;

  select status, total, amount_paid into v_status, v_total, v_paid
  from public.invoices where id = p_invoice;
  if not found then raise exception 'invoice_not_found'; end if;
  if v_status not in ('sent', 'partially_paid') then raise exception 'illegal_state'; end if;
  if p_amount > (v_total - v_paid) then raise exception 'overpayment'; end if;

  insert into public.payments (invoice_id, amount, paid_at, method, reference, notes, recorded_by)
  values (p_invoice, p_amount, coalesce(p_paid_at, current_date),
          coalesce(p_method, 'bank_transfer'), p_reference, p_note, v_actor)
  returning id into v_payment;

  -- Recompute amount_paid from non-reversed payments (single source of truth).
  select coalesce(sum(amount), 0) into v_new_paid
  from public.payments where invoice_id = p_invoice and not is_reversed;

  v_new_status := case when v_new_paid >= v_total then 'paid' else 'partially_paid' end;

  update public.invoices set amount_paid = v_new_paid, status = v_new_status
  where id = p_invoice;

  insert into public.invoice_events (
    invoice_id, actor_id, event_type, from_status, to_status, amount, note
  ) values (
    p_invoice, v_actor, 'payment', v_status, v_new_status, p_amount, p_note
  );

  insert into public.audit_log (actor_id, action, target_type, target_id, metadata)
  values (v_actor, 'payments.record', 'invoice', p_invoice::text,
          jsonb_build_object('payment', v_payment, 'amount', p_amount));

  return v_payment;
end;
$$;

-- invoice_void — MANAGER ONLY. Any non-void → void. Payment records preserved.
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

  update public.invoices set status = 'void' where id = p_invoice;
  insert into public.invoice_events (invoice_id, actor_id, event_type, from_status, to_status, note)
  values (p_invoice, v_actor, 'voided', v_status, 'void', p_note);

  insert into public.audit_log (actor_id, action, target_type, target_id, metadata)
  values (v_actor, 'invoices.void', 'invoice', p_invoice::text,
          jsonb_build_object('from', v_status));
end;
$$;

-- invoice_delete — MANAGER ONLY. Only a DRAFT with no payments (real invoices are
-- voided, never deleted). Events cascade away.
create or replace function public.invoice_delete(p_invoice uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_status public.invoice_status;
  v_paid   numeric(14,2);
  v_number text;
begin
  if not public.is_manager() then raise exception 'not_authorized'; end if;

  select status, amount_paid, invoice_number into v_status, v_paid, v_number
  from public.invoices where id = p_invoice;
  if not found then raise exception 'invoice_not_found'; end if;
  if v_status <> 'draft' or v_paid <> 0
     or exists (select 1 from public.payments where invoice_id = p_invoice) then
    raise exception 'has_payments';
  end if;

  delete from public.invoices where id = p_invoice;  -- invoice_events cascade away

  insert into public.audit_log (actor_id, action, target_type, target_id, metadata)
  values (v_actor, 'invoices.delete', 'invoice', p_invoice::text,
          jsonb_build_object('number', v_number, 'note', p_note));
end;
$$;

-- payment_reverse — MANAGER ONLY. NON-DESTRUCTIVE: flags is_reversed, recomputes
-- amount_paid from non-reversed payments, resets status. The original row stays.
create or replace function public.payment_reverse(p_payment uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor      uuid := (select auth.uid());
  v_invoice    uuid;
  v_reversed   boolean;
  v_amount     numeric(14,2);
  v_status     public.invoice_status;
  v_total      numeric(14,2);
  v_new_paid   numeric(14,2);
  v_new_status public.invoice_status;
begin
  if not public.is_manager() then raise exception 'not_authorized'; end if;

  select invoice_id, is_reversed, amount into v_invoice, v_reversed, v_amount
  from public.payments where id = p_payment;
  if not found then raise exception 'payment_not_found'; end if;
  if v_reversed then raise exception 'already_reversed'; end if;

  select status, total into v_status, v_total from public.invoices where id = v_invoice;

  update public.payments set
    is_reversed = true, reversed_at = now(), reversed_by = v_actor, reversal_note = p_note
  where id = p_payment;

  select coalesce(sum(amount), 0) into v_new_paid
  from public.payments where invoice_id = v_invoice and not is_reversed;

  -- Never resurrect a voided invoice; otherwise recompute paid / partial / sent.
  if v_status = 'void' then
    v_new_status := 'void';
  elsif v_new_paid >= v_total then
    v_new_status := 'paid';
  elsif v_new_paid > 0 then
    v_new_status := 'partially_paid';
  else
    v_new_status := 'sent';
  end if;

  update public.invoices set amount_paid = v_new_paid, status = v_new_status
  where id = v_invoice;

  insert into public.invoice_events (
    invoice_id, actor_id, event_type, from_status, to_status, amount, note
  ) values (
    v_invoice, v_actor, 'payment_reversed', v_status, v_new_status, v_amount, p_note
  );

  insert into public.audit_log (actor_id, action, target_type, target_id, metadata)
  values (v_actor, 'payments.reverse', 'invoice', v_invoice::text,
          jsonb_build_object('payment', p_payment, 'amount', v_amount));
end;
$$;

-- invoice_add_note — تحصيل follow-up note (no state change). can_view_financials().
create or replace function public.invoice_add_note(p_invoice uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if not public.can_view_financials() then raise exception 'not_authorized'; end if;
  if p_note is null or length(btrim(p_note)) = 0 then raise exception 'empty_note'; end if;
  if not exists (select 1 from public.invoices where id = p_invoice) then
    raise exception 'invoice_not_found';
  end if;

  insert into public.invoice_events (invoice_id, actor_id, event_type, note)
  values (p_invoice, v_actor, 'note', btrim(p_note));
end;
$$;

-- ───────────────── Execute grants (authenticated only) ────────────
-- Same posture as the Phase 1/2/3 SECURITY DEFINER functions: no anon/public execute.
revoke all on function public.invoice_create(uuid, numeric, numeric, date, date, text, text)        from public, anon;
revoke all on function public.invoice_update(uuid, numeric, numeric, date, text)                    from public, anon;
revoke all on function public.invoice_send(uuid, text)                                              from public, anon;
revoke all on function public.invoice_record_payment(uuid, numeric, date, public.payment_method, text, text) from public, anon;
revoke all on function public.invoice_void(uuid, text)                                              from public, anon;
revoke all on function public.invoice_delete(uuid, text)                                            from public, anon;
revoke all on function public.payment_reverse(uuid, text)                                           from public, anon;
revoke all on function public.invoice_add_note(uuid, text)                                          from public, anon;

grant execute on function public.invoice_create(uuid, numeric, numeric, date, date, text, text)        to authenticated;
grant execute on function public.invoice_update(uuid, numeric, numeric, date, text)                    to authenticated;
grant execute on function public.invoice_send(uuid, text)                                              to authenticated;
grant execute on function public.invoice_record_payment(uuid, numeric, date, public.payment_method, text, text) to authenticated;
grant execute on function public.invoice_void(uuid, text)                                              to authenticated;
grant execute on function public.invoice_delete(uuid, text)                                            to authenticated;
grant execute on function public.payment_reverse(uuid, text)                                           to authenticated;
grant execute on function public.invoice_add_note(uuid, text)                                          to authenticated;
