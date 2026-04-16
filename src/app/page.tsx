import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ArrowRight, Sparkles, LogIn, UserPlus } from 'lucide-react'
import { DEMO_AUTH_COOKIE, getDemoCredentials, getDemoProfile } from '@/lib/demo-auth'
import { createClient } from '@/lib/supabase/server'
import { DashboardView } from '@/components/dashboard-view'
import type { Profile } from '@/lib/study-context'

function LandingPage() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center px-4">
      <section className="grid w-full gap-6 lg:grid-cols-[1.04fr_0.96fr]">
        <div className="soft-panel rounded-[2.2rem] p-6 sm:p-8 lg:p-10">
          <span className="inline-flex items-center gap-2 rounded-full border border-pink-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.35em] text-pink-500 shadow-sm">
            <Sparkles size={14} />
            Private workspace
          </span>
          <div className="mt-6 space-y-4">
            <h1 className="max-w-2xl text-5xl font-semibold tracking-tight text-slate-900 sm:text-6xl">
              CFA prep, kept calm and clear.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-slate-600">
              Sign in if you already have an account. Create one if this is your first time. After that, everything opens in one study workspace.
            </p>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/login" className="primary-button">
              <LogIn size={16} />
              Sign in
            </Link>
            <Link href="/signup" className="soft-button">
              <UserPlus size={16} />
              Create account
            </Link>
          </div>

          <div className="mt-6 rounded-[1.5rem] border border-pink-100 bg-white p-4 text-sm text-slate-600">
            One private login. One syllabus tracker. One calm place to study.
          </div>
        </div>

        <div className="soft-panel rounded-[2.2rem] p-6 sm:p-8">
          <div className="rounded-[1.75rem] border border-[#d9eef5] bg-white p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">Workspace preview</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">A softer study cockpit</h2>
              </div>
              <span className="rounded-full border border-pink-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-pink-500">
                white + pink
              </span>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {[
                { label: 'Coverage', value: 'Track by topic' },
                { label: 'Confidence', value: 'Mark what feels shaky' },
                { label: 'Baby Maan', value: 'Update by chat' },
              ].map((item) => (
                <div key={item.label} className="rounded-[1.45rem] border border-white/90 bg-white/92 p-4">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">{item.label}</p>
                  <p className="mt-2 text-sm font-medium text-slate-900">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <div className="rounded-[1.5rem] border border-pink-100 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Today’s focus</p>
                  <p className="mt-1 text-xs text-slate-500">Suggested, not forced</p>
                </div>
                <span className="rounded-full bg-pink-50 px-3 py-1 text-xs font-semibold text-pink-500">45 min</span>
              </div>
              <p className="mt-3 text-sm text-slate-600">Review a weak area, log progress, and move on.</p>
            </div>

            <div className="rounded-[1.5rem] border border-pink-100 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Progress trend</p>
                  <p className="mt-1 text-xs text-slate-500">Compact and easy to scan</p>
                </div>
                <ArrowRight className="text-pink-400" size={18} />
              </div>
              <div className="mt-4 flex h-16 items-end gap-2">
                {[36, 54, 48, 66, 72, 68].map((value, index) => (
                  <div key={index} className="flex-1 rounded-full bg-pink-50">
                    <div className="rounded-full bg-pink-400" style={{ height: `${value}%` }} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default async function Page() {
  const cookieStore = await cookies()
  const demoCredentials = getDemoCredentials()
  const isDemoSession = demoCredentials && cookieStore.get(DEMO_AUTH_COOKIE)?.value === '1'

  if (isDemoSession) {
    return <DashboardView profile={getDemoProfile()} />
  }

  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return <LandingPage />
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username, email, exam_date, target_study_hours, preferred_session_minutes, preferred_pacing, preferred_rest_days, onboarding_completed')
    .eq('id', session.user.id)
    .maybeSingle()

  if (!profile?.onboarding_completed) {
    redirect('/signup')
  }

  return <DashboardView profile={profile as Profile} />
}
