-- 0019_offers.sql
-- Product-completion phase, Slice 3 — «عروض الأسعار» (quotations/contract pipeline).
-- Hamza picked «طلبات العروض والعقود» himself in the original chat. An offer is a
-- priced quotation: client + scope + amount + validity, with the lifecycle
--   draft → sent → accepted | rejected | expired
-- and a one-click conversion of an ACCEPTED offer into a project whose
-- project_financials.contract_value is the offer total (atomic).
--
-- Offers carry amounts by nature → they are a FINANCIAL module under the locked
-- rule «المبالغ تكون مخفية ما تظهر إلا للمحاسب والمدير»:
--   • offers + offer_events RLS SELECT = can_view_financials() (engineer JWT: 0 rows);
--   • all writes flow through SECURITY DEFINER functions only (no write policies);
--   • the engineer role default offers.view is flipped to FALSE below — the old
--     Phase-0 seed predated the decision that offers hold amounts inline. The
--     0001 CHECK (projects.%/tasks.% only) already blocks per-user grants.
-- Authority inside functions: create/update/send/accept/reject/expire require
-- has_perm('offers.edit') (manager by default; accountant stays view-only);
-- delete (draft only) and convert-to-project are manager checks like invoices.

create type public.offer_status as enum (
  'draft', 'sent', 'accepted', 'rejected', 'expired'
);
create type public.offer_event_type as enum (
  'created', 'updated', 'sent', 'accepted', 'rejected', 'expired', 'note', 'converted'
);

create sequence public.offer_number_seq;

create table public.offers (
  id           uuid primary key default gen_random_uuid(),
  offer_number text not null unique,
  client_id    uuid not null references public.clients (id) on delete restrict,
  title        text not null,
  scope        text,
  status       public.offer_status not null default 'draft',
  issue_date   date not null default current_date,
  valid_until  date,
  subtotal     numeric(14, 2) not null check (subtotal > 0),
  vat_rate     numeric(5, 2)  not null default 0 check (vat_rate in (0, 15)),
  vat_amount   numeric(14, 2) not null default 0,
  total        numeric(14, 2) not null,
  currency     text not null default 'SAR',
  notes        text,
  project_id   uuid references public.projects (id) on delete set null,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index offers_client_idx  on public.offers (client_id);
create index offers_status_idx  on public.offers (status);
create index offers_project_idx on public.offers (project_id);

create table public.offer_events (
  id          bigint generated always as identity primary key,
  offer_id    uuid not null references public.offers (id) on delete cascade,
  actor_id    uuid references public.profiles (id) on delete set null,
  event_type  public.offer_event_type not null,
  from_status public.offer_status,
  to_status   public.offer_status,
  amount      numeric(14, 2),
  note        text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index offer_events_offer_idx on public.offer_events (offer_id, created_at desc);

create trigger offers_set_updated_at
before update on public.offers
for each row execute function public.set_updated_at();

alter table public.offers       enable row level security;
alter table public.offer_events enable row level security;

-- FINANCIAL read gate; no write policies (SECURITY DEFINER functions only).
create policy offers_select on public.offers
  for select to authenticated
  using (public.can_view_financials());

create policy offer_events_select on public.offer_events
  for select to authenticated
  using (public.can_view_financials());

-- ───────────────────────── Lifecycle functions ─────────────────────────

-- offer_create — offers.edit holders (manager by default). Returns the offer id.
create or replace function public.offer_create(
  p_client      uuid,
  p_title       text,
  p_subtotal    numeric,
  p_vat_rate    numeric default 0,
  p_valid_until date default null,
  p_scope       text default null,
  p_note        text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid := (select auth.uid());
  v_vat_amt numeric(14,2);
  v_total   numeric(14,2);
  v_number  text;
  v_offer   uuid;
begin
  if not (public.can_view_financials() and public.has_perm('offers.edit')) then
    raise exception 'not_authorized';
  end if;
  if p_title is null or length(btrim(p_title)) < 2 then raise exception 'invalid_title'; end if;
  if p_subtotal is null or p_subtotal <= 0 then raise exception 'invalid_subtotal'; end if;
  if coalesce(p_vat_rate, 0) not in (0, 15) then raise exception 'invalid_vat_rate'; end if;
  if not exists (select 1 from public.clients where id = p_client) then
    raise exception 'invalid_client';
  end if;

  v_vat_amt := round(p_subtotal * coalesce(p_vat_rate, 0) / 100, 2);
  v_total   := p_subtotal + v_vat_amt;
  v_number  := 'OFR-' || lpad(nextval('public.offer_number_seq')::text, 5, '0');

  insert into public.offers (
    offer_number, client_id, title, scope, status, valid_until,
    subtotal, vat_rate, vat_amount, total, notes, created_by
  ) values (
    v_number, p_client, btrim(p_title), p_scope, 'draft', p_valid_until,
    p_subtotal, coalesce(p_vat_rate, 0), v_vat_amt, v_total, p_note, v_actor
  )
  returning id into v_offer;

  insert into public.offer_events (offer_id, actor_id, event_type, to_status, amount, note)
  values (v_offer, v_actor, 'created', 'draft', v_total, p_note);

  insert into public.audit_log (actor_id, action, target_type, target_id, metadata)
  values (v_actor, 'offers.create', 'offer', v_offer::text,
          jsonb_build_object('number', v_number, 'total', v_total));

  return v_offer;
end;
$$;

-- offer_update — DRAFT only. offers.edit.
create or replace function public.offer_update(
  p_offer       uuid,
  p_title       text,
  p_subtotal    numeric,
  p_vat_rate    numeric default 0,
  p_valid_until date default null,
  p_scope       text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid := (select auth.uid());
  v_status  public.offer_status;
  v_vat_amt numeric(14,2);
  v_total   numeric(14,2);
begin
  if not (public.can_view_financials() and public.has_perm('offers.edit')) then
    raise exception 'not_authorized';
  end if;
  if p_title is null or length(btrim(p_title)) < 2 then raise exception 'invalid_title'; end if;
  if p_subtotal is null or p_subtotal <= 0 then raise exception 'invalid_subtotal'; end if;
  if coalesce(p_vat_rate, 0) not in (0, 15) then raise exception 'invalid_vat_rate'; end if;

  select status into v_status from public.offers where id = p_offer;
  if not found then raise exception 'offer_not_found'; end if;
  if v_status <> 'draft' then raise exception 'not_draft'; end if;

  v_vat_amt := round(p_subtotal * coalesce(p_vat_rate, 0) / 100, 2);
  v_total   := p_subtotal + v_vat_amt;

  update public.offers set
    title       = btrim(p_title),
    scope       = p_scope,
    valid_until = p_valid_until,
    subtotal    = p_subtotal,
    vat_rate    = coalesce(p_vat_rate, 0),
    vat_amount  = v_vat_amt,
    total       = v_total
  where id = p_offer;

  insert into public.offer_events (offer_id, actor_id, event_type, amount)
  values (p_offer, v_actor, 'updated', v_total);

  insert into public.audit_log (actor_id, action, target_type, target_id, metadata)
  values (v_actor, 'offers.update', 'offer', p_offer::text,
          jsonb_build_object('total', v_total));
end;
$$;

-- Shared transition body for send/accept/reject/expire.
create or replace function public.offer_transition(
  p_offer uuid,
  p_to    public.offer_status,
  p_note  text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_status public.offer_status;
  v_event  public.offer_event_type;
begin
  if not (public.can_view_financials() and public.has_perm('offers.edit')) then
    raise exception 'not_authorized';
  end if;

  select status into v_status from public.offers where id = p_offer;
  if not found then raise exception 'offer_not_found'; end if;

  -- Legal transitions only: draft→sent; sent→accepted/rejected/expired.
  if p_to = 'sent' then
    if v_status <> 'draft' then raise exception 'illegal_state'; end if;
    v_event := 'sent';
  elsif p_to in ('accepted', 'rejected', 'expired') then
    if v_status <> 'sent' then raise exception 'illegal_state'; end if;
    v_event := p_to::text::public.offer_event_type;
  else
    raise exception 'illegal_state';
  end if;

  update public.offers set status = p_to where id = p_offer;

  insert into public.offer_events (offer_id, actor_id, event_type, from_status, to_status, note)
  values (p_offer, v_actor, v_event, v_status, p_to, p_note);

  insert into public.audit_log (actor_id, action, target_type, target_id, metadata)
  values (v_actor, 'offers.' || p_to::text, 'offer', p_offer::text, '{}'::jsonb);
end;
$$;

-- offer_delete — MANAGER ONLY, drafts only (sent/decided offers are history).
create or replace function public.offer_delete(p_offer uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_status public.offer_status;
  v_number text;
begin
  if not public.is_manager() then raise exception 'not_authorized'; end if;

  select status, offer_number into v_status, v_number from public.offers where id = p_offer;
  if not found then raise exception 'offer_not_found'; end if;
  if v_status <> 'draft' then raise exception 'not_draft'; end if;

  delete from public.offers where id = p_offer;  -- events cascade away

  insert into public.audit_log (actor_id, action, target_type, target_id, metadata)
  values (v_actor, 'offers.delete', 'offer', p_offer::text,
          jsonb_build_object('number', v_number, 'note', p_note));
end;
$$;

-- offer_add_note — follow-up note; manager + accountant (no state change).
create or replace function public.offer_add_note(p_offer uuid, p_note text)
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
  if not exists (select 1 from public.offers where id = p_offer) then
    raise exception 'offer_not_found';
  end if;

  insert into public.offer_events (offer_id, actor_id, event_type, note)
  values (p_offer, v_actor, 'note', btrim(p_note));
end;
$$;

-- offer_convert_to_project — MANAGER ONLY. accepted + not yet converted.
-- Creates the project, copies the client, writes project_financials with
-- contract_value = offer total, links the offer — one transaction.
create or replace function public.offer_convert_to_project(
  p_offer      uuid,
  p_name       text default null,
  p_start_date date default null,
  p_due_date   date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid := (select auth.uid());
  v_offer   public.offers%rowtype;
  v_project uuid;
begin
  if not public.is_manager() then raise exception 'not_authorized'; end if;

  select * into v_offer from public.offers where id = p_offer;
  if not found then raise exception 'offer_not_found'; end if;
  if v_offer.status <> 'accepted' then raise exception 'illegal_state'; end if;
  if v_offer.project_id is not null then raise exception 'already_converted'; end if;
  if p_due_date is not null and p_start_date is not null and p_due_date < p_start_date then
    raise exception 'invalid_dates';
  end if;

  insert into public.projects (name, client_id, status, progress, start_date, due_date, description, created_by)
  values (
    coalesce(nullif(btrim(coalesce(p_name, '')), ''), v_offer.title),
    v_offer.client_id, 'planning', 0, p_start_date, p_due_date,
    v_offer.scope, v_actor
  )
  returning id into v_project;

  insert into public.project_financials (project_id, contract_value, currency, notes, updated_by)
  values (v_project, v_offer.total, v_offer.currency,
          'من عرض السعر ' || v_offer.offer_number, v_actor);

  update public.offers set project_id = v_project where id = p_offer;

  insert into public.offer_events (offer_id, actor_id, event_type, note, metadata)
  values (p_offer, v_actor, 'converted', null,
          jsonb_build_object('project_id', v_project));

  insert into public.audit_log (actor_id, action, target_type, target_id, metadata)
  values (v_actor, 'offers.convert', 'offer', p_offer::text,
          jsonb_build_object('project_id', v_project, 'contract_value', v_offer.total));

  return v_project;
end;
$$;

-- ───────────────────────── Execute grants ─────────────────────────
revoke all on function public.offer_create(uuid, text, numeric, numeric, date, text, text) from public, anon;
revoke all on function public.offer_update(uuid, text, numeric, numeric, date, text)       from public, anon;
revoke all on function public.offer_transition(uuid, public.offer_status, text)            from public, anon;
revoke all on function public.offer_delete(uuid, text)                                     from public, anon;
revoke all on function public.offer_add_note(uuid, text)                                   from public, anon;
revoke all on function public.offer_convert_to_project(uuid, text, date, date)             from public, anon;

grant execute on function public.offer_create(uuid, text, numeric, numeric, date, text, text) to authenticated;
grant execute on function public.offer_update(uuid, text, numeric, numeric, date, text)       to authenticated;
grant execute on function public.offer_transition(uuid, public.offer_status, text)            to authenticated;
grant execute on function public.offer_delete(uuid, text)                                     to authenticated;
grant execute on function public.offer_add_note(uuid, text)                                   to authenticated;
grant execute on function public.offer_convert_to_project(uuid, text, date, date)             to authenticated;

-- ─────────── Engineer role default: offers are financial ───────────
-- The Phase-0 seed gave engineers offers.view=true before offers were designed.
-- Offers hold amounts inline, so the engineer default flips to false (role
-- defaults remain manager-editable in the UI, but the RLS gate above is
-- can_view_financials() regardless — this flip keeps nav/UI honest).
update public.role_permissions
set allowed = false
where role = 'engineer' and permission_key = 'offers.view';
