-- Create Supabase Storage bucket for project thumbnails
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-thumbnails',
  'project-thumbnails',
  true,
  524288,  -- 512 KB max per thumbnail
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

-- Allow authenticated users to upload their own thumbnails
create policy "Users can upload their own thumbnails"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'project-thumbnails'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow authenticated users to update/replace their own thumbnails
create policy "Users can update their own thumbnails"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'project-thumbnails'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow authenticated users to delete their own thumbnails
create policy "Users can delete their own thumbnails"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'project-thumbnails'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow public read access so thumbnails load without auth
create policy "Public can view thumbnails"
  on storage.objects for select
  to public
  using (bucket_id = 'project-thumbnails');
