-- 0018_office_settings.sql
-- Product-completion phase, Slice 1 — «إعدادات المكتب» (office identity).
-- One singleton row holds the office letterhead data used by printable invoices
-- and quotations: legal name, CR number (السجل التجاري), optional VAT number
-- (الرقم الضريبي — null means NOT VAT-registered → prints say «فاتورة», never
-- «فاتورة ضريبية», and no ZATCA QR is rendered), contact lines and a footer note.
-- This is letterhead/identity data, NOT financial data: every active staff member
-- may read it (the app header and prints need it); only the manager writes.
-- A new manager-only, non-grantable key `settings.manage` gates the UI; the
-- 0001 CHECK on user_permission_overrides (projects.%/tasks.% only) already
-- guarantees it can never be granted per-user.

create table public.office_settings (
  -- Singleton: the primary key is a constant; a second row is impossible.
  id             boolean primary key default true check (id),
  office_name    text not null,
  office_name_en text,
  cr_number      text,
  vat_number     text,
  address        text,
  city           text,
  phone          text,
  email          text,
  website        text,
  invoice_footer text,
  updated_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger office_settings_set_updated_at
before update on public.office_settings
for each row execute function public.set_updated_at();

alter table public.office_settings enable row level security;

-- Read: any ACTIVE signed-in staff member (current_app_role() is null for
-- deactivated accounts, so they read nothing).
create policy office_settings_select on public.office_settings
  for select to authenticated
  using (public.current_app_role() is not null);

-- Write: manager only. The server action records audit_log entries.
create policy office_settings_insert on public.office_settings
  for insert to authenticated
  with check (public.is_manager());

create policy office_settings_update on public.office_settings
  for update to authenticated
  using (public.is_manager())
  with check (public.is_manager());

-- Seed the singleton with the confirmed brand so prints work before the
-- manager ever opens the settings page.
insert into public.office_settings (id, office_name, office_name_en, city)
values (true, 'شركة أسس الإعمار المتقدمة', 'Osos Al-Emaar Advanced Company', 'الدمام');

-- Permission catalog: settings.manage (manager-only, role-bound).
insert into public.role_permissions (role, permission_key, allowed) values
  ('manager',    'settings.manage', true),
  ('engineer',   'settings.manage', false),
  ('accountant', 'settings.manage', false)
on conflict (role, permission_key) do nothing;
