-- PERSONA SMOKE TEST — the gate that would have caught the 000710 outage.
--
-- WHY THIS FILE EXISTS. Migration 000710 revoked worker_profiles.geo from
-- clients to close a PII leak. It was verified by running the FRONTEND's
-- queries — all of which passed. Nobody ran a query against `jobs`, whose RLS
-- POLICY internally reads wp.geo. Policy quals execute with the caller's
-- privileges, so every read of jobs began failing 42501 in production, and the
-- failure was invisible to a test suite that only checked the tables it changed.
--
-- The lesson generalises: verifying the tables you touched is not the same as
-- verifying the tables whose POLICIES touch them. This file reads every table
-- the app reads, as each real persona, through RLS. It must run after the
-- migrations and seed on a scratch database.
--
-- It asserts REACHABILITY (no 42501 / no policy explosion), not row counts —
-- row-level semantics are covered by the RLS attack matrix. A table the app
-- reads that a legitimate persona cannot read at all is always a bug.

\set ON_ERROR_STOP on

do $smoke$
declare
  personas constant text[] := array[
    'c0000000-0000-4000-8000-000000000001',  -- customer
    'a0000000-0000-4000-8000-000000000001'   -- worker
  ];
  -- every table the client reads on a normal session
  tables constant text[] := array[
    'profiles','worker_profiles','service_categories','service_packages',
    'jobs','applications','bookings','messages','reviews','notifications',
    'saved_workers','guarantors','verifications','payments'
  ];
  p text; t text; n bigint; failures text := '';
begin
  foreach p in array personas loop
    foreach t in array tables loop
      perform set_config('request.jwt.claims',
        json_build_object('sub', p, 'role','authenticated')::text, true);
      execute 'set local role authenticated';
      begin
        execute format('select count(*) from public.%I', t) into n;
      exception when others then
        failures := failures || format(E'\n  persona %s cannot read %s: %s %s',
                                       left(p,8), t, SQLSTATE, SQLERRM);
      end;
      reset role;
    end loop;
  end loop;

  -- the columns 000710 protects must STAY unreadable (the fix must not be
  -- "fixed" by granting them back — that is the tempting one-line regression)
  perform set_config('request.jwt.claims',
    json_build_object('sub', personas[1], 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute 'select geo from public.worker_profiles limit 1';
    reset role;
    failures := failures || E'\n  REGRESSION: worker_profiles.geo is readable by clients (PII leak reopened)';
  exception when insufficient_privilege then reset role;
            when others then reset role;
  end;

  perform set_config('request.jwt.claims',
    json_build_object('sub', personas[1], 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute 'select telegram_id from public.profiles limit 1';
    reset role;
    failures := failures || E'\n  REGRESSION: profiles.telegram_id is readable by clients';
  exception when insufficient_privilege then reset role;
            when others then reset role;
  end;

  if failures <> '' then
    raise exception 'PERSONA SMOKE FAILED:%', failures;
  end if;
  raise notice 'persona smoke: OK — % personas x % tables reachable, protected columns still blocked',
    array_length(personas,1), array_length(tables,1);
end
$smoke$;
