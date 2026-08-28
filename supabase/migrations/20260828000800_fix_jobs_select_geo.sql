-- 20260828000800_fix_jobs_select_geo
--
-- PRODUCTION OUTAGE FIX. Migration 20260827000710 revoked table-level SELECT on
-- public.worker_profiles from `authenticated` (granting back every column EXCEPT
-- geo) to close a real PII leak: any signed-in user could read every worker's
-- precise home coordinates.
--
-- What that missed: the jobs_select POLICY itself reads wp.geo inside an EXISTS,
-- and an RLS policy qual is evaluated with the CALLER's privileges — there is no
-- definer escape for a policy expression. So every read of public.jobs began
-- failing with 42501 "permission denied for table worker_profiles", and because
-- applications_select sub-selects jobs, applications reads failed too.
-- Measured on live before this migration: customer open-jobs feed, customer
-- own-jobs, and worker jobs feed ALL raise 42501.
--
-- THE FIX: move the worker-match test into a SECURITY DEFINER function so it can
-- read geo as the owner, while geo stays unreadable by clients.
--
-- SECURITY — why this signature and not the obvious one. The caller identity is
-- bound INTERNALLY via (select auth.uid()); it is NOT a parameter. A signature
-- like worker_job_match(p_uid, p_category, p_job_geo) would be a boolean oracle:
-- any authenticated user could ask "is worker X within radius of point P?" and
-- binary-search any worker's home to arbitrary precision — reopening, in a more
-- exploitable form, the very leak 000710 closed. With identity bound internally a
-- caller can only ever ask about THEMSELVES, about data they already own.
--
-- NOT DONE, deliberately: `GRANT SELECT (geo) ... TO authenticated`. That is what
-- Postgres' own 42501 HINT suggests, it clears the error in one line, and it
-- silently restores the PII leak. Do not take the hint.

begin;

create or replace function public.worker_job_match(
  p_category text,
  p_job_geo  extensions.geography
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1
    from public.worker_profiles wp
    where wp.user_id = (select auth.uid())          -- identity bound internally
      and p_category = any (wp.categories)
      and (
        wp.geo is null
        or p_job_geo is null
        or extensions.st_dwithin(
             p_job_geo, wp.geo,
             (wp.travel_radius_km * 1000)::double precision
           )
      )
  );
$fn$;

comment on function public.worker_job_match(text, extensions.geography) is
  'Does the CALLING user''s own worker profile match this category and fall within '
  'their travel radius of this job? Definer-rights so jobs_select can test the '
  'match without clients holding SELECT on worker_profiles.geo. Identity is bound '
  'internally on purpose — never add a uid parameter (location oracle).';

-- New function: no prior ACL to preserve, but the DEFAULT is PUBLIC EXECUTE.
revoke all on function public.worker_job_match(text, extensions.geography) from public, anon;
grant execute on function public.worker_job_match(text, extensions.geography) to authenticated, service_role;

-- Guard: assert the ACL landed. Pinned by regprocedure (not by name — two
-- functions can share a name), coalesce on the nullable comparison so a NULL
-- proacl (= PUBLIC EXECUTE) fails loudly instead of passing silently.
do $guard$
declare v_bad text;
begin
  if (select coalesce(p.proacl::text,'<null>')
      from pg_proc p
      where p.oid = 'public.worker_job_match(text, extensions.geography)'::regprocedure) = '<null>' then
    raise exception 'ACL GUARD: worker_job_match left at default PUBLIC EXECUTE';
  end if;

  select string_agg(g,',') into v_bad from (
    select coalesce(r.rolname,'PUBLIC') as g
    from pg_proc p
    cross join lateral aclexplode(p.proacl) a
    left join pg_roles r on r.oid = a.grantee
    where p.oid = 'public.worker_job_match(text, extensions.geography)'::regprocedure
      and a.privilege_type = 'EXECUTE'
      and coalesce(r.rolname,'PUBLIC') in ('PUBLIC','anon')
  ) s;
  if v_bad is not null then
    raise exception 'ACL GUARD: worker_job_match EXECUTE-able by %', v_bad;
  end if;
end
$guard$;

-- ALTER, never DROP+CREATE: ALTER cannot change cmd, and changes roles only if
-- TO is passed — both preserved by construction. Only the worker_profiles EXISTS
-- disjunct changes; the has_role calls are hoisted in the same statement (A1).
alter policy jobs_select on public.jobs
using (
  (customer_id = (select auth.uid()))
  or (exists (
        select 1 from public.bookings b
        where b.job_id = jobs.id and b.worker_id = (select auth.uid())
      ))
  or (
    status = 'open'::public.job_status
    and public.worker_job_match(jobs.category_slug, jobs.service_geo)
  )
  or (select public.has_role((select auth.uid()), 'admin'::public.app_role))
  or (select public.has_role((select auth.uid()), 'ops'::public.app_role))
);

-- Postflight: the policy must still be SELECT, still authenticated-only, and must
-- no longer mention worker_profiles.
do $post$
declare r record;
begin
  select cmd, roles::text as roles, qual::text as qual into r
  from pg_policies where schemaname='public' and tablename='jobs' and policyname='jobs_select';
  if r is null then raise exception 'POSTFLIGHT: jobs_select vanished'; end if;
  if r.cmd <> 'SELECT' then raise exception 'POSTFLIGHT: cmd changed to %', r.cmd; end if;
  if r.roles <> '{authenticated}' then raise exception 'POSTFLIGHT: roles changed to %', r.roles; end if;
  if r.qual like '%worker_profiles%' then
    raise exception 'POSTFLIGHT: jobs_select still reads worker_profiles directly';
  end if;
  if r.qual not like '%worker_job_match%' then
    raise exception 'POSTFLIGHT: jobs_select does not call worker_job_match';
  end if;
end
$post$;

commit;
