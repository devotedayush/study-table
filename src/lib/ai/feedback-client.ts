import type { ExamAttempt } from '@/lib/learning-store'
import type { ExamAIAnalysis } from '@/lib/exam-analysis'

type FeedbackReply = { analysis: ExamAIAnalysis; model?: string; reasoning?: string }
type Options = { signal: AbortSignal; scope: string; onPending?: () => void }

function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, ms)
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
  })
}

/** Resume the same provider job after refresh/retry; polling never resubmits the attempt. */
export async function requestExamFeedback(attempt: ExamAttempt, options: Options): Promise<FeedbackReply> {
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(attempt))))).map(byte => byte.toString(16).padStart(2, '0')).join('')
  const storageKey = `study-table:feedback-job:${options.scope}:${digest}`
  let job: string | null = null
  try { job = sessionStorage.getItem(storageKey) } catch { /* Storage can be disabled. */ }
  let failures = 0
  for (;;) {
    options.signal.throwIfAborted()
    let response: Response
    try {
      response = await fetch('/api/exam/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(job ? { job } : { attempt }),
        signal: AbortSignal.any([options.signal, AbortSignal.timeout(30000)]),
      })
      if (job && response.status >= 500 && failures++ < 3) { await pause(3000, options.signal); continue }
    } catch (error) {
      if (options.signal.aborted) throw error
      if (job && failures++ < 3) { await pause(3000, options.signal); continue }
      throw new Error('The explanation connection was interrupted. Retry to continue; your results are saved.')
    }
    let data
    try { data = await response.json() }
    catch { throw new Error('The explanation connection was interrupted. Retry to continue; your results are saved.') }
    if (response.status === 202 && typeof data.job === 'string') {
      job = data.job
      failures = 0
      try { sessionStorage.setItem(storageKey, data.job) } catch { /* Continue in this tab. */ }
      options.onPending?.()
      await pause(Math.min(10000, Math.max(1000, data.retryAfterMs ?? 2500)), options.signal)
      continue
    }
    if (!response.ok || !data.analysis || typeof data.analysis.summary !== 'string' || !Array.isArray(data.analysis.focusAreas)) {
      if (response.status < 500) { try { sessionStorage.removeItem(storageKey) } catch { /* Optional cache. */ } }
      throw new Error(data.error || 'AI explanation could not be completed. Your results are saved.')
    }
    try { sessionStorage.removeItem(storageKey) } catch { /* Optional cache. */ }
    return data as FeedbackReply
  }
}
