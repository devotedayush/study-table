-- Shared study library: signed-in app users may read; clients cannot publish/replace papers.
create policy "Authenticated study mock readers"
on storage.objects for select to authenticated
using (bucket_id = 'study-mocks');
