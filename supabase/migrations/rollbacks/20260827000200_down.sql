-- Rollback for 20260827000200_enums.sql
-- Requires 000300_down to have run (tables reference these types).

drop type if exists public.claim_status;
drop type if exists public.dispute_status;
drop type if exists public.report_status;
drop type if exists public.review_direction;
drop type if exists public.payout_status;
drop type if exists public.payment_status;
drop type if exists public.payment_provider;
drop type if exists public.booking_status;
drop type if exists public.application_status;
drop type if exists public.job_status;
drop type if exists public.guarantor_status;
drop type if exists public.guarantor_type;
drop type if exists public.verification_status;
drop type if exists public.verification_method;
drop type if exists public.verification_level;
drop type if exists public.badge_level;
drop type if exists public.availability_status;
drop type if exists public.app_role;
