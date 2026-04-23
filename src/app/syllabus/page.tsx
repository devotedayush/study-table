'use client'

import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, CalendarCheck2, CheckCircle2, ChevronDown, ChevronRight, Clock3, Filter, Layers, NotebookPen, Save, Search, Sparkles, Star, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatMastery, formatQuizScore, formatRevisionLabel, useStudyWorkspace } from '@/lib/study-engine'
import { type ProgressStatus } from '@/lib/cfa-data'

const statusOptions: { value: ProgressStatus; label: string }[] = [
  { value: 'not_started', label: 'Not started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed_once', label: 'Completed once' },
  { value: 'revised', label: 'Revised' },
  { value: 'mastered', label: 'Mastered' },
  { value: 'flagged', label: 'Flagged' },
]

const statusFilterOptions: { value: ProgressStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  ...statusOptions,
]

function statusTone(status: ProgressStatus) {
  return {
    mastered: 'bg-emerald-50 border-emerald-200 text-emerald-600',
    revised: 'bg-sky-50 border-sky-200 text-sky-600',
    completed_once: 'bg-pink-50 border-pink-200 text-pink-600',
    in_progress: 'bg-amber-50 border-amber-200 text-amber-600',
    flagged: 'bg-rose-50 border-rose-200 text-rose-600',
    not_started: 'bg-white border-pink-100 text-slate-500',
  }[status]
}

const confidenceOptions = [
  { value: '1', label: 'Very weak' },
  { value: '2', label: 'Weak' },
  { value: '3', label: 'Okay' },
  { value: '4', label: 'Strong' },
  { value: '5', label: 'Very strong' },
]

function TopicRow({
  topic,
  onSave,
  forceOpen,
}: {
  topic: ReturnType<typeof useStudyWorkspace>['enrichedSubjects'][number]['topics'][number]
  onSave: ReturnType<typeof useStudyWorkspace>['saveProgress']
  forceOpen?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, { status: ProgressStatus; completionPercentage: string; selfConfidence: string; notes: string }>>({})

  const isOpen = forceOpen || open

  return (
    <div className="border-t border-pink-100 first:border-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between px-4 py-4 text-left transition-colors hover:bg-pink-50/70"
      >
        <div className="flex flex-row items-center gap-3">
          <div className="text-pink-400">{isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</div>
          <div>
            <h3 className="font-medium text-slate-900">{topic.title}</h3>
            <p className="text-xs text-slate-500">{topic.coverage}% covered</p>
          </div>
        </div>
        <div className="text-xs text-slate-500">{topic.subtopics.length} modules</div>
      </button>

      <AnimatePresence>
        {isOpen ? (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden bg-pink-50/50">
            {topic.subtopics.map((subtopic) => {
              const draft = drafts[subtopic.id] ?? {
                status: subtopic.status,
                completionPercentage: String(subtopic.completionPercentage ?? 0),
                selfConfidence: String(subtopic.progress?.selfConfidence ?? 3),
                notes: subtopic.progress?.notes ?? '',
              }

              return (
                <div key={subtopic.id} className="border-t border-pink-100 px-5 py-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <p className="font-medium text-slate-900">{subtopic.title}</p>
                        <span className={cn('rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wider', statusTone(subtopic.status))}>
                          {draft.status.replaceAll('_', ' ')}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <Clock3 size={12} className="text-pink-400" />
                          {subtopic.timeEstimateMinutes}m estimate
                        </span>
                        <span>Quiz score {formatQuizScore(subtopic.mastery)}</span>
                        <span>{formatRevisionLabel(subtopic.progress?.revisionDueAt ?? null)}</span>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      <label className="block">
                        <span className="mb-2 block text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Status</span>
                        <select
                          value={draft.status}
                          onChange={(event) => setDrafts((current) => ({ ...current, [subtopic.id]: { ...draft, status: event.target.value as ProgressStatus } }))}
                          className="app-select"
                        >
                          {statusOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-2 block text-xs font-medium uppercase tracking-[0.2em] text-slate-500">% done</span>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={draft.completionPercentage}
                          onChange={(event) => setDrafts((current) => ({ ...current, [subtopic.id]: { ...draft, completionPercentage: event.target.value } }))}
                          className="app-select"
                          placeholder="0"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-2 block text-xs font-medium uppercase tracking-[0.2em] text-slate-500">How comfortable you feel</span>
                        <select
                          value={draft.selfConfidence}
                          onChange={(event) => setDrafts((current) => ({ ...current, [subtopic.id]: { ...draft, selfConfidence: event.target.value } }))}
                          className="w-full rounded-2xl border border-pink-100 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                        >
                          {confidenceOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-end">
                    <label className="block flex-1">
                      <span className="mb-2 block text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Notes</span>
                      <textarea
                        rows={2}
                        value={draft.notes}
                        onChange={(event) => setDrafts((current) => ({ ...current, [subtopic.id]: { ...draft, notes: event.target.value } }))}
                        className="w-full rounded-2xl border border-pink-100 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                        placeholder="What clicked, what stayed fuzzy, what to revisit."
                      />
                    </label>
                    <button
                      type="button"
                        onClick={() =>
                          onSave({
                            subtopicId: subtopic.id,
                            status: draft.status,
                            completionPercentage: Math.min(100, Math.max(0, Number(draft.completionPercentage) || 0)),
                            selfConfidence: Number(draft.selfConfidence) || null,
                            notes: draft.notes,
                        })
                      }
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-pink-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-pink-200 transition-transform hover:-translate-y-0.5"
                    >
                      <Save size={15} />
                      Save update
                    </button>
                  </div>
                </div>
              )
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

export default function SyllabusPage() {
  const workspace = useStudyWorkspace()
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<ProgressStatus | 'all'>('all')
  const [subjectFilter, setSubjectFilter] = useState<string>('all')

  const isFiltering = searchQuery.trim() !== '' || statusFilter !== 'all' || subjectFilter !== 'all'

  const filteredSubjects = useMemo(() => {
    const query = searchQuery.toLowerCase().trim()

    return workspace.enrichedSubjects
      .filter((subject) => subjectFilter === 'all' || subject.id === subjectFilter)
      .map((subject) => {
        const filteredTopics = subject.topics
          .map((topic) => {
            const filteredSubtopics = topic.subtopics.filter((subtopic) => {
              const matchesSearch = !query || subtopic.title.toLowerCase().includes(query) || topic.title.toLowerCase().includes(query) || subject.title.toLowerCase().includes(query)
              const matchesStatus = statusFilter === 'all' || subtopic.status === statusFilter
              return matchesSearch && matchesStatus
            })
            return { ...topic, subtopics: filteredSubtopics }
          })
          .filter((topic) => topic.subtopics.length > 0)

        return { ...subject, topics: filteredTopics }
      })
      .filter((subject) => subject.topics.length > 0)
  }, [workspace.enrichedSubjects, searchQuery, statusFilter, subjectFilter])

  const filteredSubtopicCount = filteredSubjects.reduce((sum, subject) => sum + subject.topics.reduce((topicSum, topic) => topicSum + topic.subtopics.length, 0), 0)

  const topSubjects = [...workspace.subjectSummaries]
    .sort((a, b) => b.dueNowCount - a.dueNowCount || b.flaggedCount - a.flaggedCount || b.weightValue - a.weightValue)
    .slice(0, 3)

  const dueNow = workspace.revisionQueue.filter((item) => item.overdueDays >= 0)
  const upcoming = workspace.revisionQueue.filter((item) => item.overdueDays < 0).slice(0, 4)
  const topRecommendation = workspace.topRecommendation
  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: 'easeOut' }} className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Study dashboard</h1>
          <p className="mt-2 max-w-2xl text-base text-slate-600 sm:text-lg">
            Your revision queue and the full syllabus map, side by side. Clear due items up top, then dig into any module below.
          </p>
        </div>
        <div className="rounded-[1.5rem] border border-pink-100 bg-white/80 px-5 py-4 text-right">
          <p className="text-[10px] uppercase tracking-[0.28em] text-pink-400">Readiness</p>
          <p className="mt-1 text-3xl font-semibold text-slate-900">{workspace.readiness}%</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="soft-panel rounded-[1.75rem] p-4 sm:rounded-[2rem] sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <Sparkles className="text-pink-500" size={18} />
              Next best revision
            </h2>
            <span className="rounded-full border border-pink-200 bg-pink-50 px-3 py-1 text-xs font-medium text-pink-500">
              {dueNow.length} due · {upcoming.length} upcoming
            </span>
          </div>
          <div className="mt-5 rounded-[1.5rem] border border-pink-100 bg-pink-50/70 p-5">
            {topRecommendation ? (
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pink-400">Start here</p>
                  <h3 className="mt-2 text-xl font-semibold text-slate-900">{topRecommendation.title}</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    {topRecommendation.subject.title} · {topRecommendation.topic.title} · {formatMastery(topRecommendation.mastery)}/5 mastery
                  </p>
                  <p className="mt-2 text-sm text-slate-500">{topRecommendation.overdueDays >= 0 ? formatRevisionLabel(topRecommendation.progress?.revisionDueAt ?? null) : 'Pull this into the front of your next block.'}</p>
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
              <p className="text-sm text-slate-600">No revisions are due. Keep ticking off modules below and this will populate automatically.</p>
            )}
          </div>

          {dueNow.length > 0 ? (
            <div className="mt-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <CalendarCheck2 className="text-pink-500" size={15} />
                Due and overdue ({dueNow.length})
              </h3>
              <div className="mt-3 space-y-2">
                {dueNow.slice(0, 5).map((item) => (
                  <div key={item.id} className="flex flex-col gap-2 rounded-2xl border border-pink-100 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{item.title}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{item.subject.title} · {formatRevisionLabel(item.progress?.revisionDueAt ?? null)}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
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
                        className="rounded-full border border-pink-100 bg-pink-50 px-3 py-1.5 text-xs font-semibold text-pink-600 hover:bg-pink-100"
                      >
                        Revised
                      </button>
                      <button
                        type="button"
                        onClick={() => workspace.snoozeRevision(item.id, 2)}
                        className="rounded-full border border-pink-100 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-pink-50/60"
                      >
                        Snooze 2d
                      </button>
                    </div>
                  </div>
                ))}
                {dueNow.length > 5 ? (
                  <p className="pl-1 text-xs text-slate-500">+{dueNow.length - 5} more surfaced inside the topics below.</p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-6">
          <div className="soft-panel rounded-[1.75rem] p-4 sm:rounded-[2rem] sm:p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
              <Clock3 className="text-pink-500" size={18} />
              Coming up
            </h2>
            <div className="space-y-2">
              {upcoming.length === 0 ? (
                <p className="text-sm text-slate-500">Nothing scheduled yet — finish a few modules first.</p>
              ) : null}
              {upcoming.map((item) => (
                <div key={item.id} className="rounded-2xl border border-pink-100 bg-white px-4 py-3">
                  <p className="text-sm font-medium text-slate-900">{item.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{item.subject.title} · {formatRevisionLabel(item.progress?.revisionDueAt ?? null)}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="soft-panel rounded-[1.75rem] p-4 sm:rounded-[2rem] sm:p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
              <Sparkles className="text-pink-500" size={18} />
              Subject pressure
            </h2>
            <div className="space-y-2">
              {topSubjects.map((subject) => (
                <div key={subject.id} className="flex items-center justify-between gap-3 rounded-2xl border border-pink-100 bg-white px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{subject.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{subject.dueNowCount} due · {subject.estimatedRemainingModules} modules left</p>
                  </div>
                  <span className="rounded-full border border-pink-100 bg-pink-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-pink-500">
                    {subject.coverage}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Full syllabus map</h2>
          <p className="mt-1 text-sm text-slate-600">
            Search, filter, and update progress across all {workspace.totalSubtopics} modules.
          </p>
        </div>
      </div>

      {/* Search and filter bar */}
      <div className="soft-panel rounded-[1.75rem] p-4 sm:rounded-[2rem] sm:p-5">
        <div className="flex items-center gap-2 mb-4 text-sm font-medium text-slate-700">
          <Filter size={16} className="text-pink-500" />
          Find modules
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="w-full rounded-2xl border border-pink-100 bg-white py-3 pl-11 pr-4 text-sm text-slate-900 outline-none placeholder:text-slate-400"
              placeholder="Search topics, subtopics..."
            />
            {searchQuery ? (
              <button type="button" onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            ) : null}
          </div>
          <select
            value={subjectFilter}
            onChange={(event) => setSubjectFilter(event.target.value)}
            className="app-select"
          >
            <option value="all">All subjects</option>
            {workspace.enrichedSubjects.map((subject) => (
              <option key={subject.id} value={subject.id}>{subject.title}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as ProgressStatus | 'all')}
            className="app-select"
          >
            {statusFilterOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        {isFiltering ? (
          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Showing {filteredSubtopicCount} of {workspace.totalSubtopics} modules
            </p>
            <button
              type="button"
              onClick={() => { setSearchQuery(''); setStatusFilter('all'); setSubjectFilter('all') }}
              className="text-xs font-medium text-pink-500 hover:text-pink-600"
            >
              Clear filters
            </button>
          </div>
        ) : null}
      </div>

      {!isFiltering ? (
        <>
          <div className="soft-panel rounded-[1.75rem] p-4 sm:rounded-[2rem] sm:p-6">
            <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Official curriculum map</h2>
                <p className="mt-1 text-sm text-slate-500">These module names were extracted from the CFA Level I PDFs in your material folder.</p>
              </div>
              <div className="rounded-full border border-pink-200 bg-pink-50 px-3 py-1 text-xs font-medium text-pink-500">
                {workspace.subjectSummaries.length} subjects
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              {topSubjects.map((subject) => (
                <div key={subject.id} className="rounded-[1.5rem] border border-pink-100 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{subject.title}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {subject.officialModuleCount} modules · {subject.estimatedRemainingModules} estimated modules left
                      </p>
                    </div>
                    <span className="rounded-full border border-pink-100 bg-pink-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-pink-500">
                      {subject.coverage}% covered
                    </span>
                  </div>

                  <div className="mt-3 h-2 rounded-full bg-pink-50">
                    <div className="h-2 rounded-full bg-pink-500" style={{ width: `${subject.coverage}%` }} />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {subject.officialModules.slice(0, 4).map((module) => (
                      <span key={module} className="rounded-full border border-pink-100 bg-pink-50 px-3 py-1 text-xs text-slate-700">
                        {module}
                      </span>
                    ))}
                    {subject.officialModules.length > 4 ? (
                      <span className="rounded-full border border-dashed border-pink-200 px-3 py-1 text-xs text-slate-500">
                        +{subject.officialModules.length - 4} more
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {workspace.riskZones.length > 0 ? (
            <div className="rounded-[1.75rem] border border-rose-200 bg-rose-50/70 p-5 text-sm text-rose-700">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle size={16} />
                Priority watchlist
              </div>
              <p className="mt-2">
                Focus first on {workspace.riskZones[0].title}, then {workspace.riskZones[1]?.title ?? 'the next weak topic'}.
              </p>
            </div>
          ) : null}
        </>
      ) : null}

      <div className="space-y-6">
        {filteredSubjects.length === 0 ? (
          <div className="soft-panel rounded-[1.75rem] p-5 text-center sm:rounded-[2rem] sm:p-8">
            <p className="text-slate-500">No modules match your filters. Try broadening your search.</p>
          </div>
        ) : null}

        {filteredSubjects.map((subject) => (
          <div key={subject.id} className="soft-panel overflow-hidden rounded-[2rem]">
            <div className="flex items-center justify-between border-b border-pink-100 bg-white p-6">
              <div className="flex items-center gap-4">
                <div className="rounded-2xl border border-pink-100 bg-pink-50 p-3 text-pink-500">
                  <Layers size={24} />
                </div>
                <div>
                  <h2 className="mb-1 text-xl font-semibold text-slate-900">{subject.title}</h2>
                  <div className="flex items-center gap-3 text-sm text-slate-500">
                    <span className="flex items-center gap-1.5">
                      <Star size={14} className="text-amber-500" />
                      Exam weight: {subject.weight}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <NotebookPen size={14} className="text-pink-400" />
                      {subject.topics.length} topics
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Clock3 size={14} className="text-pink-400" />
                      {workspace.subjectSummaries.find((item) => item.id === subject.id)?.officialModuleCount ?? 0} modules
                    </span>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-pink-100 bg-pink-50 p-3">
                <span className="text-sm font-semibold text-pink-500">{subject.coverage}% covered</span>
              </div>
            </div>

            <div className="flex flex-col">
              {subject.topics.map((topic) => (
                <TopicRow key={topic.id} topic={topic} onSave={workspace.saveProgress} forceOpen={isFiltering} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  )
}
