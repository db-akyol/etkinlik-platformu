-- supabase/migrations/0004_event_images_bucket.sql
-- Storage bucket for poster images uploaded via the Instagram-assisted
-- event entry flow (app/admin/instagram-actions.ts) — see
-- docs/design/instagram-assisted-entry.md.
-- Public-read (the images are displayed on the public site), admin-only
-- write — same admin_users-gated posture as every other write policy in
-- this schema (see supabase/migrations/0002_admin_users_and_favorites.sql).

insert into storage.buckets (id, name, public)
values ('event-images', 'event-images', true)
on conflict (id) do nothing;

drop policy if exists "public read event-images" on storage.objects;
create policy "public read event-images" on storage.objects
  for select
  to public
  using (bucket_id = 'event-images');

drop policy if exists "admin upload event-images" on storage.objects;
create policy "admin upload event-images" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'event-images'
    and exists (select 1 from admin_users au where au.id = auth.uid())
  );
