'use client'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AssessmentScope } from '@/lib/assessment-bank'

export type StoredQuizQuestion = {
  prompt: string
  options: string[]
  correctIndex: number
  rationale: string
}

export type QuestionAttempt = StoredQuizQuestion & {
  id: string
  assessmentSetId: string | null
  scope: AssessmentScope | null
  source: string | null
  subtopicId: string
  topic: string
  subtopic: string
  selectedIndex: number
  answeredCorrectly: boolean
  createdAt: string
}

export const QUESTION_ATTEMPTS_STORAGE_KEY = 'cfa-question-attempts-v1'

function isBrowser() {
  return typeof window !== 'undefined'
}

function normalizePrompt(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function loadQuestionAttempts() {
  if (!isBrowser()) {
    return [] as QuestionAttempt[]
  }

  try {
    const raw = window.localStorage.getItem(QUESTION_ATTEMPTS_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as QuestionAttempt[]) : []
  } catch {
    return []
  }
}

export function saveQuestionAttempts(attempts: QuestionAttempt[]) {
  if (!isBrowser()) {
    return
  }

  window.localStorage.setItem(QUESTION_ATTEMPTS_STORAGE_KEY, JSON.stringify(attempts.slice(0, 500)))
}

export function buildQuestionAttempts(args: {
  subtopicId: string
  assessmentSetId?: string | null
  scope?: AssessmentScope | null
  source?: string | null
  topic: string
  subtopic: string
  questions: StoredQuizQuestion[]
  answers: number[]
}) {
  const now = new Date().toISOString()

  return args.questions.map((question, index) => ({
    ...question,
    id: crypto.randomUUID(),
    assessmentSetId: args.assessmentSetId ?? null,
    scope: args.scope ?? null,
    source: args.source ?? null,
    subtopicId: args.subtopicId,
    topic: args.topic,
    subtopic: args.subtopic,
    selectedIndex: args.answers[index] ?? -1,
    answeredCorrectly: question.correctIndex === args.answers[index],
    createdAt: now,
  })) satisfies QuestionAttempt[]
}

export function mergeQuestionAttempts(localAttempts: QuestionAttempt[], remoteAttempts: QuestionAttempt[]) {
  const attempts = new Map<string, QuestionAttempt>()

  for (const attempt of [...remoteAttempts, ...localAttempts]) {
    attempts.set(attempt.id, attempt)
  }

  return [...attempts.values()].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 500)
}

export function getReviewQuestionsForSubtopic(attempts: QuestionAttempt[], subtopicId: string, limit = 2) {
  const seenPrompts = new Set<string>()

  return attempts
    .filter((attempt) => attempt.subtopicId === subtopicId && !attempt.answeredCorrectly)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .filter((attempt) => {
      const key = normalizePrompt(attempt.prompt)
      if (seenPrompts.has(key)) {
        return false
      }
      seenPrompts.add(key)
      return true
    })
    .slice(0, limit)
    .map(({ prompt, options, correctIndex, rationale }) => ({ prompt, options, correctIndex, rationale }))
}

export async function fetchRemoteQuestionAttempts(supabase: SupabaseClient, userId: string, subtopicId?: string) {
  let query = supabase
    .from('study_question_attempts')
    .select('id, assessment_set_id, scope, source, subtopic_id, topic, subtopic, prompt, options, correct_index, rationale, selected_index, answered_correctly, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (subtopicId) {
    query = query.eq('subtopic_id', subtopicId)
  }

  const { data, error } = await query

  if (error) {
    throw error
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    assessmentSetId: row.assessment_set_id,
    scope: row.scope,
    source: row.source,
    subtopicId: row.subtopic_id,
    topic: row.topic,
    subtopic: row.subtopic,
    prompt: row.prompt,
    options: Array.isArray(row.options) ? row.options : [],
    correctIndex: row.correct_index,
    rationale: row.rationale ?? '',
    selectedIndex: row.selected_index,
    answeredCorrectly: row.answered_correctly,
    createdAt: row.created_at,
  })) satisfies QuestionAttempt[]
}

export async function insertRemoteQuestionAttempts(supabase: SupabaseClient, userId: string, attempts: QuestionAttempt[]) {
  if (attempts.length === 0) {
    return
  }

  const rows = attempts.map((attempt) => ({
    id: attempt.id,
    user_id: userId,
    assessment_set_id: attempt.assessmentSetId,
    scope: attempt.scope,
    source: attempt.source,
    subtopic_id: attempt.subtopicId,
    topic: attempt.topic,
    subtopic: attempt.subtopic,
    prompt: attempt.prompt,
    options: attempt.options,
    correct_index: attempt.correctIndex,
    rationale: attempt.rationale,
    selected_index: attempt.selectedIndex,
    answered_correctly: attempt.answeredCorrectly,
    created_at: attempt.createdAt,
  }))

  const { error } = await supabase.from('study_question_attempts').insert(rows)
  if (error) {
    throw error
  }
}
