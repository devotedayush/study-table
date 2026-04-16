import { differenceInCalendarDays, format } from 'date-fns'

export type StudyPacing = 'aggressive' | 'balanced' | 'gentle'

export type Profile = {
  id: string
  username: string
  email: string
  exam_date: string | null
  target_study_hours: number | null
  preferred_session_minutes: number | null
  preferred_pacing: StudyPacing | null
  preferred_rest_days: string[] | null
  onboarding_completed: boolean | null
}

const restDayLabels: Record<string, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
}

export function getStudyContext(profile: Partial<Profile> | null | undefined) {
  const examDate = profile?.exam_date ? new Date(`${profile.exam_date}T00:00:00`) : null
  const daysRemaining = examDate ? Math.max(0, differenceInCalendarDays(examDate, new Date())) : null
  const targetHours = profile?.target_study_hours ?? 12
  const sessionMinutes = profile?.preferred_session_minutes ?? 75
  const pacing = profile?.preferred_pacing ?? 'balanced'
  const restDays = profile?.preferred_rest_days ?? []

  const urgency =
    daysRemaining === null
      ? 'Set your exam date'
      : daysRemaining <= 30
        ? 'Compressed'
        : daysRemaining <= 60
          ? 'Focused'
          : 'Steady'

  const dailyLoad =
    pacing === 'aggressive'
      ? Math.max(2, Math.round(targetHours / 5))
      : pacing === 'gentle'
        ? Math.max(1, Math.round(targetHours / 7))
        : Math.max(1, Math.round(targetHours / 6))

  const nextSessionMinutes = Math.max(45, Math.min(120, sessionMinutes))

  return {
    examDate,
    examDateLabel: examDate ? format(examDate, 'MMMM d, yyyy') : 'Set your exam date',
    daysRemaining,
    targetHours,
    sessionMinutes: nextSessionMinutes,
    pacing,
    urgency,
    dailyLoad,
    restDays: restDays.map((day) => restDayLabels[day.toLowerCase()] ?? day),
  }
}
