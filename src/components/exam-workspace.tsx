'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import Image from 'next/image'
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Clock3,
  FileQuestion,
  Flag,
  GraduationCap,
  Highlighter,
  LoaderCircle,
  LogOut,
  Maximize,
  Minimize,
  ExternalLink,
  Play,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Timer,
  X,
  XCircle,
} from 'lucide-react'
import type { ExamAttempt, ExamQuestion } from '@/lib/learning-store'
import { getWrongQuestions, recordLearningEvent, saveExamAttempt, useLearningData } from '@/lib/learning-store'
import { PRACTICE_QUESTIONS } from '@/lib/practice-bank'
import { cfaLevel1Syllabus } from '@/lib/cfa-data'
import { mapAssessmentSet, type AssessmentSet } from '@/lib/assessment-bank'
import { buildExamDiagnostic, type ExamAIAnalysis, type ExamDiagnostic, type TopicDiagnostic } from '@/lib/exam-analysis'
import { ExamDiagnosticPanel } from '@/components/exam-diagnostic'
import { useExamFocus } from '@/components/app-shell'
import { createClient } from '@/lib/supabase/browser'
import { cn } from '@/lib/utils'
import { InlineQuestionText, QuestionContent } from '@/components/question-content'
import { validateQuestionBlocks, type QuestionBlock } from '@/lib/question-content'
import portal from './exam-portal.module.css'

const FULL_MOCK_QUESTIONS = 180
const QUESTIONS_PER_SESSION = 90
const SESSION_SECONDS = 135 * 60
const BREAK_SECONDS = 30 * 60
const QUIZ_SECONDS_PER_QUESTION = 90
const EXAM_SESSION_STORAGE_SUFFIX = 'exam-session-v1'
const FULL_MOCK_SUBJECT_QUOTAS = [
  ['ethics', 24],
  ['quant', 15],
  ['economics', 15],
  ['financial-statement-analysis', 24],
  ['corporate-issuers', 12],
  ['equity', 24],
  ['fixed-income', 24],
  ['derivatives', 10],
  ['alternative-investments', 14],
  ['portfolio', 18],
] as const
const FULL_MOCK_SESSION_SUBJECTS = [
  FULL_MOCK_SUBJECT_QUOTAS.slice(0, 5),
  FULL_MOCK_SUBJECT_QUOTAS.slice(5),
] as const

type SetupMode = 'full_mock' | 'quick'
type AttemptMode = ExamAttempt['mode']
type ExamPhase = 'taking' | 'break'
type ExamView = 'setup' | 'exam' | 'review'

type BankQuestion = ExamQuestion & { source: string }
type BankSet = AssessmentSet & { questionCount: number }
type QuestionBankChoice = {
  id: string
  name: string
  sourceLabel: string
  coverage: string
  questions: ExamQuestion[]
}

type ExamSession = {
  id: string
  title: string
  mode: AttemptMode
  questions: ExamQuestion[]
  answers: (number | null)[]
  visited: number[]
  flagged: number[]
  eliminatedOptions: number[][]
  highlighted: number[]
  currentIndex: number
  startedAt: string
  phase: ExamPhase
  sessionIndex: number
  sessionStartedAt: number
  breakStartedAt: number | null
  questionOpenedAt: number
  elapsedSeconds: number
  questionSeconds: number[]
  sourceUrl?: string
  sourceTitle?: string
}

type ImportedMockSummary = {
  id: string
  title: string
  questionCount: number
  scoredQuestionCount?: number
  unverifiedQuestionCount?: number
  sessionCounts: [number, number]
  ready: boolean
  sourceUrl: string
  complete: boolean
  notes: string[]
}

type ImportedMockQuestion = ExamQuestion & {
  sourcePage?: number
  sourceQuestionNumber?: number
  sourceSession?: number
  sourceAssetUrl?: string
  sourceAssetUrls?: string[]
  sourcePdfUrl?: string
  mockId?: string
  answerVerified?: boolean
}

type ImportedPaperResponse = {
  mock?: { questions?: unknown[] }
  error?: string
}

type AnalysisUiState = {
  status: 'loading' | 'ready' | 'error'
  analysis?: ExamAIAnalysis
  model?: string
  reasoning?: string
  error?: string
}

function isAnswerVerified(question: ExamQuestion) {
  return (question as ImportedMockQuestion).answerVerified !== false
}

function isAvailableNativeQuestion(question: ExamQuestion) {
  return (question.nativeTranscription?.status === 'checked' || question.nativeTranscription?.status === 'needs_review')
    && Array.isArray(question.content)
    && validateQuestionBlocks(question.content).length === 0
}

function mergeNativeQuestion(question: ExamQuestion, latest: unknown): ExamQuestion {
  if (!latest || typeof latest !== 'object') return question
  const candidate = latest as ExamQuestion
  if (candidate.id !== question.id || !isAvailableNativeQuestion(candidate)) return question
  const nextOptions = Array.isArray(candidate.options) && candidate.options.length === question.options.length
    ? candidate.options
    : question.options
  const next: ExamQuestion = {
    ...question,
    content: candidate.content as QuestionBlock[],
    nativeTranscription: candidate.nativeTranscription,
    prompt: typeof candidate.prompt === 'string' && candidate.prompt.trim() ? candidate.prompt : question.prompt,
    options: nextOptions,
  }
  if (
    question.prompt === next.prompt
    && question.options.length === next.options.length
    && question.options.every((option, index) => option === next.options[index])
    && JSON.stringify(question.content) === JSON.stringify(next.content)
    && question.nativeTranscription?.status === next.nativeTranscription?.status
    && JSON.stringify(question.nativeTranscription?.notes ?? []) === JSON.stringify(next.nativeTranscription?.notes ?? [])
  ) return question
  return next
}

function countCorrectAnswers(attempt: ExamAttempt) {
  return attempt.questions.reduce((count, question, index) => count + (isAnswerVerified(question) && attempt.answers[index] === question.correctIndex ? 1 : 0), 0)
}

function countScoredQuestions(attempt: ExamAttempt) {
  return attempt.questions.filter(isAnswerVerified).length
}

function getMissedQuestions(attempt: ExamAttempt) {
  return attempt.questions.filter((question, index) => isAnswerVerified(question) && attempt.answers[index] !== question.correctIndex)
}

type GenerateResponse = {
  questions?: ExamQuestion[]
  source?: string
  error?: string
}

type FocusPracticeTarget = {
  subjectId: string
  topicId: string
  focusConcept: string
  practiceTask: string
}

function newId() {
  return crypto.randomUUID()
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function cleanQuestions(questions: ExamQuestion[]) {
  const seen = new Set<string>()
  return questions.filter((question) => {
    if (!question.prompt?.trim() || !Array.isArray(question.options) || question.options.length < 2) return false
    if (!Number.isInteger(question.correctIndex) || question.correctIndex < 0 || question.correctIndex >= question.options.length) return false
    const key = question.prompt.trim().toLowerCase().replace(/\s+/g, ' ')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function cleanQuestionBanks(questions: ExamQuestion[]) {
  const groups = new Map<string, ExamQuestion[]>()
  for (const question of questions) {
    const group = question.source ?? 'legacy-question-bank'
    groups.set(group, [...(groups.get(group) ?? []), question])
  }
  return Array.from(groups.values()).flatMap(cleanQuestions)
}

function restoreExamSession(value: unknown): ExamSession | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<ExamSession>
  const modes: AttemptMode[] = ['full_mock', 'chapter', 'custom', 'uploaded', 'retry']
  if (!Array.isArray(raw.questions) || !Array.isArray(raw.answers) || !modes.includes(raw.mode as AttemptMode)) return null
  const questions = raw.questions as unknown[]
  if (questions.length === 0 || questions.some((value) => !value || typeof value !== 'object')) return null
  const ids = new Set<string>()
  for (const value of questions) {
    const question = value as ExamQuestion & { answerVerified?: unknown }
    const correctIndex = question.correctIndex
    const options = Array.isArray(question.options) ? question.options : []
    const hasValidOptions = options.length >= 2 && options.every((option) => typeof option === 'string')
    const verifiedKeyIsValid = question.answerVerified !== false && Number.isInteger(correctIndex) && correctIndex >= 0 && correctIndex < options.length
    const explicitlyUnscored = question.answerVerified === false && correctIndex === -1
    if (
      typeof question.id !== 'string' || !question.id.trim() || ids.has(question.id)
      || typeof question.prompt !== 'string' || !question.prompt.trim()
      || !hasValidOptions
      || (question.answerVerified !== undefined && typeof question.answerVerified !== 'boolean')
      || (!verifiedKeyIsValid && !explicitlyUnscored)
    ) return null
    ids.add(question.id)
  }
  if (raw.answers.length !== questions.length || raw.answers.some((answer, index) => {
    if (answer === null) return false
    return !Number.isInteger(answer) || Number(answer) < 0 || Number(answer) >= (questions[index] as ExamQuestion).options.length
  })) return null
  if (!Array.isArray(raw.questionSeconds) || raw.questionSeconds.length !== questions.length || raw.questionSeconds.some((seconds) => typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0)) return null
  const alignedQuestions = questions as ExamQuestion[]
  if (questions.length === 0 || (raw.mode === 'full_mock' && questions.length !== FULL_MOCK_QUESTIONS)) return null

  const now = Date.now()
  const startedAt = typeof raw.startedAt === 'string' && Number.isFinite(Date.parse(raw.startedAt)) ? raw.startedAt : new Date(now).toISOString()
  const storedSessionStartedAt = typeof raw.sessionStartedAt === 'number' && Number.isFinite(raw.sessionStartedAt)
    ? raw.sessionStartedAt
    : Date.parse(startedAt)
  const sessionIndex = raw.mode === 'full_mock' && raw.sessionIndex === 1 ? 1 : 0
  const phase: ExamPhase = raw.mode === 'full_mock' && raw.phase === 'break' ? 'break' : 'taking'
  const minIndex = raw.mode === 'full_mock' && sessionIndex === 1 ? QUESTIONS_PER_SESSION : 0
  const maxIndex = raw.mode === 'full_mock' && sessionIndex === 0 ? QUESTIONS_PER_SESSION - 1 : alignedQuestions.length - 1
  const requestedIndex = Number.isInteger(raw.currentIndex) ? Number(raw.currentIndex) : minIndex
  const currentIndex = Math.max(minIndex, Math.min(maxIndex, requestedIndex))
  const answers = raw.answers as (number | null)[]
  const questionSeconds = raw.questionSeconds as number[]
  const validIndices = (indices: unknown, length = questions.length) => Array.isArray(indices)
    ? Array.from(new Set(indices.filter((index): index is number => Number.isInteger(index) && Number(index) >= 0 && Number(index) < length).map(Number)))
    : []
  const visited = new Set(validIndices(raw.visited))
  answers.forEach((answer, index) => { if (answer !== null || questionSeconds[index] > 0) visited.add(index) })
  if (phase === 'taking') visited.add(currentIndex)
  const sessionStartedAt = Math.min(storedSessionStartedAt, now)
  const breakStartedAt = typeof raw.breakStartedAt === 'number' && Number.isFinite(raw.breakStartedAt) ? raw.breakStartedAt : null
  return {
    id: isUuid(raw.id) ? raw.id : newId(),
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title : 'Exam session',
    mode: raw.mode as AttemptMode,
    questions: alignedQuestions,
    answers,
    visited: Array.from(visited),
    flagged: validIndices(raw.flagged),
    eliminatedOptions: alignedQuestions.map((question, index) => validIndices(raw.eliminatedOptions?.[index], question.options.length)),
    highlighted: validIndices(raw.highlighted),
    currentIndex,
    startedAt,
    phase,
    sessionIndex,
    sessionStartedAt,
    breakStartedAt: phase === 'break' ? breakStartedAt ?? sessionStartedAt : null,
    questionOpenedAt: typeof raw.questionOpenedAt === 'number' && Number.isFinite(raw.questionOpenedAt) ? Math.min(raw.questionOpenedAt, now) : sessionStartedAt,
    elapsedSeconds: typeof raw.elapsedSeconds === 'number' && Number.isFinite(raw.elapsedSeconds) ? Math.max(0, raw.elapsedSeconds) : 0,
    questionSeconds,
    sourceUrl: typeof raw.sourceUrl === 'string' ? raw.sourceUrl : undefined,
    sourceTitle: typeof raw.sourceTitle === 'string' ? raw.sourceTitle : undefined,
  }
}

function asImportedMockSummary(value: unknown): ImportedMockSummary | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const counts = Array.isArray(row.sessionCounts) ? row.sessionCounts : []
  if (typeof row.id !== 'string' || typeof row.title !== 'string' || typeof row.sourceUrl !== 'string') return null
  const sessionCounts: [number, number] = [Number(counts[0]) || 0, Number(counts[1]) || 0]
  return {
    id: row.id,
    title: row.title,
    questionCount: Number(row.questionCount) || 0,
    scoredQuestionCount: Number.isInteger(row.scoredQuestionCount) ? Number(row.scoredQuestionCount) : undefined,
    unverifiedQuestionCount: Number.isInteger(row.unverifiedQuestionCount) ? Number(row.unverifiedQuestionCount) : undefined,
    sessionCounts,
    ready: row.ready === true,
    sourceUrl: row.sourceUrl,
    complete: row.complete === true,
    notes: Array.isArray(row.notes) ? row.notes.filter((note): note is string => typeof note === 'string') : [],
  }
}

function isMappedForFullMock(question: ExamQuestion) {
  const subject = cfaLevel1Syllabus.find((item) => item.id === question.subjectId)
  return Boolean(subject?.topics.some((topic) => topic.id === question.topicId))
}

function shuffleQuestions<T>(questions: T[]) {
  const shuffled = questions.slice()
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
  }
  return shuffled
}

function formatTime(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const seconds = safeSeconds % 60
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.max(0, Math.round(totalSeconds / 60))
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  if (hours === 0) return `${minutes} min`
  return remainder > 0 ? `${hours} hr ${remainder} min` : `${hours} hr`
}

function formatAttemptDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function describeCoverage(questions: ExamQuestion[]) {
  const subjects = cfaLevel1Syllabus.filter((subject) => questions.some((question) => question.subjectId === subject.id))
  const chapters = new Set(questions.map((question) => question.topicId).filter(Boolean))
  if (questions.length === 0) return 'No matching questions for this selection'
  if (subjects.length === 1) {
    const subjectName = subjects[0].title
    const chapterNames = Array.from(new Set(questions.map((question) => question.topic).filter(Boolean)))
    if (chapterNames.length === 1) return `${subjectName} · ${chapterNames[0]}`
    if (chapterNames.length > 1) return `${subjectName} · ${chapterNames.length} chapters`
    return subjectName
  }
  return `${subjects.length} subjects · ${chapters.size} chapters`
}

function mapBankQuestion(row: Record<string, unknown>, set: AssessmentSet): BankQuestion | null {
  const prompt = typeof row.prompt === 'string' ? row.prompt.trim() : ''
  const options = Array.isArray(row.options) ? row.options.map((item) => String(item).trim()).filter(Boolean) : []
  const correctIndex = Number(row.correct_index)
  if (!prompt || options.length < 2 || !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) return null

  const subject = cfaLevel1Syllabus.find((item) => item.id === set.subjectId)
  const topic = subject?.topics.find((item) => item.id === set.topicId)
  return {
    id: String(row.id ?? `${set.id}-${row.ordinal ?? prompt.slice(0, 18)}`),
    prompt,
    options,
    correctIndex,
    rationale: typeof row.rationale === 'string' ? row.rationale : '',
    subjectId: set.subjectId ?? '',
    subject: subject?.title ?? set.subjectTitle ?? 'Unmapped subject',
    topicId: topic?.id,
    topic: topic?.title ?? set.topicTitle ?? undefined,
    source: `${set.source}:${set.id}`,
  }
}

function questionFromGenerated(raw: ExamQuestion, fallback: { subjectId: string | null; topicId: string | null; source: string }): ExamQuestion | null {
  const prompt = typeof raw.prompt === 'string' ? raw.prompt.trim() : ''
  const options = Array.isArray(raw.options) ? raw.options.map((item) => String(item).trim()).filter(Boolean) : []
  const correctIndex = Number(raw.correctIndex)
  if (!prompt || options.length < 2 || !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) return null
  const subjectId = raw.subjectId || fallback.subjectId || ''
  const syllabusSubject = cfaLevel1Syllabus.find((item) => item.id === subjectId)
  const topicId = raw.topicId || fallback.topicId || undefined
  const topic = syllabusSubject?.topics.find((item) => item.id === topicId)
  return {
    id: raw.id || newId(),
    prompt,
    options,
    correctIndex,
    rationale: typeof raw.rationale === 'string' ? raw.rationale : '',
    subjectId,
    subject: raw.subject || syllabusSubject?.title || 'Unmapped subject',
    topicId,
    topic: raw.topic || topic?.title,
    source: raw.source || fallback.source,
  }
}

function fullMockQuestionPoolIsUsable(questions: ExamQuestion[]) {
  const mapped = cleanQuestions(questions).filter(isMappedForFullMock)
  if (mapped.length < FULL_MOCK_QUESTIONS) return false
  const countsBySubject = new Map<string, number>()
  for (const question of mapped) countsBySubject.set(question.subjectId, (countsBySubject.get(question.subjectId) ?? 0) + 1)
  return FULL_MOCK_SUBJECT_QUOTAS.every(([subjectId, required]) => (countsBySubject.get(subjectId) ?? 0) >= required)
}

function selectFullMockQuestions(questions: ExamQuestion[]) {
  const pool = cleanQuestions(questions).filter(isMappedForFullMock)
  if (!fullMockQuestionPoolIsUsable(pool)) return []
  const questionsBySubject = new Map<string, ExamQuestion[]>()
  for (const question of pool) questionsBySubject.set(question.subjectId, [...(questionsBySubject.get(question.subjectId) ?? []), question])

  const selected: ExamQuestion[] = []
  for (const sessionSubjects of FULL_MOCK_SESSION_SUBJECTS) {
    const sessionQuestions: ExamQuestion[] = []
    for (const [subjectId, required] of sessionSubjects) {
      const candidates = shuffleQuestions(questionsBySubject.get(subjectId) ?? [])
      if (candidates.length < required) return []
      sessionQuestions.push(...candidates.slice(0, required))
    }
    if (sessionQuestions.length !== QUESTIONS_PER_SESSION) return []
    selected.push(...sessionQuestions)
  }
  return selected.length === FULL_MOCK_QUESTIONS ? selected : []
}

function normalizeImportedQuestionBank(value: unknown, fileName: string): ExamQuestion[] {
  const rows = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as { questions?: unknown }).questions)
      ? (value as { questions: unknown[] }).questions
      : []

  const normalized = rows.flatMap((raw, index) => {
    if (!raw || typeof raw !== 'object') return []
    const row = raw as Record<string, unknown>
    const prompt = typeof row.prompt === 'string' ? row.prompt.trim() : ''
    const options = Array.isArray(row.options) ? row.options.map((option) => String(option).trim()).filter(Boolean) : []
    const correctIndex = Number(row.correctIndex ?? row.correct_index)
    const subjectIdFromFile = typeof row.subjectId === 'string' ? row.subjectId : typeof row.subject_id === 'string' ? row.subject_id : ''
    const subjectNameFromFile = typeof row.subject === 'string' ? row.subject : typeof row.subject_title === 'string' ? row.subject_title : ''
    const subject = cfaLevel1Syllabus.find((item) => item.id === subjectIdFromFile)
      ?? cfaLevel1Syllabus.find((item) => item.title.toLowerCase() === subjectNameFromFile.trim().toLowerCase())
    const topicIdFromFile = typeof row.topicId === 'string' ? row.topicId : typeof row.topic_id === 'string' ? row.topic_id : ''
    const topicNameFromFile = typeof row.topic === 'string' ? row.topic : typeof row.topic_title === 'string' ? row.topic_title : ''
    const topic = subject?.topics.find((item) => item.id === topicIdFromFile)
      ?? subject?.topics.find((item) => item.title.toLowerCase() === topicNameFromFile.trim().toLowerCase())
    if (!prompt || options.length < 2 || !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length || !subject || !topic) return []
    return [{
      id: typeof row.id === 'string' && row.id.trim() ? row.id : `${newId()}-${index}`,
      prompt,
      options,
      correctIndex,
      rationale: typeof row.rationale === 'string' ? row.rationale : '',
      subjectId: subject.id,
      subject: subject.title,
      topicId: topic.id,
      topic: topic.title,
      source: `uploaded:${fileName}`,
    } satisfies ExamQuestion]
  })
  return cleanQuestions(normalized)
}

function sessionQuestionRange(session: ExamSession) {
  if (session.mode !== 'full_mock') return { start: 0, end: session.questions.length }
  const start = session.sessionIndex * QUESTIONS_PER_SESSION
  return { start, end: start + QUESTIONS_PER_SESSION }
}

function sessionDuration(session: ExamSession) {
  return session.mode === 'full_mock' ? SESSION_SECONDS : Math.max(1, session.questions.length) * QUIZ_SECONDS_PER_QUESTION
}

function remainingSessionSeconds(session: ExamSession, now: number) {
  return Math.max(0, sessionDuration(session) - Math.floor((now - session.sessionStartedAt) / 1000))
}

function FormSelect({
  label,
  value,
  onChange,
  children,
  disabled,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
  disabled?: boolean
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <span className="relative block">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 py-3 pr-10 text-sm text-slate-800 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 disabled:bg-slate-50"
        >
          {children}
        </select>
        <ChevronDown size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
      </span>
    </label>
  )
}

function ExamModal({
  title,
  body,
  primaryLabel,
  onPrimary,
  onClose,
  secondaryLabel,
}: {
  title: string
  body: React.ReactNode
  primaryLabel: string
  onPrimary: () => void
  onClose: () => void
  secondaryLabel: string
}) {
  const dialogRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const buttons = () => dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])')
    buttons()?.[0]?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onCloseRef.current() }
      if (event.key !== 'Tab') return
      const items = buttons()
      if (!items?.length) return
      const first = items[0], last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown); previous?.focus() }
  }, [])
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" role="presentation">
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="exam-modal-title" className="flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col rounded-3xl border border-white/70 bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex shrink-0 items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-700">Exam workspace</p>
            <h2 id="exam-modal-title" className="mt-2 text-xl font-semibold text-slate-950">{title}</h2>
          </div>
          <button type="button" aria-label="Close dialog" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={18} /></button>
        </div>
        <div className="mt-4 min-h-0 overflow-y-auto text-sm leading-6 text-slate-600">{body}</div>
        <div className="mt-4 flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">{secondaryLabel}</button>
          <button type="button" onClick={onPrimary} className="min-h-11 rounded-xl bg-blue-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-900">{primaryLabel}</button>
        </div>
      </section>
    </div>
  )
}

export function ExamWorkspace() {
  const { attempts, ready, scopeKey } = useLearningData()
  const latestAttemptsRef = useRef(attempts)
  latestAttemptsRef.current = attempts
  const [supabase] = useState(() => createClient())
  const [setupMode, setSetupMode] = useState<SetupMode>('quick')
  const [subjectId, setSubjectId] = useState('all')
  const [topicId, setTopicId] = useState('all')
  const [questionCount, setQuestionCount] = useState('10')
  const [quickBankId, setQuickBankId] = useState('built-in')
  const [bankSearch, setBankSearch] = useState('')
  const [bankQuestions, setBankQuestions] = useState<BankQuestion[]>([])
  const [bankSets, setBankSets] = useState<BankSet[]>([])
  const [bankReady, setBankReady] = useState(false)
  const [bankError, setBankError] = useState<string | null>(null)
  const [importedMocks, setImportedMocks] = useState<ImportedMockSummary[]>([])
  const [importedMocksReady, setImportedMocksReady] = useState(false)
  const [importedMocksError, setImportedMocksError] = useState<string | null>(null)
  const [startingImportedMock, setStartingImportedMock] = useState<string | null>(null)
  const [localSavedQuestions, setLocalSavedQuestions] = useState<ExamQuestion[]>([])
  const [localBankScopeKey, setLocalBankScopeKey] = useState<string | null>(null)
  const [localBankMessage, setLocalBankMessage] = useState<string | null>(null)
  const [localBankError, setLocalBankError] = useState<string | null>(null)
  const [session, setSession] = useState<ExamSession | null>(null)
  const sessionRef = useRef<ExamSession | null>(null)
  const legacyRestoredSessionIds = useRef(new Set<string>())
  const [loadedScopeKey, setLoadedScopeKey] = useState<string | null>(null)
  const [view, setView] = useState<ExamView>('setup')
  const [navigatorOpen, setNavigatorOpen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [fullscreenError, setFullscreenError] = useState<string | null>(null)
  const ownsFullscreen = useRef(false)
  const questionPaneRef = useRef<HTMLElement | null>(null)
  const navigatorToggleRef = useRef<HTMLButtonElement | null>(null)
  const navigatorCloseRef = useRef<HTMLButtonElement | null>(null)
  const navigatorRef = useRef<HTMLElement | null>(null)
  const examActive = ready && loadedScopeKey === scopeKey && view === 'exam' && Boolean(session)
  useExamFocus(examActive)

  useEffect(() => {
    const update = () => setIsFullscreen(Boolean(document.fullscreenElement))
    const exitOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && ownsFullscreen.current && document.fullscreenElement && !document.querySelector('[role="dialog"]')) {
        event.preventDefault()
        void document.exitFullscreen().then(() => { ownsFullscreen.current = false }).catch(() => {})
      }
    }
    document.addEventListener('fullscreenchange', update)
    document.addEventListener('keydown', exitOnEscape)
    update()
    return () => {
      document.removeEventListener('fullscreenchange', update)
      document.removeEventListener('keydown', exitOnEscape)
      if (ownsFullscreen.current && document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    }
  }, [])
  useEffect(() => {
    if (!examActive && ownsFullscreen.current && document.fullscreenElement) {
      ownsFullscreen.current = false
      void document.exitFullscreen().catch(() => {})
    }
  }, [examActive])
  useEffect(() => {
    questionPaneRef.current?.scrollTo({ top: 0 })
  }, [session?.currentIndex, view])
  useEffect(() => {
    if (!navigatorOpen) return
    navigatorCloseRef.current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setNavigatorOpen(false); navigatorToggleRef.current?.focus() }
      if (event.key === 'Tab') {
        const buttons = navigatorRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])')
        if (!buttons?.length) return
        const first = buttons[0], last = buttons[buttons.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [navigatorOpen])
  useEffect(() => {
    const wideScreen = window.matchMedia('(min-width: 768px)')
    const closeOnDesktop = () => { if (wideScreen.matches) setNavigatorOpen(false) }
    wideScreen.addEventListener('change', closeOnDesktop)
    return () => wideScreen.removeEventListener('change', closeOnDesktop)
  }, [])

  const toggleFullscreen = async () => {
    setFullscreenError(null)
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
        ownsFullscreen.current = false
      } else if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen()
        ownsFullscreen.current = true
      } else {
        setFullscreenError('Fullscreen is unavailable in this browser. Exam controls still stay on screen; use your browser’s fullscreen command if available.')
      }
    } catch {
      setFullscreenError('The browser could not enter fullscreen. Try its fullscreen command; your exam is still saved.')
    }
  }
  const [nowMs, setNowMs] = useState(Date.now())
  const [isStarting, setIsStarting] = useState(false)
  const [setupError, setSetupError] = useState<string | null>(null)
  const [freshPracticeError, setFreshPracticeError] = useState<string | null>(null)
  const [searchReview, setSearchReview] = useState('')
  const [reviewFilter, setReviewFilter] = useState<'all' | 'incorrect' | 'unanswered'>('all')
  const [reviewAttemptId, setReviewAttemptId] = useState<string | null>(null)
  const [reviewOverride, setReviewOverride] = useState<ExamAttempt | null>(null)
  const paperRequests = useRef(new Map<string, Promise<ExamQuestion[]>>())
  const failedPaperIds = useRef(new Set<string>())
  const [nativeLoadErrors, setNativeLoadErrors] = useState<string[]>([])
  const [analysisStates, setAnalysisStates] = useState<Record<string, AnalysisUiState>>({})
  const requestedAnalysisIds = useRef(new Set<string>())
  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const [confirmExit, setConfirmExit] = useState(false)
  const [loadedQuestionOpen, setLoadedQuestionOpen] = useState<number | null>(null)

  const sessionStorageKey = scopeKey ? `${scopeKey}:${EXAM_SESSION_STORAGE_SUFFIX}` : null
  const currentSubject = cfaLevel1Syllabus.find((item) => item.id === subjectId)
  const currentTopic = currentSubject?.topics.find((item) => item.id === topicId)
  const requiredCount = Number(questionCount)

  const updateSession = useCallback((next: ExamSession | null) => {
    sessionRef.current = next
    setSession(next)
  }, [])

  useEffect(() => {
    if (!ready || !scopeKey || !sessionStorageKey || loadedScopeKey === scopeKey) return
    let restored: ExamSession | null = null
    try {
      const raw = window.localStorage.getItem(sessionStorageKey)
      if (raw) {
        restored = restoreExamSession(JSON.parse(raw) as unknown)
        if (restored?.phase === 'break' && restored.breakStartedAt && Date.now() >= restored.breakStartedAt + BREAK_SECONDS * 1000) {
            const secondStart = restored.breakStartedAt + BREAK_SECONDS * 1000
            restored = {
              ...restored,
              phase: 'taking',
              sessionIndex: 1,
              currentIndex: QUESTIONS_PER_SESSION,
              sessionStartedAt: secondStart,
              breakStartedAt: null,
              questionOpenedAt: secondStart,
              visited: Array.from(new Set([...restored.visited, QUESTIONS_PER_SESSION])),
            }
        }
      }
    } catch {
      restored = null
    }
    if (restored) legacyRestoredSessionIds.current.add(restored.id)
    updateSession(restored)
    setLoadedScopeKey(scopeKey)
  }, [ready, scopeKey, sessionStorageKey, loadedScopeKey, updateSession])

  useEffect(() => {
    if (!ready || !sessionStorageKey || loadedScopeKey !== scopeKey) return
    try {
      if (session) {
        window.localStorage.setItem(sessionStorageKey, JSON.stringify(session))
      } else {
        window.localStorage.removeItem(sessionStorageKey)
      }
    } catch {
      // Storage can be unavailable in private browser modes; the live session still works.
    }
  }, [ready, sessionStorageKey, scopeKey, loadedScopeKey, session])

  const localBankStorageKey = scopeKey ? `${scopeKey}:uploaded-exam-bank-v1` : null
  useEffect(() => {
    if (!ready || !localBankStorageKey || loadedScopeKey !== scopeKey || localBankScopeKey === scopeKey) return
    let questions: ExamQuestion[] = []
    try {
      const raw = window.localStorage.getItem(localBankStorageKey)
      const parsed = raw ? JSON.parse(raw) as unknown : []
      questions = Array.isArray(parsed) ? cleanQuestionBanks(parsed as ExamQuestion[]) : []
    } catch {
      questions = []
    }
    setLocalSavedQuestions(questions)
    setLocalBankScopeKey(scopeKey)
    setLocalBankMessage(null)
    setLocalBankError(null)
  }, [ready, localBankStorageKey, loadedScopeKey, scopeKey, localBankScopeKey])

  async function handleQuestionBankImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    setLocalBankError(null)
    setLocalBankMessage(null)
    if (!file) return
    if (!localBankStorageKey || !scopeKey) {
      setLocalBankError('Your learning profile is still loading. Try importing again in a moment.')
      return
    }
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as unknown
      const questions = normalizeImportedQuestionBank(parsed, file.name)
      const bankSource = `uploaded:${file.name}`
      const rawCount = Array.isArray(parsed)
        ? parsed.length
        : parsed && typeof parsed === 'object' && Array.isArray((parsed as { questions?: unknown }).questions)
          ? (parsed as { questions: unknown[] }).questions.length
          : 0
      if (questions.length === 0) {
        throw new Error('No valid questions found. Each item needs a prompt, options, correctIndex, CFA subject, and chapter mapping.')
      }
      const mergedQuestions = cleanQuestionBanks([
        ...localSavedQuestions.filter((question) => question.source !== bankSource),
        ...questions,
      ])
      window.localStorage.setItem(localBankStorageKey, JSON.stringify(mergedQuestions))
      setLocalSavedQuestions(mergedQuestions)
      setLocalBankScopeKey(scopeKey)
      setSetupError(null)
      setLocalBankMessage(`Loaded ${questions.length} distinct mapped questions from ${file.name}${rawCount > questions.length ? `; ${rawCount - questions.length} invalid or duplicate items were skipped` : ''}.`)
    } catch (error) {
      setLocalBankError(error instanceof Error ? error.message : 'Could not read this question bank file.')
    }
  }

  useEffect(() => {
    let active = true
    async function loadQuestionBank() {
      setBankReady(false)
      setBankError(null)
      try {
        const { data: setsData, error: setsError } = await supabase
          .from('assessment_sets')
          .select('id, source, scope, title, subject_id, subject_title, topic_id, topic_title, subtopic_id, subtopic_title, created_at')
          .eq('published', true)
          .order('created_at', { ascending: false })
          .limit(100)

        if (setsError) throw setsError
        const sets = (setsData ?? []).map((row) => mapAssessmentSet(row as unknown as Record<string, unknown>))
        if (sets.length === 0) {
          if (active) {
            setBankSets([])
            setBankQuestions([])
          }
          return
        }

        const { data: questionsData, error: questionsError } = await supabase
          .from('assessment_questions')
          .select('id, set_id, ordinal, prompt, options, correct_index, rationale')
          .in('set_id', sets.map((set) => set.id))
          .order('ordinal', { ascending: true })
          .limit(3000)

        if (questionsError) throw questionsError
        const questions = (questionsData ?? []).flatMap((row) => {
          const parent = sets.find((set) => set.id === String(row.set_id))
          if (!parent) return []
          const question = mapBankQuestion(row as unknown as Record<string, unknown>, parent)
          return question ? [question] : []
        })
        const questionsBySet = new Map<string, BankQuestion[]>()
        for (const question of questions) {
          const setId = question.source.split(':').slice(1).join(':')
          questionsBySet.set(setId, [...(questionsBySet.get(setId) ?? []), question])
        }
        const setCounts = new Map(Array.from(questionsBySet, ([setId, rows]) => [setId, cleanQuestions(rows).length]))
        if (active) {
          setBankSets(sets.map((set) => ({ ...set, questionCount: setCounts.get(set.id) ?? 0 })))
          setBankQuestions(questions)
        }
      } catch (error) {
        if (active) {
          setBankError(error instanceof Error ? error.message : 'The published question bank could not be loaded.')
          setBankQuestions([])
          setBankSets([])
        }
      } finally {
        if (active) setBankReady(true)
      }
    }
    void loadQuestionBank()
    return () => { active = false }
  }, [supabase])

  useEffect(() => {
    let active = true
    async function loadImportedMocks() {
      setImportedMocksReady(false)
      setImportedMocksError(null)
      try {
        const response = await fetch('/api/mocks', { cache: 'no-store' })
        const data = await response.json() as { mocks?: unknown[]; error?: string }
        if (!response.ok) throw new Error(data.error ?? 'Imported mock papers could not be loaded.')
        const mocks = Array.isArray(data.mocks) ? data.mocks.flatMap((item) => {
          const mock = asImportedMockSummary(item)
          return mock ? [mock] : []
        }) : []
        if (active) setImportedMocks(mocks)
      } catch (error) {
        if (active) setImportedMocksError(error instanceof Error ? error.message : 'Imported mock papers could not be loaded.')
      } finally {
        if (active) setImportedMocksReady(true)
      }
    }
    void loadImportedMocks()
    return () => { active = false }
  }, [])

  const matchesQuickTarget = useCallback((question: ExamQuestion) => {
    if (subjectId !== 'all' && question.subjectId !== subjectId) return false
    return topicId === 'all' || question.topicId === topicId
  }, [subjectId, topicId])

  const questionBanks = useMemo<QuestionBankChoice[]>(() => {
    const builtInQuestions = cleanQuestions(PRACTICE_QUESTIONS)
    const choices: QuestionBankChoice[] = [{
      id: 'built-in',
      name: 'Study Table practice',
      sourceLabel: 'Included practice bank',
      coverage: `${builtInQuestions.length} questions · ${new Set(builtInQuestions.map((question) => question.subjectId)).size} CFA subjects`,
      questions: builtInQuestions,
    }]
    const localGroups = new Map<string, ExamQuestion[]>()
    for (const question of localSavedQuestions.filter((item) => item.source?.startsWith('uploaded:'))) {
      const groupId = question.source ?? 'uploaded:Question set'
      localGroups.set(groupId, [...(localGroups.get(groupId) ?? []), question])
    }
    for (const [source, questions] of localGroups) {
      const name = source.startsWith('uploaded:') ? source.slice('uploaded:'.length) : 'Uploaded question set'
      choices.push({ id: `local:${source}`, name, sourceLabel: 'Uploaded on this device', coverage: describeCoverage(questions), questions: cleanQuestions(questions) })
    }
    const generatedSetIds = new Set(bankSets.filter((item) => item.source === 'generated').map((set) => set.id))
    const savedQuizQuestions = cleanQuestions([...bankQuestions.filter((question) => {
      const setId = question.source.split(':').slice(1).join(':')
      return generatedSetIds.has(setId)
    }), ...localSavedQuestions.filter((question) => question.source === 'generated-local')])
    if (savedQuizQuestions.length > 0) {
      choices.push({ id: 'saved-quizzes', name: 'Saved quizzes', sourceLabel: 'Generated in Study Table', coverage: describeCoverage(savedQuizQuestions), questions: savedQuizQuestions })
    }
    for (const set of bankSets.filter((item) => item.source === 'admin_upload' && item.questionCount > 0)) {
      const questions = bankQuestions.filter((question) => question.source?.endsWith(`:${set.id}`))
      choices.push({
        id: `published:${set.id}`,
        name: set.title,
        sourceLabel: 'Uploaded question bank',
        coverage: set.subjectTitle && set.topicTitle ? `${set.subjectTitle} · ${set.topicTitle}` : describeCoverage(questions),
        questions: cleanQuestions(questions),
      })
    }
    return choices
  }, [bankSets, bankQuestions, localSavedQuestions])

  const matchingQuestionBanks = useMemo(() => questionBanks.filter((bank) => bank.questions.length > 0), [questionBanks])
  const visibleQuestionBanks = useMemo(() => {
    const query = bankSearch.trim().toLowerCase()
    if (!query) return matchingQuestionBanks
    return matchingQuestionBanks.filter((bank) => `${bank.name} ${bank.sourceLabel} ${bank.coverage}`.toLowerCase().includes(query))
  }, [matchingQuestionBanks, bankSearch])
  const selectedQuestionBank = questionBanks.find((bank) => bank.id === quickBankId) ?? questionBanks[0]
  const quickQuestions = cleanQuestions(selectedQuestionBank?.questions ?? []).filter(matchesQuickTarget)
  const fullMockReady = fullMockQuestionPoolIsUsable(PRACTICE_QUESTIONS)
  const retryQuestions = useMemo(() => getWrongQuestions(attempts).filter(isAnswerVerified), [attempts])
  const quickStartCount = Math.min(requiredCount, quickQuestions.length)

  const activeReview = reviewOverride?.id === reviewAttemptId
    ? reviewOverride
    : attempts.find((attempt) => attempt.id === reviewAttemptId) ?? null

  useEffect(() => {
    if (!ready || loadedScopeKey !== scopeKey) return
    const mockIds = Array.from(new Set([
      ...(sessionRef.current?.questions ?? []).map((question) => (question as ImportedMockQuestion).mockId),
      ...attempts.flatMap((attempt) => attempt.questions.map((question) => (question as ImportedMockQuestion).mockId)),
    ].filter((id): id is string => typeof id === 'string' && /^mock-[1-6]$/.test(id))))
    if (mockIds.length === 0) return
    let active = true
    for (const mockId of mockIds) {
      let request = paperRequests.current.get(mockId)
      if (!request) {
        request = fetch(`/api/mocks/${mockId}`, { cache: 'no-store' }).then(async (response) => {
          const data = await response.json() as ImportedPaperResponse
          if (!response.ok || !Array.isArray(data.mock?.questions)) {
            throw new Error(data.error ?? 'The latest paper text could not be loaded.')
          }
          return data.mock.questions as ExamQuestion[]
        })
        paperRequests.current.set(mockId, request)
      }
      void request.then((latestQuestions) => {
        if (!active) return
        const latestById = new Map(latestQuestions.filter((question) => question && typeof question.id === 'string').map((question) => [question.id, question]))
        const current = sessionRef.current
        if (current) {
          let changed = false
          const questions = current.questions.map((question) => {
            if ((question as ImportedMockQuestion).mockId !== mockId) return question
            const next = mergeNativeQuestion(question, latestById.get(question.id))
            if (next !== question) changed = true
            return next
          })
          if (changed) updateSession({ ...current, questions })
        }
        for (const attempt of latestAttemptsRef.current) {
          let changed = false
          const questions = attempt.questions.map((question) => {
            if ((question as ImportedMockQuestion).mockId !== mockId) return question
            const next = mergeNativeQuestion(question, latestById.get(question.id))
            if (next !== question) changed = true
            return next
          })
          if (!changed) continue
          const enriched = { ...attempt, questions }
          saveExamAttempt(enriched)
          setReviewOverride((currentReview) => currentReview?.id === attempt.id ? { ...currentReview, questions } : currentReview)
        }
      }).catch((error: unknown) => {
        if (!active || failedPaperIds.current.has(mockId)) return
        failedPaperIds.current.add(mockId)
        const message = error instanceof Error ? error.message : 'The latest paper text could not be loaded.'
        setNativeLoadErrors((current) => [...current, `${mockId}: ${message}`])
      })
    }
    return () => { active = false }
  }, [attempts, loadedScopeKey, ready, scopeKey, session?.id, session?.questions, updateSession])

  const requestAttemptAnalysis = useCallback(async (attempt: ExamAttempt) => {
    if (requestedAnalysisIds.current.has(attempt.id)) return
    requestedAnalysisIds.current.add(attempt.id)
    setAnalysisStates((current) => ({ ...current, [attempt.id]: { status: 'loading' } }))
    try {
      const response = await fetch('/api/exam/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attempt }),
      })
      const data = await response.json() as { analysis?: ExamAIAnalysis; model?: string; reasoning?: string; error?: string }
      if (!response.ok || !data.analysis || typeof data.analysis.summary !== 'string' || !Array.isArray(data.analysis.focusAreas)) {
        throw new Error(data.error ?? 'AI topic analysis is temporarily unavailable.')
      }
      const updatedAttempt: ExamAttempt = { ...attempt, analysis: data.analysis }
      saveExamAttempt(updatedAttempt)
      setReviewOverride((current) => current?.id === attempt.id ? updatedAttempt : current)
      setAnalysisStates((current) => ({ ...current, [attempt.id]: { status: 'ready', analysis: data.analysis, model: data.model, reasoning: typeof data.reasoning === 'string' ? data.reasoning : undefined } }))
    } catch (error) {
      requestedAnalysisIds.current.delete(attempt.id)
      setAnalysisStates((current) => ({ ...current, [attempt.id]: { status: 'error', error: error instanceof Error ? error.message : 'AI topic analysis is temporarily unavailable.' } }))
    }
  }, [])

  useEffect(() => {
    if (view !== 'review' || !activeReview) return
    if (activeReview.analysis) {
      setAnalysisStates((current) => current[activeReview.id]?.status === 'ready'
        ? current
        : { ...current, [activeReview.id]: { status: 'ready', analysis: activeReview.analysis } })
      return
    }
    void requestAttemptAnalysis(activeReview)
  }, [view, activeReview, requestAttemptAnalysis])

  const startQuiz = useCallback((args: {
    questions: ExamQuestion[]
    mode: AttemptMode
    title: string
    requestedCount: number
    preserveOrder?: boolean
    sourceUrl?: string
  }) => {
    const unique = args.preserveOrder ? args.questions : cleanQuestions(args.questions)
    const isFull = args.mode === 'full_mock'
    const questions = isFull
      ? (args.preserveOrder ? unique : selectFullMockQuestions(unique))
      : args.preserveOrder ? unique.slice(0, args.requestedCount) : shuffleQuestions(unique).slice(0, args.requestedCount)
    if (isFull && questions.length !== FULL_MOCK_QUESTIONS) {
      setSetupError(`The full mock needs 90 mapped questions for each exam session, including its required subject mix. This bank currently does not have enough distinct mapped questions.`)
      return
    }
    if (questions.length < args.requestedCount || questions.length === 0) {
      setSetupError(`Only ${unique.length} distinct matching questions are available. Choose a smaller practice quiz or another bank.`)
      return
    }
    const now = Date.now()
    const mode: AttemptMode = args.mode
    const nextSession: ExamSession = {
      id: newId(),
      title: args.title,
      mode,
      questions,
      answers: new Array(questions.length).fill(null),
      visited: [0],
      flagged: [],
      eliminatedOptions: questions.map(() => []),
      highlighted: [],
      currentIndex: 0,
      startedAt: new Date(now).toISOString(),
      phase: 'taking',
      sessionIndex: 0,
      sessionStartedAt: now,
      breakStartedAt: null,
      questionOpenedAt: now,
      elapsedSeconds: 0,
      questionSeconds: questions.map(() => 0),
      sourceUrl: args.sourceUrl,
      sourceTitle: args.sourceUrl ? args.title : undefined,
    }
    setSetupError(null)
    setReviewOverride(null)
    updateSession(nextSession)
    setView('exam')
    setNowMs(now)
  }, [updateSession])

  const finishAttempt = useCallback((current: ExamSession, finishedMs: number) => {
    const totalDuration = current.mode === 'full_mock' ? SESSION_SECONDS * 2 : sessionDuration(current)
    const elapsedSeconds = Math.min(totalDuration, Math.max(0, current.elapsedSeconds) + Math.min(sessionDuration(current), Math.max(0, Math.floor((finishedMs - current.sessionStartedAt) / 1000))))
    const scoredCount = current.questions.filter(isAnswerVerified).length
    const correctCount = current.questions.reduce((total, question, index) => total + (isAnswerVerified(question) && current.answers[index] === question.correctIndex ? 1 : 0), 0)
    const attempt: ExamAttempt = {
      id: current.id,
      title: current.title,
      mode: current.mode,
      startedAt: current.startedAt,
      finishedAt: new Date(finishedMs).toISOString(),
      questions: current.questions,
      answers: current.answers,
      flagged: current.flagged,
      elapsedSeconds,
      questionSeconds: current.questionSeconds,
      score: Math.round((correctCount / Math.max(1, scoredCount)) * 100),
    }
    saveExamAttempt(attempt)
    current.questions.forEach((question, index) => {
      if (current.answers[index] === null && (current.questionSeconds[index] ?? 0) <= 0 && !current.visited.includes(index)) return
      recordLearningEvent({
        type: 'assessment_answer',
        subjectId: question.subjectId || undefined,
        subject: question.subject || undefined,
        topicId: question.topicId || undefined,
        topic: question.topic || undefined,
        itemId: question.id,
        correct: !isAnswerVerified(question) || current.answers[index] === null ? undefined : current.answers[index] === question.correctIndex,
        durationSeconds: current.questionSeconds[index] ?? 0,
      })
    })
    recordLearningEvent({ type: 'assessment_complete', itemId: current.id, durationSeconds: elapsedSeconds })
    updateSession(null)
    setReviewAttemptId(attempt.id)
    setReviewOverride(attempt)
    setSearchReview('')
    setReviewFilter('all')
    setView('review')
  }, [updateSession])

  const endCurrentSession = useCallback((current: ExamSession, finishedMs: number) => {
    const deadline = current.sessionStartedAt + sessionDuration(current) * 1000
    const endedAt = Math.min(finishedMs, deadline)
    const questionSeconds = current.questionSeconds.slice()
    const lastQuestionElapsed = Math.max(0, Math.floor((endedAt - current.questionOpenedAt) / 1000))
    questionSeconds[current.currentIndex] = (questionSeconds[current.currentIndex] ?? 0) + lastQuestionElapsed
    const sessionElapsed = Math.min(sessionDuration(current), Math.max(0, Math.floor((endedAt - current.sessionStartedAt) / 1000)))
    const visited = Array.from(new Set([...current.visited, current.currentIndex]))

    if (current.mode === 'full_mock' && current.sessionIndex === 0) {
      updateSession({
        ...current,
        phase: 'break',
        sessionIndex: 0,
        breakStartedAt: endedAt,
        questionOpenedAt: endedAt,
        elapsedSeconds: current.elapsedSeconds + sessionElapsed,
        questionSeconds,
        visited,
      })
      setConfirmSubmit(false)
      setNowMs(endedAt)
      return
    }

    const adjusted = { ...current, questionSeconds, visited }
    finishAttempt(adjusted, endedAt)
    setConfirmSubmit(false)
  }, [finishAttempt, updateSession])

  const endCurrentSessionRef = useRef(endCurrentSession)
  useEffect(() => { endCurrentSessionRef.current = endCurrentSession }, [endCurrentSession])
  const hasTimeForAction = useCallback((current: ExamSession, now: number) => {
    if (current.phase !== 'taking') return false
    if (remainingSessionSeconds(current, now) > 0) return true
    endCurrentSessionRef.current(current, current.sessionStartedAt + sessionDuration(current) * 1000)
    return false
  }, [])

  useEffect(() => {
    if (loadedScopeKey !== scopeKey) return
    const intervalId = window.setInterval(() => {
      const now = Date.now()
      setNowMs(now)
      const current = sessionRef.current
      if (!current) return
      if (current.phase === 'break') {
        const breakEnd = (current.breakStartedAt ?? now) + BREAK_SECONDS * 1000
        if (now >= breakEnd) {
          const next: ExamSession = {
            ...current,
            phase: 'taking',
            sessionIndex: 1,
            currentIndex: QUESTIONS_PER_SESSION,
            sessionStartedAt: breakEnd,
            breakStartedAt: null,
            questionOpenedAt: breakEnd,
            visited: Array.from(new Set([...current.visited, QUESTIONS_PER_SESSION])),
          }
          updateSession(next)
        }
        return
      }
      if (remainingSessionSeconds(current, now) <= 0) {
        endCurrentSessionRef.current(current, current.sessionStartedAt + sessionDuration(current) * 1000)
        return
      }
      const elapsed = Math.floor((now - current.questionOpenedAt) / 1000)
      if (elapsed >= 1) {
        const questionSeconds = current.questionSeconds.slice()
        questionSeconds[current.currentIndex] = (questionSeconds[current.currentIndex] ?? 0) + elapsed
        updateSession({ ...current, questionSeconds, questionOpenedAt: current.questionOpenedAt + elapsed * 1000 })
      }
    }, 1000)
    return () => window.clearInterval(intervalId)
  }, [loadedScopeKey, scopeKey, updateSession])

  const beginSessionTwo = useCallback(() => {
    const current = sessionRef.current
    if (!current || current.phase !== 'break') return
    const now = Date.now()
    const breakEnd = (current.breakStartedAt ?? now) + BREAK_SECONDS * 1000
    const sessionTwoStart = Math.min(now, breakEnd)
    updateSession({
      ...current,
      phase: 'taking',
      sessionIndex: 1,
      currentIndex: QUESTIONS_PER_SESSION,
      sessionStartedAt: sessionTwoStart,
      breakStartedAt: null,
      questionOpenedAt: sessionTwoStart,
      visited: Array.from(new Set([...current.visited, QUESTIONS_PER_SESSION])),
    })
    setNowMs(now)
  }, [updateSession])

  const startQuickPractice = useCallback(() => {
    setSetupError(null)
    if (quickQuestions.length === 0) {
      setSetupError('This bank has no questions for the selected subject and chapter. Choose another bank or create questions with AI.')
      return
    }
    const count = Math.min(requiredCount, quickQuestions.length)
    const selectionLabel = topicId === 'all' ? currentSubject?.title ?? 'All subjects' : currentTopic?.title ?? 'Chapter'
    startQuiz({
      questions: quickQuestions,
      mode: quickBankId === 'built-in' ? topicId === 'all' ? 'custom' : 'chapter' : 'uploaded',
      title: `${selectionLabel} · ${selectedQuestionBank?.name ?? 'Quick practice'}`,
      requestedCount: count,
    })
  }, [quickQuestions, requiredCount, topicId, currentSubject, currentTopic, quickBankId, selectedQuestionBank, startQuiz])

  const startFullMock = useCallback(() => {
    setSetupError(null)
    if (!fullMockReady) {
      setSetupError('The full mock needs 90 mapped questions for each session, with the required CFA subject mix. The included bank does not currently have enough questions for that split.')
      return
    }
    startQuiz({ questions: PRACTICE_QUESTIONS, mode: 'full_mock', title: 'CFA Level I full mock', requestedCount: FULL_MOCK_QUESTIONS })
  }, [fullMockReady, startQuiz])

  const startImportedMock = useCallback(async (summary: ImportedMockSummary) => {
    if (!summary.ready || startingImportedMock || session) return
    setStartingImportedMock(summary.id)
    setSetupError(null)
    try {
      const response = await fetch(`/api/mocks/${encodeURIComponent(summary.id)}`, { cache: 'no-store' })
      const data = await response.json() as { mock?: Record<string, unknown>; error?: string }
      if (!response.ok || !data.mock) throw new Error(data.error ?? 'This mock could not be opened.')
      const detail = data.mock
      const title = typeof detail.title === 'string' ? detail.title : summary.title
      const sourceUrl = typeof detail.sourceUrl === 'string' ? detail.sourceUrl : summary.sourceUrl
      const detailCounts = Array.isArray(detail.sessionCounts) ? detail.sessionCounts : summary.sessionCounts
      const sessionCounts: [number, number] = [Number(detailCounts[0]), Number(detailCounts[1])]
      const rawQuestions = Array.isArray(detail.questions) ? detail.questions : []
      const complete = detail.complete === true
      if (detail.ready !== true) throw new Error('This paper is still being prepared and is not available to start.')
      if (sessionCounts.length !== 2 || sessionCounts.some((count) => !Number.isInteger(count) || count < 0)) {
        throw new Error('This paper has incomplete session details and cannot be opened yet.')
      }
      if (Number(detail.questionCount ?? rawQuestions.length) !== rawQuestions.length || rawQuestions.length !== sessionCounts[0] + sessionCounts[1]) {
        throw new Error('The available questions do not match this paper’s published session counts.')
      }
      if (complete && (rawQuestions.length !== FULL_MOCK_QUESTIONS || sessionCounts[0] !== QUESTIONS_PER_SESSION || sessionCounts[1] !== QUESTIONS_PER_SESSION)) {
        throw new Error('This paper is marked complete, but does not contain exactly 90 questions in each session.')
      }
      if (!complete && rawQuestions.length === 0) {
        throw new Error('No verified questions are available in this partial paper yet.')
      }
      const questions = rawQuestions.map((raw, index) => {
        if (!raw || typeof raw !== 'object') throw new Error(`Question ${index + 1} is missing.`)
        const question = raw as Record<string, unknown>
        const options = Array.isArray(question.options) ? question.options.map(String) : []
        const correctIndex = Number(question.correctIndex)
        const verifiedKeyIsValid = question.answerVerified === true && Number.isInteger(correctIndex) && correctIndex >= 0 && correctIndex < options.length
        const explicitlyUnscored = question.answerVerified === false && correctIndex === -1
        if (options.length < 2 || (!verifiedKeyIsValid && !explicitlyUnscored)) {
          throw new Error(`Question ${index + 1} must have a valid verified key or be explicitly marked unscored.`)
        }
        const sourceAssetUrls = Array.isArray(question.sourceAssetUrls)
          ? question.sourceAssetUrls.filter((url): url is string => typeof url === 'string' && url.length > 0)
          : typeof question.sourceAssetUrl === 'string' ? [question.sourceAssetUrl] : []
        const mapped = question as unknown as ImportedMockQuestion
        return {
          ...mapped,
          id: typeof question.id === 'string' ? question.id : `${summary.id}-q${index + 1}`,
          prompt: typeof question.prompt === 'string' ? question.prompt : '',
          options,
          correctIndex,
          rationale: typeof question.rationale === 'string' ? question.rationale : '',
          subjectId: typeof question.subjectId === 'string' ? question.subjectId : '',
          subject: typeof question.subject === 'string' ? question.subject : 'CFA Level I',
          topicId: typeof question.topicId === 'string' ? question.topicId : undefined,
          topic: typeof question.topic === 'string' ? question.topic : undefined,
          source: typeof question.source === 'string' ? question.source : title,
          sourceAssetUrl: sourceAssetUrls[0],
          sourceAssetUrls,
          sourcePdfUrl: typeof question.sourcePdfUrl === 'string' ? question.sourcePdfUrl : sourceUrl,
          mockId: summary.id,
          answerVerified: question.answerVerified === true,
        } satisfies ImportedMockQuestion
      })
      if (questions.some((question) => !question.prompt.trim())) throw new Error('A question is missing its searchable question text.')
      if (questions.some((question, index) => question.sourceSession && question.sourceSession !== (index < sessionCounts[0] ? 1 : 2))) {
        throw new Error('The source paper questions are not in the expected session order.')
      }
      startQuiz({ questions, mode: complete ? 'full_mock' : 'uploaded', title, requestedCount: questions.length, preserveOrder: true, sourceUrl })
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : 'This mock could not be opened.')
    } finally {
      setStartingImportedMock(null)
    }
  }, [startingImportedMock, session, startQuiz])

  const generateAndStart = useCallback(async (mode: 'chapter' | 'custom', count: number, target?: FocusPracticeTarget) => {
    setIsStarting(true)
    setFreshPracticeError(null)
    if (!target) setSetupError(null)
    const requestMode = target ? 'chapter' : mode
    const requestSubjectId = target?.subjectId ?? subjectId
    const requestTopicId = target?.topicId ?? topicId
    const requestSubject = cfaLevel1Syllabus.find((subject) => subject.id === requestSubjectId)
    const requestTopic = requestSubject?.topics.find((topic) => topic.id === requestTopicId)
    try {
      const response = await fetch('/api/exam/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: requestMode,
          subjectId: requestSubjectId === 'all' ? undefined : requestSubjectId,
          topicId: requestMode === 'chapter' ? requestTopicId : undefined,
          count,
          focusConcept: target?.focusConcept,
          practiceTask: target?.practiceTask,
        }),
      })
      const data = (await response.json()) as GenerateResponse
      if (!response.ok) throw new Error(data.error ?? 'Question generation could not be completed.')
      const generated = cleanQuestions((data.questions ?? []).flatMap((question) => {
        const mapped = questionFromGenerated(question, {
          subjectId: requestSubjectId === 'all' ? null : requestSubjectId,
          topicId: requestMode === 'chapter' ? requestTopicId : null,
          source: data.source ?? 'GPT-6 Luna generated',
        })
        return mapped ? [mapped] : []
      }))
      if (generated.length < count) {
        const error = `Only ${generated.length} distinct questions were returned. The requested set needs ${count}; no partial set was started.`
        if (target) setFreshPracticeError(error)
        else setSetupError(error)
        return
      }
      const label = requestTopicId === 'all' ? requestSubject?.title ?? 'CFA Level I' : requestTopic?.title ?? 'Chapter'
      const attemptQuestions = generated.map((question) => ({
        ...question,
        source: question.source || data.source || 'AI-generated practice',
      }))
      if (localBankStorageKey) {
        try {
          const localGenerated = attemptQuestions.map((question) => ({ ...question, source: 'generated-local' }))
          const mergedQuestions = cleanQuestionBanks([...localSavedQuestions, ...localGenerated])
          window.localStorage.setItem(localBankStorageKey, JSON.stringify(mergedQuestions))
          setLocalSavedQuestions(mergedQuestions)
        } catch {
          setLocalBankError('The questions were created, but this device could not save them for later.')
        }
      }
      startQuiz({ questions: attemptQuestions, mode: requestTopicId === 'all' ? 'custom' : 'chapter', title: target ? `${label} · New focus drill` : `${label} · Quick practice`, requestedCount: count })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not prepare this practice session.'
      if (target) setFreshPracticeError(message)
      else setSetupError(message)
    } finally {
      setIsStarting(false)
    }
  }, [subjectId, topicId, startQuiz, localSavedQuestions, localBankStorageKey])

  const reviewAttempt = useCallback((attempt: ExamAttempt) => {
    setReviewAttemptId(attempt.id)
    setReviewOverride(null)
    setSearchReview('')
    setReviewFilter('all')
    setView('review')
  }, [])

  const startRetryQuestions = useCallback((questions: ExamQuestion[], title: string, preserveOrder = false) => {
    const unique = preserveOrder ? questions : cleanQuestions(questions)
    if (unique.length === 0) return
    const now = Date.now()
    const session: ExamSession = {
      id: newId(),
      title,
      mode: 'retry',
      questions: unique,
      answers: new Array(unique.length).fill(null),
      visited: [0],
      flagged: [],
      eliminatedOptions: unique.map(() => []),
      highlighted: [],
      currentIndex: 0,
      startedAt: new Date(now).toISOString(),
      phase: 'taking',
      sessionIndex: 0,
      sessionStartedAt: now,
      breakStartedAt: null,
      questionOpenedAt: now,
      elapsedSeconds: 0,
      questionSeconds: unique.map(() => 0),
    }
    setSetupError(null)
    setReviewOverride(null)
    updateSession(session)
    setView('exam')
    setNowMs(now)
  }, [updateSession])

  const retryMistakes = useCallback(() => {
    if (retryQuestions.length === 0) return
    startRetryQuestions(retryQuestions, `Retry mistakes · ${retryQuestions.length} questions`)
  }, [retryQuestions, startRetryQuestions])

  const retryMissed = useCallback((attempt: ExamAttempt) => {
    const missed = getMissedQuestions(attempt)
    if (missed.length === 0) return
    startRetryQuestions(missed, `Retry missed questions · ${attempt.title}`, true)
  }, [startRetryQuestions])

  const startTopicDrill = useCallback((topic: TopicDiagnostic) => {
    if (!activeReview) return
    const questionIds = new Set([...topic.wrongQuestionIds, ...topic.unansweredQuestionIds])
    const questions = activeReview.questions.filter((question) => questionIds.has(question.id) && isAnswerVerified(question))
    if (questions.length === 0) return
    startRetryQuestions(questions, `${topic.topic} · missed-question practice`, true)
  }, [activeReview, startRetryQuestions])

  const jumpToQuestion = useCallback((index: number) => {
    const current = sessionRef.current
    if (!current) return
    const now = Date.now()
    if (!hasTimeForAction(current, now)) return
    const range = sessionQuestionRange(current)
    if (index < range.start || index >= range.end || index === current.currentIndex) return
    const elapsed = Math.max(0, Math.floor((now - current.questionOpenedAt) / 1000))
    const questionSeconds = current.questionSeconds.slice()
    questionSeconds[current.currentIndex] = (questionSeconds[current.currentIndex] ?? 0) + elapsed
    updateSession({ ...current, currentIndex: index, questionSeconds, questionOpenedAt: now, visited: Array.from(new Set([...current.visited, index])) })
  }, [hasTimeForAction, updateSession])

  const goRelative = useCallback((direction: -1 | 1) => {
    const current = sessionRef.current
    if (!current) return
    const range = sessionQuestionRange(current)
    jumpToQuestion(Math.max(range.start, Math.min(range.end - 1, current.currentIndex + direction)))
  }, [jumpToQuestion])

  const changeAnswer = useCallback((answerIndex: number) => {
    const current = sessionRef.current
    if (!current || !hasTimeForAction(current, Date.now())) return
    const answers = current.answers.slice()
    answers[current.currentIndex] = answerIndex
    updateSession({ ...current, answers, visited: Array.from(new Set([...current.visited, current.currentIndex])) })
  }, [hasTimeForAction, updateSession])

  const toggleFlag = useCallback(() => {
    const current = sessionRef.current
    if (!current || !hasTimeForAction(current, Date.now())) return
    const flagged = current.flagged.includes(current.currentIndex)
      ? current.flagged.filter((index) => index !== current.currentIndex)
      : [...current.flagged, current.currentIndex]
    updateSession({ ...current, flagged, visited: Array.from(new Set([...current.visited, current.currentIndex])) })
  }, [hasTimeForAction, updateSession])

  const toggleEliminated = useCallback((optionIndex: number) => {
    const current = sessionRef.current
    if (!current || !hasTimeForAction(current, Date.now())) return
    const eliminatedOptions = current.eliminatedOptions.map((item) => item.slice())
    const questionOptions = eliminatedOptions[current.currentIndex] ?? []
    eliminatedOptions[current.currentIndex] = questionOptions.includes(optionIndex)
      ? questionOptions.filter((index) => index !== optionIndex)
      : [...questionOptions, optionIndex]
    updateSession({ ...current, eliminatedOptions, visited: Array.from(new Set([...current.visited, current.currentIndex])) })
  }, [hasTimeForAction, updateSession])

  const toggleHighlight = useCallback(() => {
    const current = sessionRef.current
    if (!current || !hasTimeForAction(current, Date.now())) return
    const highlighted = current.highlighted.includes(current.currentIndex)
      ? current.highlighted.filter((index) => index !== current.currentIndex)
      : [...current.highlighted, current.currentIndex]
    updateSession({ ...current, highlighted, visited: Array.from(new Set([...current.visited, current.currentIndex])) })
  }, [hasTimeForAction, updateSession])

  const submitCurrentSession = useCallback(() => {
    const current = sessionRef.current
    if (!current || current.phase !== 'taking') return
    endCurrentSession(current, Date.now())
  }, [endCurrentSession])

  const closeExam = useCallback(() => {
    setConfirmExit(false)
    setView('setup')
  }, [])

  const resumeSession = useCallback(() => {
    if (!sessionRef.current) return
    setView('exam')
    setNowMs(Date.now())
  }, [])

  const discardSession = useCallback(() => {
    setConfirmExit(false)
    updateSession(null)
    setView('setup')
  }, [updateSession])

  const sortedAttempts = useMemo(() => attempts.slice().sort((a, b) => new Date(b.finishedAt).getTime() - new Date(a.finishedAt).getTime()), [attempts])
  const currentQuestion = session?.questions[session.currentIndex]
  const currentRange = session ? sessionQuestionRange(session) : null
  const currentAnswered = session ? session.answers[session.currentIndex] !== null : false
  const answeredInCurrentSession = session && currentRange
    ? session.answers.slice(currentRange.start, currentRange.end).filter((answer) => answer !== null).length
    : 0
  const remaining = session?.phase === 'taking' ? remainingSessionSeconds(session, nowMs) : 0
  const breakRemaining = session?.phase === 'break' && session.breakStartedAt
    ? Math.max(0, BREAK_SECONDS - Math.floor((nowMs - session.breakStartedAt) / 1000))
    : 0
  const attemptCorrectCount = activeReview ? countCorrectAnswers(activeReview) : 0
  const scoredQuestionCount = activeReview ? countScoredQuestions(activeReview) : 0
  const deterministicDiagnostic = useMemo<ExamDiagnostic | null>(() => activeReview ? buildExamDiagnostic(activeReview) : null, [activeReview])
  const activeAnalysisState = activeReview ? analysisStates[activeReview.id] : undefined
  const reviewIndices = useMemo(() => {
    if (!activeReview) return [] as number[]
    const query = searchReview.trim().toLowerCase()
    return activeReview.questions.map((_, index) => index).filter((index) => {
      const question = activeReview.questions[index]
      const answer = activeReview.answers[index]
      if (reviewFilter === 'incorrect' && (!isAnswerVerified(question) || answer === question.correctIndex)) return false
      if (reviewFilter === 'unanswered' && answer !== null) return false
      if (!query) return true
      const searchText = [question.prompt, question.subject, question.topic, question.rationale, ...question.options].filter(Boolean).join(' ').toLowerCase()
      return searchText.includes(query)
    })
  }, [activeReview, searchReview, reviewFilter])
  const activeReviewPdfUrls = activeReview
    ? Array.from(new Set(activeReview.questions.map((question) => (question as ImportedMockQuestion).sourcePdfUrl).filter((url): url is string => Boolean(url))))
    : []

  const submitUnansweredCount = session && currentRange
    ? session.answers.slice(currentRange.start, currentRange.end).filter((answer) => answer === null).length
    : 0

  if (!ready || loadedScopeKey !== scopeKey) {
    return (
      <div className="flex min-h-[58vh] items-center justify-center rounded-3xl border border-slate-200 bg-white text-slate-600">
        <LoaderCircle size={20} className="mr-3 animate-spin text-blue-700" />
        Loading your exam workspace…
      </div>
    )
  }

  if (view === 'exam' && session && session.phase === 'break') {
    return (
      <main className="h-dvh overflow-y-auto bg-slate-50 p-4 sm:p-8"><div className="mx-auto max-w-5xl space-y-5">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between bg-slate-950 px-5 py-4 text-white sm:px-7">
            <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-700"><Clock3 size={19} /></div><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-200">Session 1 complete</p><p className="mt-0.5 text-sm font-medium">{session.title}</p></div></div>
            <button type="button" onClick={() => setConfirmExit(true)} className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-white/85 hover:bg-white/10"><LogOut size={14} /> Exit exam</button>
          </div>
          <div className="grid gap-8 p-6 sm:p-10 md:grid-cols-[1fr_260px] md:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">Optional break · up to 30 minutes</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Take a breather.</h1>
              <p className="mt-4 max-w-xl text-sm leading-7 text-slate-600">Your answers from the first 90 questions are saved. Start session 2 when you are ready. If you leave the break running, session 2 begins automatically when the 30-minute window ends.</p>
              <button type="button" onClick={beginSessionTwo} className="mt-7 inline-flex items-center gap-2 rounded-xl bg-blue-800 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-900"><Play size={16} /> Begin session 2 now</button>
            </div>
            <div className="rounded-3xl border border-blue-100 bg-blue-50 p-6 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Break time remaining</p>
              <p className="mt-3 font-mono text-4xl font-semibold tabular-nums text-slate-950">{formatTime(breakRemaining)}</p>
              <p className="mt-3 text-xs leading-5 text-slate-500">Session 2 has its own 2 hour 15 minute timer.</p>
            </div>
          </div>
        </div>
        {confirmExit ? <ExamModal title="Leave this exam?" body="Your current session and answers stay saved on this device. Leaving does not submit your exam." primaryLabel="Save and leave" secondaryLabel="Stay here" onPrimary={closeExam} onClose={() => setConfirmExit(false)} /> : null}
      </div></main>
    )
  }

  if (view === 'exam' && session && currentQuestion && currentRange) {
    const isFlagged = session.flagged.includes(session.currentIndex)
    const isHighlighted = session.highlighted.includes(session.currentIndex)
    const eliminated = session.eliminatedOptions[session.currentIndex] ?? []
    const importedQuestion = currentQuestion as ImportedMockQuestion
    const sourceImages = importedQuestion.sourceAssetUrls ?? (importedQuestion.sourceAssetUrl ? [importedQuestion.sourceAssetUrl] : [])
    const hasNativeContent = Array.isArray(currentQuestion.content) && currentQuestion.content.length > 0
    const useLegacySourceFallback = !hasNativeContent && sourceImages.length > 0 && legacyRestoredSessionIds.current.has(session.id)
    const isSessionLastQuestion = session.currentIndex === currentRange.end - 1
    const sectionLabel = session.mode === 'full_mock' ? `Section ${session.sessionIndex + 1} of 2` : 'Practice section'
    const progressPercent = Math.round((answeredInCurrentSession / Math.max(1, currentRange.end - currentRange.start)) * 100)
    const answerChoices = (
      <div className={portal.options}>
        {currentQuestion.options.map((option, optionIndex) => {
          const selected = session.answers[session.currentIndex] === optionIndex
          const crossedOut = eliminated.includes(optionIndex)
          return (
            <div key={`${currentQuestion.id}-${optionIndex}`} className={portal.optionItem}>
              <span className={portal.optionLetter}>{String.fromCharCode(65 + optionIndex)}.</span>
              <div className={cn(portal.optionRow, selected && portal.optionSelected)}>
                <button type="button" aria-pressed={selected} onClick={() => changeAnswer(optionIndex)} aria-label={`${String.fromCharCode(65 + optionIndex)}. ${option}`} className={portal.optionButton}>
                  <span className={cn('min-w-0 flex-1', crossedOut && 'text-slate-400 line-through')}><InlineQuestionText text={option} /></span>
                  {selected ? <Check size={17} className="shrink-0 text-[#577f2c]" /> : null}
                </button>
                <button type="button" aria-pressed={crossedOut} aria-label={`${crossedOut ? 'Restore' : 'Strike out'} option ${String.fromCharCode(65 + optionIndex)}`} onClick={() => toggleEliminated(optionIndex)} className={cn(portal.strikeButton, crossedOut && portal.strikeButtonOn)}><X size={15} /></button>
              </div>
            </div>
          )
        })}
      </div>
    )

    return (
      <main className={portal.root} data-exam-stage>
        <header className={portal.header}>
          <div className={portal.headerMeta}>
            <div className={portal.headerLine}><span>Question {session.currentIndex + 1}</span><span>{sectionLabel}</span><span className="hidden sm:inline">{currentQuestion.subject}{currentQuestion.topic ? ` · ${currentQuestion.topic}` : ''}</span></div>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-4">
            <div className="hidden items-center gap-2 text-[11px] text-white/90 sm:flex"><Timer size={16} /><span>Section Time Remaining</span></div>
            <span className={cn('min-w-[69px] text-center font-mono text-sm font-bold tabular-nums sm:min-w-[80px]', remaining <= 300 ? 'text-amber-200' : 'text-white')} aria-live="polite">{formatTime(remaining)}</span>
            <button type="button" onClick={() => void toggleFullscreen()} aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Enter fullscreen'} className="inline-flex h-9 w-9 items-center justify-center text-white/90 hover:bg-white/10">{isFullscreen ? <Minimize size={17} /> : <Maximize size={17} />}</button>
            <div className="flex items-center gap-1.5" aria-label={`Section answer progress ${progressPercent}%`}><span className={portal.progress} role="progressbar" aria-label="Section answer progress" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progressPercent}%` }} /></span><span className={portal.progressLabel}>{progressPercent}%</span></div>
            <button type="button" onClick={() => setConfirmSubmit(true)} className={portal.finishButton}>Finish Test</button>
            <button type="button" onClick={() => setConfirmExit(true)} aria-label="Save and leave exam" title="Save and leave exam" className="inline-flex h-9 w-9 items-center justify-center text-white/90 hover:bg-white/10"><LogOut size={16} /></button>
          </div>
        </header>
        <div className={portal.testStrip}><span className="truncate">Study Table · {session.title}</span><span className="shrink-0">Candidate: Practice</span></div>
        {fullscreenError ? <p role="status" className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">{fullscreenError}</p> : null}
        {nativeLoadErrors.length > 0 ? <p role="status" className={portal.loadError}>Latest question text could not be loaded for {nativeLoadErrors.join('; ')}. Saved questions remain available with their existing content.</p> : null}
        <div className={portal.contentRow}>
          {navigatorOpen ? <button type="button" aria-label="Close question navigator" onClick={() => { setNavigatorOpen(false); navigatorToggleRef.current?.focus() }} className="fixed inset-0 z-50 bg-slate-950/40 md:hidden" /> : null}
          <aside ref={navigatorRef} id="exam-question-navigator" aria-label="Question navigator" role={navigatorOpen ? 'dialog' : undefined} aria-modal={navigatorOpen || undefined} className={cn(portal.navigator, navigatorOpen ? portal.navigatorOpen : portal.navigatorClosed)}>
            <div className="flex shrink-0 items-center justify-between"><span className={portal.navigatorTitle}>Questions</span><button ref={navigatorCloseRef} type="button" aria-label="Close question navigator" onClick={() => { setNavigatorOpen(false); navigatorToggleRef.current?.focus() }} className="rounded p-1 text-slate-600 md:hidden"><X size={17} /></button></div>
            <div className="grid auto-rows-min grid-cols-2 gap-1.5 overflow-y-auto md:grid-cols-1" data-navigator-grid>
              {Array.from({ length: currentRange.end - currentRange.start }, (_, offset) => currentRange.start + offset).map((index) => {
                const isCurrent = index === session.currentIndex
                const answered = session.answers[index] !== null
                const flagged = session.flagged.includes(index)
                return <button key={index} type="button" onClick={() => { jumpToQuestion(index); setNavigatorOpen(false); navigatorToggleRef.current?.focus() }} aria-current={isCurrent ? 'step' : undefined} aria-label={`Question ${index + 1}${answered ? ', answered' : ', unanswered'}${flagged ? ', flagged' : ''}`} className={cn(portal.navButton, isCurrent && portal.navButtonCurrent, answered && !isCurrent && portal.navButtonAnswered, flagged && !isCurrent && portal.navButtonFlagged)}>{index + 1}{flagged ? <span className={portal.navFlag}><Flag size={11} fill="currentColor" /></span> : null}</button>
              })}
            </div>
          </aside>
          <section ref={questionPaneRef} aria-label="Exam question" tabIndex={0} className={portal.questionPane} data-question-pane>
            <div className={portal.questionInner}>
              {currentQuestion.nativeTranscription?.status === 'needs_review' ? <details className={portal.nativeNote}><summary className="cursor-pointer font-semibold">Question text needs a source check</summary>{currentQuestion.nativeTranscription.notes.length ? <ul className="mt-2 list-disc space-y-1 pl-5">{currentQuestion.nativeTranscription.notes.map((note, index) => <li key={index}>{note}</li>)}</ul> : <p className="mt-2">No transcription notes were included.</p>}</details> : null}
              {useLegacySourceFallback ? <div className="mb-4 space-y-3" aria-label="Original source fallback">{sourceImages.map((src, imageIndex) => <figure key={`${currentQuestion.id}-source-${imageIndex}`} className={cn('overflow-hidden border bg-white', isHighlighted ? 'border-amber-300 ring-2 ring-amber-200' : 'border-slate-300')}><Image src={src} alt={`Source page for question ${importedQuestion.sourceQuestionNumber ?? session.currentIndex + 1}${sourceImages.length > 1 ? `, part ${imageIndex + 1}` : ''}`} width={1000} height={1400} unoptimized className="mx-auto h-auto w-full max-w-[1000px] object-contain" /><figcaption className="border-t border-slate-200 px-3 py-2 text-right"><a href={src} target="_blank" rel="noreferrer" className={portal.sourceLink}><ExternalLink size={12} className="mr-1 inline" />Open source crop</a></figcaption></figure>)}</div> : null}
              {hasNativeContent ? <div className={cn(isHighlighted && 'rounded-sm bg-amber-100 p-2 ring-1 ring-amber-200')}><QuestionContent blocks={currentQuestion.content ?? []} /></div> : <div className={cn(portal.questionPrompt, isHighlighted && 'bg-amber-100 ring-1 ring-amber-200')}><InlineQuestionText text={currentQuestion.prompt} /></div>}
              {sourceImages.length > 0 && !useLegacySourceFallback ? <details className={portal.sourceDetails}><summary className="cursor-pointer text-xs font-semibold text-slate-600">View source crop</summary><div className="mt-3 flex flex-wrap gap-2">{sourceImages.map((src, index) => <a key={src} href={src} target="_blank" rel="noreferrer" className={portal.sourceLink} aria-label={`Open source crop ${index + 1}`}>Source crop {index + 1} <ExternalLink size={12} className="ml-1 inline" /></a>)}</div></details> : null}
              {answerChoices}
              <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3 text-xs text-slate-500"><span>{currentQuestion.subject}{currentQuestion.topic ? ` · ${currentQuestion.topic}` : ''}</span><span>{currentAnswered ? 'Answer selected' : 'Not answered'}</span></div>
            </div>
          </section>
        </div>
        <footer className={portal.footer} style={{ paddingBottom: 'max(6px, env(safe-area-inset-bottom))' }} aria-label="Exam controls" data-exam-controls>
          <div className={portal.footerLeft}>
            <button ref={navigatorToggleRef} type="button" onClick={() => setNavigatorOpen(true)} aria-expanded={navigatorOpen} aria-controls="exam-question-navigator" aria-label={`Open question navigator, question ${session.currentIndex + 1}`} className={portal.iconButton}><FileQuestion size={18} /></button>
            <button type="button" onClick={toggleHighlight} aria-pressed={isHighlighted} aria-label={isHighlighted ? 'Turn off question highlight' : 'Highlight question text'} title={isHighlighted ? 'Highlight on' : 'Highlight question'} className={cn(portal.iconButton, isHighlighted && portal.iconButtonHighlight)}><Highlighter size={17} /></button>
            <span className={portal.footerText}>{answeredInCurrentSession} / {currentRange.end - currentRange.start} answered</span>
          </div>
          <div className={portal.footerRight}>
            <button type="button" onClick={toggleFlag} aria-pressed={isFlagged} aria-label={isFlagged ? 'Remove flag from question' : 'Flag question for review'} title={isFlagged ? 'Flagged for review' : 'Flag question'} className={cn(portal.iconButton, portal.iconButtonFlag, isFlagged && portal.iconButtonFlagged)}><Flag size={16} fill={isFlagged ? 'currentColor' : 'none'} /></button>
            <button type="button" onClick={() => goRelative(-1)} disabled={session.currentIndex <= currentRange.start} className={portal.footerButton}><ChevronLeft size={15} />Back</button>
            <button type="button" onClick={() => goRelative(1)} disabled={isSessionLastQuestion} className={portal.footerButton}>Next<ChevronDown size={15} className="-rotate-90" /></button>
          </div>
        </footer>
        {confirmSubmit ? (
          <ExamModal
            title={session.mode === 'full_mock' && session.sessionIndex === 0 ? 'End session 1?' : 'Submit this exam?'}
            body={session.mode === 'full_mock' && session.sessionIndex === 0
              ? <><p>You have answered {answeredInCurrentSession} of 90 questions. {submitUnansweredCount > 0 ? `${submitUnansweredCount} questions in this session are unanswered.` : 'All questions in this session have an answer.'}</p><p className="mt-2">After ending the session, your answers are locked. You can take an optional break of up to 30 minutes before session 2.</p></>
              : <><p>{submitUnansweredCount > 0 ? `${submitUnansweredCount} questions are unanswered.` : 'All questions have an answer.'} Submitting records your score and opens rationale review.</p><p className="mt-2">This cannot be undone.</p></>}
            primaryLabel={session.mode === 'full_mock' && session.sessionIndex === 0 ? 'End session 1' : 'Submit exam'}
            secondaryLabel="Continue exam"
            onPrimary={submitCurrentSession}
            onClose={() => setConfirmSubmit(false)}
          />
        ) : null}
        {confirmExit ? <ExamModal title="Save and leave exam?" body="Your answers, flags, timer, and question timing are saved on this device. The exam will remain in progress and will not be submitted." primaryLabel="Save and leave" secondaryLabel="Stay in exam" onPrimary={closeExam} onClose={() => setConfirmExit(false)} /> : null}
      </main>
    )
  }

  if (view === 'review' && activeReview) {
    const wrongCount = getMissedQuestions(activeReview).length
    const percent = scoredQuestionCount > 0 ? Math.round((attemptCorrectCount / scoredQuestionCount) * 100) : 0
    const unscoredQuestionCount = activeReview.questions.length - scoredQuestionCount
    const subjectRows = cfaLevel1Syllabus.map((subject) => {
      const indices = activeReview.questions.map((question, index) => question.subjectId === subject.id && isAnswerVerified(question) ? index : -1).filter((index) => index >= 0)
      const correct = indices.filter((index) => activeReview.answers[index] === activeReview.questions[index].correctIndex).length
      return { subject, total: indices.length, correct }
    }).filter((row) => row.total > 0)

    return (
      <main className="mx-auto max-w-6xl space-y-5">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 bg-[#10284b] px-5 py-5 text-white sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <div className="flex items-start gap-3"><button type="button" onClick={() => setView('setup')} aria-label="Back to mocks" className="mt-0.5 rounded-lg p-2 text-blue-100 hover:bg-white/10"><ArrowLeft size={17} /></button><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-200">Assessment review</p><h1 className="mt-1 text-xl font-semibold sm:text-2xl">{activeReview.title}</h1><p className="mt-1 text-xs text-blue-100/75">Completed {formatAttemptDate(activeReview.finishedAt)}</p></div></div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">{activeReviewPdfUrls.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"><FileQuestion size={14} />{activeReviewPdfUrls.length > 1 ? `Original PDF ${index + 1}` : 'Open original PDF'}</a>)}<span className="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold">{percent}% · {attemptCorrectCount}/{scoredQuestionCount} scored</span>{unscoredQuestionCount > 0 ? <span className="rounded-xl bg-white/10 px-3 py-2 text-xs font-medium">{unscoredQuestionCount} unscored</span> : null}<button type="button" onClick={() => retryMissed(activeReview)} disabled={wrongCount === 0} className="inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-2.5 text-xs font-bold text-blue-900 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"><RotateCcw size={14} /> Retry missed ({wrongCount})</button></div>
          </div>
          <div className="grid gap-3 border-b border-slate-200 bg-slate-50 p-4 sm:grid-cols-3 sm:p-5">
            <div className="rounded-xl border border-slate-200 bg-white p-3.5"><p className="text-xs text-slate-500">Time used</p><p className="mt-1 text-lg font-semibold text-slate-900">{formatDuration(activeReview.elapsedSeconds)}</p></div>
            <div className="rounded-xl border border-slate-200 bg-white p-3.5"><p className="text-xs text-slate-500">Paper score</p><p className="mt-1 text-lg font-semibold text-slate-900">{percent}%</p></div>
            <div className="rounded-xl border border-slate-200 bg-white p-3.5"><p className="text-xs text-slate-500">Flagged for review</p><p className="mt-1 text-lg font-semibold text-slate-900">{activeReview.flagged.length} questions</p></div>
          </div>
        {nativeLoadErrors.length > 0 ? <p role="status" className={portal.loadError}>Latest question text could not be loaded for {nativeLoadErrors.join('; ')}. Saved questions remain available with their existing content.</p> : null}
          {subjectRows.length > 1 ? <div className="flex flex-wrap gap-2 border-b border-slate-200 px-4 py-3 sm:px-5">{subjectRows.map(({ subject, total, correct }) => <span key={subject.id} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-medium text-slate-600">{subject.title}: <span className="font-bold text-slate-900">{correct}/{total}</span></span>)}</div> : null}
        </div>

        {deterministicDiagnostic ? <ExamDiagnosticPanel
          attempt={activeReview}
          diagnostic={deterministicDiagnostic}
          analysisState={activeAnalysisState}
          onRetryAnalysis={() => {
            requestedAnalysisIds.current.delete(activeReview.id)
            void requestAttemptAnalysis(activeReview)
          }}
          onTopicPractice={startTopicDrill}
          onFreshPractice={(focus) => void generateAndStart('chapter', 5, {
            subjectId: focus.subjectId,
            topicId: focus.topicId,
            focusConcept: focus.concept,
            practiceTask: focus.practiceTask,
          })}
          isGeneratingPractice={isStarting}
          freshPracticeError={freshPracticeError}
        /> : null}

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="text-lg font-semibold text-slate-950">Answer review</h2><p className="mt-1 text-xs text-slate-500">Correct answers and rationales are shown after submission.</p></div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={searchReview} onChange={(event) => setSearchReview(event.target.value)} placeholder="Search questions or rationale" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-600 sm:w-64" /></label>
              <select value={reviewFilter} onChange={(event) => setReviewFilter(event.target.value as typeof reviewFilter)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-blue-600"><option value="all">All questions</option><option value="incorrect">Incorrect or unanswered</option><option value="unanswered">Unanswered</option></select>
            </div>
          </div>
          {reviewIndices.length === 0 ? <div className="py-12 text-center text-sm text-slate-500">No questions match this search.</div> : (
            <div className="mt-4 space-y-3">
              {reviewIndices.map((index) => {
                const question = activeReview.questions[index]
                const sourceQuestion = question as ImportedMockQuestion
                const verified = isAnswerVerified(question)
                const answer = activeReview.answers[index]
                const correct = verified && answer === question.correctIndex
                const open = loadedQuestionOpen === index
                const sourceAssets = sourceQuestion.sourceAssetUrls ?? (sourceQuestion.sourceAssetUrl ? [sourceQuestion.sourceAssetUrl] : [])
                const previewText = question.content?.find((block) => block.type === 'paragraph')?.text ?? question.prompt
                return (
                  <article key={`${activeReview.id}-${question.id}-${index}`} className={cn('overflow-hidden rounded-2xl border', !verified || answer === null ? 'border-slate-200' : correct ? 'border-emerald-200' : 'border-rose-200')}>
                    <button type="button" aria-expanded={open} onClick={() => setLoadedQuestionOpen(open ? null : index)} className="flex w-full items-start justify-between gap-4 p-4 text-left sm:p-5">
                      <span className="min-w-0"><span className="flex flex-wrap items-center gap-2"><span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">{sourceQuestion.sourceSession ? `S${sourceQuestion.sourceSession} · ` : ''}Q{sourceQuestion.sourceQuestionNumber ?? index + 1}</span><span className="text-[11px] text-slate-500">{question.subject}{question.topic ? ` · ${question.topic}` : ''}</span></span><span className="mt-2 block text-sm font-medium leading-6 text-slate-900"><InlineQuestionText text={previewText} /></span></span>
                      <span className={cn('mt-1 flex shrink-0 items-center gap-1 text-[11px] font-semibold', !verified ? 'text-slate-500' : answer === null ? 'text-slate-500' : correct ? 'text-emerald-700' : 'text-rose-700')}>{!verified ? <AlertCircle size={14} /> : answer === null ? <AlertCircle size={14} /> : correct ? <CheckCircle2 size={14} /> : <XCircle size={14} />}{!verified ? 'Not scored' : answer === null ? 'Unanswered' : correct ? 'Correct' : 'Incorrect'}<ChevronDown size={14} className={cn('ml-1 transition-transform', open && 'rotate-180')} /></span>
                    </button>
                    {open ? (
                      <div className="border-t border-slate-100 bg-slate-50/70 p-4 sm:p-5">
                        {question.nativeTranscription?.status === 'needs_review' ? <details className="mb-3 text-xs text-amber-800"><summary className="cursor-pointer font-semibold">Question text needs a source check</summary>{question.nativeTranscription.notes.length ? <ul className="mt-2 list-disc space-y-1 pl-5">{question.nativeTranscription.notes.map((note, noteIndex) => <li key={noteIndex}>{note}</li>)}</ul> : <p className="mt-2">No transcription notes were included.</p>}</details> : null}
                        {Array.isArray(question.content) && question.content.length > 0 ? <QuestionContent blocks={question.content} /> : null}
                        {sourceAssets.length > 0 ? <details className="my-3 rounded border border-slate-200 bg-white px-3 py-2"><summary className="cursor-pointer text-xs font-semibold text-slate-700">View source crop</summary><div className="mt-2 flex flex-wrap gap-3">{sourceAssets.map((src, imageIndex) => <a key={src} href={src} target="_blank" rel="noreferrer" className="text-xs font-semibold text-[#456d22] underline">Source crop {imageIndex + 1} <ExternalLink size={12} className="inline" /></a>)}</div></details> : null}
                        <div className="space-y-2">{question.options.map((option, optionIndex) => <div key={optionIndex} className={cn('flex items-start gap-2 rounded border px-3 py-2.5 text-sm leading-6', verified && optionIndex === question.correctIndex ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : verified && optionIndex === answer ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-slate-200 bg-white text-slate-600')}><span className="font-bold">{String.fromCharCode(65 + optionIndex)}.</span><span className="flex-1"><InlineQuestionText text={option} /></span>{verified && optionIndex === question.correctIndex ? <Check size={15} className="mt-1 shrink-0" /> : verified && optionIndex === answer ? <X size={15} className="mt-1 shrink-0" /> : null}</div>)}</div>
                        {verified ? <><div className="mt-4 rounded border border-blue-100 bg-blue-50 px-4 py-3"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-800">Rationale</p><p className="mt-1.5 text-sm leading-6 text-slate-700"><InlineQuestionText text={question.rationale || 'No rationale was included with this question.'} /></p></div><p className="mt-3 text-xs text-slate-500">Your answer: <span className="font-semibold text-slate-700">{answer === null ? 'No answer' : <><InlineQuestionText text={`${String.fromCharCode(65 + answer)}. ${question.options[answer]}`} /></>}</span> · Correct: <span className="font-semibold text-slate-700"><InlineQuestionText text={`${String.fromCharCode(65 + question.correctIndex)}. ${question.options[question.correctIndex]}`} /></span></p></> : <p className="mt-3 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-xs text-slate-700">{question.unscoredReason ?? 'Answer key unavailable or inconsistent; excluded from score.'}</p>}
                      </div>
                    ) : null}
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </main>
    )
  }

  const attemptCount = sortedAttempts.length

  return (
    <main className="mx-auto max-w-6xl space-y-6 pb-8">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-4 bg-gradient-to-r from-[#10284b] via-[#153866] to-[#1d4c7e] p-4 text-white sm:gap-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-blue-100"><GraduationCap size={14} /> Mocks & Assessments</div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:mt-4 sm:text-4xl">Practice under exam conditions.</h1>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-blue-100/85 sm:mt-3 sm:text-base sm:leading-6">Take a timed CFA Level I mock or practise a chapter. Answers and question timings save as you work.</p>
          </div>
          <div className="hidden grid-cols-2 gap-2 sm:grid sm:min-w-[280px]">
            <div className="rounded-2xl border border-white/15 bg-white/10 p-3.5"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-100/70">Full mock</p><p className="mt-1 text-sm font-semibold">2 × 90 questions</p></div>
            <div className="rounded-2xl border border-white/15 bg-white/10 p-3.5"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-100/70">Session time</p><p className="mt-1 text-sm font-semibold">2 hr 15 min each</p></div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2.5 sm:gap-3 sm:px-8 sm:py-3.5">
          <div className="flex items-center gap-2 text-xs text-slate-600"><ShieldCheck size={15} className="text-blue-700" /><span>Exam-like timer, question flags, navigation, and answer review</span></div>
          <span className="text-xs font-medium text-slate-500">{attemptCount} completed {attemptCount === 1 ? 'attempt' : 'attempts'}</span>
        </div>
      </section>

      {session ? (
        <section className="flex flex-col gap-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-800 text-white"><Play size={17} /></div><div><p className="text-sm font-semibold text-slate-950">An exam is in progress</p><p className="mt-1 text-sm text-slate-600">{session.title} · {session.phase === 'break' ? 'Break between sessions' : `${session.answers.filter((answer) => answer !== null).length} answers saved`}</p></div></div>
          <div className="flex flex-wrap gap-2"><button type="button" onClick={resumeSession} className="inline-flex items-center gap-2 rounded-xl bg-blue-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-900"><Play size={15} /> Resume exam</button><button type="button" onClick={() => setConfirmExit(true)} className="rounded-xl border border-blue-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-blue-100">Discard session</button></div>
        </section>
      ) : null}

      <div className="space-y-5">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-700">Choose an action</p><h2 className="mt-1 text-xl font-semibold text-slate-950">What would you like to do?</h2></div>
            <span className="text-xs text-slate-500">{attemptCount} completed {attemptCount === 1 ? 'attempt' : 'attempts'}</span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 sm:mt-5 sm:gap-3">
            <button type="button" onClick={() => { setSetupMode('quick'); setSetupError(null) }} aria-pressed={setupMode === 'quick'} className={cn('rounded-2xl border p-2.5 text-left transition sm:p-4', setupMode === 'quick' ? 'border-blue-700 bg-blue-50 ring-2 ring-blue-700/10' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50')}>
              <span className={cn('flex h-8 w-8 items-center justify-center rounded-xl sm:h-9 sm:w-9', setupMode === 'quick' ? 'bg-blue-800 text-white' : 'bg-slate-100 text-slate-600')}><BookOpen size={16} /></span><span className="mt-2 block text-[10px] font-semibold leading-4 text-slate-900 sm:mt-3 sm:text-sm">Quick practice</span><span className="mt-1 hidden text-xs leading-5 text-slate-500 sm:block">Pick a bank, subject, chapter, and a short set size.</span>
            </button>
            <button type="button" onClick={() => { setSetupMode('full_mock'); setSetupError(null) }} aria-pressed={setupMode === 'full_mock'} className={cn('rounded-2xl border p-2.5 text-left transition sm:p-4', setupMode === 'full_mock' ? 'border-blue-700 bg-blue-50 ring-2 ring-blue-700/10' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50')}>
              <span className={cn('flex h-8 w-8 items-center justify-center rounded-xl sm:h-9 sm:w-9', setupMode === 'full_mock' ? 'bg-blue-800 text-white' : 'bg-slate-100 text-slate-600')}><Timer size={16} /></span><span className="mt-2 block text-[10px] font-semibold leading-4 text-slate-900 sm:mt-3 sm:text-sm">Full mock</span><span className="mt-1 hidden text-xs leading-5 text-slate-500 sm:block">180 questions · two 90-question timed sessions.</span>
            </button>
            <button type="button" onClick={retryMistakes} disabled={retryQuestions.length === 0 || Boolean(session)} className="rounded-2xl border border-slate-200 p-2.5 text-left transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:p-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-600 sm:h-9 sm:w-9"><RotateCcw size={16} /></span><span className="mt-2 flex items-center gap-1 text-[10px] font-semibold leading-4 text-slate-900 sm:mt-3 sm:gap-2 sm:text-sm">Retry mistakes<span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-600 sm:px-2 sm:text-[10px]">{retryQuestions.length}</span></span><span className="mt-1 hidden text-xs leading-5 text-slate-500 sm:block">Practice questions you previously missed or left blank.</span>
            </button>
          </div>

          {setupMode === 'quick' ? (
            <div className="mt-6 border-t border-slate-100 pt-5">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-semibold text-slate-950">Quick practice</h3><p className="mt-1 text-xs text-slate-500">Pick a bank and start. Subject and chapter filters are optional.</p></div><span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[10px] font-semibold text-slate-600">Saves as you work</span></div>
              <div className="mt-5">
                <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-semibold text-slate-900">Choose a question bank</h3><p className="mt-1 text-xs text-slate-500">Your uploaded banks stay separate. Generated quizzes are kept together.</p></div>{questionBanks.length > 5 ? <label className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={bankSearch} onChange={(event) => setBankSearch(event.target.value)} placeholder="Find a bank" className="w-full rounded-xl border border-slate-200 py-2 pl-8 pr-3 text-xs outline-none focus:border-blue-600 sm:w-52" /></label> : null}</div>
                {visibleQuestionBanks.length > 0 ? (
                  <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                    {visibleQuestionBanks.map((bank) => {
                      const matchingCount = bank.questions.length
                      const selected = bank.id === quickBankId
                      return <button key={bank.id} type="button" aria-pressed={selected} onClick={() => { setQuickBankId(bank.id); setSubjectId('all'); setTopicId('all'); setSetupError(null) }} className={cn('flex min-h-[112px] items-start gap-3 rounded-2xl border p-3.5 text-left transition', selected ? 'border-blue-700 bg-blue-50 ring-2 ring-blue-700/10' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50')}>
                        <span className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border', selected ? 'border-blue-800 bg-blue-800 text-white' : 'border-slate-300 bg-white')}>{selected ? <Check size={12} /> : null}</span>
                        <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center justify-between gap-2"><span className="truncate text-sm font-semibold text-slate-900">{bank.name}</span><span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">{matchingCount} {matchingCount === 1 ? 'question' : 'questions'}</span></span><span className="mt-1 block text-[11px] font-medium text-slate-500">{bank.sourceLabel}</span><span className="mt-1.5 block text-xs leading-5 text-slate-600">{bank.coverage}</span></span>
                      </button>
                    })}
                  </div>
                ) : (
                  <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">{bankSearch.trim() && matchingQuestionBanks.length > 0 ? 'No banks match that search.' : !bankReady && matchingQuestionBanks.length <= 1 ? 'Checking for saved question banks…' : 'No saved bank has questions for this subject and chapter. Create questions with AI or choose another selection.'}</div>
                )}
                {bankError ? <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-5 text-amber-900"><AlertCircle size={15} className="mt-0.5 shrink-0" />Saved online question sets could not be loaded. Your included and device-uploaded banks are still available.</p> : null}
              </div>

              <details className="mt-4 rounded-xl border border-slate-200 px-3.5 py-3">
                <summary className="cursor-pointer text-xs font-semibold text-slate-600">Optional: choose a subject or chapter</summary>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <FormSelect label="Subject" value={subjectId} onChange={(value) => { setSubjectId(value); setTopicId('all'); setSetupError(null) }}>
                  <option value="all">All subjects</option>
                  {cfaLevel1Syllabus.map((subject) => <option value={subject.id} key={subject.id}>{subject.title}</option>)}
                </FormSelect>
                <FormSelect label="Chapter" disabled={subjectId === 'all'} value={topicId} onChange={(value) => { setTopicId(value); setSetupError(null) }}>
                  <option value="all">All chapters</option>{(currentSubject?.topics ?? []).map((topic) => <option value={topic.id} key={topic.id}>{topic.title}</option>)}
                </FormSelect>
              </div>
                {subjectId !== 'all' && <button type="button" onClick={() => { setSubjectId('all'); setTopicId('all') }} className="mt-3 text-xs font-semibold text-blue-800 hover:underline">Clear filters</button>}
              </details>
              <div className="mt-4">
                <p className="mb-2 text-xs font-semibold text-slate-700">How many questions?</p>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Question count">
                  {[5, 10, 20].map((count) => <button key={count} type="button" aria-pressed={questionCount === String(count)} onClick={() => setQuestionCount(String(count))} className={cn('min-w-20 rounded-xl border px-4 py-2.5 text-sm font-semibold transition', questionCount === String(count) ? 'border-blue-700 bg-blue-800 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50')}>{count}</button>)}
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs text-slate-500">{quickQuestions.length > 0 ? <><span className="font-semibold text-slate-800">{quickStartCount} questions</span> will start from {selectedQuestionBank?.name ?? 'this bank'}{quickStartCount < requiredCount ? ` (${quickQuestions.length} available for your selection)` : ''}.</> : <>No questions in {selectedQuestionBank?.name ?? 'this bank'} match your selection. Choose another bank or create a set.</>}</div>
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <button type="button" onClick={() => void generateAndStart(topicId === 'all' ? 'custom' : 'chapter', requiredCount)} disabled={isStarting || Boolean(session)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm font-semibold text-blue-900 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50">{isStarting ? <LoaderCircle size={15} className="animate-spin" /> : <Sparkles size={15} />}Create {requiredCount} questions with AI</button>
                  <button type="button" onClick={startQuickPractice} disabled={isStarting || Boolean(session) || quickQuestions.length === 0} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-800 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-50"><Play size={15} />Start {quickStartCount || requiredCount}-question practice</button>
                </div>
              </div>

              <details className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <summary className="cursor-pointer list-inside text-sm font-semibold text-slate-800">Add a question set</summary>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-2.5"><FileQuestion size={16} className="mt-0.5 shrink-0 text-slate-500" /><div><p className="text-xs font-semibold text-slate-800">Import your own JSON bank</p><p className="mt-1 text-[11px] leading-5 text-slate-500">Questions need prompt, options, correctIndex, CFA subject, and chapter. The bank stays on this device.</p></div></div>
                  <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">Choose JSON file<input type="file" accept="application/json,.json" onChange={(event) => void handleQuestionBankImport(event)} className="sr-only" /></label>
                </div>
                <details className="mt-3 text-[11px] text-slate-500"><summary className="cursor-pointer font-semibold text-slate-600">See the JSON format</summary><pre className="mt-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-3 font-mono text-[10px] leading-5 text-slate-600">{`{
  "questions": [{
    "prompt": "Which statement is most accurate?",
    "options": ["A statement", "Another statement", "A third statement"],
    "correctIndex": 0,
    "rationale": "The first statement follows the defined rule.",
    "subjectId": "ethics",
    "topicId": "ethics-code-and-standards"
  }]
}`}</pre></details>
                {localBankMessage ? <p className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-xs leading-5 text-emerald-800"><CheckCircle2 size={15} className="mt-0.5 shrink-0" />{localBankMessage}</p> : null}
                {localBankError ? <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs leading-5 text-rose-800"><AlertCircle size={15} className="mt-0.5 shrink-0" />{localBankError}</p> : null}
              </details>
              {setupError ? <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm leading-6 text-rose-800"><AlertCircle size={17} className="mt-0.5 shrink-0" />{setupError}</p> : null}
            </div>
          ) : (
            <div className="mt-6 border-t border-slate-100 pt-5">
              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
                <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-800 text-white"><Timer size={19} /></span><div><h3 className="text-base font-semibold text-slate-950">CFA Level I full mock</h3><p className="mt-1 text-sm leading-6 text-slate-600">180 distinct questions in two sessions of 90. Each session is 2 hours 15 minutes, with an optional break of up to 30 minutes.</p></div></div>
                <div className="mt-5 flex flex-col gap-3 border-t border-blue-200/70 pt-4 sm:flex-row sm:items-center sm:justify-between"><span className="text-xs text-slate-600">{fullMockReady ? '180-question full mock ready' : 'A complete 90 + 90 question split is not available yet.'}</span><button type="button" onClick={startFullMock} disabled={isStarting || Boolean(session) || !fullMockReady} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-800 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-50"><Play size={15} />Start full mock</button></div>
              </div>
              <div className="mt-5 border-t border-slate-100 pt-5">
                <div className="flex flex-wrap items-end justify-between gap-2"><div><h3 className="text-sm font-semibold text-slate-950">Imported mock papers</h3><p className="mt-1 text-xs text-slate-500">Choose one of your original papers. Questions stay in the PDF’s order.</p></div><span className="text-[10px] font-medium text-slate-500">Full papers: 2 × 90</span></div>
                {importedMocks.length > 0 ? <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {importedMocks.map((mock) => {
                    const unverifiedCount = mock.unverifiedQuestionCount ?? Math.max(0, mock.questionCount - (mock.scoredQuestionCount ?? mock.questionCount))
                    const scoredCount = mock.scoredQuestionCount ?? Math.max(0, mock.questionCount - unverifiedCount)
                    return <article key={mock.id} className="flex min-h-[128px] flex-col rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex items-start justify-between gap-3"><div><h4 className="text-sm font-semibold text-slate-950">{mock.title}</h4><p className="mt-1 text-xs text-slate-500">{mock.complete ? '180 questions · two 90-question sessions' : `Partial paper · ${mock.questionCount} available · ${mock.sessionCounts[0]} from session 1, ${mock.sessionCounts[1]} from session 2`}</p>{unverifiedCount > 0 ? <p className="mt-1 text-[11px] font-medium text-slate-600">{scoredCount} verified answers · {unverifiedCount} unscored</p> : null}</div><span className={cn('shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold', mock.complete ? 'bg-emerald-50 text-emerald-800' : mock.ready ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600')}>{mock.complete ? 'Full paper' : mock.ready ? 'Partial paper' : 'Preparing'}</span></div>
                      {mock.notes.length > 0 ? <p className="mt-2 text-[10px] leading-4 text-slate-500">{mock.notes.slice(0, 2).join(' · ')}</p> : null}
                      <button type="button" onClick={() => void startImportedMock(mock)} disabled={!mock.ready || Boolean(session) || startingImportedMock !== null} className="mt-auto inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-800 px-3 py-2.5 text-xs font-semibold text-white hover:bg-blue-900 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500">{startingImportedMock === mock.id ? <><LoaderCircle size={14} className="animate-spin" />Opening paper…</> : <><Play size={14} />{mock.complete ? `Start ${mock.title}` : `Practise ${mock.questionCount} available questions`}</>}</button>
                    </article>
                  })}
                </div> : importedMocksReady ? <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">{importedMocksError ? 'Imported papers could not be loaded right now.' : 'No imported mock papers are available yet.'}</div> : <div className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500"><LoaderCircle size={14} className="animate-spin" />Loading your mock papers…</div>}
                {importedMocksError ? <p role="status" className="mt-2 text-xs text-amber-800">{importedMocksError}</p> : null}
              </div>
              {setupError ? <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm leading-6 text-rose-800"><AlertCircle size={17} className="mt-0.5 shrink-0" />{setupError}</p> : null}
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><FileQuestion size={17} className="text-blue-700" /><h2 className="text-sm font-semibold text-slate-950">Recent attempts</h2></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">{sortedAttempts.length}</span></div>
          {sortedAttempts.length === 0 ? <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-500">Completed attempts and answer rationales will appear here.</div> : <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sortedAttempts.slice(0, 6).map((attempt) => {
              const correct = countCorrectAnswers(attempt)
              const scored = countScoredQuestions(attempt)
              const missed = getMissedQuestions(attempt).length
              const unscored = attempt.questions.length - scored
              return <article key={attempt.id} className="rounded-2xl border border-slate-200 p-3.5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="line-clamp-2 text-xs font-semibold leading-5 text-slate-900">{attempt.title}</p><p className="mt-1 text-[10px] text-slate-500">{formatAttemptDate(attempt.finishedAt)} · {attempt.questions.length} questions</p></div><span className={cn('rounded-lg px-2 py-1 text-xs font-bold', attempt.score >= 70 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700')}>{attempt.score}%</span></div><div className="mt-3 flex items-center justify-between gap-2"><span className="text-[10px] text-slate-500">{correct}/{scored} scored correct{unscored > 0 ? ` · ${unscored} unscored` : ''} · {formatDuration(attempt.elapsedSeconds)}</span><button type="button" onClick={() => reviewAttempt(attempt)} className="text-[10px] font-bold text-blue-800 hover:underline">Review answers</button></div>{missed > 0 ? <button type="button" onClick={() => retryMissed(attempt)} className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-semibold text-slate-600 hover:text-blue-800"><RotateCcw size={12} /> Retry {missed} missed or unanswered</button> : null}</article>
            })}
          </div>}
        </section>
      </div>

      {confirmExit ? <ExamModal title="Discard this exam session?" body="This removes the saved in-progress answers and timer. Completed attempts stay in your history." primaryLabel="Discard session" secondaryLabel="Keep session" onPrimary={discardSession} onClose={() => setConfirmExit(false)} /> : null}
    </main>
  )
}
