-- 0003_revoke_anon_execute.sql
-- Supabase grants anon/authenticated EXECUTE directly on new public functions.
-- Remove anon's EXECUTE on the RBAC helpers (unauthenticated callers have no business
-- calling them). `authenticated` keeps EXECUTE because RLS policies invoke these helpers.
-- The remaining "authenticated can execute" advisory is accepted: these helpers only ever
-- return the *caller's own* role/permission, never another user's data.

revoke execute on function
  public.current_app_role(),
  public.is_manager(),
  public.is_accountant(),
  public.can_view_financials(),
  public.has_perm(text)
from anon;

-- ensure_rls event-trigger helper: not meant to be called via the API by anyone.
revoke execute on function public.rls_auto_enable() from anon, authenticated;
