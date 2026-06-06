# Engineering Office App

This repository is for the engineering office app only. Ignore the soil laboratory app unless the user explicitly asks to switch projects.

## Product Goal

Build a production-ready Arabic RTL web app/PWA for an engineering consulting office in Dammam. The app replaces ad hoc mental tracking with one shared workspace where the general manager assigns work, engineers update progress, and accounting tracks invoices, collections, and payments.

Preferred stack unless the user changes it:

- Next.js App Router with TypeScript
- Tailwind CSS and shadcn/ui
- Supabase Auth, Postgres, Storage, Realtime, and Row Level Security
- Vercel deployment
- Playwright for end-to-end checks

Use current documentation through Context7 and official docs when implementing framework, Supabase, or deployment details.

## Client Requirements

- Brand/program name from the chat: Osos Al-Emaar Advanced Company. Confirm the exact Arabic spelling with the client before final branding.
- Primary language: Arabic, right-to-left.
- Main modules: dashboard, projects, tasks, clients, invoices/payments, employees/team, work portfolio, offers/contracts.
- Must be usable as a web app from the browser and installable on phones as a PWA.
- Data must be shared between manager and employees from different devices in real time. Do not rely on localStorage for production data.
- General manager grants access and permissions.
- Engineers can see project/task work, update progress, add notes, and, if allowed by the manager, add/edit projects and tasks.
- Accountant can see clients, invoices, amounts, collections, payments, and financial reports.
- Project costs and financial amounts must be hidden from engineers and visible only to the general manager and accountant.
- Tasks must always show clear employee and project ownership. Avoid unknown task states.
- Use real date fields, not free-text dates, so overdue projects/tasks can be detected.
- Include search and filtering once lists grow beyond demo size.
- Include backup/export considerations before real client data is entered.

## Security Rules

- Never commit secrets. Keep `.env`, `.env.local`, Supabase service role keys, OAuth tokens, and provider credentials out of Git.
- The Supabase service role key must never be used in client-side code.
- Enforce role permissions at the database layer with Supabase RLS, not only by hiding UI.
- Treat localStorage-only auth/passwords as prototype code only. Production auth must use Supabase Auth or another real auth provider.
- Validate manager/accountant/engineer access in tests before calling the app ready.

## Workflow

- Before building a major feature, update or create a short product note in `docs/`.
- For Supabase work, create migrations under `supabase/migrations/` and document required environment variables.
- After frontend changes, run type checks/tests and use Playwright or browser verification.
- Before handoff, run security review focused on RLS, secrets, and role-based financial visibility.
