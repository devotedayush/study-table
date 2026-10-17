'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Activity,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Layers3,
  NotebookPen,
  X,
} from 'lucide-react'
import { cfaLevel1Syllabus, type SyllabusSubject, type SyllabusTopic } from '@/lib/cfa-data'
import { useLearningData, type ExamAttempt, type ExamQuestion, type LearningEvent } from '@/lib/learning-store'

type Period = 'today' | 'week' | 'month'
type TopicStatus = 'Practised' | 'Viewed' | 'No activity'

type DateBounds = {
  start: Date
  end: Date
}

type AnsweredQuestion = {
  attempt: ExamAttempt
  question: ExamQuestion
  index: number
  answer: number
  verified: boolean
  correct: boolean
}

type SubjectAnalytics = {
  subject: SyllabusSubject
  events: number
  answered: number
  correct: number
  unscored: number
}

const periodOptions: { id: Period; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
]

function localDayKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDate(value: string | undefined) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function getBounds(period: Period, now: Date): DateBounds {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  if (period === 'week') {
    const mondayOffset = (start.getDay() + 6) % 7
    start.setDate(start.getDate() - mondayOffset)
  } else if (period === 'month') {
    start.setDate(1)
  }

  return { start, end: now }
}

function isWithinBounds(date: Date | null, bounds: DateBounds) {
  return Boolean(date && date.getTime() >= bounds.start.getTime() && date.getTime() <= bounds.end.getTime())
}

function getAttemptDate(attempt: ExamAttempt) {
  return parseDate(attempt.finishedAt) ?? parseDate(attempt.startedAt)
}

function getAnsweredQuestions(attempt: ExamAttempt): AnsweredQuestion[] {
  const questions = attempt.questions ?? []
  const answers = attempt.answers ?? []

  return questions.flatMap((question, index) => {
    const answer = answers[index]
    if (typeof answer !== 'number' || !Number.isInteger(answer)) return []
    const verified = question.answerVerified !== false
    return [{ attempt, question, index, answer, verified, correct: verified && answer === question.correctIndex }]
  })
}

function normalizeLabel(value: string | undefined) {
  return (value ?? '').trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ')
}

function resolveSubject(subjectId?: string, subjectLabel?: string) {
  const normalizedLabel = normalizeLabel(subjectLabel)
  return cfaLevel1Syllabus.find(
    (subject) => subject.id === subjectId || (normalizedLabel && normalizeLabel(subject.title) === normalizedLabel),
  )
}

function resolveTopic(subject: SyllabusSubject, topicId?: string, topicLabel?: string) {
  const normalizedLabel = normalizeLabel(topicLabel)
  return subject.topics.find(
    (topic) => topic.id === topicId || (normalizedLabel && normalizeLabel(topic.title) === normalizedLabel),
  )
}

function getPeriodEvents(events: LearningEvent[], bounds: DateBounds) {
  return events.filter((event) => isWithinBounds(parseDate(event.at), bounds))
}

function getPeriodAttempts(attempts: ExamAttempt[], bounds: DateBounds) {
  return attempts
    .filter((attempt) => isWithinBounds(getAttemptDate(attempt), bounds))
    .sort((a, b) => (getAttemptDate(b)?.getTime() ?? 0) - (getAttemptDate(a)?.getTime() ?? 0))
}

function getTrackedTime(events: LearningEvent[], attempts: ExamAttempt[]) {
  const eventDurations = new Map<string, number>()

  for (const event of events) {
    if (event.type === 'assessment_answer' || event.type === 'assessment_complete') continue
    if (typeof event.durationSeconds !== 'number' || !Number.isFinite(event.durationSeconds) || event.durationSeconds <= 0) continue

    const date = parseDate(event.at)
    if (!date) continue
    const group = event.type.startsWith('flashcard_')
      ? 'flashcard'
      : event.type === 'note_open'
        ? 'note'
        : 'other'
    const item = event.itemId || event.topicId || event.subjectId || 'workspace'
    const key = `${localDayKey(date)}:${group}:${item}`
    eventDurations.set(key, Math.max(eventDurations.get(key) ?? 0, event.durationSeconds))
  }

  const eventSeconds = [...eventDurations.values()].reduce((sum, seconds) => sum + seconds, 0)
  const attemptSeconds = attempts.reduce((sum, attempt) => {
    const elapsed = Number(attempt.elapsedSeconds)
    return sum + (Number.isFinite(elapsed) && elapsed > 0 ? elapsed : 0)
  }, 0)
  const seconds = eventSeconds + attemptSeconds

  return { seconds, hasData: seconds > 0 }
}

function formatDuration(seconds: number) {
  if (seconds < 60) return '<1 min'
  const minutes = Math.round(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  if (hours === 0) return `${minutes} min`
  return remainingMinutes === 0 ? `${hours} hr` : `${hours} hr ${remainingMinutes} min`
}

function formatDateTime(date: Date | null) {
  if (!date) return 'Date unavailable'
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function accuracyLabel(correct: number, answered: number) {
  if (answered === 0) return 'No data'
  return `${Math.round((correct / answered) * 100)}%`
}

function getAttemptStats(attempt: ExamAttempt) {
  const answered = getAnsweredQuestions(attempt)
  const scored = answered.filter((question) => question.verified)
  const correct = scored.filter((question) => question.correct).length
  const unscored = answered.length - scored.length
  return { answered, scored, correct, unscored, total: attempt.questions?.length ?? 0 }
}

function getEventPoints(events: LearningEvent[], period: Period, now: Date) {
  if (period === 'today') {
    const currentBlock = Math.floor(now.getHours() / 3)
    return Array.from({ length: currentBlock + 1 }, (_, block) => {
      const labelHour = block * 3
      const label = new Intl.DateTimeFormat('en-IN', { hour: 'numeric' }).format(new Date(2020, 0, 1, labelHour))
      const count = events.filter((event) => {
        const date = parseDate(event.at)
        return Boolean(date && localDayKey(date) === localDayKey(now) && Math.floor(date.getHours() / 3) === block)
      }).length
      return { key: `hour-${block}`, label, fullLabel: `${labelHour.toString().padStart(2, '0')}:00`, count }
    })
  }

  const start = getBounds(period, now).start
  const currentDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const days = Math.floor((currentDate.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1

  return Array.from({ length: days }, (_, index) => {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)
    const key = localDayKey(day)
    const count = events.filter((event) => {
      const date = parseDate(event.at)
      return Boolean(date && localDayKey(date) === key)
    }).length
    const label = period === 'week'
      ? new Intl.DateTimeFormat('en-IN', { weekday: 'short' }).format(day)
      : String(day.getDate())
    return { key, label, fullLabel: new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(day), count }
  })
}

function makeSyllabusStatuses(events: LearningEvent[], answeredQuestions: AnsweredQuestion[]) {
  const statuses = new Map<string, { viewed: boolean; practised: boolean }>()
  const subjectOnly = new Map<string, { viewed: boolean; practised: boolean }>()

  const mark = (subjectId: string, topicId: string | undefined, status: 'viewed' | 'practised') => {
    const map = topicId ? statuses : subjectOnly
    const key = topicId ? `${subjectId}:${topicId}` : subjectId
    const activity = map.get(key) ?? { viewed: false, practised: false }
    activity[status] = true
    map.set(key, activity)
  }

  for (const event of events) {
    const subject = resolveSubject(event.subjectId, event.subject)
    if (!subject) continue
    const topic = resolveTopic(subject, event.topicId, event.topic)
    const practised =
      event.type === 'assessment_answer' || event.type === 'flashcard_known' || event.type === 'flashcard_again'
    mark(subject.id, topic?.id, practised ? 'practised' : 'viewed')
  }

  for (const result of answeredQuestions) {
    const subject = resolveSubject(result.question.subjectId, result.question.subject)
    if (!subject) continue
    const topic = resolveTopic(subject, result.question.topicId, result.question.topic)
    mark(subject.id, topic?.id, 'practised')
  }

  const getTopicStatus = (subject: SyllabusSubject, topic: SyllabusTopic): TopicStatus => {
    const activity = statuses.get(`${subject.id}:${topic.id}`)
    if (activity?.practised) return 'Practised'
    if (activity?.viewed) return 'Viewed'
    return 'No activity'
  }

  const getSubjectStatus = (subject: SyllabusSubject): TopicStatus => {
    const topicStatuses = subject.topics.map((topic) => getTopicStatus(subject, topic))
    const subjectActivity = subjectOnly.get(subject.id)
    if (topicStatuses.includes('Practised') || subjectActivity?.practised) return 'Practised'
    if (topicStatuses.includes('Viewed') || subjectActivity?.viewed) return 'Viewed'
    return 'No activity'
  }

  return { getTopicStatus, getSubjectStatus }
}

function statusStyles(status: TopicStatus) {
  if (status === 'Practised') return 'border-[#bdd0e5] bg-[#edf4fb] text-[#315b84]'
  if (status === 'Viewed') return 'border-[#f4c5b9] bg-[#fff3ef] text-[#a85e4d]'
  return 'border-slate-200 bg-slate-50 text-slate-500'
}

function modeLabel(mode: ExamAttempt['mode']) {
  return {
    full_mock: 'Full mock',
    chapter: 'Chapter',
    custom: 'Custom',
    uploaded: 'Uploaded',
    retry: 'Retry',
  }[mode]
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  accent,
}: {
  icon: typeof Activity
  label: string
  value: string
  detail: string
  accent: 'blue' | 'coral' | 'slate'
}) {
  const accentStyles = {
    blue: 'bg-[#edf4fb] text-[#426b94]',
    coral: 'bg-[#fff1ec] text-[#b56b58]',
    slate: 'bg-slate-100 text-slate-600',
  }

  return (
    <article className="rounded-[1.5rem] border border-[#e8e9eb] bg-white p-4 shadow-[0_10px_26px_-24px_rgba(36,50,70,0.5)] sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</span>
        <span className={`flex h-9 w-9 items-center justify-center rounded-2xl ${accentStyles[accent]}`}>
          <Icon size={17} strokeWidth={1.8} />
        </span>
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-tight text-[#26384b]">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
    </article>
  )
}

function EventChart({
  points,
  hasEvents,
  hasSessions,
}: {
  points: ReturnType<typeof getEventPoints>
  hasEvents: boolean
  hasSessions: boolean
}) {
  if (!hasEvents) {
    return (
      <div className="flex min-h-44 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-[#fbfcfd] px-5 text-center text-sm text-slate-500">
        {hasSessions
          ? 'Assessment sessions are listed below; no learning events were saved for this period.'
          : 'No logged activity in this period.'}
      </div>
    )
  }

  const maximum = Math.max(...points.map((point) => point.count), 1)
  const isMonth = points.length > 10

  return (
    <div className="rounded-2xl border border-[#edf0f2] bg-[#fbfcfd] px-3 pb-3 pt-5 sm:px-5">
      <div className="flex h-36 items-end gap-1.5 sm:gap-2.5" role="img" aria-label="Recorded learning events over the selected period">
        {points.map((point, index) => {
          const height = point.count === 0 ? 2 : Math.max(8, Math.round((point.count / maximum) * 100))
          const shouldShowLabel = !isMonth || index === 0 || index === points.length - 1 || index % 5 === 0
          return (
            <div key={point.key} className="flex h-full min-w-0 flex-1 flex-col justify-end">
              <div className="flex h-full items-end justify-center">
                <div
                  title={`${point.fullLabel}: ${point.count} logged ${point.count === 1 ? 'event' : 'events'}`}
                  className={`w-full max-w-7 rounded-t-lg transition-colors ${point.count ? 'bg-[#6288ae] hover:bg-[#416f9d]' : 'bg-slate-200'}`}
                  style={{ height: `${height}%` }}
                />
              </div>
              <span className={`mt-2 h-4 text-center text-[0.62rem] text-slate-400 ${shouldShowLabel ? '' : 'invisible'}`}>
                {shouldShowLabel ? point.label : '·'}
              </span>
            </div>
          )
        })}
      </div>
      <p className="mt-3 text-[0.68rem] text-slate-500">Each bar shows learning events saved by the workspace.</p>
    </div>
  )
}

function SessionReview({ attempt }: { attempt: ExamAttempt }) {
  const stats = getAttemptStats(attempt)
  const bySubject = new Map<string, { subject: SyllabusSubject; total: number; correct: number }>()

  for (const result of stats.scored) {
    const subject = resolveSubject(result.question.subjectId, result.question.subject)
    if (!subject) continue
    const row = bySubject.get(subject.id) ?? { subject, total: 0, correct: 0 }
    row.total += 1
    if (result.correct) row.correct += 1
    bySubject.set(subject.id, row)
  }

  return (
    <div className="mt-4 grid gap-5 border-t border-slate-100 pt-4 lg:grid-cols-[0.8fr_1.2fr]">
      <section aria-label="Subject results">
        <h4 className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">By subject</h4>
        {bySubject.size === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            {stats.unscored > 0
              ? `${stats.unscored} answered ${stats.unscored === 1 ? 'item has' : 'items have'} an unavailable key and ${stats.unscored === 1 ? 'is' : 'are'} excluded from scored results.`
              : 'No scored answers to break down yet.'}
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {[...bySubject.values()].map((row) => (
              <div key={row.subject.id}>
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate font-medium text-slate-700">{row.subject.title}</span>
                  <span className="shrink-0 text-slate-500">{row.correct}/{row.total} · {accuracyLabel(row.correct, row.total)}</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-[#6288ae]"
                    style={{ width: `${Math.round((row.correct / row.total) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-label="Question review">
        <h4 className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Question review</h4>
        <div className="mt-3 max-h-[27rem] space-y-2 overflow-y-auto pr-1">
          {(attempt.questions ?? []).map((question, index) => {
            const answer = attempt.answers?.[index]
            const isAnswered = typeof answer === 'number'
            const verified = question.answerVerified !== false
            const isCorrect = verified && isAnswered && answer === question.correctIndex
            const response = isAnswered ? question.options?.[answer] : null
            const correctResponse = verified ? question.options?.[question.correctIndex] : null
            const status = !verified
              ? isAnswered ? 'Unscored · key unavailable' : 'Unanswered · key unavailable'
              : isCorrect ? 'Correct' : isAnswered ? 'Incorrect' : 'Unanswered'

            return (
              <article key={`${attempt.id}-${question.id}-${index}`} className="rounded-xl border border-slate-100 bg-white p-3">
                <div className="flex items-start gap-2.5">
                  <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${!verified ? 'bg-slate-100 text-slate-500' : isCorrect ? 'bg-[#edf4fb] text-[#416f9d]' : isAnswered ? 'bg-[#fff1ec] text-[#b56b58]' : 'bg-slate-100 text-slate-500'}`}>
                    {!verified ? <CircleHelp size={13} /> : isCorrect ? <Check size={13} /> : isAnswered ? <X size={13} /> : <CircleHelp size={13} />}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-500">Question {index + 1} · {status}</p>
                    <p className="mt-1 text-sm leading-5 text-slate-700">{question.prompt}</p>
                    <div className="mt-2 space-y-1 text-xs leading-5">
                      {isAnswered ? <p className={!verified ? 'text-slate-600' : isCorrect ? 'text-[#416f9d]' : 'text-[#a85e4d]'}>Your answer: {response ?? `Option ${answer + 1}`}</p> : null}
                      {!verified ? <p className="text-slate-500">The answer key is unavailable; this item is excluded from accuracy.</p> : null}
                      {!isCorrect && correctResponse ? <p className="text-slate-600">Correct answer: {correctResponse}</p> : null}
                    </div>
                    {verified && question.rationale ? <p className="mt-2 border-t border-slate-100 pt-2 text-xs leading-5 text-slate-500">{question.rationale}</p> : null}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function SessionHistory({ attempts }: { attempts: ExamAttempt[] }) {
  if (attempts.length === 0) {
    return <p className="rounded-2xl bg-[#fbfcfd] px-4 py-6 text-sm text-slate-500">No assessment sessions recorded in this period.</p>
  }

  return (
    <div className="space-y-3">
      {attempts.map((attempt) => {
        const stats = getAttemptStats(attempt)
        const date = getAttemptDate(attempt)
        const elapsed = Number(attempt.elapsedSeconds)

        return (
          <details key={attempt.id} className="group rounded-2xl border border-[#e9edf0] bg-white p-4 open:border-[#cbd8e4] sm:p-5">
            <summary className="flex cursor-pointer list-none flex-col gap-3 sm:flex-row sm:items-center sm:justify-between [&::-webkit-details-marker]:hidden">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#edf4fb] text-[#426b94]">
                  <CalendarDays size={18} />
                </span>
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-[#26384b]">{attempt.title || 'Assessment session'}</h3>
                  <p className="mt-1 text-xs text-slate-500">{formatDateTime(date)} · {modeLabel(attempt.mode)}</p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-4 pl-[3.25rem] sm:justify-end sm:pl-0">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                  <span>{stats.answered.length}/{stats.total} answered</span>
                  <span>{stats.scored.length ? `${accuracyLabel(stats.correct, stats.scored.length)} scored accuracy` : 'No scored accuracy'}</span>
                  {stats.unscored > 0 ? <span>{stats.unscored} unscored</span> : null}
                  {Number.isFinite(elapsed) && elapsed > 0 ? <span>{formatDuration(elapsed)}</span> : null}
                </div>
                <ChevronDown size={16} className="shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
              </div>
            </summary>
            <SessionReview attempt={attempt} />
          </details>
        )
      })}
    </div>
  )
}

function SyllabusActivity({
  events,
  answeredQuestions,
}: {
  events: LearningEvent[]
  answeredQuestions: AnsweredQuestion[]
}) {
  const { getSubjectStatus, getTopicStatus } = makeSyllabusStatuses(events, answeredQuestions)

  return (
    <details className="group rounded-[1.6rem] border border-[#e8e9eb] bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 sm:px-5 [&::-webkit-details-marker]:hidden">
        <div>
          <h2 className="text-base font-semibold text-[#26384b]">Syllabus activity</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">Statuses reflect recorded activity during the selected period.</p>
        </div>
        <ChevronDown size={18} className="shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-slate-100 p-3 sm:p-4">
        <div className="space-y-2">
          {cfaLevel1Syllabus.map((subject) => {
            const status = getSubjectStatus(subject)
            return (
              <details key={subject.id} className="group/subject rounded-xl border border-slate-100 bg-[#fcfcfd]">
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-3 py-3 [&::-webkit-details-marker]:hidden">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <ChevronDown size={14} className="shrink-0 text-slate-400 transition-transform group-open/subject:rotate-180" />
                    <span className="truncate text-sm font-medium text-slate-700">{subject.title}</span>
                  </span>
                  <span className={`rounded-full border px-2.5 py-1 text-[0.67rem] font-medium ${statusStyles(status)}`}>{status}</span>
                </summary>
                <div className="space-y-1 border-t border-slate-100 px-3 py-2 sm:pl-9">
                  {subject.topics.map((topic) => {
                    const topicStatus = getTopicStatus(subject, topic)
                    return (
                      <div key={topic.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-2 hover:bg-white">
                        <span className="text-xs leading-5 text-slate-600">{topic.title}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-[0.63rem] font-medium ${statusStyles(topicStatus)}`}>{topicStatus}</span>
                      </div>
                    )
                  })}
                </div>
              </details>
            )
          })}
        </div>
        <p className="mt-3 px-1 text-[0.68rem] leading-5 text-slate-500">“No activity” means this workspace has no matching interaction recorded in this period.</p>
      </div>
    </details>
  )
}

function LoadingState() {
  return (
    <div className="mx-auto max-w-7xl animate-pulse space-y-5 px-1 py-2" aria-label="Loading Track statistics">
      <div className="h-7 w-36 rounded-full bg-slate-200/70" />
      <div className="h-12 max-w-md rounded-xl bg-slate-200/70" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => <div key={index} className="h-32 rounded-[1.5rem] bg-slate-200/60" />)}
      </div>
    </div>
  )
}

export function TrackWorkspace() {
  const { events, attempts, ready } = useLearningData()
  const [period, setPeriod] = useState<Period>('week')
  const [now, setNow] = useState(() => new Date())
  const bounds = useMemo(() => getBounds(period, now), [period, now])

  const periodEvents = useMemo(() => getPeriodEvents(events, bounds), [events, bounds])
  const periodAttempts = useMemo(() => getPeriodAttempts(attempts, bounds), [attempts, bounds])
  const answeredQuestions = useMemo(
    () => periodAttempts.flatMap((attempt) => getAnsweredQuestions(attempt)),
    [periodAttempts],
  )
  const scoredQuestions = answeredQuestions.filter((question) => question.verified)
  const correctAnswers = scoredQuestions.filter((question) => question.correct).length
  const unscoredAnswered = answeredQuestions.length - scoredQuestions.length
  const trackedTime = useMemo(() => getTrackedTime(periodEvents, periodAttempts), [periodEvents, periodAttempts])
  const chartPoints = useMemo(() => getEventPoints(periodEvents, period, now), [periodEvents, period, now])

  const flashcardEvents = periodEvents.filter((event) => event.type.startsWith('flashcard_'))
  const flashcardsTouched = new Set(flashcardEvents.map((event) => event.itemId || event.id)).size
  const notesOpened = periodEvents.filter((event) => event.type === 'note_open').length

  const subjectAnalytics = useMemo(() => {
    const rows = new Map<string, SubjectAnalytics>()
    const getRow = (subject: SyllabusSubject) => {
      const current = rows.get(subject.id) ?? { subject, events: 0, answered: 0, correct: 0, unscored: 0 }
      rows.set(subject.id, current)
      return current
    }

    for (const event of periodEvents) {
      const subject = resolveSubject(event.subjectId, event.subject)
      if (subject) getRow(subject).events += 1
    }

    for (const answer of answeredQuestions) {
      const subject = resolveSubject(answer.question.subjectId, answer.question.subject)
      if (!subject) continue
      const row = getRow(subject)
      if (!answer.verified) {
        row.unscored += 1
        continue
      }
      row.answered += 1
      if (answer.correct) row.correct += 1
    }

    return [...rows.values()].sort((a, b) => (b.events + b.answered) - (a.events + a.answered))
  }, [periodEvents, answeredQuestions])

  const syllabusEvents = periodEvents.filter((event) => event.type !== 'assessment_complete')
  const hasAnyActivity = periodEvents.length > 0 || periodAttempts.length > 0

  if (!ready) return <LoadingState />

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-1 pb-10 sm:space-y-8">
      <header className="flex flex-col gap-5 border-b border-[#e8e9eb] pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#d9e4ef] bg-[#f2f6fa] px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[#4e7092]">
            <Activity size={13} /> Track
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-[#26384b] sm:text-[2.65rem]">Your work, at a glance</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
            A clear record of what you have done in this workspace, based on activity saved here.
          </p>
        </div>

        <div className="inline-flex w-fit rounded-2xl border border-[#e5e8eb] bg-white p-1 shadow-sm" role="group" aria-label="Choose tracking period">
          {periodOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => { setPeriod(option.id); setNow(new Date()) }}
              aria-pressed={period === option.id}
              className={`rounded-xl px-3 py-2 text-xs font-medium transition-colors sm:px-4 ${period === option.id ? 'bg-[#315d85] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-[#26384b]'}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>

      <section aria-label="Activity totals" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          icon={BookOpen}
          label="Questions answered"
          value={String(answeredQuestions.length)}
          detail={answeredQuestions.length
            ? `${scoredQuestions.length} verified response${scoredQuestions.length === 1 ? '' : 's'} scored${unscoredAnswered ? ` · ${unscoredAnswered} key${unscoredAnswered === 1 ? '' : 's'} unavailable` : ''}`
            : 'No answered questions recorded'}
          accent="blue"
        />
        <MetricCard
          icon={Activity}
          label="Accuracy"
          value={accuracyLabel(correctAnswers, scoredQuestions.length)}
          detail={scoredQuestions.length
            ? `${correctAnswers} correct of ${scoredQuestions.length} verified answered`
            : answeredQuestions.length
              ? 'No scored accuracy; answered items have unavailable keys'
              : 'No answer data for this period'}
          accent="coral"
        />
        <MetricCard
          icon={Clock3}
          label="Active time"
          value={trackedTime.hasData ? formatDuration(trackedTime.seconds) : 'No data'}
          detail="From recorded durations and assessment sessions"
          accent="slate"
        />
        <MetricCard
          icon={Layers3}
          label="Flashcards touched"
          value={String(flashcardsTouched)}
          detail={flashcardEvents.length ? `${flashcardEvents.length} card interaction events` : 'No card interactions recorded'}
          accent="blue"
        />
        <MetricCard
          icon={NotebookPen}
          label="Notes opened"
          value={String(notesOpened)}
          detail={notesOpened ? 'Note open events recorded' : 'No note opens recorded'}
          accent="coral"
        />
      </section>

      {!hasAnyActivity ? (
        <section className="rounded-[1.7rem] border border-dashed border-[#d6dfe8] bg-white/80 p-5 sm:p-7" aria-label="No activity yet">
          <div className="mx-auto max-w-2xl text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#edf4fb] text-[#426b94]"><Activity size={21} /></span>
            <h2 className="mt-4 text-xl font-semibold text-[#26384b]">Nothing recorded in this period yet</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Track reflects interactions saved in this workspace. It does not include study time or work completed elsewhere.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Link href="/notes" className="inline-flex items-center gap-2 rounded-xl border border-[#d8e3ed] bg-[#f3f7fb] px-3.5 py-2.5 text-xs font-semibold text-[#3d678f] transition hover:bg-[#eaf1f8]">
                <NotebookPen size={14} /> Notes &amp; flashcards
              </Link>
              <Link href="/assessments" className="inline-flex items-center gap-2 rounded-xl border border-[#f1d5cc] bg-[#fff5f1] px-3.5 py-2.5 text-xs font-semibold text-[#a7604f] transition hover:bg-[#ffede7]">
                <BookOpen size={14} /> Mocks &amp; assessments
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <article className="rounded-[1.6rem] border border-[#e8e9eb] bg-white p-4 sm:p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[#26384b]">Activity over time</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">Learning events saved during {period === 'today' ? 'today' : period === 'week' ? 'this week' : 'this month'}.</p>
            </div>
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#edf4fb] text-[#426b94]"><CalendarDays size={17} /></span>
          </div>
          <EventChart points={chartPoints} hasEvents={periodEvents.length > 0} hasSessions={periodAttempts.length > 0} />
        </article>

        <article className="rounded-[1.6rem] border border-[#e8e9eb] bg-white p-4 sm:p-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-[#26384b]">Subject engagement &amp; accuracy</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">Subjects with saved activity in this period. Accuracy uses verified answered questions only; items with unavailable keys are excluded.</p>
          </div>
          {subjectAnalytics.length === 0 ? (
            <div className="flex min-h-44 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-[#fbfcfd] px-5 text-center text-sm text-slate-500">
              No subject activity recorded in this period.
            </div>
          ) : (
            <div className="space-y-3">
              {subjectAnalytics.map((row) => {
                const maxEvents = Math.max(...subjectAnalytics.map((item) => item.events), 1)
                const barWidth = row.events ? Math.max(4, Math.round((row.events / maxEvents) * 100)) : 0
                return (
                  <div key={row.subject.id} className="rounded-xl bg-[#fbfcfd] px-3 py-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <p className="max-w-[62%] text-xs font-medium leading-5 text-slate-700">{row.subject.title}</p>
                      <div className="shrink-0 text-right text-xs">
                        <span className="font-semibold text-[#315d85]">{accuracyLabel(row.correct, row.answered)}</span>
                        <span className="ml-1 text-slate-500">· {row.answered ? `${row.correct}/${row.answered} scored` : row.unscored ? `no scored answers · ${row.unscored} unscored` : 'no scored answers'}</span>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200/70">
                        <div className="h-full rounded-full bg-[#7798b7]" style={{ width: `${barWidth}%` }} />
                      </div>
                      <span className="w-20 shrink-0 text-right text-[0.65rem] text-slate-500">{row.events} logged {row.events === 1 ? 'event' : 'events'}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </article>
      </section>

      <section className="rounded-[1.6rem] border border-[#e8e9eb] bg-white p-4 sm:p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#26384b]">Assessment session history</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">Open a session to see its saved question and subject results.</p>
          </div>
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#fff1ec] text-[#b56b58]"><BookOpen size={17} /></span>
        </div>
        <SessionHistory attempts={periodAttempts} />
      </section>

      <SyllabusActivity events={syllabusEvents} answeredQuestions={answeredQuestions} />

      <p className="px-1 text-xs leading-5 text-slate-500">
        These statistics describe activity recorded in this workspace. They are not a measure of all your preparation or exam readiness.
      </p>
    </div>
  )
}
