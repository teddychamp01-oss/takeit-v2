-- Rollback for 20260827000400_functions_triggers.sql
-- Functions are dropped by EXACT SIGNATURE (repo law: a rollback that asserts
-- on function NAME alone can hit the wrong overload or never match).
-- Run AFTER 000500_down (its policies reference has_role) — or rely on the
-- fact that 000500_down has already dropped every dependent policy.

-- triggers first
drop trigger if exists on_auth_user_created           on auth.users;
drop trigger if exists trg_reviews_recompute_rating   on public.reviews;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'worker_profiles', 'verifications', 'guarantors',
    'service_categories', 'service_packages', 'jobs', 'applications',
    'bookings', 'payments', 'payouts', 'reports', 'disputes',
    'guarantee_claims', 'business_accounts'
  ] loop
    execute format('drop trigger if exists trg_%I_updated_at on public.%I', t, t);
  end loop;
end
$$;

-- RPCs
drop function if exists public.rpc_post_job(text, text, text, text, text, text, double precision, double precision, boolean, text, text, date, text, bigint, integer);
drop function if exists public.rpc_apply_to_job(uuid, text, text);
drop function if exists public.rpc_accept_application(uuid, bigint);
drop function if exists public.rpc_booking_start(uuid);
drop function if exists public.rpc_booking_worker_done(uuid);
drop function if exists public.rpc_booking_customer_confirm(uuid);
drop function if exists public.rpc_booking_cancel(uuid, text);
drop function if exists public.rpc_booking_dispute(uuid, text, jsonb);
drop function if exists public.rpc_log_offapp_payment(uuid, bigint);
drop function if exists public.rpc_send_message(uuid, text);
drop function if exists public.rpc_submit_review(uuid, integer, text);
drop function if exists public.nearby_workers(double precision, double precision, text, integer);

-- maintenance
drop function if exists public.auto_release_bookings();
drop function if exists public.publish_due_reviews();

-- trigger functions
drop function if exists public.handle_new_user();
drop function if exists public.recompute_worker_rating();
drop function if exists public.set_updated_at();

-- helpers (has_role last — policies referencing it must already be gone)
drop function if exists public.enqueue_notification(uuid, text, jsonb);
drop function if exists public.audit_write(uuid, text, text, uuid, jsonb);
drop function if exists public.mask_phone_numbers(text);
drop function if exists public.text_contains_phone(text);
drop function if exists public.mask_phone(text);
drop function if exists public.verification_level_rank(public.verification_level);
drop function if exists public.has_role(uuid, public.app_role);
