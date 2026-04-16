'use client'

import { motion } from 'framer-motion'
import { CalendarCheck2, CheckCircle2, Clock3, RefreshCcw, Sparkles } from 'lucide-react'
import { formatMastery, formatRevisionLabel, useStudyWorkspace } from '@/lib/study-engine'

export default function RevisionsPage() {
  const workspace = useStudyWorkspace()
  const dueNow = workspace.revisionQueue.filter((item) => item.overdueDays >= 0)
  const upcoming = workspace.revisionQueue.filter((item) => item.overdueDays < 0).slice(0, 6)
  const topRecommendation = workspace.topRecommendation
  const subjectPressure = [...workspace.subjectSummaries]
    .sort((a, b) => b.dueNowCount - a.dueNowCount || b.flaggedCount - a.flaggedCount || b.estimatedRemainingMinutes - a.estimatedRemainingMinutes)
    .slice(0, 4)

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: 'easeOut' }} className="space-y-8">
      <div>
        <h1 className="text-4xl font-semibold tracking-tight text-slate-900">Revisions</h1>
        <p className="mt-2 text-lg text-slate-600">This queue is generated from your actual completion dates, mastery, confidence, and current pacing settings.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="soft-panel rounded-[1.75rem] p-5">
          <p className="text-sm text-slate-500">Due now</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{dueNow.length}</p>
        </div>
        <div className="soft-panel rounded-[1.75rem] p-5">
          <p className="text-sm text-slate-500">Upcoming</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{upcoming.length}</p>
        </div>
        <div className="soft-panel rounded-[1.75rem] p-5">
          <p className="text-sm text-slate-500">Modules left</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{workspace.officialModuleTotal - Math.round((workspace.overallCoverage / 100) * workspace.officialModuleTotal)}</p>
        </div>
        <div className="soft-panel rounded-[1.75rem] p-5">
          <p className="text-sm text-slate-500">Study left</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{Math.round(workspace.estimatedRemainingMinutes / 60)}h</p>
        </div>
      </div>

      <div className="soft-panel rounded-[2rem] p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <Sparkles className="text-pink-500" size={18} />
              Next best revision
            </h2>
            <p className="mt-1 text-sm text-slate-500">The planner uses due dates, mastery, and weighting to decide what should happen first.</p>
          </div>
          <div className="rounded-full border border-pink-200 bg-pink-50 px-3 py-1 text-xs font-medium text-pink-500">
            {workspace.readiness}% readiness
          </div>
        </div>

        <div className="mt-5 rounded-[1.5rem] border border-pink-100 bg-pink-50/70 p-5">
          {topRecommendation ? (
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pink-400">Best next move</p>
                <h3 className="mt-2 text-2xl font-semibold text-slate-900">{topRecommendation.title}</h3>
                <p className="mt-1 text-sm text-slate-600">
                  {topRecommendation.subject.title} · {topRecommendation.topic.title} · {formatMastery(topRecommendation.mastery)}/5 mastery
                </p>
                <p className="mt-2 text-sm text-slate-500">{topRecommendation.overdueDays >= 0 ? formatRevisionLabel(topRecommendation.progress?.revisionDueAt ?? null) : 'Pull this into the front of your next study block.'}</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  workspace.saveProgress({
                    subtopicId: topRecommendation.id,
                    status: topRecommendation.mastery >= 4 ? 'mastered' : 'revised',
                    minutesSpent: (topRecommendation.progress?.minutesSpent ?? 0) + Math.round(topRecommendation.timeEstimateMinutes * 0.6),
                    selfConfidence: topRecommendation.progress?.selfConfidence ?? 3,
                    notes: topRecommendation.progress?.notes ?? '',
                  })
                }
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-400 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-pink-200"
              >
                <CheckCircle2 size={15} />
                Mark revised
              </button>
            </div>
          ) : (
            <div className="text-sm text-slate-600">No revision items are due yet. Keep completing syllabus modules and this area will populate automatically.</div>
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="soft-panel rounded-[2rem] p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
            <CalendarCheck2 className="text-pink-500" size={18} />
            Due and overdue queue
          </h2>
          <div className="space-y-3">
            {dueNow.length === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed border-pink-200 bg-white/70 p-6 text-sm text-slate-600">
                No revisions are due right now. Keep updating the syllabus and this queue will refresh automatically.
              </div>
            ) : null}

            {dueNow.map((item) => (
              <div key={item.id} className="rounded-[1.5rem] border border-pink-100 bg-white p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-900">{item.title}</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {item.subject.title} · {item.topic.title} · Mastery {formatMastery(item.mastery)}/5
                    </p>
                    <p className="mt-1 text-xs text-rose-600">{formatRevisionLabel(item.progress?.revisionDueAt ?? null)}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        workspace.saveProgress({
                          subtopicId: item.id,
                          status: item.mastery >= 4 ? 'mastered' : 'revised',
                          minutesSpent: (item.progress?.minutesSpent ?? 0) + Math.round(item.timeEstimateMinutes * 0.6),
                          selfConfidence: item.progress?.selfConfidence ?? 3,
                          notes: item.progress?.notes ?? '',
                        })
                      }
                      className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-400 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-pink-200"
                    >
                      <CheckCircle2 size={15} />
                      Mark revised
                    </button>
                    <button
                      type="button"
                      onClick={() => workspace.snoozeRevision(item.id, 2)}
                      className="rounded-2xl border border-pink-200 bg-pink-50 px-4 py-3 text-sm font-semibold text-pink-600"
                    >
                      Snooze 2d
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="soft-panel rounded-[2rem] p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
              <Clock3 className="text-pink-500" size={18} />
              Upcoming queue
            </h2>
            <div className="space-y-3">
              {upcoming.map((item) => (
                <div key={item.id} className="rounded-2xl border border-pink-100 bg-white px-4 py-4">
                  <p className="font-medium text-slate-900">{item.title}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.subject.title} · {formatRevisionLabel(item.progress?.revisionDueAt ?? null)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="soft-panel rounded-[2rem] p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
              <RefreshCcw className="text-pink-500" size={18} />
              Subject pressure
            </h2>
            <div className="space-y-3">
              {subjectPressure.map((subject) => (
                <div key={subject.id} className="rounded-2xl border border-pink-100 bg-white px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">{subject.title}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {subject.dueNowCount} due now · {subject.estimatedRemainingModules} estimated modules left
                      </p>
                    </div>
                    <span className="rounded-full border border-pink-100 bg-pink-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-pink-500">
                      {subject.coverage}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="soft-panel rounded-[2rem] p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
              <RefreshCcw className="text-pink-500" size={18} />
              Revision cadence
            </h2>
            <div className="space-y-3 text-sm text-slate-600">
              <p className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-500" />
                Weak or flagged items are pulled back sooner.
              </p>
              <p className="flex items-center gap-2">
                <Clock3 size={16} className="text-amber-500" />
                Higher mastery pushes the next review a little later.
              </p>
              <p className="flex items-center gap-2">
                <Sparkles size={16} className="text-pink-500" />
                Completing a revision immediately reschedules the next due date.
              </p>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
