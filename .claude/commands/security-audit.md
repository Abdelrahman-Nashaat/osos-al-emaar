Run a security review for the engineering office app.

Focus on:

1. Supabase RLS policies
2. Auth/session handling
3. Role and permission checks
4. Financial data hidden from engineers
5. Service role key leakage
6. Secrets in Git
7. Client-side-only authorization
8. Supabase Realtime policy coverage
9. Storage policy coverage
10. Missing tests

Use the `supabase-security-reviewer` agent if available.

Return findings first, ordered by severity, with file references and concrete fixes.
