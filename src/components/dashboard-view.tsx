'use client'

import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowRight, CalendarDays, Compass, Sparkles, Clock3 } from 'lucide-react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { cn } from '@/lib/utils'
import { type Profile } from '@/lib/study-context'
import { formatExamDateLabel, formatQuizScore, formatRevisionLabel, useStudyWorkspace } from '@/lib/study-engine'

type DashboardViewProps = {
  profile: Profile
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.02,
    },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.42, ease: 'easeOut' as const },
  },
}

function friendlyReason(reason: string) {
  if (reason.includes('Revision is due now')) {
    return 'A quick review would help here.'
  }

  if (reason.includes('needs recovery')) {
    return 'This topic could use a gentler reset.'
  }

  if (reason.includes('not started')) {
    return 'A good place to begin.'
  }

  if (reason.includes('below target')) {
    return 'A short retest may help.'
  }

  return 'A steady next step.'
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 lg:space-y-8">
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="soft-panel animate-pulse rounded-[2.25rem] p-6">
          <div className="h-5 w-40 rounded-full bg-pink-100" />
          <div className="mt-5 h-10 w-3/4 rounded-2xl bg-pink-50" />
          <div className="mt-4 h-4 w-full rounded-full bg-pink-50" />
          <div className="mt-2 h-4 w-5/6 rounded-full bg-pink-50" />
          <div className="mt-6 grid gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-24 rounded-3xl bg-white" />
            ))}
          </div>
        </div>

        <div className="soft-panel animate-pulse rounded-[2.25rem] p-6">
          <div className="h-5 w-36 rounded-full bg-pink-100" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-20 rounded-3xl bg-white" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function DashboardView({ profile }: DashboardViewProps) {
  const workspace = useStudyWorkspace(profile)
  const router = useRouter()

  if (!workspace.ready) {
    return <DashboardSkeleton />
  }

  const examDateLabel = workspace.preferences.examDate ? formatExamDateLabel(workspace.preferences.examDate) : 'Set your exam date'

  const gentleSuggestions = workspace.todaysPlan
    .slice(0, 3)
    .map((item) => ({
      ...item,
      reason: friendlyReason(item.reason),
    }))

  const topSubjects = [...workspace.subjectSummaries]
    .sort((a, b) => b.dueNowCount - a.dueNowCount || b.flaggedCount - a.flaggedCount || b.weightValue - a.weightValue)
    .slice(0, 3)

  const summaryCards = [
    {
      label: 'Exam date',
      value: workspace.daysRemaining ?? '—',
      detail: examDateLabel,
      accent: 'sky',
    },
    {
      label: 'Coverage',
      value: `${workspace.overallCoverage}%`,
      detail: `${workspace.completedCount} items complete`,
      accent: 'pink',
    },
    {
      label: 'Review queue',
      value: workspace.revisionQueue.filter((item) => item.overdueDays >= 0).length,
      detail: 'Needs a gentle revisit',
      accent: 'pink',
    },
    {
      label: 'Active topics',
      value: workspace.inProgressCount,
      detail: 'Currently moving forward',
      accent: 'pink',
    },
  ] as const

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-6 lg:space-y-8">
      <motion.section variants={itemVariants} className="soft-panel overflow-hidden rounded-[2.5rem] border border-pink-100 bg-white/90 shadow-[0_18px_50px_-34px_rgba(244,114,182,0.36)]">
        <div className="grid gap-0 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="p-6 sm:p-7 lg:p-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-pink-200 bg-pink-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.34em] text-pink-500">
              <Sparkles size={14} />
              {workspace.flaggedCount > 0 ? 'Gentle reset' : 'Steady progress'}
            </div>

            <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
              Welcome back, {profile.username}.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
              Here is a calmer read on what matters next. The dashboard shows a few useful signals, not a full day plan.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => router.push('/revisions')}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-400 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-pink-200 transition-transform hover:-translate-y-0.5"
              >
                Open revisions
                <ArrowRight size={16} />
              </button>
              <div className="rounded-2xl border border-pink-100 bg-white px-4 py-3 text-sm text-slate-600">
                {workspace.subjectSummaries.length} subjects tracked
              </div>
              <div className="rounded-2xl border border-pink-100 bg-pink-50 px-4 py-3 text-sm text-pink-600">
                {workspace.revisionQueue.filter((item) => item.overdueDays >= 0).length} items to revisit now
              </div>
            </div>
          </div>

          <div className="border-t border-pink-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(252,231,243,0.55))] p-6 sm:p-7 lg:border-l lg:border-t-0 lg:p-8">
            <div className="grid gap-3 sm:grid-cols-2">
              {summaryCards.map((card) => (
                <div
                  key={card.label}
                  className={cn(
                    'rounded-[1.75rem] border p-4 shadow-[0_10px_30px_-24px_rgba(15,23,42,0.22)]',
                    card.accent === 'sky'
                      ? 'border-sky-100 bg-sky-50/80'
                      : 'border-pink-100 bg-white/90',
                  )}
                >
                  <p className={cn('text-xs uppercase tracking-[0.32em]', card.accent === 'sky' ? 'text-sky-500' : 'text-pink-400')}>
                    {card.label}
                  </p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{card.value}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{card.detail}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-[1.75rem] border border-pink-100 bg-white/85 p-4">
              <p className="text-xs uppercase tracking-[0.32em] text-pink-400">Current pulse</p>
              <div className="mt-3 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Recent quiz level</span>
                  <span className="font-semibold text-slate-900">{formatQuizScore(workspace.avgMastery)}</span>
                </div>
                <div className="h-2 rounded-full bg-pink-50">
                  <div className="h-2 rounded-full bg-gradient-to-r from-pink-500 to-rose-400" style={{ width: `${Math.min(100, Math.max(8, workspace.overallCoverage))}%` }} />
                </div>
                <p className="text-xs leading-5 text-slate-500">
                  This bar follows your current overall coverage, so it stays simpler and less judgey.
                </p>
              </div>
            </div>
          </div>
        </div>
      </motion.section>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <motion.section variants={itemVariants} className="soft-panel rounded-[2.25rem] border border-pink-100 bg-white/90 p-6">
          <div className="mb-5 flex items-center gap-2">
            <Compass className="text-pink-500" size={20} />
            <h2 className="text-lg font-semibold text-slate-900">Gentle suggestions</h2>
          </div>
          <p className="mb-5 max-w-xl text-sm leading-6 text-slate-500">
            Pick one if it feels useful. Each suggestion is meant to be small enough to start quickly.
          </p>

          <div className="space-y-3">
            {gentleSuggestions.length > 0 ? (
              gentleSuggestions.map((item, index) => (
                <div
                  key={item.id}
                  className="rounded-[1.6rem] border border-pink-100 bg-gradient-to-b from-white to-pink-50/40 p-4 shadow-[0_10px_30px_-28px_rgba(244,114,182,0.45)]"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-pink-100 bg-white text-sm font-semibold text-pink-500">
                      {String(index + 1).padStart(2, '0')}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-slate-900">{item.title}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {item.subject} · {item.topic}
                          </p>
                        </div>
                        <span className="rounded-full border border-pink-100 bg-pink-50 px-3 py-1 text-xs font-medium text-pink-500">
                          {item.duration}
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-600">{item.reason}</p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[1.6rem] border border-dashed border-pink-200 bg-white/70 p-5 text-sm text-slate-600">
                Once you start marking topics as studied, this area will suggest a few calm next steps.
              </div>
            )}
          </div>

          <div className="mt-5 flex items-center justify-between rounded-[1.6rem] border border-pink-100 bg-white/80 px-4 py-4">
            <div>
              <p className="text-sm font-medium text-slate-900">Want the next reset?</p>
              <p className="mt-1 text-xs text-slate-500">Open the revision queue when you are ready.</p>
            </div>
            <button
              type="button"
              onClick={() => router.push('/revisions')}
              className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-400 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-pink-200 transition-transform hover:-translate-y-0.5"
            >
              Open
              <ArrowRight size={16} />
            </button>
          </div>
        </motion.section>

        <motion.aside variants={itemVariants} className="soft-panel rounded-[2.25rem] border border-pink-100 bg-white/90 p-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Study summary</h2>
              <p className="mt-1 text-sm text-slate-500">A quick read on your current state.</p>
            </div>
            <span className="rounded-full border border-pink-200 bg-pink-50 px-3 py-1 text-xs font-medium text-pink-500">
              {workspace.subjectSummaries.length} subjects
            </span>
          </div>

          <div className="space-y-3">
            <div className="rounded-[1.5rem] border border-pink-100 bg-pink-50/60 p-4">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-slate-600">Topics in progress</p>
                <p className="text-xl font-semibold text-slate-900">{workspace.inProgressCount}</p>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">These are active but not finished yet.</p>
            </div>

            <div className="rounded-[1.5rem] border border-pink-100 bg-white p-4">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-slate-600">Marked for help</p>
                <p className="text-xl font-semibold text-slate-900">{workspace.flaggedCount}</p>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">These may want a slower second pass.</p>
            </div>

            <div className="rounded-[1.5rem] border border-pink-100 bg-white p-4">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-slate-600">Subjects with review due</p>
                <p className="text-xl font-semibold text-slate-900">
                  {workspace.subjectSummaries.filter((subject) => subject.dueNowCount > 0).length}
                </p>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">A gentle signal that a revisit could help.</p>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {topSubjects.map((subject, index) => (
              <div key={subject.id} className="rounded-[1.6rem] border border-pink-100 bg-white p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-pink-50 text-xs font-semibold text-pink-500">
                        {index + 1}
                      </span>
                      <p className="font-medium text-slate-900">{subject.title}</p>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      {subject.coverage}% done · {subject.estimatedRemainingModules} modules left · {subject.nextFocusTitle ? subject.nextFocusTitle : 'No next pick yet'}
                    </p>
                  </div>
                  <span className={cn('rounded-full px-3 py-1 text-xs font-semibold', subject.dueNowCount > 0 ? 'bg-pink-50 text-pink-600' : 'bg-white text-slate-500')}>
                    {subject.dueNowCount > 0 ? `${subject.dueNowCount} due` : 'steady'}
                  </span>
                </div>
                <div className="mt-3 h-2 rounded-full bg-pink-50">
                  <div className="h-2 rounded-full bg-gradient-to-r from-pink-500 to-rose-400" style={{ width: `${subject.coverage}%` }} />
                </div>
              </div>
            ))}
          </div>
        </motion.aside>
      </div>

      <motion.section variants={itemVariants} className="soft-panel rounded-[2.25rem] border border-pink-100 bg-white/90 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-pink-200 bg-pink-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-pink-500">
              <Clock3 size={14} />
              Trend
            </div>
            <h2 className="mt-3 text-lg font-semibold text-slate-900">Progress trend</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">A light view of how quiz performance has been moving across recent checkpoints.</p>
          </div>
          <div className="rounded-full border border-pink-200 bg-pink-50 px-3 py-1 text-xs font-medium text-pink-500">
            Based on recent assessments
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-[2rem] border border-pink-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(252,231,243,0.45))] p-4 sm:p-5">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="min-w-0">
              <div className="h-[220px] min-w-0 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={workspace.trendData}>
                    <defs>
                      <linearGradient id="pinkTrendSoft" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f472b6" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="#f472b6" stopOpacity={0.03} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#8b8b9d', fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#fff', border: '1px solid #fbcfe8', borderRadius: '16px', color: '#1f2430' }}
                      itemStyle={{ color: '#ec4899' }}
                    />
                    <Area type="monotone" dataKey="score" stroke="#ec4899" strokeWidth={3} fill="url(#pinkTrendSoft)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-[1.6rem] border border-pink-100 bg-white/90 p-4 lg:w-56">
              <p className="text-xs uppercase tracking-[0.32em] text-pink-400">Recent rhythm</p>
              <div className="mt-4 space-y-3 text-sm text-slate-600">
                {workspace.trendData.map((point) => (
                  <div key={point.day} className="flex items-center justify-between gap-4">
                    <span>{point.day}</span>
                    <span className="font-semibold text-slate-900">{point.score}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </motion.section>

      <motion.section variants={itemVariants} className="soft-panel rounded-[2.25rem] border border-pink-100 bg-white/90 p-6">
        <div className="mb-4 flex items-center gap-2">
          <CalendarDays className="text-pink-500" size={20} />
          <h2 className="text-lg font-semibold text-slate-900">Recently needing attention</h2>
        </div>
        <div className="space-y-3">
          {workspace.riskZones.slice(0, 3).map((risk) => (
            <div key={risk.id} className="rounded-[1.5rem] border border-pink-100 bg-white px-4 py-4">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{risk.title}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {risk.subject.title} · Last quiz {formatQuizScore(risk.mastery)}
                  </p>
                </div>
                <span className="rounded-full bg-pink-50 px-3 py-1 text-xs font-semibold text-pink-600">
                  {formatRevisionLabel(risk.progress?.revisionDueAt ?? null)}
                </span>
              </div>
            </div>
          ))}
          {workspace.riskZones.length === 0 ? (
            <div className="rounded-[1.5rem] border border-dashed border-pink-200 bg-white/70 p-4 text-sm text-slate-600">
              Nothing urgent is standing out right now.
            </div>
          ) : null}
        </div>
      </motion.section>
    </motion.div>
  )
}
