-- Rollback for 20260827000700_post_audit_fixes.
-- Restores the pre-fix definitions. NOTE: rolling this back re-introduces the
-- confirmed double-blind aggregate leak (Finding 1) and the phone-separator
-- bypass (Finding 3) — only roll back if the forward migration itself is
-- broken, and re-apply a corrected forward migration immediately.

begin;

drop index if exists public.payments_chapa_provider_ref_uidx;

revoke all on function public.purge_expired_verification_metadata(int) from service_role;
drop function if exists public.purge_expired_verification_metadata(int);

-- restore recompute_worker_rating WITHOUT the is_published filter (original)
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
          where r.reviewee_id = v_worker and r.direction = 'c_to_w'), 0),
        review_count = (
          select count(*)::int
          from public.reviews r
          where r.reviewee_id = v_worker and r.direction = 'c_to_w')
    where wp.user_id = v_worker;
  end if;

  return coalesce(new, old);
end;
$$;

-- restore phone functions with the original (narrower) separator class
create or replace function public.text_contains_phone(p text)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select regexp_replace(p, '[[:space:]().-]', '', 'g') ~ '[0-9]{7,}';
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
  v := regexp_replace(p, '[+]?[0-9][0-9[:space:]().-]{5,}[0-9]', '[•••]', 'g');
  if public.text_contains_phone(v) then
    v := '[•••]';
  end if;
  return v;
end;
$$;

commit;
