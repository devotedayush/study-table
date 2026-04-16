import type { StudyPacing } from '@/lib/study-context'

export const STUDY_PREFERENCES_KEY = 'cfa-study-preferences-v1'

export type StudyPreferences = {
  examDate: string
  targetStudyHours: number
  preferredSessionMinutes: number
  preferredPacing: StudyPacing
  preferredRestDays: string[]
}

export const DEFAULT_STUDY_PREFERENCES: StudyPreferences = {
  examDate: '',
  targetStudyHours: 12,
  preferredSessionMinutes: 75,
  preferredPacing: 'balanced',
  preferredRestDays: [],
}

function isBrowser() {
  return typeof window !== 'undefined'
}

export function loadStudyPreferences() {
  if (!isBrowser()) {
    return DEFAULT_STUDY_PREFERENCES
  }

  try {
    const raw = window.localStorage.getItem(STUDY_PREFERENCES_KEY)
    if (!raw) {
      return DEFAULT_STUDY_PREFERENCES
    }

    return {
      ...DEFAULT_STUDY_PREFERENCES,
      ...(JSON.parse(raw) as Partial<StudyPreferences>),
    }
  } catch {
    return DEFAULT_STUDY_PREFERENCES
  }
}

export function saveStudyPreferences(preferences: StudyPreferences) {
  if (!isBrowser()) {
    return
  }

  window.localStorage.setItem(STUDY_PREFERENCES_KEY, JSON.stringify(preferences))
}
