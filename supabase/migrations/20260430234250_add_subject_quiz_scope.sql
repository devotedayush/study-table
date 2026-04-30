do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.assessment_sets'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%scope%'
    and pg_get_constraintdef(oid) like '%topic_quiz%'
    and pg_get_constraintdef(oid) like '%chapter_quiz%'
    and pg_get_constraintdef(oid) like '%full_mock%'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.assessment_sets drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.assessment_sets
add constraint assessment_sets_scope_check
check (scope in ('topic_quiz', 'chapter_quiz', 'subject_quiz', 'full_mock'));

notify pgrst, 'reload schema';
