import { addDays, differenceInCalendarDays, format, isValid, parseISO } from 'date-fns'
import { cfaLevel1Syllabus } from '@/lib/cfa-data'

export const NOTES_STORAGE_KEY = 'cfa-study-notes-v1'
export const MOCKS_STORAGE_KEY = 'cfa-study-mocks-v1'

export const MOCK_SECTION_LABELS = cfaLevel1Syllabus.map((subject) => subject.title)
export const NOTE_TOPIC_SUGGESTIONS = cfaLevel1Syllabus.map((subject) => subject.title)

export type NoteRecord = {
  id: string
  title: string
  topic: string
  body: string
  tags: string[]
  pinned: boolean
  reviewIntervalDays: number
  createdAt: string
  updatedAt: string
  reviewDueAt: string
}

export type MockSectionScore = {
  label: string
  score: number
}

export type MockRecord = {
  id: string
  takenAt: string
  totalScore: number
  timeTakenMinutes: number
  feltDifficulty: 'calm' | 'steady' | 'rushed'
  notes: string
  sectionScores: MockSectionScore[]
}

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

export function loadNotes() {
  return readJson<NoteRecord[]>(NOTES_STORAGE_KEY, [])
}

export function saveNotes(notes: NoteRecord[]) {
  writeJson(NOTES_STORAGE_KEY, notes)
}

export function loadMocks() {
  return readJson<MockRecord[]>(MOCKS_STORAGE_KEY, [])
}

export function saveMocks(mocks: MockRecord[]) {
  writeJson(MOCKS_STORAGE_KEY, mocks)
}

export function formatShortDate(value: string) {
  const parsed = parseISO(value)
  return isValid(parsed) ? format(parsed, 'MMM d, yyyy') : value
}

export function formatDayLabel(value: string) {
  const parsed = parseISO(value)
  return isValid(parsed) ? format(parsed, 'MMM d') : value
}

export function computeNoteMetrics(notes: NoteRecord[]) {
  const now = new Date()
  const dueSoon = notes.filter((note) => {
    const dueDate = parseISO(note.reviewDueAt)
    return isValid(dueDate) && differenceInCalendarDays(dueDate, now) <= 3
  })

  const uniqueTopics = new Set(notes.map((note) => note.topic.trim()).filter(Boolean))
  const pinned = notes.filter((note) => note.pinned)
  const newest = notes
    .slice()
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0]

  return {
    total: notes.length,
    pinned: pinned.length,
    uniqueTopics: uniqueTopics.size,
    dueSoon: dueSoon.length,
    newest,
  }
}

export function computeMockMetrics(mocks: MockRecord[]) {
  const sorted = mocks.slice().sort((a, b) => new Date(a.takenAt).getTime() - new Date(b.takenAt).getTime())
  const latest = sorted[sorted.length - 1] ?? null
  const averageScore =
    mocks.length > 0 ? Math.round(mocks.reduce((sum, attempt) => sum + attempt.totalScore, 0) / mocks.length) : 0
  const averageTime =
    mocks.length > 0
      ? Math.round(mocks.reduce((sum, attempt) => sum + attempt.timeTakenMinutes, 0) / mocks.length)
      : 0

  const sectionAverages = MOCK_SECTION_LABELS.map((label) => {
    const scores = mocks.flatMap((attempt) => attempt.sectionScores.filter((section) => section.label === label).map((section) => section.score))
    const value = scores.length > 0 ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0
    return { label, value }
  }).sort((a, b) => a.value - b.value)

  const weakestSection = sectionAverages[0] ?? null
  const strongestSection = sectionAverages[sectionAverages.length - 1] ?? null
  const scoreTrend = sorted.map((attempt) => ({
    day: formatDayLabel(attempt.takenAt),
    score: attempt.totalScore,
  }))

  return {
    total: mocks.length,
    averageScore,
    averageTime,
    latest,
    weakestSection,
    strongestSection,
    scoreTrend,
    sectionAverages: sectionAverages.slice().reverse(),
  }
}

export function normalizeTags(input: string) {
  return input
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function deriveSessionTone(score: number) {
  if (score >= 75) {
    return 'strong'
  }

  if (score >= 60) {
    return 'steady'
  }

  return 'needs work'
}

export function scoreColor(score: number) {
  if (score >= 75) {
    return 'text-emerald-600'
  }

  if (score >= 60) {
    return 'text-amber-600'
  }

  return 'text-rose-600'
}

export function mockFocusHint(metrics: ReturnType<typeof computeMockMetrics>) {
  if (!metrics.weakestSection || metrics.total === 0) {
    return 'Log your first mock to unlock section-level insight.'
  }

  return `Focus next on ${metrics.weakestSection.label}. It is currently the weakest section across your logged mocks.`
}

export function noteReviewLabel(note: NoteRecord) {
  const daysLeft = differenceInCalendarDays(parseISO(note.reviewDueAt), new Date())

  if (daysLeft < 0) {
    return 'Overdue'
  }

  if (daysLeft === 0) {
    return 'Due today'
  }

  return `${daysLeft}d left`
}

export function createNoteFromDraft(draft: {
  id?: string
  title: string
  topic: string
  body: string
  tags: string[]
  pinned: boolean
  reviewIntervalDays: number
  createdAt?: string
  reviewDueAt?: string
}): NoteRecord {
  const now = new Date()
  return {
    id: draft.id ?? crypto.randomUUID(),
    title: draft.title.trim(),
    topic: draft.topic.trim(),
    body: draft.body.trim(),
    tags: draft.tags,
    pinned: draft.pinned,
    reviewIntervalDays: draft.reviewIntervalDays,
    createdAt: draft.createdAt ?? now.toISOString(),
    updatedAt: now.toISOString(),
    reviewDueAt: draft.reviewDueAt ?? addDays(now, draft.reviewIntervalDays).toISOString(),
  }
}

export function createMockFromDraft(draft: {
  id?: string
  takenAt: string
  totalScore: number
  timeTakenMinutes: number
  feltDifficulty: 'calm' | 'steady' | 'rushed'
  notes: string
  sectionScores: MockSectionScore[]
}): MockRecord {
  return {
    id: draft.id ?? crypto.randomUUID(),
    takenAt: draft.takenAt,
    totalScore: draft.totalScore,
    timeTakenMinutes: draft.timeTakenMinutes,
    feltDifficulty: draft.feltDifficulty,
    notes: draft.notes.trim(),
    sectionScores: draft.sectionScores,
  }
}
