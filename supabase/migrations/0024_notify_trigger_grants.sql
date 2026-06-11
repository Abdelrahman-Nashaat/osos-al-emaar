-- 0024_notify_trigger_grants.sql
-- notify_task_event / notify_invoice_event are TRIGGER-ONLY functions: triggers
-- execute them as the table owner, so no API role ever needs EXECUTE. 0022
-- missed the revoke (the anon_security_definer_function_executable advisor
-- flagged both). Same posture as the 0012 trigger function.

revoke all on function public.notify_task_event()    from public, anon, authenticated;
revoke all on function public.notify_invoice_event() from public, anon, authenticated;
