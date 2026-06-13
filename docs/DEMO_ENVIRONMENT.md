# Demo Environment — Provisioning & Seeding Runbook

Two separate experiences are delivered:

1. **Clean validation env** — the existing production app + Supabase project
   `anqrrhqjkmvaymvkdjtj`, holding only Eng. Hamza's + the operator's data.
   URL: https://osos-al-emaar.vercel.app
2. **Demo env** — a *separate* Supabase project + Vercel project
   (`osos-al-emaar-demo`) seeded with a full fictional Dammam engineering
   office. Isolated so its activity can never touch the clean env.

The demo runs the **same code** as the clean env (same repo, same migrations),
only a different database + deployment. This keeps the demo honest: what Hamza
sees there is exactly the product.

---

## Why a separate Supabase project (not a schema/branch)

Supabase Auth (`auth.users`), Storage buckets, and Realtime are **project-wide**.
A demo sharing the clean project's database would share its auth users and
storage — demo logins would become real accounts in Hamza's project and demo
business rows would mix with his. A separate project is the only clean,
resettable isolation. (Schema-only isolation was rejected for this reason.)

## One operator action is required (DB provisioning)

A second free Supabase project cannot be auto-created: the connected Supabase
account has reached the **2 free-project limit**, and the Vercel→Supabase
Marketplace route needs a **one-time Terms acceptance** in the browser.

**Pick ONE:**

- **Option A (recommended, free):** accept the Supabase Marketplace terms once:
  <https://vercel.com/emara01111-7365s-projects/~/integrations/accept-terms/supabase?source=cli>
  then tell the agent — it runs `vercel integration add supabase` against
  `osos-al-emaar-demo`, which provisions a fresh free Supabase project and wires
  its env vars into the Vercel project automatically.
- **Option B:** authorize a paid Supabase plan (or free up one of the existing
  free projects) so a 2nd project can be created directly via the API.

Everything after provisioning is fully automated (below).

---

## Automated pipeline (after the DB exists)

```bash
# 0. Pull the demo project's env into a local file (service role included).
cd C:/Users/Public/projrcts/demo-link
vercel env pull .env.demo.local            # or set the 3 keys by hand

# 1. Apply ALL migrations 0000..0026 to the demo DB (same schema as clean env).
#    Via the Supabase MCP/CLI against the demo ref, or psql with the migration files.

# 2. Create the private "attachments" Storage bucket (10MB cap) on the demo project.

# 3. Seed the full fictional office (idempotent; refuses to run against the
#    protected clean project ref).
cd C:/Users/Public/projrcts/hamza
ENV_FILE=C:/Users/Public/projrcts/demo-link/.env.demo.local npm run seed:demo

# 4. Deploy the demo Vercel project from this repo (same commit as clean env).
cd C:/Users/Public/projrcts/demo-link
vercel deploy --prod --yes && vercel promote <url> --yes
```

The seed (`scripts/demo/`) creates the personas, signs in **as each one**, and
drives the real SECURITY DEFINER RPCs so every status, `amount_paid`, event,
notification and audit row is computed by production code — then backdates
timestamps so the office reads as months of history.

## Demo logins (handed to Hamza separately — never committed)

- Dedicated demo manager/engineers/accountant on the `@osos-demo.example` domain.
- `alhemyari003@gmail.com` and `emara01111@gmail.com` also exist **in the demo
  project** as managers with a shared demo password, so Hamza can sign in with
  his familiar email. (These are demo-project accounts — unrelated to his real
  clean-env account.)

## Resetting the demo

`npm run seed:demo` first wipes all demo business data, so re-running gives a
fresh office. The clean env is never touched (the ref guard blocks it).
