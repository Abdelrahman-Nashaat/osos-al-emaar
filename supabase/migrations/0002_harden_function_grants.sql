-- 0002_harden_function_grants.sql
-- Least-privilege for the SECURITY DEFINER RLS helpers: remove the implicit PUBLIC
-- (anon) EXECUTE grant; keep EXECUTE for `authenticated` (required when RLS policies
-- call these functions) and `service_role`. Silences the anon-executable advisor.

revoke execute on function
  public.current_app_role(),
  public.is_manager(),
  public.is_accountant(),
  public.can_view_financials(),
  public.has_perm(text)
from public;

grant execute on function
  public.current_app_role(),
  public.is_manager(),
  public.is_accountant(),
  public.can_view_financials(),
  public.has_perm(text)
to authenticated, service_role;

-- The ensure_rls event-trigger helper is never meant to be called via the API.
revoke execute on function public.rls_auto_enable() from public;
