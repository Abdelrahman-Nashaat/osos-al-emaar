# Engineering Office App — Master Plan & Claude Code Setup

> Status: **Phases 0, 1, 1.5 complete & deployed.** Phase 0 (scaffold + Arabic RTL + PWA + Supabase clients); Phase 1 (Identity & RBAC — RLS on all tables, financials hard-locked, team + permissions admin, `audit_log`, bootstrap manager); Phase 1.5 (post-`/ui-review` RTL/mobile fixes). Pushed to GitHub `Abdelrahman-Nashaat/osos-al-emaar`; **production live at `osos-al-emaar.vercel.app`** (`vercel.json` pins `framework:nextjs`; Deployment Protection ON). **Current step:** Phase 2 (Clients & Projects) **built + reviewed + gated** — migrations 0004–0007 (clients/projects/`project_financials`/project_members + a names-only `team_directory()`); financial isolation proven by the engineer-JWT e2e; gate green (tsc/eslint/vitest 12/Playwright 11/advisors no-ERROR); security + RTL reviews done, serious findings fixed. Deploying to production. **Phase 3 (Tasks & lifecycle) not started — awaiting approval.** Build runs as vertical slices, one phase at a time.
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

## Phase 1 — Detailed Build Plan (Identity & RBAC) — *code only after approval*

**Goal:** real auth + role-gated access + flexible RBAC, enforced at the **DB layer (RLS)**. Manager-creates-account is **server-only**. No financial tables yet (Phase 2), but the RBAC backbone — including the hard block on engineers ever seeing money — is locked here.

**Prereqs (operator):** `SUPABASE_SERVICE_ROLE_KEY` ✓ set + verified (local + Vercel). Before the bootstrap step, set `BOOTSTRAP_ADMIN_EMAIL/PASSWORD/NAME` in `.env.local` (never in chat); remove them after first run.

**Execution constraints (operator, locked):**
1. Before any preview redeploy, ensure `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` exist in **both Preview and Production** on Vercel (verify presence only, never print values).
2. Bootstrap creds (`BOOTSTRAP_ADMIN_EMAIL/PASSWORD/NAME`) live in `.env.local` **only** (never chat); verify presence only; **remove them from `.env.local` after a successful bootstrap**.
3. The next commit includes this plan update + the `.gitignore` change; **never commit `.env.local`**.
4. **Stop after the Phase 1 gate/report. Do not start Phase 2.**

### 1. DB migration — `supabase/migrations/0001_identity_rbac.sql`
- `create type app_role as enum ('manager','engineer','accountant');`
- **Tables:** `profiles`(id→auth.users, full_name, email, role app_role, is_active, timestamps) · `role_permissions`(role, permission_key, allowed, PK(role,key)) · `user_permission_overrides`(user_id→profiles, permission_key, allowed, PK) **+ CHECK (permission_key LIKE 'projects.%' OR LIKE 'tasks.%')** — the DB-level guarantee engineers can never be granted `financials.view` (Amendment 1) · `audit_log`(id, actor_id, action, target_type, target_id, metadata jsonb, created_at). Indexes on role / user_id / created_at.
- **Permission catalog** (seed `role_permissions`): `projects.view/edit` · `tasks.view/assign/delete` · `clients.view/edit` · `financials.view` · `team.manage` · `permissions.manage` · `portfolio.view/edit` · `offers.view/edit`. Defaults match Hamza's matrix (manager=all; engineer=projects.view,tasks.view,portfolio.view,offers.view; accountant=clients.view,financials.view,portfolio.view,offers.view). Manager edits these later via UI.
- **Helpers** (`SECURITY DEFINER`, fixed `search_path`, `stable`): `current_app_role()`, `is_manager()`, `is_accountant()`, `can_view_financials() = is_manager() OR is_accountant()` (role-only), `has_perm(key) = coalesce(override, role default, false)` with `financials.view` always routed to `can_view_financials()`.
- **RLS (enabled on all 4 tables):** profiles → SELECT self|manager; UPDATE self(name only)|manager(all, `WITH CHECK` blocks role escalation); INSERT manager. role_permissions → SELECT any authed; write manager. user_permission_overrides → SELECT self|manager; write manager (CHECK blocks financials). audit_log → SELECT manager; INSERT via admin client only.
- Apply via Supabase MCP `apply_migration` to `anqrrhqjkmvaymvkdjtj`; run `get_advisors` (expect no RLS gaps); `generate_typescript_types` → `lib/supabase/database.types.ts`.

### 2. Auth & server-only admin
- `lib/supabase/admin.ts` — `import "server-only"`; `createAdminClient()` via `getServiceRoleKey()` (reuse `lib/env.ts`); no session persistence; used ONLY in server actions.
- `middleware.ts` — @supabase/ssr session refresh; protect `/(app)/*` (→ `/login` if no session); `/login` → `/dashboard` if authed.
- `app/(auth)/login/{page.tsx,actions.ts}` — Arabic RTL email+password form; `signInWithPassword`; Arabic errors. `app/(auth)/layout.tsx` centered. Logout server action.

### 3. Effective permissions — `lib/auth/permissions.ts`
Catalog + `GRANTABLE_KEYS` (projects.*/tasks.*); `getSessionProfile()`, `getEffectivePermissions(id)` (override ?? role default; financials.view = role-only), `can(perms,key)`, `requirePermission(key)` (server guard). Client: `components/auth/permissions-provider.tsx` + `usePermissions()` for **cosmetic** UI gating (RLS is the real gate).

### 4. Role-gated shell & pages
- `app/(app)/layout.tsx` (server) → session+profile or redirect; compute perms; render `components/app-shell.tsx` (client, RTL, sidebar desktop / bottom-nav mobile, nav filtered by perms, user menu + logout).
- `app/(app)/dashboard/page.tsx` — Arabic greeting + role (widgets later). `components/permission-denied.tsx`. `app/page.tsx` → redirect `/dashboard`.
- **Team (manager-only)** `app/(app)/team/{page.tsx,actions.ts}` — list members; `createTeamMember()` server action: verify is_manager → admin `auth.admin.createUser({email_confirm:true})` → insert profile → audit. Change-role / deactivate (audited).
- **Permissions admin (manager-only)** `app/(app)/settings/permissions/{page.tsx,actions.ts}` — edit role defaults (roles×keys matrix) + per-user overrides (grantable keys only; financials.view hidden/disabled). Each write audited.

### 5. First-manager bootstrap — `scripts/bootstrap-admin.ts`
Idempotent (`npx tsx`): if a manager exists, exit; else create auth user + manager profile from `BOOTSTRAP_ADMIN_*` env. Operator runs once, then removes those env vars.

### 6. shadcn + tests
- `npx shadcn@latest add button input label card select table badge dropdown-menu switch separator sonner` + `<Toaster/>` in app layout.
- **Unit (vitest):** permissions resolver (override ?? default; financials.view ignores overrides; grantable filter).
- **Playwright** `e2e/{auth,rbac}.spec.ts`: manager login → creates engineer; engineer login → no Team/Permissions/Invoices nav, denied on those pages; **RLS proof with an engineer client: update `role_permissions` denied · insert override `financials.view` rejected by CHECK · other users' profiles return empty.**

### 7. Phase 1 gate (Amendment 4)
`tsc --noEmit` → ESLint → vitest → Playwright → `get_advisors` → `/security-audit` (supabase-security-reviewer) → `/ui-review` (frontend-rtl-reviewer). Then commit + push + redeploy preview.

**Reused from Phase 0:** `lib/env.ts` (`getServiceRoleKey`, `getPublicEnv`), `lib/supabase/{client,server}.ts`, `lib/config/brand.ts`, `components.json` (shadcn-ready), the RTL/token `app/globals.css`.

**Verification (end-to-end):** apply migration → advisors clean → run bootstrap → `npm run dev`: manager creates engineer + accountant, role-correct nav, edits a role default + a per-user override, engineer blocked from manager pages; all gates green.

---

## Phase 1.5 — UI/UX review fixes (post `/ui-review`, **serious only**)

**Context:** After Phase 1, the `frontend-rtl-reviewer` did a static RTL/mobile/role review of the Phase 1 screens. The financial hard-lock and RBAC gating reviewed **clean** (no money UI reachable by engineers; `financials.view` non-grantable at UI + resolver + DB-CHECK). The actionable problems are concentrated in RTL/mobile primitives. Per operator: **fix only serious RTL/mobile/auth-permission UX issues**; defer polish. **No change to any RBAC/financial logic.**

### A. shadcn primitives (highest leverage — reused by every table/toggle)
- `components/ui/switch.tsx`
  - **S1 — RTL thumb travels the wrong way** (the toggle that grants permissions/activates staff reads backwards in Arabic). `translate-x` is physical and does not flip under `dir="rtl"`. Replace the thumb travel with direction-gated utilities (mutually exclusive → robust regardless of Tailwind `:where()` specificity):
    `data-[state=unchecked]:translate-x-0 ltr:data-[state=checked]:translate-x-[calc(100%-2px)] rtl:data-[state=checked]:-translate-x-[calc(100%-2px)]`.
  - **S3 — tap target** ~18px tall. Bump default size `h-[1.15rem] w-8` → `h-6 w-11` and thumb `size-4` → `size-5` (≈44px-wide target). Keep `sm` size for dense desktop.
- `components/ui/table.tsx` (**M1**, RTL correctness — bundled with S2): `TableHead` `text-left` → `text-start`; `[&:has([role=checkbox])]:pr-0` → `pe-0` on `TableHead` + `TableCell`. Fixes header alignment app-wide.

### B. Responsive admin surfaces (S2 — no horizontal scroll on phones)
- `app/(app)/team/team-table.tsx` — `md+` keeps the `<Table>` (`hidden md:block`); `< md` renders a stacked **member-card list** (`md:hidden`): name + «أنت» badge, email (`dir="ltr"`) on its own line, full-width role control, «نشط» + switch row. Reuse `changeRole`/`changeActive`.
  - **M4 (permission-UX correctness):** make the role `<select>` **controlled** (local state seeded from `m.role`) and **revert on action error** — today it's `defaultValue`, so a rejected change (e.g. the last-manager guard) leaves the dropdown showing the wrong role while the toast says error. Bump select `h-8` → `h-10`.
- `app/(app)/settings/permissions/role-defaults-editor.tsx` — `md+` keeps the matrix `<Table>` (`hidden md:block`); `< md` renders **one card per permission** (`md:hidden`): Arabic label heading + three rows (role label + switch, or the locked indicator for `financials.view`). Extract a small `Cell(role, key)` helper so the locked/switch logic isn't duplicated across both layouts. Reuse `toggle()`.

### C. Mobile shell / installed-PWA (S4, S5, +M7)
- `app/layout.tsx` — add `viewportFit: "cover"` to the `Viewport` export (enables safe-area insets). **S5:** Toaster `position="top-center"` → `position="bottom-center"` + `mobileOffset={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}` so confirmations land near the thumb and clear the bottom nav.
- `components/app-shell.tsx` — **S4:** bottom `<nav>` gets `pb-[env(safe-area-inset-bottom)]`, each item `min-h-14`, and a non-color active indicator (**M7**) `border-t-2 border-transparent` → active `border-primary text-primary`. `<main>` `pb-24` → `pb-[calc(6rem+env(safe-area-inset-bottom))]` (keep `md:pb-6`). Header: `pt-[env(safe-area-inset-top)]`; sign-out icon button → 40px target (`size="icon"` + `className="size-10"`).

### Verification (Phase 1.5)
`npx tsc --noEmit` + ESLint clean → existing `e2e/auth.spec.ts` + `e2e/rbac.spec.ts` still green (no logic touched) → manual/Playwright at **360px** and desktop: switch checked = thumb at the **end** in RTL; team + permissions screens show **no horizontal scroll** (stacked cards < md); toasts appear **bottom** on mobile and clear the nav; bottom nav clears the home indicator; a rejected role change **reverts** the dropdown. Re-running `frontend-rtl-reviewer` is optional for these contained fixes.

### Deferred polish (NOT this pass — candidate for a later cleanup slice)
M2 native English validation bubble → `noValidate` + inline Arabic errors (login + add-member) · M3 password show/hide + copy + generator · M5 `✓/✗` glyph → labeled colored badge with visible "locked" helper · M6 dashboard greeting de-dupe vs header · N1 `start_url: "/dashboard"` · N2 dedicated maskable icon + 192/512 PNG fallbacks · N3 offline page · N4 route `loading.tsx` skeletons · N6 digit-shaping consistency · N7 name hidden `< sm`.

---

## ADR-1 — Tenancy / multi-office reuse (operator-confirmed)

**Decision:** **Single office per deployment** for v1 — one Supabase DB + one Vercel project per office. Reuse for other engineering offices = **redeploy the same codebase with different brand/config/env**. **Do NOT add `tenant_id` or shared multi-tenant infrastructure now.**

**Why:**
- **Isolation is the feature, not a limitation.** Offices may be competitors and financial data is highly sensitive; physically separate databases give the strongest isolation and keep the security story simple — the financial hard-lock never has to also defend against cross-office leakage.
- **Matches "sell copies / white-label."** A sale = provisioning an isolated, branded instance. Legitimate (even premium) distribution model.
- **Fastest, lowest-risk v1.** Phase 1 is already single-tenant; zero rework; no `org_id` on every table; no tenant-scoped RLS to get wrong.

**Conventions that keep the code reusable (no new complexity — mostly already true):**
1. Office-specific values live in **config/env, never hard-coded**: `lib/config/brand.ts` (name/short/tagline/colors), currency (SAR), locale. Per-office = swap config + env at deploy. ✓
2. **Clean env boundaries:** `lib/env.ts` validates per-deployment env; secrets per instance; `service_role` server-only. ✓
3. **All RLS routes through `SECURITY DEFINER` helpers** (`is_manager()`, `can_view_financials()`, `has_perm()`) — never inline `auth.uid()` gymnastics. ✓ This is the future seam: a `current_org()` helper could slot in with minimal policy edits if multi-tenant is ever needed.

**Explicitly out (per "no complexity now"):** no `organizations`/`tenant_id` columns; no `office_settings` singleton in v1 (config covers branding). The singleton is noted only as the *future* tenant seam if office-editable branding is ever wanted.

**Revisit triggers (→ consider full multi-tenant later, as its own project):** several small offices want self-serve signup and won't pay for isolated instances · need central billing/analytics across offices · per-instance ops cost becomes painful (~5–10+ instances).

**Impact on Phase 2:** none beyond keeping the conventions above. Clients/projects/financials stay single-tenant; RLS keeps routing through helpers; no `tenant_id`.

---

## Phase 2 — Detailed Build Plan (Clients & Projects) — *code only after approval*

**Context / why now:** Phase 1 delivered the security backbone (auth, roles, RLS, financial hard-lock) but no business data. Phase 2 adds the operational core Hamza actually runs his office on — **clients** and **projects** — and proves the two pillars on *real* data: shared multi-device state **and** DB-enforced financial isolation. The financial layer stays in a **separate, isolated table** (`project_financials`) that engineers can never read.

**Operator-confirmed visibility rule (Hamza):** engineers see full **operational** client/project detail — name, phone, address/location, notes, linked projects, status, dates, progress, assigned engineers — but **never any amount** (budget, contract value, cost, invoices, payments, totals). Because the `clients` table holds **no money** (every amount lives in `project_financials` and the future invoices/payments tables), `clients` is engineer-readable at the **row** level via RLS, while the **Clients module/nav stays hidden** from engineers — client details surface **read-only inside project views**. Enforced at **DB/RLS**, not UI only.

**Scope — 4 tables, no new permission keys, no new helpers, no admin-client use.** `clients` · `projects` · `project_financials` · `project_members`. Reuses seeded keys `projects.view/edit`, `clients.view/edit`, `financials.view` and existing helpers `is_manager()`, `is_accountant()`, `can_view_financials()`, `has_perm()`. **Out of scope (later):** invoices/payments/collections/reports + client financial **totals** (derived, Phase 4); tasks & lifecycle (Phase 3); portfolio/offers (Phase 5); Realtime/global search/export (Phase 6).

**Reused from Phase 1:** migration style (`0000` auto-RLS backstop + **explicit** policies) · `set_updated_at()` trigger · SECURITY DEFINER helpers · server-action pattern (zod → permission guard → **user-scoped** `createClient()` → `audit_log` → `revalidatePath`) · page pattern (`getSessionProfile`→redirect, `getEffectivePermissions`+`can()`→`<PermissionDenied/>`) · responsive table/stacked-card + controlled-input patterns from Phase 1.5 · `NAV` gating in `components/app-shell.tsx` · self-seeding RLS-proof e2e (`e2e/rbac.spec.ts`).

### 1. DB migration — `supabase/migrations/0004_clients_projects.sql`
- **Enum:** `project_status as enum ('planning','active','on_hold','completed','cancelled')`.
- **`clients`** (operational only — *never* a money column): `id uuid pk default gen_random_uuid()`, `name not null`, `company`, `phone`, `email`, `address`, `country text default 'SA'`, `notes`, `created_by → profiles`, `created_at`, `updated_at`. Index `(name)`.
- **`projects`** (operational only — *no* cost/budget columns): `id`, `name not null`, `code`, `client_id → clients on delete restrict`, `status project_status default 'planning'`, `progress int default 0 check (progress between 0 and 100)`, `start_date date`, `due_date date`, `description`, `created_by → profiles`, timestamps. Indexes `(client_id)`,`(status)`,`(due_date)`.
- **`project_financials`** (ISOLATED — manager+accountant only): `project_id uuid pk → projects on delete cascade`, `budget numeric(14,2)`, `contract_value numeric(14,2)`, `cost numeric(14,2)`, `currency text default 'SAR'`, `notes`, `updated_by → profiles`, timestamps.
- **`project_members`** (lightweight assignment): `project_id → projects on delete cascade`, `user_id → profiles on delete cascade`, `added_by → profiles`, `added_at default now()`, **`pk(project_id, user_id)`**. Index `(user_id)`.
- Reuse `set_updated_at` triggers on clients/projects/project_financials.
- **RLS — explicit policies (the `0000` event trigger only *enables* RLS; deny-by-default needs these):**
  - **clients** — SELECT `using (has_perm('clients.view') or has_perm('projects.view'))` → manager+accountant via `clients.view`, **engineer via `projects.view`** (operational read); INSERT/UPDATE `with check (has_perm('clients.edit'))` (manager); DELETE `using (is_manager())`.
  - **projects** — SELECT `using (has_perm('projects.view') or can_view_financials())` → manager+engineer; accountant via financials (Phase 4 context); INSERT/UPDATE `using/with check (has_perm('projects.edit'))` (manager + engineer *if granted* the `projects.edit` override); DELETE `using (is_manager())`.
  - **project_financials** — **SELECT `using (can_view_financials())`; INSERT/UPDATE/DELETE `using/with check (is_manager())`.** Hard isolation: an engineer JWT gets **0 rows**. (Write stays manager-only in v2; relax to `can_view_financials()` when the accountant gets finance UI in Phase 4.)
  - **project_members** — SELECT `using (has_perm('projects.view') or can_view_financials())`; INSERT/DELETE `using/with check (has_perm('projects.edit'))`.
- Apply via `mcp__supabase__apply_migration` to `anqrrhqjkmvaymvkdjtj` → `get_advisors` (expect **no RLS gaps**) → `generate_typescript_types` → overwrite `lib/supabase/database.types.ts`.

### 2. Domain helper (pure, unit-tested)
- `lib/projects/status.ts` — `PROJECT_STATUSES` + Arabic `PROJECT_STATUS_LABELS` (تخطيط / قيد التنفيذ / متوقف مؤقتاً / مكتمل / ملغى); `isOverdue(dueDate, status)` = `dueDate != null && dueDate < today && status not in ('completed','cancelled')`. Pure module (no server deps) like `lib/auth/permission-keys.ts` → safe for client + tests.

### 3. Server actions + pages (Arabic RTL)
- **Clients module — manager full · accountant read-only · engineer no module (data visible inside projects).**
  - `app/(app)/clients/page.tsx` — gate `can(perms,'clients.view')` (engineer → `<PermissionDenied/>`, no nav item). List clients; add/edit/delete controls render only when `can(perms,'clients.edit')`.
  - `app/(app)/clients/actions.ts` — `createClient`/`updateClient`/`deleteClient`: zod-validate → guard `has_perm('clients.edit')` server-side (RLS is the real gate) → `audit_log` → `revalidatePath('/clients')`.
  - Components: `clients-table.tsx` (desktop `<Table>` `hidden md:block` / mobile stacked cards `md:hidden`, per Phase 1.5) + `client-form.tsx` (shadcn `dialog`).
- **Projects module — manager + granted engineers write · engineer read incl. client detail · money gated.**
  - `app/(app)/projects/page.tsx` — gate `projects.view`; list rows = name, client name, status badge, progress bar, due date (**overdue = red** via `isOverdue`). A **budget** column renders only when `can(perms,'financials.view')`, sourced from a single gated `project_financials` map fetch (no N+1). Create/edit controls only when `can(perms,'projects.edit')`.
  - `app/(app)/projects/[id]/page.tsx` — operational detail for anyone with `projects.view`: name/status/progress/dates; **client info read-only** (name, phone, address, notes — RLS-allowed for engineers); assigned engineers. **`<ProjectFinancialsCard>` is fetched AND rendered only inside `if (can(perms,'financials.view'))`** → an engineer's server render never fetches or emits any amount (**DOM-level** isolation, not CSS hiding).
  - `app/(app)/projects/actions.ts` — `createProject`/`updateProject`/`deleteProject` (operational fields; guard `projects.edit`, delete = manager); `setProjectFinancials` (budget/contract/cost; guard `is_manager()`; RLS blocks engineers regardless); `addProjectMember`/`removeProjectMember` (guard `projects.edit`). All audited + `revalidatePath`.
  - Components: `projects-table.tsx`, `project-form.tsx` (dialog; budget/contract fields rendered **only** for financials viewers), `project-financials-card.tsx`, `project-members-editor.tsx`, `status-badge.tsx`, `progress-bar.tsx`.
- **Nav** (`components/app-shell.tsx` `NAV` array): add `{ href:'/projects', perm:'projects.view', icon: FolderKanban }` and `{ href:'/clients', perm:'clients.view', icon: Contact }` → manager sees both; **engineer sees Projects only**; accountant sees Clients only. (Matches Hamza's matrix; Clients module hidden from engineers while client *data* stays visible inside projects.)

### 4. shadcn additions
`npx shadcn@latest add textarea dialog alert-dialog tabs` (forms, delete-confirm, project-detail sections). Dates use native `<input type="date">` (real date field → overdue detection; RTL-safe). Progress = Tailwind bar (no new dep).

### 5. Tests
- **Unit (vitest):** `lib/projects/status.test.ts` — `isOverdue` truth table (past+active = overdue · past+completed/cancelled = not · null due = not · future = not).
- **e2e `e2e/projects.spec.ts`** (self-seed manager+engineer+accountant via service-role admin, like `rbac.spec.ts`):
  - **Manager:** create client → create project (linked, real dates) → set budget/contract → amounts visible; an overdue project shows red.
  - **Engineer:** `/projects` + detail show client name/phone/address + status/progress, and **no budget/contract anywhere in the DOM**; `/clients` → `<PermissionDenied/>`; no Clients nav.
  - **Accountant:** `/clients` read-only (no add/edit buttons); `/projects` denied (no nav).
  - **Make-or-break RLS proof (engineer JWT via `@supabase/supabase-js`):** `select * from project_financials` → **0 rows**; `insert into projects` → **denied**; `select * from clients` → **rows returned** (operational access confirmed); `update clients` → **denied**. Then manager grants engineer the `projects.edit` override → engineer `insert into projects` **allowed**, yet `project_financials` **still 0 rows** (isolation holds for a *granted* engineer). Accountant JWT: `select clients` allowed · `update clients` denied · `select project_financials` allowed · `insert/update project_financials` **denied** (manager-only).

### 6. Phase 2 gate (Amendment 4)
`tsc --noEmit` → ESLint → vitest → Playwright (auth + rbac + **projects**) → `get_advisors` (no RLS gaps) → `/security-audit` (`supabase-security-reviewer`) → `/ui-review` (`frontend-rtl-reviewer`). Then commit + push + **`npx vercel deploy --prod --yes`** + verify.

### 7. Security checklist (Phase 2-specific)
- RLS enabled **and explicit** policies on all 4 tables; `get_advisors` clean.
- **`project_financials` deny-by-default**; engineer JWT returns **0 rows** (proven by the make-or-break test) — UI hiding *and* DB enforcement.
- **No amount columns** on `clients`/`projects`; money lives only in `project_financials` (+ future invoices/payments). Client financial **totals** are *derived* in Phase 4 behind `can_view_financials()`, **never stored** on `clients`.
- All writes via **user-scoped** server actions (RLS-enforced) + zod; **no `service_role`/admin client** in Phase 2 (no auth-user creation here); none in any `NEXT_PUBLIC_*`/client bundle.
- `audit_log` for create/update/delete of clients, projects, financials, members.
- **Realtime:** do **not** add `project_financials` to any client-subscribed publication (Realtime deferred to Phase 6; if enabled for projects, financials stays excluded).
- Financial isolation also at **render**: engineer server render never fetches/sends amounts (DOM-asserted), not CSS-hidden.

### 8. Vercel
No infra/env change (schema is in Supabase). After the gate is green and merged to `main`: `npx vercel deploy --prod --yes` from repo root → verify `/projects` + `/clients` → **200** behind Deployment Protection; `/api/health` → **401**. **Keep Deployment Protection ON.**

### 9. What becomes demonstrable to Hamza after Phase 2
A real three-login walkthrough proving the two pillars on shared data:
- **Manager:** add a client (name/phone/address) → create a project linked to that client with real start/due dates, status, progress → set **budget + contract value** → overdue projects show in **red**.
- **Engineer (separate device):** opens the *same* project → sees client name/phone/address + status/progress/dates → **no budget/contract/amount anywhere**, and **no Clients module**.
- **Accountant:** sees **Clients (read-only)**.
- First slice with real business data: **multi-device shared state + DB-enforced financial isolation**, visible end-to-end.
- **Exposure note (locked rule):** Deployment Protection stays **ON** — don't open the app publicly yet. Deliver Phase 2 sign-off to Hamza via a **recorded screen walkthrough** of the three logins (recommended), or a time-boxed operator-controlled share — operator's call.

### 10. Verification (executor, end-to-end)
Apply `0004` → `get_advisors` clean → regenerate types → `npm run dev`: manager creates client + project + financials; engineer sees operational detail but **zero amounts and no Clients module**; accountant sees clients read-only; a manager-granted engineer can add a project yet **still reads 0 financial rows**. All gate steps green → commit / push / `vercel deploy --prod` / verify.

### Phase 2 — build status & review outcome (executed)

**Built & gated green.** Migrations **0004** (clients/projects/`project_financials`/project_members + explicit RLS), then a team-visibility iteration **0005 → 0006 → 0007** that settled on: `profiles` SELECT = self + manager (Phase 1 posture) **plus** a `team_directory()` SECURITY DEFINER function exposing only `id/full_name/role/is_active` — so engineers can resolve colleague names ("assigned engineers", Phase 3 handoffs) **without** staff emails ever being readable. Gate: `tsc` + ESLint clean · vitest **12/12** · Playwright **11/11** · `get_advisors` **no ERROR**.

**Make-or-break (financial isolation) — verified twice.** Engineer JWT reads **0 rows** from `project_financials` even when granted `projects.edit`; the engineer's project-detail HTML carries **no amount** (DOM-asserted); both reviewers confirmed no engineer path to money, **no `service_role` in Phase 2**, and the Realtime publication is empty. Advisors remaining = 6×WARN `security_definer_function_executable` (accepted class — each function only reveals the caller's own status, or a names-only directory) + 1×WARN auth leaked-password toggle.

**Review fixes applied:** M1 staff-email exposure → `team_directory()` names-only; UUID validation on member actions; RTL back-arrow (`←`→`→`), LTR value alignment (`text-end`), financials-dialog `max-h`, ≥40px destructive tap targets, bottom-nav truncation; added boundary e2e (granted engineer can't delete project / write financials; plain engineer can't write `project_members`).

**Deferred (documented, non-blocking):** (a) engineers can enumerate all client rows (operational, no money) → optionally membership-scope the `clients` SELECT in **Phase 3**; (b) audit-log writes are best-effort (log-on-failure later); (c) accountant-`audit_log` 0-rows test + a Realtime-publication regression guard → **Phase 6** when Realtime ships; (d) route `error.tsx`/`loading.tsx`; (e) latent `tabs.tsx` vertical-indicator RTL (unused).

---

## Open questions to confirm with the client (non-blocking) — WhatsApp
1. Exact legal spelling + logo/brand colors for «أسس الإعمار المتقدمة».
2. Notification channels for urgent/overdue — in-app only for v1, or email/WhatsApp later?
3. Offers/contracts fields (request → proposal → agreement) and portfolio fields (cover image, scope, year) — minimal v1 set?
4. Any existing client/project/invoice data to import for day one?
