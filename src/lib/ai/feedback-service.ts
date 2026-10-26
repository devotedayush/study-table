import { randomUUID } from 'node:crypto'
import type { ExamAttempt } from '@/lib/learning-store'
import { startExamFeedback, pollExamFeedback } from './exam-feedback'
import { signFeedbackJob, verifyFeedbackJob } from './feedback-job'
import type { FeedbackRecord, FeedbackStore } from './feedback-store'

export class FeedbackError extends Error {
  constructor(message: string, public status = 422) { super(message) }
}

export async function pollSavedFeedback(store: FeedbackStore, row: FeedbackRecord, owner: string): Promise<FeedbackRecord> {
  if (row.status !== 'pending') return row
  const expired = Date.parse(row.expires_at) <= Date.now()
  const abandonedStart = !row.job && Date.now() - Date.parse(row.started_at) > 60_000
  if (expired || abandonedStart) {
    return await store.update(row, { status: 'failed', job: null, error: 'This analysis did not finish in time. Click Refresh analysis to try again; your results are saved.' }) ?? row
  }
  if (!row.job) return row
  const job = verifyFeedbackJob(row.job, owner, process.env.OPENAI_API_KEY ?? '')
  if (!job) return await store.update(row, { status: 'failed', job: null, error: 'This analysis session expired. Click Refresh analysis to try again.' }) ?? row
  let analysis
  try { analysis = await pollExamFeedback(job.responseId, job.context) }
  catch (error) {
    return await store.update(row, { status: 'failed', job: null, error: error instanceof Error ? error.message : 'The analysis could not be completed.' }) ?? row
  }
  if (!analysis) return row
  return await store.update(row, { status: 'completed', analysis, job: null, error: null })
    ?? await store.read(row.attempt_id) ?? row
}

/** A database claim, not a process cache, owns each attempt's generation. */
export async function requestSavedFeedback(
  store: FeedbackStore,
  owner: string,
  input: { attemptId: string; attempt?: ExamAttempt; refreshId?: string },
  charge: (attempt: ExamAttempt) => Promise<void>,
  onStarted: (row: FeedbackRecord) => void,
): Promise<FeedbackRecord> {
  let row = await store.read(input.attemptId)
  // A refresh nonce also makes retries of a lost refresh response idempotent.
  const sameRefresh = !!input.refreshId && row?.revision === input.refreshId
  if (row?.status === 'pending') row = await pollSavedFeedback(store, row, owner)
  if (row && (sameRefresh || !input.refreshId || row.status === 'pending')) return row
  if (!input.attempt) throw new FeedbackError('No saved analysis was found. Open the completed attempt to generate it.', 404)

  const legacy = !row ? await store.legacyAnalysis(input.attemptId) : null
  const reuseLegacy = !!legacy && !input.refreshId
  const now = Date.now()
  const next: FeedbackRecord = {
    user_id: owner, attempt_id: input.attemptId, revision: input.refreshId ?? randomUUID(),
    status: reuseLegacy ? 'completed' : 'pending', job: null, analysis: row?.analysis ?? legacy, error: null,
    started_at: new Date(now).toISOString(), updated_at: new Date(now).toISOString(), expires_at: new Date(now + 9 * 60_000).toISOString(),
  }
  if (!await store.claim(next, row)) {
    const winner = await store.read(input.attemptId)
    if (!winner) throw new FeedbackError('Another analysis request is starting. Check status shortly.', 503)
    return winner
  }
  if (reuseLegacy) return next
  try {
    await charge(input.attempt)
    const started = await startExamFeedback(input.attempt)
    const saved = await store.update(next, 'analysis' in started
      ? { status: 'completed', analysis: started.analysis }
      : { job: signFeedbackJob(started.responseId, owner, started.context, process.env.OPENAI_API_KEY!, undefined, input.attemptId) })
    if (!saved) throw new FeedbackError('The analysis was replaced by a newer request. Check status shortly.', 409)
    if (saved.status === 'pending') onStarted(saved)
    return saved
  } catch (error) {
    await store.update(next, { status: 'failed', error: error instanceof Error ? error.message : 'Analysis could not be started.', job: null })
    throw error
  }
}

/** Finish and persist without requiring the results page to remain open. */
export async function finishFeedbackInBackground(store: FeedbackStore, initial: FeedbackRecord, owner: string) {
  const until = Date.now() + 240_000
  try {
    let row: FeedbackRecord | null = initial
    while (row?.status === 'pending' && row.revision === initial.revision && Date.now() < until) {
      await new Promise(resolve => setTimeout(resolve, 4000))
      row = await store.read(initial.attempt_id)
      if (row?.revision === initial.revision) row = await pollSavedFeedback(store, row, owner)
    }
  } catch {
    // A temporary database outage must not discard the durable job or start another generation.
    console.warn('Background exam analysis could not be persisted; the saved job can be checked again.')
  }
}
