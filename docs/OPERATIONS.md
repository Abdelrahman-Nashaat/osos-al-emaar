# Operations Runbook — Osos Al-Emaar

> Environment status: the current Supabase project (`anqrrhqjkmvaymvkdjtj`,
> eu-central-1) and Vercel project (`osos-al-emaar`) are **STAGING/DEMO**. No
> real operational or financial data exists yet. Production provisioning,
> client-owned accounts, billing, domain, and secret rotation happen in the
> separate **Production Launch** phase.

## Pre-Launch Production Gate (REQUIRED before real data / client pilot)

Before entering any real invoices/payments **or** starting the client pilot —
whichever happens first:

1. **Upgrade the Supabase org to Pro** → automatic daily backups (7-day
   retention). Evaluate the PITR add-on separately at launch (deliberately NOT
   enabled before).
2. **Enable leaked-password protection** (Pro-only): Dashboard → Authentication
   → Providers → Email → "Prevent use of leaked passwords". Verify the
   `auth_leaked_password_protection` advisor WARN clears. The app already maps
   the `weak_password` rejection to Arabic.
3. **Configure session controls** (time-box / inactivity timeout) per office
   policy.
4. Final provider/cost review; production domain + secret rotation +
   client-owned accounts (Production Launch phase).

## Backups (Free-plan phase — the current recovery story)

- **In-app export (manager-only):** «النسخ الاحتياطي والتصدير» in the app (or
  `GET /api/export?format=json`) — full JSON snapshot + per-entity CSV. Every
  export writes an `export.run` audit row.
- **Cadence:** after every working day with data changes, and **always before
  applying a migration** to the live database (gate runbook step 10).
- **Manual dump (schema + data, full fidelity):**
  `npx supabase db dump --db-url "$SUPABASE_DB_URL" -f backup-$(date +%F).sql`
  (connection string from Dashboard → Settings → Database; never commit it).
- **Restore:** create a fresh Supabase project → run migrations 0000–0017 from
  `supabase/migrations/` in order → re-insert data from the dump/JSON export →
  update `NEXT_PUBLIC_SUPABASE_URL` / keys in Vercel. Auth users must be
  re-created (manager bootstrap + team re-creation) — auth identities are NOT
  part of the app export.

## Realtime publication — locked finance exclusion

Only `tasks, task_events, projects, clients, project_members` may be published.
Regression check (run in EVERY slice gate and after ANY publication change):

```sql
select count(*) from pg_publication_tables
where pubname = 'supabase_realtime'
  and tablename in ('invoices','payments','invoice_events','project_financials','audit_log');
-- MUST return 0
```

`audit_log` counts as financial: its `metadata` embeds invoice/payment amounts.

## Per-slice gate runbook

1. `npm run typecheck` · 2. `npm run lint` · 3. `npm run test` ·
4. `npm run test:e2e` · 5. `npm run build` · 6. Supabase advisors (no ERROR, no
new WARN vs `docs/SECURITY_DEFINER_REVIEW.md` baseline) · 7. `npm audit` (0
known vulnerabilities since the Next 16.2.9 + postcss override) ·
8. `npm run verify:rls` · 9. scoped security/RTL review · 10. **manual export
before applying migrations to the live DB** · 11. commit → push →
`npx vercel deploy --prod --yes` → alias smoke test.

## Platform

- **Function region:** pinned to `fra1` in `vercel.json` (co-located with the
  eu-central-1 database). Verify after deploy: response header `x-vercel-id`
  starts with `fra1::`.
- **Framework preset:** `vercel.json` is the source of truth
  (`"framework": "nextjs"`). The dashboard project setting may show null —
  harmless, but set it to Next.js when convenient.
- **CSP:** enforced per-request nonce policy lives in `proxy.ts`; static
  security headers in `next.config.ts`. Any new external origin (fonts, APIs)
  must be added to `connect-src`/etc. there.
- **/api/* routes are NOT gated by the proxy** (matcher excludes them). Every
  new route handler must authenticate itself (see `app/api/export/route.ts`;
  `/api/health` is intentionally public and minimal).
- **Service worker:** `public/sw.js` must NEVER cache HTML/RSC/`/api` —
  documents carry role-gated financial data. Bump the `CACHE` version on any
  SW change; the client shows an Arabic reload toast on update.

## Logging convention

Server actions/routes log failures as
`console.error("[scope.action]", { status, code, message })` — never secrets,
passwords, or PII payloads. View with `npx vercel logs <deployment-url>`.
