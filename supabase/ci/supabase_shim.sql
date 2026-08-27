-- =============================================================================
-- Take It v2 — CI shim for plain Postgres + PostGIS
--
-- PURPOSE: lets ALL migrations in supabase/migrations/ plus supabase/seed/
-- seed.sql apply on the GitHub Actions image postgis/postgis:17-3.5, which has
-- no Supabase platform objects. Run this FIRST, as superuser, on a FRESH
-- database:
--
--   psql -v ON_ERROR_STOP=1 -f supabase/ci/supabase_shim.sql
--   for f in supabase/migrations/2*.sql; do psql -v ON_ERROR_STOP=1 -f "$f"; done
--   psql -v ON_ERROR_STOP=1 -f supabase/seed/seed.sql
--
-- NEVER run this file against the hosted Supabase project — it drops and
-- re-creates postgis/pgcrypto to force them into the "extensions" schema,
-- which is only safe on a throwaway CI database.
--
-- Contents were checked against what the migrations/seed actually reference:
--   roles anon/authenticated/service_role; schema extensions (postgis+pgcrypto
--   inside it); auth.users with every column the seed inserts; auth.uid()/
--   auth.jwt()/auth.role(); storage.buckets/objects + storage.foldername();
--   publication supabase_realtime.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Roles (Supabase ships these; service_role bypasses RLS there too)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Extensions in the "extensions" schema (the postgis docker image installs
--    postgis into public; migration 000100 asserts on the schema, so relocate
--    by drop+recreate — FRESH CI DATABASE ONLY)
-- ---------------------------------------------------------------------------
create schema if not exists extensions;
drop extension if exists postgis cascade;
drop extension if exists pgcrypto cascade;
create extension postgis  with schema extensions;
create extension pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- 3. auth schema: users table (shape covers every column the seed inserts and
--    the signup trigger reads) + the three claim functions
-- ---------------------------------------------------------------------------
create schema if not exists auth;

create table if not exists auth.users (
  instance_id             uuid,
  id                      uuid primary key,
  aud                     varchar(255),
  role                    varchar(255),
  email                   varchar(255),
  encrypted_password      varchar(255),
  email_confirmed_at      timestamptz,
  invited_at              timestamptz,
  confirmation_token      varchar(255) default '',
  confirmation_sent_at    timestamptz,
  recovery_token          varchar(255) default '',
  recovery_sent_at        timestamptz,
  email_change_token_new  varchar(255) default '',
  email_change            varchar(255) default '',
  email_change_sent_at    timestamptz,
  last_sign_in_at         timestamptz,
  raw_app_meta_data       jsonb,
  raw_user_meta_data      jsonb,
  is_super_admin          boolean,
  created_at              timestamptz default now(),
  updated_at              timestamptz default now(),
  phone                   text,
  phone_confirmed_at      timestamptz,
  banned_until            timestamptz,
  deleted_at              timestamptz,
  is_sso_user             boolean not null default false,
  is_anonymous            boolean not null default false
);

-- auth.uid(): sub claim of the request JWT (both claim-setting styles)
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  ), '')::uuid
$$;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select nullif(coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  ), '')
$$;

-- ---------------------------------------------------------------------------
-- 4. storage schema: buckets/objects + foldername() (shape covers the bucket
--    insert in migration 000600 and the policies' predicates)
-- ---------------------------------------------------------------------------
create schema if not exists storage;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  owner              uuid,
  public             boolean default false,
  avif_autodetection boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

create table if not exists storage.objects (
  id               uuid primary key default gen_random_uuid(),
  bucket_id        text references storage.buckets (id),
  name             text,
  owner            uuid,
  owner_id         text,
  version          text,
  metadata         jsonb,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),
  last_accessed_at timestamptz default now(),
  unique (bucket_id, name)
);

alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;

-- Supabase semantics: all path tokens EXCEPT the final one (the filename)
create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select (string_to_array(name, '/'))[1 : cardinality(string_to_array(name, '/')) - 1]
$$;

-- ---------------------------------------------------------------------------
-- 5. Realtime publication
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 6. Grants so the client roles can resolve everything the policies touch
-- ---------------------------------------------------------------------------
grant usage on schema public,  extensions to anon, authenticated, service_role;
grant usage on schema auth,    storage    to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.jwt(), auth.role()
  to public;
grant execute on function storage.foldername(text)
  to public;
grant select, insert, update, delete on storage.buckets, storage.objects
  to service_role;
-- hosted Supabase grants client roles table privileges on storage.objects and
-- lets RLS policies gate them — mirror that here (verified: without this,
-- the storage policy tests fail with "permission denied for table objects")
grant select, insert, update, delete on storage.objects to anon, authenticated;
grant select on storage.buckets to anon, authenticated;
