import { readFile } from 'node:fs/promises'
import path from 'node:path'
import catalog from '@/lib/study-material-catalog.json'
import { materialAccess, MATERIAL_HEADERS } from '@/lib/server/study-materials'
import type { RecallFlashcard } from '@/lib/recall-flashcards'

export const runtime = 'nodejs'
type CardRow = {
  id: string; subject_id: string; subject: string; topic_id: string; topic: string
  kind: string; front: string; back: string; hint: string; tags: string[]
  source_id: string; source_page: number
}

export async function GET(request: Request) {
  try {
    const { allowed, local, supabase } = await materialAccess(request)
    if (!allowed) return Response.json({ error: 'Sign in to study the recall PDF flashcards.' }, { status: 401, headers: MATERIAL_HEADERS })
    let rows: CardRow[] | undefined
    if (local) {
      try {
        rows = JSON.parse(await readFile(path.join(process.cwd(), 'data/recall-flashcards/validated-cards.json'), 'utf8')) as CardRow[]
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }
    if (!rows) {
      rows = []
      const pageSize = 500
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase.from('recall_flashcards')
          .select('id, subject_id, subject, topic_id, topic, kind, front, back, hint, tags, source_id, source_page')
          .eq('level', 'L1').eq('review_status', 'agent_reviewed')
          .order('sort_order').order('id').range(offset, offset + pageSize - 1)
        if (error) throw error
        rows.push(...(data ?? []) as CardRow[])
        if ((data?.length ?? 0) < pageSize) break
      }
    }
    const cards: RecallFlashcard[] = rows.map(row => ({
      id: row.id, subjectId: row.subject_id, subject: row.subject,
      topicId: row.topic_id, topic: row.topic, module: row.topic, kind: row.kind,
      front: row.front, back: row.back, hint: row.hint, tags: row.tags,
      source: { id: row.source_id, page: row.source_page, title: catalog.find(item => item.id === row.source_id)?.title ?? 'Recall PDF' },
    }))
    return Response.json(cards, { headers: MATERIAL_HEADERS })
  } catch {
    return Response.json({ error: 'Could not load the recall cards. Please try again.' }, { status: 503, headers: MATERIAL_HEADERS })
  }
}
