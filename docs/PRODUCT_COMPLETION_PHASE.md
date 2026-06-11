# Product Completion Phase — Decision Note

Date: 2026-06-11 · Owner: autonomous product/dev phase (operator-approved standing autonomy)

## Why this phase

Hamza was busy when he specified the app; he listed what was top-of-mind, not everything
the office needs. Evidence gathered first-hand for this note:

- Both original client chats re-read in full (claude.ai shares). Hamza **himself** picked
  «معرض الأعمال» and «طلبات العروض والعقود» as features (chat 1), asked for calendar
  linkage («وابغاه يرتبط بالتقويم»), wants it global («قابل ان يكون عالمي»), and his
  office designs villas (his first request was a villa render).
- Live walkthrough of production as manager + engineer + accountant (real flows:
  add staff, client → project → financials → member → task → start → progress →
  invoice → send → partial payment). All role gates held; UX gaps recorded.
- DB/advisor/Vercel audit: schema 0000–0017 healthy, advisors baseline unchanged,
  prod service-role key fixed (staff creation verified live on 2026-06-11).
- ZATCA Phase-1 rules confirmed from zatca.gov.sa (simplified B2C invoice → 5-tag TLV
  Base64 QR; only applies when VAT-registered — so it must be configurable).
- Comparable products (Monograph/BQE) confirm the small-firm core: projects, fees,
  invoices, **documents**, milestones — not timesheets/ERP for an office this size.

## Decided scope (6 slices)

1. **Platform & identity foundation**
   - Fix: static pages (/login) ship zero-nonce scripts → all JS CSP-blocked in prod
     (login works only as no-JS form; SW never registers from /login). Force dynamic
     rendering under the proxy's CSP so nonces always match.
   - New: «إعدادات المكتب» (office_settings, singleton): office name, CR no., VAT no.
     (optional), address, phone, email, invoice footer note. Manager edits; all staff
     read (letterhead data, not financial). Feeds invoice/quotation prints + header.
   - Consistent Arabic date formatting lib (Gregorian, Latin digits) across all tables/
     details; country display name (default «السعودية»).
2. **Attachments everywhere (المرفقات)** — Supabase Storage (private bucket) + attachments
   table (entity_type: project/task/client/offer/invoice/portfolio). Engineers upload
   deliverables on their projects/tasks (the real daily flow that lives on WhatsApp today).
   Financial-entity attachments (invoice/offer) visible to manager+accountant only — DB +
   storage policies, same hard isolation as amounts. Signed URLs only; 10MB/file cap.
3. **Offers/Contracts (عروض الأسعار)** — client-picked module. offers + offer_events,
   numbered OFR-xxxxx, lifecycle draft→sent→accepted/rejected/expired via SECURITY DEFINER
   fns only; accept → one-click convert to project (carries contract value into
   project_financials atomically). Financial module: manager edits, accountant views,
   **engineers: no access** (engineer `offers.view` default flipped to false — offers are
   amounts by nature; matches the locked financial rule). Printable quotation doc on
   office letterhead.
4. **Portfolio (معرض الأعمال)** — client-picked module. portfolio_items (+ images via the
   attachments infra), categories (سكني/تجاري/إشراف/…), year, location, link to project,
   «أضف للمعرض» from completed projects. Visible to all staff; manager curates. No amounts.
5. **Notifications + Calendar** — in-app bell + unread badge fed by DB triggers on
   task_events (assigned/submitted/reopened/closed → the right person) and financial
   events (to financial roles only; never to engineers). Realtime toast via existing
   RLS-aware channel. «التقويم»: month view of task/project due dates (+ invoice dues for
   financial roles only) + per-task .ics download. Google Calendar OAuth **rejected**
   (needs client's Google Cloud account; .ics covers the need now).
6. **Finance & CRM polish** — professional printable invoice (letterhead, «فاتورة ضريبية»
   when VAT-registered + ZATCA Phase-1 TLV QR, bilingual labels, payments/balance);
   client detail page with statement «كشف حساب» (financial part gated); reports VAT-period
   line; team task-load badges; engineer dashboard «مهامي القادمة» list.

## Explicitly rejected (and why)

- Timesheets/hourly billing — fixed-fee villa work; adds daily friction with no ask.
- Expense ledger / payroll / HR — beyond office ask; `cost` field already on financials.
- Client-facing portal logins — out of scope of an internal tool; revisit post-launch.
- Google Calendar OAuth sync — external account + consent screen owned by client; .ics now.
- WhatsApp/SMS/email sending — needs paid provider accounts; notification center covers it.
- Multi-tenant — ADR-1 locked (single office per deployment).
- Gantt/resource planning — Monograph-class complexity unjustified at this team size.

## Hard rules carried forward

- Engineers can never see amounts: UI, DB RLS, Realtime payloads, attachments on financial
  entities, notifications content. Every new table ships with RLS + e2e leak probes.
- All writes to new financial/lifecycle tables go through SECURITY DEFINER functions that
  re-check authority and write audit/events atomically (same pattern as tasks/invoices).
- Staging only; ZZZ-prefixed disposable data; snapshot before each migration batch.
