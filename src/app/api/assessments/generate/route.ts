import { NextResponse } from 'next/server'
import { assessmentScopeLabels, buildTargetFromIds, normalizeQuestions, type AssessmentScope } from '@/lib/assessment-bank'
import { createClient } from '@/lib/supabase/server'

type Question = {
  prompt: string
  options: string[]
  correctIndex: number
  rationale: string
}

function dedupeQuestions(questions: Question[]) {
  const seen = new Set<string>()
  return questions.filter((question) => {
    const key = question.prompt.trim().toLowerCase().replace(/\s+/g, ' ')
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

function validQuestion(question: Question) {
  return (
    typeof question.prompt === 'string' &&
    Array.isArray(question.options) &&
    question.options.length >= 3 &&
    Number.isInteger(question.correctIndex) &&
    question.correctIndex >= 0 &&
    question.correctIndex < question.options.length &&
    typeof question.rationale === 'string'
  )
}

function normalizeReviewQuestions(questions: Question[] | undefined) {
  return (questions ?? []).filter(validQuestion).slice(0, 2)
}

function fallbackQuestions(topic: string, subtopic: string, reviewQuestions: Question[] = []): Question[] {
  return dedupeQuestions([
    ...reviewQuestions,
    {
      prompt: `Which statement is most accurate about ${subtopic} within ${topic}?`,
      options: [
        `It should be defined first and then linked to one exam-style example.`,
        `It is only useful in essay questions and rarely matters in CFA Level I.`,
        `It can be ignored once the chapter reading is complete.`,
      ],
      correctIndex: 0,
      rationale: `For CFA Level I, ${subtopic} is most useful when you know the definition, the core formula or rule, and how it appears in a multiple-choice trap.`,
    },
    {
      prompt: `What is the best revision approach for ${subtopic}?`,
      options: [
        `Reread the chapter passively without checking recall.`,
        `Do active recall, then one timed check, then review the mistake pattern.`,
        `Skip revision if confidence feels high.`,
      ],
      correctIndex: 1,
      rationale: `The strongest exam prep loop is recall, application, and feedback. That exposes weak retention and overconfidence faster than passive rereading.`,
    },
    {
      prompt: `If you miss a question on ${subtopic}, what should you capture next?`,
      options: [
        `The mistake category and the exact reason the wrong choice looked tempting.`,
        `Only whether the question felt hard.`,
        `Nothing, because the score already reflects the outcome.`,
      ],
      correctIndex: 0,
      rationale: `Capturing why an incorrect option looked plausible makes later revision much more effective and improves calibration.`,
    },
  ]).slice(0, 4)
}

async function generateWithOpenAI(topic: string, subtopic: string, mode: string, reviewQuestions: Question[], scope: AssessmentScope) {
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    return fallbackQuestions(topic, subtopic, reviewQuestions)
  }

  const prompt = [
    `Generate exactly ${scope === 'full_mock' ? 12 : scope === 'chapter_quiz' ? 8 : 4} CFA Level I multiple-choice questions in JSON only.`,
    `Topic: ${topic}`,
    `Subtopic: ${subtopic}`,
    `Mode: ${mode}. Scope: ${scope}.`,
    reviewQuestions.length > 0
      ? `The student previously missed these questions. Include them or very close variants first so the weak area is tested again: ${JSON.stringify(reviewQuestions)}`
      : '',
    `Return an object with key "questions".`,
    `Each question must have: prompt, options, correctIndex, rationale.`,
    `Use 3 options per question.`,
    `correctIndex must be 0, 1, or 2.`,
    `Keep questions exam-oriented and concise.`,
  ].join('\n')

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-5.4',
      temperature: 0.4,
      messages: [
        {
          role: 'system',
          content: 'You are a CFA Level I assessment generator. Return strict JSON only.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  })

  if (!response.ok) {
    return fallbackQuestions(topic, subtopic, reviewQuestions)
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const content = data.choices?.[0]?.message?.content

  if (!content) {
    return fallbackQuestions(topic, subtopic, reviewQuestions)
  }

  try {
    const parsed = JSON.parse(content) as { questions?: Question[] }
    if (!parsed.questions || parsed.questions.length === 0) {
      return fallbackQuestions(topic, subtopic, reviewQuestions)
    }

    const limit = scope === 'full_mock' ? 12 : scope === 'chapter_quiz' ? 8 : 4
    return dedupeQuestions([...reviewQuestions, ...parsed.questions.filter(validQuestion)]).slice(0, limit)
  } catch {
    return fallbackQuestions(topic, subtopic, reviewQuestions)
  }
}

async function saveGeneratedSet(args: {
  userId: string
  scope: AssessmentScope
  targetId?: string
  questions: Question[]
}) {
  const supabase = await createClient()
  const target = buildTargetFromIds(args.scope, args.targetId ?? '')
  const now = new Date().toISOString()
  const title = `${assessmentScopeLabels[args.scope]}: ${target.title}`

  const { data: set, error: setError } = await supabase
    .from('assessment_sets')
    .insert({
      created_by: args.userId,
      source: 'generated',
      scope: args.scope,
      title,
      subject_id: target.subjectId,
      subject_title: target.subjectTitle,
      topic_id: target.topicId,
      topic_title: target.topicTitle,
      subtopic_id: target.subtopicId,
      subtopic_title: target.subtopicTitle,
      published: true,
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .single()

  if (setError || !set?.id) {
    throw new Error(setError?.message ?? 'Could not save generated assessment.')
  }

  const rows = normalizeQuestions(args.questions).map((question, index) => ({
    set_id: set.id,
    ordinal: index + 1,
    prompt: question.prompt,
    options: question.options,
    correct_index: question.correctIndex,
    rationale: question.rationale,
    tags: question.tags ?? [],
  }))

  const { error: questionError } = await supabase.from('assessment_questions').insert(rows)
  if (questionError) {
    throw new Error(questionError.message)
  }

  return set.id as string
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    topic?: string
    subtopic?: string
    mode?: string
    scope?: AssessmentScope
    targetId?: string
    reviewQuestions?: Question[]
  }

  if (!body.topic || !body.subtopic) {
    return NextResponse.json({ error: 'Topic and subtopic are required.' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Please sign in first.' }, { status: 401 })
  }

  const scope = body.scope ?? 'topic_quiz'
  const reviewQuestions = normalizeReviewQuestions(body.reviewQuestions)
  const questions = await generateWithOpenAI(body.topic, body.subtopic, body.mode ?? scope, reviewQuestions, scope)
  const setId = await saveGeneratedSet({
    userId: user.id,
    scope,
    targetId: body.targetId,
    questions,
  })

  return NextResponse.json({ questions, setId, source: 'generated', scope })
}
