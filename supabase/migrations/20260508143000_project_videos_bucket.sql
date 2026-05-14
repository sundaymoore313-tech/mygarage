-- Create Supabase Storage bucket for recorded project videos (MP4 only)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-videos',
  'project-videos',
  false,
  262144000, -- 250 MB max per video
  array['video/mp4']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Allow authenticated users to upload videos inside their own folder
drop policy if exists "Users can upload their own project videos" on storage.objects;
create policy "Users can upload their own project videos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'project-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow authenticated users to list/read their own videos
drop policy if exists "Users can view their own project videos" on storage.objects;
create policy "Users can view their own project videos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'project-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow authenticated users to replace/update their own videos
drop policy if exists "Users can update their own project videos" on storage.objects;
create policy "Users can update their own project videos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'project-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow authenticated users to delete their own videos
drop policy if exists "Users can delete their own project videos" on storage.objects;
create policy "Users can delete their own project videos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'project-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
