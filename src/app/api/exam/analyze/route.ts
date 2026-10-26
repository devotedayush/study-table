import { createHash } from 'node:crypto'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { isLocalStudyRequest } from '@/lib/server/imported-mocks'
import { startExamFeedback, pollExamFeedback } from '@/lib/ai/exam-feedback'
import { signFeedbackJob, verifyFeedbackJob } from '@/lib/ai/feedback-job'
import { EXAM_AI_MODEL, EXAM_AI_REASONING } from '@/lib/ai/exam-generation'
import { buildExamDiagnostic, type ExamAIAnalysis } from '@/lib/exam-analysis'
import type { ExamAttempt } from '@/lib/learning-store'
export const runtime = 'nodejs'
export const maxDuration = 300
const contentBlock = z.object({
  type: z.enum(['paragraph', 'table', 'math', 'list']),
  text: z.string().max(10000),
  headers: z.array(z.string().max(1500)).max(32),
  rows: z.array(z.array(z.string().max(1500)).max(32)).max(200),
  items: z.array(z.string().max(5000)).max(100),
}).refine(block => block.type !== 'table' || (block.rows.length > 0 && block.rows[0].length > 0 && block.rows.every(row => row.length === (block.headers.length || block.rows[0].length))), 'Table columns must align')
const question = z.object({ id: z.string().min(1).max(200), prompt: z.string().min(1).max(10000), options: z.array(z.string().max(5000)).min(2).max(8), correctIndex: z.number().int().min(-1).max(7), rationale: z.string().max(10000), subjectId: z.string().max(150), subject: z.string().max(200), topicId: z.string().max(200).optional(), topic: z.string().max(300).optional(), concept: z.string().max(250).optional(), content: z.array(contentBlock).min(1).max(120).optional(), nativeTranscription: z.object({ version: z.literal(1), status: z.enum(['checked', 'needs_review']), notes: z.array(z.string().max(2000)).max(100) }).optional(), sourceQuestionNumber: z.number().int().positive().optional(), sourceSession: z.number().int().min(1).max(2).optional(), answerVerified: z.boolean().optional() }).refine(q => q.answerVerified === false || (q.correctIndex >= 0 && q.correctIndex < q.options.length), 'Invalid answer key')
const schema = z.object({ attempt: z.object({ id: z.string().uuid(), title: z.string().max(300), mode: z.enum(['full_mock','chapter','custom','uploaded','retry']), startedAt: z.string().datetime(), finishedAt: z.string().datetime(), questions: z.array(question).min(1).max(1200), answers: z.array(z.number().int().min(0).max(7).nullable()).max(1200), flagged: z.array(z.number().int().nonnegative()).max(1200), elapsedSeconds: z.number().nonnegative().max(200000), questionSeconds: z.array(z.number().nonnegative().max(200000)).max(1200), score: z.number().min(0).max(100) }) }).refine(({ attempt }) => attempt.answers.length === attempt.questions.length && attempt.questionSeconds.length === attempt.questions.length && new Set(attempt.questions.map(q => q.id)).size === attempt.questions.length && attempt.answers.every((a, i) => a === null || a < attempt.questions[i].options.length), 'Answers and questions do not match')
type AnalysisResult = { analysis: ExamAIAnalysis } | { job: string }
const cache = new Map<string, { at: number; result: Promise<AnalysisResult> }>()
const headers = { 'Cache-Control': 'private, no-store' }
class AnalysisError extends Error {
  constructor(message: string, public status: number) { super(message) }
}
function analysisResponse(result: AnalysisResult) {
  if ('job' in result) return Response.json({ status: 'pending', job: result.job, retryAfterMs: 2500 }, { status: 202, headers })
  const analysis = result.analysis
  return Response.json({ analysis, ...(analysis.generatedBy === 'rules' ? {} : { model: EXAM_AI_MODEL, reasoning: EXAM_AI_REASONING }) }, { headers })
}
export async function POST(request: Request) {
  try {
    const raw = await request.text()
    if (raw.length > 3_000_000) return Response.json({ error: 'This attempt is too large to analyze.' }, { status: 413, headers })
    let input: unknown
    try { input = JSON.parse(raw) } catch { return Response.json({ error: 'Send a completed attempt.' }, { status: 400, headers }) }
    const poll = z.object({ job: z.string().min(1).max(50000) }).strict().safeParse(input)
    const parsed = poll.success ? null : schema.safeParse(input)
    if (!poll.success && !parsed?.success) return Response.json({ error: 'The saved attempt is incomplete or invalid. Scored results remain available.' }, { status: 400, headers })
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user && !isLocalStudyRequest(request)) return Response.json({ error: 'Sign in for AI explanations. Your topic breakdown and practice buttons already work.' }, { status: 401, headers })
    const owner = user?.id ?? 'local'
    if (poll.success) {
      const secret = process.env.OPENAI_API_KEY
      const job = secret && verifyFeedbackJob(poll.data.job, owner, secret)
      if (!job) return Response.json({ error: 'This explanation session has expired. Retry to start a new explanation.' }, { status: 410, headers })
      try {
        const analysis = await pollExamFeedback(job.responseId, job.context)
        if (analysis && job.cacheKey) cache.set(job.cacheKey, { at: Date.now(), result: Promise.resolve({ analysis }) })
        return analysisResponse(analysis ? { analysis } : { job: poll.data.job })
      } catch (error) {
        if (job.cacheKey) cache.delete(job.cacheKey)
        throw new AnalysisError(error instanceof Error ? error.message : 'Please retry the explanation.', 422)
      }
    }
    if (!parsed?.success) throw new AnalysisError('Send a completed attempt.', 400)
    const attempt = parsed.data.attempt as ExamAttempt
    const digest = createHash('sha256').update(JSON.stringify(attempt)).digest('hex')
    const key = `${owner}:${digest}`
    const existing = cache.get(key)
    if (existing && Date.now() - existing.at < 8 * 60 * 1000) return analysisResponse(await existing.result)
    if (cache.size >= 100) cache.delete(cache.keys().next().value as string)
    // Insert before the quota check/provider call, so concurrent retries share one job and quota charge.
    const result: Promise<AnalysisResult> = Promise.resolve().then(async () => {
      const diagnostic = buildExamDiagnostic(attempt)
      if (user && diagnostic.totals.answered > 0 && diagnostic.weakTopics.length > 0) {
        const { data: allowed, error } = await supabase.rpc('bump_ai_usage', { p_limit: 20 })
        if (error) throw new AnalysisError('Cloud AI usage could not be checked. Your topic breakdown is already available.', 503)
        if (!allowed) throw new AnalysisError('Your daily AI limit has been reached. Topic results and targeted practice still work.', 429)
      }
      const started = await startExamFeedback(attempt)
      return 'analysis' in started ? started : { job: signFeedbackJob(started.responseId, owner, started.context, process.env.OPENAI_API_KEY!, key) }
    })
    cache.set(key, { at: Date.now(), result })
    try { return analysisResponse(await result) }
    catch (error) { cache.delete(key); throw error }
  } catch (error) {
    const timeout = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)
    return Response.json({ error: timeout ? 'The explanation service could not be reached. Retry shortly; your results are saved.' : error instanceof Error ? error.message : 'AI feedback is unavailable. Your results are saved.' }, { status: error instanceof AnalysisError ? error.status : 502, headers })
  }
}
