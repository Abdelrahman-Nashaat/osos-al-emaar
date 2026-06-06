# Client Requirements Summary

Source: public Claude shared chats reviewed on 2026-06-06.

Use only the engineering office requirements in this file. The later soil laboratory app mentioned in one shared chat is a separate future project and is out of scope here.

## Confirmed Direction

- Product: engineering consulting office management app.
- Location context: Dammam, Saudi Arabia.
- App type: web app opened from the browser, installable on mobile as a PWA.
- Data model: real shared backend/database, not browser-only localStorage.
- Team usage: manager and employees use the system at the same time from different devices.
- Proposed backend from chat: Supabase.

## Modules

- Dashboard with quick stats, project progress, urgent tasks, overdue work, and team activity.
- Projects with status, progress, assigned engineers, dates, clients, notes, and costs.
- Tasks with assignee, project, status, priority, due date, progress, and comments/updates.
- Clients with contact/company details, country, linked projects, and financial totals for authorized roles.
- Invoices and payments with paid/pending/overdue states, collections, payment registration, and accounting reports.
- Employees/team with roles, permissions, active projects, and task load.
- Portfolio/work gallery for completed projects.
- Offers/contracts for requests, proposals, and agreement tracking.

## Roles And Permissions

- General manager: full access to all modules, assigns tasks, approves payments, manages team and permissions.
- Engineer: sees work/projects/tasks, updates progress and notes, financial data hidden. Can add/edit projects/tasks only if manager grants that extra permission.
- Accountant: manages invoices, collections, payments, client financial visibility, and financial reports.

## Non-Negotiables

- Financial amounts are hidden from engineers at both UI and database policy levels.
- Manager controls login/access and per-engineer extra permissions.
- Real date fields and overdue detection.
- Clear task ownership; no "unknown" task/employee/project states.
- Real multi-device sync.
- Production-ready auth and database security before real client data.

## Recommended Initial Build

1. Create Supabase schema with roles, profiles, employees, clients, projects, tasks, task updates, invoices, payments, offers/contracts, and portfolio items.
2. Implement Supabase Auth and RLS before building the polished UI.
3. Build Arabic RTL dashboard and module navigation.
4. Build manager workflow: invite/add employee, grant role, create client, create project, assign engineers, assign tasks.
5. Build engineer workflow: view assigned/team tasks, filter tasks, update progress, add notes.
6. Build accountant workflow: invoices, payment collection, reports.
7. Add Playwright tests for role visibility, especially hidden amounts for engineers.
