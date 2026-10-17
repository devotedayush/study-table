-- Private PDFs follow the existing signed-in mock-library access model.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('study-materials', 'study-materials', false, 52428800, array['application/pdf'])
on conflict (id) do nothing;

create policy "Authenticated study material readers"
on storage.objects for select to authenticated
using (bucket_id = 'study-materials');
