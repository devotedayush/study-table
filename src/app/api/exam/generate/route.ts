import { NextResponse } from 'next/server'
import { isLocalStudyRequest } from '@/lib/server/imported-mocks'
import { createClient } from '@/lib/supabase/server'
import { generateExamQuestions, EXAM_AI_MODEL, EXAM_AI_REASONING } from '@/lib/ai/exam-generation'
export const maxDuration = 300
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const count = Number(body.count)
    if (!['chapter','custom'].includes(body.mode) || !Number.isInteger(count) || count < 1 || count > 180) return NextResponse.json({error:'Choose a valid question count (1–180).'}, {status:400})
    if ((body.focusConcept !== undefined && (typeof body.focusConcept !== 'string' || body.focusConcept.length > 250)) || (body.practiceTask !== undefined && (typeof body.practiceTask !== 'string' || body.practiceTask.length > 1000))) return NextResponse.json({error:'Choose a concise practice focus.'},{status:400})
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user && !isLocalStudyRequest(request)) return NextResponse.json({ error: 'Sign in to generate AI questions. Bundled and uploaded practice remain available without AI.' }, { status: 401 })
    if (user) {
      const { data: allowed, error } = await supabase.rpc('bump_ai_usage', { p_limit: 20 })
      if (error || !allowed) return NextResponse.json({error:'Your daily AI generation limit has been reached. Saved practice sets are still available.'},{status:429})
    }
    const questions = await generateExamQuestions({count,subjectId:body.subjectId,topicId:body.topicId,focusConcept:body.focusConcept,practiceTask:body.practiceTask})
    return NextResponse.json({questions, source:'AI-generated practice',model:EXAM_AI_MODEL,reasoning:EXAM_AI_REASONING})
  } catch (error) {
    return NextResponse.json({error: error instanceof Error ? error.message : 'Could not generate questions.'},{status:502})
  }
}
