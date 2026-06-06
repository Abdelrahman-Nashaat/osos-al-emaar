# Engineering Office App — Master Plan & Claude Code Setup

> Status: **Approved.** Build runs as **vertical slices**, one phase at a time, each phase approved before the next. **Execution now: Phase 0 only, then stop and show results before Phase 1.**
> Brand: **شركة أسس الإعمار المتقدمة** — kept in one config constant (`lib/config/brand.ts`).
> Chat language: replies in **English**; operator writes in Arabic. **App UI is Arabic-first, RTL, mobile-first.**
> Currency: **SAR** (currency field kept for future international use).

### Approved amendments (operator — locked before execution)
1. **Financials are manager + accountant ONLY in v1.** Engineers **never** see amounts — even with extra permissions. Grantable engineer permissions cover **projects/tasks only**, never `financials.view`. `financials.view` is not part of the override system.
2. **`service_role` is never used in the Next.js client.** Every admin / manager-created-account action runs in a **server-only route / server action / Edge Function** and writes to `audit_log`.
3. **Phase 0** does only: repo scaffold + env validation + Supabase connection check + **Vercel preview deploy** — no real data.
4. **After every phase:** typecheck → lint → Playwright smoke/E2E → `/security-audit` → `/ui-review` (if UI).
5. **Google Calendar** stays deferred to **Phase 7**. Keep only `due_at` now (sufficient); create `task_calendar_links` in Phase 7 (avoids needless complexity).

---

## Context — why this plan exists

Eng. Hamza Al-Hemyari runs an engineering consulting office in Dammam and tracks ~30–40 jobs in his head. He wants one shared workspace where the **general manager** assigns work, **engineers** update progress, and an **accountant** handles invoices/collections/payments. He prototyped it twice in Claude.ai chat (both shared conversations read in full via Playwright). The prototypes were `localStorage`-only and broke on real use — those failures define the production requirements.

This plan operationalizes `CLAUDE.md` and validates/refines the scaffold a prior agent (Codex) created in `.claude/` and `docs/`.

### Hard requirements pulled directly from Hamza's chats (nothing dropped)
- **Mobile-first, Arabic RTL**, installable **PWA**, opened from the browser; real shared backend (not localStorage); **multi-device simultaneous use**.
- **3 roles, login, manager grants access & permissions.** Permission matrix he confirmed verbatim:

  | Module | Manager | Engineer | Accountant |
  |---|---|---|---|
  | Projects | view + edit | view all (+add if granted) | ❌ |
  | Tasks | assign + delete | all tasks w/ filters + update progress | ❌ |
  | Clients | full | ❌ | view only |
  | **Amounts & invoices** | ✅ numbers | ❌ **never (hidden)** | ✅ numbers |
  | Financial reports | ✅ | ❌ | ✅ |
  | Team | full | ❌ | ❌ |

- **Engineer view (his words):** sees **all** tasks with filters (الكل / مهامي / عاجلة / غير مكتملة / مكتملة), a **"مهمتي"** badge on his own, updates status/progress, adds notes; **amounts fully hidden**; may be granted add/edit of projects and add/assign tasks (**operations only**).
- **Task lifecycle he described:** manager enters a quick task → assigns an engineer → engineer **receives → works → marks done** → manager **reviews & closes**. Tasks **move between engineers** (civil / architectural / structural), tracking **"اتقلت لوين"**, with milestones like **"أصدرنا الرخصة" (license issued)**, then close. **Never an "unknown" task/owner/project state.**
- **Dashboard:** revenue (manager/accountant only), ongoing projects, today's/urgent/**overdue** tasks, team activity.
- **Projects:** status, progress bar, dates, client, notes, **budget/cost hidden** from engineers.
- **Clients:** contact/company, **country** (global-ready), linked projects, financial totals for authorized roles only.
- **Invoices/payments:** paid / pending / **overdue**, **collections follow-up (تحصيل)**, **register payment**, accounting **reports**.
- **Team:** roles, permissions, active projects, task load.
- **Portfolio (معرض الأعمال):** visual grid of completed projects.
- **Offers/contracts (العروض والعقود):** requests, proposals, agreement tracking.
- **Real dates** (date pickers) → **automatic overdue detection** (overdue in **red**).
- **Toast notifications**; **urgent-task notifications**; **PDF** reports; **search/filter** past ~30 records; **export/backup**; real auth.
- **No Supabase setup screen** — config lives only in Vercel env vars.
- **Out of scope:** the soil-lab app ("جهود برو") — keep architecture reusable for it later.

### Locked decisions (operator)
- Build **all modules** in v1. Currency **SAR**. Accounts: **manager sets email + password and hands them to staff** (server-only).
- **Amounts:** manager + accountant **only**; engineers never see them (Amendment 1).
- **Flexible RBAC** for operations: manager edits **default permissions per role** *and* overrides permissions for **any individual** — but `financials.view` is excluded (Amendment 1).
- **Execution = vertical slices**, plan-and-approve per phase. **Google Calendar deferred to Phase 7**; keep `due_at` now.
- Infra already exists → **reuse** the operator's Supabase project, GitHub repo, Vercel project.

---

## Part A — Claude Code setup (validated June 2026 + refinements)

Codex's setup is solid and current. Keep it; add the items marked **NEW**.

- **MCP (`.mcp.json`):** `playwright`, `supabase`, `github`, `vercel` + plugin MCPs `context7` (live docs), `figma`.
- **Plugins:** `superpowers`, `feature-dev`, `frontend-design`, `code-review`, `pr-review-toolkit`, `security-guidance`, `typescript-lsp`, `context7-plugin`, `commit-commands`.
- **Model/effort:** `opus[1m]` + high effort for schema/RLS/security.
- **Commands/agents:** `/plan-app`, `/build-slice`, `/security-audit`, `/ui-review`, `/handoff-report`; subagents `product-architect`, `supabase-security-reviewer`, `frontend-rtl-reviewer`, `qa-e2e-tester`.

**Mental model:** `CLAUDE.md` = always-on rules · Skills = on-demand · **Subagents = context isolation** · **Hooks = deterministic enforcement** · MCP = integrations.

**NEW (value-add):**
1. **Secret-guard hook** (PreToolUse/Bash+git): block staging/committing `.env*` or any `service_role` JWT string.
2. **Post-edit typecheck hook** (PostToolUse on `*.ts`/`*.tsx`): `tsc --noEmit` + ESLint.
3. **Reviews via subagents** after each slice: `supabase-security-reviewer` → `frontend-rtl-reviewer` → `qa-e2e-tester` / `pr-review-toolkit`.
4. **New skills when building** (operator OK'd): `task-lifecycle`, `rbac-permissions`, `pdf-reports`, `backup-export` (and later `calendar-sync`).
5. **Note:** `settings.local.json` runs `bypassPermissions`; secret-guard hook + destructive-command `deny` list are load-bearing.

---

## Part B — Architecture

**Stack:** Next.js App Router + TypeScript · Tailwind + shadcn/ui (first-class RTL since Jan 2026) · Supabase (Auth, Postgres, Storage, Realtime, RLS) · Vercel · Playwright. Arabic font Cairo/Noto Naskh. PWA via `manifest.ts` + Serwist. **Mobile-first** throughout.

```
app/(auth)/login                       # env-config only — NO setup screen
app/(app)/dashboard|projects|tasks|clients|invoices|team|portfolio|offers|settings/permissions
  layout.tsx                           # <html lang="ar" dir="rtl"> + role-gated shell
lib/supabase/{client,server}.ts        # browser · server(cookies)
lib/supabase/admin.ts                  # service-role, SERVER-ONLY — never imported by client components
lib/auth/permissions.ts                # effective-permission resolver (override ?? role default), excludes financials.view
lib/env.ts                             # env validation (fail fast if misconfigured)
lib/config/brand.ts                    # app name / brand in one place
supabase/migrations/                   # ordered schema + RLS
e2e/                                   # Playwright
```

### Two pillars: financial isolation & flexible RBAC

**Financial isolation (engineers can't see money — DB-enforced, hard-locked):** keep money out of operational tables.
- Operational (engineer-readable): `profiles`, `clients` (no totals), `projects` (status/progress/dates/client_id — **no cost columns**), `project_members`, `tasks`, `task_events`, `portfolio_items`, `offers`.
- Financial (**manager + accountant only**): `project_financials`, `invoices`, `payments`, financial report views.

**Flexible RBAC (operations only):**
- `profiles`: id=auth.uid, full_name, email, **role** `manager|engineer|accountant`, is_active.
- `role_permissions` (role, permission_key, allowed) — editable defaults per role.
- `user_permission_overrides` (user_id, permission_key, allowed) — per-individual override. **Grantable keys = `projects.*` / `tasks.*` only.**
- **Effective permission = override ?? role default.** `financials.view` is **not grantable** and is bound to role (manager/accountant).
- SQL `SECURITY DEFINER` helpers: `has_perm(key)`, `is_manager()`, `is_accountant()`, **`can_view_financials()` = `is_manager() OR is_accountant()`** (no override path). Use `(select auth.uid())`; index role/permission columns. **RLS on every table — no exceptions.** Financial tables RLS = `USING (can_view_financials())`. Verify financial tables aren't in an engineer-visible Realtime publication; portfolio Storage bucket gets explicit policies.

**Task lifecycle:** `tasks` (status `new|assigned|in_progress|submitted|closed`, priority, **`due_at` timestamptz**, progress, current_assignee_id, project_id, client_id, optional `license_issued` flag); `task_events` (append-only history: assignment/handoff/status/notes + actor + timestamp) → "moved to where", audit, no unknown states. Manager performs final close. `due_at` alone makes Phase 7 Google Calendar a drop-in.

**Accounts & audit (Amendment 2):** manager creates users (email+password) via a **server action / Edge Function using the service-role key (server-only)** — the `admin` client is never imported into client components. `audit_log` records payments, permission changes, and account creation.

### Arabic RTL / mobile-first UI
`<html lang="ar" dir="rtl">`, Tailwind logical properties, shadcn RTL, mobile-first (bottom-nav on phones / sidebar on desktop), real **date pickers**, **toasts**, **overdue = red**, global **search + filter**, explicit **empty / loading / error / permission-denied** states. Dense business UI, no marketing pages.

---

## Part C — Build sequence (vertical slices; each = DB/RLS → backend → Arabic RTL UI → tests → security review)

- **Phase 0 — Foundation (THIS run):** repo scaffold (Next.js+TS+Tailwind+shadcn+RTL+mobile-first+PWA shell), Supabase browser/server clients, `lib/env.ts` **env validation**, a **Supabase connection check**, brand config, wire existing infra, **Vercel preview deploy**. **No real data.** Then stop and show results.
- **Phase 1 — Identity & RBAC (security backbone):** `profiles` + `role_permissions` + `user_permission_overrides` + RLS + helpers; Supabase Auth; manager-creates-accounts (server-only + audit); login; role-gated shell; permissions admin UI (role defaults + per-user overrides, financials excluded); tests; security review.
- **Phase 2 — Clients & Projects:** `clients`(country) + `projects`(operational) + **`project_financials`(isolated)** + RLS; manager/accountant UIs; engineer read (no money); test **engineer-JWT cannot read `project_financials`**; security review.
- **Phase 3 — Tasks & lifecycle:** `tasks` + `task_events` + RLS; manager assign/close; engineer all-tasks+filters+"مهمتي"+progress+notes; **handoffs between engineers** + license milestone; **overdue (red)**; dashboard task widgets; tests; security review.
- **Phase 4 — Finance:** `invoices` + `payments` + RLS (manager+accountant only); accountant UIs; register payment; **collections follow-up**; overdue invoices; **reports + PDF**; dashboard **revenue** (authorized only); test engineer can't see; security review.
- **Phase 5 — Portfolio & Offers/Contracts:** `portfolio_items`(+Storage policies) + `offers`/contracts + RLS; Arabic RTL UIs; tests; security review.
- **Phase 6 — Cross-cutting & hardening:** global search/filter, **export/backup**, Realtime multi-device verification, urgent/overdue **notifications**, PWA install polish, accessibility, full `/ui-review` + `/security-audit` + full Playwright E2E + **Vercel production**.
- **Phase 7 — Google Calendar (deferred):** per-user OAuth, push `due_at` events with reminders; add `task_calendar_links(task_id, provider, external_event_id)` here.

---

## Part D — Per-phase gate (Amendment 4), applied to every slice
Run before declaring a phase done: **`tsc --noEmit` → ESLint → Playwright smoke/E2E → `/security-audit` → `/ui-review` (if the phase has UI).** Plus, each slice: re-run `mcp__supabase__get_advisors` for RLS gaps.

**Make-or-break test (from Phase 2 on):** an **engineer JWT querying `invoices`/`payments`/`project_financials` returns 0 rows** — UI hiding *and* DB enforcement.

**Security checklist:** RLS on every table; financial isolation proven by the engineer-JWT test; **no `service_role` in any `NEXT_PUBLIC_*`/client bundle**; secrets absent from git (+ secret-guard hook); real auth; Storage + Realtime policies; `audit_log` for payments/permission changes/account creation; basic rate limiting on auth/forms.

**Deployment (infra exists):** link existing GitHub repo to existing Vercel project; env in Vercel — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public) and `SUPABASE_SERVICE_ROLE_KEY` **server-only**; preview → verify → promote to prod. No setup screen anywhere.

---

## Phase 0 — concrete steps (this run, then stop)
1. Scaffold Next.js (App Router, TS, Tailwind, ESLint) + shadcn/ui with RTL; set `<html lang="ar" dir="rtl">`, Arabic font, mobile-first base layout.
2. PWA shell: `app/manifest.ts` + service worker (Serwist), installable, offline app shell.
3. Supabase clients: `lib/supabase/client.ts` (browser) + `lib/supabase/server.ts` (cookies). **No `admin.ts` usage yet.**
4. `lib/env.ts`: validate required env vars (fail fast) + `.env.example` (no secrets); `lib/config/brand.ts` with the app name.
5. **Supabase connection check:** a tiny server-side health check that confirms the URL/anon key reach the project (no tables/data).
6. Wire the existing GitHub repo + Vercel project; set env vars in Vercel; **preview deploy**; confirm the preview URL renders the Arabic RTL shell.
7. Gate: `tsc --noEmit` + ESLint + a Playwright smoke test (app shell loads, `dir="rtl"`). **No `/security-audit`/`/ui-review` depth yet — minimal for Phase 0.** Then **stop and report** before Phase 1.

## Open questions to confirm with the client (non-blocking) — WhatsApp
1. Exact legal spelling + logo/brand colors for «أسس الإعمار المتقدمة».
2. Notification channels for urgent/overdue — in-app only for v1, or email/WhatsApp later?
3. Offers/contracts fields (request → proposal → agreement) and portfolio fields (cover image, scope, year) — minimal v1 set?
4. Any existing client/project/invoice data to import for day one?
