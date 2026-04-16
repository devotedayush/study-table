create table if not exists public.custom_flashcards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null,
  module text not null default 'Custom',
  title text not null,
  prompt text not null,
  answer text not null,
  memory_hook text not null default '',
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists custom_flashcards_user_updated_idx
on public.custom_flashcards (user_id, updated_at desc);

alter table public.custom_flashcards enable row level security;

drop policy if exists "Users can read own custom flashcards" on public.custom_flashcards;
create policy "Users can read own custom flashcards"
  on public.custom_flashcards for select
  using (auth.uid() = user_id);

drop policy if exists "Users can write own custom flashcards" on public.custom_flashcards;
create policy "Users can write own custom flashcards"
  on public.custom_flashcards for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
