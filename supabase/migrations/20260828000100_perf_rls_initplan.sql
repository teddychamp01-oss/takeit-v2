-- =============================================================================
-- 20260828000100_perf_rls_initplan
--
-- APPROVED PLAN ITEM A3 ONLY — "Hoist all 47 bare has_role() calls across 20
-- policies" (perf_plan_approved.md §3 A3).
--
-- WHAT THIS DOES
--   public.has_role(x,'r')  ->  (select public.has_role(x,'r'))
--   and NOTHING else. Same tables, same columns, same boolean logic, same
--   USING/WITH CHECK split, same roles, same cmd. `has_role` is SECURITY
--   DEFINER and therefore non-inlinable, so a bare call is evaluated per row;
--   wrapping it in a scalar subquery lets the planner run it once as an
--   InitPlan.
--
-- WHY ALTER POLICY AND NOT DROP + CREATE
--   ALTER POLICY cannot change `cmd`, and changes `roles` only if TO is passed.
--   Both are therefore preserved by construction — a DROP + CREATE pair can
--   silently widen either one. The whole file is still wrapped in an explicit
--   BEGIN/COMMIT so the 20 statements land atomically: no window exists in
--   which some policies are hoisted and others are not.
--
-- WHAT THIS DELIBERATELY DOES *NOT* DO (approved plan, respected):
--   * A1 (the jobs/applications 42501 outage fix, worker_job_match + the
--     jobs_select rewrite) is a SEPARATE migration, 20260828000800. The plan
--     is explicit: "Ship A3 *after* A1 has been verified in production, not in
--     the same migration." This file leaves the worker_profiles EXISTS disjunct
--     in jobs_select EXACTLY as migration 000500 wrote it. THE OUTAGE IS STILL
--     PRESENT AFTER THIS MIGRATION. That is intentional; A1 fixes it.
--   * A2 (ANALYZE the public schema) is a one-off maintenance command, not a
--     migration — plan §3 A2, "No file". The operator runs, outside this file:
--         ANALYZE;            -- before A1/A3, and again after
--   * NO INDEX IS CREATED HERE. There is no approved index addition anywhere in
--     the plan: every index proposal was rejected or deferred — R4 (jobs
--     created_at DESC,id), R5 (jobs status,created_at — provably unusable under
--     RLS because enum_eq is not leakproof), R6 (dropping "unused" indexes) and
--     R11 (16 FK cascade-hygiene indexes). Adding one would be shipping a
--     rejected item.
--   * NO INDEX IS DROPPED HERE (R6, and repo law).
--
-- GATES
--   Gate 1  : written against the adversarial review that approved A3.
--   Gate 2  : the four preflight guards and the four postflight guards below
--             were each DEMONSTRATED FIRING in local rehearsal before this
--             merged — see the rehearsal log in the PR. In particular P4 was
--             shown to catch the 'ops' -> 'admin' collapse typo, which is the
--             exact defect a hand-written 20-policy migration carries.
--   Gate 3  : 47 bare calls / 20 policies / 40 policies total are MEASURED
--             (from pg_policies), not estimated. The performance gain on
--             today's data is ZERO (5 jobs, 10 profiles) — this is a scale bet,
--             taken now because it is verifiable now and gets harder later.
--   Gate 4  : the real client's payloads are exercised in the rehearsal persona
--             matrix, but NOT through PostgREST (the sandbox cannot reach
--             *.supabase.co:443). Someone with network access must re-run the
--             persona matrix through a real PostgREST request before merge.
--
-- Rollback: supabase/migrations/rollbacks/20260828000100_down.sql
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0. BEFORE snapshot. Every postflight guard below diffs against this, so the
--    proof of "nothing but the hoist changed" is made against what was actually
--    live a moment ago — not against what the migration files say. (pg_policies
--    is the source of truth; the plan found live/file drift elsewhere in this
--    database.)
-- ---------------------------------------------------------------------------
create temp table _perf_rls_initplan_before on commit drop as
select tablename, policyname, cmd, permissive,
       roles::text as roles_txt,
       qual        as qual_txt,
       with_check  as check_txt
from pg_policies
where schemaname = 'public';

-- ---------------------------------------------------------------------------
-- 1. PREFLIGHT GUARDS
-- ---------------------------------------------------------------------------
do $preflight$
declare
  v_n         int;
  v_vol       "char";
  v_jobs_qual text;
  v_missing   text;
  v_wrong     text;
  v_rows      int;
begin
  -- G1: exactly one public.has_role overload, pinned by regprocedure.
  --     A second overload is the "verifier that cannot fail" disease this repo
  --     already documents: an unpinned lookup would silently pick either one.
  select count(*) into v_n
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'has_role';

  if coalesce(v_n, -1) <> 1 then
    raise exception
      'PREFLIGHT G1 FAILED: expected exactly 1 public.has_role overload, found %. Hoisting is unsafe until the ambiguity is resolved.',
      coalesce(v_n, -1);
  end if;

  -- raises 'function does not exist' if the exact signature is gone
  perform ('public.has_role(uuid, public.app_role)'::regprocedure);

  -- G2: has_role must be STABLE (or IMMUTABLE). Wrapping a VOLATILE function in
  --     a scalar subquery changes how many times it is called and when — that
  --     would be a semantic change, not a hoist.
  select p.provolatile into v_vol
  from pg_proc p
  where p.oid = 'public.has_role(uuid, public.app_role)'::regprocedure;

  if coalesce(v_vol, 'x') not in ('s', 'i') then
    raise exception
      'PREFLIGHT G2 FAILED: public.has_role(uuid,app_role) has provolatile=%, expected s (STABLE) or i (IMMUTABLE). Hoisting a VOLATILE function changes semantics.',
      coalesce(v_vol::text, '<null>');
  end if;

  -- G3: every policy this migration rewrites must exist and must still carry
  --     exactly the number of has_role() calls we are about to rewrite. A
  --     count that has moved means the live text is not the text this migration
  --     was written against — stop rather than overwrite it.
  create temp table _perf_rls_initplan_expected (policyname text primary key, n_calls int) on commit drop;
  insert into _perf_rls_initplan_expected values
    ('profiles_select',              2),
    ('user_roles_admin_select',      1),
    ('verifications_select',         2),
    ('verifications_ops_update',     4),
    ('guarantors_select',            2),
    ('guarantors_ops_update',        4),
    ('jobs_select',                  2),
    ('applications_select',          2),
    ('bookings_select',              2),
    ('payments_select',              2),
    ('payouts_select',               2),
    ('reviews_select',               2),
    ('reports_select',               2),
    ('reports_ops_update',           4),
    ('disputes_select',              2),
    ('disputes_ops_update',          4),
    ('guarantee_claims_select',      2),
    ('guarantee_claims_ops_update',  4),
    ('business_accounts_select',     1),
    ('audit_log_admin_select',       1);

  select count(*) into v_rows from _perf_rls_initplan_expected;
  if v_rows <> 20 then
    raise exception 'PREFLIGHT G3 FAILED: expectation table holds % rows, expected 20 (this file was edited incorrectly).', v_rows;
  end if;

  select string_agg(e.policyname, ', ' order by e.policyname) into v_missing
  from _perf_rls_initplan_expected e
  where not exists (
    select 1 from pg_policies p
    where p.schemaname = 'public' and p.policyname = e.policyname);

  if v_missing is not null then
    raise exception 'PREFLIGHT G3 FAILED: expected policy/policies absent: %', v_missing;
  end if;

  select string_agg(format('%s(found %s, expected %s)', e.policyname, a.n_found, e.n_calls), ', ' order by e.policyname)
  into v_wrong
  from _perf_rls_initplan_expected e
  join (
    select p.policyname,
           (select count(*) from regexp_matches(
              regexp_replace(coalesce(p.qual,'') || ' ~~ ' || coalesce(p.with_check,''), '\s+', ' ', 'g'),
              '(public\.)?has_role\s*\(', 'g')) as n_found
    from pg_policies p
    where p.schemaname = 'public'
  ) a on a.policyname = e.policyname
  where coalesce(a.n_found, -1) <> e.n_calls;

  if v_wrong is not null then
    raise exception 'PREFLIGHT G3 FAILED: has_role() call count has drifted from the reviewed text: %', v_wrong;
  end if;

  -- G4: jobs_select must still be the 000500 baseline shape. If A1
  --     (20260828000800) has already been applied, jobs_select carries
  --     worker_job_match and this migration would OVERWRITE it and restore the
  --     42501 outage on jobs + applications. Refuse, loudly.
  select p.qual into v_jobs_qual
  from pg_policies p
  where p.schemaname = 'public' and p.tablename = 'jobs' and p.policyname = 'jobs_select';

  if coalesce(v_jobs_qual, '') = '' then
    raise exception 'PREFLIGHT G4 FAILED: jobs_select has a NULL/empty USING expression — not the reviewed baseline.';
  end if;

  if position('worker_job_match' in v_jobs_qual) > 0 then
    raise exception
      'PREFLIGHT G4 FAILED: jobs_select already references worker_job_match, i.e. migration 20260828000800 (A1) is applied. Re-applying this file would replace it with the pre-A1 worker_profiles EXISTS and RESTORE the jobs/applications outage. Apply the A1-aware jobs_select text instead.';
  end if;

  if position('worker_profiles wp' in v_jobs_qual) = 0 then
    raise exception 'PREFLIGHT G4 FAILED: jobs_select does not contain the expected worker_profiles EXISTS disjunct; live text has drifted from the reviewed baseline.';
  end if;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- 2. THE HOIST — 20 policies, 47 calls. ALTER POLICY only.
--    Every expression below is the live 000500 text with each
--    `public.has_role(...)` wrapped in `(select ...)`. Nothing else moved.
-- ---------------------------------------------------------------------------

-- profiles_select (SELECT, 2 calls)
alter policy profiles_select on public.profiles
  using (
    id = (select auth.uid())
    or is_worker = true
    or exists (
      select 1 from public.bookings b
      where (b.customer_id = public.profiles.id and b.worker_id = (select auth.uid()))
         or (b.worker_id = public.profiles.id and b.customer_id = (select auth.uid())))
    or (select public.has_role((select auth.uid()), 'admin'))
    or (select public.has_role((select auth.uid()), 'ops'))
  );

-- user_roles_admin_select (SELECT, 1 call)
alter policy user_roles_admin_select on public.user_roles
  using ((select public.has_role((select auth.uid()), 'admin')));

-- verifications_select (SELECT, 2 calls)
alter policy verifications_select on public.verifications
  using (
    user_id = (select auth.uid())
    or (select public.has_role((select auth.uid()), 'admin'))
    or (select public.has_role((select auth.uid()), 'ops'))
  );

-- verifications_ops_update (UPDATE, 2 + 2 calls)
alter policy verifications_ops_update on public.verifications
  using ((select public.has_role((select auth.uid()), 'admin'))
         or (select public.has_role((select auth.uid()), 'ops')))
  with check ((select public.has_role((select auth.uid()), 'admin'))
              or (select public.has_role((select auth.uid()), 'ops')));

-- guarantors_select (SELECT, 2 calls)
alter policy guarantors_select on public.guarantors
  using (
    worker_id = (select auth.uid())
    or (select public.has_role((select auth.uid()), 'admin'))
    or (select public.has_role((select auth.uid()), 'ops'))
  );

-- guarantors_ops_update (UPDATE, 2 + 2 calls)
alter policy guarantors_ops_update on public.guarantors
  using ((select public.has_role((select auth.uid()), 'admin'))
         or (select public.has_role((select auth.uid()), 'ops')))
  with check ((select public.has_role((select auth.uid()), 'admin'))
              or (select public.has_role((select auth.uid()), 'ops')));

-- jobs_select (SELECT, 2 calls)
-- NOTE: the worker_profiles EXISTS disjunct below is reproduced VERBATIM from
-- migration 000500. It is the cause of the live 42501 outage and it is NOT
-- fixed here — A1 (20260828000800) owns that. Do not "helpfully" edit it here;
-- the correlated EXISTS must also stay un-hoisted (plan R18: a scalar subquery
-- cannot reference the outer row).
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
    or (select public.has_role((select auth.uid()), 'admin'))
    or (select public.has_role((select auth.uid()), 'ops'))
  );

-- applications_select (SELECT, 2 calls)
alter policy applications_select on public.applications
  using (
    worker_id = (select auth.uid())
    or exists (
      select 1 from public.jobs j
      where j.id = public.applications.job_id
        and j.customer_id = (select auth.uid()))
    or (select public.has_role((select auth.uid()), 'admin'))
    or (select public.has_role((select auth.uid()), 'ops'))
  );

-- bookings_select (SELECT, 2 calls)
alter policy bookings_select on public.bookings
  using (
    customer_id = (select auth.uid())
    or worker_id = (select auth.uid())
    or (select public.has_role((select auth.uid()), 'admin'))
    or (select public.has_role((select auth.uid()), 'ops'))
  );

-- payments_select (SELECT, 2 calls)
alter policy payments_select on public.payments
  using (
    exists (
      select 1 from public.bookings b
      where b.id = public.payments.booking_id
        and ((select auth.uid()) in (b.customer_id, b.worker_id)))
    or (select public.has_role((select auth.uid()), 'admin'))
    or (select public.has_role((select auth.uid()), 'ops'))
  );

-- payouts_select (SELECT, 2 calls)
alter policy payouts_select on public.payouts
  using (
    worker_id = (select auth.uid())
    or (select public.has_role((select auth.uid()), 'admin'))
    or (select public.has_role((select auth.uid()), 'ops'))
  );

-- reviews_select (SELECT, 2 calls)
alter policy reviews_select on public.reviews
  using (
    reviewer_id = (select auth.uid())
    or is_published
    or created_at <= now() - interval '48 hours'
    or (select public.has_role((select auth.uid()), 'admin'))
    or (select public.has_role((select auth.uid()), 'ops'))
  );

-- reports_select (SELECT, 2 calls)
alter policy reports_select on public.reports
  using (
    reporter_id = (select auth.uid())
    or (select public.has_role((select auth.uid()), 'admin'))
    or (select public.has_role((select auth.uid()), 'ops'))
  );

-- reports_ops_update (UPDATE, 2 + 2 calls)
alter policy reports_ops_update on public.reports
  using ((select public.has_role((select auth.uid()), 'admin'))
         or (select public.has_role((select auth.uid()), 'ops')))
  with check ((select public.has_role((select auth.uid()), 'admin'))
              or (select public.has_role((select auth.uid()), 'ops')));

-- disputes_select (SELECT, 2 calls)
alter policy disputes_select on public.disputes
  using (
    opened_by = (select auth.uid())
    or exists (
      select 1 from public.bookings b
      where b.id = public.disputes.booking_id
        and ((select auth.uid()) in (b.customer_id, b.worker_id)))
    or (select public.has_role((select auth.uid()), 'admin'))
    or (select public.has_role((select auth.uid()), 'ops'))
  );

-- disputes_ops_update (UPDATE, 2 + 2 calls)
alter policy disputes_ops_update on public.disputes
  using ((select public.has_role((select auth.uid()), 'admin'))
         or (select public.has_role((select auth.uid()), 'ops')))
  with check ((select public.has_role((select auth.uid()), 'admin'))
              or (select public.has_role((select auth.uid()), 'ops')));

-- guarantee_claims_select (SELECT, 2 calls)
alter policy guarantee_claims_select on public.guarantee_claims
  using (
    claimant_id = (select auth.uid())
    or (select public.has_role((select auth.uid()), 'admin'))
    or (select public.has_role((select auth.uid()), 'ops'))
  );

-- guarantee_claims_ops_update (UPDATE, 2 + 2 calls)
alter policy guarantee_claims_ops_update on public.guarantee_claims
  using ((select public.has_role((select auth.uid()), 'admin'))
         or (select public.has_role((select auth.uid()), 'ops')))
  with check ((select public.has_role((select auth.uid()), 'admin'))
              or (select public.has_role((select auth.uid()), 'ops')));

-- business_accounts_select (SELECT, 1 call)
alter policy business_accounts_select on public.business_accounts
  using (owner_id = (select auth.uid())
         or (select public.has_role((select auth.uid()), 'admin')));

-- audit_log_admin_select (SELECT, 1 call)
alter policy audit_log_admin_select on public.audit_log
  using ((select public.has_role((select auth.uid()), 'admin')));

-- ---------------------------------------------------------------------------
-- 3. POSTFLIGHT GUARDS
--    P1 policy-set identity, P2 counts, P3 cmd/roles/permissive/clause shape,
--    P4 expression equivalence. P4 is the load-bearing one: it strips the hoist
--    wrapper back off and demands the result be character-identical to what was
--    live before the ALTERs. A typo in any of the 47 rewrites cannot survive it.
-- ---------------------------------------------------------------------------
do $postflight$
declare
  v_total     int;
  v_hoisted   int;
  v_bare      int;
  v_pol       int;
  v_mismatch  int;
  v_extra     text;
  v_unwrapped text;
  v_before_u  text;
  r           record;
  c_unwrap_pat text := '\( SELECT (public\.)?has_role\(\( SELECT auth\.uid\(\) AS uid\), (''[a-z_]+''::app_role)\) AS has_role\)';
  c_unwrap_rep text := '\1has_role(( SELECT auth.uid() AS uid), \2)';
begin
  -- P1: the set of has_role-carrying policies is exactly the 20 we expected —
  --     no policy gained or lost a has_role branch.
  select string_agg(x.policyname, ', ' order by x.policyname) into v_extra
  from (
    select p.policyname
    from pg_policies p
    where p.schemaname = 'public'
      and (select count(*) from regexp_matches(
             regexp_replace(coalesce(p.qual,'') || ' ~~ ' || coalesce(p.with_check,''), '\s+', ' ', 'g'),
             '(public\.)?has_role\s*\(', 'g')) > 0
    except
    select e.policyname from _perf_rls_initplan_expected e
  ) x;
  if v_extra is not null then
    raise exception 'POSTFLIGHT P1 FAILED: unexpected policy/policies now carry has_role(): %', v_extra;
  end if;

  -- P2: zero bare calls left, and the total is still 47 across 20 policies.
  select coalesce(sum(s.n_total), 0),
         coalesce(sum(s.n_hoisted), 0),
         count(*) filter (where s.n_total > 0)
    into v_total, v_hoisted, v_pol
  from (
    select (select count(*) from regexp_matches(t.txt, '(public\.)?has_role\s*\(', 'g'))          as n_total,
           (select count(*) from regexp_matches(t.txt, '\( SELECT (public\.)?has_role\s*\(', 'g')) as n_hoisted
    from (
      select regexp_replace(coalesce(p.qual,'') || ' ~~ ' || coalesce(p.with_check,''), '\s+', ' ', 'g') as txt
      from pg_policies p
      where p.schemaname = 'public'
    ) t
  ) s;

  v_bare := v_total - v_hoisted;

  if v_bare <> 0 then
    raise exception 'POSTFLIGHT P2 FAILED: % bare has_role() call(s) still present in public policies (total %, hoisted %).',
      v_bare, v_total, v_hoisted;
  end if;
  if v_total <> 47 then
    raise exception 'POSTFLIGHT P2 FAILED: expected 47 has_role() calls across public policies, found %.', v_total;
  end if;
  if v_pol <> 20 then
    raise exception 'POSTFLIGHT P2 FAILED: expected 20 policies carrying has_role(), found %.', v_pol;
  end if;

  -- P3: no policy appeared, disappeared, or changed cmd / roles / permissive /
  --     which of USING and WITH CHECK it has.
  select count(*) into v_mismatch
  from _perf_rls_initplan_before b
  full join (
    select tablename, policyname, cmd, permissive, roles::text as roles_txt,
           qual as qual_txt, with_check as check_txt
    from pg_policies where schemaname = 'public'
  ) a on a.tablename = b.tablename and a.policyname = b.policyname
  where a.policyname is null
     or b.policyname is null
     or a.cmd        is distinct from b.cmd
     or a.permissive is distinct from b.permissive
     or a.roles_txt  is distinct from b.roles_txt
     or (a.qual_txt  is null) <> (b.qual_txt  is null)
     or (a.check_txt is null) <> (b.check_txt is null);

  if coalesce(v_mismatch, -1) <> 0 then
    raise exception 'POSTFLIGHT P3 FAILED: % policy row(s) changed cmd, roles, permissive, clause presence, or appeared/disappeared.',
      coalesce(v_mismatch, -1);
  end if;

  -- P4: EQUIVALENCE. Strip the hoist wrapper off both sides and require an
  --     exact match. Unwrapping BEFORE as well makes this re-run safe and still
  --     proves the ONLY delta is the wrapper.
  v_mismatch := 0;
  for r in
    select b.tablename, b.policyname,
           regexp_replace(coalesce(b.qual_txt,'') || ' ~~ ' || coalesce(b.check_txt,''), '\s+', ' ', 'g') as before_n,
           regexp_replace(coalesce(a.qual,'')     || ' ~~ ' || coalesce(a.with_check,''), '\s+', ' ', 'g') as after_n
    from _perf_rls_initplan_before b
    join pg_policies a
      on a.schemaname = 'public' and a.tablename = b.tablename and a.policyname = b.policyname
  loop
    v_before_u  := regexp_replace(r.before_n, c_unwrap_pat, c_unwrap_rep, 'g');
    v_unwrapped := regexp_replace(r.after_n,  c_unwrap_pat, c_unwrap_rep, 'g');
    if v_unwrapped is distinct from v_before_u then
      v_mismatch := v_mismatch + 1;
      raise exception
        'POSTFLIGHT P4 FAILED (%.%): un-hoisting the new expression does not reproduce the old one. BEFORE=[%] AFTER-UNWRAPPED=[%]',
        r.tablename, r.policyname, v_before_u, v_unwrapped;
    end if;
  end loop;

  -- assert the loop actually looked at something (a guard that inspects zero
  -- rows is decoration — the C-2 disease this repo documents)
  select count(*) into v_pol from _perf_rls_initplan_before;
  if coalesce(v_pol, 0) <> 40 then
    raise exception 'POSTFLIGHT P4 FAILED: expected 40 policies in the before-snapshot, found % — the equivalence loop did not cover the schema.',
      coalesce(v_pol, 0);
  end if;

  raise notice 'perf_rls_initplan OK: 40 policies compared, 20 rewritten, 47 has_role() calls hoisted, 0 bare, 0 expression divergences.';
end
$postflight$;

commit;
