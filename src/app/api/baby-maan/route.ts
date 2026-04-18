import { addDays } from 'date-fns'
import { NextResponse } from 'next/server'
import { allSubtopics } from '@/lib/cfa-data'
import {
  buildBabyMaanSystemPrompt,
  buildFlashcardRecord,
  buildMockRecord,
  buildNoteRecord,
  findBestSubjectMatch,
  findBestSubtopicMatch,
  findBestTopicMatch,
  looksLikeProgressFetch,
  makeDefaultReply,
  safeJsonParse,
  type BabyMaanAction,
} from '@/lib/baby-maan'
import { DEMO_AUTH_COOKIE } from '@/lib/demo-auth'
import { createClient } from '@/lib/supabase/server'

type BabyMaanResponse = {
  reply: string
  action: BabyMaanAction
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getDefaultCompletion(status: NonNullable<Extract<BabyMaanAction, { type: 'update_progress' }>['status']>) {
  return {
    not_started: 0,
    in_progress: 35,
    flagged: 35,
    completed_once: 100,
    revised: 100,
    mastered: 100,
  }[status]
}

function resolveProgressTarget(query: string) {
  const subtopic = findBestSubtopicMatch(query)
  const topic = findBestTopicMatch(query)
  const subject = findBestSubjectMatch(query)

  if (subtopic) {
    return {
      scope: 'subtopic' as const,
      title: subtopic.title,
      items: [subtopic],
      subjectTitle: subtopic.subject.title,
      topicTitle: subtopic.topic.title,
    }
  }

  if (topic) {
    const items = allSubtopics.filter((item) => item.topic.id === topic.id)
    return {
      scope: 'topic' as const,
      title: topic.title,
      items,
      subjectTitle: items[0]?.subject.title ?? '',
      topicTitle: topic.title,
    }
  }

  if (subject) {
    const items = allSubtopics.filter((item) => item.subject.id === subject.id)
    return {
      scope: 'subject' as const,
      title: subject.title,
      items,
      subjectTitle: subject.title,
      topicTitle: null,
    }
  }

  return null
}

function splitMinutes(totalMinutes: number, count: number) {
  if (count <= 0 || totalMinutes <= 0) {
    return Array.from({ length: count }, () => 0)
  }

  const base = Math.floor(totalMinutes / count)
  const remainder = totalMinutes % count
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0))
}

function inferHeuristicAction(message: string): BabyMaanResponse {
  const lower = message.toLowerCase()
  const minutesMatch = lower.match(/(\d+)\s*(min|mins|minute|minutes|hr|hrs|hour|hours)/)
  const percentMatch = lower.match(/(\d{1,3})\s*%/)
  const scoreOutOfMatch = lower.match(/(\d{1,3})\s*\/\s*(\d{1,3})/)
  const dateMatch = lower.match(/\d{4}-\d{2}-\d{2}/)

  if (looksLikeProgressFetch(message)) {
    return {
      reply: 'I can look that up for you.',
      action: {
        type: 'fetch_progress',
        query: message.trim(),
      },
    }
  }

  if (lower.includes('mock') || lower.includes('full test') || lower.includes('practice exam')) {
    const totalScore = percentMatch
      ? clamp(Number(percentMatch[1]), 0, 100)
      : scoreOutOfMatch
        ? clamp(Math.round((Number(scoreOutOfMatch[1]) / Number(scoreOutOfMatch[2])) * 100), 0, 100)
        : 0

    return {
      reply: 'I can log that mock result for you.',
      action: {
        type: 'log_mock',
        totalScore,
        notes: message.trim(),
        feltDifficulty: lower.includes('rushed') ? 'rushed' : lower.includes('calm') ? 'calm' : 'steady',
      },
    }
  }

  if (
    (lower.includes('flashcard') || lower.includes('flash card')) &&
    (lower.includes('create') || lower.includes('make') || lower.includes('add') || lower.includes('save'))
  ) {
    const subject = findBestSubjectMatch(message)?.title
    const topic = findBestTopicMatch(message)?.title
    const subtopic = findBestSubtopicMatch(message)?.title
    const target = subtopic ?? topic ?? subject ?? 'this CFA concept'

    return {
      reply: 'I can create that flashcard for you.',
      action: {
        type: 'create_flashcard',
        subject,
        module: topic ?? 'Baby Maan',
        title: target,
        prompt: `What should you remember about ${target}?`,
        answer: message.trim(),
        memoryHook: 'Turn the request into one quick recall cue.',
        tags: ['baby-maan'],
      },
    }
  }

  if (
    lower.includes('exam date') ||
    lower.includes('session') ||
    lower.includes('study hours') ||
    lower.includes('rest day') ||
    lower.includes('pacing') ||
    dateMatch
  ) {
    const hoursMatch = lower.match(/(\d+)\s*hours?/)
    const sessionMatch = lower.match(/(\d+)\s*(min|mins|minute|minutes)\s*sessions?/)

    return {
      reply: 'I can update your study settings with that.',
      action: {
        type: 'update_settings',
        examDate: dateMatch?.[0],
        targetStudyHours: hoursMatch ? Number(hoursMatch[1]) : undefined,
        preferredSessionMinutes: sessionMatch ? Number(sessionMatch[1]) : undefined,
        preferredPacing: lower.includes('gentle') ? 'gentle' : lower.includes('aggressive') ? 'aggressive' : lower.includes('balanced') ? 'balanced' : undefined,
        preferredRestDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].filter((day) => lower.includes(day)),
      },
    }
  }

  if (lower.includes('note') || lower.includes('remember') || lower.includes('trap') || lower.includes('formula')) {
    return {
      reply: 'I can save that as a note.',
      action: {
        type: 'add_note',
        title: message.split('.').find(Boolean)?.trim().slice(0, 72) || 'Study note',
        body: message.trim(),
        topic: findBestSubtopicMatch(message)?.subject.title ?? 'General',
        tags: lower.includes('formula') ? ['formula'] : lower.includes('trap') ? ['trap'] : [],
      },
    }
  }

  const inferredMinutes = minutesMatch
    ? minutesMatch[2].startsWith('h')
      ? Number(minutesMatch[1]) * 60
      : Number(minutesMatch[1])
    : undefined

  return {
    reply: 'I can update your progress with that.',
    action: {
      type: 'update_progress',
      subtopicQuery: message.trim(),
      completionPercentage: percentMatch ? clamp(Number(percentMatch[1]), 0, 100) : undefined,
      minutesSpent: inferredMinutes,
      comfort: lower.includes('confident')
        ? 4
        : lower.includes('easy')
          ? 4
          : lower.includes('good')
            ? 4
            : lower.includes('okay')
              ? 3
              : lower.includes('weak') || lower.includes('confusing') || lower.includes('lost')
                ? 2
                : undefined,
      status: lower.includes('mastered')
        ? 'mastered'
        : lower.includes('revised')
          ? 'revised'
          : lower.includes('finished') || lower.includes('completed')
            ? 'completed_once'
            : lower.includes('flag')
              ? 'flagged'
              : 'in_progress',
      notes: message.trim(),
    },
  }
}

async function parseActionWithOpenAI(message: string) {
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    return inferHeuristicAction(message)
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-5.4',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildBabyMaanSystemPrompt() },
        { role: 'user', content: message },
      ],
    }),
  })

  if (!response.ok) {
    return inferHeuristicAction(message)
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = data.choices?.[0]?.message?.content

  if (!content) {
    return inferHeuristicAction(message)
  }

  const parsed = safeJsonParse<BabyMaanResponse>(content)
  if (!parsed?.reply || !parsed.action?.type) {
    return inferHeuristicAction(message)
  }

  return parsed
}

function buildRevisionDueAt(action: Extract<BabyMaanAction, { type: 'update_progress' }>) {
  const comfort = action.comfort ?? 3
  const status = action.status ?? 'in_progress'

  const days =
    status === 'mastered'
      ? 7
      : status === 'revised'
        ? 4
        : comfort <= 2
          ? 2
          : comfort === 3
            ? 4
            : 6

  return addDays(new Date(), days).toISOString()
}

export async function POST(request: Request) {
  const body = (await request.json()) as { message?: string }
  const message = body.message?.trim()

  if (!message) {
    return NextResponse.json({ error: 'Message is required.' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    const cookieStore = await import('next/headers').then((mod) => mod.cookies())
    const hasDemoSession = cookieStore.get(DEMO_AUTH_COOKIE)?.value === '1'

    if (hasDemoSession) {
      return NextResponse.json({
        reply: 'Baby Maan can chat in demo mode, but saving updates to cloud needs your real account login.',
        applied: false,
        preview: null,
      })
    }

    return NextResponse.json({ error: 'Please sign in first.' }, { status: 401 })
  }

  const parsed = await parseActionWithOpenAI(message)
  const action = parsed.action ?? makeDefaultReply().action

  if (action.type === 'none') {
    return NextResponse.json({
      reply: parsed.reply,
      applied: false,
      preview: null,
    })
  }

  if (action.type === 'fetch_progress') {
    const matched = resolveProgressTarget(action.query)

    if (!matched) {
      return NextResponse.json({
        reply: "I couldn't match that to a syllabus item yet. Try the exact reading or subtopic name.",
        applied: false,
        preview: { attemptedQuery: action.query },
      })
    }

    const subtopicIds = matched.items.map((item) => item.id)
    const { data: rows } = await supabase
      .from('study_progress')
      .select('subtopic_id, status, completion_percentage, minutes_spent, self_confidence, notes, revision_due_at')
      .eq('user_id', user.id)
      .in('subtopic_id', subtopicIds)

    const progressRows = rows ?? []
    const completionValues = matched.items.map((item) => {
      const progress = progressRows.find((row) => row.subtopic_id === item.id)
      if (typeof progress?.completion_percentage === 'number') {
        return progress.completion_percentage
      }

      return progress?.status === 'completed_once' || progress?.status === 'revised' || progress?.status === 'mastered'
        ? 100
        : progress?.status === 'in_progress' || progress?.status === 'flagged'
          ? 35
          : 0
    })
    const confidenceValues = progressRows.map((row) => row.self_confidence).filter((value): value is number => typeof value === 'number')
    const averageCompletion =
      completionValues.length > 0 ? Math.round(completionValues.reduce((sum, value) => sum + value, 0) / completionValues.length) : 0
    const averageConfidence =
      confidenceValues.length > 0 ? Number((confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length).toFixed(1)) : null
    const totalMinutesSpent = progressRows.reduce((sum, row) => sum + Number(row.minutes_spent ?? 0), 0)
    const completedItems = completionValues.filter((value) => value >= 100).length
    const latestStatus = progressRows[0]?.status ?? 'not_started'

    return NextResponse.json({
      reply: `Here’s where you are in ${matched.title}.`,
      applied: false,
      preview: {
        type: 'progress_snapshot',
        scope: matched.scope,
        subject: matched.subjectTitle,
        topic: matched.topicTitle,
        title: matched.title,
        status: latestStatus,
        completionPercentage: averageCompletion,
        confidence: averageConfidence,
        minutesSpent: totalMinutesSpent,
        totalItems: matched.items.length,
        completedItems,
      },
    })
  }

  if (action.type === 'update_progress') {
    const matched = resolveProgressTarget(action.subtopicQuery)

    if (!matched) {
      return NextResponse.json({
        reply: "I couldn't match that to a syllabus item yet. Try naming the reading or subtopic a little more specifically.",
        applied: false,
        preview: { attemptedQuery: action.subtopicQuery },
      })
    }

    const subtopicIds = matched.items.map((item) => item.id)
    const { data: existingRows } = await supabase
      .from('study_progress')
      .select(
        'subtopic_id, status, completion_percentage, minutes_spent, self_confidence, ai_mastery, notes, difficulty, last_studied_at, first_completed_at, revision_due_at, revision_count',
      )
      .eq('user_id', user.id)
      .in('subtopic_id', subtopicIds)

    const now = new Date().toISOString()
    const defaultStatus = action.status ?? 'in_progress'
    const distributedMinutes = splitMinutes(Number(action.minutesSpent ?? 0), matched.items.length)
    const rows = matched.items.map((item, index) => {
      const existing = existingRows?.find((row) => row.subtopic_id === item.id)
      const existingNotes = typeof existing?.notes === 'string' && existing.notes.trim().length > 0 ? `${existing.notes.trim()}\n\n` : ''
      const nextStatus = action.status ?? existing?.status ?? defaultStatus
      const nextCompletionPercentage =
        typeof action.completionPercentage === 'number'
          ? clamp(action.completionPercentage, 0, 100)
          : typeof existing?.completion_percentage === 'number'
            ? existing.completion_percentage
            : getDefaultCompletion(nextStatus)
      const nextMinutes = Math.max(0, Number(existing?.minutes_spent ?? 0) + distributedMinutes[index])
      const nextConfidence = action.comfort ?? existing?.self_confidence ?? null
      const nextRevisionCount =
        nextStatus === 'revised' || nextStatus === 'mastered'
          ? Number(existing?.revision_count ?? 0) + 1
          : Number(existing?.revision_count ?? 0)

      return {
        user_id: user.id,
        subtopic_id: item.id,
        status: nextStatus,
        completion_percentage: nextCompletionPercentage,
        minutes_spent: nextMinutes,
        self_confidence: nextConfidence,
        ai_mastery: existing?.ai_mastery ?? null,
        notes: action.notes ? `${existingNotes}${action.notes.trim()}`.trim() : existing?.notes ?? '',
        difficulty: existing?.difficulty ?? null,
        last_studied_at: now,
        first_completed_at:
          (nextStatus === 'completed_once' || nextStatus === 'revised' || nextStatus === 'mastered') && !existing?.first_completed_at
            ? now
            : existing?.first_completed_at ?? null,
        revision_due_at: buildRevisionDueAt({
          ...action,
          type: 'update_progress',
          status: nextStatus,
          comfort: nextConfidence ?? undefined,
        }),
        revision_count: nextRevisionCount,
        updated_at: now,
      }
    })

    const { error } = await supabase.from('study_progress').upsert(rows, { onConflict: 'user_id,subtopic_id' })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const averageCompletion =
      rows.length > 0 ? Math.round(rows.reduce((sum, row) => sum + Number(row.completion_percentage ?? 0), 0) / rows.length) : 0
    const confidenceValues = rows.map((row) => row.self_confidence).filter((value): value is number => typeof value === 'number')
    const averageConfidence =
      confidenceValues.length > 0 ? Number((confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length).toFixed(1)) : null
    const totalMinutes = rows.reduce((sum, row) => sum + Number(row.minutes_spent ?? 0), 0)

    return NextResponse.json({
      reply:
        parsed.reply ||
        `Saved your update for ${matched.title}. I updated the progress, confidence, and completion data so the app stays in sync.`,
      applied: true,
      preview: {
        type: 'progress',
        scope: matched.scope,
        title: matched.title,
        subject: matched.subjectTitle,
        topic: matched.topicTitle,
        receiptTitle: matched.scope === 'subtopic' ? `Updated ${matched.title}` : `Updated ${matched.items.length} syllabus items in ${matched.title}`,
        receiptSummary:
          matched.scope === 'subtopic'
            ? 'Saved directly to this subtopic.'
            : `Applied the same update across ${matched.items.length} linked study items.`,
        status: rows[0]?.status ?? defaultStatus,
        completionPercentage: averageCompletion,
        confidence: averageConfidence,
        minutesSpent: totalMinutes,
        totalItems: matched.items.length,
      },
    })
  }

  if (action.type === 'add_note') {
    const note = buildNoteRecord(action)
    const { error } = await supabase.from('study_notes').insert({ ...note, user_id: user.id })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      reply: parsed.reply || 'Saved that note for you.',
      applied: true,
      preview: {
        type: 'note',
        receiptTitle: `Saved note: ${note.title}`,
        receiptSummary: `Filed under ${note.topic}.`,
        title: note.title,
        topic: note.topic,
        reviewDueAt: note.review_due_at,
      },
    })
  }

  if (action.type === 'create_flashcard') {
    const flashcard = buildFlashcardRecord(action, user.id)

    if (!flashcard.title || !flashcard.prompt || !flashcard.answer) {
      return NextResponse.json({
        reply: 'I need a title, prompt, and answer to create that flashcard.',
        applied: false,
        preview: { type: 'flashcard_missing_fields' },
      })
    }

    const { error } = await supabase.from('custom_flashcards').insert(flashcard)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      reply: parsed.reply || 'Created that flashcard for you.',
      applied: true,
      preview: {
        type: 'flashcard',
        receiptTitle: `Created flashcard: ${flashcard.title}`,
        receiptSummary: `Filed under ${flashcard.subject}.`,
        title: flashcard.title,
        subject: flashcard.subject,
        module: flashcard.module,
      },
    })
  }

  if (action.type === 'log_mock') {
    const mock = buildMockRecord(action)
    const { error } = await supabase.from('study_mocks').insert({ ...mock, user_id: user.id })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      reply: parsed.reply || 'Logged that mock result for you.',
      applied: true,
      preview: {
        type: 'mock',
        receiptTitle: `Logged mock score: ${mock.total_score}%`,
        receiptSummary: `Saved the result from ${mock.taken_at}.`,
        totalScore: mock.total_score,
        takenAt: mock.taken_at,
        timeTakenMinutes: mock.time_taken_minutes,
      },
    })
  }

  if (action.type === 'update_settings') {
    const updates = {
      exam_date: action.examDate ?? undefined,
      target_study_hours: action.targetStudyHours ?? undefined,
      preferred_session_minutes: action.preferredSessionMinutes ?? undefined,
      preferred_pacing: action.preferredPacing ?? undefined,
      preferred_rest_days: action.preferredRestDays && action.preferredRestDays.length > 0 ? action.preferredRestDays : undefined,
    }

    const { error } = await supabase.from('profiles').update(updates).eq('id', user.id)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      reply: parsed.reply || 'Updated your study settings.',
      applied: true,
      preview: {
        type: 'settings',
        receiptTitle: 'Updated study settings',
        receiptSummary: 'Your profile preferences were saved.',
        ...Object.fromEntries(Object.entries(updates).filter(([, value]) => value !== undefined)),
      },
    })
  }

  return NextResponse.json({
    reply: makeDefaultReply().reply,
    applied: false,
    preview: {
      availableSubjects: [...new Set(allSubtopics.map((item) => item.subject.title))].slice(0, 5),
    },
  })
}
