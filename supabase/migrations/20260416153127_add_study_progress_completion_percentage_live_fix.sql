alter table if exists public.study_progress
add column if not exists completion_percentage integer
check (completion_percentage between 0 and 100);

notify pgrst, 'reload schema';
