import { NextResponse } from 'next/server'
import { buildTargetFromIds, normalizeQuestions, parseQuestionJson, type AssessmentScope, type BankQuestion } from '@/lib/assessment-bank'
import { createClient } from '@/lib/supabase/server'

function parseLetter(value: string) {
  const letter = value.trim().toUpperCase()
  return letter.length === 1 ? letter.charCodeAt(0) - 65 : Number(value)
}

function parseMarkdownQuestions(markdown: string) {
  const blocks = markdown
    .split(/\n(?=(?:#{1,4}\s*)?(?:Q(?:uestion)?\s*\d+|Question\s*:))/i)
    .map((block) => block.trim())
    .filter(Boolean)

  const questions = blocks.flatMap((block) => {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean)
    const promptLine = lines.find((line) => /^(#{1,4}\s*)?(q(?:uestion)?\s*\d+|question\s*:)/i.test(line)) ?? lines[0]
    const prompt = promptLine.replace(/^(#{1,4}\s*)?(q(?:uestion)?\s*\d+[:.)-]?|question\s*:)\s*/i, '').trim()
    const optionLines = lines.filter((line) => /^[A-D][.)]\s+/.test(line) || /^[-*]\s*[A-D][.)]\s+/.test(line))
    const options = optionLines.map((line) => line.replace(/^[-*]\s*/, '').replace(/^[A-D][.)]\s+/, '').trim())
    const answerLine = lines.find((line) => /^answer\s*[:=-]/i.test(line) || /^correct\s*[:=-]/i.test(line))
    const rationaleLine = lines.find((line) => /^(rationale|explanation)\s*[:=-]/i.test(line))

    if (!prompt || options.length < 2 || !answerLine) {
      return []
    }

    const rawAnswer = answerLine.replace(/^(answer|correct)\s*[:=-]\s*/i, '').trim()
    const correctIndex = /^[A-D]$/i.test(rawAnswer.slice(0, 1)) ? parseLetter(rawAnswer.slice(0, 1)) : Math.max(0, options.findIndex((option) => rawAnswer.includes(option)))

    return [{
      prompt,
      options,
      correctIndex,
      rationale: rationaleLine?.replace(/^(rationale|explanation)\s*[:=-]\s*/i, '').trim() ?? '',
    }]
  })

  return normalizeQuestions(questions)
}

async function parseWithOpenAI(markdown: string) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return []
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-5.4',
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Extract CFA multiple-choice questions from pasted markdown. Return strict JSON with {"questions":[{"prompt":"...","options":["..."],"correctIndex":0,"rationale":"...","tags":["..."]}]}. Do not invent questions.',
        },
        { role: 'user', content: markdown },
      ],
    }),
  })

  if (!response.ok) {
    return []
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
  const content = data.choices?.[0]?.message?.content
  return content ? parseQuestionJson(content) : []
}

async function isAdmin(userId: string, email: string | undefined) {
  const configuredAdmins = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)

  if (email && configuredAdmins.includes(email.toLowerCase())) {
    return true
  }

  const supabase = await createClient()
  const { data } = await supabase.from('profiles').select('is_admin').eq('id', userId).maybeSingle()
  return Boolean(data?.is_admin)
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    title?: string
    scope?: AssessmentScope
    targetId?: string
    markdown?: string
  }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Please sign in first.' }, { status: 401 })
  }

  if (!(await isAdmin(user.id, user.email))) {
    return NextResponse.json({ error: 'Admin access is required.' }, { status: 403 })
  }

  const scope = body.scope ?? 'chapter_quiz'
  const markdown = body.markdown?.trim()
  if (!markdown) {
    return NextResponse.json({ error: 'Paste a markdown question bank first.' }, { status: 400 })
  }

  const aiQuestions = await parseWithOpenAI(markdown)
  const parsedQuestions = aiQuestions.length > 0 ? aiQuestions : parseMarkdownQuestions(markdown)
  const questions = normalizeQuestions(parsedQuestions as BankQuestion[])

  if (questions.length === 0) {
    return NextResponse.json({ error: 'No valid questions were found. Use Q, A/B/C options, Answer, and Rationale labels.' }, { status: 400 })
  }

  const target = buildTargetFromIds(scope, body.targetId ?? '')
  const now = new Date().toISOString()
  const { data: set, error: setError } = await supabase
    .from('assessment_sets')
    .insert({
      created_by: user.id,
      source: 'admin_upload',
      scope,
      title: body.title?.trim() || target.title,
      subject_id: target.subjectId,
      subject_title: target.subjectTitle,
      topic_id: target.topicId,
      topic_title: target.topicTitle,
      subtopic_id: target.subtopicId,
      subtopic_title: target.subtopicTitle,
      raw_text: markdown,
      published: true,
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .single()

  if (setError || !set?.id) {
    return NextResponse.json({ error: setError?.message ?? 'Could not create question set.' }, { status: 500 })
  }

  const { error: questionError } = await supabase.from('assessment_questions').insert(
    questions.map((question, index) => ({
      set_id: set.id,
      ordinal: index + 1,
      prompt: question.prompt,
      options: question.options,
      correct_index: question.correctIndex,
      rationale: question.rationale,
      tags: question.tags ?? [],
    })),
  )

  if (questionError) {
    return NextResponse.json({ error: questionError.message }, { status: 500 })
  }

  return NextResponse.json({
    setId: set.id,
    questionCount: questions.length,
    title: body.title?.trim() || target.title,
  })
}
