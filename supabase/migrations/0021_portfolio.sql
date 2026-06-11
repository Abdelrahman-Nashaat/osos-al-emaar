-- 0021_portfolio.sql
-- Product-completion phase, Slice 4 — «معرض الأعمال» (portfolio of completed work).
-- Hamza picked this module himself. Operational showcase data — NO amounts ever.
-- Items can link back to a project (optional) and carry gallery images through
-- the Slice-2 attachments infra (entity_type 'portfolio'). All staff can view
-- published items; portfolio.edit (manager by default) curates, and unpublished
-- drafts are visible to editors only.

create table public.portfolio_items (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  category    text,
  city        text,
  year        integer check (year between 1980 and 2100),
  project_id  uuid references public.projects (id) on delete set null,
  cover_path  text,
  is_published boolean not null default true,
  sort_order  integer not null default 0,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index portfolio_items_order_idx on public.portfolio_items (is_published, sort_order, year desc);

create trigger portfolio_items_set_updated_at
before update on public.portfolio_items
for each row execute function public.set_updated_at();

alter table public.portfolio_items enable row level security;

create policy portfolio_select on public.portfolio_items
  for select to authenticated
  using (
    public.has_perm('portfolio.view')
    and (is_published or public.has_perm('portfolio.edit'))
  );

create policy portfolio_insert on public.portfolio_items
  for insert to authenticated
  with check (public.has_perm('portfolio.edit'));

create policy portfolio_update on public.portfolio_items
  for update to authenticated
  using (public.has_perm('portfolio.edit'))
  with check (public.has_perm('portfolio.edit'));

create policy portfolio_delete on public.portfolio_items
  for delete to authenticated
  using (public.has_perm('portfolio.edit'));
