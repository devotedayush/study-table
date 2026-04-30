import type { SupabaseClient } from '@supabase/supabase-js'

export type RevisionNote = {
  id: string
  subject: string
  module: string
  concept: string
  terms: string[]
  formulas: string[]
  trap: string
  quickRecall: string
  tags: string[]
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((item): item is string => typeof item === 'string')
}

export async function fetchRevisionLibraryNotes(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('revision_library_notes')
    .select('id, sort_order, subject, module, concept, terms, formulas, trap, quick_recall, tags')
    .order('sort_order', { ascending: true })

  if (error) {
    throw error
  }

  return (data ?? []).map(
    (row) =>
      ({
        id: row.id,
        subject: row.subject,
        module: row.module,
        concept: row.concept,
        terms: toStringArray(row.terms),
        formulas: toStringArray(row.formulas),
        trap: row.trap ?? '',
        quickRecall: row.quick_recall ?? '',
        tags: toStringArray(row.tags),
      }) satisfies RevisionNote,
  )
}

export function getRevisionLibrarySubjects(notes: RevisionNote[]) {
  return Array.from(new Set(notes.map((note) => note.subject))).sort((a, b) => a.localeCompare(b))
}
