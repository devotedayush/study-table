import type { ExamAttempt } from '@/lib/learning-store'
import type { ExamAIAnalysis } from '@/lib/exam-analysis'

type FeedbackReply = { analysis: ExamAIAnalysis; model?: string; reasoning?: string }
type Options = { signal: AbortSignal; scope: string; refresh?: boolean; checkOnly?: boolean; onPending?: () => void }

export class FeedbackPendingError extends Error {
  constructor() {
    super('Analysis is taking longer than expected. Check status later to continue the same analysis. Your results are saved.')
    this.name = 'FeedbackPendingError'
  }
}

function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, ms)
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
  })
}

/** The server owns saved results/jobs. Only an explicit refresh requests a generation. */
export async function requestExamFeedback(attempt: ExamAttempt, options: Options): Promise<FeedbackReply> {
  const deadline = Date.now() + 90_000
  const refreshId = options.refresh ? crypto.randomUUID() : undefined
  let polling = options.checkOnly ?? false
  let failures = 0
  while (Date.now() < deadline) {
    options.signal.throwIfAborted()
    let response: Response
    try {
      response = await fetch('/api/exam/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(polling ? { attemptId: attempt.id } : { attempt, refreshId }),
        signal: AbortSignal.any([options.signal, AbortSignal.timeout(Math.max(1, Math.min(30000, deadline - Date.now())))]),
      })
      if (response.status >= 500 && failures++ < 2) { await pause(3000, options.signal); continue }
    } catch (error) {
      if (options.signal.aborted) throw error
      if (Date.now() >= deadline) throw new FeedbackPendingError()
      if (failures++ < 2) { await pause(3000, options.signal); continue }
      throw new Error('The analysis connection was interrupted. Check status or refresh when you are ready; your results are saved.')
    }
    let data
    try { data = await response.json() }
    catch { throw new Error('The analysis connection was interrupted. Your results are saved.') }
    if (response.status === 202 && data.status === 'pending') {
      polling = true
      failures = 0
      options.onPending?.()
      const interval = typeof data.retryAfterMs === 'number' && Number.isFinite(data.retryAfterMs) ? data.retryAfterMs : 2500
      await pause(Math.min(deadline - Date.now(), Math.min(10000, Math.max(1000, interval))), options.signal)
      continue
    }
    if (!response.ok || !data.analysis || typeof data.analysis.summary !== 'string' || !Array.isArray(data.analysis.focusAreas)) {
      throw new Error(data.error || 'AI analysis could not be completed. Your results are saved.')
    }
    return data as FeedbackReply
  }
  throw new FeedbackPendingError()
}
