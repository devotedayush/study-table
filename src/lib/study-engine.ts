'use client'

import { useEffect, useMemo, useState } from 'react'
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import { allSubtopics, cfaLevel1Syllabus, syllabusSubtopicIdAliases, type ProgressStatus } from '@/lib/cfa-data'
import { cfaLevel1Outline } from '@/lib/cfa-outline'
import { createClient } from '@/lib/supabase/browser'
import {
  fetchRemoteAssessments,
  fetchRemoteProgressMap,
  getAuthenticatedUserId,
  mergeAssessments,
  mergeProgressMaps,
  upsertRemoteAssessments,
  upsertRemoteProgressMap,
} from '@/lib/study-sync'
import { loadStudyPreferences, saveStudyPreferences, type StudyPreferences } from '@/lib/study-preferences'
import type { Profile, StudyPacing } from '@/lib/study-context'

const PROGRESS_STORAGE_KEY = 'cfa-study-progress-v1'
const ASSESSMENTS_STORAGE_KEY = 'cfa-study-assessments-v1'

export type ProgressEntry = {
  subtopicId: string
  status: ProgressStatus
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

export type AssessmentEntry = {
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

export type SubjectSummary = {
  id: string
  title: string
  weight: string
  weightValue: number
  totalSubtopics: number
  completedSubtopics: number
  remainingSubtopics: number
  estimatedRemainingMinutes: number
  officialModuleCount: number
  estimatedCompletedModules: number
  estimatedRemainingModules: number
  officialModules: string[]
  coverage: number
  dueNowCount: number
  flaggedCount: number
  nextFocusTitle: string | null
}

type SaveProgressInput = {
  subtopicId: string
  status: ProgressStatus
  completionPercentage?: number | null
  minutesSpent?: number
  selfConfidence?: number | null
  notes?: string
  difficulty?: 'easy' | 'medium' | 'hard' | null
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

export function loadProgressMap() {
  const rawProgress = readJson<Record<string, ProgressEntry>>(PROGRESS_STORAGE_KEY, {})
  const { progressMap, changed } = normalizeProgressMap(rawProgress)

  if (changed) {
    saveProgressMap(progressMap)
  }

  return progressMap
}

export function loadAssessments() {
  const rawAssessments = readJson<AssessmentEntry[]>(ASSESSMENTS_STORAGE_KEY, [])
  const { assessments, changed } = normalizeAssessments(rawAssessments)

  if (changed) {
    saveAssessments(assessments)
  }

  return assessments
}

function saveProgressMap(progress: Record<string, ProgressEntry>) {
  writeJson(PROGRESS_STORAGE_KEY, progress)
}

function saveAssessments(assessments: AssessmentEntry[]) {
  writeJson(ASSESSMENTS_STORAGE_KEY, assessments)
}

function statusRank(status: ProgressStatus) {
  return {
    not_started: 0,
    in_progress: 1,
    completed_once: 2,
    revised: 3,
    mastered: 4,
    flagged: 1,
  }[status]
}

function getDefaultCompletionFromStatus(status: ProgressStatus) {
  return {
    not_started: 0,
    in_progress: 35,
    flagged: 35,
    completed_once: 100,
    revised: 100,
    mastered: 100,
  }[status]
}

function getCompletionPercentage(entry: Pick<ProgressEntry, 'status' | 'completionPercentage'> | null | undefined) {
  if (!entry) {
    return 0
  }

  return entry.completionPercentage ?? getDefaultCompletionFromStatus(entry.status)
}

function latestIso(...values: Array<string | null | undefined>) {
  return values
    .filter(Boolean)
    .sort((a, b) => new Date(b as string).getTime() - new Date(a as string).getTime())[0] ?? null
}

function earliestIso(...values: Array<string | null | undefined>) {
  return values
    .filter(Boolean)
    .sort((a, b) => new Date(a as string).getTime() - new Date(b as string).getTime())[0] ?? null
}

function difficultyRank(difficulty: ProgressEntry['difficulty']) {
  if (!difficulty) {
    return 0
  }

  return {
    hard: 3,
    medium: 2,
    easy: 1,
  }[difficulty]
}

function mergeNotes(first: string, second: string) {
  return [...new Set([first, second].map((note) => note.trim()).filter(Boolean))].join('\n\n')
}

function mergeProgressEntries(first: ProgressEntry, second: ProgressEntry): ProgressEntry {
  const firstStatusRank = statusRank(first.status)
  const secondStatusRank = statusRank(second.status)

  return {
    ...first,
    subtopicId: first.subtopicId,
    status: secondStatusRank > firstStatusRank ? second.status : first.status,
    completionPercentage: Math.max(getCompletionPercentage(first), getCompletionPercentage(second)),
    minutesSpent: first.minutesSpent + second.minutesSpent,
    selfConfidence: Math.max(first.selfConfidence ?? 0, second.selfConfidence ?? 0) || null,
    aiMastery: Math.max(first.aiMastery ?? 0, second.aiMastery ?? 0) || null,
    notes: mergeNotes(first.notes, second.notes),
    difficulty: difficultyRank(second.difficulty) > difficultyRank(first.difficulty) ? second.difficulty : first.difficulty,
    lastStudiedAt: latestIso(first.lastStudiedAt, second.lastStudiedAt),
    firstCompletedAt: earliestIso(first.firstCompletedAt, second.firstCompletedAt),
    revisionDueAt: earliestIso(first.revisionDueAt, second.revisionDueAt),
    revisionCount: Math.max(first.revisionCount, second.revisionCount),
  }
}

function normalizeProgressMap(progressMap: Record<string, ProgressEntry>) {
  let changed = false
  const normalized: Record<string, ProgressEntry> = {}

  for (const [key, entry] of Object.entries(progressMap)) {
    const targetId = syllabusSubtopicIdAliases[key] ?? syllabusSubtopicIdAliases[entry.subtopicId] ?? entry.subtopicId
    const nextEntry = { ...entry, subtopicId: targetId }

    changed ||= targetId !== key || targetId !== entry.subtopicId
    normalized[targetId] = normalized[targetId] ? mergeProgressEntries(normalized[targetId], nextEntry) : nextEntry
  }

  return { progressMap: normalized, changed }
}

function normalizeAssessments(assessments: AssessmentEntry[]) {
  let changed = false
  const normalized = assessments.map((assessment) => {
    const targetId = syllabusSubtopicIdAliases[assessment.subtopicId] ?? assessment.subtopicId
    changed ||= targetId !== assessment.subtopicId
    return { ...assessment, subtopicId: targetId }
  })

  return { assessments: normalized, changed }
}

function buildRevisionDueDate(entry: ProgressEntry, pacing: StudyPacing) {
  const baseDays =
    entry.aiMastery !== null && entry.aiMastery < 2.5
      ? 2
      : entry.aiMastery !== null && entry.aiMastery < 3.5
        ? 4
        : entry.selfConfidence !== null && entry.selfConfidence <= 2
          ? 3
          : 6

  const pacingAdjustment = pacing === 'aggressive' ? -1 : pacing === 'gentle' ? 1 : 0
  const nextGap = Math.max(1, baseDays + pacingAdjustment + entry.revisionCount)
  return addDays(new Date(), nextGap).toISOString()
}

function mergeProfileIntoPreferences(profile?: Partial<Profile> | null) {
  const stored = loadStudyPreferences()
  if (!profile) {
    return stored
  }

  return {
    ...stored,
    examDate: profile.exam_date ?? stored.examDate,
    targetStudyHours: profile.target_study_hours ?? stored.targetStudyHours,
    preferredSessionMinutes: profile.preferred_session_minutes ?? stored.preferredSessionMinutes,
    preferredPacing: profile.preferred_pacing ?? stored.preferredPacing,
    preferredRestDays: profile.preferred_rest_days ?? stored.preferredRestDays,
  }
}

function getSubjectWeightValue(weight: string) {
  const parts = weight.split('-').map((part) => Number(part.replace('%', '').trim()))
  if (parts.length === 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
    return (parts[0] + parts[1]) / 2
  }

  return Number(parts[0] ?? 0)
}

export function useStudyWorkspace(profile?: Partial<Profile> | null) {
  const [supabase] = useState(() => createClient())
  const [progressMap, setProgressMap] = useState<Record<string, ProgressEntry>>({})
  const [assessments, setAssessments] = useState<AssessmentEntry[]>([])
  const [preferences, setPreferences] = useState<StudyPreferences>(() => mergeProfileIntoPreferences(profile))
  const [ready, setReady] = useState(false)
  const [remoteUserId, setRemoteUserId] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function hydrate() {
      const mergedPreferences = mergeProfileIntoPreferences(profile)
      setPreferences(mergedPreferences)
      saveStudyPreferences(mergedPreferences)

      const localProgress = loadProgressMap()
      const localAssessments = loadAssessments()
      const userId = await getAuthenticatedUserId(supabase)

      if (!active) {
        return
      }

      if (!userId) {
        setRemoteUserId(null)
        setProgressMap(localProgress)
        setAssessments(localAssessments)
        setReady(true)
        return
      }

      setRemoteUserId(userId)

      try {
        const [remoteProgress, remoteAssessments] = await Promise.all([
          fetchRemoteProgressMap(supabase, userId),
          fetchRemoteAssessments(supabase, userId),
        ])

        if (!active) {
          return
        }

        const { progressMap: mergedProgress } = normalizeProgressMap(mergeProgressMaps(localProgress, remoteProgress) as Record<string, ProgressEntry>)
        const { assessments: mergedAssessments } = normalizeAssessments(mergeAssessments(localAssessments, remoteAssessments) as AssessmentEntry[])

        setProgressMap(mergedProgress)
        setAssessments(mergedAssessments)
        saveProgressMap(mergedProgress)
        saveAssessments(mergedAssessments)

        await Promise.all([
          upsertRemoteProgressMap(supabase, userId, mergedProgress),
          upsertRemoteAssessments(supabase, userId, mergedAssessments),
        ])
      } catch {
        if (!active) {
          return
        }

        setProgressMap(localProgress)
        setAssessments(localAssessments)
      }

      if (active) {
        setReady(true)
      }
    }

    hydrate()

    return () => {
      active = false
    }
  }, [
    profile,
    profile?.exam_date,
    profile?.preferred_pacing,
    profile?.preferred_rest_days,
    profile?.preferred_session_minutes,
    profile?.target_study_hours,
    supabase,
  ])

  function updatePreferences(next: StudyPreferences) {
    setPreferences(next)
    saveStudyPreferences(next)
  }

  function saveProgress(input: SaveProgressInput) {
    setProgressMap((current) => {
      const existing = current[input.subtopicId] ?? {
        subtopicId: input.subtopicId,
        status: 'not_started' as ProgressStatus,
        completionPercentage: null,
        minutesSpent: 0,
        selfConfidence: null,
        aiMastery: null,
        notes: '',
        difficulty: null,
        lastStudiedAt: null,
        firstCompletedAt: null,
        revisionDueAt: null,
        revisionCount: 0,
      }

      const next: ProgressEntry = {
        ...existing,
        status: input.status,
        completionPercentage: input.completionPercentage ?? existing.completionPercentage ?? getDefaultCompletionFromStatus(input.status),
        minutesSpent: input.minutesSpent ?? existing.minutesSpent,
        selfConfidence: input.selfConfidence ?? existing.selfConfidence,
        notes: input.notes ?? existing.notes,
        difficulty: input.difficulty ?? existing.difficulty,
        lastStudiedAt: new Date().toISOString(),
        firstCompletedAt:
          existing.firstCompletedAt ?? (statusRank(input.status) >= statusRank('completed_once') ? new Date().toISOString() : null),
        revisionCount:
          input.status === 'revised' || input.status === 'mastered'
            ? existing.revisionCount + 1
            : existing.revisionCount,
      }

      next.revisionDueAt =
        statusRank(next.status) >= statusRank('completed_once') ? buildRevisionDueDate(next, preferences.preferredPacing) : null

      const updated = { ...current, [input.subtopicId]: next }
      saveProgressMap(updated)
      if (remoteUserId) {
        void upsertRemoteProgressMap(supabase, remoteUserId, updated)
      }
      return updated
    })
  }

  function saveAssessment(entry: Omit<AssessmentEntry, 'id' | 'createdAt'>) {
    const nextEntry: AssessmentEntry = {
      ...entry,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    }

    const nextAssessments = [nextEntry, ...assessments]
    setAssessments(nextAssessments)
    saveAssessments(nextAssessments)
    if (remoteUserId) {
      void upsertRemoteAssessments(supabase, remoteUserId, nextAssessments)
    }

    setProgressMap((current) => {
      const existing = current[entry.subtopicId] ?? {
        subtopicId: entry.subtopicId,
        status: 'in_progress' as ProgressStatus,
        completionPercentage: null,
        minutesSpent: 0,
        selfConfidence: entry.confidenceAtAttempt,
        aiMastery: null,
        notes: '',
        difficulty: null,
        lastStudiedAt: null,
        firstCompletedAt: null,
        revisionDueAt: null,
        revisionCount: 0,
      }

      const nextStatus: ProgressStatus =
        entry.aiMastery >= 4.2 ? 'mastered' : entry.aiMastery >= 3.2 ? 'revised' : entry.aiMastery >= 2.2 ? 'completed_once' : 'flagged'

      const updatedEntry: ProgressEntry = {
        ...existing,
        status: nextStatus,
        completionPercentage: existing.completionPercentage ?? getDefaultCompletionFromStatus(nextStatus),
        aiMastery: entry.aiMastery,
        selfConfidence: entry.confidenceAtAttempt ?? existing.selfConfidence,
        lastStudiedAt: nextEntry.createdAt,
        revisionDueAt: buildRevisionDueDate(
          {
            ...existing,
            aiMastery: entry.aiMastery,
            selfConfidence: entry.confidenceAtAttempt ?? existing.selfConfidence,
            revisionCount: existing.revisionCount + 1,
          },
          preferences.preferredPacing,
        ),
        revisionCount: existing.revisionCount + 1,
        firstCompletedAt: existing.firstCompletedAt ?? nextEntry.createdAt,
      }

      const updated = { ...current, [entry.subtopicId]: updatedEntry }
      saveProgressMap(updated)
      if (remoteUserId) {
        void upsertRemoteProgressMap(supabase, remoteUserId, updated)
      }
      return updated
    })
  }

  function snoozeRevision(subtopicId: string, days: number) {
    setProgressMap((current) => {
      const existing = current[subtopicId]
      if (!existing) {
        return current
      }

      const updated = {
        ...current,
        [subtopicId]: {
          ...existing,
          revisionDueAt: addDays(new Date(), days).toISOString(),
        },
      }

      saveProgressMap(updated)
      if (remoteUserId) {
        void upsertRemoteProgressMap(supabase, remoteUserId, updated)
      }
      return updated
    })
  }

  const derived = useMemo(() => {
    const examDate = preferences.examDate ? parseISO(preferences.examDate) : null
    const daysRemaining = examDate ? Math.max(0, differenceInCalendarDays(examDate, new Date())) : null
    const officialOutline = cfaLevel1Outline
    const officialModuleTotal = officialOutline.reduce((sum, subject) => sum + subject.modules.length, 0)

    const enrichedSubjects = cfaLevel1Syllabus.map((subject) => {
      const enrichedTopics = subject.topics.map((topic) => {
        const enrichedSubtopics = topic.subtopics.map((subtopic) => {
          const progress = progressMap[subtopic.id]
          const latestAssessment = assessments.find((assessment) => assessment.subtopicId === subtopic.id) ?? null
          const mastery = latestAssessment?.aiMastery ?? progress?.aiMastery ?? 0
          const status = progress?.status ?? 'not_started'
          const completionPercentage = getCompletionPercentage(progress)
          return {
            ...subtopic,
            progress,
            latestAssessment,
            mastery,
            status,
            completionPercentage,
          }
        })

        const coverage =
          enrichedSubtopics.length > 0
            ? Math.round(enrichedSubtopics.reduce((sum, item) => sum + item.completionPercentage, 0) / enrichedSubtopics.length)
            : 0

        return {
          ...topic,
          subtopics: enrichedSubtopics,
          coverage,
        }
      })

      const totalSubtopics = enrichedTopics.reduce((sum, topic) => sum + topic.subtopics.length, 0)
      const completedSubtopics = enrichedTopics.reduce(
        (sum, topic) => sum + topic.subtopics.filter((item) => statusRank(item.progress?.status ?? 'not_started') >= statusRank('completed_once')).length,
        0,
      )

      return {
        ...subject,
        topics: enrichedTopics,
        coverage: totalSubtopics > 0 ? Math.round((completedSubtopics / totalSubtopics) * 100) : 0,
        weightValue: getSubjectWeightValue(subject.weight),
      }
    })

    const enrichedSubtopics = allSubtopics.map((subtopic) => {
      const progress = progressMap[subtopic.id]
      const latestAssessment = assessments.find((assessment) => assessment.subtopicId === subtopic.id) ?? null
      const revisionDueAt = progress?.revisionDueAt ? parseISO(progress.revisionDueAt) : null
      const overdueDays = revisionDueAt ? differenceInCalendarDays(new Date(), revisionDueAt) : -1
      const subjectWeight = getSubjectWeightValue(subtopic.subject.weight)
      const mastery = latestAssessment?.aiMastery ?? progress?.aiMastery ?? 0
      const confidence = progress?.selfConfidence ?? 0
      const status = progress?.status ?? 'not_started'
      const completionPercentage = getCompletionPercentage(progress)

      const priorityScore =
        subjectWeight * 1.2 +
        subtopic.topic.priorityWeight * 10 +
        (status === 'not_started' ? 22 : 0) +
        (status === 'flagged' ? 26 : 0) +
        Math.max(0, 100 - completionPercentage) * 0.08 +
        (progress?.revisionDueAt ? Math.max(0, overdueDays + 1) * 7 : 0) +
        Math.max(0, 4 - mastery) * 10 +
        Math.max(0, confidence - mastery) * 5

      return {
        ...subtopic,
        progress,
        latestAssessment,
        mastery,
        confidence,
        status,
        completionPercentage,
        overdueDays,
        priorityScore,
      }
    })

    const completedCount = enrichedSubtopics.filter((item) => statusRank(item.status) >= statusRank('completed_once')).length
    const revisedCount = enrichedSubtopics.filter((item) => item.status === 'revised' || item.status === 'mastered').length
    const flaggedCount = enrichedSubtopics.filter((item) => item.status === 'flagged').length
    const inProgressCount = enrichedSubtopics.filter((item) => item.status === 'in_progress').length
    const remainingCount = enrichedSubtopics.length - completedCount
    const overallCoverage =
      enrichedSubtopics.length > 0
        ? Math.round(enrichedSubtopics.reduce((sum, item) => sum + item.completionPercentage, 0) / enrichedSubtopics.length)
        : 0
    const estimatedRemainingMinutes = enrichedSubtopics
      .filter((item) => statusRank(item.status) < statusRank('completed_once'))
      .reduce((sum, item) => sum + item.timeEstimateMinutes, 0)
    const avgMastery =
      enrichedSubtopics.filter((item) => item.mastery > 0).reduce((sum, item, _, arr) => sum + item.mastery / arr.length, 0) || 0
    const revisionQueue = enrichedSubtopics
      .filter((item) => item.progress?.revisionDueAt)
      .sort((a, b) => {
        const aDue = new Date(a.progress?.revisionDueAt ?? '').getTime()
        const bDue = new Date(b.progress?.revisionDueAt ?? '').getTime()
        return aDue - bDue
      })

    const riskZones = enrichedSubtopics
      .filter((item) => item.status !== 'mastered')
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .slice(0, 5)

    const todaysPlan = [...revisionQueue.filter((item) => item.overdueDays >= 0), ...riskZones]
      .filter((item, index, array) => array.findIndex((candidate) => candidate.id === item.id) === index)
      .slice(0, Math.max(3, Math.min(5, Math.round(preferences.targetStudyHours / 3))))
      .map((item) => ({
        id: item.id,
        title: item.title,
        topic: item.topic.title,
        subject: item.subject.title,
        duration: `${Math.max(20, Math.round(item.timeEstimateMinutes * 0.75))}m`,
        status: item.status,
        priorityScore: item.priorityScore,
        reason:
          item.overdueDays >= 0
            ? 'Revision is due now.'
            : item.status === 'flagged'
              ? 'This area needs recovery.'
              : item.status === 'not_started'
                ? 'High-weight material not started yet.'
                : item.mastery < 3
                  ? 'Mastery is still below target.'
                  : 'Keep momentum on a high-yield area.',
      }))

    const subjectSummaries: SubjectSummary[] = enrichedSubjects.map((subject) => {
      const officialSubject = officialOutline.find((item) => item.id === subject.id)
      const completedSubtopics = subject.topics.reduce(
        (sum, topic) => sum + topic.subtopics.filter((item) => statusRank(item.status) >= statusRank('completed_once')).length,
        0,
      )
      const remainingSubtopics = subject.topics.reduce(
        (sum, topic) => sum + topic.subtopics.filter((item) => statusRank(item.status) < statusRank('completed_once')).length,
        0,
      )
      const estimatedRemainingMinutes = subject.topics.reduce(
        (sum, topic) =>
          sum +
          topic.subtopics
            .filter((item) => statusRank(item.status) < statusRank('completed_once'))
            .reduce((topicSum, item) => topicSum + item.timeEstimateMinutes, 0),
        0,
      )
      const dueNowCount = subject.topics.reduce(
        (sum, topic) =>
          sum + topic.subtopics.filter((item) => item.progress?.revisionDueAt && differenceInCalendarDays(new Date(), parseISO(item.progress.revisionDueAt)) >= 0).length,
        0,
      )
      const flaggedCount = subject.topics.reduce((sum, topic) => sum + topic.subtopics.filter((item) => item.status === 'flagged').length, 0)
      const nextFocusTitle = subject.topics
        .flatMap((topic) => topic.subtopics)
        .filter((item) => item.status !== 'mastered')
        .sort((a, b) => statusRank(a.status) - statusRank(b.status) || a.mastery - b.mastery || b.timeEstimateMinutes - a.timeEstimateMinutes)[0]?.title ?? null

      const officialModules = officialSubject?.modules ?? []
      const officialModuleCount = officialModules.length
      const estimatedCompletedModules = officialModuleCount > 0 ? Math.min(officialModuleCount, Math.round((subject.coverage / 100) * officialModuleCount)) : 0
      const estimatedRemainingModules = Math.max(0, officialModuleCount - estimatedCompletedModules)

      return {
        id: subject.id,
        title: subject.title,
        weight: subject.weight,
        weightValue: subject.weightValue,
        totalSubtopics: subject.topics.reduce((sum, topic) => sum + topic.subtopics.length, 0),
        completedSubtopics,
        remainingSubtopics,
        estimatedRemainingMinutes,
        officialModuleCount,
        estimatedCompletedModules,
        estimatedRemainingModules,
        officialModules,
        coverage: subject.coverage,
        dueNowCount,
        flaggedCount,
        nextFocusTitle,
      }
    })

    const topRecommendation = [...revisionQueue.filter((item) => item.overdueDays >= 0), ...riskZones][0] ?? null

    const readiness = Math.max(
      18,
      Math.min(
        96,
        Math.round(overallCoverage * 0.45 + avgMastery * 12 + revisedCount * 0.6 - flaggedCount * 2.5 + (daysRemaining !== null ? Math.min(daysRemaining, 120) * 0.05 : 0)),
      ),
    )

    const trendData = [3, 2, 1, 0].map((offset) => {
      const slice = assessments.filter((assessment) => differenceInCalendarDays(new Date(), parseISO(assessment.createdAt)) <= offset * 7 + 7)
      const score = slice.length > 0 ? Math.round(slice.reduce((sum, item) => sum + item.scorePercentage, 0) / slice.length) : Math.max(35, readiness - offset * 7)
      return {
        day: offset === 0 ? 'Today' : `Week -${offset}`,
        score,
      }
    })

    return {
      examDate,
      daysRemaining,
      enrichedSubjects,
      enrichedSubtopics,
      subjectSummaries,
      completedCount,
      revisedCount,
      flaggedCount,
      inProgressCount,
      remainingCount,
      overallCoverage,
      avgMastery,
      estimatedRemainingMinutes,
      officialModuleTotal,
      revisionQueue,
      riskZones,
      todaysPlan,
      topRecommendation,
      readiness,
      trendData,
      totalSubtopics: enrichedSubtopics.length,
    }
  }, [assessments, preferences, progressMap])

  return {
    ready,
    preferences,
    updatePreferences,
    progressMap,
    assessments,
    saveProgress,
    saveAssessment,
    snoozeRevision,
    ...derived,
  }
}

export function formatRevisionLabel(revisionDueAt: string | null) {
  if (!revisionDueAt) {
    return 'No revision scheduled'
  }

  const days = differenceInCalendarDays(parseISO(revisionDueAt), new Date())
  if (days < 0) {
    return `${Math.abs(days)}d overdue`
  }
  if (days === 0) {
    return 'Due today'
  }
  return `Due in ${days}d`
}

export function formatMastery(mastery: number | null) {
  return mastery ? mastery.toFixed(1) : '0.0'
}

export function formatQuizScore(mastery: number | null) {
  if (!mastery || mastery <= 0) {
    return 'No quiz taken yet'
  }

  return `${Math.round((mastery / 5) * 100)}%`
}

export function formatExamDateLabel(examDate: string) {
  return format(parseISO(examDate), 'MMM d, yyyy')
}
