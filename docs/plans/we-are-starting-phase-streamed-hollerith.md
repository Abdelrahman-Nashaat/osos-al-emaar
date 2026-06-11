# Phase 4.5 — Production Stabilization & Hardening (APPROVED PLAN)

> Status: **EXECUTING under standing operator approval (full Phase 4.5 autonomous).** Slice A **shipped+promoted** (`1a2ffc1`); Slice B **shipped+deployed** (`1b0e9c3`, Playwright 62, RTL review APPROVABLE-no-HIGH); Slice C **built & gated** (Playwright **68**, vitest 42, build clean, `npm audit` **0 vulnerabilities** after next 16.2.9 + scoped postcss override, verify:rls PASS, publication = exactly the 5 operational tables / finance-leak 0, policy WARNs resolved by construction [1 SELECT policy each], CSV formula-injection finding fixed). **Slice C security review note:** the subagent was session-limited (same as the accepted Phase 4 precedent) → an equivalent manual review was performed against the empirical e2e/catalog evidence — no CRITICAL/HIGH/MEDIUM; a fresh subagent security review re-runs at the Slice D final gate. Phase 5 stays paused.
> **Slice A execution record:** migrations 0011–0013 applied to the staging DB (pre-migration snapshot at `.backups/pre-slice-a-snapshot.json`, runbook step 10); `project_members` verified empty (no legacy non-engineer rows); gate green — tsc ✓ eslint ✓ vitest **42** ✓ Playwright **41** ✓ build ✓ advisors no-ERROR/no-new-WARN ✓ npm audit unchanged (documented moderate only) ✓ verify:rls ✓; slice-scoped security review run on the diff — verdict **APPROVABLE, no CRITICAL/HIGH/MEDIUM**; LOW-1 (surface failed unban on reactivation) fixed in `team/actions.ts`; LOW-2 (disabled-account enumeration via the banned branch reveals only that an account is disabled, post-GoTrue) accepted; INFO notes: add a CSP report endpoint before the C7 enforcement flip (optional), revisit HSTS `includeSubDomains`/`preload` at the custom-domain launch.
> Repo: `C:\Users\Public\projrcts\hamza` · Live deployment: `https://osos-al-emaar.vercel.app` · Supabase `anqrrhqjkmvaymvkdjtj` (eu-central-1, Postgres 17) · `main` @ `c016012`.
> **Environment classification: the current Supabase project and Vercel deployment are STAGING/DEMO.** Hamza has entered **no real operational or financial data** — everything in the DB today is disposable test/demo data. A separate Supabase project is **not** required during Phase 4.5. Clean production provisioning, client-owned accounts, billing, domain, secret rotation, and final ownership/cutover are deferred to a dedicated **Production Launch phase** after the application is complete. Phase 4.5 hardens the app on this staging environment; e2e discipline (RUN-prefixed seeding, never truncate) is kept regardless.
> Gate today: tsc clean · ESLint clean · vitest **40** · Playwright **32** · advisors no-ERROR.
> Evidence: own code-trace of all findings + four read-only specialist investigations (security/RLS, architecture, RTL/responsive, QA) + live advisor/publication/plan-tier checks + production probes. Nothing was modified.

## Context

Phases 0–4 shipped identity/RBAC, clients/projects, the task lifecycle, and finance — with engineers provably reading **0 financial rows**. UAT on the live (staging/demo) deployment surfaced 15 confirmed findings; planning investigation added four more (S16–S19 below). Phase 4.5 fixes them in four independently approved vertical slices **A → B → C → D** before any real data entry begins and before Phase 5 widens the surface.

### Findings ledger (all verified, file:line traced)

**P0/P1 — correctness & security (Slice A):**
1. **Drafts counted as revenue** — `dashboard/page.tsx:54-66` and `reports/page.tsx:94-129` filter only `status !== "void"`; draft invoices inflate outstanding/invoiced/per-client/per-project/remaining-to-invoice. Only `sent/partially_paid/paid` are "issued".
2. **Member picker offers managers/accountants** — `projects/[id]/page.tsx:141-147` (`assignable` = all active roles); `addProjectMember` (`projects/actions.ts:212`) has no role check; `project_members_insert` RLS (0004:170-172) has no engineer guard (contrast `task_assign`, which validates `role='engineer' and is_active` in-DB).
3. **SW caches authenticated/financial HTML** — `public/sw.js` `cache.put()`s every GET (incl. `/dashboard`, `/api/*`) and serves it offline. *(Fix designed in Slice C; classified security but requires the C-grade PWA rework.)*
4. **Inactive-user redirect loop** — `proxy.ts:41-45` bounces authed users off `/login`; `getSessionProfile` returns null for `!is_active` (`lib/auth/permissions.ts:28`) → `(app)/layout.tsx` bounces back. Login never checks `is_active`; no message is ever shown.
5. **No security headers/CSP** — `next.config.ts` empty.
6. **Public `/api/health` leaks env-presence + error detail** — confirmed live: anonymous GET returns all three env booleans (incl. `SUPABASE_SERVICE_ROLE_KEY`) + supabase status/detail; no `Cache-Control`.
7. **Leaked-password protection disabled** (advisor WARN) — **blocked: org is on the Free plan; the toggle is Pro-only** (verified via `get_organization` + docs). See Open Decision 1.
8. **24 SECURITY DEFINER grants** — individually reviewed (Appendix 1). Verdict: all keep their `authenticated` EXECUTE (only write path; internal checks are the gate; `search_path=''`, anon revoked on all — verified live). One real hole: S16.

**UX & reliability (Slice B unless noted):**
9. **Stale mutations** — root cause confirmed against Next 16 source/docs: `revalidatePath` inside a server action invalidates the client prefetch cache for *future navigations* but does **not** re-render the current route when the action is invoked imperatively (the app's `useTransition`+`await action()` dialog pattern). Manual reload "fixes" it; `DeleteInvoiceDialog` escapes only because it navigates.
10. **360px overflow** — `/reports` keeps 4–5-column money `<Table>`s in the mobile DOM (only surface violating the house stacked-card pattern; ≈239px deficit); `/projects/[id]` ≈52px from a non-wrapping inner flex row at `project-invoices-card.tsx:68` (same shape in `project-tasks-card.tsx:68`, `payments-list.tsx:80`); manager bottom nav = 8 cells.
11. **Icon-only create buttons unnamed <640px** — `invoices/page.tsx:101`, `tasks/page.tsx:94`, `projects/page.tsx:73`, `clients/page.tsx:41` (`hidden sm:inline` label, no `aria-label`). Other icon buttons already correct.
12. **English 404; no error/loading boundaries; errors coerced to zeros** — no `not-found.tsx`/`error.tsx`/`loading.tsx`/`global-error.tsx` exist; `notFound()` (`invoices/[id]:36`, `tasks/[id]:35`, `projects/[id]:45`) renders the English default; every fetch does `?? []`, so a failed finance query renders **zeros** (trust-killer); `notFound()` also fires on transient errors (data=null) — must distinguish error vs absent.
13. **Same-assignee reassign** — 0009 raises generic `illegal_transition` → misleading Arabic message; picker includes the current assignee.
14. **Project name⟷code display** — spaced but **not bidi-isolated** (`projects-table.tsx:66-68,102-104`, `projects/[id]:177-179`); Latin codes inside RTL text need `<bdi>`; `<option>` labels need a textual «—» separator; no shared helper (invoice numbers are already isolated — extend that idea).
15. **No cross-field date validation** — only `YYYY-MM-DD` regex anywhere; native English bubbles on forms; no `due≥issue`, `start≤due`, `paid_at` sanity.

**Found during planning (Slice A):**
- **S16. `has_perm()` ignores `is_active` on the override branch** (0001:95-109) — a deactivated user with any `projects.*`/`tasks.*` override keeps that permission over REST with a still-valid JWT (~1h) + working refresh token. Financials unaffected (role-gated). Also: 5 task functions (`task_start/set_progress/submit/add_note/milestone`) accept a deactivated **assignee** actor.
- **S17. Deactivation doesn't revoke sessions** — `setMemberActive` only flips the flag; tokens stay valid.
- **S18. Collected-cash inconsistency on void** — dashboard `collectedMonth` (`dashboard/page.tsx:61-63`) counts payments on **voided** invoices; reports excludes them. Needs one product ruling (Open Decision 2).
- **S19. Free plan = no backups at all** — no automated backups, no PITR on Free. Acceptable for the current staging/demo data (all disposable), but a hard blocker for real data — handled by the Pre-Launch Production Gate (Decision 1).

**Platform facts that correct the brief:**
- **postcss advisory:** `next@16.2.7/16.2.8/16.2.9` ALL pin bundled `postcss@8.4.31`; no stable Next clears GHSA-qx2v-qp2m-jg93 (16.3 canary only). Remediation = supported npm `overrides` pin (semver-compatible 8.5.x) + full gate — **not** a Next upgrade, **never** `npm audit fix --force` (would install next@9). Exploitability here ≈ nil (build-time pipeline, own CSS only) — fallback is documented acceptance.
- **Vercel:** project-level `framework: null` (builds saved by `vercel.json`); **no region pinned → functions run iad1**, DB in eu-central-1. Supported fix: top-level `"regions": ["fra1"]` in `vercel.json`.
- **Realtime publication is empty today** (verified live) — slice C is purely additive.
- Migrations 0000–0010 all applied (verified).

---

## Slice A — Accounting correctness + authorization/security blockers

### A1. Issued-only money figures
- `lib/finance/invoice.ts`: add `ISSUED_STATUSES = ["sent","partially_paid","paid"]` + `isIssued()` (single source of truth; aligns with `isInvoiceOverdue`, which is already correct).
- `app/(app)/dashboard/page.tsx`: `live` filter → `isIssued` (fixes `outstandingTotal`, `invoicedMonth`, overdue base); **`collectedMonth` joins payments→invoice and excludes `void`** (S18, matching reports).
- `app/(app)/reports/page.tsx`: `liveInvoices` → issued (fixes `invoicedPeriod`, `outstandingNow`, `overdueNow`, `byClient`/`byProject`, `remaining = max(0, contract − issuedInvoiced)`); payment roll-up guard tightened to `!isIssued`.
- `project-invoices-card.tsx`: rows keep all statuses (it's a list); any roll-up sum becomes issued-only. `/invoices` tabs/counts unchanged (status-correct already); aging already runs on the overdue filter (⊆ issued).
- **A1b (approved ruling):** migration `0013_invoice_void_payment_guard.sql` — `invoice_void` raises `has_live_payments` unless all payments are reversed (reverse first, then void) + Arabic mapping «لا يمكن إلغاء فاتورة عليها دفعات غير معكوسة — اعكس الدفعات أولاً.». Keeps "collected = real cash, never on a voided invoice" coherent in both directions.
- Accounting anchor ruling (documented, flag to client later): invoices count in the period of `issue_date`, not send date.

### A2. Project members = active engineers only (UI + action + DB)
- Migration `0012_project_member_engineer_guard.sql`: `BEFORE INSERT` trigger raising `invalid_member` unless target is `role='engineer' AND is_active` (SECURITY DEFINER, `search_path=''`; catches every write path; additive — never fails on legacy rows).
- `projects/actions.ts` `addProjectMember`: pre-check + map `invalid_member` → «يُسمح بإضافة المهندسين النشطين فقط.».
- `projects/[id]/page.tsx:144`: filter `assignable` to active engineers (mirror `taskEngineers`).
- Legacy data: read-only check first; any existing non-engineer member is removed manually via UI (no destructive migration). All current rows are disposable demo data, so cleanup is low-stakes — do not assume specific row counts; check at execution time (Hamza has been testing on this environment).

### A3. Inactive users lose ALL DB access + sessions (S16, S17)
- Migration `0011_active_user_hardening.sql` (prior bodies recorded in header for rollback):
  - `has_perm()`: `when current_app_role() is null then false` before the override branch (inactive ⇒ deny every key).
  - The 5 self-actor task functions get a one-line `if public.current_app_role() is null then raise 'not_authorized'` guard.
  - `team_directory()`: caller must have a non-null role (names stop leaking to deactivated tokens).
- `team/actions.ts` `setMemberActive(…, false)`: also revoke sessions via the admin client (`auth.admin.signOut`/ban) + audit. Residual JWT window ≤1h closed.

### A4. «الحساب معطّل» flow (kills the /login⇄/dashboard loop)
- New `app/(auth)/account-disabled/page.tsx` (Arabic: «تم تعطيل حسابك. تواصل مع المدير العام.» + sign-out button).
- `proxy.ts`: treat `/account-disabled` like an auth route (authed users may stay there).
- `lib/auth/permissions.ts`: expose `inactive` distinctly; `(app)/layout.tsx` redirects inactive → `/account-disabled`.
- `login/actions.ts`: after `signInWithPassword`, check `is_active`; if false → `signOut()` + Arabic inline error.

### A5. Security headers + CSP Report-Only (enforcement in C7)
- `next.config.ts` `headers()` on `/(.*)`: `X-Content-Type-Options: nosniff` · `Referrer-Policy: strict-origin-when-cross-origin` · `X-Frame-Options: DENY` · `Permissions-Policy: camera=(), microphone=(), geolocation=(), browsing-topics=()` · `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.
- `Content-Security-Policy-Report-Only` (static): `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://anqrrhqjkmvaymvkdjtj.supabase.co wss://anqrrhqjkmvaymvkdjtj.supabase.co; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests`.
- Note: Cairo is **self-hosted** by `next/font/google` → `font-src 'self'` (no Google domains — supersedes a contrary note in the QA report).

### A6. `/api/health` → minimal + no-store
- Route returns `{ "status": "ok" }` with `Cache-Control: no-store`; delete `lib/health.ts` + `envStatus()` (grep-verified: route is the only consumer; nothing depends on the old shape). Deep diagnostics remain in server-only `scripts/verify-admin.ts`.

### A7. Leaked-password protection (Free-plan path now; Pro toggle at the Pre-Launch Gate)
- Decided: stay on Free during development. Now: raise `createSchema.password` min 8→12 (`team/actions.ts:16`) + document the open advisor WARN as gate-pending. (Optional later: server-side HIBP k-anonymity range check before `createUser`.)
- At the **Pre-Launch Production Gate** (see Decisions): upgrade to Pro → Authentication → Email → "Prevent use of leaked passwords" → verify the WARN clears. `team/actions.ts` already maps `weak_password` (422) to Arabic — no code change needed then.

### A8. SECURITY DEFINER review artifact
- Commit Appendix 1 as `docs/SECURITY_DEFINER_REVIEW.md` (per-function verdicts; advisors stay WARN-accepted with this written review; the only behavior changes are A3's).

**Slice A tests (fail-before → pass-after):** unit — `isIssued` + aggregation exclusions; DB — manager inserting accountant into `project_members` rejected; deactivated+override user: `rpc has_perm` false, `projects` update affects 0 rows, `task_submit` denied; deactivated assignee denied; PW — seeded draft+sent+partial+paid+void invoices → dashboard/reports/per-project arithmetic exact; inactive login shows Arabic message, no loop; mid-session deactivation lands on `/account-disabled`; headers present on `/` + `/dashboard`; `/api/health` minimal+no-store; CSP-RO present with zero console violations while navigating all modules; all 32 existing tests stay green (active-user paths unchanged).
**Migrations:** `0011`, `0012` (+`0013` if Decision 2 approved). **Threat model:** privilege retention by ex-staff; non-engineer ownership corrupting assignment semantics; env/infra disclosure; clickjacking/MIME sniffing; misleading financials.

---

## Slice B — Responsive, a11y, mutation refresh, Arabic error states

### B1. Bottom nav: ≤4 flat, else 3 primary + «المزيد» (data-driven, Phase-5-proof)
- `components/app-shell.tsx`: desktop sidebar **unchanged (all items — existing e2e name-queries depend on it)**. Mobile: if visible items ≤4 render flat; else 3 role-primary + «المزيد» bottom sheet built from the existing Radix Dialog (no new dependency): `top-auto bottom-0`, safe-area padding, `min-h-12` rows, focus trap/ESC/overlay, `aria-haspopup/expanded/controls`, trigger lights up when the active route is inside the sheet. Print CSS already hides `nav`.
- Primary sets — manager: الرئيسية · المهام · المشاريع (+المزيد: العملاء، الفواتير، التقارير، الفريق، الصلاحيات); accountant: الرئيسية · الفواتير · التقارير (+المزيد: العملاء); engineer: 3 flat items, no المزيد. Phase 5 (معرض الأعمال/العروض) lands inside المزيد automatically.

### B2. 360px overflow
- `/reports`: both money tables → house pattern (desktop `<Table>` `hidden md:block` + stacked label:value cards `md:hidden`, per the RTL spec sketch). Print stays on the desktop table (A4 ≈794px ≥ md).
- `projects/[id]/project-invoices-card.tsx:68`, `project-tasks-card.tsx:68`, `invoices/payments-list.tsx:80`: inner meta rows get `flex-wrap gap-y-1 min-w-0` (+`min-w-0` on title spans and on the members `<select>`).
- e2e: `scrollWidth ≤ innerWidth+1` at 360/390/768 on /reports, /projects/[id], /dashboard, /invoices, /tasks per permitted role.

### B3. Accessible names
- Add `aria-label` (identical to visible text, so desktop name-queries keep passing): «فاتورة جديدة» `invoices/page.tsx:101` · «مهمة جديدة» `tasks/page.tsx:94` · «مشروع جديد» `projects/page.tsx:73` · «إضافة عميل» `clients/page.tsx:41`. Plus `ProgressBar` `aria-label="نسبة الإنجاز"` and dialog close `sr-only` → «إغلاق».

### B4. Arabic boundaries + no silent zeros
- New: `app/not-found.tsx` (own RTL wrapper; «الصفحة غير موجودة» + link to /dashboard) · `app/(app)/error.tsx` («حدث خطأ غير متوقع» + «إعادة المحاولة» `reset()`, logs digest; shell/nav persist) · `app/global-error.tsx` (own `<html dir="rtl">`) · `app/(app)/loading.tsx` (one shared skeleton).
- New `lib/supabase/fetch.ts` `must()`: throw on `error` (→ error.tsx), return data; applied to **load-bearing** reads (finance totals, lists). Detail pages distinguish error (throw) vs truly-absent (`notFound()`). Secondary widgets (dashboard cards, RecentActivity, project sub-cards) render an inline Arabic error line instead of fake-empty.

### B5. Mutation freshness — one house pattern
- New `useActionResult()` hook (evolves the shared `notify`): error → toast; success → toast + **`router.refresh()`** + return true (dialog closes). Applied to every mutation dialog (invoice actions/form, payments, financials card, members editor, task dialogs, client/project forms). Server actions and `revalidatePath` stay as-is (they correctly freshen sibling routes). Cross-device freshness arrives in C2.
- e2e regression locks: record payment → row+status+outstanding update without reload; note → timeline; financials → card.

### B6. Same-assignee reassign
- Migration `0014_task_assign_same_assignee.sql`: the no-op guard raises `same_assignee` (distinct code; prior body recorded). `tasks/actions.ts` maps «المهمة مُسندة بالفعل لهذا المهندس.»; handoff picker excludes the current assignee (assign-flow for unassigned keeps the full list).

### B7. Project name⟷code
- New `lib/projects/label.tsx`: `<ProjectCode code/>` → `<bdi dir="ltr" class="ms-2 text-xs text-muted-foreground tabular-nums">`; applied at `projects-table.tsx:66,102`, `projects/[id]:177`; `<option>`/plain-text contexts (invoice form, task form) use `${name} — ${code}`.

### B8. Cross-field dates + inline Arabic validation
- zod `.superRefine` in actions + inline field errors via the `add-member-form.tsx` house pattern (`noValidate`, `useActionState`, `fieldErrors` on `ActionState`, `role="alert"`): project `start≤due`; invoice `issue≤due`; payment `paid_at ≤ today` (block) and `paid_at ≥ issue_date` (block; copy in Appendix 3); task `due_at` past-date warning. Date inputs keep `dir="ltr"`.

**Slice B migrations:** `0014`. **Gate adds:** RTL/UX review, `@mobile` viewport projects (360/390/768), print pages unaffected, desktop nav e2e unchanged.

---

## Slice C — Resilience & operations

### C1. Authenticated-data-safe SW + PWA polish
- Rewrite `public/sw.js` (no dependency): versioned `osos-v2`; **cache-first only** for `/_next/static/*`, icons, fonts; **network-only** for HTML/RSC/`/api/*`; navigations network-first with fallback to precached static Arabic `/offline` page; activate deletes old caches (incl. `osos-shell-v1`); `skipWaiting`+`clients.claim`; `pwa-register.tsx` listens for `updatefound` → «يتوفر تحديث — أعد التحميل» toast. Kill-switch rollback: an empty claim+clear SW.
- Icons: 192/512 PNG + maskable + apple-touch-icon; `manifest.ts` `start_url: "/dashboard"`.
- e2e (`@pwa`, SW registered in-spec; `serviceWorkers:'block'` everywhere else): CacheStorage never contains `/dashboard` HTML or `/api/*`; offline → Arabic page; old cache purged.

### C2. Realtime (operational only) + finance freshness
- Migration `0015_realtime_operational_publication.sql`: add **only** `tasks, task_events, projects, clients, project_members` to `supabase_realtime` (publication is empty today; postgres_changes respects RLS per-subscriber — engineer/accountant visibility automatically correct; DELETE events carry PK only — non-sensitive).
- **Never published (locked): `invoices, payments, invoice_events, project_financials, audit_log`** (audit_log metadata embeds amounts). Permanent regression test: `pg_publication_tables` ∩ finance set = ∅ (runs in every gate from now on).
- Client: one throttled channel → `router.refresh()`; finance pages add refetch-on-focus (`visibilitychange` → refresh) — fresh numbers without Realtime.
- Two-context e2e: manager updates task → engineer context refreshes without reload.

### C3. Backup/export — **before more real data** (S19)
- Manager-only «النسخ الاحتياطي والتصدير» under settings: server action streaming full JSON snapshot + per-entity CSV (clients, projects, project_financials, project_members, tasks+events, invoices+payments+events, profiles names-only, audit_log); `is_manager()`-gated server-side; audited; engineer/accountant get nothing (v1 ruling — accountant CSV later if Hamza asks).
- `docs/OPERATIONS.md`: the **Pre-Launch Production Gate** checklist (Pro upgrade, leaked-password, backup retention, session controls — before real finance data / client pilot); Free-phase posture (export + manual `supabase db dump` are the only recovery — runbook must be **tested**, and an export taken before every production migration); PITR deliberately NOT enabled yet (pre-launch evaluation); export cadence; Vercel log filtering; the future-/api/* self-auth rule (proxy excludes `/api/`).

### C4. Search/filters/pagination (growth order: invoices → tasks → projects → clients)
- Server-side `?q=` (ilike name/number/title) + `?page=` `.range()` pagination via a small `lib/list/query.ts`; keeps existing tabs; full-text deferred until thousands of rows.

### C5. Platform hygiene
- `vercel.json`: add `"regions": ["fra1"]` (functions+proxy co-located with the DB; verify `VERCEL_REGION`/`x-vercel-id` post-deploy; deploy off-hours); fix dashboard Framework Preset to Next.js (vercel.json stays source of truth).
- Next 16.2.7 → **16.2.9** + npm `overrides` pinning the nested postcss to ≥8.5.10 (supported mechanism, semver-compatible) → audit clean; full build + visual pass; **fallback:** drop the override and document acceptance (build-time-only exposure, own CSS). Never `npm audit fix --force`.
- Migration `0016_policy_consolidation_fk_indexes.sql`: split the two `FOR ALL` write policies (`role_permissions_write`, `overrides_write`) into insert/update/delete so SELECT has one policy (clears both WARNs, identical access); minimal FK indexes only — `task_events(actor_id|from_assignee|to_assignee)`, `invoice_events(actor_id)` — rest deferred with rationale (no current query uses them; staff are deactivated, not deleted). Unused-index INFOs: accepted (young DB).
- First-login password: migration `0017_must_change_password.sql` (`profiles.must_change_password` default false; `createTeamMember` sets true) + `app/(auth)/account/password/page.tsx` (`auth.updateUser` + clear flag + audit) + proxy/(app) gate redirect until changed + manager «إعادة تعيين كلمة المرور» (temp password + flag + session revoke). No SMTP dependency; email reset deferred until an SMTP decision.
- Observability: standardize the `console.error("[scope.action]", { code, status, message })` convention (no secrets/PII) across server actions.

### C7. CSP enforcement
- After the A5 Report-Only soak shows zero violations: per-request nonce in `proxy.ts` (`script-src 'self' 'nonce-…' 'strict-dynamic'`; `style-src` keeps `'unsafe-inline'` — RSC/Tailwind inline *style attributes* can't take nonces), enforce on preview first, then prod; drop Report-Only.

**Slice C migrations:** `0015`–`0017`. **Gate adds:** publication regression test is a hard blocker; Lighthouse/PWA installability; phone-level install/update/offline manual check; build+visual pass for the override; security review (export gating + publication).

---

## Slice D — Full three-role verification + rollout to the live deployment

1. Full gate on `main` (runbook below) + both subagent reviews over the whole Phase 4.5 diff + `npm run verify:rls`.
2. Deploy + **anonymous smoke**: `/api/health` minimal/no-store; headers incl. enforced CSP; `/login` Arabic RTL, Cairo, zero CSP violations.
3. **Three-role walkthrough on the live (staging/demo) deployment** (demo accounts; data is disposable but keep it tidy/prefixed):
   - Manager: full nav; finance widgets; project financials; reports exclude a known draft; create→assign task; record payment → updates without reload; export downloads.
   - Engineer: nav = الرئيسية/المشاريع/المهام only; denied on /invoices /reports /clients /team; opens assigned project → **hard check: zero money digits anywhere in the DOM**; start→submit own task; no close control.
   - Accountant: الفواتير/التقارير/العملاء; records payment; no void/delete/reverse buttons; /projects list denied but invoice-linked project detail shows financial context.
   - Inactive: deactivate a disposable engineer → Arabic disabled screen, sessions revoked; re-activate.
   - If a write must be proven end-to-end: one `ZZZ-VERIFY-<date>` client+project+**draft** invoice, verified, then draft deleted + project/client removed; reports return to baseline (never leave a sent/paid invoice — good hygiene even on demo data, and the habit Production Launch will rely on).
   - PWA: install, update toast on redeploy, offline page; 360px nav incl. «المزيد»; Arabic 404.
4. Rollback rehearsal (`vercel rollback` to previous deployment), close-out: master-plan status update, memory update, Phase 5 unblocked. **Remains open after Phase 4.5:** the Pre-Launch Production Gate (Pro upgrade + leaked-password + backup retention + session controls) before real finance data / client pilot.

---

## Migration ledger (all additive / CREATE-OR-REPLACE with prior body recorded)

| # | File | Slice | Rollback |
|---|---|---|---|
| 0011 | active_user_hardening (has_perm null-role guard; 5 task-fn actor guards; team_directory caller gate) | A | re-apply prior bodies (recorded in header) |
| 0012 | project_member_engineer_guard (BEFORE INSERT trigger) | A | drop trigger+function |
| 0013 | invoice_void_payment_guard *(ruling approved)* | A | re-apply prior `invoice_void` |
| 0014 | task_assign `same_assignee` code | B | re-apply prior body |
| 0015 | realtime operational publication | C | `alter publication … drop table` |
| 0016 | policy consolidation + 4 FK indexes | C | recreate `FOR ALL` policies; drop indexes |
| 0017 | profiles.must_change_password | C | column stays (additive, default false) |

## Test plan & gates

- **New tests:** ~+20 vitest (→ ~60) and ~+35 Playwright (→ ~67; +4–8 min, mitigated by `@mobile`/`@pwa` tag-routing and `serviceWorkers:'block'` default). Workers stay 1 (shared DB).
- **Harness:** new `e2e/fixtures.ts` — one `RUN` prefix for ALL seeded rows, worker-scoped role fixtures with `try/finally` teardown, `globalTeardown` prefix-sweeper (delete in dependency order, `ilike '${RUN}-%'`, **never truncate**, loud residual warning), env guard in `beforeAll`. The single Supabase project is the shared staging/demo environment — a separate project is NOT required for Phase 4.5, but the prefix discipline stays: it protects Hamza's demo data and rehearses the hygiene that becomes load-bearing at Production Launch.
- **playwright.config.ts:** projects `desktop` (grepInvert `@mobile`), `mobile-360`/`mobile-390`/`tablet-768` (grep `@mobile`), `@pwa` with SW allowed + in-spec registration.
- **Per-slice gate runbook (any red blocks approval):** 1 `npm run typecheck` · 2 `npm run lint` · 3 `npm run test` · 4 `npm run test:e2e` (+ sweeper residual = 0) · 5 `npm run build` · 6 advisors via MCP (no new security advisor; publication check) · 7 `npm audit` (no high/critical; postcss state per C5) · 8 `npm run verify:rls` · 9 slice-scoped subagent review (A,C: security · B,C: RTL) · 10 **manual `supabase db dump` export before applying any migration to the live database** (Free-plan rule; cheap even on demo data; in-app export supplements it once C3 ships) · 11 commit → push → preview deploy → manual slice checklist → **approval** → live deploy.

## Risks

1. **CSP breaks the app** (highest test-suite blast radius) → static headers + Report-Only first (A), nonce enforcement only in C after soak; rollback = header removal.
2. **SW rewrite** strands/poisons clients → versioned cache, network-only HTML, kill-switch SW; manual phone check on preview.
3. **has_perm hardening locks out active users** → deny-inactive-only diff, full rbac/projects/tasks/invoices e2e pre-deploy, instant function-body rollback.
4. **Shared staging/demo DB (e2e + Hamza's testing)** → prefix seeding + sweeper + workers:1; never truncate; e2e runs against localhost only. Data is disposable, but the discipline is kept — it becomes load-bearing at Production Launch.
5. **postcss override surprises the build** → isolated commit, build+visual gate, drop-and-accept fallback.
6. **fra1 move** → off-hours deploy, region verify, instant rollback.
7. **Free-plan window (S19)** → low urgency while all data is disposable demo data. Resolved policy stands: Free during development behind the **Pre-Launch Production Gate** (no real invoices/payments and no client pilot before the Pro upgrade); until then: C3 export, a **tested** manual `pg_dump`/restore runbook, and a manual export before **every** applied migration (runbook step 10) — cheap insurance even on demo data.
8. **Nav refactor breaking desktop e2e** → sidebar untouched; aria-labels mirror visible text.

## Acceptance criteria (phase)

- Dashboard/Reports/aging/per-client/per-project figures exclude draft+void everywhere (seeded-arithmetic e2e proves it); collected excludes void-invoice payments on both surfaces.
- DB rejects: non-engineer project members; **any** permission for deactivated users (incl. overrides + self-actor task fns); deactivation revokes sessions; engineer financial isolation proofs all still green.
- Anonymous on the live deployment: minimal no-store health; full header set (CSP enforced by D); Arabic 404/offline/disabled/error states; CacheStorage never holds authenticated HTML.
- 360/390/768: zero horizontal overflow on every permitted page; bottom nav ≤4 cells incl. functional «المزيد»; all icon controls named.
- Same-device mutations render fresh without reload; operational data live across devices; finance fresh on focus/mutation; publication regression test green.
- Manager export works (others denied); OPERATIONS runbook (incl. the Pre-Launch Production Gate) committed and the restore path **tested**; functions in fra1; audit clean (or postcss accepted+documented); vitest/Playwright counts strictly higher, all green.

## Execution order & approvals

**A → B → C → D.** A first (misleading money + privilege gaps = trust/data-safety blockers; smallest highest-leverage diff). B second (mobile usability + honest error states; depends on A only to avoid double-touching finance files). C third (PWA/realtime/backup/platform; realtime builds on B5's refresh pattern). D last (no feature code; the safety net). One commit per slice; explicit approval gates **before** each prod deploy; Deployment Protection stays ON.

## Decisions (resolved with the operator)

1. **Supabase plan — Free during active development, behind a hard Pre-Launch Production Gate.** Before entering any real invoices/payments **or** starting the client pilot (whichever happens first): upgrade the org to Pro, enable leaked-password protection, confirm daily backup retention, and configure suitable session controls. Until that gate: C3's manager-only JSON/CSV export ships; a manual `pg_dump`/restore runbook is documented **and tested**; a manual export is taken before **every** production migration; paid PITR is NOT enabled yet (evaluate separately before launch). No provider migration during Phase 4.5 — architecture stays portable; final provider/cost review before production launch. The gate lives in `docs/OPERATIONS.md` (C3) and is a **launch precondition**, not a Phase 4.5 exit criterion. **Environment ruling:** the current Supabase project + Vercel deployment are staging/demo (no real data exists); a separate Supabase project is NOT required during Phase 4.5. Clean production provisioning, client-owned accounts, billing, domain, secret rotation, and final ownership/cutover are deferred to a dedicated **Production Launch phase** after the application is complete.
2. **Void-with-live-payments — approved:** block voiding until payments are reversed (A1b / migration 0013 ships in Slice A).
3. *(Flag to client, non-blocking)* `issue_date` as the accounting anchor; SMTP provider for future email reset; accountant self-serve CSV export.

---

## Appendix 1 — SECURITY DEFINER per-grant review (24 functions, verified live)

All 24: `SECURITY DEFINER`, `search_path=''`, EXECUTE = `{postgres, authenticated, service_role}` (anon revoked — verified). Volatility s=stable/v=volatile.

| Function | Does | Internal authority check | vol | Verdict |
|---|---|---|---|---|
| current_app_role() | caller's role | `id=auth.uid() and is_active` | s | KEEP — root is_active gate |
| is_manager() / is_accountant() | role test | via current_app_role() | s | KEEP |
| can_view_financials() | finance gate | is_manager() OR is_accountant() | s | KEEP — is_active-gated transitively |
| has_perm(text) | effective perm | override ?? role-default | s | **TIGHTEN (0011)** — override branch not is_active-gated (S16) |
| team_directory() | names/roles of all profiles | none (any authenticated) | s | KEEP + caller-active gate (0011); names only, no email/money |
| task_create / task_assign | create/assign | `has_perm('tasks.assign')` + active-engineer assignee + legal transition | v | KEEP — healed transitively by 0011 |
| task_start / task_set_progress / task_submit / task_add_note / task_milestone | assignee self-service | assignee-or-assign-holder; **actor is_active not checked** | v | **TIGHTEN (0011)** — one-line actor guard |
| task_close / task_reopen / task_delete | manager review/delete (+audit) | `is_manager()` | v | KEEP |
| invoice_create / update / send / record_payment / add_note | finance ops (+audit; VAT∈{0,15}; overpayment guard) | `can_view_financials()` + state checks | v | KEEP |
| invoice_void / invoice_delete / payment_reverse | destructive finance (+audit) | `is_manager()` + state checks | v | KEEP (void gains the approved 0013 live-payments guard) |

Net: keep every grant (functions are the only write path; checks are internal); the sole real hole is `has_perm` (S16) + the self-actor task gap — both closed by `0011`. This table ships as `docs/SECURITY_DEFINER_REVIEW.md` (A8) and the advisor WARNs are accepted against it.

## Appendix 2 — Final header/CSP values
See A5 (static set + Report-Only policy) and C7 (nonce enforcement). Load-bearing: `connect-src` must include the project URL + `wss:`; `font-src 'self'` (next/font self-hosts); `style-src` keeps `'unsafe-inline'` permanently (inline style attributes).

## Appendix 3 — Arabic validation copy (B8)
| Rule | Message |
|---|---|
| required | هذا الحقل مطلوب |
| project start≤due | تاريخ البدء يجب أن يسبق تاريخ الاستحقاق أو يساويه |
| invoice issue≤due | تاريخ الإصدار يجب أن يسبق تاريخ الاستحقاق أو يساويه |
| payment ≥ issue | تاريخ الدفع لا يمكن أن يسبق تاريخ إصدار الفاتورة |
| payment ≤ today | تاريخ الدفع لا يمكن أن يكون في المستقبل |
| payment > outstanding | لا يمكن أن تتجاوز الدفعة المبلغ المتبقّي على الفاتورة |
| same assignee | المهمة مُسندة بالفعل لهذا المهندس |
| void w/ live payments | لا يمكن إلغاء فاتورة عليها دفعات غير معكوسة — اعكس الدفعات أولاً |
| generic save | تعذّر الحفظ، حاول مرة أخرى |
| disabled account | تم تعطيل حسابك. تواصل مع المدير العام. |

## Appendix 4 — Preserve list (do NOT touch)
`showFinancials` DOM-gating branches; `text-start` table alignment; safe-area paddings + Toaster offsets; existing `dir="ltr"` bidi isolation (invoice numbers/emails/phones/dates); «→» back-links (correct in RTL); existing stacked-card tables; ProgressBar RTL fill mechanics; Radix dialog a11y; print stylesheet + `.no-print`; `(app)` permission-gate page pattern; the e2e make-or-break RLS proofs.

## Appendix 5 — Viewport matrix (B/D verification)
360×800, 390×844, 768×1024, 1280×800 × {login, dashboard, projects, projects/[id], tasks, tasks/[id], clients, invoices, invoices/[id], reports, team, settings/permissions} per permitted role: no horizontal scroll, dialogs fit (`max-h-[90svh]`), nav readable, tap targets ≥40px, print pages render the desktop table.
