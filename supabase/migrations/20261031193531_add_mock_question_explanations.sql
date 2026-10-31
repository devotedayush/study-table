-- Private, version-bound study commentary. Only trusted imports can publish it.
create table public.mock_question_explanations (
  question_id text primary key check (question_id ~ '^mock-[1-6]-s[12]-q[0-9]{3}$'),
  mock_id text not null check (mock_id ~ '^mock-[1-6]$'),
  source_hash text not null check (source_hash ~ '^[a-f0-9]{64}$'),
  explanation jsonb not null check (jsonb_typeof(explanation) = 'object'),
  model text not null default 'gpt-6.1-terra',
  reasoning_effort text not null default 'medium',
  updated_at timestamptz not null default now(),
  check (question_id like mock_id || '-%'),
  check (explanation ->> 'questionId' = question_id),
  check (jsonb_typeof(explanation -> 'options') = 'array')
);
create index mock_question_explanations_mock_idx on public.mock_question_explanations(mock_id);
alter table public.mock_question_explanations enable row level security;
revoke all on table public.mock_question_explanations from anon, authenticated;
grant select on table public.mock_question_explanations to authenticated;
grant all on table public.mock_question_explanations to service_role;
create policy "Signed-in readers can study mock explanations"
on public.mock_question_explanations for select to authenticated using (true);
