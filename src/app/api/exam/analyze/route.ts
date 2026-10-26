import { after } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { isLocalStudyRequest } from '@/lib/server/imported-mocks'
import { pollExamFeedback } from '@/lib/ai/exam-feedback'
import { createFeedbackStore, type FeedbackRecord } from '@/lib/ai/feedback-store'
import { requestSavedFeedback, FeedbackError, finishFeedbackInBackground } from '@/lib/ai/feedback-service'
import { verifyFeedbackJob } from '@/lib/ai/feedback-job'
import { EXAM_AI_MODEL, EXAM_AI_REASONING } from '@/lib/ai/exam-generation'
import { buildExamDiagnostic } from '@/lib/exam-analysis'
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
const schema = z.object({ refreshId: z.string().uuid().optional(), attempt: z.object({ id: z.string().uuid(), title: z.string().max(300), mode: z.enum(['full_mock','chapter','custom','uploaded','retry']), startedAt: z.string().datetime(), finishedAt: z.string().datetime(), questions: z.array(question).min(1).max(1200), answers: z.array(z.number().int().min(0).max(7).nullable()).max(1200), flagged: z.array(z.number().int().nonnegative()).max(1200), elapsedSeconds: z.number().nonnegative().max(200000), questionSeconds: z.array(z.number().nonnegative().max(200000)).max(1200), score: z.number().min(0).max(100) }) }).refine(({ attempt }) => attempt.answers.length === attempt.questions.length && attempt.questionSeconds.length === attempt.questions.length && new Set(attempt.questions.map(q => q.id)).size === attempt.questions.length && attempt.answers.every((a, i) => a === null || a < attempt.questions[i].options.length), 'Answers and questions do not match')
const headers = { 'Cache-Control': 'private, no-store' }
function analysisResponse(row: FeedbackRecord) {
  if (row.status === 'failed') return Response.json({ error: row.error || 'Analysis failed. Click Refresh analysis to try again.' }, { status: 422, headers })
  if (row.status === 'pending') return Response.json({ status: 'pending', attemptId: row.attempt_id, job: row.job, retryAfterMs: 2500 }, { status: 202, headers })
  return Response.json({ analysis: row.analysis, ...(row.analysis?.generatedBy === 'rules' ? {} : { model: EXAM_AI_MODEL, reasoning: EXAM_AI_REASONING }) }, { headers })
}
export async function POST(request: Request) {
  try {
    const raw = await request.text()
    if (raw.length > 3_000_000) return Response.json({ error: 'This attempt is too large to analyze.' }, { status: 413, headers })
    let input: unknown
    try { input = JSON.parse(raw) } catch { return Response.json({ error: 'Send a completed attempt.' }, { status: 400, headers }) }
    const status = z.object({ attemptId: z.string().uuid() }).strict().safeParse(input)
    const legacyPoll = z.object({ job: z.string().min(1).max(50000) }).strict().safeParse(input)
    const parsed = status.success || legacyPoll.success ? null : schema.safeParse(input)
    if (!status.success && !legacyPoll.success && !parsed?.success) return Response.json({ error: 'The saved attempt is incomplete or invalid. Scored results remain available.' }, { status: 400, headers })
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user && !isLocalStudyRequest(request)) return Response.json({ error: 'Sign in for AI explanations. Your topic breakdown and practice buttons already work.' }, { status: 401, headers })
    const owner = user?.id ?? 'local'
    const store = createFeedbackStore(supabase, owner, !user)
    let attemptId = status.success ? status.data.attemptId : parsed?.success ? parsed.data.attempt.id : undefined
    // Let tabs opened before this deployment finish their existing signed job.
    if (legacyPoll.success) {
      const job = verifyFeedbackJob(legacyPoll.data.job, owner, process.env.OPENAI_API_KEY ?? '')
      if (!job) throw new FeedbackError('This explanation session expired. Refresh the page and click Refresh analysis.', 410)
      attemptId = job.attemptId
      if (!attemptId) {
        const analysis = await pollExamFeedback(job.responseId, job.context)
        return Response.json(analysis ? { analysis } : { status: 'pending', job: legacyPoll.data.job, retryAfterMs: 2500 }, { status: analysis ? 200 : 202, headers })
      }
    }
    if (!attemptId) throw new FeedbackError('Send a completed attempt.', 400)
    const row = await requestSavedFeedback(store, owner, {
      attemptId,
      attempt: parsed?.success ? parsed.data.attempt as ExamAttempt : undefined,
      refreshId: parsed?.success ? parsed.data.refreshId : undefined,
    }, async (attempt) => {
      const diagnostic = buildExamDiagnostic(attempt)
      if (user && diagnostic.totals.answered > 0 && diagnostic.weakTopics.length > 0) {
        const { data: allowed, error } = await supabase.rpc('bump_ai_usage', { p_limit: 20 })
        if (error) throw new FeedbackError('Cloud AI usage could not be checked. Your topic breakdown is already available.', 503)
        if (!allowed) throw new FeedbackError('Your daily AI limit has been reached. Topic results and targeted practice still work.', 429)
      }
    }, (started) => after(() => finishFeedbackInBackground(store, started, owner)))
    return analysisResponse(row)
  } catch (error) {
    const timeout = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)
    return Response.json({ error: timeout ? 'The analysis service could not be reached. Check status shortly; your results are saved.' : error instanceof Error ? error.message : 'AI analysis is unavailable. Your results are saved.' }, { status: error instanceof FeedbackError ? error.status : 502, headers })
  }
}
