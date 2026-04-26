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
    completed_once: 'bg-secondary border-border text-primary',
    in_progress: 'bg-amber-50 border-border text-amber-600',
    flagged: 'bg-rose-50 border-rose-200 text-rose-600',
    not_started: 'bg-card border-border text-muted-foreground',
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
    <div className="border-t border-border first:border-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left transition-colors hover:bg-secondary/70"
      >
        <div className="flex min-w-0 flex-row items-center gap-3">
          <div className="shrink-0 text-pink-400">{isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</div>
          <div className="min-w-0">
            <h3 className="truncate font-medium text-foreground">{topic.title}</h3>
            <p className="text-xs text-muted-foreground">{topic.coverage}% covered</p>
          </div>
        </div>
        <div className="shrink-0 text-xs text-muted-foreground">{topic.subtopics.length} modules</div>
      </button>

      <AnimatePresence>
        {isOpen ? (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden bg-secondary/50">
            {topic.subtopics.map((subtopic) => {
              const draft = drafts[subtopic.id] ?? {
                status: subtopic.status,
                completionPercentage: String(subtopic.completionPercentage ?? 0),
                selfConfidence: String(subtopic.progress?.selfConfidence ?? 3),
                notes: subtopic.progress?.notes ?? '',
              }

              return (
                <div key={subtopic.id} className="border-t border-border px-5 py-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex items-start gap-3 sm:items-center sm:justify-start">
                        <p className="font-medium text-foreground">{subtopic.title}</p>
                        <span className={cn('shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wider', statusTone(subtopic.status))}>
                          {draft.status.replaceAll('_', ' ')}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Clock3 size={12} className="text-pink-400" />
                          {subtopic.timeEstimateMinutes}m estimate
                        </span>
                        <span>Quiz score {formatQuizScore(subtopic.mastery)}</span>
                        <span>{formatRevisionLabel(subtopic.progress?.revisionDueAt ?? null)}</span>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      <label className="block">
                        <span className="mb-2 block text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Status</span>
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
                        <span className="mb-2 block text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">% done</span>
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
                        <span className="mb-2 block text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">How comfortable you feel</span>
                        <select
                          value={draft.selfConfidence}
                          onChange={(event) => setDrafts((current) => ({ ...current, [subtopic.id]: { ...draft, selfConfidence: event.target.value } }))}
                          className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground outline-none"
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
                      <span className="mb-2 block text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Notes</span>
                      <textarea
                        rows={2}
                        value={draft.notes}
                        onChange={(event) => setDrafts((current) => ({ ...current, [subtopic.id]: { ...draft, notes: event.target.value } }))}
                        className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground outline-none"
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
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-transform hover:-translate-y-0.5"
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
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: 'easeOut' }} className="w-full min-w-0 space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Study dashboard</h1>
          <p className="mt-2 max-w-2xl text-base text-muted-foreground sm:text-lg">
            Your revision queue and the full syllabus map, side by side. Clear due items up top, then dig into any module below.
          </p>
        </div>
        <div className="rounded-[1.5rem] border border-border bg-card/80 px-5 py-4 text-right">
          <p className="text-[10px] uppercase tracking-[0.28em] text-pink-400">Readiness</p>
          <p className="mt-1 text-3xl font-semibold text-foreground">{workspace.readiness}%</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="soft-panel rounded-[1.75rem] p-4 sm:rounded-[2rem] sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Sparkles className="text-primary" size={18} />
              Next best revision
            </h2>
            <span className="rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium text-primary">
              {dueNow.length} due · {upcoming.length} upcoming
            </span>
          </div>
          <div className="mt-5 rounded-[1.5rem] border border-border bg-secondary/70 p-5">
            {topRecommendation ? (
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pink-400">Start here</p>
                  <h3 className="mt-2 text-xl font-semibold text-foreground">{topRecommendation.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {topRecommendation.subject.title} · {topRecommendation.topic.title} · {formatMastery(topRecommendation.mastery)}/5 mastery
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">{topRecommendation.overdueDays >= 0 ? formatRevisionLabel(topRecommendation.progress?.revisionDueAt ?? null) : 'Pull this into the front of your next block.'}</p>
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
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-400 px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 sm:w-auto"
                >
                  <CheckCircle2 size={15} />
                  Mark revised
                </button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No revisions are due. Keep ticking off modules below and this will populate automatically.</p>
            )}
          </div>

          {dueNow.length > 0 ? (
            <div className="mt-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <CalendarCheck2 className="text-primary" size={15} />
                Due and overdue ({dueNow.length})
              </h3>
              <div className="mt-3 space-y-2">
                {dueNow.slice(0, 5).map((item) => (
                  <div key={item.id} className="flex flex-col gap-2 rounded-2xl border border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                      <p className="truncate mt-0.5 text-xs text-muted-foreground">{item.subject.title} · {formatRevisionLabel(item.progress?.revisionDueAt ?? null)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 sm:justify-end">
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
                        className="rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-semibold text-primary hover:bg-secondary/80"
                      >
                        Revised
                      </button>
                      <button
                        type="button"
                        onClick={() => workspace.snoozeRevision(item.id, 2)}
                        className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-secondary/60"
                      >
                        Snooze 2d
                      </button>
                    </div>
                  </div>
                ))}
                {dueNow.length > 5 ? (
                  <p className="pl-1 text-xs text-muted-foreground">+{dueNow.length - 5} more surfaced inside the topics below.</p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-6">
          <div className="soft-panel rounded-[1.75rem] p-4 sm:rounded-[2rem] sm:p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
              <Clock3 className="text-primary" size={18} />
              Coming up
            </h2>
            <div className="space-y-2">
              {upcoming.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing scheduled yet — finish a few modules first.</p>
              ) : null}
              {upcoming.map((item) => (
                <div key={item.id} className="rounded-2xl border border-border bg-card px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                    <p className="truncate mt-0.5 text-xs text-muted-foreground">{item.subject.title} · {formatRevisionLabel(item.progress?.revisionDueAt ?? null)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="soft-panel rounded-[1.75rem] p-4 sm:rounded-[2rem] sm:p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
              <Sparkles className="text-primary" size={18} />
              Subject pressure
            </h2>
            <div className="space-y-2">
              {topSubjects.map((subject) => (
                <div key={subject.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{subject.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{subject.dueNowCount} due · {subject.estimatedRemainingModules} modules left</p>
                  </div>
                  <span className="shrink-0 rounded-full border border-border bg-secondary px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-primary">
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
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">Full syllabus map</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Search, filter, and update progress across all {workspace.totalSubtopics} modules.
          </p>
        </div>
      </div>

      {/* Search and filter bar */}
      <div className="soft-panel rounded-[1.75rem] p-4 sm:rounded-[2rem] sm:p-5">
        <div className="flex items-center gap-2 mb-4 text-sm font-medium text-foreground">
          <Filter size={16} className="text-primary" />
          Find modules
        </div>
        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="w-full rounded-2xl border border-border bg-card py-3 pl-11 pr-4 text-sm text-foreground outline-none placeholder:text-muted-foreground"
              placeholder="Search topics, subtopics..."
            />
            {searchQuery ? (
              <button type="button" onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground">
                <X size={16} />
              </button>
            ) : null}
          </div>
          <select
            value={subjectFilter}
            onChange={(event) => setSubjectFilter(event.target.value)}
            className="app-select lg:min-w-[14rem]"
          >
            <option value="all">All subjects</option>
            {workspace.enrichedSubjects.map((subject) => (
              <option key={subject.id} value={subject.id}>{subject.title}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as ProgressStatus | 'all')}
            className="app-select lg:min-w-[14rem]"
          >
            {statusFilterOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        {isFiltering ? (
          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Showing {filteredSubtopicCount} of {workspace.totalSubtopics} modules
            </p>
            <button
              type="button"
              onClick={() => { setSearchQuery(''); setStatusFilter('all'); setSubjectFilter('all') }}
              className="text-xs font-medium text-primary hover:text-primary"
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
                <h2 className="text-lg font-semibold text-foreground">Official curriculum map</h2>
                <p className="mt-1 text-sm text-muted-foreground">These module names were extracted from the CFA Level I PDFs in your material folder.</p>
              </div>
              <div className="rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium text-primary">
                {workspace.subjectSummaries.length} subjects
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {topSubjects.map((subject) => (
                <div key={subject.id} className="rounded-[1.5rem] border border-border bg-card p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground">{subject.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {subject.officialModuleCount} modules · {subject.estimatedRemainingModules} estimated modules left
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-border bg-secondary px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-primary">
                      {subject.coverage}% covered
                    </span>
                  </div>

                  <div className="mt-3 h-2 rounded-full bg-secondary">
                    <div className="h-2 rounded-full bg-primary" style={{ width: `${subject.coverage}%` }} />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {subject.officialModules.slice(0, 4).map((module) => (
                      <span key={module} className="rounded-full border border-border bg-secondary px-3 py-1 text-xs text-foreground">
                        {module}
                      </span>
                    ))}
                    {subject.officialModules.length > 4 ? (
                      <span className="rounded-full border border-dashed border-border px-3 py-1 text-xs text-muted-foreground">
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
            <p className="text-muted-foreground">No modules match your filters. Try broadening your search.</p>
          </div>
        ) : null}

        {filteredSubjects.map((subject) => (
          <div key={subject.id} className="soft-panel overflow-hidden rounded-[2rem]">
            <div className="flex flex-col justify-between gap-4 border-b border-border bg-card p-6 sm:flex-row sm:items-center">
              <div className="flex items-start sm:items-center gap-4">
                <div className="shrink-0 rounded-2xl border border-border bg-secondary p-3 text-primary">
                  <Layers size={24} />
                </div>
                <div className="min-w-0">
                  <h2 className="mb-1 text-xl font-semibold text-foreground">{subject.title}</h2>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                    <span className="flex shrink-0 items-center gap-1.5">
                      <Star size={14} className="text-amber-500" />
                      Exam weight: {subject.weight}
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1.5">
                      <NotebookPen size={14} className="text-pink-400" />
                      {subject.topics.length} topics
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1.5">
                      <Clock3 size={14} className="text-pink-400" />
                      {workspace.subjectSummaries.find((item) => item.id === subject.id)?.officialModuleCount ?? 0} modules
                    </span>
                  </div>
                </div>
              </div>
              <div className="shrink-0 self-start sm:self-auto rounded-2xl border border-border bg-secondary p-3">
                <span className="text-sm font-semibold text-primary">{subject.coverage}% covered</span>
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
