'use client'

import { useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Eye, EyeOff, LockKeyhole, Sparkles, UserRound } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatAuthError } from '@/lib/auth-error'
import { ensureProfileForUser } from '@/lib/profile-sync'
import { createClient } from '@/lib/supabase/browser'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      const normalizedIdentifier = identifier.trim().toLowerCase()
      const demoResponse = await fetch('/api/demo-login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          identifier: normalizedIdentifier,
          password,
        }),
      })

      if (demoResponse.ok) {
        router.replace('/')
        router.refresh()
        return
      }

      let email = normalizedIdentifier

      if (!normalizedIdentifier.includes('@')) {
        const { data: lookupEmail, error: lookupError } = await supabase.rpc('get_email_by_username', {
          lookup_username: normalizedIdentifier,
        })

        if (lookupError || !lookupEmail) {
          setError('No account matches that username. If you just confirmed your email, sign in with your email once.')
          return
        }

        email = lookupEmail
      }

      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        setError(formatAuthError(signInError.message))
        return
      }

      if (!signInData.user) {
        setError('Sign-in completed, but the account session could not be loaded.')
        return
      }

      const profileSync = await ensureProfileForUser({
        supabase,
        user: signInData.user,
      })

      if (profileSync.error) {
        setError(profileSync.error.message)
        return
      }

      router.replace(profileSync.onboardingCompleted ? '/' : '/signup')
      router.refresh()
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-5xl items-start gap-8 px-4 py-6 sm:items-center sm:py-8 lg:grid-cols-[1fr_0.95fr]">
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="space-y-6"
      >
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.35em] text-primary shadow-sm">
          <Sparkles size={14} />
          Sign in
        </span>
        <div className="space-y-4">
          <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            Sign in and go straight to the dashboard.
          </h1>
          <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
            Use your username and password. If you do not have an account yet, create one first.
          </p>
        </div>

        <div className="rounded-[1.5rem] border border-border bg-card/75 p-5 text-sm text-muted-foreground">
          Sign in is only for returning users. New users should choose create account on the landing page.
        </div>
        <div className="rounded-[1.5rem] border border-border bg-secondary/80 p-5 text-sm text-foreground">
          Demo login: <span className="font-semibold text-foreground">demo</span> / <span className="font-semibold text-foreground">demo123</span>
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.08 }}
        className="soft-panel rounded-[1.75rem] p-4 shadow-[0_30px_80px_-35px_rgba(244,114,182,0.35)] sm:rounded-[2rem] sm:p-6"
      >
        <div className="rounded-[1.6rem] border border-border bg-card p-5 sm:p-6">
          <div className="mb-6">
            <p className="text-sm font-medium text-primary">Returning user</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Sign in</h2>
            <p className="mt-2 text-sm text-muted-foreground">Enter your username or email and password.</p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-foreground">Username or email</span>
              <div className="flex items-center gap-3 rounded-2xl border border-border bg-secondary/60 px-4 py-3">
                <UserRound size={16} className="text-pink-400" />
                <input
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
                  autoComplete="username"
                  required
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-foreground">Password</span>
              <div className="flex items-center gap-3 rounded-2xl border border-border bg-secondary/60 px-4 py-3">
                <LockKeyhole size={16} className="text-pink-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
                  autoComplete="current-password"
                  required
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

            {error ? (
              <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</p>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? 'Signing in...' : 'Sign in'}
              <ArrowRight size={16} />
            </button>
          </form>

          <div className="mt-6 rounded-2xl border border-dashed border-border bg-secondary/70 p-4 text-sm text-muted-foreground">
            New here? <Link href="/signup" className="font-semibold text-primary">Create account</Link>.
          </div>
        </div>
      </motion.section>
    </div>
  )
}
