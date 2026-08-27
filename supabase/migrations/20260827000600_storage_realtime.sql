-- =============================================================================
-- Take It v2 — 000600 storage & realtime
--
-- Buckets:
--   avatars       PUBLIC  — owner writes into <uid>/..., anyone reads
--   verifications PRIVATE — owner writes into <uid>/..., ONLY ops/admin read
--                           (C2: manual-ID images; 30-day deletion after
--                            decision is a service_role job, not a client path)
-- Realtime: messages + notifications on publication supabase_realtime.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Buckets
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values
  ('avatars', 'avatars', true),
  ('verifications', 'verifications', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- storage.objects policies (names are takeit_-prefixed to avoid collisions)
-- ---------------------------------------------------------------------------

-- avatars: public read
drop policy if exists takeit_avatars_public_read on storage.objects;
create policy takeit_avatars_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'avatars');

-- avatars: owner writes only inside their own <uid>/ folder
drop policy if exists takeit_avatars_owner_insert on storage.objects;
create policy takeit_avatars_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists takeit_avatars_owner_update on storage.objects;
create policy takeit_avatars_owner_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists takeit_avatars_owner_delete on storage.objects;
create policy takeit_avatars_owner_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text);

-- verifications: owner may UPLOAD into their own folder…
drop policy if exists takeit_verifications_owner_insert on storage.objects;
create policy takeit_verifications_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'verifications'
    and (storage.foldername(name))[1] = (select auth.uid())::text);

-- …but ONLY ops/admin may read the documents (SPEC: "only ops/admin read
-- documents"). No owner re-read, no client delete (retention is server-side).
drop policy if exists takeit_verifications_ops_read on storage.objects;
create policy takeit_verifications_ops_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'verifications'
    and (public.has_role((select auth.uid()), 'ops')
         or public.has_role((select auth.uid()), 'admin')));

-- ---------------------------------------------------------------------------
-- Realtime publication: messages + notifications
-- (walrus enforces the tables' RLS, so parties-only visibility carries over)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public' and tablename = 'messages') then
      alter publication supabase_realtime add table public.messages;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public' and tablename = 'notifications') then
      alter publication supabase_realtime add table public.notifications;
    end if;
  else
    -- Hard failure on purpose: chat/notifications silently not being realtime
    -- is exactly the "silence is not safety" failure mode. The publication
    -- exists on hosted Supabase and is created by the CI shim.
    raise exception 'publication supabase_realtime not found — realtime would be silently dead';
  end if;
end
$$;
