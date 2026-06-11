-- 0017_must_change_password.sql
-- Phase 4.5 / Slice C5 — secure temporary-password UX without SMTP: the manager
-- hands a temp password; the account is forced to set its own on first login
-- (and again after a manager reset). The flag is set by the server-only team
-- actions and cleared by the account-password server action (admin client,
-- after verifying the session user) — profiles has no self-UPDATE policy, so
-- users cannot clear it via the REST API.
-- ROLLBACK: alter table public.profiles drop column must_change_password;

alter table public.profiles
  add column must_change_password boolean not null default false;
