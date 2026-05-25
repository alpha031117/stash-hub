-- 0005_note_images_bucket.sql
-- Public storage bucket for notepad image uploads.
-- Path scheme: {user_id}/{uuid}.{ext}. Public bucket so <img src> works without
-- signed URLs; the per-user folder + RLS only governs writes/deletes.

insert into storage.buckets (id, name, public)
values ('note-images', 'note-images', true)
on conflict (id) do nothing;

create policy "users upload own note images" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'note-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "users delete own note images" on storage.objects
for delete to authenticated
using (
  bucket_id = 'note-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "public read note images" on storage.objects
for select to public
using (bucket_id = 'note-images');
