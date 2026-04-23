import { addDays } from 'date-fns'
import { allSubtopics } from '@/lib/cfa-data'

export type BabyMaanAction =
  | { type: 'none' }
  | {
      type: 'fetch_progress'
      query: string
    }
  | {
      type: 'update_progress'
      subtopicQuery: string
      status?: 'not_started' | 'in_progress' | 'completed_once' | 'revised' | 'mastered' | 'flagged'
      completionPercentage?: number
      minutesSpent?: number
      comfort?: number
      notes?: string
    }
  | {
      type: 'add_note'
      title: string
      topic?: string
      body: string
      tags?: string[]
      pinned?: boolean
      reviewIntervalDays?: number
    }
  | {
      type: 'create_flashcard'
      subject?: string
      module?: string
      title: string
      prompt: string
      answer: string
      memoryHook?: string
      tags?: string[]
    }
  | {
      type: 'log_mock'
      takenAt?: string
      totalScore: number
      timeTakenMinutes?: number
      feltDifficulty?: 'calm' | 'steady' | 'rushed'
      notes?: string
      sectionScores?: { label: string; score: number }[]
    }
  | {
      type: 'update_settings'
      examDate?: string
      targetStudyHours?: number
      preferredSessionMinutes?: number
      preferredPacing?: 'gentle' | 'balanced' | 'aggressive'
      preferredRestDays?: string[]
    }
  | {
      type: 'submit_feedback'
      message: string
      area?: string
    }

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function scoreMatch(query: string, candidates: string[]) {
  let score = 0

  for (const candidate of candidates) {
    const normalizedCandidate = normalize(candidate)

    if (normalizedCandidate === query) {
      score += 100
    }
    if (normalizedCandidate.includes(query) || query.includes(normalizedCandidate)) {
      score += 35
    }

    const queryWords = query.split(' ').filter(Boolean)
    score += queryWords.filter((word) => normalizedCandidate.includes(word)).length * 8
  }

  return score
}

export function safeJsonParse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T
  } catch {
    const match = value.match(/\{[\s\S]*\}/)
    if (!match) {
      return null
    }

    try {
      return JSON.parse(match[0]) as T
    } catch {
      return null
    }
  }
}

export function findBestSubtopicMatch(query: string) {
  const normalizedQuery = normalize(query)

  const scored = allSubtopics
    .map((subtopic) => {
      const score = scoreMatch(normalizedQuery, [subtopic.title, subtopic.topic.title, subtopic.subject.title])
      return { subtopic, score }
    })
    .sort((a, b) => b.score - a.score)

  return scored[0]?.score >= 20 ? scored[0].subtopic : null
}

export function findBestTopicMatch(query: string) {
  const normalizedQuery = normalize(query)
  const topics = Array.from(new Map(allSubtopics.map((item) => [item.topic.id, item.topic])).values())

  const scored = topics
    .map((topic) => ({
      topic,
      score: scoreMatch(normalizedQuery, [topic.title]),
    }))
    .sort((a, b) => b.score - a.score)

  return scored[0]?.score >= 20 ? scored[0].topic : null
}

export function findBestSubjectMatch(query: string) {
  const normalizedQuery = normalize(query)
  const subjects = Array.from(new Map(allSubtopics.map((item) => [item.subject.id, item.subject])).values())

  const scored = subjects
    .map((subject) => ({
      subject,
      score: scoreMatch(normalizedQuery, [subject.title]),
    }))
    .sort((a, b) => b.score - a.score)

  return scored[0]?.score >= 20 ? scored[0].subject : null
}

export function buildBabyMaanSystemPrompt() {
  return [
    'You are Baby Maan, a warm CFA Level I study assistant.',
    'The learner is preparing for CFA Level I. Interpret shorthand like FSA, FI, Quant, Ethics, Equity, Derivatives, Economics, PM, Corporate Issuers, and Alternatives as CFA Level I study areas.',
    'You are not allowed to invent database columns, table names, or SQL. Your only job is to parse the user message into the JSON action contract below. The application server writes to Supabase using its known schema.',
    'Known Supabase write targets used by the server:',
    '- study_progress: user_id, subtopic_id, status, completion_percentage, minutes_spent, self_confidence, ai_mastery, notes, difficulty, last_studied_at, first_completed_at, revision_due_at, revision_count, updated_at.',
    '- study_notes: user_id, title, topic, body, tags, pinned, review_interval_days, review_due_at.',
    '- custom_flashcards: user_id, subject, module, title, prompt, answer, memory_hook, tags.',
    '- study_mocks: user_id, taken_at, total_score, time_taken_minutes, felt_difficulty, notes, section_scores.',
    '- profiles: exam_date, target_study_hours, preferred_session_minutes, preferred_pacing, preferred_rest_days.',
    'Convert the user message into strict JSON only.',
    'You may choose one action type: none, fetch_progress, update_progress, add_note, create_flashcard, log_mock, update_settings, submit_feedback.',
    'If the user is giving feedback about the app — bugs, feature requests, content gaps, things to improve — use submit_feedback with message containing their full feedback and optional area (a short page/feature label). Do NOT treat app feedback as a study note.',
    'If the user asks what is done, how far along they are, how much is complete, or asks for current confidence on a syllabus area, use fetch_progress.',
    'If the user gives a study update like "I studied ethics for 45 min and still feel weak", use update_progress.',
    'If the user says they completed, finished, or are done with a CFA area, use update_progress with status completed_once and completionPercentage 100.',
    'If the user asks you to make, create, add, or save a flashcard, use create_flashcard.',
    'For create_flashcard, write a specific exam-useful prompt and answer from the user request. Include subject, module, title, prompt, answer, memoryHook, and tags when possible.',
    'If the user shares a takeaway or trap but does not ask for a flashcard, use add_note.',
    'If the user shares mock results, use log_mock.',
    'If the user changes exam date, hours, session length, pacing, or rest days, use update_settings.',
    'Return this shape exactly:',
    '{"reply":"short friendly reply","action":{"type":"..."}}',
    'For fetch_progress, include query.',
    'For update_progress, include subtopicQuery and any known status, completionPercentage, minutesSpent, comfort, notes.',
    'completionPercentage must be an integer from 0 to 100 when present.',
    'Comfort must be 1 to 5.',
    'Status must be one of: not_started, in_progress, completed_once, revised, mastered, flagged.',
    'For create_flashcard, title, prompt, and answer are required.',
    'For log_mock, feltDifficulty must be calm, steady, or rushed.',
    'For update_settings, preferredPacing must be gentle, balanced, or aggressive.',
    'Do not include markdown. JSON only.',
  ].join('\n')
}

export function makeDefaultReply() {
  return {
    reply: 'I can help update study progress, save notes, log mocks, or change study settings.',
    action: { type: 'none' } as BabyMaanAction,
  }
}

export function looksLikeProgressFetch(message: string) {
  const lower = message.toLowerCase()
  return (
    lower.includes('how much') ||
    lower.includes('how far') ||
    lower.includes('what is my progress') ||
    lower.includes("what's my progress") ||
    lower.includes('show my progress') ||
    lower.includes('where am i') ||
    lower.includes('how done') ||
    lower.includes('what did i finish') ||
    lower.includes('confidence in')
  )
}

export function buildNoteRecord(input: Extract<BabyMaanAction, { type: 'add_note' }>) {
  const now = new Date()
  const reviewIntervalDays = input.reviewIntervalDays ?? 7

  return {
    id: crypto.randomUUID(),
    title: input.title.trim(),
    topic: input.topic?.trim() || 'General',
    body: input.body.trim(),
    tags: input.tags ?? [],
    pinned: input.pinned ?? false,
    review_interval_days: reviewIntervalDays,
    review_due_at: addDays(now, reviewIntervalDays).toISOString(),
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  }
}

export function buildFlashcardRecord(input: Extract<BabyMaanAction, { type: 'create_flashcard' }>, userId: string) {
  const now = new Date().toISOString()
  const matchedSubject = input.subject ? findBestSubjectMatch(input.subject) : findBestSubjectMatch(`${input.title} ${input.prompt} ${input.answer}`)

  return {
    id: crypto.randomUUID(),
    user_id: userId,
    subject: matchedSubject?.title ?? input.subject?.trim() ?? 'General',
    module: input.module?.trim() || 'Baby Maan',
    title: input.title.trim(),
    prompt: input.prompt.trim(),
    answer: input.answer.trim(),
    memory_hook: input.memoryHook?.trim() || 'Review this until the prompt triggers the answer.',
    tags: input.tags ?? ['baby-maan'],
    created_at: now,
    updated_at: now,
  }
}

export function buildMockRecord(input: Extract<BabyMaanAction, { type: 'log_mock' }>) {
  return {
    id: crypto.randomUUID(),
    taken_at: input.takenAt ?? new Date().toISOString().slice(0, 10),
    total_score: input.totalScore,
    time_taken_minutes: input.timeTakenMinutes ?? 270,
    felt_difficulty: input.feltDifficulty ?? 'steady',
    notes: input.notes ?? '',
    section_scores: input.sectionScores ?? [],
    updated_at: new Date().toISOString(),
  }
}
