Build one complete vertical slice from the approved plan.

Arguments describe the slice to build.

Before editing:

1. Re-read `CLAUDE.md` and `docs/CLIENT_REQUIREMENTS.md`.
2. State exactly what files/modules you expect to touch.
3. Confirm the role/security implications.

During implementation:

- Keep Arabic RTL first-class.
- Use Supabase and RLS for real permissions.
- Use Context7/current docs for library APIs.
- Add focused tests where the slice changes behavior.

After implementation:

- Run type/lint/test commands that exist.
- Use Playwright/browser verification if there is a UI.
- Summarize what changed, what passed, and what remains.
