-- Persist one current generation and its last successful report per user/attempt.
-- Keep this separate from exam_attempts.data so stale device syncs cannot erase it.
create table public.exam_feedback (
  user_id uuid not null references auth.users(id) on delete cascade,
  attempt_id uuid not null,
  revision uuid not null,
  status text not null check (status in ('pending', 'completed', 'failed')),
  job text,
  analysis jsonb check (analysis is null or jsonb_typeof(analysis) = 'object'),
  error text,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, attempt_id),
  check (status <> 'completed' or analysis is not null)
);
alter table public.exam_feedback enable row level security;
create policy "Own exam feedback" on public.exam_feedback to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
revoke all on public.exam_feedback from anon;
grant select, insert, update on public.exam_feedback to authenticated;
