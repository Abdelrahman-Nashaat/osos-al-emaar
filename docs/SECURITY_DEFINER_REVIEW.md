# SECURITY DEFINER grant review — Osos Al-Emaar

> Phase 4.5 / Slice A (A8). Reviewed **individually** against the live project
> `anqrrhqjkmvaymvkdjtj`: every function below is `SECURITY DEFINER` with
> `search_path = ''`, and EXECUTE is granted to `{postgres, authenticated,
> service_role}` only — **anon/public revoked** (0002/0003, re-verified live).
> The Supabase advisor `authenticated_security_definer_function_executable`
> WARNs are **accepted against this review**: these functions are the app's only
> write path (tables are SELECT-only to clients), and each re-checks authority
> internally. Do **not** blanket-revoke authenticated EXECUTE — that would break
> the architecture, not harden it.

Volatility: `s` = stable, `v` = volatile. "0011" = hardened by
`supabase/migrations/0011_active_user_hardening.sql` (Phase 4.5).

| # | Function | What it does | Internal authority check | vol | Verdict |
|---|----------|--------------|--------------------------|-----|---------|
| 1 | `current_app_role()` | caller's own role | `id = auth.uid() AND is_active` | s | **KEEP** — the root is_active gate |
| 2 | `is_manager()` | role test | via `current_app_role()` | s | **KEEP** |
| 3 | `is_accountant()` | role test | via `current_app_role()` | s | **KEEP** |
| 4 | `can_view_financials()` | finance gate (manager+accountant) | `is_manager() OR is_accountant()` | s | **KEEP** — is_active-gated transitively |
| 5 | `has_perm(text)` | effective permission (override ?? role default) | `financials.view → can_view_financials()`; **0011 adds**: inactive caller ⇒ `false` for every key | s | **KEEP (hardened 0011)** — pre-0011 the override branch ignored `is_active` (finding S16) |
| 6 | `team_directory()` | id/full_name/role/is_active of all profiles (names only — never email/contact/money) | **0011 adds**: caller must have a non-null role (active) | s | **KEEP (hardened 0011)** |
| 7 | `task_create(...)` | the only way to create a task; forces progress 0 + status new/assigned | `has_perm('tasks.assign')` + project exists + assignee is active engineer | v | **KEEP** — healed transitively by #5 |
| 8 | `task_assign(...)` | assign/handoff; legal-transition + no-op guard (0009) | `has_perm('tasks.assign')` + active-engineer assignee | v | **KEEP** — healed transitively by #5 |
| 9 | `task_start(uuid)` | assigned → in_progress | assignee-or-assign-holder; **0011 adds** actor-active guard | v | **KEEP (hardened 0011)** |
| 10 | `task_set_progress(...)` | progress update | same as #9 (+ clamps 0..100) | v | **KEEP (hardened 0011)** |
| 11 | `task_submit(...)` | in_progress → submitted | **assignee only**; **0011 adds** actor-active guard | v | **KEEP (hardened 0011)** |
| 12 | `task_close(...)` | → closed (+audit) | `is_manager()` | v | **KEEP** |
| 13 | `task_reopen(...)` | reopen/return (+audit) | `is_manager()` | v | **KEEP** |
| 14 | `task_add_note(...)` | append note event | assignee-or-assign-holder; **0011 adds** actor-active guard | v | **KEEP (hardened 0011)** |
| 15 | `task_milestone(...)` | named milestone event | assignee-or-assign-holder; **0011 adds** actor-active guard | v | **KEEP (hardened 0011)** |
| 16 | `task_delete(...)` | delete task (+audit) | `is_manager()` | v | **KEEP** — grantable `tasks.delete` key stays inert by design |
| 17 | `invoice_create(...)` | only way to create an invoice; VAT ∈ {0,15}; assigns INV-number (+audit) | `can_view_financials()` | v | **KEEP** |
| 18 | `invoice_update(...)` | edit DRAFT only (+audit) | `can_view_financials()` + `status='draft'` | v | **KEEP** |
| 19 | `invoice_send(...)` | draft → sent (+audit) | `can_view_financials()` + state | v | **KEEP** |
| 20 | `invoice_record_payment(...)` | payment + atomic balance/status; overpayment rejected (+audit) | `can_view_financials()` + state | v | **KEEP** |
| 21 | `invoice_void(...)` | → void (+audit) | `is_manager()` + state; **0013 adds**: rejected while non-reversed payments exist (`has_live_payments`) | v | **KEEP (hardened 0013)** |
| 22 | `invoice_delete(...)` | delete empty DRAFT only (+audit) | `is_manager()` + draft/no-payments | v | **KEEP** |
| 23 | `payment_reverse(...)` | non-destructive reversal; recomputes balance (+audit) | `is_manager()` + not already reversed | v | **KEEP** |
| 24 | `invoice_add_note(...)` | تحصيل follow-up note event | `can_view_financials()` | v | **KEEP** |

## Non-RPC definer code

- `project_members_enforce_engineer()` (0012) — `BEFORE INSERT` trigger fn; not
  callable via the API (EXECUTE revoked from public/anon/authenticated).
  SECURITY DEFINER is required so the role/is_active lookup bypasses the
  caller's `profiles` RLS. **KEEP.**
- `set_updated_at()` — SECURITY **INVOKER** trigger fn (carries default PUBLIC
  EXECUTE; returns `trigger`, not callable via PostgREST). **ACCEPT.**
- `rls_auto_enable` event trigger fn — owner-only. **KEEP.**

## Standing rules

1. Any new SECURITY DEFINER function must: set `search_path = ''`, REVOKE
   public/anon, internally re-check authority **including `is_active`** (use
   `current_app_role() is null ⇒ deny` when the check is not already
   role-helper-based), and write `audit_log` for manager-grade actions.
2. Financial functions must gate on `can_view_financials()`/`is_manager()` only
   (never `has_perm` with a grantable key).
3. Re-run `get_advisors(security)` after every migration; the accepted baseline
   is exactly the WARN set documented here + the Free-plan leaked-password WARN
   (gate-pending, see `docs/plans/we-are-starting-phase-streamed-hollerith.md`).
