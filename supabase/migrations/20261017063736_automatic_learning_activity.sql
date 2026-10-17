-- Automatic platform interactions and complete exam attempts; no study planning.
create table if not exists public.learning_activity (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('note_open','flashcard_view','flashcard_flip','flashcard_known','flashcard_again','assessment_answer','assessment_complete','syllabus_open')),
  occurred_at timestamptz not null default now(),
  data jsonb not null check (jsonb_typeof(data) = 'object')
);
create index if not exists learning_activity_user_time on public.learning_activity(user_id, occurred_at desc);
alter table public.learning_activity enable row level security;
create policy "Own learning activity" on public.learning_activity to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.learning_activity to authenticated;

create table if not exists public.exam_attempts (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  finished_at timestamptz not null default now(),
  data jsonb not null check (jsonb_typeof(data) = 'object')
);
create index if not exists exam_attempts_user_time on public.exam_attempts(user_id, finished_at desc);
alter table public.exam_attempts enable row level security;
create policy "Own exam attempts" on public.exam_attempts to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.exam_attempts to authenticated;
