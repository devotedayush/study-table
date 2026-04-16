alter table if exists public.profiles
add column if not exists onboarding_completed boolean not null default false;

update public.profiles
set onboarding_completed = true
where exam_date is not null
  and onboarding_completed = false;
