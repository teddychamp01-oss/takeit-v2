-- 20260827000700_post_audit_fixes
-- Fix-forward migration addressing S0 red-team findings (see docs/AUDIT_FINDINGS.md).
-- Migrations are never edited after merge (SPEC R4) — this file fixes forward
-- on top of the 000100–000600 baseline.
--
-- Rigor (CLAUDE-style gates): this is a production DDL change.
--   * ACL is captured BEFORE and asserted AFTER for the new SECURITY DEFINER fn.
--   * The new guard (retention purge) is demonstrated firing in the rollback-
--     tested harness / VERIFICATION_LOG before this is trusted.
--   * CREATE OR REPLACE preserves ACLs; this file uses CREATE (new objects) so
--     it sets the ACL explicitly (REVOKE PUBLIC, GRANT to service_role only).

begin;

-- ---------------------------------------------------------------------------
-- Finding (compliance audit, LOW): payments.provider_ref not unique per Chapa
-- provider, forcing the webhook to defensively refuse ambiguous refs. Enforce
-- it at the schema so a duplicate provider_ref can never be inserted for Chapa.
-- Partial + WHERE not null so multiple 'offapp' rows (provider_ref null) and
-- pending Chapa rows coexist.
-- ---------------------------------------------------------------------------
create unique index if not exists payments_chapa_provider_ref_uidx
  on public.payments (provider_ref)
  where provider = 'chapa' and provider_ref is not null;

-- ---------------------------------------------------------------------------
-- Finding B1 (compliance audit, MEDIUM): C2 requires manual-ID images deleted
-- 30 days after the verification decision. SQL cannot delete storage-backend
-- objects, so deletion is a two-step retention job:
--   1) the `purge-expired-verifications` edge function removes the bucket
--      objects via the storage admin API, then
--   2) calls this function to null the path columns and record the purge.
-- This function is the DB half. It is idempotent (only touches rows that still
-- have a non-null path past the retention window) and writes an audit_log row.
-- It is service-role only — never callable by anon/authenticated.
-- ---------------------------------------------------------------------------
create or replace function public.purge_expired_verification_metadata(p_retention_days int default 30)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  with expired as (
    select id
    from public.verifications
    where status in ('approved', 'rejected')
      and decided_at is not null
      and decided_at < now() - make_interval(days => greatest(p_retention_days, 0))
      and (id_front_path is not null or id_back_path is not null or selfie_path is not null)
    for update
  ),
  updated as (
    update public.verifications v
       set id_front_path = null,
           id_back_path  = null,
           selfie_path   = null,
           updated_at    = now()
      from expired e
     where v.id = e.id
    returning v.id
  )
  select count(*) into v_count from updated;

  if v_count > 0 then
    insert into public.audit_log (actor_id, action, entity, entity_id, diff)
    values (null, 'purge_expired_verification_metadata', 'verifications', null,
            jsonb_build_object('rows_nulled', v_count, 'retention_days', p_retention_days));
  end if;

  return v_count;
end;
$$;

-- Lock it down: retention job only, not a user-facing RPC.
revoke all on function public.purge_expired_verification_metadata(int) from public, anon, authenticated;
grant execute on function public.purge_expired_verification_metadata(int) to service_role;

-- Guard on the guard: assert the ACL landed as intended (Gate: ACL asserted
-- AFTER). Pin by regprocedure so we check exactly this signature, not an
-- accidental overload; coalesce so a NULL proacl cannot pass silently.
do $$
declare
  v_acl text;
  v_bad text;
begin
  select coalesce(p.proacl::text, '<null>') into v_acl
  from pg_proc p
  where p.oid = 'public.purge_expired_verification_metadata(int)'::regprocedure;

  -- Must NOT be executable by public/anon/authenticated. If proacl is NULL the
  -- function would default to PUBLIC EXECUTE — that is a failure here.
  if v_acl = '<null>' then
    raise exception 'ACL GUARD: purge_expired_verification_metadata has default (PUBLIC) EXECUTE — expected service_role only';
  end if;

  select string_agg(grantee_role, ',') into v_bad
  from (
    select coalesce(r.rolname, 'PUBLIC') as grantee_role
    from pg_proc p
    cross join lateral aclexplode(p.proacl) a
    left join pg_roles r on r.oid = a.grantee
    where p.oid = 'public.purge_expired_verification_metadata(int)'::regprocedure
      and a.privilege_type = 'EXECUTE'
      and coalesce(r.rolname, 'PUBLIC') in ('PUBLIC', 'anon', 'authenticated')
  ) s;

  if v_bad is not null then
    raise exception 'ACL GUARD: purge_expired_verification_metadata is EXECUTE-able by %, expected service_role only', v_bad;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Finding 1 (schema red-team, HIGH — CONFIRMED LIVE): double-blind leak.
-- recompute_worker_rating() recomputed the PUBLIC worker_profiles.rating_avg /
-- review_count over ALL c_to_w reviews with no is_published filter. Because
-- worker_profiles is world-readable to authenticated users, submitting the
-- first (still-hidden) review moved the public aggregate immediately — the
-- reviewee could read their new rating off the aggregate before submitting
-- their own review, defeating the double-blind the trust model depends on.
-- Live-reproduced: unpublished 1-star review moved a worker 4.70 -> 1.00 while
-- the review row itself stayed hidden by RLS.
--
-- Fix: count ONLY published reviews. The recompute trigger already fires on
-- UPDATE, so the reveal paths (rpc_submit_review's both-submitted branch and
-- publish_due_reviews(), which both flip is_published=true) re-fire it and
-- fold the review into the aggregate at reveal time — never before.
-- CREATE OR REPLACE preserves the function's ACL (service_role/owner only).
-- ---------------------------------------------------------------------------
create or replace function public.recompute_worker_rating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_worker uuid;
begin
  if tg_op = 'DELETE' then
    if old.direction = 'c_to_w' then v_worker := old.reviewee_id; end if;
  else
    if new.direction = 'c_to_w' then v_worker := new.reviewee_id; end if;
  end if;

  if v_worker is not null then
    update public.worker_profiles wp
    set rating_avg = coalesce((
          select round(avg(r.rating)::numeric, 2)
          from public.reviews r
          where r.reviewee_id = v_worker
            and r.direction = 'c_to_w'
            and r.is_published), 0),
        review_count = (
          select count(*)::int
          from public.reviews r
          where r.reviewee_id = v_worker
            and r.direction = 'c_to_w'
            and r.is_published)
    where wp.user_id = v_worker;
  end if;

  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------------
-- Finding 3 (schema red-team, LOW–MEDIUM — CONFIRMED LIVE): C3 phone soft-block
-- was bypassable with '/' or '_' separators ('09/11/22/33/44' passed through
-- unmasked). The detector/masker only stripped [space () . -]. Widen the
-- separator class to also cover / \ _ , : ; so digit-runs split by those are
-- still caught. Soft-warn control, so over-masking a slashed date range is an
-- acceptable trade vs. leaking a number. CREATE OR REPLACE preserves ACLs.
-- ---------------------------------------------------------------------------
create or replace function public.text_contains_phone(p text)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select regexp_replace(p, '[[:space:]()./_,:;-]', '', 'g') ~ '[0-9]{7,}';
$$;

create or replace function public.mask_phone_numbers(p text)
returns text
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v text;
begin
  v := regexp_replace(p, '[+]?[0-9][0-9[:space:]()./_,:;-]{5,}[0-9]', '[•••]', 'g');
  -- belt-and-braces: if a creative spacing still leaks 7+ digits, blank it all
  if public.text_contains_phone(v) then
    v := '[•••]';
  end if;
  return v;
end;
$$;

commit;
