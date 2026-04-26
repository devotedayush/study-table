'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Calculator, CheckCircle2, Filter, RotateCcw, Search, Sparkles, Target, XCircle } from 'lucide-react'
import { calculatorDrills, calculatorSkills, formulaHeavySubjects, type CalculatorDrill } from '@/lib/revision-content'
import {
  getCalculatorDrillProgress,
  loadCalculatorDrillProgressMap,
  mergeCalculatorDrillProgress,
  saveCalculatorDrillProgressMap,
  type CalculatorDrillProgress,
} from '@/lib/revision-progress'
import { createClient } from '@/lib/supabase/browser'
import {
  fetchRemoteCalculatorDrillProgress,
  getAuthenticatedUserId,
  upsertRemoteCalculatorDrillProgress,
} from '@/lib/study-sync'
import { cn } from '@/lib/utils'
import { PracticeHubTabs } from '@/components/section-tabs'

const allSubjects = 'All subjects'
const allSkills = 'All skills'
const allDifficulties = 'All levels'

function parseAnswer(value: string) {
  const cleaned = value.replace(/,/g, '').replace(/%/g, '').replace(/x$/i, '').trim()
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

function accuracy(progress: CalculatorDrillProgress) {
  if (progress.attemptedCount === 0) {
    return 0
  }

  return Math.round((progress.correctCount / progress.attemptedCount) * 100)
}

function resultStatus(progress: CalculatorDrillProgress, correct: boolean) {
  const nextAttempted = progress.attemptedCount + 1
  const nextCorrect = progress.correctCount + (correct ? 1 : 0)
  const nextAccuracy = nextCorrect / nextAttempted

  if (!correct) {
    return 'weak' as const
  }

  if (nextAttempted >= 2 && nextAccuracy >= 0.8) {
    return 'mastered' as const
  }

  return 'steady' as const
}

function statusTone(status: CalculatorDrillProgress['status']) {
  if (status === 'mastered') {
    return 'border-emerald-200 bg-emerald-50 text-foreground'
  }

  if (status === 'weak') {
    return 'border-rose-200 bg-rose-50 text-rose-700'
  }

  if (status === 'steady') {
    return 'border-sky-200 bg-sky-50 text-sky-700'
  }

  return 'border-border bg-card text-muted-foreground'
}

export default function CalculatorDrillsPage() {
  const [supabase] = useState(() => createClient())
  const [progressMap, setProgressMap] = useState<Record<string, CalculatorDrillProgress>>({})
  const [remoteUserId, setRemoteUserId] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})
  const [lastResult, setLastResult] = useState<Record<string, boolean | null>>({})
  const [query, setQuery] = useState('')
  const [subject, setSubject] = useState(allSubjects)
  const [skill, setSkill] = useState(allSkills)
  const [difficulty, setDifficulty] = useState(allDifficulties)
  const [weakOnly, setWeakOnly] = useState(false)
  const [unattemptedOnly, setUnattemptedOnly] = useState(false)

  useEffect(() => {
    let active = true

    async function hydrate() {
      const localProgress = loadCalculatorDrillProgressMap()
      const userId = await getAuthenticatedUserId(supabase)

      if (!active) {
        return
      }

      if (!userId) {
        setRemoteUserId(null)
        setProgressMap(localProgress)
        return
      }

      setRemoteUserId(userId)

      try {
        const remoteProgress = await fetchRemoteCalculatorDrillProgress(supabase, userId)
        if (!active) {
          return
        }

        const mergedProgress = mergeCalculatorDrillProgress(localProgress, remoteProgress)
        setProgressMap(mergedProgress)
        saveCalculatorDrillProgressMap(mergedProgress)
        await upsertRemoteCalculatorDrillProgress(supabase, userId, mergedProgress)
      } catch {
        if (active) {
          setProgressMap(localProgress)
        }
      }
    }

    hydrate()

    return () => {
      active = false
    }
  }, [supabase])

  const filteredDrills = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return calculatorDrills.filter((drill) => {
      const progress = getCalculatorDrillProgress(progressMap, drill.id)
      const haystack = [
        drill.subject,
        drill.module,
        drill.skill,
        drill.question,
        drill.expectedAnswer,
        drill.baIIPlusKeystrokes.join(' '),
        drill.trick,
        drill.explanation,
        drill.tags.join(' '),
      ]
        .join(' ')
        .toLowerCase()

      return (
        (subject === allSubjects || drill.subject === subject) &&
        (skill === allSkills || drill.skill === skill) &&
        (difficulty === allDifficulties || drill.difficulty === difficulty) &&
        (!weakOnly || progress.status === 'weak') &&
        (!unattemptedOnly || progress.attemptedCount === 0) &&
        (normalizedQuery.length === 0 || haystack.includes(normalizedQuery))
      )
    })
  }, [difficulty, progressMap, query, skill, subject, unattemptedOnly, weakOnly])

  const attemptedCount = calculatorDrills.filter((drill) => getCalculatorDrillProgress(progressMap, drill.id).attemptedCount > 0).length
  const weakCount = calculatorDrills.filter((drill) => getCalculatorDrillProgress(progressMap, drill.id).status === 'weak').length
  const masteredCount = calculatorDrills.filter((drill) => getCalculatorDrillProgress(progressMap, drill.id).status === 'mastered').length
  const totalAttempts = calculatorDrills.reduce((sum, drill) => sum + getCalculatorDrillProgress(progressMap, drill.id).attemptedCount, 0)
  const totalCorrect = calculatorDrills.reduce((sum, drill) => sum + getCalculatorDrillProgress(progressMap, drill.id).correctCount, 0)
  const overallAccuracy = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0

  function persistProgress(nextProgress: Record<string, CalculatorDrillProgress>) {
    setProgressMap(nextProgress)
    saveCalculatorDrillProgressMap(nextProgress)
    if (remoteUserId) {
      void upsertRemoteCalculatorDrillProgress(supabase, remoteUserId, nextProgress)
    }
  }

  function submitAnswer(drill: CalculatorDrill) {
    const answer = answers[drill.id] ?? ''
    const parsed = parseAnswer(answer)

    if (parsed === null) {
      setLastResult((current) => ({ ...current, [drill.id]: false }))
      setRevealed((current) => ({ ...current, [drill.id]: true }))
      return
    }

    const correct = Math.abs(parsed - drill.numericAnswer) <= drill.tolerance
    const current = getCalculatorDrillProgress(progressMap, drill.id)
    const now = new Date().toISOString()
    const nextProgress = {
      ...progressMap,
      [drill.id]: {
        attemptedCount: current.attemptedCount + 1,
        correctCount: current.correctCount + (correct ? 1 : 0),
        lastAnswer: answer.trim(),
        lastAttemptedAt: now,
        status: resultStatus(current, correct),
        updatedAt: now,
      },
    }

    setLastResult((currentResults) => ({ ...currentResults, [drill.id]: correct }))
    setRevealed((currentRevealed) => ({ ...currentRevealed, [drill.id]: true }))
    persistProgress(nextProgress)
  }

  function resetLocalProgress() {
    persistProgress({})
    setLastResult({})
    setRevealed({})
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: 'easeOut' }} className="space-y-8">
      <PracticeHubTabs />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Calculator Drills</h1>
          <p className="mt-2 max-w-3xl text-base text-muted-foreground sm:text-lg">
            BA II Plus practice sums for CFA Level I timing, signs, worksheets, and formula shortcuts.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-4 text-right sm:px-5">
          <p className="text-[10px] uppercase tracking-[0.28em] text-pink-400">Accuracy</p>
          <p className="mt-1 text-3xl font-semibold text-foreground">{overallAccuracy}%</p>
        </div>
      </div>

      <div className="soft-panel rounded-lg p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[1.2fr_0.8fr_0.8fr_0.55fr_auto_auto]">
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
              <Search size={15} className="text-primary" />
              Search
            </span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search TVM, bond, NPV, FX, duration"
              className="w-full rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground outline-none focus:border-ring focus:ring-4 focus:ring-ring/50"
            />
          </label>

          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
              <Filter size={15} className="text-primary" />
              Subject
            </span>
            <select value={subject} onChange={(event) => setSubject(event.target.value)} className="app-select">
              <option>{allSubjects}</option>
              {formulaHeavySubjects.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
              <Target size={15} className="text-primary" />
              Skill
            </span>
            <select value={skill} onChange={(event) => setSkill(event.target.value)} className="app-select">
              <option>{allSkills}</option>
              {calculatorSkills.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-foreground">Level</span>
            <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)} className="app-select">
              <option>{allDifficulties}</option>
              <option value="easy">easy</option>
              <option value="medium">medium</option>
              <option value="hard">hard</option>
            </select>
          </label>

          <label className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-foreground">
            <input type="checkbox" checked={weakOnly} onChange={(event) => setWeakOnly(event.target.checked)} className="accent-pink-500" />
            Weak
          </label>

          <label className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-foreground">
            <input type="checkbox" checked={unattemptedOnly} onChange={(event) => setUnattemptedOnly(event.target.checked)} className="accent-pink-500" />
            New
          </label>
        </div>
      </div>

      <div className="grid gap-5">
        {filteredDrills.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card/70 p-6 text-sm text-muted-foreground">
            No calculator drills match those filters.
          </div>
        ) : null}

        {filteredDrills.map((drill) => {
          const progress = getCalculatorDrillProgress(progressMap, drill.id)
          const isRevealed = revealed[drill.id] ?? false
          const result = lastResult[drill.id] ?? null

          return (
            <article key={drill.id} className="soft-panel rounded-lg p-4 sm:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-lg border border-border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground">
                      {drill.subject}
                    </span>
                    <span className="rounded-lg border border-border bg-secondary px-3 py-1 text-xs font-semibold text-primary">
                      {drill.skill}
                    </span>
                    <span className={cn('rounded-lg border px-3 py-1 text-xs font-semibold capitalize', statusTone(progress.status))}>
                      {progress.status.replace('_', ' ')}
                    </span>
                  </div>
                  <h2 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">{drill.question}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {drill.module} / {drill.difficulty} / {progress.attemptedCount} attempts / {accuracy(progress)}% accuracy
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-muted-foreground">
                  Answer format: {drill.expectedAnswer}
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto]">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-foreground">Your answer</span>
                  <input
                    value={answers[drill.id] ?? ''}
                    onChange={(event) => setAnswers((current) => ({ ...current, [drill.id]: event.target.value }))}
                    placeholder="Type number, percent, or multiple"
                    className="w-full rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground outline-none focus:border-ring focus:ring-4 focus:ring-ring/50"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => submitAnswer(drill)}
                  disabled={!answers[drill.id]?.trim()}
                  className="mt-auto inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Calculator size={16} />
                  Check
                </button>
                <button
                  type="button"
                  onClick={() => setRevealed((current) => ({ ...current, [drill.id]: true }))}
                  disabled={progress.attemptedCount === 0}
                  className="mt-auto inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-5 py-3 text-sm font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Reveal
                </button>
              </div>

              {isRevealed ? (
                <div className="mt-5 grid gap-4 xl:grid-cols-[0.7fr_1fr_1fr]">
                  <section className="rounded-lg border border-border bg-card p-4">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.24em] text-pink-400">Result</h3>
                    <div className="mt-3 flex items-center gap-2">
                      {result === null ? (
                        <Sparkles size={18} className="text-primary" />
                      ) : result ? (
                        <CheckCircle2 size={18} className="text-emerald-600" />
                      ) : (
                        <XCircle size={18} className="text-rose-600" />
                      )}
                      <p className="text-lg font-semibold text-foreground">{drill.expectedAnswer}</p>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">{drill.explanation}</p>
                  </section>

                  <section className="rounded-lg border border-border bg-card p-4">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.24em] text-pink-400">BA II Plus</h3>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {drill.baIIPlusKeystrokes.map((step) => (
                        <span key={step} className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-xs font-semibold text-foreground">
                          {step}
                        </span>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-lg border border-border bg-card p-4">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.24em] text-pink-400">Trick</h3>
                    <p className="mt-3 text-sm leading-6 text-foreground">{drill.trick}</p>
                  </section>
                </div>
              ) : null}
            </article>
          )
        })}
      </div>

      <div className="soft-panel rounded-lg p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <RotateCcw className="text-primary" size={18} />
              Reset local calculator progress
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">Use this when you want a clean practice run on this browser.</p>
          </div>
          <button
            type="button"
            onClick={resetLocalProgress}
            className="rounded-lg border border-border bg-secondary px-4 py-3 text-sm font-semibold text-primary"
          >
            Clear local progress
          </button>
        </div>
      </div>
    </motion.div>
  )
}
