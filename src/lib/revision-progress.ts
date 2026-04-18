'use client'

export type RevisionNoteProgress = {
  reviewed: boolean
  bookmarked: boolean
  lastReviewedAt: string | null
  reviewCount: number
  updatedAt: string | null
}

export type CalculatorDrillProgress = {
  attemptedCount: number
  correctCount: number
  lastAnswer: string
  lastAttemptedAt: string | null
  status: 'unattempted' | 'weak' | 'steady' | 'mastered'
  updatedAt: string | null
}

export const REVISION_NOTE_PROGRESS_KEY = 'cfa-revision-note-progress-v1'
export const CALCULATOR_DRILL_PROGRESS_KEY = 'cfa-calculator-drill-progress-v1'

function isBrowser() {
  return typeof window !== 'undefined'
}

function readJson<T>(key: string, fallback: T): T {
  if (!isBrowser()) {
    return fallback
  }

  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson<T>(key: string, value: T) {
  if (!isBrowser()) {
    return
  }

  window.localStorage.setItem(key, JSON.stringify(value))
}

function latestTimestamp(...values: Array<string | null | undefined>) {
  return Math.max(
    0,
    ...values
      .filter((value): value is string => Boolean(value))
      .map((value) => new Date(value).getTime())
      .filter((value) => Number.isFinite(value)),
  )
}

function latestIso(...values: Array<string | null | undefined>) {
  const latest = latestTimestamp(...values)
  return latest > 0 ? new Date(latest).toISOString() : null
}

export function getRevisionNoteProgress(
  progressMap: Record<string, RevisionNoteProgress>,
  noteId: string,
): RevisionNoteProgress {
  return (
    progressMap[noteId] ?? {
      reviewed: false,
      bookmarked: false,
      lastReviewedAt: null,
      reviewCount: 0,
      updatedAt: null,
    }
  )
}

export function getCalculatorDrillProgress(
  progressMap: Record<string, CalculatorDrillProgress>,
  drillId: string,
): CalculatorDrillProgress {
  return (
    progressMap[drillId] ?? {
      attemptedCount: 0,
      correctCount: 0,
      lastAnswer: '',
      lastAttemptedAt: null,
      status: 'unattempted',
      updatedAt: null,
    }
  )
}

export function loadRevisionNoteProgressMap() {
  return readJson<Record<string, RevisionNoteProgress>>(REVISION_NOTE_PROGRESS_KEY, {})
}

export function saveRevisionNoteProgressMap(progressMap: Record<string, RevisionNoteProgress>) {
  writeJson(REVISION_NOTE_PROGRESS_KEY, progressMap)
}

export function loadCalculatorDrillProgressMap() {
  return readJson<Record<string, CalculatorDrillProgress>>(CALCULATOR_DRILL_PROGRESS_KEY, {})
}

export function saveCalculatorDrillProgressMap(progressMap: Record<string, CalculatorDrillProgress>) {
  writeJson(CALCULATOR_DRILL_PROGRESS_KEY, progressMap)
}

export function mergeRevisionNoteProgress(
  local: Record<string, RevisionNoteProgress>,
  remote: Record<string, RevisionNoteProgress>,
) {
  const merged: Record<string, RevisionNoteProgress> = {}
  const keys = new Set([...Object.keys(local), ...Object.keys(remote)])

  for (const key of keys) {
    const localEntry = local[key]
    const remoteEntry = remote[key]

    if (!localEntry) {
      merged[key] = remoteEntry
      continue
    }

    if (!remoteEntry) {
      merged[key] = localEntry
      continue
    }

    const preferLocal =
      latestTimestamp(localEntry.updatedAt, localEntry.lastReviewedAt) >=
      latestTimestamp(remoteEntry.updatedAt, remoteEntry.lastReviewedAt)
    const preferred = preferLocal ? localEntry : remoteEntry

    merged[key] = {
      ...preferred,
      reviewed: localEntry.reviewed || remoteEntry.reviewed,
      bookmarked: localEntry.bookmarked || remoteEntry.bookmarked,
      lastReviewedAt: latestIso(localEntry.lastReviewedAt, remoteEntry.lastReviewedAt),
      reviewCount: Math.max(localEntry.reviewCount, remoteEntry.reviewCount),
      updatedAt: latestIso(localEntry.updatedAt, remoteEntry.updatedAt, localEntry.lastReviewedAt, remoteEntry.lastReviewedAt),
    }
  }

  return merged
}

export function mergeCalculatorDrillProgress(
  local: Record<string, CalculatorDrillProgress>,
  remote: Record<string, CalculatorDrillProgress>,
) {
  const merged: Record<string, CalculatorDrillProgress> = {}
  const keys = new Set([...Object.keys(local), ...Object.keys(remote)])

  for (const key of keys) {
    const localEntry = local[key]
    const remoteEntry = remote[key]

    if (!localEntry) {
      merged[key] = remoteEntry
      continue
    }

    if (!remoteEntry) {
      merged[key] = localEntry
      continue
    }

    const preferLocal =
      latestTimestamp(localEntry.updatedAt, localEntry.lastAttemptedAt) >=
      latestTimestamp(remoteEntry.updatedAt, remoteEntry.lastAttemptedAt)
    const preferred = preferLocal ? localEntry : remoteEntry

    merged[key] = {
      ...preferred,
      attemptedCount: Math.max(localEntry.attemptedCount, remoteEntry.attemptedCount),
      correctCount: Math.max(localEntry.correctCount, remoteEntry.correctCount),
      lastAttemptedAt: latestIso(localEntry.lastAttemptedAt, remoteEntry.lastAttemptedAt),
      updatedAt: latestIso(localEntry.updatedAt, remoteEntry.updatedAt, localEntry.lastAttemptedAt, remoteEntry.lastAttemptedAt),
    }
  }

  return merged
}
