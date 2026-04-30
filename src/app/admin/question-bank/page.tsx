'use client'

import { useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { FileUp, LoaderCircle, ShieldCheck } from 'lucide-react'
import { assessmentScopeOptions, type AssessmentScope } from '@/lib/assessment-bank'
import { allSubtopics, cfaLevel1Syllabus } from '@/lib/cfa-data'

const exampleMarkdown = `Question 1
Which inventory method usually reports ending inventory closest to current replacement cost during rising prices?
A. FIFO
B. LIFO
C. Weighted average
Answer: A
Rationale: FIFO leaves the newest costs in ending inventory when prices rise.`

export default function AdminQuestionBankPage() {
  const [title, setTitle] = useState('')
  const [scope, setScope] = useState<AssessmentScope>('chapter_quiz')
  const [targetId, setTargetId] = useState(cfaLevel1Syllabus[0]?.topics[0]?.id ?? '')
  const [markdown, setMarkdown] = useState(exampleMarkdown)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const targetOptions =
    scope === 'subject_quiz'
      ? cfaLevel1Syllabus.map((subject) => ({ id: subject.id, label: subject.title }))
      : scope === 'topic_quiz'
        ? allSubtopics.map((subtopic) => ({ id: subtopic.id, label: `${subtopic.subject.title} · ${subtopic.title}` }))
        : cfaLevel1Syllabus.flatMap((subject) =>
            subject.topics.map((topic) => ({ id: topic.id, label: `${subject.title} · ${topic.title}` })),
          )

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSaving(true)
    setMessage(null)
    setError(null)

    try {
      const response = await fetch('/api/admin/question-bank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, scope, targetId, markdown }),
      })
      const data = (await response.json()) as { error?: string; questionCount?: number; title?: string }

      if (!response.ok) {
        setError(data.error ?? 'Could not save that question bank.')
        return
      }

      setMessage(`Saved ${data.questionCount ?? 0} questions to ${data.title ?? 'the question bank'}.`)
    } catch {
      setError('Could not reach the question bank API.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: 'easeOut' }} className="space-y-6">
      <section className="soft-panel rounded-[2rem] p-4 sm:p-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-primary">
          <ShieldCheck size={14} />
          Admin
        </div>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Question bank upload</h1>
        <p className="mt-2 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
          Paste a markdown question set. Baby Maan&apos;s parser will extract questions, options, answers, and rationales, then publish the set for users.
        </p>
      </section>

      <form onSubmit={handleSubmit} className="soft-panel rounded-[2rem] p-4 sm:p-6">
        <div className="grid gap-4 lg:grid-cols-3">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-foreground">Title</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="FSA inventory chapter quiz"
              className="w-full rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground shadow-sm outline-none focus:border-ring focus:ring-4 focus:ring-ring/50"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-foreground">Set type</span>
            <select
              value={scope}
              onChange={(event) => {
                const nextScope = event.target.value as AssessmentScope
                setScope(nextScope)
                if (nextScope === 'subject_quiz') {
                  setTargetId(cfaLevel1Syllabus[0]?.id ?? '')
                } else if (nextScope === 'topic_quiz') {
                  setTargetId(allSubtopics[0]?.id ?? '')
                } else {
                  setTargetId(cfaLevel1Syllabus[0]?.topics[0]?.id ?? '')
                }
              }}
              className="app-select"
            >
              {assessmentScopeOptions.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-foreground">Target</span>
            <select
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
              disabled={scope === 'full_mock'}
              className="app-select"
            >
              {targetOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="mt-4 block">
          <span className="mb-2 block text-sm font-medium text-foreground">Markdown questions</span>
          <textarea
            value={markdown}
            onChange={(event) => setMarkdown(event.target.value)}
            rows={18}
            className="w-full resize-y rounded-lg border border-border bg-card px-4 py-3 font-mono text-sm text-foreground shadow-sm outline-none focus:border-ring focus:ring-4 focus:ring-ring/50"
          />
        </label>

        {error ? <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</p> : null}
        {message ? <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-foreground">{message}</p> : null}

        <button
          type="submit"
          disabled={isSaving || !markdown.trim()}
          className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? <LoaderCircle size={16} className="animate-spin" /> : <FileUp size={16} />}
          Save question bank
        </button>
      </form>
    </motion.div>
  )
}
