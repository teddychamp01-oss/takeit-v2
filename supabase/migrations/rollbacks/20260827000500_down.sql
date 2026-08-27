-- Rollback for 20260827000500_rls.sql
--
-- DELIBERATE: RLS stays ENABLED on every table after this rollback.
-- Dropping policies while leaving RLS on means deny-by-default for client
-- roles — rolling back the RLS migration must never OPEN the database.
-- Client grants are also revoked, so anon/authenticated end at zero access.

drop policy if exists profiles_select               on public.profiles;
drop policy if exists profiles_insert_own           on public.profiles;
drop policy if exists profiles_update_own           on public.profiles;
drop policy if exists user_roles_admin_select       on public.user_roles;
drop policy if exists worker_profiles_select        on public.worker_profiles;
drop policy if exists worker_profiles_insert_own    on public.worker_profiles;
drop policy if exists worker_profiles_update_own    on public.worker_profiles;
drop policy if exists verifications_select          on public.verifications;
drop policy if exists verifications_insert_own      on public.verifications;
drop policy if exists verifications_ops_update      on public.verifications;
drop policy if exists guarantors_select             on public.guarantors;
drop policy if exists guarantors_insert_own         on public.guarantors;
drop policy if exists guarantors_ops_update         on public.guarantors;
drop policy if exists service_categories_select     on public.service_categories;
drop policy if exists service_packages_select       on public.service_packages;
drop policy if exists jobs_select                   on public.jobs;
drop policy if exists applications_select           on public.applications;
drop policy if exists bookings_select               on public.bookings;
drop policy if exists payments_select               on public.payments;
drop policy if exists payouts_select                on public.payouts;
drop policy if exists messages_select_parties       on public.messages;
drop policy if exists messages_mark_read            on public.messages;
drop policy if exists reviews_select                on public.reviews;
drop policy if exists reports_select                on public.reports;
drop policy if exists reports_insert_own            on public.reports;
drop policy if exists reports_ops_update            on public.reports;
drop policy if exists disputes_select               on public.disputes;
drop policy if exists disputes_ops_update           on public.disputes;
drop policy if exists guarantee_claims_select       on public.guarantee_claims;
drop policy if exists guarantee_claims_insert_own   on public.guarantee_claims;
drop policy if exists guarantee_claims_ops_update   on public.guarantee_claims;
drop policy if exists saved_workers_select_own      on public.saved_workers;
drop policy if exists saved_workers_insert_own      on public.saved_workers;
drop policy if exists saved_workers_delete_own      on public.saved_workers;
drop policy if exists business_accounts_select      on public.business_accounts;
drop policy if exists business_accounts_insert_own  on public.business_accounts;
drop policy if exists business_accounts_update_own  on public.business_accounts;
drop policy if exists notifications_select_own      on public.notifications;
drop policy if exists notifications_update_own      on public.notifications;
drop policy if exists audit_log_admin_select        on public.audit_log;

revoke all on all tables in schema public from anon, authenticated;
-- RLS intentionally NOT disabled — see header.
