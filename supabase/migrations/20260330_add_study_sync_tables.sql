create extension if not exists pgcrypto;

create table if not exists public.study_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  subtopic_id text not null,
  status text not null default 'not_started',
  minutes_spent integer not null default 0,
  self_confidence numeric(2,1),
  ai_mastery numeric(2,1),
  notes text not null default '',
  difficulty text,
  last_studied_at timestamptz,
  first_completed_at timestamptz,
  revision_due_at timestamptz,
  revision_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, subtopic_id)
);

create table if not exists public.study_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subtopic_id text not null,
  created_at timestamptz not null default now(),
  mode text not null,
  score_percentage numeric(5,2) not null default 0,
  ai_mastery numeric(2,1) not null default 0,
  confidence_at_attempt numeric(2,1),
  question_count integer not null default 0,
  error_categories jsonb not null default '[]'::jsonb,
  explanation_summary text not null default '',
  recommended_action text not null default ''
);

create table if not exists public.study_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  topic text not null,
  body text not null default '',
  tags text[] not null default '{}',
  pinned boolean not null default false,
  review_interval_days integer not null default 7,
  review_due_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.study_mocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  taken_at date not null default current_date,
  total_score numeric(5,2) not null default 0,
  time_taken_minutes integer not null default 0,
  felt_difficulty text not null default 'steady',
  notes text not null default '',
  section_scores jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.flashcard_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id text not null,
  confidence numeric(2,1),
  known boolean not null default false,
  bookmarked boolean not null default false,
  last_reviewed_at timestamptz,
  review_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, card_id)
);

create index if not exists study_progress_user_due_idx on public.study_progress (user_id, revision_due_at);
create index if not exists study_assessments_user_created_idx on public.study_assessments (user_id, created_at desc);
create index if not exists study_notes_user_updated_idx on public.study_notes (user_id, updated_at desc);
create index if not exists study_mocks_user_taken_idx on public.study_mocks (user_id, taken_at desc);

alter table public.study_progress enable row level security;
alter table public.study_assessments enable row level security;
alter table public.study_notes enable row level security;
alter table public.study_mocks enable row level security;
alter table public.flashcard_progress enable row level security;

drop policy if exists "Users can read own study progress" on public.study_progress;
create policy "Users can read own study progress"
  on public.study_progress for select
  using (auth.uid() = user_id);

drop policy if exists "Users can write own study progress" on public.study_progress;
create policy "Users can write own study progress"
  on public.study_progress for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can read own study assessments" on public.study_assessments;
create policy "Users can read own study assessments"
  on public.study_assessments for select
  using (auth.uid() = user_id);

drop policy if exists "Users can write own study assessments" on public.study_assessments;
create policy "Users can write own study assessments"
  on public.study_assessments for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can read own study notes" on public.study_notes;
create policy "Users can read own study notes"
  on public.study_notes for select
  using (auth.uid() = user_id);

drop policy if exists "Users can write own study notes" on public.study_notes;
create policy "Users can write own study notes"
  on public.study_notes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can read own study mocks" on public.study_mocks;
create policy "Users can read own study mocks"
  on public.study_mocks for select
  using (auth.uid() = user_id);

drop policy if exists "Users can write own study mocks" on public.study_mocks;
create policy "Users can write own study mocks"
  on public.study_mocks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can read own flashcard progress" on public.flashcard_progress;
create policy "Users can read own flashcard progress"
  on public.flashcard_progress for select
  using (auth.uid() = user_id);

drop policy if exists "Users can write own flashcard progress" on public.flashcard_progress;
create policy "Users can write own flashcard progress"
  on public.flashcard_progress for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

