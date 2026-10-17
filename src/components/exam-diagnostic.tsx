'use client'

import { useState } from 'react'
import { AlertCircle, Clock3, LoaderCircle, RotateCcw, Sparkles, WandSparkles } from 'lucide-react'
import type { ExamAttempt } from '@/lib/learning-store'
import type { ExamAIAnalysis, ExamDiagnostic, TopicDiagnostic } from '@/lib/exam-analysis'
import { cfaLevel1Syllabus } from '@/lib/cfa-data'
import { cn } from '@/lib/utils'

type AnalysisUiState = {
  status: 'loading' | 'ready' | 'error'
  analysis?: ExamAIAnalysis
  model?: string
  reasoning?: string
  error?: string
}

function durationLabel(seconds: number | null) {
  if (seconds === null) return '—'
  if (seconds < 60) return `${Math.round(seconds)} sec`
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`
}

function topicMissCount(topic: TopicDiagnostic) {
  return new Set([...topic.wrongQuestionIds, ...topic.unansweredQuestionIds]).size
}

export function ExamDiagnosticPanel({
  attempt,
  diagnostic,
  analysisState,
  onRetryAnalysis,
  onTopicPractice,
  onFreshPractice,
  isGeneratingPractice,
  freshPracticeError,
}: {
  attempt: ExamAttempt
  diagnostic: ExamDiagnostic
  analysisState?: AnalysisUiState
  onRetryAnalysis: () => void
  onTopicPractice: (topic: TopicDiagnostic) => void
  onFreshPractice: (focus: ExamAIAnalysis['focusAreas'][number]) => void
  isGeneratingPractice: boolean
  freshPracticeError?: string | null
}) {
  const rulesSummary = analysisState?.status === 'ready' && analysisState.analysis?.generatedBy === 'rules'
  const [expandedTopics, setExpandedTopics] = useState(false)
  const topics = expandedTopics ? diagnostic.weakTopics : diagnostic.weakTopics.slice(0, 4)
  const topicMap = new Map(diagnostic.topicPerformance.map((topic) => [`${topic.subjectId}:${topic.topicId}`, topic]))
  const questionReferences = new Map(attempt.questions.map((question, index) => [question.id, {
    number: question.sourceQuestionNumber ?? index + 1,
    session: question.sourceSession,
  }]))

  return (
    <section className="overflow-hidden rounded-3xl border border-blue-100 bg-white shadow-sm">
      <div className="border-b border-blue-100 bg-blue-50/70 px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-800">Automatic result analysis</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-950">Where to focus next</h2>
            <p className="mt-1 text-xs leading-5 text-slate-600">Based only on this attempt. Topic accuracy uses answered questions; the paper score includes skipped scored questions. Missed-question drills use this paper’s questions.</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-blue-100 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-blue-900"><Clock3 size={13} /> Average {durationLabel(diagnostic.totals.averageSeconds)} / question</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-[10px] text-slate-500">Correct</p><p className="mt-1 text-lg font-semibold text-emerald-700">{diagnostic.totals.correct}</p></div>
          <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-[10px] text-slate-500">Incorrect</p><p className="mt-1 text-lg font-semibold text-rose-700">{diagnostic.totals.incorrect}</p></div>
          <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-[10px] text-slate-500">Unanswered</p><p className="mt-1 text-lg font-semibold text-slate-800">{diagnostic.totals.unanswered}</p></div>
          <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-[10px] text-slate-500">Slower correct answers</p><p className="mt-1 text-lg font-semibold text-amber-700">{diagnostic.topicPerformance.reduce((sum, topic) => sum + topic.slowCorrectQuestionIds.length, 0)}</p></div>
        </div>
        {diagnostic.totals.limitedEvidence ? <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-900">Early signal only: this attempt has a small sample, so topic patterns may change with more questions.</p> : null}
        {diagnostic.weakTopics.length > 0 ? (
          <div className="mt-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-sm font-semibold text-slate-950">Topic-level evidence</h3><p className="text-[10px] text-slate-500">Slow means more than 1.5× this attempt’s median answer time.</p></div>
            <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
              {topics.map((topic) => {
                const missedCount = topicMissCount(topic)
                const slowCount = topic.slowCorrectQuestionIds.length
                const evidence = topic.evidenceQuestions.slice(0, 4)
                const badge = topic.answered === 0
                  ? { label: 'Unanswered', classes: 'bg-slate-100 text-slate-700' }
                  : topic.limitedEvidence
                    ? { label: topic.accuracy === null ? 'Early signal' : `${topic.accuracy}% · early signal`, classes: 'bg-amber-50 text-amber-900' }
                    : topic.accuracy === null || topic.accuracy < 60
                      ? { label: `${topic.accuracy ?? 0}% correct`, classes: 'bg-rose-50 text-rose-800' }
                      : { label: `${topic.accuracy}% correct`, classes: 'bg-amber-50 text-amber-800' }
                return <article key={`${topic.subjectId}:${topic.topicId}`} className="rounded-xl border border-slate-200 bg-white p-3.5">
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-[10px] font-medium text-slate-500">{topic.subject}</p><h4 className="mt-0.5 text-sm font-semibold text-slate-900">{topic.topic}</h4></div><span className={cn('shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold', badge.classes)}>{badge.label}</span></div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]"><span className="rounded-md bg-rose-50 px-2 py-1 text-rose-800">{topic.incorrect} incorrect</span><span className="rounded-md bg-slate-100 px-2 py-1 text-slate-700">{topic.unanswered} unanswered</span>{slowCount > 0 ? <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-800">{slowCount} slow but correct</span> : null}<span className="rounded-md bg-slate-100 px-2 py-1 text-slate-600">Avg {durationLabel(topic.averageSeconds)}</span></div>
                  {evidence.length > 0 ? <p className="mt-2 text-[10px] text-slate-500">Evidence from question{evidence.length === 1 ? '' : 's'} {evidence.map((item) => `${item.sourceSession ? `S${item.sourceSession} · ` : ''}Q${item.questionNumber}`).join(', ')}{topic.limitedEvidence ? ' · small sample' : ''}</p> : null}
                  {missedCount > 0 ? <button type="button" onClick={() => onTopicPractice(topic)} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-800 px-3 py-2 text-[11px] font-semibold text-white hover:bg-blue-900"><RotateCcw size={13} />Practice these {missedCount} missed questions</button> : null}
                </article>
              })}
            </div>
            {diagnostic.weakTopics.length > 4 ? <button type="button" onClick={() => setExpandedTopics(!expandedTopics)} aria-expanded={expandedTopics} className="mt-3 text-xs font-semibold text-blue-800 hover:underline">{expandedTopics ? 'Show fewer topics' : `Show all ${diagnostic.weakTopics.length} topics`}</button> : null}
          </div>
        ) : <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-xs text-emerald-900">{diagnostic.totals.limitedEvidence ? 'This is a small sample, so it is too early to identify a reliable weak topic.' : 'No incorrect, unanswered, or unusually slow topics were detected in this attempt.'}</div>}
      </div>

      <div className="px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2.5"><span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 text-violet-800"><Sparkles size={15} /></span><div><h3 className="text-sm font-semibold text-slate-950">{rulesSummary ? 'Result summary' : 'AI explanation'}</h3><p className="mt-0.5 text-[11px] text-slate-500">{rulesSummary ? 'This summary is based on your verified answers and time in this attempt.' : 'The topic and answer counts above are calculated locally from this attempt.'}</p></div></div>
          {analysisState?.status === 'ready' && rulesSummary ? <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500">Result summary</span> : analysisState?.status === 'ready' && analysisState.model ? <span className="text-[10px] text-slate-400">{analysisState.model}{analysisState.reasoning ? ` · ${analysisState.reasoning}` : ''}</span> : null}
        </div>
        {analysisState?.status === 'loading' ? <p className="mt-3 flex items-center gap-2 text-xs text-slate-600"><LoaderCircle size={15} className="animate-spin text-blue-700" />Reviewing your attempt…</p> : null}
        {analysisState?.status === 'error' ? <div role="status" className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3"><p className="flex items-start gap-2 text-xs leading-5 text-amber-900"><AlertCircle size={15} className="mt-0.5 shrink-0" />{analysisState.error || 'AI analysis could not be completed. Your answer-based analysis is available above.'}</p><button type="button" onClick={onRetryAnalysis} className="rounded-lg bg-white px-3 py-2 text-[11px] font-semibold text-slate-800 ring-1 ring-amber-200 hover:bg-amber-100">Retry AI analysis</button></div> : null}
        {analysisState?.status === 'ready' && analysisState.analysis ? <div className="mt-3 space-y-3">
          <p className="rounded-xl border border-violet-100 bg-violet-50/60 px-3.5 py-3 text-sm leading-6 text-slate-700">{analysisState.analysis.summary}</p>
          {analysisState.analysis.focusAreas.slice(0, 5).map((focus, index) => {
            const topic = topicMap.get(`${focus.subjectId}:${focus.topicId}`)
            const cited = focus.evidenceQuestionIds.slice(0, 4).map((id) => questionReferences.get(id)).filter((reference): reference is { number: number; session: number | undefined } => reference !== undefined)
            return <article key={`${focus.subjectId}-${focus.topicId}-${index}`} className="rounded-xl border border-slate-200 p-3.5">
              <p className="text-[10px] font-medium text-slate-500">{topic ? `${topic.subject} · ${topic.topic}` : focus.topicId}</p>
              <h4 className="mt-1 text-sm font-semibold text-slate-950">{focus.concept}</h4>
              <p className="mt-1 text-xs leading-5 text-slate-600">{focus.explanation}</p>
              {cited.length > 0 ? <p className="mt-2 text-[10px] font-medium text-slate-500">Evidence: {cited.map((reference) => `${reference.session ? `S${reference.session} · ` : ''}Q${reference.number}`).join(', ')}</p> : null}
              {focus.practiceTask ? <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700"><span className="font-semibold">Try this:</span> {focus.practiceTask}</p> : null}
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                {topic && topicMissCount(topic) > 0 ? <button type="button" onClick={() => onTopicPractice(topic)} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-blue-800 hover:underline"><RotateCcw size={12} />Retry these missed questions ({topicMissCount(topic)})</button> : null}
                {cfaLevel1Syllabus.some((subject) => subject.id === focus.subjectId && subject.topics.some((canonicalTopic) => canonicalTopic.id === focus.topicId)) ? <button type="button" onClick={() => onFreshPractice(focus)} disabled={isGeneratingPractice} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-violet-800 hover:underline disabled:cursor-not-allowed disabled:opacity-50"><WandSparkles size={12} />{isGeneratingPractice ? 'Creating drill…' : 'New 5-question drill'}</button> : null}
              </div>
            </article>
          })}
          {freshPracticeError ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs leading-5 text-rose-900">New practice could not be created: {freshPracticeError}</p> : null}
        </div> : null}
      </div>
    </section>
  )
}
