---
name: engineering-office-brief
description: Use when planning or implementing the engineering office app. Loads the client requirements and keeps the work focused on the engineering office, not the soil lab app.
---

Read `CLAUDE.md` and `docs/CLIENT_REQUIREMENTS.md` first.

When using this skill:

1. Keep the app scope limited to the engineering consulting office.
2. Preserve Arabic RTL as a first-class requirement.
3. Treat Supabase Auth, Postgres, Realtime, Storage, and RLS as production foundations, not optional polish.
4. Prioritize the manager-to-engineer task assignment workflow, engineer progress updates, and accountant collection/payment workflow.
5. Do not mark the feature production-ready until role-based financial visibility is enforced by database policy and verified by tests.
