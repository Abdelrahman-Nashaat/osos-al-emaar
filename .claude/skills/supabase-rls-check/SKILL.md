---
name: supabase-rls-check
description: Review or design Supabase schemas and RLS policies for the engineering office app, especially role-based access and hidden financial data.
---

Use this skill before applying Supabase migrations or when reviewing auth/database code.

Checklist:

1. Profiles and roles must be derived from authenticated users, not client-submitted role strings.
2. Engineers must not be able to select, subscribe to, or infer project costs, invoice amounts, payments, or financial reports.
3. General managers can read and mutate all business records.
4. Accountants can read clients and financial records, and mutate invoices/payments according to the product workflow.
5. Engineers can read assigned/team operational records and update only allowed task progress/comment fields.
6. Policies must cover Realtime paths as well as normal SQL reads.
7. Service role keys stay server-only and never appear in client bundles.
8. Add tests or SQL checks for manager, engineer, and accountant access before handoff.
