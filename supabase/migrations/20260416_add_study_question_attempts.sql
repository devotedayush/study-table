create table if not exists public.study_question_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subtopic_id text not null,
  topic text not null,
  subtopic text not null,
  prompt text not null,
  options jsonb not null default '[]'::jsonb,
  correct_index integer not null,
  rationale text not null default '',
  selected_index integer not null,
  answered_correctly boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists study_question_attempts_user_subtopic_created_idx
on public.study_question_attempts (user_id, subtopic_id, created_at desc);

create index if not exists study_question_attempts_user_subtopic_correct_idx
on public.study_question_attempts (user_id, subtopic_id, answered_correctly, created_at desc);

alter table public.study_question_attempts enable row level security;

drop policy if exists "Users can read own question attempts" on public.study_question_attempts;
create policy "Users can read own question attempts"
  on public.study_question_attempts for select
  using (auth.uid() = user_id);

drop policy if exists "Users can write own question attempts" on public.study_question_attempts;
create policy "Users can write own question attempts"
  on public.study_question_attempts for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own question attempts" on public.study_question_attempts;
create policy "Users can delete own question attempts"
  on public.study_question_attempts for delete
  using (auth.uid() = user_id);
