create table public.recall_flashcards (
  id text primary key,
  level text not null default 'L1' check (level = 'L1'),
  subject_id text not null,
  subject text not null,
  topic_id text not null,
  topic text not null,
  kind text not null check (kind in ('concept','formula','process','warning','application')),
  front text not null check (char_length(front) between 15 and 600),
  back text not null check (char_length(back) between 10 and 2400),
  hint text not null default '',
  tags text[] not null default '{}',
  source_id text not null,
  source_page integer not null check (source_page > 0),
  source_quote text not null,
  content_hash text not null unique,
  sort_order integer not null,
  import_batch text not null,
  generated_model text not null,
  reasoning_effort text not null,
  reviewed_model text not null,
  review_status text not null check (review_status in ('draft','agent_reviewed')),
  created_at timestamptz not null default now()
);

create index recall_flashcards_library_idx
  on public.recall_flashcards (level, review_status, sort_order, id);
create index recall_flashcards_topic_idx
  on public.recall_flashcards (subject_id, topic_id);

alter table public.recall_flashcards enable row level security;
revoke all on public.recall_flashcards from anon, authenticated;
grant select on public.recall_flashcards to authenticated;
grant all on public.recall_flashcards to service_role;
create policy "Signed-in users can read reviewed recall cards"
  on public.recall_flashcards for select to authenticated
  using (review_status = 'agent_reviewed');
