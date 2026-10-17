'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { createClient } from '@/lib/supabase/browser'

export type LearningEvent = {
  id: string
  type: 'note_open' | 'flashcard_view' | 'flashcard_flip' | 'flashcard_known' | 'flashcard_again' | 'assessment_answer' | 'assessment_complete' | 'syllabus_open'
  at: string
  subjectId?: string
  subject?: string
  topicId?: string
  topic?: string
  itemId?: string
  durationSeconds?: number
  correct?: boolean
}
export type ExamQuestion = {
  content?: import('./question-content').QuestionBlock[]
  nativeTranscription?: import('./question-content').NativeTranscription
  id: string; prompt: string; options: string[]; correctIndex: number; rationale: string
  subjectId: string; subject: string; topicId?: string; topic?: string; concept?: string; source?: string
  sourcePage?: number; sourceQuestionNumber?: number; sourceSession?: number; sourceAssetUrl?: string; sourceAssetUrls?: string[]; mockId?: string; answerVerified?: boolean; unscoredReason?: string
}
export type ExamAttempt = {
  id: string; title: string; mode: 'full_mock' | 'chapter' | 'custom' | 'uploaded' | 'retry'
  startedAt: string; finishedAt: string; questions: ExamQuestion[]; answers: (number | null)[]
  flagged: number[]; elapsedSeconds: number; questionSeconds: number[]; score: number
  analysis?: import('./exam-analysis').ExamAIAnalysis
}
export type LearningData = {
  events: LearningEvent[]; attempts: ExamAttempt[]; ready: boolean; syncStatus: string; scopeKey: string
}
const empty: LearningData = { events: [], attempts: [], ready: false, syncStatus: 'Loading activity', scopeKey: 'guest' }
let snapshot = empty
const listeners = new Set<() => void>()
let started = false
let userId: string | null = null
let generation = 0
let pending = false
const dirtyEvents = new Set<string>()
const dirtyAttempts = new Set<string>()
let flushing = false
let syncTimer: ReturnType<typeof setTimeout> | null = null
const client = () => createClient()
const storageKey = (scope: string) => `study-table-activity-v2:${scope}`
const publish = (value: LearningData) => { snapshot = value; listeners.forEach(listener => listener()) }
function readLocal(scope: string): Pick<LearningData, 'events' | 'attempts'> {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey(scope)) ?? '{}')
    return { events: Array.isArray(value.events) ? value.events : [], attempts: Array.isArray(value.attempts) ? value.attempts : [] }
  } catch { return { events: [], attempts: [] } }
}
function persist() {
  try { localStorage.setItem(storageKey(snapshot.scopeKey), JSON.stringify({ events: snapshot.events, attempts: snapshot.attempts })) }
  catch { publish({ ...snapshot, syncStatus: userId ? 'Syncing · device storage full' : 'Device storage full — activity is only in this tab' }) }
}
function mergeById<T extends { id: string }>(first: T[], second: T[]) {
  return Array.from(new Map([...first, ...second].map(value => [value.id, value])).values())
}
async function hydrate(id: string | null) {
  const current = ++generation
  userId = id
  pending = false
  dirtyEvents.clear(); dirtyAttempts.clear()
  const scopeKey = id ?? 'guest'
  const local = readLocal(scopeKey)
  publish({ ...local, scopeKey, ready: true, syncStatus: id ? 'Syncing' : 'Saved on this device' })
  if (!id) return
  const supabase = client()
  const [events, attempts] = await Promise.all([
    supabase.from('learning_activity').select('data').eq('user_id', id).order('occurred_at', { ascending: false }).limit(5000),
    supabase.from('exam_attempts').select('data').eq('user_id', id).order('finished_at', { ascending: false }).limit(50),
  ])
  if (current !== generation) return
  if (events.error || attempts.error) {
    publish({ ...snapshot, syncStatus: 'Saved on device · cloud unavailable' }); return
  }
  publish({ ...snapshot,
    events: mergeById((events.data ?? []).map(row => row.data as LearningEvent), snapshot.events).sort((a, b) => a.at.localeCompare(b.at)),
    attempts: mergeById((attempts.data ?? []).map(row => row.data as ExamAttempt), snapshot.attempts).sort((a, b) => b.finishedAt.localeCompare(a.finishedAt)),
    syncStatus: 'Synced',
  })
  persist()
  if (local.events.length || local.attempts.length) { local.events.forEach(e => dirtyEvents.add(e.id)); local.attempts.forEach(a => dirtyAttempts.add(a.id)); pending = true; void flush() }
}
async function flush() {
  if (!userId || flushing || !pending) return
  flushing = true; pending = false
  const id = userId; const current = generation; const batch = snapshot
  const eventIds = new Set(dirtyEvents); const attemptIds = new Set(dirtyAttempts)
  const eventBatch = batch.events.filter(e => eventIds.has(e.id)); const attemptBatch = batch.attempts.filter(a => attemptIds.has(a.id))
  publish({ ...snapshot, syncStatus: 'Syncing' })
  try {
    const supabase = client()
    const results = await Promise.all([
      eventBatch.length ? supabase.from('learning_activity').upsert(eventBatch.map(event => ({ id: event.id, user_id: id, kind: event.type, occurred_at: event.at, data: event })), { onConflict: 'id' }) : Promise.resolve({ error: null }),
      attemptBatch.length ? supabase.from('exam_attempts').upsert(attemptBatch.map(attempt => ({ id: attempt.id, user_id: id, finished_at: attempt.finishedAt, data: attempt })), { onConflict: 'id' }) : Promise.resolve({ error: null }),
    ])
    if (current === generation) {
      if (!results.some(result => result.error)) { eventIds.forEach(id => dirtyEvents.delete(id)); attemptIds.forEach(id => dirtyAttempts.delete(id)) }
      publish({ ...snapshot, syncStatus: results.some(result => result.error) ? 'Saved on device · sync pending' : 'Synced' })
    }
  } catch { if (current === generation) publish({ ...snapshot, syncStatus: 'Saved on device · sync pending' }) }
  finally { flushing = false; if (pending) scheduleSync() }
}
function scheduleSync() {
  if (!userId) return
  pending = true
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => { void flush() }, 600)
}
function initialise() {
  if (started || typeof window === 'undefined') return
  started = true
  const supabase = client()
  void supabase.auth.getUser().then(({ data }) => hydrate(data.user?.id ?? null)).catch(() => hydrate(null))
  supabase.auth.onAuthStateChange((_event, session) => {
    const next = session?.user.id ?? null
    if (snapshot.ready && next !== userId) setTimeout(() => { void hydrate(next) }, 0)
  })
  window.addEventListener('storage', event => {
    if (event.key === storageKey(snapshot.scopeKey)) publish({ ...snapshot, ...readLocal(snapshot.scopeKey) })
  })
  window.addEventListener('online', () => { pending = true; void flush() })
}
export function useLearningData(): LearningData {
  const state = useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener) } }, () => snapshot, () => empty)
  useEffect(initialise, [])
  return state
}
export function recordLearningEvent(input: Omit<LearningEvent, 'id' | 'at'>) {
  if (!snapshot.ready) return
  const event: LearningEvent = { ...input, id: crypto.randomUUID(), at: new Date().toISOString() }
  publish({ ...snapshot, events: [...snapshot.events, event].slice(-5000) })
  dirtyEvents.add(event.id)
  persist(); scheduleSync()
}
export function saveExamAttempt(attempt: ExamAttempt) {
  if (!snapshot.ready) return
  publish({ ...snapshot, attempts: mergeById(snapshot.attempts, [attempt]).sort((a, b) => b.finishedAt.localeCompare(a.finishedAt)).slice(0, 50) })
  dirtyAttempts.add(attempt.id)
  persist(); scheduleSync()
}
export function getWrongQuestions(attempts: ExamAttempt[] = snapshot.attempts): ExamQuestion[] {
  const questions = new Map<string, ExamQuestion>()
  for (const attempt of [...attempts].sort((a, b) => a.finishedAt.localeCompare(b.finishedAt))) {
    attempt.questions.forEach((question, index) => {
      if (question.answerVerified === false) return
      if (attempt.answers[index] !== question.correctIndex) questions.set(question.id, question)
      else questions.delete(question.id)
    })
  }
  return Array.from(questions.values())
}
