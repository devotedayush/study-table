import type { SupabaseClient } from '@supabase/supabase-js'
import type { ExamAIAnalysis } from '@/lib/exam-analysis'

export type FeedbackRecord = {
  user_id: string
  attempt_id: string
  revision: string
  status: 'pending' | 'completed' | 'failed'
  job: string | null
  analysis: ExamAIAnalysis | null
  error: string | null
  started_at: string
  expires_at: string
  updated_at: string
}

// Guest mode is explicitly local-only. Signed-in requests always use durable rows.
const localRecords = new Map<string, FeedbackRecord>()

export function createFeedbackStore(client: SupabaseClient, owner: string, local = false) {
  function failure() { return new Error('The saved analysis could not be reached. Please try again; no new analysis was started.') }
  return {
    async read(attemptId: string): Promise<FeedbackRecord | null> {
      if (local) return localRecords.get(attemptId) ?? null
      const result = await client.from('exam_feedback').select('*').eq('user_id', owner).eq('attempt_id', attemptId).maybeSingle()
      if (result.error) throw failure()
      return result.data as FeedbackRecord | null
    },
    async legacyAnalysis(attemptId: string): Promise<ExamAIAnalysis | null> {
      if (local) return null
      const result = await client.from('exam_attempts').select('data').eq('user_id', owner).eq('id', attemptId).maybeSingle()
      if (result.error) throw failure()
      const analysis = result.data?.data?.analysis
      return analysis && typeof analysis.summary === 'string' && Array.isArray(analysis.focusAreas) ? analysis as ExamAIAnalysis : null
    },
    async claim(next: FeedbackRecord, previous: FeedbackRecord | null): Promise<boolean> {
      if (local) {
        const current = localRecords.get(next.attempt_id)
        if (previous ? current?.revision !== previous.revision || current.status !== previous.status : current) return false
        localRecords.set(next.attempt_id, next)
        return true
      }
      const result = previous
        ? await client.from('exam_feedback').update(next).eq('user_id', owner).eq('attempt_id', next.attempt_id).eq('revision', previous.revision).eq('status', previous.status).select('revision').maybeSingle()
        : await client.from('exam_feedback').insert(next).select('revision').maybeSingle()
      if (result.error?.code === '23505') return false
      if (result.error) throw failure()
      return !!result.data
    },
    async update(row: FeedbackRecord, patch: Partial<FeedbackRecord>): Promise<FeedbackRecord | null> {
      const changes = { ...patch, updated_at: new Date().toISOString() }
      if (local) {
        const current = localRecords.get(row.attempt_id)
        if (!current || current.revision !== row.revision || current.status !== row.status) return current ?? null
        const next = { ...current, ...changes }
        localRecords.set(row.attempt_id, next)
        return next
      }
      const result = await client.from('exam_feedback').update(changes).eq('user_id', owner).eq('attempt_id', row.attempt_id).eq('revision', row.revision).eq('status', row.status).select('*').maybeSingle()
      if (result.error) throw failure()
      if (result.data) return result.data as FeedbackRecord
      const current = await client.from('exam_feedback').select('*').eq('user_id', owner).eq('attempt_id', row.attempt_id).maybeSingle()
      if (current.error) throw failure()
      return current.data as FeedbackRecord | null
    },
  }
}

export type FeedbackStore = ReturnType<typeof createFeedbackStore>
