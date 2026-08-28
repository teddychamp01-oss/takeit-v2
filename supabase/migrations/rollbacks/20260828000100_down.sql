-- =============================================================================
-- Rollback for 20260828000100_perf_rls_initplan.
--
-- Un-hoists the 47 has_role() calls: (select public.has_role(x,'r')) -> the
-- bare public.has_role(x,'r') of migration 000500. Same 20 policies, ALTER
-- POLICY only, one transaction.
--
-- WHAT ROLLING BACK COSTS YOU
--   Security: nothing. The hoist is a planner hint; the boolean logic is
--   identical, proven by the equivalence guard in both directions.
--   Performance: you go back to a per-row SECURITY DEFINER call in 20 policies.
--   At today's data volume (5 jobs, 10 profiles) that is measurably zero. This
--   rollback is therefore cheap and safe — unlike the A1 rollback, which
--   restores a live outage.
--
-- WHEN NOT TO RUN THIS
--   If migration 20260828000800 (A1) has been applied on top, jobs_select no
--   longer has the text this file would restore. Guard G4 below refuses in that
--   case rather than silently reinstating the pre-A1 worker_profiles EXISTS and
--   with it the jobs/applications 42501 outage. Roll A1 back first, or hand-
--   write the A1-aware un-hoisted jobs_select.
--
-- SOURCE OF TRUTH
--   The 20 expressions below are the 000500 texts, confirmed character-for-
--   character against a live `pg_policies` read (47 bare calls / 0 hoisted /
--   40 policies) before this was written. pg_policies — not the migration
--   directory — is the source of truth: this database has known live/file
--   drift elsewhere (rpc_admin_search_users). Re-confirm before running.
-- =============================================================================

begin;

create temp table _perf_rls_initplan_down_before on commit drop as
select tablename, policyname, cmd, permissive,
       roles::text as roles_txt, qual as qual_txt, with_check as check_txt
from pg_policies
where schemaname = 'public';

-- ---------------------------------------------------------------------------
-- PREFLIGHT
-- ---------------------------------------------------------------------------
do $preflight$
declare
  v_n         int;
  v_jobs_qual text;
  v_missing   text;
begin
  -- G1: exactly one public.has_role overload, pinned by regprocedure.
  select count(*) into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'has_role';
  if coalesce(v_n, -1) <> 1 then
    raise exception 'ROLLBACK PREFLIGHT G1 FAILED: expected exactly 1 public.has_role overload, found %.', coalesce(v_n, -1);
  end if;
  perform ('public.has_role(uuid, public.app_role)'::regprocedure);

  -- G3: all 20 policies must still be present.
  create temp table _perf_rls_initplan_down_expected (policyname text primary key) on commit drop;
  insert into _perf_rls_initplan_down_expected values
    ('profiles_select'),('user_roles_admin_select'),('verifications_select'),
    ('verifications_ops_update'),('guarantors_select'),('guarantors_ops_update'),
    ('jobs_select'),('applications_select'),('bookings_select'),('payments_select'),
    ('payouts_select'),('reviews_select'),('reports_select'),('reports_ops_update'),
    ('disputes_select'),('disputes_ops_update'),('guarantee_claims_select'),
    ('guarantee_claims_ops_update'),('business_accounts_select'),('audit_log_admin_select');

  select string_agg(e.policyname, ', ' order by e.policyname) into v_missing
  from _perf_rls_initplan_down_expected e
  where not exists (select 1 from pg_policies p
                    where p.schemaname = 'public' and p.policyname = e.policyname);
  if v_missing is not null then
    raise exception 'ROLLBACK PREFLIGHT G3 FAILED: policy/policies absent: %', v_missing;
  end if;

  -- G4: refuse if A1 (20260828000800) is on top of us.
  select p.qual into v_jobs_qual
  from pg_policies p
  where p.schemaname = 'public' and p.tablename = 'jobs' and p.policyname = 'jobs_select';

  if coalesce(v_jobs_qual, '') = '' then
    raise exception 'ROLLBACK PREFLIGHT G4 FAILED: jobs_select has a NULL/empty USING expression.';
  end if;
  if position('worker_job_match' in v_jobs_qual) > 0 then
    raise exception
      'ROLLBACK PREFLIGHT G4 FAILED: jobs_select references worker_job_match, i.e. migration 20260828000800 (A1) is applied on top. Restoring the 000500 text here would REINSTATE the jobs/applications 42501 outage. Roll A1 back first, or un-hoist the A1 text by hand.';
  end if;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- UN-HOIST — 20 policies, 47 calls, ALTER POLICY only
-- ---------------------------------------------------------------------------
alter policy profiles_select on public.profiles
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

alter policy user_roles_admin_select on public.user_roles
  using (public.has_role((select auth.uid()), 'admin'));

alter policy verifications_select on public.verifications
  using (
    user_id = (select auth.uid())
    or public.has_role((select auth.uid()), 'admin')
    or public.has_role((select auth.uid()), 'ops')
  );

alter policy verifications_ops_update on public.verifications
  using (public.has_role((select auth.uid()), 'admin')
         or public.has_role((select auth.uid()), 'ops'))
  with check (public.has_role((select auth.uid()), 'admin')
              or public.has_role((select auth.uid()), 'ops'));

alter policy guarantors_select on public.guarantors
  using (
    worker_id = (select auth.uid())
    or public.has_role((select auth.uid()), 'admin')
    or public.has_role((select auth.uid()), 'ops')
  );

alter policy guarantors_ops_update on public.guarantors
  using (public.has_role((select auth.uid()), 'admin')
         or public.has_role((select auth.uid()), 'ops'))
  with check (public.has_role((select auth.uid()), 'admin')
              or public.has_role((select auth.uid()), 'ops'));

alter policy jobs_select on public.jobs
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

alter policy applications_select on public.applications
  using (
    worker_id = (select auth.uid())
    or exists (
      select 1 from public.jobs j
      where j.id = public.applications.job_id
        and j.customer_id = (select auth.uid()))
    or public.has_role((select auth.uid()), 'admin')
    or public.has_role((select auth.uid()), 'ops')
  );

alter policy bookings_select on public.bookings
  using (
    customer_id = (select auth.uid())
    or worker_id = (select auth.uid())
    or public.has_role((select auth.uid()), 'admin')
    or public.has_role((select auth.uid()), 'ops')
  );

alter policy payments_select on public.payments
  using (
    exists (
      select 1 from public.bookings b
      where b.id = public.payments.booking_id
        and ((select auth.uid()) in (b.customer_id, b.worker_id)))
    or public.has_role((select auth.uid()), 'admin')
    or public.has_role((select auth.uid()), 'ops')
  );

alter policy payouts_select on public.payouts
  using (
    worker_id = (select auth.uid())
    or public.has_role((select auth.uid()), 'admin')
    or public.has_role((select auth.uid()), 'ops')
  );

alter policy reviews_select on public.reviews
  using (
    reviewer_id = (select auth.uid())
    or is_published
    or created_at <= now() - interval '48 hours'
    or public.has_role((select auth.uid()), 'admin')
    or public.has_role((select auth.uid()), 'ops')
  );

alter policy reports_select on public.reports
  using (
    reporter_id = (select auth.uid())
    or public.has_role((select auth.uid()), 'admin')
    or public.has_role((select auth.uid()), 'ops')
  );

alter policy reports_ops_update on public.reports
  using (public.has_role((select auth.uid()), 'admin')
         or public.has_role((select auth.uid()), 'ops'))
  with check (public.has_role((select auth.uid()), 'admin')
              or public.has_role((select auth.uid()), 'ops'));

alter policy disputes_select on public.disputes
  using (
    opened_by = (select auth.uid())
    or exists (
      select 1 from public.bookings b
      where b.id = public.disputes.booking_id
        and ((select auth.uid()) in (b.customer_id, b.worker_id)))
    or public.has_role((select auth.uid()), 'admin')
    or public.has_role((select auth.uid()), 'ops')
  );

alter policy disputes_ops_update on public.disputes
  using (public.has_role((select auth.uid()), 'admin')
         or public.has_role((select auth.uid()), 'ops'))
  with check (public.has_role((select auth.uid()), 'admin')
              or public.has_role((select auth.uid()), 'ops'));

alter policy guarantee_claims_select on public.guarantee_claims
  using (
    claimant_id = (select auth.uid())
    or public.has_role((select auth.uid()), 'admin')
    or public.has_role((select auth.uid()), 'ops')
  );

alter policy guarantee_claims_ops_update on public.guarantee_claims
  using (public.has_role((select auth.uid()), 'admin')
         or public.has_role((select auth.uid()), 'ops'))
  with check (public.has_role((select auth.uid()), 'admin')
              or public.has_role((select auth.uid()), 'ops'));

alter policy business_accounts_select on public.business_accounts
  using (owner_id = (select auth.uid())
         or public.has_role((select auth.uid()), 'admin'));

alter policy audit_log_admin_select on public.audit_log
  using (public.has_role((select auth.uid()), 'admin'));

-- ---------------------------------------------------------------------------
-- POSTFLIGHT — the mirror image of the forward migration's guards. These have
-- also been demonstrated firing (see the rehearsal log); a rollback whose own
-- guards have never been seen to fail is exactly the defect this repo's
-- checklist calls out.
-- ---------------------------------------------------------------------------
do $postflight$
declare
  v_total    int;
  v_hoisted  int;
  v_pol      int;
  v_mismatch int;
  v_extra    text;
  r          record;
  v_before_u text;
  v_after_u  text;
  c_unwrap_pat text := '\( SELECT (public\.)?has_role\(\( SELECT auth\.uid\(\) AS uid\), (''[a-z_]+''::app_role)\) AS has_role\)';
  c_unwrap_rep text := '\1has_role(( SELECT auth.uid() AS uid), \2)';
begin
  -- P1: the has_role-carrying policy set is still exactly the expected 20
  select string_agg(x.policyname, ', ' order by x.policyname) into v_extra
  from (
    select p.policyname from pg_policies p
    where p.schemaname = 'public'
      and (select count(*) from regexp_matches(
             regexp_replace(coalesce(p.qual,'') || ' ~~ ' || coalesce(p.with_check,''), '\s+', ' ', 'g'),
             '(public\.)?has_role\s*\(', 'g')) > 0
    except
    select e.policyname from _perf_rls_initplan_down_expected e
  ) x;
  if v_extra is not null then
    raise exception 'ROLLBACK POSTFLIGHT P1 FAILED: unexpected policy/policies carry has_role(): %', v_extra;
  end if;

  -- P2: 47 calls, ZERO of them hoisted, across 20 policies
  select coalesce(sum(s.n_total), 0), coalesce(sum(s.n_hoisted), 0),
         count(*) filter (where s.n_total > 0)
    into v_total, v_hoisted, v_pol
  from (
    select (select count(*) from regexp_matches(t.txt, '(public\.)?has_role\s*\(', 'g'))           as n_total,
           (select count(*) from regexp_matches(t.txt, '\( SELECT (public\.)?has_role\s*\(', 'g')) as n_hoisted
    from (
      select regexp_replace(coalesce(p.qual,'') || ' ~~ ' || coalesce(p.with_check,''), '\s+', ' ', 'g') as txt
      from pg_policies p where p.schemaname = 'public'
    ) t
  ) s;
  if v_hoisted <> 0 then
    raise exception 'ROLLBACK POSTFLIGHT P2 FAILED: % hoisted has_role() call(s) survive — the un-hoist is incomplete.', v_hoisted;
  end if;
  if v_total <> 47 then
    raise exception 'ROLLBACK POSTFLIGHT P2 FAILED: expected 47 has_role() calls, found %.', v_total;
  end if;
  if v_pol <> 20 then
    raise exception 'ROLLBACK POSTFLIGHT P2 FAILED: expected 20 policies carrying has_role(), found %.', v_pol;
  end if;

  -- P3: cmd / roles / permissive / clause presence unchanged by the rollback
  select count(*) into v_mismatch
  from _perf_rls_initplan_down_before b
  full join (
    select tablename, policyname, cmd, permissive, roles::text as roles_txt,
           qual as qual_txt, with_check as check_txt
    from pg_policies where schemaname = 'public'
  ) a on a.tablename = b.tablename and a.policyname = b.policyname
  where a.policyname is null or b.policyname is null
     or a.cmd is distinct from b.cmd
     or a.permissive is distinct from b.permissive
     or a.roles_txt is distinct from b.roles_txt
     or (a.qual_txt is null) <> (b.qual_txt is null)
     or (a.check_txt is null) <> (b.check_txt is null);
  if coalesce(v_mismatch, -1) <> 0 then
    raise exception 'ROLLBACK POSTFLIGHT P3 FAILED: % policy row(s) changed cmd, roles, permissive or clause presence.', coalesce(v_mismatch, -1);
  end if;

  -- P4: equivalence. Un-hoisting BOTH sides must give the same text, i.e. the
  --     rollback removed the wrapper and nothing else.
  for r in
    select b.tablename, b.policyname,
           regexp_replace(coalesce(b.qual_txt,'') || ' ~~ ' || coalesce(b.check_txt,''), '\s+', ' ', 'g') as before_n,
           regexp_replace(coalesce(a.qual,'')     || ' ~~ ' || coalesce(a.with_check,''), '\s+', ' ', 'g') as after_n
    from _perf_rls_initplan_down_before b
    join pg_policies a on a.schemaname = 'public'
      and a.tablename = b.tablename and a.policyname = b.policyname
  loop
    v_before_u := regexp_replace(r.before_n, c_unwrap_pat, c_unwrap_rep, 'g');
    v_after_u  := regexp_replace(r.after_n,  c_unwrap_pat, c_unwrap_rep, 'g');
    if v_after_u is distinct from v_before_u then
      raise exception
        'ROLLBACK POSTFLIGHT P4 FAILED (%.%): the un-hoisted expression is not the same predicate. BEFORE=[%] AFTER=[%]',
        r.tablename, r.policyname, v_before_u, v_after_u;
    end if;
  end loop;

  select count(*) into v_pol from _perf_rls_initplan_down_before;
  if coalesce(v_pol, 0) <> 40 then
    raise exception 'ROLLBACK POSTFLIGHT P4 FAILED: expected 40 policies in the before-snapshot, found % — the equivalence loop did not cover the schema.', coalesce(v_pol, 0);
  end if;

  raise notice 'perf_rls_initplan ROLLBACK OK: 40 policies compared, 20 restored, 47 has_role() calls bare, 0 hoisted, 0 expression divergences.';
end
$postflight$;

commit;
