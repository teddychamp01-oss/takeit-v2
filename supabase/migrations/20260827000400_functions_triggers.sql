-- =============================================================================
-- Take It v2 — 000400 functions & triggers
--
-- Hardening rules applied to EVERY function here (repo law):
--   * SECURITY DEFINER functions: `set search_path = ''` + fully-qualified
--     references only (public.*, auth.*, extensions.*, pg_catalog is implicit).
--   * Explicit REVOKE EXECUTE FROM PUBLIC, anon on every function; explicit
--     GRANT to exactly the roles that need it (grants block at the bottom).
--   * Booking/job state machines exist ONLY here — RLS grants no status writes.
--   * Every RPC validates auth.uid(), validates the legal transition, RAISEs a
--     clear TAKEIT_* error on violation, and writes public.audit_log.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- C8: backs every admin/ops policy. STABLE + pinned + definer.
create or replace function public.has_role(uid uuid, r public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = uid and ur.role = r
  );
$$;

create or replace function public.verification_level_rank(l public.verification_level)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case l
    when 'none'           then 0
    when 'basic'          then 1
    when 'id_verified'    then 2
    when 'fayda_verified' then 3
    when 'pro_certified'  then 4
  end;
$$;

-- C3: canonical masker. Output never contains 7+ consecutive digits, so it
-- always satisfies the *_masked CHECK constraints (keeps country code + last 2).
create or replace function public.mask_phone(p text)
returns text
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_digits text;
begin
  v_digits := regexp_replace(p, '[^0-9]', '', 'g');
  if char_length(v_digits) < 4 then
    return '•••';
  end if;
  return '+' || left(v_digits, 3)
             || repeat('•', greatest(char_length(v_digits) - 5, 2))
             || right(v_digits, 2);
end;
$$;

-- C3: detector used by the pre-unlock soft-block in rpc_send_message.
-- 7+ digits once spaces/dots/parens/hyphens are stripped = phone-like.
create or replace function public.text_contains_phone(p text)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select regexp_replace(p, '[[:space:]().-]', '', 'g') ~ '[0-9]{7,}';
$$;

-- C3: replaces phone-like runs with a language-neutral '[•••]' token.
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
  -- belt-and-braces: if a creative spacing still leaks 7+ digits, blank it all
  if public.text_contains_phone(v) then
    v := '[•••]';
  end if;
  return v;
end;
$$;

-- Internal: single write path into audit_log from RPCs (and service_role).
create or replace function public.audit_write(
  p_actor uuid, p_action text, p_entity text, p_entity_id uuid, p_diff jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_log (actor_id, action, entity, entity_id, diff)
  values (p_actor, p_action, p_entity, p_entity_id, coalesce(p_diff, '{}'::jsonb));
$$;

-- Internal: notification fan-out from RPCs (and service_role).
create or replace function public.enqueue_notification(
  p_user uuid, p_type text, p_payload jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, type, payload)
  values (p_user, p_type, coalesce(p_payload, '{}'::jsonb));
$$;

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

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
    execute format(
      'create trigger trg_%I_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t, t);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Signup trigger: auth.users insert -> profiles row (locale defaults to am, C5)
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, locale)
  values (
    new.id,
    left(coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      split_part(coalesce(new.email, ''), '@', 1),
      ''), 80),
    case
      when new.raw_user_meta_data ->> 'locale' in ('am', 'en')
        then new.raw_user_meta_data ->> 'locale'
      else 'am'
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Reviews -> worker_profiles.rating_avg / review_count (SPEC: recompute on
-- insert; update/delete covered too so moderation cannot skew the aggregate)
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

drop trigger if exists trg_reviews_recompute_rating on public.reviews;
create trigger trg_reviews_recompute_rating
  after insert or update or delete on public.reviews
  for each row execute function public.recompute_worker_rating();

-- ---------------------------------------------------------------------------
-- RPC: post a job (the ONLY insert path for jobs — masks the local contact
-- phone before it is stored; C3)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_post_job(
  p_category_slug        text,
  p_title                text,
  p_description          text default null,
  p_service_address_text text default null,
  p_service_landmark     text default null,
  p_service_neighborhood text default null,
  p_lat                  double precision default null,
  p_lng                  double precision default null,
  p_is_diaspora          boolean default false,
  p_local_contact_name   text default null,
  p_local_contact_phone  text default null,
  p_date_needed          date default null,
  p_time_window          text default null,
  p_budget_cents         bigint default null,
  p_workers_needed       integer default 1)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_geo extensions.geography;
  v_job uuid;
begin
  if v_uid is null then
    raise exception 'TAKEIT_AUTH_REQUIRED: rpc_post_job needs a signed-in user';
  end if;
  if not exists (select 1 from public.profiles pr where pr.id = v_uid) then
    raise exception 'TAKEIT_PROFILE_MISSING: no profile for user %', v_uid;
  end if;
  if not exists (select 1 from public.service_categories c
                 where c.slug = p_category_slug and c.active) then
    raise exception 'TAKEIT_CATEGORY_UNKNOWN: % is not an active category', p_category_slug;
  end if;
  if p_title is null or char_length(btrim(p_title)) not between 5 and 120 then
    raise exception 'TAKEIT_TITLE_LENGTH: title must be 5-120 characters';
  end if;
  if p_description is not null and char_length(p_description) > 5000 then
    raise exception 'TAKEIT_DESCRIPTION_TOO_LONG: max 5000 characters';
  end if;
  if p_service_address_text is not null and char_length(p_service_address_text) > 500 then
    raise exception 'TAKEIT_ADDRESS_TOO_LONG: max 500 characters';
  end if;
  if p_budget_cents is not null and p_budget_cents < 0 then
    raise exception 'TAKEIT_BUDGET_NEGATIVE';
  end if;
  if p_workers_needed is null or p_workers_needed not between 1 and 20 then
    raise exception 'TAKEIT_WORKERS_NEEDED_RANGE: 1-20';
  end if;
  if (p_lat is null) <> (p_lng is null) then
    raise exception 'TAKEIT_GEO_INCOMPLETE: provide both lat and lng or neither';
  end if;
  if p_lat is not null then
    if p_lat not between -90 and 90 or p_lng not between -180 and 180 then
      raise exception 'TAKEIT_GEO_RANGE: lat -90..90, lng -180..180';
    end if;
    v_geo := extensions.st_setsrid(
               extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
  end if;
  if p_is_diaspora and (p_local_contact_name is null
                        or char_length(btrim(p_local_contact_name)) = 0) then
    raise exception 'TAKEIT_DIASPORA_NEEDS_LOCAL_CONTACT: local contact name required';
  end if;

  insert into public.jobs (
    customer_id, category_slug, title, description,
    service_address_text, service_landmark, service_neighborhood, service_geo,
    is_diaspora, local_contact_name, local_contact_phone_masked,
    date_needed, time_window, budget_cents, workers_needed, status)
  values (
    v_uid, p_category_slug, btrim(p_title), p_description,
    p_service_address_text, p_service_landmark, p_service_neighborhood, v_geo,
    p_is_diaspora, p_local_contact_name, public.mask_phone(p_local_contact_phone),
    p_date_needed, p_time_window, p_budget_cents, p_workers_needed, 'open')
  returning id into v_job;

  update public.profiles set is_customer = true
  where id = v_uid and is_customer = false;

  perform public.audit_write(v_uid, 'job.post', 'jobs', v_job,
    jsonb_build_object('category', p_category_slug, 'is_diaspora', p_is_diaspora));

  return jsonb_build_object('job_id', v_job, 'status', 'open');
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: apply to a job (worker; category + verification-level enforced)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_apply_to_job(
  p_job_id           uuid,
  p_message          text default null,
  p_committed_window text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_job record;
  v_wp  record;
  v_min public.verification_level;
  v_app uuid;
begin
  if v_uid is null then
    raise exception 'TAKEIT_AUTH_REQUIRED';
  end if;
  if p_message is not null and char_length(p_message) > 1000 then
    raise exception 'TAKEIT_MESSAGE_TOO_LONG: max 1000 characters';
  end if;
  if p_committed_window is not null and char_length(p_committed_window) > 120 then
    raise exception 'TAKEIT_WINDOW_TOO_LONG: max 120 characters';
  end if;

  select j.id, j.customer_id, j.category_slug, j.status
  into v_job from public.jobs j where j.id = p_job_id;
  if v_job.id is null then
    raise exception 'TAKEIT_JOB_NOT_FOUND: %', p_job_id;
  end if;
  if v_job.status <> 'open' then
    raise exception 'TAKEIT_JOB_NOT_OPEN: job % is %', p_job_id, v_job.status;
  end if;
  if v_job.customer_id = v_uid then
    raise exception 'TAKEIT_CANNOT_APPLY_OWN_JOB';
  end if;

  select wp.categories, wp.verification_level
  into v_wp from public.worker_profiles wp where wp.user_id = v_uid;
  if v_wp.categories is null then
    raise exception 'TAKEIT_WORKER_PROFILE_REQUIRED: create a worker profile first';
  end if;
  if not (v_job.category_slug = any (v_wp.categories)) then
    raise exception 'TAKEIT_CATEGORY_MISMATCH: your profile does not list %', v_job.category_slug;
  end if;

  select c.min_verification_level into v_min
  from public.service_categories c where c.slug = v_job.category_slug;
  if public.verification_level_rank(v_wp.verification_level)
     < public.verification_level_rank(v_min) then
    raise exception 'TAKEIT_VERIFICATION_LEVEL_TOO_LOW: % requires %',
      v_job.category_slug, v_min;
  end if;

  begin
    insert into public.applications (job_id, worker_id, message, committed_window, status)
    values (p_job_id, v_uid, p_message, p_committed_window, 'pending')
    returning id into v_app;
  exception when unique_violation then
    raise exception 'TAKEIT_ALREADY_APPLIED: one application per worker per job';
  end;

  perform public.enqueue_notification(v_job.customer_id, 'application.received',
    jsonb_build_object('job_id', p_job_id, 'application_id', v_app));
  perform public.audit_write(v_uid, 'application.create', 'applications', v_app,
    jsonb_build_object('job_id', p_job_id));

  return jsonb_build_object('application_id', v_app, 'status', 'pending');
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: accept an application -> creates booking ('confirmed') + job 'matched'
-- ---------------------------------------------------------------------------
create or replace function public.rpc_accept_application(
  p_application_id     uuid,
  p_agreed_price_cents bigint default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v record;
  v_price bigint;
  v_booking uuid;
  v_active integer;
  v_job_status public.job_status;
begin
  if v_uid is null then
    raise exception 'TAKEIT_AUTH_REQUIRED';
  end if;

  select a.id, a.job_id, a.worker_id, a.status,
         j.customer_id, j.status as job_status, j.budget_cents, j.workers_needed
  into v
  from public.applications a
  join public.jobs j on j.id = a.job_id
  where a.id = p_application_id
  for update of a, j;

  if v.id is null then
    raise exception 'TAKEIT_APPLICATION_NOT_FOUND: %', p_application_id;
  end if;
  if v.customer_id <> v_uid then
    raise exception 'TAKEIT_NOT_JOB_OWNER: only the job poster can accept';
  end if;
  if v.status <> 'pending' then
    raise exception 'TAKEIT_APPLICATION_NOT_PENDING: application is %', v.status;
  end if;
  if v.job_status not in ('open', 'matched') then
    raise exception 'TAKEIT_JOB_NOT_OPEN: job is %', v.job_status;
  end if;

  select count(*)::int into v_active
  from public.bookings b
  where b.job_id = v.job_id and b.status <> 'cancelled';
  if v_active >= v.workers_needed then
    raise exception 'TAKEIT_JOB_FULL: % of % workers already booked',
      v_active, v.workers_needed;
  end if;

  v_price := coalesce(p_agreed_price_cents, v.budget_cents);
  if v_price is null or v_price < 0 then
    raise exception 'TAKEIT_PRICE_REQUIRED: pass p_agreed_price_cents (job has no budget)';
  end if;

  begin
    insert into public.bookings (job_id, worker_id, customer_id, agreed_price_cents, status)
    values (v.job_id, v.worker_id, v_uid, v_price, 'confirmed')
    returning id into v_booking;
  exception when unique_violation then
    raise exception 'TAKEIT_BOOKING_EXISTS: this worker already has a booking on this job';
  end;

  update public.applications set status = 'accepted' where id = p_application_id;

  if v_active + 1 >= v.workers_needed then
    update public.jobs set status = 'matched' where id = v.job_id;
    v_job_status := 'matched';
  else
    v_job_status := v.job_status;
  end if;

  perform public.enqueue_notification(v.worker_id, 'application.accepted',
    jsonb_build_object('job_id', v.job_id, 'booking_id', v_booking,
                       'agreed_price_cents', v_price));
  perform public.audit_write(v_uid, 'application.accept', 'applications', p_application_id,
    jsonb_build_object('booking_id', v_booking));
  perform public.audit_write(v_uid, 'booking.create', 'bookings', v_booking,
    jsonb_build_object('job_id', v.job_id, 'worker_id', v.worker_id,
                       'agreed_price_cents', v_price));

  return jsonb_build_object('booking_id', v_booking, 'booking_status', 'confirmed',
                            'job_status', v_job_status);
end;
$$;

-- ---------------------------------------------------------------------------
-- Booking state machine. Legal transitions:
--   confirmed -> started -> worker_done -> customer_confirmed
--   confirmed|started -> cancelled
--   confirmed|started|worker_done -> disputed
-- ---------------------------------------------------------------------------

create or replace function public.rpc_booking_start(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  b record;
begin
  if v_uid is null then raise exception 'TAKEIT_AUTH_REQUIRED'; end if;

  select * into b from public.bookings where id = p_booking_id for update;
  if b.id is null then
    raise exception 'TAKEIT_BOOKING_NOT_FOUND: %', p_booking_id;
  end if;
  if b.worker_id <> v_uid then
    raise exception 'TAKEIT_NOT_BOOKING_WORKER: only the booked worker can start';
  end if;
  if b.status <> 'confirmed' then
    raise exception 'TAKEIT_INVALID_TRANSITION: booking % is %, start needs confirmed',
      p_booking_id, b.status;
  end if;

  update public.bookings
  set status = 'started', started_at = now()
  where id = p_booking_id;

  update public.jobs set status = 'in_progress'
  where id = b.job_id and status in ('open', 'matched');

  perform public.enqueue_notification(b.customer_id, 'booking.started',
    jsonb_build_object('booking_id', p_booking_id, 'job_id', b.job_id));
  perform public.audit_write(v_uid, 'booking.start', 'bookings', p_booking_id,
    jsonb_build_object('from', 'confirmed', 'to', 'started'));

  return jsonb_build_object('booking_id', p_booking_id, 'status', 'started');
end;
$$;

create or replace function public.rpc_booking_worker_done(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  b record;
begin
  if v_uid is null then raise exception 'TAKEIT_AUTH_REQUIRED'; end if;

  select * into b from public.bookings where id = p_booking_id for update;
  if b.id is null then
    raise exception 'TAKEIT_BOOKING_NOT_FOUND: %', p_booking_id;
  end if;
  if b.worker_id <> v_uid then
    raise exception 'TAKEIT_NOT_BOOKING_WORKER: only the booked worker can mark done';
  end if;
  if b.status <> 'started' then
    raise exception 'TAKEIT_INVALID_TRANSITION: booking % is %, worker_done needs started',
      p_booking_id, b.status;
  end if;

  update public.bookings
  set status = 'worker_done', worker_done_at = now()
  where id = p_booking_id;

  perform public.enqueue_notification(b.customer_id, 'booking.worker_done',
    jsonb_build_object('booking_id', p_booking_id, 'job_id', b.job_id));
  perform public.audit_write(v_uid, 'booking.worker_done', 'bookings', p_booking_id,
    jsonb_build_object('from', 'started', 'to', 'worker_done'));

  return jsonb_build_object('booking_id', p_booking_id, 'status', 'worker_done');
end;
$$;

create or replace function public.rpc_booking_customer_confirm(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  b record;
begin
  if v_uid is null then raise exception 'TAKEIT_AUTH_REQUIRED'; end if;

  select * into b from public.bookings where id = p_booking_id for update;
  if b.id is null then
    raise exception 'TAKEIT_BOOKING_NOT_FOUND: %', p_booking_id;
  end if;
  if b.customer_id <> v_uid then
    raise exception 'TAKEIT_NOT_BOOKING_CUSTOMER: only the customer can confirm completion';
  end if;
  if b.status <> 'worker_done' then
    raise exception 'TAKEIT_INVALID_TRANSITION: booking % is %, confirm needs worker_done',
      p_booking_id, b.status;
  end if;

  update public.bookings
  set status = 'customer_confirmed', completed_at = now()
  where id = p_booking_id;

  update public.worker_profiles
  set jobs_completed = jobs_completed + 1
  where user_id = b.worker_id;

  -- job completed once no booking on it is still in flight
  update public.jobs j set status = 'completed'
  where j.id = b.job_id
    and not exists (
      select 1 from public.bookings b2
      where b2.job_id = j.id
        and b2.status not in ('customer_confirmed', 'cancelled'));

  perform public.enqueue_notification(b.worker_id, 'booking.completed',
    jsonb_build_object('booking_id', p_booking_id, 'job_id', b.job_id));
  perform public.audit_write(v_uid, 'booking.customer_confirm', 'bookings', p_booking_id,
    jsonb_build_object('from', 'worker_done', 'to', 'customer_confirmed'));

  -- C3: completion is the point where the contact-masking soft-block lifts
  return jsonb_build_object('booking_id', p_booking_id,
                            'status', 'customer_confirmed',
                            'contact_unlocked', true);
end;
$$;

create or replace function public.rpc_booking_cancel(
  p_booking_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  b record;
  v_other uuid;
begin
  if v_uid is null then raise exception 'TAKEIT_AUTH_REQUIRED'; end if;
  if p_reason is not null and char_length(p_reason) > 500 then
    raise exception 'TAKEIT_REASON_TOO_LONG: max 500 characters';
  end if;

  select * into b from public.bookings where id = p_booking_id for update;
  if b.id is null then
    raise exception 'TAKEIT_BOOKING_NOT_FOUND: %', p_booking_id;
  end if;
  if v_uid not in (b.customer_id, b.worker_id) then
    raise exception 'TAKEIT_NOT_BOOKING_PARTY';
  end if;
  if b.status not in ('confirmed', 'started') then
    raise exception 'TAKEIT_INVALID_TRANSITION: booking % is %, cancel needs confirmed or started',
      p_booking_id, b.status;
  end if;

  update public.bookings set status = 'cancelled' where id = p_booking_id;

  -- reopen the job if nothing active remains on it
  update public.jobs j set status = 'open'
  where j.id = b.job_id
    and j.status in ('matched', 'in_progress')
    and not exists (
      select 1 from public.bookings b2
      where b2.job_id = j.id and b2.status <> 'cancelled');

  v_other := case when v_uid = b.customer_id then b.worker_id else b.customer_id end;
  perform public.enqueue_notification(v_other, 'booking.cancelled',
    jsonb_build_object('booking_id', p_booking_id, 'job_id', b.job_id));
  perform public.audit_write(v_uid, 'booking.cancel', 'bookings', p_booking_id,
    jsonb_build_object('from', b.status, 'to', 'cancelled', 'reason', p_reason));

  return jsonb_build_object('booking_id', p_booking_id, 'status', 'cancelled');
end;
$$;

create or replace function public.rpc_booking_dispute(
  p_booking_id uuid, p_reason text, p_evidence jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  b record;
  v_other uuid;
  v_dispute uuid;
begin
  if v_uid is null then raise exception 'TAKEIT_AUTH_REQUIRED'; end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 3 and 2000 then
    raise exception 'TAKEIT_REASON_LENGTH: dispute reason must be 3-2000 characters';
  end if;

  select * into b from public.bookings where id = p_booking_id for update;
  if b.id is null then
    raise exception 'TAKEIT_BOOKING_NOT_FOUND: %', p_booking_id;
  end if;
  if v_uid not in (b.customer_id, b.worker_id) then
    raise exception 'TAKEIT_NOT_BOOKING_PARTY';
  end if;
  if b.status not in ('confirmed', 'started', 'worker_done') then
    raise exception 'TAKEIT_INVALID_TRANSITION: booking % is %, dispute needs confirmed/started/worker_done',
      p_booking_id, b.status;
  end if;

  update public.bookings set status = 'disputed' where id = p_booking_id;
  update public.jobs set status = 'disputed' where id = b.job_id;

  insert into public.disputes (booking_id, opened_by, reason, evidence, status)
  values (p_booking_id, v_uid, btrim(p_reason), coalesce(p_evidence, '[]'::jsonb), 'open')
  returning id into v_dispute;

  v_other := case when v_uid = b.customer_id then b.worker_id else b.customer_id end;
  perform public.enqueue_notification(v_other, 'booking.disputed',
    jsonb_build_object('booking_id', p_booking_id, 'dispute_id', v_dispute));
  perform public.audit_write(v_uid, 'booking.dispute', 'bookings', p_booking_id,
    jsonb_build_object('from', b.status, 'to', 'disputed', 'dispute_id', v_dispute));

  return jsonb_build_object('booking_id', p_booking_id, 'status', 'disputed',
                            'dispute_id', v_dispute);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: Phase-1 off-app payment logging (C1: log only, no custody)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_log_offapp_payment(
  p_booking_id uuid, p_amount_cents bigint default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  b record;
  pay record;
  v_amount bigint;
begin
  if v_uid is null then raise exception 'TAKEIT_AUTH_REQUIRED'; end if;

  select * into b from public.bookings where id = p_booking_id for update;
  if b.id is null then
    raise exception 'TAKEIT_BOOKING_NOT_FOUND: %', p_booking_id;
  end if;
  if v_uid not in (b.customer_id, b.worker_id) then
    raise exception 'TAKEIT_NOT_BOOKING_PARTY';
  end if;
  if b.status not in ('started', 'worker_done', 'customer_confirmed') then
    raise exception 'TAKEIT_PAYMENT_TOO_EARLY: booking is %, log after work starts', b.status;
  end if;
  if p_amount_cents is not null and p_amount_cents < 0 then
    raise exception 'TAKEIT_AMOUNT_NEGATIVE';
  end if;

  select * into pay from public.payments
  where booking_id = p_booking_id and provider = 'offapp'
  for update;

  if pay.id is null then
    v_amount := coalesce(p_amount_cents, b.agreed_price_cents);
    insert into public.payments
      (booking_id, provider, amount_cents, commission_cents, status,
       customer_confirmed, worker_confirmed)
    values
      (p_booking_id, 'offapp', v_amount, 0, 'logged',
       v_uid = b.customer_id, v_uid = b.worker_id)
    returning * into pay;
  else
    if p_amount_cents is not null and p_amount_cents <> pay.amount_cents then
      raise exception 'TAKEIT_PAYMENT_AMOUNT_MISMATCH: logged % cents, you sent %',
        pay.amount_cents, p_amount_cents;
    end if;
    update public.payments
    set customer_confirmed = customer_confirmed or (v_uid = b.customer_id),
        worker_confirmed   = worker_confirmed   or (v_uid = b.worker_id)
    where id = pay.id
    returning * into pay;
  end if;

  perform public.audit_write(v_uid, 'payment.log_offapp', 'payments', pay.id,
    jsonb_build_object('booking_id', p_booking_id, 'amount_cents', pay.amount_cents,
                       'customer_confirmed', pay.customer_confirmed,
                       'worker_confirmed', pay.worker_confirmed));

  return jsonb_build_object('payment_id', pay.id, 'status', pay.status,
                            'amount_cents', pay.amount_cents,
                            'customer_confirmed', pay.customer_confirmed,
                            'worker_confirmed', pay.worker_confirmed);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: send a chat message (the ONLY insert path for messages).
-- C3 soft-block: until the booking reaches customer_confirmed, phone-number-
-- looking content is masked server-side and the caller gets phone_masked=true
-- (the client shows the i18n warning). The message still goes through.
-- ---------------------------------------------------------------------------
create or replace function public.rpc_send_message(p_booking_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  b record;
  v_body text;
  v_warned boolean := false;
  v_msg uuid;
  v_other uuid;
begin
  if v_uid is null then raise exception 'TAKEIT_AUTH_REQUIRED'; end if;
  if p_body is null or char_length(p_body) not between 1 and 2000 then
    raise exception 'TAKEIT_MESSAGE_LENGTH: body must be 1-2000 characters';
  end if;

  select * into b from public.bookings where id = p_booking_id;
  if b.id is null then
    raise exception 'TAKEIT_BOOKING_NOT_FOUND: %', p_booking_id;
  end if;
  if v_uid not in (b.customer_id, b.worker_id) then
    raise exception 'TAKEIT_NOT_BOOKING_PARTY: chat is for the two booking parties only';
  end if;
  if b.status = 'cancelled' then
    raise exception 'TAKEIT_CHAT_CLOSED: booking is cancelled';
  end if;

  v_body := p_body;
  if b.status <> 'customer_confirmed' and public.text_contains_phone(p_body) then
    v_body := public.mask_phone_numbers(p_body);
    v_warned := true;
  end if;

  insert into public.messages (booking_id, sender_id, body)
  values (p_booking_id, v_uid, v_body)
  returning id into v_msg;

  v_other := case when v_uid = b.customer_id then b.worker_id else b.customer_id end;
  perform public.enqueue_notification(v_other, 'message.new',
    jsonb_build_object('booking_id', p_booking_id, 'message_id', v_msg));
  -- audit WITHOUT the body (no chat content in the audit log)
  perform public.audit_write(v_uid, 'message.send', 'messages', v_msg,
    jsonb_build_object('booking_id', p_booking_id, 'phone_masked', v_warned));

  return jsonb_build_object('message_id', v_msg, 'phone_masked', v_warned);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: submit a review (double-blind: stored unpublished; published when both
-- sides have submitted; publish_due_reviews() reveals at 48h; the reviews RLS
-- policy also treats >48h-old reviews as visible so no cron is required).
-- ---------------------------------------------------------------------------
create or replace function public.rpc_submit_review(
  p_booking_id uuid, p_rating integer, p_comment text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  b record;
  v_reviewee uuid;
  v_direction public.review_direction;
  v_review uuid;
  v_both boolean;
begin
  if v_uid is null then raise exception 'TAKEIT_AUTH_REQUIRED'; end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'TAKEIT_RATING_RANGE: rating must be 1-5';
  end if;
  if p_comment is not null and char_length(p_comment) > 1000 then
    raise exception 'TAKEIT_COMMENT_TOO_LONG: max 1000 characters';
  end if;

  select * into b from public.bookings where id = p_booking_id;
  if b.id is null then
    raise exception 'TAKEIT_BOOKING_NOT_FOUND: %', p_booking_id;
  end if;
  if v_uid not in (b.customer_id, b.worker_id) then
    raise exception 'TAKEIT_NOT_BOOKING_PARTY';
  end if;
  if b.status <> 'customer_confirmed' then
    raise exception 'TAKEIT_BOOKING_NOT_COMPLETED: reviews open after customer confirmation (booking is %)',
      b.status;
  end if;

  if v_uid = b.customer_id then
    v_direction := 'c_to_w';
    v_reviewee := b.worker_id;
  else
    v_direction := 'w_to_c';
    v_reviewee := b.customer_id;
  end if;

  begin
    insert into public.reviews
      (booking_id, reviewer_id, reviewee_id, direction, rating, comment)
    values
      (p_booking_id, v_uid, v_reviewee, v_direction, p_rating, p_comment)
    returning id into v_review;
  exception when unique_violation then
    raise exception 'TAKEIT_ALREADY_REVIEWED: one review per party per booking';
  end;

  select count(*) = 2 into v_both
  from public.reviews r where r.booking_id = p_booking_id;

  if v_both then
    update public.reviews
    set is_published = true, published_at = now()
    where booking_id = p_booking_id and is_published = false;
  end if;

  perform public.enqueue_notification(v_reviewee, 'review.received',
    jsonb_build_object('booking_id', p_booking_id, 'published', v_both));
  perform public.audit_write(v_uid, 'review.submit', 'reviews', v_review,
    jsonb_build_object('booking_id', p_booking_id, 'direction', v_direction,
                       'published', v_both));

  return jsonb_build_object('review_id', v_review, 'published', v_both);
end;
$$;

-- ---------------------------------------------------------------------------
-- nearby_workers — PostGIS proximity browse.
-- Repo law: geography is never decided by the alphabet — ordering is distance,
-- then STABLE user_id tiebreak. Proximity here is the caller's chosen filter
-- radius (bounded), never a hidden default filter. Capped at 100 rows; the
-- 'truncated' column reports when the cap dropped rows (silence is not safety).
-- ---------------------------------------------------------------------------
create or replace function public.nearby_workers(
  lat double precision,
  lng double precision,
  category text default null,
  radius_km integer default 10)
returns table (
  worker_id           uuid,
  display_name        text,
  avatar_url          text,
  neighborhood        text,
  categories          text[],
  availability_status public.availability_status,
  price_min_cents     bigint,
  price_max_cents     bigint,
  price_type          text,
  rating_avg          numeric,
  review_count        integer,
  jobs_completed      integer,
  badge_level         public.badge_level,
  verification_level  public.verification_level,
  distance_m          double precision,
  truncated           boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_point extensions.geography;
  v_total bigint;
begin
  if lat is null or lng is null
     or lat not between -90 and 90 or lng not between -180 and 180 then
    raise exception 'TAKEIT_GEO_RANGE: lat -90..90, lng -180..180';
  end if;
  if category is not null and char_length(category) > 80 then
    raise exception 'TAKEIT_QUERY_TOO_LONG: category filter max 80 characters';
  end if;
  if radius_km is null or radius_km not between 1 and 100 then
    raise exception 'TAKEIT_RADIUS_RANGE: radius_km must be 1-100';
  end if;

  v_point := extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography;

  select count(*) into v_total
  from public.worker_profiles wp
  where wp.geo is not null
    and extensions.st_dwithin(wp.geo, v_point, radius_km * 1000.0)
    and (category is null or category = any (wp.categories));

  return query
  select wp.user_id,
         p.display_name,
         p.avatar_url,
         wp.neighborhood,
         wp.categories,
         wp.availability_status,
         wp.price_min_cents,
         wp.price_max_cents,
         wp.price_type,
         wp.rating_avg,
         wp.review_count,
         wp.jobs_completed,
         wp.badge_level,
         wp.verification_level,
         extensions.st_distance(wp.geo, v_point)::double precision as distance_m,
         (v_total > 100) as truncated
  from public.worker_profiles wp
  join public.profiles p on p.id = wp.user_id
  where wp.geo is not null
    and extensions.st_dwithin(wp.geo, v_point, radius_km * 1000.0)
    and (category is null or category = any (wp.categories))
  order by extensions.st_distance(wp.geo, v_point) asc,
           wp.user_id asc          -- stable id tiebreak, never the alphabet
  limit 100;
end;
$$;

-- ---------------------------------------------------------------------------
-- 24h auto-release: worker_done -> customer_confirmed (SPEC: function written
-- now, NOT scheduled — Phase 2, flag-gated, via pg_cron:
--   select cron.schedule('takeit-auto-release', '*/30 * * * *',
--                        $sql$select public.auto_release_bookings()$sql$);
-- pg_cron is NOT required for this migration to apply.)
-- ---------------------------------------------------------------------------
create or replace function public.auto_release_bookings()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  b record;
  v_count integer := 0;
begin
  for b in
    select * from public.bookings
    where status = 'worker_done'
      and worker_done_at is not null
      and worker_done_at <= now() - interval '24 hours'
    for update skip locked
  loop
    update public.bookings
    set status = 'customer_confirmed', completed_at = now()
    where id = b.id;

    update public.worker_profiles
    set jobs_completed = jobs_completed + 1
    where user_id = b.worker_id;

    update public.jobs j set status = 'completed'
    where j.id = b.job_id
      and not exists (
        select 1 from public.bookings b2
        where b2.job_id = j.id
          and b2.status not in ('customer_confirmed', 'cancelled'));

    perform public.enqueue_notification(b.customer_id, 'booking.auto_released',
      jsonb_build_object('booking_id', b.id));
    perform public.enqueue_notification(b.worker_id, 'booking.completed',
      jsonb_build_object('booking_id', b.id, 'auto_released', true));
    perform public.audit_write(null, 'booking.auto_release', 'bookings', b.id,
      jsonb_build_object('from', 'worker_done', 'to', 'customer_confirmed'));

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- 48h double-blind reveal (batch flag flip; the reviews RLS policy already
-- treats >48h-old reviews as visible, so reads do not depend on this running).
create or replace function public.publish_due_reviews()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with published as (
    update public.reviews
    set is_published = true, published_at = now()
    where is_published = false
      and created_at <= now() - interval '48 hours'
    returning id
  )
  select count(*)::int into v_count from published;

  if v_count > 0 then
    perform public.audit_write(null, 'reviews.publish_due', 'reviews', null,
      jsonb_build_object('published_count', v_count));
  end if;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function ACLs. CREATE FUNCTION grants EXECUTE to PUBLIC by default —
-- revoke everywhere, then grant exactly what each caller class needs.
-- ---------------------------------------------------------------------------

-- helpers callable by signed-in clients (and edge functions)
revoke execute on function public.has_role(uuid, public.app_role)            from public, anon;
grant  execute on function public.has_role(uuid, public.app_role)            to authenticated, service_role;

revoke execute on function public.verification_level_rank(public.verification_level) from public, anon;
grant  execute on function public.verification_level_rank(public.verification_level) to authenticated, service_role;

revoke execute on function public.mask_phone(text)          from public, anon;
grant  execute on function public.mask_phone(text)          to authenticated, service_role;

revoke execute on function public.text_contains_phone(text) from public, anon;
grant  execute on function public.text_contains_phone(text) to authenticated, service_role;

revoke execute on function public.mask_phone_numbers(text)  from public, anon;
grant  execute on function public.mask_phone_numbers(text)  to authenticated, service_role;

-- internal-only (called from inside SECURITY DEFINER bodies, or by the server)
revoke execute on function public.audit_write(uuid, text, text, uuid, jsonb) from public, anon, authenticated;
grant  execute on function public.audit_write(uuid, text, text, uuid, jsonb) to service_role;

revoke execute on function public.enqueue_notification(uuid, text, jsonb)    from public, anon, authenticated;
grant  execute on function public.enqueue_notification(uuid, text, jsonb)    to service_role;

revoke execute on function public.set_updated_at()          from public, anon, authenticated;
revoke execute on function public.handle_new_user()         from public, anon, authenticated;
revoke execute on function public.recompute_worker_rating() from public, anon, authenticated;

-- state-machine RPCs: signed-in users only
revoke execute on function public.rpc_post_job(text, text, text, text, text, text, double precision, double precision, boolean, text, text, date, text, bigint, integer) from public, anon;
grant  execute on function public.rpc_post_job(text, text, text, text, text, text, double precision, double precision, boolean, text, text, date, text, bigint, integer) to authenticated, service_role;

revoke execute on function public.rpc_apply_to_job(uuid, text, text) from public, anon;
grant  execute on function public.rpc_apply_to_job(uuid, text, text) to authenticated, service_role;

revoke execute on function public.rpc_accept_application(uuid, bigint) from public, anon;
grant  execute on function public.rpc_accept_application(uuid, bigint) to authenticated, service_role;

revoke execute on function public.rpc_booking_start(uuid) from public, anon;
grant  execute on function public.rpc_booking_start(uuid) to authenticated, service_role;

revoke execute on function public.rpc_booking_worker_done(uuid) from public, anon;
grant  execute on function public.rpc_booking_worker_done(uuid) to authenticated, service_role;

revoke execute on function public.rpc_booking_customer_confirm(uuid) from public, anon;
grant  execute on function public.rpc_booking_customer_confirm(uuid) to authenticated, service_role;

revoke execute on function public.rpc_booking_cancel(uuid, text) from public, anon;
grant  execute on function public.rpc_booking_cancel(uuid, text) to authenticated, service_role;

revoke execute on function public.rpc_booking_dispute(uuid, text, jsonb) from public, anon;
grant  execute on function public.rpc_booking_dispute(uuid, text, jsonb) to authenticated, service_role;

revoke execute on function public.rpc_log_offapp_payment(uuid, bigint) from public, anon;
grant  execute on function public.rpc_log_offapp_payment(uuid, bigint) to authenticated, service_role;

revoke execute on function public.rpc_send_message(uuid, text) from public, anon;
grant  execute on function public.rpc_send_message(uuid, text) to authenticated, service_role;

revoke execute on function public.rpc_submit_review(uuid, integer, text) from public, anon;
grant  execute on function public.rpc_submit_review(uuid, integer, text) to authenticated, service_role;

revoke execute on function public.nearby_workers(double precision, double precision, text, integer) from public, anon;
grant  execute on function public.nearby_workers(double precision, double precision, text, integer) to authenticated, service_role;

-- maintenance: server-side only
revoke execute on function public.auto_release_bookings() from public, anon, authenticated;
grant  execute on function public.auto_release_bookings() to service_role;

revoke execute on function public.publish_due_reviews()   from public, anon, authenticated;
grant  execute on function public.publish_due_reviews()   to service_role;
