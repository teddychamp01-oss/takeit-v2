-- Rollback for 20260828000800_fix_jobs_select_geo.
--
-- WARNING, READ BEFORE RUNNING: rolling this back RESTORES A PRODUCTION OUTAGE.
-- The previous jobs_select reads worker_profiles.geo directly, which
-- `authenticated` cannot select since migration 000710 — every read of
-- public.jobs (and of applications, which sub-selects jobs) fails with 42501.
-- This file exists for completeness of the migration pair, not because rolling
-- back is ever a good idea. If the forward migration is wrong, fix forward.

begin;

alter policy jobs_select on public.jobs
using (
  (customer_id = (select auth.uid()))
  or (exists (
        select 1 from public.bookings b
        where b.job_id = jobs.id and b.worker_id = (select auth.uid())
      ))
  or (
    status = 'open'::public.job_status
    and exists (
      select 1 from public.worker_profiles wp
      where wp.user_id = (select auth.uid())
        and jobs.category_slug = any (wp.categories)
        and (wp.geo is null or jobs.service_geo is null
             or extensions.st_dwithin(jobs.service_geo, wp.geo,
                  (wp.travel_radius_km * 1000)::double precision))
    )
  )
  or public.has_role((select auth.uid()), 'admin'::public.app_role)
  or public.has_role((select auth.uid()), 'ops'::public.app_role)
);

drop function if exists public.worker_job_match(text, extensions.geography);

commit;
