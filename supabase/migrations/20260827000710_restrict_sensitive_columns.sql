-- 20260827000710_restrict_sensitive_columns
-- Finding 2 (schema red-team, MEDIUM): any authenticated user could read every
-- worker's raw geo point (precise home/base) and profiles.telegram_id (a direct
-- off-platform contact channel — undercuts C3) via a direct PostgREST select,
-- because SELECT was granted table-wide and worker profiles are world-readable
-- to authenticated. nearby_workers only ever returns distance, never the point.
--
-- Fix: replace the table-wide SELECT grant with a column-level grant that omits
-- geo (worker_profiles) and telegram_id (profiles). Owner write-grants
-- (INSERT/UPDATE, which include geo/telegram_id so a user can still SET their
-- own) are untouched. nearby_workers is SECURITY DEFINER and reads geo as its
-- owner, unaffected. The one legitimate reader of telegram_id — the ops/admin
-- user directory — moves to an admin-gated SECURITY DEFINER RPC that also
-- audit-logs the access (closing the "reveals not logged" gap the red-team
-- noted). No frontend surface selects geo; only the admin search selected
-- telegram_id, and it is repointed to the RPC.

begin;

-- worker_profiles: drop table-wide SELECT, grant every column EXCEPT geo.
revoke select on public.worker_profiles from authenticated;
grant select (
  user_id, bio, categories, skills, neighborhood, travel_radius_km,
  availability, availability_status, price_min_cents, price_max_cents,
  price_type, rating_avg, review_count, jobs_completed, badge_level,
  verification_level, created_at, updated_at
) on public.worker_profiles to authenticated;

-- profiles: drop table-wide SELECT, grant every column EXCEPT telegram_id.
revoke select on public.profiles from authenticated;
grant select (
  id, display_name, avatar_url, locale, is_customer, is_worker, is_seed,
  phone_masked, default_neighborhood, created_at, updated_at
) on public.profiles to authenticated;

-- Admin/ops user directory: SECURITY DEFINER, has_role-gated, returns
-- telegram_id and audit-logs the access. Returns {rows: [...], total: n}.
create or replace function public.rpc_admin_search_users(
  p_id uuid default null,
  p_pattern text default null,
  p_limit int default 50)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_rows jsonb;
  v_total int;
  v_lim int := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  if v_uid is null then raise exception 'TAKEIT_AUTH_REQUIRED'; end if;
  if not (public.has_role(v_uid, 'admin') or public.has_role(v_uid, 'ops')) then
    raise exception 'TAKEIT_FORBIDDEN: admin/ops only';
  end if;
  -- bound the fuzzy pattern (repo law 4: length-bounded)
  if p_pattern is not null and char_length(p_pattern) > 82 then
    raise exception 'TAKEIT_SEARCH_TOO_LONG';
  end if;

  select count(*)::int into v_total
  from public.profiles p
  where (p_id is not null and p.id = p_id)
     or (p_id is null and p_pattern is not null and p.display_name ilike p_pattern);

  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.created_at desc, t.id asc), '[]'::jsonb)
  into v_rows
  from (
    select p.id, p.display_name, p.locale, p.is_customer, p.is_worker,
           p.is_seed, p.phone_masked, p.telegram_id, p.default_neighborhood,
           p.created_at
    from public.profiles p
    where (p_id is not null and p.id = p_id)
       or (p_id is null and p_pattern is not null and p.display_name ilike p_pattern)
    order by p.created_at desc, p.id asc
    limit v_lim
  ) t;

  perform public.audit_write(v_uid, 'admin.user_directory', 'profiles', p_id,
    jsonb_build_object('by_id', p_id is not null, 'matched', v_total));

  return jsonb_build_object('rows', v_rows, 'total', v_total);
end;
$$;

revoke all on function public.rpc_admin_search_users(uuid, text, int) from public, anon;
grant execute on function public.rpc_admin_search_users(uuid, text, int) to authenticated, service_role;

commit;
