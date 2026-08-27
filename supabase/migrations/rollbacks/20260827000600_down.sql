-- Rollback for 20260827000600_storage_realtime.sql
-- Apply rollbacks in REVERSE numeric order (000600 first, 000100 last).

-- realtime: detach tables if the publication still carries them
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime drop table public.messages;
  end if;
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime drop table public.notifications;
  end if;
end
$$;

-- storage policies
drop policy if exists takeit_avatars_public_read        on storage.objects;
drop policy if exists takeit_avatars_owner_insert       on storage.objects;
drop policy if exists takeit_avatars_owner_update       on storage.objects;
drop policy if exists takeit_avatars_owner_delete       on storage.objects;
drop policy if exists takeit_verifications_owner_insert on storage.objects;
drop policy if exists takeit_verifications_ops_read     on storage.objects;

-- buckets (objects first — bucket rows cannot be deleted while objects remain).
-- DESTRUCTIVE for uploaded files; that is what rolling back this migration means.
delete from storage.objects where bucket_id in ('avatars', 'verifications');
delete from storage.buckets where id in ('avatars', 'verifications');
