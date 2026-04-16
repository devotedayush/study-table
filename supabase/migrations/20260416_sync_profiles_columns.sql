alter table if exists public.profiles
add column if not exists username text,
add column if not exists email text,
add column if not exists exam_date date,
add column if not exists target_study_hours numeric,
add column if not exists preferred_session_minutes integer,
add column if not exists preferred_pacing text default 'balanced',
add column if not exists preferred_rest_days text[] default '{}',
add column if not exists onboarding_completed boolean not null default false,
add column if not exists created_at timestamp default now();

update public.profiles p
set email = coalesce(p.email, i.identity_data->>'email', i.provider_id)
from auth.identities i
where i.user_id = p.id
  and p.email is null;

create unique index if not exists profiles_username_unique_idx
on public.profiles (lower(username))
where username is not null;

create unique index if not exists profiles_email_unique_idx
on public.profiles (lower(email))
where email is not null;

notify pgrst, 'reload schema';
