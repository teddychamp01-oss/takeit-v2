-- =============================================================================
-- Take It v2 — 000200 enums
-- All enums from SPEC.md "Database schema v2". Wrapped so the file is safe to
-- re-apply (create type has no IF NOT EXISTS).
-- =============================================================================

do $$ begin
  create type public.app_role as enum ('admin', 'ops', 'support');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.availability_status as enum
    ('available_now', 'available_today', 'busy', 'off');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.badge_level as enum ('new', 'rising', 'trusted', 'pro', 'top');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.verification_level as enum
    ('none', 'basic', 'id_verified', 'fayda_verified', 'pro_certified');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.verification_method as enum ('manual_id', 'fayda_ekyc');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.verification_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.guarantor_type as enum
    ('idir', 'equb', 'employer', 'verified_worker');
exception when duplicate_object then null; end $$;

-- SPEC lists a status column on guarantors without naming values.
do $$ begin
  create type public.guarantor_status as enum ('pending', 'verified', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.job_status as enum
    ('open', 'matched', 'in_progress', 'completed', 'cancelled', 'disputed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.application_status as enum
    ('pending', 'accepted', 'rejected', 'withdrawn');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.booking_status as enum
    ('confirmed', 'started', 'worker_done', 'customer_confirmed',
     'disputed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_provider as enum ('chapa', 'offapp');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_status as enum
    ('logged', 'initiated', 'held', 'released', 'refunded', 'failed');
exception when duplicate_object then null; end $$;

-- SPEC lists a status column on payouts without naming values.
do $$ begin
  create type public.payout_status as enum ('pending', 'processing', 'paid', 'failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.review_direction as enum ('c_to_w', 'w_to_c');
exception when duplicate_object then null; end $$;

-- SPEC lists status columns on reports/disputes/guarantee_claims without values.
do $$ begin
  create type public.report_status as enum ('open', 'reviewing', 'resolved', 'dismissed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.dispute_status as enum ('open', 'reviewing', 'resolved', 'dismissed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.claim_status as enum
    ('submitted', 'reviewing', 'approved', 'denied', 'paid_via_provider');
exception when duplicate_object then null; end $$;
