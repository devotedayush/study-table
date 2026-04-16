'use client'

import { useEffect, useState, useTransition, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { CalendarDays, CloudUpload, Save, Shield, SlidersHorizontal, Sparkles, UserCog } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { SyncBadge } from '@/components/sync-badge'
import { loadFlashcardProgressMap } from '@/lib/flashcard-progress'
import { loadAssessments, loadProgressMap } from '@/lib/study-engine'
import { cn } from '@/lib/utils'
import {
  getAuthenticatedUserId,
  upsertRemoteAssessments,
  upsertRemoteFlashcardProgress,
  upsertRemoteMocks,
  upsertRemoteNotes,
  upsertRemoteProgressMap,
} from '@/lib/study-sync'
import { createClient } from '@/lib/supabase/browser'
import { getStudyContext } from '@/lib/study-context'
import {
  DEFAULT_STUDY_PREFERENCES,
  loadStudyPreferences,
  saveStudyPreferences,
  type StudyPreferences,
} from '@/lib/study-preferences'
import { loadMocks, loadNotes } from '@/lib/study-workspace'

const restDayOptions = [
  { label: 'Mon', value: 'mon' },
  { label: 'Tue', value: 'tue' },
  { label: 'Wed', value: 'wed' },
  { label: 'Thu', value: 'thu' },
  { label: 'Fri', value: 'fri' },
  { label: 'Sat', value: 'sat' },
  { label: 'Sun', value: 'sun' },
]

function loadInitialPreferences() {
  return loadStudyPreferences()
}

export default function SettingsPage() {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const [isPending, startTransition] = useTransition()
  const [isSaving, setIsSaving] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [hasRemoteSession, setHasRemoteSession] = useState(false)
  const [profileName, setProfileName] = useState<string>('Study profile')
  const [preferences, setPreferences] = useState<StudyPreferences>(loadInitialPreferences)

  useEffect(() => {
    let active = true

    async function hydrate() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!active) {
        return
      }

      if (!user) {
        return
      }

      setHasRemoteSession(true)
      setProfileName(user.user_metadata?.username ? `${user.user_metadata.username}'s study profile` : 'Study profile')

      const { data: profile } = await supabase
        .from('profiles')
        .select('exam_date, target_study_hours, preferred_session_minutes, preferred_pacing, preferred_rest_days')
        .eq('id', user.id)
        .maybeSingle()

      if (!active) {
        return
      }

      if (profile) {
        const nextPreferences: StudyPreferences = {
          examDate: profile.exam_date ?? '',
          targetStudyHours: Number(profile.target_study_hours ?? DEFAULT_STUDY_PREFERENCES.targetStudyHours),
          preferredSessionMinutes: Number(profile.preferred_session_minutes ?? DEFAULT_STUDY_PREFERENCES.preferredSessionMinutes),
          preferredPacing: profile.preferred_pacing ?? DEFAULT_STUDY_PREFERENCES.preferredPacing,
          preferredRestDays: profile.preferred_rest_days ?? [],
        }

        setPreferences(nextPreferences)
        saveStudyPreferences(nextPreferences)
        return
      }

      setPreferences(loadStudyPreferences())
    }

    hydrate()

    return () => {
      active = false
    }
  }, [supabase])

  const previewProfile = {
    id: 'settings-preview',
    username: 'preview',
    email: 'preview@example.com',
    exam_date: preferences.examDate || null,
    target_study_hours: preferences.targetStudyHours,
    preferred_session_minutes: preferences.preferredSessionMinutes,
    preferred_pacing: preferences.preferredPacing,
    preferred_rest_days: preferences.preferredRestDays,
    onboarding_completed: true,
  }
  const studyContext = getStudyContext(previewProfile)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)
    setIsSaving(true)

    try {
      saveStudyPreferences(preferences)

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        const { error } = await supabase.from('profiles').upsert({
          id: user.id,
          username: user.user_metadata?.username ?? user.email?.split('@')[0] ?? 'user',
          email: user.email ?? '',
          exam_date: preferences.examDate || null,
          target_study_hours: preferences.targetStudyHours,
          preferred_session_minutes: preferences.preferredSessionMinutes,
          preferred_pacing: preferences.preferredPacing,
          preferred_rest_days: preferences.preferredRestDays,
          onboarding_completed: true,
        })

        if (error) {
          setMessage(error.message)
          return
        }
      }

      startTransition(() => {
        router.refresh()
      })
      setMessage(hasRemoteSession ? 'Saved to your profile and synced.' : 'Saved locally in this browser.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleImportLocalData() {
    setMessage(null)
    setIsImporting(true)

    try {
      const userId = await getAuthenticatedUserId(supabase)

      if (!userId) {
        setMessage('Sign in with your real account before importing local browser data to cloud.')
        return
      }

      const localProgress = loadProgressMap()
      const localAssessments = loadAssessments()
      const localNotes = loadNotes()
      const localMocks = loadMocks()
      const localFlashcards = loadFlashcardProgressMap()

      await Promise.all([
        upsertRemoteProgressMap(supabase, userId, localProgress),
        upsertRemoteAssessments(supabase, userId, localAssessments),
        upsertRemoteNotes(supabase, userId, localNotes),
        upsertRemoteMocks(supabase, userId, localMocks),
        upsertRemoteFlashcardProgress(supabase, userId, localFlashcards),
      ])

      const importedCount =
        Object.keys(localProgress).length +
        localAssessments.length +
        localNotes.length +
        localMocks.length +
        Object.keys(localFlashcards).length

      setMessage(importedCount > 0 ? `Imported ${importedCount} local study records to cloud.` : 'No local study records were found to import.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Cloud import failed.')
    } finally {
      setIsImporting(false)
    }
  }

  function toggleRestDay(day: string) {
    setPreferences((current) => {
      const selected = current.preferredRestDays.includes(day)
      const preferredRestDays = selected
        ? current.preferredRestDays.filter((item) => item !== day)
        : [...current.preferredRestDays, day]

      return { ...current, preferredRestDays }
    })
  }

  function resetPreferences() {
    setPreferences(DEFAULT_STUDY_PREFERENCES)
    saveStudyPreferences(DEFAULT_STUDY_PREFERENCES)
    setMessage('Reset to defaults for this browser.')
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
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900">Settings</h1>
          <p className="mt-2 max-w-2xl text-lg text-slate-600">
            Update your exam date and study rhythm. The preview on the right updates immediately so you can see the impact.
          </p>
          <div className="mt-3">
            <SyncBadge />
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={resetPreferences}
            className="rounded-2xl border border-pink-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
          >
            Reset defaults
          </button>
          <button
            form="settings-form"
            type="submit"
            disabled={isSaving || isPending}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-pink-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <Save size={16} />
            {isSaving || isPending ? 'Saving...' : 'Save settings'}
          </button>
          <button
            type="button"
            onClick={handleImportLocalData}
            disabled={!hasRemoteSession || isImporting}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-pink-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <CloudUpload size={16} />
            {isImporting ? 'Importing...' : 'Import local data'}
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="soft-panel rounded-[1.75rem] p-5">
          <p className="text-sm text-slate-500">Days left</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{studyContext.daysRemaining ?? '—'}</p>
        </div>
        <div className="soft-panel rounded-[1.75rem] p-5">
          <p className="text-sm text-slate-500">Urgency</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{studyContext.urgency}</p>
        </div>
        <div className="soft-panel rounded-[1.75rem] p-5">
          <p className="text-sm text-slate-500">Weekly target</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{studyContext.targetHours}h</p>
        </div>
        <div className="soft-panel rounded-[1.75rem] p-5">
          <p className="text-sm text-slate-500">Daily load</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{studyContext.dailyLoad} blocks</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="soft-panel rounded-[2rem] p-6">
          <div className="mb-6 flex items-center gap-3">
            <UserCog className="text-pink-500" size={20} />
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{profileName}</h2>
              <p className="text-sm text-slate-500">
                {hasRemoteSession ? 'Updates sync to Supabase and this browser.' : 'Updates are stored locally in this browser.'}
              </p>
            </div>
          </div>

          <div className="mb-6 rounded-[1.5rem] border border-pink-100 bg-pink-50/60 p-4 text-sm text-slate-600">
            Use <span className="font-semibold text-slate-900">Import local data</span> if you want to push this browser&apos;s progress, notes, mocks, and flashcard confidence into Supabase immediately.
          </div>

          <form id="settings-form" className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Exam date</span>
                <input
                  type="date"
                  value={preferences.examDate}
                  onChange={(event) => setPreferences((current) => ({ ...current, examDate: event.target.value }))}
                  className="app-select"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Study target hours per week</span>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={preferences.targetStudyHours}
                  onChange={(event) =>
                    setPreferences((current) => ({ ...current, targetStudyHours: Number(event.target.value) || 0 }))
                  }
                  className="w-full rounded-2xl border border-pink-100 bg-white px-4 py-3 text-slate-900 outline-none"
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Preferred session length</span>
                <input
                  type="number"
                  min="30"
                  max="180"
                  step="5"
                  value={preferences.preferredSessionMinutes}
                  onChange={(event) =>
                    setPreferences((current) => ({
                      ...current,
                      preferredSessionMinutes: Number(event.target.value) || 0,
                    }))
                  }
                  className="w-full rounded-2xl border border-pink-100 bg-white px-4 py-3 text-slate-900 outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Planning style</span>
                <select
                  value={preferences.preferredPacing}
                  onChange={(event) =>
                    setPreferences((current) => ({
                      ...current,
                      preferredPacing: event.target.value as StudyPreferences['preferredPacing'],
                    }))
                  }
                  className="w-full rounded-2xl border border-pink-100 bg-white px-4 py-3 text-slate-900 outline-none"
                >
                  <option value="gentle">Gentle</option>
                  <option value="balanced">Balanced</option>
                  <option value="aggressive">Aggressive</option>
                </select>
              </label>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="block text-sm font-medium text-slate-700">Preferred rest days</span>
                <span className="text-xs text-slate-500">Tap to toggle</span>
              </div>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                {restDayOptions.map((day) => {
                  const selected = preferences.preferredRestDays.includes(day.value)
                  return (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => toggleRestDay(day.value)}
                      className={cn(
                        'rounded-2xl border px-2 py-2 text-sm font-medium transition-colors',
                        selected
                          ? 'border-pink-200 bg-pink-500 text-white'
                          : 'border-pink-100 bg-white text-slate-600 hover:bg-pink-50',
                      )}
                    >
                      {day.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {message ? (
              <p className="rounded-2xl border border-pink-200 bg-pink-50 px-4 py-3 text-sm text-slate-700">{message}</p>
            ) : null}
          </form>
        </div>

        <div className="space-y-6">
          <div className="soft-panel rounded-[2rem] p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
              <CalendarDays className="text-pink-500" size={18} />
              Study preview
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.5rem] border border-pink-100 bg-white p-4">
                <p className="text-xs uppercase tracking-[0.25em] text-pink-400">Exam date</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{studyContext.examDateLabel}</p>
              </div>
              <div className="rounded-[1.5rem] border border-pink-100 bg-white p-4">
                <p className="text-xs uppercase tracking-[0.25em] text-pink-400">Session length</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{studyContext.sessionMinutes}m</p>
              </div>
              <div className="rounded-[1.5rem] border border-pink-100 bg-white p-4">
                <p className="text-xs uppercase tracking-[0.25em] text-pink-400">Rest days</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  {preferences.preferredRestDays.length > 0 ? preferences.preferredRestDays.join(', ') : 'None selected'}
                </p>
              </div>
              <div className="rounded-[1.5rem] border border-pink-100 bg-white p-4">
                <p className="text-xs uppercase tracking-[0.25em] text-pink-400">Pacing</p>
                <p className="mt-2 text-lg font-semibold capitalize text-slate-900">{preferences.preferredPacing}</p>
              </div>
            </div>

            <div className="mt-4 rounded-[1.5rem] border border-pink-100 bg-pink-50/70 p-4 text-sm text-slate-600">
              This preview is based on the same study context that powers the dashboard, so changing the exam date updates urgency everywhere.
            </div>
          </div>

          <div className="soft-panel rounded-[2rem] p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
              <SlidersHorizontal className="text-pink-500" size={18} />
              What this controls
            </h2>
            <div className="space-y-3 text-sm leading-6 text-slate-600">
              <p>Exam date drives urgency, countdowns, and the daily load estimate.</p>
              <p>Study target and session length shape the planner and dashboard recommendations.</p>
              <p>Rest days keep the plan realistic when the week gets crowded.</p>
            </div>
          </div>

          <div className="soft-panel rounded-[2rem] p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
              <Shield className="text-pink-500" size={18} />
              Sync status
            </h2>
            <p className="text-sm leading-6 text-slate-600">
              {hasRemoteSession
                ? 'Saved settings update the remote profile and will flow back into the dashboard.'
                : 'You are editing local settings only, which is perfect for testing or demo mode.'}
            </p>
            <div className="mt-4 flex items-center gap-3">
              <Sparkles className="text-pink-500" size={18} />
              <span className="text-sm font-medium text-slate-700">Changes apply immediately after save.</span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
