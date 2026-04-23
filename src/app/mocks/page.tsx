'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import {
  BadgeCheck,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Clock3,
  GraduationCap,
  Plus,
  Target,
  Trash2,
  TrendingUp,
  Sparkles,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { createClient } from '@/lib/supabase/browser'
import { deleteRemoteMock, fetchRemoteMocks, getAuthenticatedUserId, mergeMocks, upsertRemoteMocks } from '@/lib/study-sync'
import { cn } from '@/lib/utils'
import {
  computeMockMetrics,
  createMockFromDraft,
  deriveSessionTone,
  loadMocks,
  mockFocusHint,
  MOCK_SECTION_LABELS,
  saveMocks,
  scoreColor,
  type MockRecord,
  type MockSectionScore,
} from '@/lib/study-workspace'

type MockDraft = {
  takenAt: string
  totalScore: string
  timeTakenMinutes: string
  feltDifficulty: 'calm' | 'steady' | 'rushed'
  notes: string
  sectionScores: MockSectionScore[]
}

function createDraft(now = new Date()): MockDraft {
  return {
    takenAt: now.toISOString().slice(0, 10),
    totalScore: '',
    timeTakenMinutes: '270',
    feltDifficulty: 'steady',
    notes: '',
    sectionScores: MOCK_SECTION_LABELS.map((label) => ({ label, score: 0 })),
  }
}

function draftFromRecord(record: MockRecord): MockDraft {
  return {
    takenAt: record.takenAt,
    totalScore: String(record.totalScore),
    timeTakenMinutes: String(record.timeTakenMinutes),
    feltDifficulty: record.feltDifficulty,
    notes: record.notes,
    sectionScores: MOCK_SECTION_LABELS.map((label) => ({
      label,
      score: record.sectionScores.find((section) => section.label === label)?.score ?? 0,
    })),
  }
}

function sortAttempts(attempts: MockRecord[]) {
  return attempts.slice().sort((a, b) => new Date(b.takenAt).getTime() - new Date(a.takenAt).getTime())
}

function SectionScoresPanel({
  draft,
  setDraft,
}: {
  draft: MockDraft
  setDraft: React.Dispatch<React.SetStateAction<MockDraft>>
}) {
  const [open, setOpen] = useState(false)
  const hasScores = draft.sectionScores.some((s) => s.score > 0)

  return (
    <div className="rounded-2xl border border-pink-100 bg-pink-50/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-slate-700"
      >
        <span className="flex items-center gap-2">
          {open ? <ChevronDown size={16} className="text-pink-400" /> : <ChevronRight size={16} className="text-pink-400" />}
          Section breakdown
          <span className="text-xs font-normal text-slate-400">(optional)</span>
        </span>
        {!open && hasScores ? (
          <span className="rounded-full border border-pink-200 bg-pink-50 px-2 py-0.5 text-[10px] text-pink-500">
            {draft.sectionScores.filter((s) => s.score > 0).length} sections filled
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="grid gap-3 px-4 pb-4 md:grid-cols-2">
          {draft.sectionScores.map((section, index) => (
            <label key={section.label} className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">{section.label}</span>
              <input
                type="number"
                min="0"
                max="100"
                value={section.score}
                onChange={(event) => {
                  const nextSections = draft.sectionScores.slice()
                  nextSections[index] = { ...nextSections[index], score: Number(event.target.value) }
                  setDraft({ ...draft, sectionScores: nextSections })
                }}
                className="w-full rounded-2xl border border-pink-100 bg-white px-4 py-3 text-slate-900 outline-none"
                placeholder="Section score"
              />
            </label>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export default function MocksPage() {
  const [supabase] = useState(() => createClient())
  const [attempts, setAttempts] = useState<MockRecord[]>([])
  const [draft, setDraft] = useState<MockDraft>(createDraft())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [remoteUserId, setRemoteUserId] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function hydrate() {
      const localMocks = loadMocks()
      const userId = await getAuthenticatedUserId(supabase)

      if (!active) {
        return
      }

      if (!userId) {
        setRemoteUserId(null)
        setAttempts(sortAttempts(localMocks))
        setReady(true)
        return
      }

      setRemoteUserId(userId)

      try {
        const remoteMocks = await fetchRemoteMocks(supabase, userId)
        if (!active) {
          return
        }

        const mergedMocks = sortAttempts(mergeMocks(localMocks, remoteMocks))
        setAttempts(mergedMocks)
        saveMocks(mergedMocks)
        await upsertRemoteMocks(supabase, userId, mergedMocks)
      } catch {
        if (!active) {
          return
        }

        setAttempts(sortAttempts(localMocks))
      }

      if (active) {
        setReady(true)
      }
    }

    hydrate()

    return () => {
      active = false
    }
  }, [supabase])

  const metrics = computeMockMetrics(attempts)
  const chartData = metrics.scoreTrend

  function resetDraft() {
    setEditingId(null)
    setDraft(createDraft())
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const nextAttempt = createMockFromDraft({
      id: editingId ?? undefined,
      takenAt: draft.takenAt,
      totalScore: Number(draft.totalScore) || 0,
      timeTakenMinutes: Number(draft.timeTakenMinutes) || 0,
      feltDifficulty: draft.feltDifficulty,
      notes: draft.notes,
      sectionScores: draft.sectionScores.map((section) => ({
        label: section.label,
        score: Number(section.score) || 0,
      })),
    })

    const existing = attempts.filter((attempt) => attempt.id !== nextAttempt.id)
    const nextAttempts = sortAttempts([nextAttempt, ...existing])
    setAttempts(nextAttempts)
    saveMocks(nextAttempts)
    if (remoteUserId) {
      void upsertRemoteMocks(supabase, remoteUserId, nextAttempts)
    }
    setEditingId(nextAttempt.id)
    setDraft(draftFromRecord(nextAttempt))
  }

  function handleEdit(attempt: MockRecord) {
    setEditingId(attempt.id)
    setDraft(draftFromRecord(attempt))
  }

  function handleDelete(id: string) {
    const nextAttempts = attempts.filter((attempt) => attempt.id !== id)
    setAttempts(nextAttempts)
    saveMocks(nextAttempts)
    if (remoteUserId) {
      void deleteRemoteMock(supabase, remoteUserId, id)
    }

    if (editingId === id) {
      resetDraft()
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="space-y-8"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Mocks</h1>
          <p className="mt-2 max-w-2xl text-base text-slate-600 sm:text-lg">
            Log full-length attempts, compare section performance, and keep the history synced across devices when you are signed in.
          </p>
        </div>

        <button
          type="button"
          onClick={resetDraft}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-pink-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-pink-200 transition-transform hover:-translate-y-0.5"
        >
          <Plus size={16} />
          New mock
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="soft-panel rounded-[1.75rem] p-4 sm:p-5">
          <p className="text-sm text-slate-500">Logged mocks</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{metrics.total}</p>
        </div>
        <div className="soft-panel rounded-[1.75rem] p-4 sm:p-5">
          <p className="text-sm text-slate-500">Average score</p>
          <p className={cn('mt-2 text-3xl font-semibold', scoreColor(metrics.averageScore))}>
            {metrics.total > 0 ? `${metrics.averageScore}%` : '0%'}
          </p>
        </div>
        <div className="soft-panel rounded-[1.75rem] p-4 sm:p-5">
          <p className="text-sm text-slate-500">Average time</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{metrics.averageTime || '0'}m</p>
        </div>
        <div className="soft-panel rounded-[1.75rem] p-4 sm:p-5">
          <p className="text-sm text-slate-500">Weakest section</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {metrics.weakestSection?.label ?? 'None'}
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <div className="space-y-6">
          <div className="soft-panel rounded-[2rem] p-4 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                <GraduationCap className="text-pink-500" size={18} />
                Mock logger
              </h2>
              <span className="rounded-full border border-pink-200 bg-pink-50 px-3 py-1 text-xs font-semibold text-pink-500">
                {editingId ? 'Editing attempt' : 'Add attempt'}
              </span>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid gap-4 md:grid-cols-3">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">Mock date</span>
                  <input
                    type="date"
                    value={draft.takenAt}
                    onChange={(event) => setDraft({ ...draft, takenAt: event.target.value })}
                    className="w-full rounded-2xl border border-pink-100 bg-white px-4 py-3 text-slate-900 outline-none"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">Total score</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={draft.totalScore}
                    onChange={(event) => setDraft({ ...draft, totalScore: event.target.value })}
                    className="w-full rounded-2xl border border-pink-100 bg-white px-4 py-3 text-slate-900 outline-none"
                    placeholder="72"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">Time taken (min)</span>
                  <input
                    type="number"
                    min="1"
                    value={draft.timeTakenMinutes}
                    onChange={(event) => setDraft({ ...draft, timeTakenMinutes: event.target.value })}
                    className="w-full rounded-2xl border border-pink-100 bg-white px-4 py-3 text-slate-900 outline-none"
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {(['calm', 'steady', 'rushed'] as const).map((tone) => (
                  <label
                    key={tone}
                    className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-pink-100 bg-pink-50/60 px-4 py-3 text-sm font-medium text-slate-700"
                  >
                    <input
                      type="radio"
                      name="feltDifficulty"
                      checked={draft.feltDifficulty === tone}
                      onChange={() => setDraft({ ...draft, feltDifficulty: tone })}
                      className="accent-pink-500"
                    />
                    {tone}
                  </label>
                ))}
              </div>

              <SectionScoresPanel draft={draft} setDraft={setDraft} />

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Notes</span>
                <textarea
                  rows={4}
                  value={draft.notes}
                  onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                  className="w-full rounded-3xl border border-pink-100 bg-white px-4 py-3 text-slate-900 outline-none"
                  placeholder="What felt weak, rushed, or surprising?"
                />
              </label>

              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-pink-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-pink-200 transition-transform hover:-translate-y-0.5"
                >
                  <BadgeCheck size={16} />
                  Save mock
                </button>
                <button
                  type="button"
                  onClick={resetDraft}
                  className="rounded-2xl border border-pink-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
                >
                  Clear
                </button>
              </div>
            </form>
          </div>

          <div className="soft-panel rounded-[2rem] p-4 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                <CalendarClock className="text-pink-500" size={18} />
                Logged attempts
              </h2>
              <span className="rounded-full border border-pink-200 bg-pink-50 px-3 py-1 text-xs font-semibold text-pink-500">
                {ready ? `${attempts.length} saved` : 'Loading...'}
              </span>
            </div>

            <div className="space-y-3">
              {ready && attempts.length === 0 ? (
                <div className="rounded-[1.5rem] border border-dashed border-pink-200 bg-white/70 p-6 text-sm text-slate-600">
                  Save your first mock to unlock score trends, section gaps, and pacing insights.
                </div>
              ) : null}

              {sortAttempts(attempts).map((attempt) => (
                <article
                  key={attempt.id}
                  className={cn(
                    'rounded-[1.5rem] border bg-white p-5 transition-colors',
                    editingId === attempt.id ? 'border-pink-300 shadow-[0_14px_30px_-18px_rgba(244,114,182,0.45)]' : 'border-pink-100 hover:border-pink-200',
                  )}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Target size={14} className="text-pink-500" />
                        <p className="text-lg font-semibold text-slate-900">{attempt.totalScore}%</p>
                        <span className="rounded-full border border-pink-100 bg-pink-50 px-2 py-1 text-[10px] uppercase tracking-[0.25em] text-pink-500">
                          {deriveSessionTone(attempt.totalScore)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {attempt.takenAt} · {attempt.timeTakenMinutes} minutes · {attempt.feltDifficulty}
                      </p>
                      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                        {attempt.notes || 'No session notes were added.'}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleEdit(attempt)}
                        className="rounded-full border border-pink-100 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(attempt.id)}
                        className="inline-flex items-center gap-1 rounded-full border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600"
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {attempt.sectionScores.map((section) => (
                      <div key={section.label} className="rounded-2xl border border-pink-100 bg-pink-50/50 px-3 py-2 text-sm text-slate-700">
                        <span className="font-medium text-slate-900">{section.label}:</span> {section.score}%
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="soft-panel rounded-[2rem] p-4 sm:p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
              <TrendingUp className="text-pink-500" size={18} />
              Score trend
            </h2>
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#fde2ef" />
                  <XAxis dataKey="day" tick={{ fontSize: 12, fill: '#8b8b9d' }} />
                  <YAxis tick={{ fontSize: 12, fill: '#8b8b9d' }} domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #fbcfe8', borderRadius: '16px' }}
                  />
                  <Line type="monotone" dataKey="score" stroke="#ec4899" strokeWidth={3} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="soft-panel rounded-[2rem] p-4 sm:p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
              <Clock3 className="text-pink-500" size={18} />
              Section averages
            </h2>
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.sectionAverages}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#fde2ef" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#8b8b9d' }} />
                  <YAxis tick={{ fontSize: 12, fill: '#8b8b9d' }} domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #fbcfe8', borderRadius: '16px' }}
                  />
                  <Bar dataKey="value" radius={[10, 10, 0, 0]} fill="#f472b6" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="soft-panel rounded-[2rem] p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
              <Sparkles className="text-pink-500" size={18} />
              What next
            </h2>
            <p className="text-sm leading-6 text-slate-600">{mockFocusHint(metrics)}</p>
            <div className="mt-4 rounded-[1.5rem] border border-pink-100 bg-white p-4 text-sm text-slate-600">
              Keep the review short: one error review block, one formula block, one timing block.
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
