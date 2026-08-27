-- Rollback for 20260827000300_tables.sql
-- DESTRUCTIVE: drops all Take It tables and their data.
-- Tables are dropped in reverse dependency order; no CASCADE needed when the
-- later rollbacks (000600/000500/000400) have run first, but each drop still
-- succeeds standalone because children are dropped before parents.

drop table if exists public.audit_log;
drop table if exists public.notifications;
drop table if exists public.business_accounts;
drop table if exists public.saved_workers;
drop table if exists public.guarantee_claims;
drop table if exists public.disputes;
drop table if exists public.reports;
drop table if exists public.reviews;
drop table if exists public.messages;
drop table if exists public.payouts;
drop table if exists public.payments;
drop table if exists public.bookings;
drop table if exists public.applications;
drop table if exists public.jobs;
drop table if exists public.service_packages;
drop table if exists public.service_categories;
drop table if exists public.guarantors;
drop table if exists public.verifications;
drop table if exists public.worker_profiles;
drop table if exists public.user_roles;
drop table if exists public.profiles;
