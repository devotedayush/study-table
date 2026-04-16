import type { Profile } from '@/lib/study-context'

export const DEMO_AUTH_COOKIE = 'demo-auth'

export function getDemoCredentials() {
  const username = process.env.DEMO_USERNAME
  const password = process.env.DEMO_PASSWORD

  if (!username || !password) {
    return null
  }

  return {
    username,
    password,
  }
}

export function matchesDemoCredentials(identifier: string, password: string) {
  const demoCredentials = getDemoCredentials()

  if (!demoCredentials) {
    return false
  }

  return (
    identifier.trim().toLowerCase() === demoCredentials.username.trim().toLowerCase() &&
    password === demoCredentials.password
  )
}

export function getDemoProfile(): Profile {
  return {
    id: 'demo-user',
    username: process.env.DEMO_USERNAME ?? 'demo',
    email: process.env.DEMO_EMAIL ?? 'demo@example.com',
    exam_date: process.env.DEMO_EXAM_DATE ?? '2026-12-01',
    target_study_hours: Number(process.env.DEMO_STUDY_HOURS ?? 12),
    preferred_session_minutes: Number(process.env.DEMO_SESSION_MINUTES ?? 75),
    preferred_pacing: 'balanced',
    preferred_rest_days: ['sun'],
    onboarding_completed: true,
  }
}
