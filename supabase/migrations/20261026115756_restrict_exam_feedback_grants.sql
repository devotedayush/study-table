-- Supabase projects can grant broad table defaults. Retain only the operations
-- needed by the per-user feedback store; RLS applies to each of them.
revoke all on public.exam_feedback from authenticated;
grant select, insert, update on public.exam_feedback to authenticated;
