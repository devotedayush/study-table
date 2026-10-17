import { createHash } from 'node:crypto'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { isLocalStudyRequest } from '@/lib/server/imported-mocks'
import { generateExamFeedback } from '@/lib/ai/exam-feedback'
import { EXAM_AI_MODEL, EXAM_AI_REASONING } from '@/lib/ai/exam-generation'
import { buildExamDiagnostic, type ExamAIAnalysis } from '@/lib/exam-analysis'
import type { ExamAttempt } from '@/lib/learning-store'
export const runtime = 'nodejs'
export const maxDuration = 300
const question = z.object({ id: z.string().min(1).max(200), prompt: z.string().min(1).max(10000), options: z.array(z.string().max(5000)).min(2).max(8), correctIndex: z.number().int().min(-1).max(7), rationale: z.string().max(10000), subjectId: z.string().max(150), subject: z.string().max(200), topicId: z.string().max(200).optional(), topic: z.string().max(300).optional(), concept: z.string().max(250).optional(), sourceQuestionNumber: z.number().int().positive().optional(), sourceSession: z.number().int().min(1).max(2).optional(), answerVerified: z.boolean().optional() }).refine(q => q.answerVerified === false || (q.correctIndex >= 0 && q.correctIndex < q.options.length), 'Invalid answer key')
const schema = z.object({ attempt: z.object({ id: z.string().uuid(), title: z.string().max(300), mode: z.enum(['full_mock','chapter','custom','uploaded','retry']), startedAt: z.string().datetime(), finishedAt: z.string().datetime(), questions: z.array(question).min(1).max(1200), answers: z.array(z.number().int().min(0).max(7).nullable()).max(1200), flagged: z.array(z.number().int().nonnegative()).max(1200), elapsedSeconds: z.number().nonnegative().max(200000), questionSeconds: z.array(z.number().nonnegative().max(200000)).max(1200), score: z.number().min(0).max(100) }) }).refine(({ attempt }) => attempt.answers.length === attempt.questions.length && attempt.questionSeconds.length === attempt.questions.length && new Set(attempt.questions.map(q => q.id)).size === attempt.questions.length && attempt.answers.every((a, i) => a === null || a < attempt.questions[i].options.length), 'Answers and questions do not match')
const cache = new Map<string, { at: number; result: Promise<ExamAIAnalysis> }>()
function analysisResponse(analysis: ExamAIAnalysis) {
  return Response.json({ analysis, ...(analysis.generatedBy === 'rules' ? {} : { model: EXAM_AI_MODEL, reasoning: EXAM_AI_REASONING }) })
}
export async function POST(request: Request) {
  try {
    const raw = await request.text()
    if (raw.length > 3_000_000) return Response.json({ error: 'This attempt is too large to analyze.' }, { status: 413 })
    let input: unknown
    try { input = JSON.parse(raw) } catch { return Response.json({ error: 'Send a completed attempt.' }, { status: 400 }) }
    const parsed = schema.safeParse(input)
    if (!parsed.success) return Response.json({ error: 'The saved attempt is incomplete or invalid. Scored results remain available.' }, { status: 400 })
    const attempt = parsed.data.attempt as ExamAttempt
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user && !isLocalStudyRequest(request)) return Response.json({ error: 'Sign in for AI explanations. Your topic breakdown and practice buttons already work.' }, { status: 401 })
    const digest = createHash('sha256').update(JSON.stringify(attempt)).digest('hex')
    const key = `${user?.id ?? 'local'}:${digest}`
    const existing = cache.get(key)
    if (existing && Date.now() - existing.at < 86400000) return analysisResponse(await existing.result)
    const diagnostic = buildExamDiagnostic(attempt)
    if (user && diagnostic.totals.answered > 0 && diagnostic.weakTopics.length > 0) {
      const { data: allowed, error } = await supabase.rpc('bump_ai_usage', { p_limit: 20 })
      if (error) return Response.json({ error: 'Cloud AI usage could not be checked. Your topic breakdown is already available.' }, { status: 503 })
      if (!allowed) return Response.json({ error: 'Your daily AI limit has been reached. Topic results and targeted practice still work.' }, { status: 429 })
    }
    if (cache.size >= 100) cache.delete(cache.keys().next().value as string)
    const result = generateExamFeedback(attempt)
    cache.set(key, { at: Date.now(), result })
    try { return analysisResponse(await result) }
    catch (error) { cache.delete(key); throw error }
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'AI feedback is unavailable. Your results are saved.' }, { status: 502 }) }
}
