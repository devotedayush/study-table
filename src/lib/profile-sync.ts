import type { SupabaseClient, User } from '@supabase/supabase-js'

type ExistingProfile = {
  id: string
  onboarding_completed: boolean | null
}

type EnsureProfileArgs = {
  supabase: SupabaseClient
  user: User
  username?: string | null
  examDate?: string | null
}

function normalizeUsername(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? ''
}

function normalizeExamDate(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null
}

export async function ensureProfileForUser({ supabase, user, username, examDate }: EnsureProfileArgs) {
  const { data: existingProfile, error: existingProfileError } = await supabase
    .from('profiles')
    .select('id, onboarding_completed')
    .eq('id', user.id)
    .maybeSingle<ExistingProfile>()

  if (existingProfileError) {
    return {
      error: existingProfileError,
      onboardingCompleted: false,
    }
  }

  if (existingProfile?.id) {
    return {
      error: null,
      onboardingCompleted: Boolean(existingProfile.onboarding_completed),
    }
  }

  const resolvedUsername = normalizeUsername(username ?? user.user_metadata?.username)
  const resolvedExamDate = normalizeExamDate(examDate ?? user.user_metadata?.exam_date)

  if (!resolvedUsername || !user.email) {
    return {
      error: null,
      onboardingCompleted: false,
    }
  }

  const { error } = await supabase.from('profiles').upsert({
    id: user.id,
    username: resolvedUsername,
    email: user.email,
    exam_date: resolvedExamDate,
    onboarding_completed: Boolean(resolvedExamDate),
  })

  return {
    error,
    onboardingCompleted: Boolean(resolvedExamDate) && !error,
  }
}
