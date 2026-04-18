'use client'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { CustomFlashcard } from '@/lib/custom-flashcards'
import type { CalculatorDrillProgress, RevisionNoteProgress } from '@/lib/revision-progress'
import type { NoteRecord, MockRecord } from '@/lib/study-workspace'

export type SyncedProgressEntry = {
  subtopicId: string
  status: 'not_started' | 'in_progress' | 'completed_once' | 'revised' | 'mastered' | 'flagged'
  completionPercentage: number | null
  minutesSpent: number
  selfConfidence: number | null
  aiMastery: number | null
  notes: string
  difficulty: 'easy' | 'medium' | 'hard' | null
  lastStudiedAt: string | null
  firstCompletedAt: string | null
  revisionDueAt: string | null
  revisionCount: number
}

export type SyncedAssessmentEntry = {
  id: string
  subtopicId: string
  createdAt: string
  mode: 'topic_quiz' | 'concept_check'
  scorePercentage: number
  aiMastery: number
  confidenceAtAttempt: number | null
  questionCount: number
  errorCategories: string[]
  explanationSummary: string
  recommendedAction: string
}

export type FlashcardProgressRecord = {
  confidence: number | null
  known: boolean
  bookmarked: boolean
  lastReviewedAt: string | null
  reviewCount: number
}

function toIsoOrNull(value: string | null | undefined) {
  return value ?? null
}

function latestTimestamp(...values: Array<string | null | undefined>) {
  return values
    .filter(Boolean)
    .map((value) => new Date(value as string).getTime())
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a)[0] ?? 0
}

export async function getAuthenticatedUserId(supabase: SupabaseClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return user?.id ?? null
}

export async function fetchRemoteProgressMap(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from('study_progress')
    .select(
      'subtopic_id, status, completion_percentage, minutes_spent, self_confidence, ai_mastery, notes, difficulty, last_studied_at, first_completed_at, revision_due_at, revision_count',
    )
    .eq('user_id', userId)

  if (error) {
    throw error
  }

  return Object.fromEntries(
    (data ?? []).map((row) => [
      row.subtopic_id,
      {
        subtopicId: row.subtopic_id,
        status: row.status,
        completionPercentage: row.completion_percentage ?? null,
        minutesSpent: row.minutes_spent ?? 0,
        selfConfidence: row.self_confidence ?? null,
        aiMastery: row.ai_mastery ?? null,
        notes: row.notes ?? '',
        difficulty: row.difficulty ?? null,
        lastStudiedAt: toIsoOrNull(row.last_studied_at),
        firstCompletedAt: toIsoOrNull(row.first_completed_at),
        revisionDueAt: toIsoOrNull(row.revision_due_at),
        revisionCount: row.revision_count ?? 0,
      } satisfies SyncedProgressEntry,
    ]),
  ) as Record<string, SyncedProgressEntry>
}

export async function upsertRemoteProgressMap(
  supabase: SupabaseClient,
  userId: string,
  progressMap: Record<string, SyncedProgressEntry>,
) {
  const rows = Object.values(progressMap).map((entry) => ({
    user_id: userId,
    subtopic_id: entry.subtopicId,
    status: entry.status,
    completion_percentage: entry.completionPercentage,
    minutes_spent: entry.minutesSpent,
    self_confidence: entry.selfConfidence,
    ai_mastery: entry.aiMastery,
    notes: entry.notes,
    difficulty: entry.difficulty,
    last_studied_at: entry.lastStudiedAt,
    first_completed_at: entry.firstCompletedAt,
    revision_due_at: entry.revisionDueAt,
    revision_count: entry.revisionCount,
    updated_at: new Date().toISOString(),
  }))

  if (rows.length === 0) {
    return
  }

  const { error } = await supabase.from('study_progress').upsert(rows, { onConflict: 'user_id,subtopic_id' })
  if (error) {
    throw error
  }
}

export async function fetchRemoteAssessments(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from('study_assessments')
    .select(
      'id, subtopic_id, created_at, mode, score_percentage, ai_mastery, confidence_at_attempt, question_count, error_categories, explanation_summary, recommended_action',
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

  return (data ?? []).map(
    (row) =>
      ({
        id: row.id,
        subtopicId: row.subtopic_id,
        createdAt: row.created_at,
        mode: row.mode,
        scorePercentage: Number(row.score_percentage ?? 0),
        aiMastery: Number(row.ai_mastery ?? 0),
        confidenceAtAttempt: row.confidence_at_attempt ?? null,
        questionCount: row.question_count ?? 0,
        errorCategories: Array.isArray(row.error_categories) ? row.error_categories : [],
        explanationSummary: row.explanation_summary ?? '',
        recommendedAction: row.recommended_action ?? '',
      }) satisfies SyncedAssessmentEntry,
  )
}

export async function upsertRemoteAssessments(
  supabase: SupabaseClient,
  userId: string,
  assessments: SyncedAssessmentEntry[],
) {
  if (assessments.length === 0) {
    return
  }

  const rows = assessments.map((entry) => ({
    id: entry.id,
    user_id: userId,
    subtopic_id: entry.subtopicId,
    created_at: entry.createdAt,
    mode: entry.mode,
    score_percentage: entry.scorePercentage,
    ai_mastery: entry.aiMastery,
    confidence_at_attempt: entry.confidenceAtAttempt,
    question_count: entry.questionCount,
    error_categories: entry.errorCategories,
    explanation_summary: entry.explanationSummary,
    recommended_action: entry.recommendedAction,
  }))

  const { error } = await supabase.from('study_assessments').upsert(rows)
  if (error) {
    throw error
  }
}

export function mergeProgressMaps(
  localMap: Record<string, SyncedProgressEntry>,
  remoteMap: Record<string, SyncedProgressEntry>,
) {
  const merged: Record<string, SyncedProgressEntry> = {}

  for (const key of new Set([...Object.keys(remoteMap), ...Object.keys(localMap)])) {
    const local = localMap[key]
    const remote = remoteMap[key]

    if (!local) {
      merged[key] = remote
      continue
    }

    if (!remote) {
      merged[key] = local
      continue
    }

    const preferLocal = latestTimestamp(local.lastStudiedAt, local.revisionDueAt, local.firstCompletedAt) >= latestTimestamp(remote.lastStudiedAt, remote.revisionDueAt, remote.firstCompletedAt)

    merged[key] = preferLocal
      ? {
          ...remote,
          ...local,
          minutesSpent: Math.max(local.minutesSpent, remote.minutesSpent),
          revisionCount: Math.max(local.revisionCount, remote.revisionCount),
        }
      : {
          ...local,
          ...remote,
          minutesSpent: Math.max(local.minutesSpent, remote.minutesSpent),
          revisionCount: Math.max(local.revisionCount, remote.revisionCount),
        }
  }

  return merged
}

export function mergeAssessments(local: SyncedAssessmentEntry[], remote: SyncedAssessmentEntry[]) {
  const merged = new Map<string, SyncedAssessmentEntry>()

  for (const entry of [...remote, ...local]) {
    const existing = merged.get(entry.id)
    if (!existing || latestTimestamp(entry.createdAt) >= latestTimestamp(existing.createdAt)) {
      merged.set(entry.id, entry)
    }
  }

  return [...merged.values()].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export async function fetchRemoteNotes(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from('study_notes')
    .select('id, title, topic, body, tags, pinned, review_interval_days, created_at, updated_at, review_due_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })

  if (error) {
    throw error
  }

  return (data ?? []).map(
    (row) =>
      ({
        id: row.id,
        title: row.title,
        topic: row.topic,
        body: row.body,
        tags: row.tags ?? [],
        pinned: row.pinned ?? false,
        reviewIntervalDays: row.review_interval_days ?? 7,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        reviewDueAt: row.review_due_at,
      }) satisfies NoteRecord,
  )
}

export async function upsertRemoteNotes(supabase: SupabaseClient, userId: string, notes: NoteRecord[]) {
  if (notes.length === 0) {
    return
  }

  const rows = notes.map((note) => ({
    id: note.id,
    user_id: userId,
    title: note.title,
    topic: note.topic,
    body: note.body,
    tags: note.tags,
    pinned: note.pinned,
    review_interval_days: note.reviewIntervalDays,
    created_at: note.createdAt,
    updated_at: note.updatedAt,
    review_due_at: note.reviewDueAt,
  }))

  const { error } = await supabase.from('study_notes').upsert(rows)
  if (error) {
    throw error
  }
}

export async function deleteRemoteNote(supabase: SupabaseClient, userId: string, noteId: string) {
  const { error } = await supabase.from('study_notes').delete().eq('user_id', userId).eq('id', noteId)
  if (error) {
    throw error
  }
}

export function mergeNotes(local: NoteRecord[], remote: NoteRecord[]) {
  const merged = new Map<string, NoteRecord>()
  for (const note of [...remote, ...local]) {
    const existing = merged.get(note.id)
    if (!existing || latestTimestamp(note.updatedAt, note.createdAt) >= latestTimestamp(existing.updatedAt, existing.createdAt)) {
      merged.set(note.id, note)
    }
  }

  return [...merged.values()]
}

export async function fetchRemoteMocks(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from('study_mocks')
    .select('id, taken_at, total_score, time_taken_minutes, felt_difficulty, notes, section_scores')
    .eq('user_id', userId)
    .order('taken_at', { ascending: false })

  if (error) {
    throw error
  }

  return (data ?? []).map(
    (row) =>
      ({
        id: row.id,
        takenAt: row.taken_at,
        totalScore: Number(row.total_score ?? 0),
        timeTakenMinutes: row.time_taken_minutes ?? 0,
        feltDifficulty: row.felt_difficulty ?? 'steady',
        notes: row.notes ?? '',
        sectionScores: Array.isArray(row.section_scores) ? row.section_scores : [],
      }) satisfies MockRecord,
  )
}

export async function upsertRemoteMocks(supabase: SupabaseClient, userId: string, mocks: MockRecord[]) {
  if (mocks.length === 0) {
    return
  }

  const rows = mocks.map((mock) => ({
    id: mock.id,
    user_id: userId,
    taken_at: mock.takenAt,
    total_score: mock.totalScore,
    time_taken_minutes: mock.timeTakenMinutes,
    felt_difficulty: mock.feltDifficulty,
    notes: mock.notes,
    section_scores: mock.sectionScores,
    updated_at: new Date().toISOString(),
  }))

  const { error } = await supabase.from('study_mocks').upsert(rows)
  if (error) {
    throw error
  }
}

export async function deleteRemoteMock(supabase: SupabaseClient, userId: string, mockId: string) {
  const { error } = await supabase.from('study_mocks').delete().eq('user_id', userId).eq('id', mockId)
  if (error) {
    throw error
  }
}

export function mergeMocks(local: MockRecord[], remote: MockRecord[]) {
  const merged = new Map<string, MockRecord>()
  for (const mock of [...remote, ...local]) {
    if (!merged.has(mock.id)) {
      merged.set(mock.id, mock)
    }
  }

  return [...merged.values()]
}

export async function fetchRemoteFlashcardProgress(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from('flashcard_progress')
    .select('card_id, confidence, known, bookmarked, last_reviewed_at, review_count')
    .eq('user_id', userId)

  if (error) {
    throw error
  }

  return Object.fromEntries(
    (data ?? []).map((row) => [
      row.card_id,
      {
        confidence: row.confidence ?? null,
        known: row.known ?? false,
        bookmarked: row.bookmarked ?? false,
        lastReviewedAt: row.last_reviewed_at ?? null,
        reviewCount: row.review_count ?? 0,
      } satisfies FlashcardProgressRecord,
    ]),
  ) as Record<string, FlashcardProgressRecord>
}

export async function upsertRemoteFlashcardProgress(
  supabase: SupabaseClient,
  userId: string,
  progressMap: Record<string, FlashcardProgressRecord>,
) {
  const rows = Object.entries(progressMap).map(([cardId, progress]) => ({
    user_id: userId,
    card_id: cardId,
    confidence: progress.confidence,
    known: progress.known,
    bookmarked: progress.bookmarked,
    last_reviewed_at: progress.lastReviewedAt,
    review_count: progress.reviewCount,
    updated_at: new Date().toISOString(),
  }))

  if (rows.length === 0) {
    return
  }

  const { error } = await supabase.from('flashcard_progress').upsert(rows, { onConflict: 'user_id,card_id' })
  if (error) {
    throw error
  }
}

export async function clearRemoteFlashcardProgress(supabase: SupabaseClient, userId: string) {
  const { error } = await supabase.from('flashcard_progress').delete().eq('user_id', userId)
  if (error) {
    throw error
  }
}

export function mergeFlashcardProgress(
  localMap: Record<string, FlashcardProgressRecord>,
  remoteMap: Record<string, FlashcardProgressRecord>,
) {
  const merged: Record<string, FlashcardProgressRecord> = {}

  for (const key of new Set([...Object.keys(remoteMap), ...Object.keys(localMap)])) {
    const local = localMap[key]
    const remote = remoteMap[key]

    if (!local) {
      merged[key] = remote
      continue
    }

    if (!remote) {
      merged[key] = local
      continue
    }

    const preferLocal = latestTimestamp(local.lastReviewedAt) >= latestTimestamp(remote.lastReviewedAt)
    merged[key] = preferLocal
      ? {
          ...remote,
          ...local,
          reviewCount: Math.max(local.reviewCount, remote.reviewCount),
          known: local.known || remote.known,
          bookmarked: local.bookmarked || remote.bookmarked,
        }
      : {
          ...local,
          ...remote,
          reviewCount: Math.max(local.reviewCount, remote.reviewCount),
          known: local.known || remote.known,
          bookmarked: local.bookmarked || remote.bookmarked,
        }
  }

  return merged
}

export async function fetchRemoteRevisionNoteProgress(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from('revision_note_progress')
    .select('note_id, reviewed, bookmarked, last_reviewed_at, review_count, updated_at')
    .eq('user_id', userId)

  if (error) {
    throw error
  }

  return Object.fromEntries(
    (data ?? []).map((row) => [
      row.note_id,
      {
        reviewed: row.reviewed ?? false,
        bookmarked: row.bookmarked ?? false,
        lastReviewedAt: row.last_reviewed_at ?? null,
        reviewCount: row.review_count ?? 0,
        updatedAt: row.updated_at ?? null,
      } satisfies RevisionNoteProgress,
    ]),
  ) as Record<string, RevisionNoteProgress>
}

export async function upsertRemoteRevisionNoteProgress(
  supabase: SupabaseClient,
  userId: string,
  progressMap: Record<string, RevisionNoteProgress>,
) {
  const rows = Object.entries(progressMap).map(([noteId, progress]) => ({
    user_id: userId,
    note_id: noteId,
    reviewed: progress.reviewed,
    bookmarked: progress.bookmarked,
    last_reviewed_at: progress.lastReviewedAt,
    review_count: progress.reviewCount,
    updated_at: progress.updatedAt ?? new Date().toISOString(),
  }))

  if (rows.length === 0) {
    return
  }

  const { error } = await supabase.from('revision_note_progress').upsert(rows, { onConflict: 'user_id,note_id' })
  if (error) {
    throw error
  }
}

export async function fetchRemoteCalculatorDrillProgress(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from('calculator_drill_progress')
    .select('drill_id, attempted_count, correct_count, last_answer, last_attempted_at, status, updated_at')
    .eq('user_id', userId)

  if (error) {
    throw error
  }

  return Object.fromEntries(
    (data ?? []).map((row) => [
      row.drill_id,
      {
        attemptedCount: row.attempted_count ?? 0,
        correctCount: row.correct_count ?? 0,
        lastAnswer: row.last_answer ?? '',
        lastAttemptedAt: row.last_attempted_at ?? null,
        status: row.status ?? 'unattempted',
        updatedAt: row.updated_at ?? null,
      } satisfies CalculatorDrillProgress,
    ]),
  ) as Record<string, CalculatorDrillProgress>
}

export async function upsertRemoteCalculatorDrillProgress(
  supabase: SupabaseClient,
  userId: string,
  progressMap: Record<string, CalculatorDrillProgress>,
) {
  const rows = Object.entries(progressMap).map(([drillId, progress]) => ({
    user_id: userId,
    drill_id: drillId,
    attempted_count: progress.attemptedCount,
    correct_count: progress.correctCount,
    last_answer: progress.lastAnswer,
    last_attempted_at: progress.lastAttemptedAt,
    status: progress.status,
    updated_at: progress.updatedAt ?? new Date().toISOString(),
  }))

  if (rows.length === 0) {
    return
  }

  const { error } = await supabase.from('calculator_drill_progress').upsert(rows, { onConflict: 'user_id,drill_id' })
  if (error) {
    throw error
  }
}

export async function fetchRemoteCustomFlashcards(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from('custom_flashcards')
    .select('id, subject, module, title, prompt, answer, memory_hook, tags, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })

  if (error) {
    throw error
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    subject: row.subject,
    module: row.module,
    title: row.title,
    prompt: row.prompt,
    answer: row.answer,
    memoryHook: row.memory_hook,
    tags: row.tags ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })) as CustomFlashcard[]
}

export async function upsertRemoteCustomFlashcards(
  supabase: SupabaseClient,
  userId: string,
  cards: CustomFlashcard[],
) {
  if (cards.length === 0) {
    return
  }

  const rows = cards.map((card) => ({
    id: card.id,
    user_id: userId,
    subject: card.subject,
    module: card.module,
    title: card.title,
    prompt: card.prompt,
    answer: card.answer,
    memory_hook: card.memoryHook,
    tags: card.tags,
    created_at: card.createdAt,
    updated_at: card.updatedAt,
  }))

  const { error } = await supabase.from('custom_flashcards').upsert(rows, { onConflict: 'id' })
  if (error) {
    throw error
  }
}
