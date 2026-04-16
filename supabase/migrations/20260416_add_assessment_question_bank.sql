alter table public.profiles
add column if not exists is_admin boolean not null default false;

create table if not exists public.assessment_sets (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null,
  source text not null check (source in ('admin_upload', 'generated')),
  scope text not null check (scope in ('topic_quiz', 'chapter_quiz', 'full_mock')),
  title text not null,
  subject_id text,
  subject_title text,
  topic_id text,
  topic_title text,
  subtopic_id text,
  subtopic_title text,
  raw_text text,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assessment_questions (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.assessment_sets(id) on delete cascade,
  ordinal integer not null default 0,
  prompt text not null,
  options jsonb not null default '[]'::jsonb,
  correct_index integer not null,
  rationale text not null default '',
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.study_question_attempts
add column if not exists assessment_set_id uuid references public.assessment_sets(id) on delete set null,
add column if not exists scope text,
add column if not exists source text;

create index if not exists assessment_sets_scope_created_idx on public.assessment_sets (scope, created_at desc);
create index if not exists assessment_sets_published_scope_idx on public.assessment_sets (published, scope, created_at desc);
create index if not exists assessment_questions_set_ordinal_idx on public.assessment_questions (set_id, ordinal);
create index if not exists study_question_attempts_set_idx on public.study_question_attempts (user_id, assessment_set_id, created_at desc);

alter table public.assessment_sets enable row level security;
alter table public.assessment_questions enable row level security;

drop policy if exists "Published assessment sets are readable" on public.assessment_sets;
create policy "Published assessment sets are readable"
  on public.assessment_sets for select
  using (published = true or created_by = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

drop policy if exists "Admins can manage assessment sets" on public.assessment_sets;
create policy "Admins can manage assessment sets"
  on public.assessment_sets for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

drop policy if exists "Generated assessment sets can be inserted by owner" on public.assessment_sets;
create policy "Generated assessment sets can be inserted by owner"
  on public.assessment_sets for insert
  with check (created_by = auth.uid() and source = 'generated');

drop policy if exists "Assessment questions follow readable sets" on public.assessment_questions;
create policy "Assessment questions follow readable sets"
  on public.assessment_questions for select
  using (
    exists (
      select 1
      from public.assessment_sets s
      where s.id = set_id
        and (
          s.published = true
          or s.created_by = auth.uid()
          or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
        )
    )
  );

drop policy if exists "Admins can manage assessment questions" on public.assessment_questions;
create policy "Admins can manage assessment questions"
  on public.assessment_questions for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

drop policy if exists "Generated assessment questions can be inserted by owner" on public.assessment_questions;
create policy "Generated assessment questions can be inserted by owner"
  on public.assessment_questions for insert
  with check (exists (select 1 from public.assessment_sets s where s.id = set_id and s.created_by = auth.uid() and s.source = 'generated'));

notify pgrst, 'reload schema';
