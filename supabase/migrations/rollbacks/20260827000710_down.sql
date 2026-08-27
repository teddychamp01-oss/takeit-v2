-- Rollback for 20260827000710_restrict_sensitive_columns.
-- Restores the table-wide SELECT grants (re-exposing geo + telegram_id) and
-- drops the admin directory RPC. Only roll back if the forward migration is
-- broken; re-apply a corrected version immediately (the exposure is a real
-- MEDIUM finding).

begin;

drop function if exists public.rpc_admin_search_users(uuid, text, int);

-- restore table-wide SELECT (original baseline grant)
revoke select on public.worker_profiles from authenticated;
grant select on public.worker_profiles to authenticated;

revoke select on public.profiles from authenticated;
grant select on public.profiles to authenticated;

commit;
