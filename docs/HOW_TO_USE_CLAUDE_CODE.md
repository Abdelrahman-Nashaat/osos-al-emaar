# How To Use Claude Code For This App

This guide is for building the engineering office app with the best practical workflow for UI/UX, backend, security, testing, and deployment.

Updated and checked against current Claude Code docs on 2026-06-06.

Project path:

```powershell
cd C:\Users\Public\projrcts\hamza
claude
```

## Current Setup Status

Good to go:

- Claude Code `2.1.167`
- Claude Code is up to date
- `opus[1m]` configured for Opus with 1M context
- Opus currently resolves to Opus 4.8 on first-party Anthropic/Claude Code
- `xhigh` saved in settings; `max` enabled through `CLAUDE_CODE_EFFORT_LEVEL` for highest-effort sessions
- Git, Node.js, npm
- GitHub CLI
- Supabase CLI
- Vercel CLI
- Python 3.14.5 from python.org for security hooks
- Git Bash available for Claude Code hooks
- Node 24 LTS portable is installed at `C:\Users\WindowS 10\AppData\Local\Programs\NodeJS\node-v24.16.0-win-x64`

Connected MCPs:

- GitHub
- Supabase
- Vercel
- Playwright
- Context7
- Figma

Installed useful plugins:

- `superpowers`
- `feature-dev`
- `frontend-design`
- `code-review`
- `code-simplifier`
- `security-guidance`
- `typescript-lsp`
- `commit-commands`
- `pr-review-toolkit`
- `session-report`
- `context7-plugin`
- `figma`

If you just installed/authenticated tools, close VS Code and open it again so PATH changes are loaded.

Node note: the machine still has Node `22.11.0` in `C:\Program Files\nodejs`, and Windows puts that before the user-local Node 24 path. This is not blocking Claude Code or the MCP setup. If future `npm` commands show engine warnings, install Node 24 LTS as administrator from nodejs.org or remove/update the old Program Files Node install.

## The Best Workflow

For this project, do not start by saying "build the app" directly. Use this order:

1. Plan Mode
2. Architecture and database plan
3. Supabase schema + RLS first
4. UI shell and navigation
5. One complete workflow at a time
6. Security review
7. Playwright E2E tests
8. Vercel deploy

This app has roles, financial data, and real client data. The correct order matters.

Best practical mode choices:

- Planning/database/security: `opus[1m]` + `/effort max`
- Large implementation slice: `opus[1m]` + `/effort ultracode` if available, otherwise `/effort max`
- Small fixes after the app exists: `opus[1m]` + `/effort xhigh`
- Fast trivial changes: lower effort only when you are deliberately saving limits

## Start Every Serious Session Like This

Inside Claude Code:

```text
/mcp
/model opus[1m]
/effort max
```

Use `/effort max` when you want the absolute strongest reasoning and you do not care about usage. Use `/effort xhigh` if you want a strong setting that persists cleanly and usually avoids overthinking. For this client app, start important architecture/security work with `max`.

For very large implementation tasks, you can also open `/effort` and choose `ultracode` if it appears. Use it for big build slices where you want Claude to organize a dynamic workflow. If it is not available, stay on `max`.

Check that these are connected:

- `github`
- `supabase`
- `vercel`
- `playwright`
- `plugin:context7-plugin:context7`
- `plugin:figma:figma`

Then start with:

```text
/plan-app
```

Read the plan carefully. Ask Claude to revise the plan until it is clear. Only then approve implementation. For big work, keep Claude in Plan Mode until you approve the exact next slice.

## Local Commands I Added

These commands are available inside Claude Code because they are in `.claude/commands`.

### `/plan-app`

Use first. It asks Claude to create the full implementation plan from the client chats and project docs.

### `/build-slice`

Use after approving a plan. It builds one complete vertical slice, not random pages.

Example:

```text
/build-slice manager creates client, creates project, assigns engineers, and creates tasks
```

### `/security-audit`

Use after database/auth/financial changes.

```text
/security-audit
```

### `/ui-review`

Use after frontend changes.

```text
/ui-review
```

### `/handoff-report`

Use before showing the app to the client.

```text
/handoff-report
```

## First Prompt To Start With

Paste this in Claude Code after running `/model opus[1m]` and `/effort max`.

```text
We are building the engineering office app in this repository.

Use Plan Mode first. Do not edit files yet.

Read:
- CLAUDE.md
- docs/CLIENT_REQUIREMENTS.md
- docs/CLAUDE_CODE_STACK.md
- docs/HOW_TO_USE_CLAUDE_CODE.md

Ignore the soil laboratory app completely. It is a separate future project.

Goal:
Build a production-ready Arabic RTL web app/PWA for an engineering consulting office in Dammam. The app is for the general manager, engineers, and accountant. It must support shared real-time data across devices using Supabase, and deploy on Vercel.

Critical requirements:
- General manager has full control.
- Manager grants roles and per-engineer extra permissions.
- Engineers can view/update operational project/task work.
- Accountant handles invoices, collections, payments, and financial reports.
- Financial amounts/costs/invoices/payments must be hidden from engineers at UI and database/RLS level.
- Use real auth and Supabase RLS, not localStorage passwords.
- Use real dates and overdue detection.
- Build Arabic RTL UI with excellent mobile usability.
- Use Context7/current docs before implementing framework/Supabase/Vercel details.
- Use Playwright to verify key workflows.
- Use security review before calling anything production-ready.

First task:
Create a complete phased plan with:
1. Recommended stack and project structure
2. Supabase schema and RLS strategy
3. Role/permission model
4. UI/UX architecture
5. Implementation milestones
6. Test plan
7. Security checklist
8. Deployment plan

After the plan, ask me to approve before coding.
```

If Claude is already in Plan Mode, paste the prompt normally. If it is not in Plan Mode, press `Shift+Tab` until Plan Mode is selected, or explicitly tell Claude: "Use Plan Mode first. Do not edit files yet."

## Recommended Build Phases

### Phase 1: Foundation

Claude should create:

- Next.js App Router + TypeScript
- Tailwind + shadcn/ui
- Arabic RTL setup
- Auth layout
- App shell/sidebar
- Supabase client/server helpers
- Environment variable structure

Do not enter real client data yet.

### Phase 2: Supabase First

Claude should design and implement migrations for:

- profiles
- roles/permissions
- employees
- clients
- projects
- project_members
- tasks
- task_updates/comments
- invoices
- payments
- offers/contracts
- portfolio items
- audit/activity logs

Then it must add RLS policies.

Most important test:

Engineer must not be able to query financial fields, even if they modify frontend code.

Claude should use Supabase MCP for project/database context and Context7/current docs before writing non-trivial RLS policies.

### Phase 3: Manager Workflow

Build a full manager path:

- Add employee
- Assign role
- Add client
- Add project
- Assign engineers to project
- Add tasks
- Track progress

### Phase 4: Engineer Workflow

Build:

- Engineer dashboard
- All visible tasks
- My tasks filter
- Urgent/overdue filters
- Progress updates
- Notes/comments
- Optional permissions for adding projects/tasks

No financial visibility.

### Phase 5: Accountant Workflow

Build:

- Client financial overview
- Invoices
- Payments
- Collections follow-up
- Overdue invoices
- Reports

### Phase 6: UI/UX Quality

Run:

```text
/ui-review
```

Require Claude to check:

- Arabic RTL
- mobile layout
- tables and forms
- empty states
- loading states
- error states
- permission-denied states
- text fitting
- navigation by role
- accessibility basics
- Arabic wording and labels
- dense business workflows without marketing-style landing pages

### Phase 7: Security

Run:

```text
/security-audit
```

Require checks for:

- RLS coverage
- financial visibility
- service role leaks
- secrets in Git
- auth bypass
- insecure client-side permission logic
- Supabase Realtime access
- Storage policies
- audit logs for sensitive actions
- rate limiting or abuse protection for auth/forms where applicable

### Phase 8: Testing

Require:

- TypeScript check
- lint
- unit tests where useful
- Playwright E2E tests

Minimum E2E tests:

- Manager creates project and assigns engineer.
- Engineer updates task progress.
- Accountant records payment.
- Engineer cannot see costs/invoices/payments.
- RTL/mobile layout loads correctly.
- Permission-denied states appear for unauthorized role access.

### Phase 9: Deploy

Use Vercel MCP/CLI:

- Link GitHub repo
- Set env vars in Vercel
- Deploy preview
- Check logs
- Verify production URL

## When To Use Plan Mode

Use Plan Mode for:

- starting the app
- database schema design
- RLS/security design
- role/permission changes
- big UI architecture changes
- deployment decisions

You can skip Plan Mode only for tiny fixes, copy edits, or obvious bugs.

## What To Ask Claude After Each Phase

Use this checklist:

```text
Before continuing, review what you built.
List:
1. What changed
2. What tests passed
3. What is not verified yet
4. Security risks remaining
5. The next best step
```

## Important Rules

- Never paste Supabase service role key into frontend files.
- Never commit `.env` or tokens.
- Never use localStorage passwords for production.
- Never trust UI hiding alone for financial data.
- Never call the app ready before testing all roles.
- Always run security review before client handoff.
- Always verify UI with Playwright/browser, not screenshots in your head.
- Use MCP Tool Search normally; do not ask Claude to load every MCP tool schema into context manually.
- Prefer subagents for security/UI/QA review so the main chat stays focused.
- Use `ultrathink` in a one-off prompt only when you need extra deep reasoning without changing the whole session.

## If Claude Gets Confused

Tell it:

```text
Stop. Re-read CLAUDE.md and docs/CLIENT_REQUIREMENTS.md.
This project is only the engineering office app.
Ignore the soil laboratory app.
Return to Plan Mode and explain the next step before editing.
```

## If You Hit Limits

When Claude says session limit reached, stop. Do not keep restarting random sessions.

After reset:

```powershell
cd C:\Users\Public\projrcts\hamza
claude --resume
```

Then ask:

```text
Continue from the last approved plan. First summarize current status from the repo, then continue.
```

## Final Client Handoff Checklist

Before showing the client:

- Login works.
- Manager role works.
- Engineer role works.
- Accountant role works.
- Financial data is hidden from engineers.
- Supabase RLS tests pass.
- Mobile layout is usable.
- Arabic RTL is clean.
- Vercel deployment works.
- No secrets in Git.
- Backup/export plan documented.
- Known limitations documented.

## Official Docs Checked

- Claude Code model configuration: `https://code.claude.com/docs/en/model-config`
- Claude Code permissions: `https://code.claude.com/docs/en/permissions`
- Claude Code settings: `https://code.claude.com/docs/en/settings`
- Claude Code MCP: `https://code.claude.com/docs/en/mcp`
- Claude Code skills/custom commands: `https://code.claude.com/docs/en/slash-commands`
- Claude Code subagents: `https://code.claude.com/docs/en/subagents`
- Claude Code hooks: `https://code.claude.com/docs/en/hooks`
