create table if not exists public.revision_note_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  note_id text not null,
  reviewed boolean not null default false,
  bookmarked boolean not null default false,
  last_reviewed_at timestamptz,
  review_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, note_id)
);

create table if not exists public.calculator_drill_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  drill_id text not null,
  attempted_count integer not null default 0,
  correct_count integer not null default 0,
  last_answer text not null default '',
  last_attempted_at timestamptz,
  status text not null default 'unattempted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, drill_id)
);

create index if not exists revision_note_progress_user_updated_idx
on public.revision_note_progress (user_id, updated_at desc);

create index if not exists calculator_drill_progress_user_updated_idx
on public.calculator_drill_progress (user_id, updated_at desc);

alter table public.revision_note_progress enable row level security;
alter table public.calculator_drill_progress enable row level security;

drop policy if exists "Users can read own revision note progress" on public.revision_note_progress;
create policy "Users can read own revision note progress"
  on public.revision_note_progress for select
  using (auth.uid() = user_id);

drop policy if exists "Users can write own revision note progress" on public.revision_note_progress;
create policy "Users can write own revision note progress"
  on public.revision_note_progress for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can read own calculator drill progress" on public.calculator_drill_progress;
create policy "Users can read own calculator drill progress"
  on public.calculator_drill_progress for select
  using (auth.uid() = user_id);

drop policy if exists "Users can write own calculator drill progress" on public.calculator_drill_progress;
create policy "Users can write own calculator drill progress"
  on public.calculator_drill_progress for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
