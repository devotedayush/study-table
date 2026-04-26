'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, CalendarDays, Eye, EyeOff, Sparkles, UserRound } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatAuthError } from '@/lib/auth-error'
import { ensureProfileForUser } from '@/lib/profile-sync'
import { createClient } from '@/lib/supabase/browser'

function getAuthErrorFromHash() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const errorDescription = params.get('error_description')
  const errorCode = params.get('error_code')
  const error = params.get('error')

  if (!errorDescription && !errorCode && !error) {
    return null
  }

  return formatAuthError(errorDescription ?? errorCode ?? error ?? 'Authentication failed.')
}

export default function SignupPage() {
  const router = useRouter()
  const supabase = createClient()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [examDate, setExamDate] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [hasSession, setHasSession] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadSession() {
      const authError = getAuthErrorFromHash()

      if (authError) {
        setError(authError)
        window.history.replaceState(null, '', window.location.pathname)
      }

      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (cancelled || !session?.user) {
        return
      }

      setHasSession(true)
      setEmail(session.user.email ?? '')
      setUsername((session.user.user_metadata?.username as string | undefined) ?? '')
      setExamDate((session.user.user_metadata?.exam_date as string | undefined) ?? '')
    }

    loadSession()

    return () => {
      cancelled = true
    }
  }, [supabase])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setMessage(null)
    setIsSubmitting(true)

    try {
      const normalizedUsername = username.trim().toLowerCase()
      const normalizedEmail = email.trim().toLowerCase()
      const { data: existingEmail } = await supabase.rpc('get_email_by_username', {
        lookup_username: normalizedUsername,
      })

      if (existingEmail && existingEmail.toLowerCase() !== normalizedEmail) {
        setError('That username is already in use.')
        return
      }

      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession()

      if (currentSession?.user) {
        const profileSync = await ensureProfileForUser({
          supabase,
          user: {
            ...currentSession.user,
            user_metadata: {
              ...currentSession.user.user_metadata,
              username: normalizedUsername,
              exam_date: examDate,
            },
          },
          username: normalizedUsername,
          examDate,
        })

        if (profileSync.error) {
          setError(profileSync.error.message)
          return
        }

        router.replace('/')
        router.refresh()
        return
      }

      const signUp = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: {
            username: normalizedUsername,
            exam_date: examDate,
          },
        },
      })

      if (signUp.error) {
        setError(formatAuthError(signUp.error.message))
        return
      }

      if (!signUp.data.user) {
        setError('Account was created, but the new user could not be loaded.')
        return
      }

      if (signUp.data.session) {
        const profileSync = await ensureProfileForUser({
          supabase,
          user: signUp.data.user,
          username: normalizedUsername,
          examDate,
        })

        if (profileSync.error) {
          setError(profileSync.error.message)
          return
        }

        router.replace('/')
        router.refresh()
        return
      }

      setError('Account was created, but Supabase did not return a session. Confirm email may still be enabled in the project settings.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-5xl gap-8 px-4 py-6 sm:py-8 lg:grid-cols-[0.95fr_1.05fr]">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="space-y-6 lg:pt-8"
      >
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.35em] text-primary shadow-sm">
          <Sparkles size={14} />
          Create account
        </span>
        <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
          Set up the private workspace in one pass.
        </h1>
        <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
          Pick a username, add your email and password, and set the exam date. That is enough to open the dashboard.
        </p>

        <div className="space-y-4">
          {[
            { icon: UserRound, title: 'Username + password', detail: 'This is the login you will use later.' },
            { icon: CalendarDays, title: 'Exam date', detail: 'The dashboard uses this to set pace and urgency.' },
            { icon: Sparkles, title: 'Dashboard next', detail: 'You go straight into the study cockpit after saving.' },
          ].map((item) => {
            const Icon = item.icon
            return (
              <div key={item.title} className="soft-panel rounded-3xl p-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-secondary p-3 text-primary">
                    <Icon size={18} />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{item.title}</p>
                    <p className="text-sm text-muted-foreground">{item.detail}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.08 }}
        className="soft-panel rounded-[1.75rem] p-4 shadow-[0_30px_80px_-35px_rgba(244,114,182,0.35)] sm:rounded-[2rem] sm:p-6"
      >
        <div className="rounded-[1.6rem] border border-border bg-card p-5 sm:p-6">
          <div className="mb-6">
            <p className="text-sm font-medium text-primary">{hasSession ? 'Finish setup' : 'Signup'}</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{hasSession ? 'Complete your profile' : 'Create account'}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {hasSession
                ? 'You are already signed in. Set the username and exam date to open the dashboard.'
                : 'Create the account and open the dashboard immediately.'}
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-foreground">Username</span>
                <input
                  name="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  required
                  className="w-full rounded-2xl border border-border bg-secondary/60 px-4 py-3 text-foreground outline-none placeholder:text-muted-foreground"
                />
              </label>
              {hasSession ? (
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-foreground">Email</span>
                  <input
                    value={email}
                    readOnly
                    className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-muted-foreground outline-none"
                  />
                </label>
              ) : (
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-foreground">Email</span>
                  <input
                    name="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    className="w-full rounded-2xl border border-border bg-secondary/60 px-4 py-3 text-foreground outline-none placeholder:text-muted-foreground"
                  />
                </label>
              )}
            </div>

            {hasSession ? null : (
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-foreground">Password</span>
                <div className="flex items-center gap-3 rounded-2xl border border-border bg-secondary/60 px-4 py-3">
                  <input
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-card text-primary transition-colors hover:bg-secondary/80"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>
            )}

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-foreground">Exam date</span>
              <input
                name="examDate"
                type="date"
                value={examDate}
                onChange={(event) => setExamDate(event.target.value)}
                required
                className="w-full rounded-2xl border border-border bg-secondary/60 px-4 py-3 text-foreground outline-none"
              />
            </label>

            {error ? (
              <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</p>
            ) : null}
            {message ? (
              <p className="rounded-2xl border border-border bg-amber-50 px-4 py-3 text-sm text-foreground">{message}</p>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? (hasSession ? 'Finishing setup...' : 'Creating account...') : hasSession ? 'Finish setup' : 'Create account'}
              <ArrowRight size={16} />
            </button>

            <p className="text-center text-sm text-muted-foreground">
              Already have an account? <Link href="/login" className="font-semibold text-primary">Sign in</Link>.
            </p>
          </form>
        </div>
      </motion.div>
    </div>
  )
}
