-- Storage bucket for CT17's optional post-image attachment. Public read (post images
-- are visible to the whole league once posted, same as post text); upload restricted to
-- commissioners, scoped to a path prefixed by their own roster id so one commissioner
-- can't overwrite another's upload.
insert into storage.buckets (id, name, public)
values ('post-images', 'post-images', true)
on conflict (id) do nothing;

create policy post_images_public_read on storage.objects
  for select using (bucket_id = 'post-images');

create policy post_images_commissioner_upload on storage.objects
  for insert to authenticated with check (
    bucket_id = 'post-images'
    and public.is_commissioner()
    and (storage.foldername(name))[1] = public.current_roster_id()::text
  );
