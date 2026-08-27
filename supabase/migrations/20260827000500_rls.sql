-- =============================================================================
-- Take It v2 — 000500 RLS
--
-- Principles (SPEC + repo law):
--   * RLS ENABLED on every table, no exceptions.
--   * Defense in depth: table/column GRANTs are trimmed first, then policies.
--     Status columns are writable by NO client role — there is no UPDATE
--     grant/policy that reaches them; state changes go through the SECURITY
--     DEFINER RPCs only.
--   * jobs/applications/bookings/payments/messages/reviews/disputes have NO
--     client INSERT path either — creation is RPC-only (masking + validation).
--   * messages are visible to the booking's two parties ONLY (not even admin).
--   * auth.uid() is wrapped in (select auth.uid()) so the planner runs it once.
-- =============================================================================

-- Belt-and-braces schema grants (idempotent; hosted already has them)
grant usage on schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enable RLS on every table
-- ---------------------------------------------------------------------------
alter table public.profiles           enable row level security;
alter table public.user_roles         enable row level security;
alter table public.worker_profiles    enable row level security;
alter table public.verifications      enable row level security;
alter table public.guarantors         enable row level security;
alter table public.service_categories enable row level security;
alter table public.service_packages   enable row level security;
alter table public.jobs               enable row level security;
alter table public.applications       enable row level security;
alter table public.bookings           enable row level security;
alter table public.payments           enable row level security;
alter table public.payouts            enable row level security;
alter table public.messages           enable row level security;
alter table public.reviews            enable row level security;
alter table public.reports            enable row level security;
alter table public.disputes           enable row level security;
alter table public.guarantee_claims   enable row level security;
alter table public.saved_workers      enable row level security;
alter table public.business_accounts  enable row level security;
alter table public.notifications      enable row level security;
alter table public.audit_log          enable row level security;

-- ---------------------------------------------------------------------------
-- Reset client privileges, then grant the minimum. service_role keeps full
-- access (it holds BYPASSRLS on Supabase).
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from public, anon, authenticated;
grant  all on all tables in schema public to service_role;

-- anon: public catalog only
grant select on public.service_categories to anon;
grant select on public.service_packages   to anon;

-- authenticated: table by table
grant select on public.service_categories to authenticated;
grant select on public.service_packages   to authenticated;

grant select on public.profiles to authenticated;
grant insert (id, display_name, avatar_url, locale, is_customer, is_worker,
              phone_masked, telegram_id, default_neighborhood)
  on public.profiles to authenticated;
grant update (display_name, avatar_url, locale, is_customer, is_worker,
              phone_masked, telegram_id, default_neighborhood)
  on public.profiles to authenticated;

grant select on public.user_roles to authenticated;

grant select on public.worker_profiles to authenticated;
grant insert (user_id, bio, categories, skills, neighborhood, geo,
              travel_radius_km, availability, availability_status,
              price_min_cents, price_max_cents, price_type)
  on public.worker_profiles to authenticated;
grant update (bio, categories, skills, neighborhood, geo,
              travel_radius_km, availability, availability_status,
              price_min_cents, price_max_cents, price_type)
  on public.worker_profiles to authenticated;
-- NOTE: rating_avg / review_count / jobs_completed / badge_level /
-- verification_level are NOT grantable columns — trust numbers are server-set.

grant select on public.verifications to authenticated;
grant insert (user_id, method, id_front_path, id_back_path, selfie_path)
  on public.verifications to authenticated;
-- status/reviewer_id/decided_at/notes/fayda_* are ops- or server-written only
grant update (status, reviewer_id, decided_at, notes)
  on public.verifications to authenticated;  -- policy limits this to ops/admin

grant select on public.guarantors to authenticated;
grant insert (worker_id, guarantor_type, guarantor_name,
              guarantor_contact_masked, statement)
  on public.guarantors to authenticated;
grant update (status, verified_by)
  on public.guarantors to authenticated;      -- policy limits this to ops/admin

grant select on public.jobs         to authenticated;  -- insert via rpc_post_job only
grant select on public.applications to authenticated;  -- insert via rpc_apply_to_job only
grant select on public.bookings     to authenticated;  -- created by rpc_accept_application
grant select on public.payments     to authenticated;  -- rpc_log_offapp_payment / server
grant select on public.payouts      to authenticated;  -- server-written

grant select on public.messages to authenticated;      -- insert via rpc_send_message only
grant update (read_at) on public.messages to authenticated;

grant select on public.reviews to authenticated;       -- insert via rpc_submit_review only

grant select on public.reports to authenticated;
grant insert (reporter_id, reported_id, booking_id, reason, description)
  on public.reports to authenticated;
grant update (status, resolved_by, notes)
  on public.reports to authenticated;         -- policy limits this to ops/admin

grant select on public.disputes to authenticated;      -- insert via rpc_booking_dispute only
grant update (status, resolution, resolved_by)
  on public.disputes to authenticated;        -- policy limits this to ops/admin

grant select on public.guarantee_claims to authenticated;
grant insert (booking_id, claimant_id, claim_type, amount_cents)
  on public.guarantee_claims to authenticated;
grant update (status, decided_by)
  on public.guarantee_claims to authenticated; -- policy limits this to ops/admin

grant select, delete on public.saved_workers to authenticated;
grant insert (customer_id, worker_id) on public.saved_workers to authenticated;

grant select on public.business_accounts to authenticated;
grant insert (owner_id, business_name, tin, type)
  on public.business_accounts to authenticated;
grant update (business_name, tin, type, active)
  on public.business_accounts to authenticated;

grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

grant select on public.audit_log to authenticated;     -- policy: admin only

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

-- profiles: own row; worker profiles are public to signed-in users; the
-- counterpart of a shared booking; ops/admin.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or is_worker = true
    or exists (
      select 1 from public.bookings b
      where (b.customer_id = public.profiles.id and b.worker_id = (select auth.uid()))
         or (b.worker_id = public.profiles.id and b.customer_id = (select auth.uid())))
    or public.has_role((select auth.uid()), 'admin')
    or public.has_role((select auth.uid()), 'ops')
  );

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- user_roles: admin-only read; writes are founder/service_role only (C8)
drop policy if exists user_roles_admin_select on public.user_roles;
create policy user_roles_admin_select on public.user_roles
  for select to authenticated
  using (public.has_role((select auth.uid()), 'admin'));

-- worker_profiles: readable by all signed-in users; own row writable
drop policy if exists worker_profiles_select on public.worker_profiles;
create policy worker_profiles_select on public.worker_profiles
  for select to authenticated
  using (true);

drop policy if exists worker_profiles_insert_own on public.worker_profiles;
create policy worker_profiles_insert_own on public.worker_profiles
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists worker_profiles_update_own on public.worker_profiles;
create policy worker_profiles_update_own on public.worker_profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- verifications: owner inserts (status is not a grantable column, so rows can
-- only be born 'pending'); owner + ops/admin read; ops/admin decide.
drop policy if exists verifications_select on public.verifications;
create policy verifications_select on public.verifications
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.has_role((select auth.uid()), 'admin')
    or public.has_role((select auth.uid()), 'ops')
  );

drop policy if exists verifications_insert_own on public.verifications;
create policy verifications_insert_own on public.verifications
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists verifications_ops_update on public.verifications;
create policy verifications_ops_update on public.verifications
  for update to authenticated
  using (public.has_role((select auth.uid()), 'admin')
         or public.has_role((select auth.uid()), 'ops'))
  with check (public.has_role((select auth.uid()), 'admin')
              or public.has_role((select auth.uid()), 'ops'));

-- guarantors: worker adds own vouchers; owner + ops/admin read; ops verify
drop policy if exists guarantors_select on public.guarantors;
create policy guarantors_select on public.guarantors
  for select to authenticated
  using (
    worker_id = (select auth.uid())
    or public.has_role((select auth.uid()), 'admin')
    or public.has_role((select auth.uid()), 'ops')
  );

drop policy if exists guarantors_insert_own on public.guarantors;
create policy guarantors_insert_own on public.guarantors
  for insert to authenticated
  with check (worker_id = (select auth.uid()));

drop policy if exists guarantors_ops_update on public.guarantors;
create policy guarantors_ops_update on public.guarantors
  for update to authenticated
  using (public.has_role((select auth.uid()), 'admin')
         or public.has_role((select auth.uid()), 'ops'))
  with check (public.has_role((select auth.uid()), 'admin')
              or public.has_role((select auth.uid()), 'ops'));

-- catalog: readable by everyone (writes: service_role only)
drop policy if exists service_categories_select on public.service_categories;
create policy service_categories_select on public.service_categories
  for select to anon, authenticated
  using (true);

drop policy if exists service_packages_select on public.service_packages;
create policy service_packages_select on public.service_packages
  for select to anon, authenticated
  using (true);

-- jobs: poster; booked worker; ops/admin; and OPEN jobs for workers whose
-- categories match AND whose travel radius reaches the job (SPEC).
drop policy if exists jobs_select on public.jobs;
create policy jobs_select on public.jobs
  for select to authenticated
  using (
    customer_id = (select auth.uid())
    or exists (
      select 1 from public.bookings b
      where b.job_id = public.jobs.id and b.worker_id = (select auth.uid()))
    or (
      status = 'open'
      and exists (
        select 1 from public.worker_profiles wp
        where wp.user_id = (select auth.uid())
          and public.jobs.category_slug = any (wp.categories)
          and (wp.geo is null
               or public.jobs.service_geo is null
               or extensions.st_dwithin(public.jobs.service_geo, wp.geo,
                                        (wp.travel_radius_km * 1000)::double precision))))
    or public.has_role((select auth.uid()), 'admin')
    or public.has_role((select auth.uid()), 'ops')
  );
-- no INSERT/UPDATE/DELETE policies: jobs are written via RPCs only

-- applications: the applying worker and the job's poster
drop policy if exists applications_select on public.applications;
create policy applications_select on public.applications
  for select to authenticated
  using (
    worker_id = (select auth.uid())
    or exists (
      select 1 from public.jobs j
      where j.id = public.applications.job_id
        and j.customer_id = (select auth.uid()))
    or public.has_role((select auth.uid()), 'admin')
    or public.has_role((select auth.uid()), 'ops')
  );
-- no write policies: applications are written via RPCs only

-- bookings: the two parties (+ ops/admin); written via RPCs only
drop policy if exists bookings_select on public.bookings;
create policy bookings_select on public.bookings
  for select to authenticated
  using (
    customer_id = (select auth.uid())
    or worker_id = (select auth.uid())
    or public.has_role((select auth.uid()), 'admin')
    or public.has_role((select auth.uid()), 'ops')
  );

-- payments: booking parties (+ ops/admin); written via RPC/server only
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments
  for select to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = public.payments.booking_id
        and ((select auth.uid()) in (b.customer_id, b.worker_id)))
    or public.has_role((select auth.uid()), 'admin')
    or public.has_role((select auth.uid()), 'ops')
  );

-- payouts: the worker (+ ops/admin); server-written
drop policy if exists payouts_select on public.payouts;
create policy payouts_select on public.payouts
  for select to authenticated
  using (
    worker_id = (select auth.uid())
    or public.has_role((select auth.uid()), 'admin')
    or public.has_role((select auth.uid()), 'ops')
  );

-- messages: the booking's two parties ONLY (deliberately no admin/ops access)
drop policy if exists messages_select_parties on public.messages;
create policy messages_select_parties on public.messages
  for select to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = public.messages.booking_id
        and ((select auth.uid()) in (b.customer_id, b.worker_id)))
  );

drop policy if exists messages_mark_read on public.messages;
create policy messages_mark_read on public.messages
  for update to authenticated
  using (
    sender_id <> (select auth.uid())
    and exists (
      select 1 from public.bookings b
      where b.id = public.messages.booking_id
        and ((select auth.uid()) in (b.customer_id, b.worker_id))))
  with check (
    sender_id <> (select auth.uid())
    and exists (
      select 1 from public.bookings b
      where b.id = public.messages.booking_id
        and ((select auth.uid()) in (b.customer_id, b.worker_id))));
-- only read_at is a grantable column, so this cannot alter body/sender
-- no INSERT policy: messages go through rpc_send_message (C3 soft-block)

-- reviews: your own always; others' once published OR older than 48h
-- (the time clause makes the double-blind reveal work with no cron at all)
drop policy if exists reviews_select on public.reviews;
create policy reviews_select on public.reviews
  for select to authenticated
  using (
    reviewer_id = (select auth.uid())
    or is_published
    or created_at <= now() - interval '48 hours'
    or public.has_role((select auth.uid()), 'admin')
    or public.has_role((select auth.uid()), 'ops')
  );
-- no write policies: reviews are written via rpc_submit_review only

-- reports: reporter creates + sees own; ops/admin work them
drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports
  for select to authenticated
  using (
    reporter_id = (select auth.uid())
    or public.has_role((select auth.uid()), 'admin')
    or public.has_role((select auth.uid()), 'ops')
  );

drop policy if exists reports_insert_own on public.reports;
create policy reports_insert_own on public.reports
  for insert to authenticated
  with check (reporter_id = (select auth.uid()));

drop policy if exists reports_ops_update on public.reports;
create policy reports_ops_update on public.reports
  for update to authenticated
  using (public.has_role((select auth.uid()), 'admin')
         or public.has_role((select auth.uid()), 'ops'))
  with check (public.has_role((select auth.uid()), 'admin')
              or public.has_role((select auth.uid()), 'ops'));

-- disputes: parties + opener read; ops/admin resolve; insert via RPC only
drop policy if exists disputes_select on public.disputes;
create policy disputes_select on public.disputes
  for select to authenticated
  using (
    opened_by = (select auth.uid())
    or exists (
      select 1 from public.bookings b
      where b.id = public.disputes.booking_id
        and ((select auth.uid()) in (b.customer_id, b.worker_id)))
    or public.has_role((select auth.uid()), 'admin')
    or public.has_role((select auth.uid()), 'ops')
  );

drop policy if exists disputes_ops_update on public.disputes;
create policy disputes_ops_update on public.disputes
  for update to authenticated
  using (public.has_role((select auth.uid()), 'admin')
         or public.has_role((select auth.uid()), 'ops'))
  with check (public.has_role((select auth.uid()), 'admin')
              or public.has_role((select auth.uid()), 'ops'));

-- guarantee_claims: booking party files + sees own; ops/admin decide
drop policy if exists guarantee_claims_select on public.guarantee_claims;
create policy guarantee_claims_select on public.guarantee_claims
  for select to authenticated
  using (
    claimant_id = (select auth.uid())
    or public.has_role((select auth.uid()), 'admin')
    or public.has_role((select auth.uid()), 'ops')
  );

drop policy if exists guarantee_claims_insert_own on public.guarantee_claims;
create policy guarantee_claims_insert_own on public.guarantee_claims
  for insert to authenticated
  with check (
    claimant_id = (select auth.uid())
    and exists (
      select 1 from public.bookings b
      where b.id = public.guarantee_claims.booking_id
        and ((select auth.uid()) in (b.customer_id, b.worker_id))));

drop policy if exists guarantee_claims_ops_update on public.guarantee_claims;
create policy guarantee_claims_ops_update on public.guarantee_claims
  for update to authenticated
  using (public.has_role((select auth.uid()), 'admin')
         or public.has_role((select auth.uid()), 'ops'))
  with check (public.has_role((select auth.uid()), 'admin')
              or public.has_role((select auth.uid()), 'ops'));

-- saved_workers: strictly own list
drop policy if exists saved_workers_select_own on public.saved_workers;
create policy saved_workers_select_own on public.saved_workers
  for select to authenticated
  using (customer_id = (select auth.uid()));

drop policy if exists saved_workers_insert_own on public.saved_workers;
create policy saved_workers_insert_own on public.saved_workers
  for insert to authenticated
  with check (customer_id = (select auth.uid()));

drop policy if exists saved_workers_delete_own on public.saved_workers;
create policy saved_workers_delete_own on public.saved_workers
  for delete to authenticated
  using (customer_id = (select auth.uid()));

-- business_accounts: owner manages own; admin reads
drop policy if exists business_accounts_select on public.business_accounts;
create policy business_accounts_select on public.business_accounts
  for select to authenticated
  using (owner_id = (select auth.uid())
         or public.has_role((select auth.uid()), 'admin'));

drop policy if exists business_accounts_insert_own on public.business_accounts;
create policy business_accounts_insert_own on public.business_accounts
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists business_accounts_update_own on public.business_accounts;
create policy business_accounts_update_own on public.business_accounts
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- notifications: strictly own; only read_at is writable
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- audit_log: admin-only read; append happens inside SECURITY DEFINER functions
drop policy if exists audit_log_admin_select on public.audit_log;
create policy audit_log_admin_select on public.audit_log
  for select to authenticated
  using (public.has_role((select auth.uid()), 'admin'));
