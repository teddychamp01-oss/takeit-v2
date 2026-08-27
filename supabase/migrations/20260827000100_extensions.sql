-- =============================================================================
-- Take It v2 — 000100 extensions
-- Target: Supabase Postgres 17 (project snfkefcluzkdeztdtdnk) and the CI shim
-- (postgis/postgis:17-3.5 after supabase/ci/supabase_shim.sql).
--
-- MEASURED on live project 2026-08-26 via MCP list_extensions:
--   pgcrypto installed in schema "extensions"; postgis NOT installed yet;
--   pg_cron NOT installed. Nothing here requires pg_cron (SPEC: the 24h
--   auto-release function is written but NOT scheduled — Phase 2, flag-gated).
-- =============================================================================

create schema if not exists extensions;

create extension if not exists postgis  with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- Guard: every later migration references extensions.geography / extensions.st_*
-- / extensions.crypt. If either extension ended up in a different schema
-- (e.g. pre-installed in public), fail HERE with a clear message instead of
-- failing 300 lines into the tables migration.
-- Nullable comparisons are coalesced (CLAUDE.md Gate 2: no verifier that
-- cannot fail).
do $$
declare
  v_schema text;
begin
  select n.nspname into v_schema
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'postgis';
  if coalesce(v_schema, '(not installed)') <> 'extensions' then
    raise exception 'postgis is in schema % — this baseline requires schema "extensions" (all references are written extensions.*)',
      coalesce(v_schema, '(not installed)');
  end if;

  select n.nspname into v_schema
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pgcrypto';
  if coalesce(v_schema, '(not installed)') <> 'extensions' then
    raise exception 'pgcrypto is in schema % — this baseline requires schema "extensions"',
      coalesce(v_schema, '(not installed)');
  end if;
end
$$;

-- Roles must be able to resolve extensions.* referenced from RLS policies and
-- SECURITY DEFINER bodies (execute on postgis functions is granted to PUBLIC
-- by the extension itself; schema USAGE is what can be missing).
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant usage on schema extensions to anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant usage on schema extensions to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant usage on schema extensions to service_role;
  end if;
end
$$;
