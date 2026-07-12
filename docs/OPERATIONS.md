# Operations Runbook — Osos Al-Emaar

> Environment status (updated 2026-07-12): the Supabase project
> (`anqrrhqjkmvaymvkdjtj`, eu-central-1) + Vercel project (`osos-al-emaar`) have
> begun **real use** — the client added real staff accounts (accountant +
> engineer). No real invoices/payments exist **yet**, but the pilot has
> effectively started, so the **Pre-Launch Production Gate below now applies**
> (backups + leaked-password protection especially). Treat all data as
> production-sensitive; e2e/verify scripts use disposable `@example.com` users
> that self-clean and must never notify or mutate real accounts. Production
> domain, client-owned accounts, and secret rotation remain in the **Production
> Launch** phase.

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
- **Verified JSON snapshot (scripted):** `npm run backup:snapshot` writes
  `.backups/snapshot-<date>.json` (every business table + auth-user metadata, no
  password hashes) and **re-reads the file to verify row counts** match the live
  DB. `.backups/` is gitignored. Use this as the pre-migration backup.
- **Manual dump (schema + data, full fidelity):**
  `npx supabase db dump --db-url "$SUPABASE_DB_URL" -f backup-$(date +%F).sql`
  (connection string from Dashboard → Settings → Database; never commit it).
- **Restore:** create a fresh Supabase project → run migrations 0000–0023 from
  `supabase/migrations/` in order → re-insert data from the dump/JSON export →
  re-upload Storage objects → update `NEXT_PUBLIC_SUPABASE_URL` / keys in
  Vercel. Auth users must be re-created (manager bootstrap + team re-creation)
  — auth identities are NOT part of the app export.

## Realtime publication — locked finance exclusion

Published tables: `tasks, task_events, projects, clients, project_members,
portfolio_items, notifications` (notifications are RLS-scoped to their
recipient; the bell subscribes with the user JWT). Regression check (run in
EVERY slice gate and after ANY publication change):

```sql
select count(*) from pg_publication_tables
where pubname = 'supabase_realtime'
  and tablename in ('invoices','payments','invoice_events','project_financials',
                    'audit_log','offers','offer_events');
-- MUST return 0
```

`audit_log` counts as financial: its `metadata` embeds invoice/payment amounts.
`offers`/`offer_events` are financial (quotation amounts) — never publish them.

## Daily reminders (pg_cron — migration 0026)

A pg_cron job `daily-reminders` runs `public.run_daily_reminders()` at **05:00
UTC (08:00 Asia/Riyadh)** every day. It inserts in-app notifications (the same
bell + Realtime stream) for: invoices that crossed their due date (manager +
accountant only), tasks due today / newly overdue (assignee, + managers for
overdue), and offers past `valid_until` still `sent` (managers). Each reminder
fires **at most once per entity** (deduped by `type` + `href`), so the bell
never repeats the same item. Financial isolation holds — task reminders carry
no amounts; invoice/offer reminders never reach engineers. `EXECUTE` on the
function is revoked from `anon`/`authenticated` (only the scheduler runs it).

```sql
-- Inspect / verify the schedule:
select jobid, jobname, schedule, active from cron.job where jobname = 'daily-reminders';
-- Manually trigger a run (service role / SQL editor) if needed:
select public.run_daily_reminders();
```

## Mobile app / PWA install / Web Push (migrations 0028–0029)

The app is an installable field PWA: Android shows an in-app «ثبّت التطبيق»
banner (`beforeinstallprompt`); iOS shows Add-to-Home-Screen instructions
(`components/install-prompt.tsx`). Extras: camera capture on «المرفقات»
(`capture="environment"`, `Permissions-Policy: camera=(self)`), an app-icon
unread **badge** (Badging API), a mobile **quick-add FAB**, and a **native share**
button (device share sheet) on invoice / offer / portfolio details. No app-store
packaging and no server-side WhatsApp/email — sending is the user's share sheet.

**Web Push pipeline** (closed-app delivery):

1. A device subscribes via the bell → «تفعيل الإشعارات» (`push_subscribe` definer
   RPC → `push_subscriptions`, RLS own-row only — migration 0028).
2. Any `notifications` INSERT fires the `notifications_push_dispatch` trigger
   (migration 0029), which `pg_net`-POSTs `{notification_id}` to
   `/api/push/dispatch` with a Vault-held bearer secret. Fire-and-forget; never
   blocks the writing transaction; graceful no-op if Vault is unset.
3. The route (Node runtime, self-authenticated — `/api/*` is NOT proxy-gated)
   reads the row + the recipient's subscriptions with the service role, sends via
   `web-push`, and prunes dead endpoints (404/410).

**Financial isolation holds by construction:** push only forwards a notification
ROW, and financial rows are created only for manager/accountant
(`notify_invoice_event`, 0022). An engineer can never receive a financial push.
`verify:rls` asserts "no engineer owns any invoice_* notification".

**Secrets & env** (never committed; in `.env.local` + Vercel + Vault):

| Key | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Vercel (Prod+Preview), client bundle | Push subscription public key |
| `VAPID_PRIVATE_KEY` | Vercel (Prod+Preview), server | Signs push messages |
| `VAPID_SUBJECT` | Vercel | `mailto:` contact for push services |
| `PUSH_DISPATCH_SECRET` | Vercel + Vault `push_dispatch_secret` | Bearer the trigger sends / the route checks (must match byte-for-byte) |
| — | Vault `push_dispatch_url` | `https://osos-al-emaar.vercel.app/api/push/dispatch` |

**Enable push (user):** open the bell → «تفعيل الإشعارات». On **iOS** the app must
first be **installed to the Home Screen** (Share → Add to Home Screen); Safari
tabs cannot receive Web Push. Android/desktop Chrome work in-browser once installed.

**Rotate the dispatch secret** — update BOTH sides (mismatch → every push 401s):

```sql
-- 1) set a new Vercel env value: vercel env rm PUSH_DISPATCH_SECRET production && vercel env add …
-- 2) update the Vault copy to the SAME value:
select vault.update_secret(id, '<new-secret>') from vault.decrypted_secrets where name = 'push_dispatch_secret';
```

**Rotate VAPID keys:** regenerate a pair, update `NEXT_PUBLIC_VAPID_PUBLIC_KEY` +
`VAPID_PRIVATE_KEY` in Vercel, redeploy. Existing subscriptions become invalid —
users re-enable; stale endpoints are auto-pruned on the next send.

```sql
-- Inspect delivery / wiring:
select id, status_code, error_msg, created from net._http_response order by id desc limit 5;
select count(*) from public.push_subscriptions;                    -- active devices
select name from vault.decrypted_secrets where name like 'push_dispatch%';
```

## Demo environment

A fully isolated demo (separate Supabase + Vercel project) is provisioned and
seeded per `docs/DEMO_ENVIRONMENT.md`. The seed (`scripts/demo/`) refuses to run
against the clean/production project ref. Never point `seed:demo` at the live DB.

## Storage («المرفقات» + portfolio images)

- One private bucket `attachments`; objects named
  `<entity_type>/<entity_id>/<uuid>.<ext>`; 10 MB/file cap (bucket +
  DB CHECK + server action). Downloads are 5-minute signed URLs only — the
  bucket must NEVER be flipped to public (invoice/offer files live there).
- Audience classes are enforced by `attachment_visible()` at BOTH the table and
  storage layers: invoice/offer files = manager+accountant only; task files =
  tasks.view; client files = clients.view; portfolio uploads = portfolio.edit.
- **Free-plan quota: 1 GB total storage.** Watch usage in Dashboard → Storage;
  the Pre-Launch Production Gate (Pro) raises it to 100 GB. Storage objects are
  NOT part of `/api/export` — a full backup = JSON export + Storage download
  (Dashboard or `supabase storage cp`) until Pro backups cover the DB.

## ZATCA / VAT posture

- «إعدادات المكتب» holds the VAT number (15 digits) — EMPTY means not
  VAT-registered: invoices print as «فاتورة» with no QR. When set, prints become
  «فاتورة ضريبية مبسطة» with the Phase-1 TLV QR (seller, VAT no., timestamp,
  total, VAT). Phase-2 (FATOORA integration) is NOT implemented — revisit only
  if ZATCA notifies the office of its integration wave.

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

## E2E test-data safety (real-user pollution guard)

The Playwright functional suite creates tasks/invoices/payments; their DB triggers
(0022/0026) insert notifications for **every active manager/accountant by role**,
and after 0029 those also Web-Push. So the suite must run against a **disposable**
project, never the live one. A `globalSetup` (`e2e/global-setup.ts`) **refuses to
run** when the target DB has any non-`@example.com` profile, printing how to fix it.

- **Correct fix:** point `NEXT_PUBLIC_SUPABASE_URL` (+ anon/service keys) at the
  demo project (`osos-al-emaar-demo`) when running Playwright. Keep `.env.local`
  (prod) for the app and for `verify:rls` (which is read-only / self-cleaning and
  never notifies).
- **One-off override:** `E2E_ALLOW_PROD=1 npx playwright test …` — this pollutes
  real bells. Clean residue afterwards (notifications whose `href` points at a
  now-deleted task/invoice/offer, for non-`@example.com` owners):

```sql
delete from public.notifications n using public.profiles p
where p.id = n.user_id and p.email not like '%@example.com'
  and ( (n.type like 'task_%'    and not exists (select 1 from public.tasks t    where '/tasks/'||t.id = n.href))
     or (n.type like 'invoice_%' and not exists (select 1 from public.invoices i where '/invoices/'||i.id = n.href))
     or (n.type like 'offer_%'   and not exists (select 1 from public.offers o   where '/offers/'||o.id = n.href)) );
```

## Logging convention

Server actions/routes log failures as
`console.error("[scope.action]", { status, code, message })` — never secrets,
passwords, or PII payloads. View with `npx vercel logs <deployment-url>`.
