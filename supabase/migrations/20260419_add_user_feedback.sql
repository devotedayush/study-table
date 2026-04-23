create table if not exists public.user_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  source text not null default 'button',
  area text,
  message text not null,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

create index if not exists user_feedback_user_created_idx
on public.user_feedback (user_id, created_at desc);

create index if not exists user_feedback_status_idx
on public.user_feedback (status, created_at desc);

alter table public.user_feedback enable row level security;

drop policy if exists "Users can read own feedback" on public.user_feedback;
create policy "Users can read own feedback"
  on public.user_feedback for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own feedback" on public.user_feedback;
create policy "Users can insert own feedback"
  on public.user_feedback for insert
  with check (auth.uid() = user_id);

drop policy if exists "Admins can read all feedback" on public.user_feedback;
create policy "Admins can read all feedback"
  on public.user_feedback for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));

drop policy if exists "Admins can update feedback" on public.user_feedback;
create policy "Admins can update feedback"
  on public.user_feedback for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));
