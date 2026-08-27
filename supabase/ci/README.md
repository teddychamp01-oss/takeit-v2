# CI database dry-run

Applies the full baseline on plain Postgres+PostGIS (no Supabase platform),
e.g. the `postgis/postgis:17-3.5` GitHub Actions service container.

Order matters:

```bash
export PGPASSWORD=postgres
PSQL="psql -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=1"

# 1. shim FIRST (fresh database only — never against hosted Supabase)
$PSQL -f supabase/ci/supabase_shim.sql

# 2. migrations in numeric order
for f in supabase/migrations/2*.sql; do $PSQL -f "$f"; done

# 3. seed (re-runnable; run twice to prove idempotency)
$PSQL -f supabase/seed/seed.sql
$PSQL -f supabase/seed/seed.sql
```

Rollback drill (reverse order):

```bash
for f in $(ls -r supabase/migrations/rollbacks/2*_down.sql); do $PSQL -f "$f"; done
```

RLS persona smoke test (superuser can impersonate):

```sql
set role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select count(*) from public.worker_profiles;  -- allowed
update public.bookings set status = 'cancelled';  -- must FAIL (no grant)
reset role;
```

The shim is CI-only: it force-relocates postgis/pgcrypto into the
`extensions` schema by drop+recreate, which is destructive anywhere else.
