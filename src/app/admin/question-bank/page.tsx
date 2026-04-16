'use client'

import { useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { FileUp, LoaderCircle, ShieldCheck } from 'lucide-react'
import { assessmentScopeLabels, type AssessmentScope } from '@/lib/assessment-bank'
import { cfaLevel1Syllabus } from '@/lib/cfa-data'

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
      <section className="soft-panel rounded-[2rem] p-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-pink-200 bg-pink-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-pink-500">
          <ShieldCheck size={14} />
          Admin
        </div>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-900">Question bank upload</h1>
        <p className="mt-2 max-w-3xl text-lg leading-8 text-slate-600">
          Paste a markdown question set. Baby Maan&apos;s parser will extract questions, options, answers, and rationales, then publish the set for users.
        </p>
      </section>

      <form onSubmit={handleSubmit} className="soft-panel rounded-[2rem] p-6">
        <div className="grid gap-4 lg:grid-cols-3">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">Title</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="FSA inventory chapter quiz"
              className="w-full rounded-lg border border-pink-100 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none focus:border-pink-300 focus:ring-4 focus:ring-pink-100"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">Set type</span>
            <select value={scope} onChange={(event) => setScope(event.target.value as AssessmentScope)} className="app-select">
              {Object.entries(assessmentScopeLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">Chapter target</span>
            <select
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
              disabled={scope === 'full_mock'}
              className="app-select"
            >
              {cfaLevel1Syllabus.flatMap((subject) =>
                subject.topics.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {subject.title} · {topic.title}
                  </option>
                )),
              )}
            </select>
          </label>
        </div>

        <label className="mt-4 block">
          <span className="mb-2 block text-sm font-medium text-slate-700">Markdown questions</span>
          <textarea
            value={markdown}
            onChange={(event) => setMarkdown(event.target.value)}
            rows={18}
            className="w-full resize-y rounded-lg border border-pink-100 bg-white px-4 py-3 font-mono text-sm text-slate-900 shadow-sm outline-none focus:border-pink-300 focus:ring-4 focus:ring-pink-100"
          />
        </label>

        {error ? <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</p> : null}
        {message ? <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p> : null}

        <button
          type="submit"
          disabled={isSaving || !markdown.trim()}
          className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg bg-pink-500 px-5 py-3 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? <LoaderCircle size={16} className="animate-spin" /> : <FileUp size={16} />}
          Save question bank
        </button>
      </form>
    </motion.div>
  )
}
