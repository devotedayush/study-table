'use client'

import { useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { Bot, CheckCircle2, LoaderCircle, SendHorizonal, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

type ChatMessage = {
  id: string
  role: 'assistant' | 'user'
  content: string
  applied?: boolean
  preview?: Record<string, unknown> | null
}

const starterPrompts = [
  'Baby Maan, I studied time value of money for 50 minutes and still feel shaky.',
  'Baby Maan, mark Fixed Income Bond Valuation as 70% done with confidence 3.',
  'Baby Maan, how far am I in Quantitative Methods?',
  'Baby Maan, create a flashcard for diluted EPS.',
  'Baby Maan, save a note: FIFO keeps ending inventory closer to current cost in rising prices.',
  'Baby Maan, I scored 68% on a mock today and felt rushed.',
  'Baby Maan, change my exam date to 2026-11-20 and keep Sundays as rest days.',
]

function previewLabel(preview: Record<string, unknown> | null | undefined) {
  if (!preview?.type || typeof preview.type !== 'string') {
    return null
  }

  if (preview.type === 'progress') {
    return typeof preview.receiptTitle === 'string' ? preview.receiptTitle : `${preview.title ?? 'Study progress'} updated`
  }

  if (preview.type === 'note') {
    return typeof preview.receiptTitle === 'string' ? preview.receiptTitle : `${preview.title ?? 'Note'} saved`
  }

  if (preview.type === 'flashcard') {
    return typeof preview.receiptTitle === 'string' ? preview.receiptTitle : `${preview.title ?? 'Flashcard'} created`
  }

  if (preview.type === 'mock') {
    return typeof preview.receiptTitle === 'string' ? preview.receiptTitle : `Mock score ${preview.totalScore ?? ''}% logged`
  }

  if (preview.type === 'settings') {
    return typeof preview.receiptTitle === 'string' ? preview.receiptTitle : 'Study settings updated'
  }

  if (preview.type === 'progress_snapshot') {
    return `${preview.completionPercentage ?? 0}% done right now`
  }

  return null
}

export default function AssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: crypto.randomUUID(),
      role: 'assistant',
      content:
        'I’m Baby Maan. You can tell me what you studied, what felt confusing, ask for a flashcard, share mock scores, or change a setting, and I’ll update the app for you.',
    },
  ])
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event?: FormEvent<HTMLFormElement>, prompt?: string) {
    event?.preventDefault()
    const message = (prompt ?? input).trim()

    if (!message || isSending) {
      return
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: message,
    }

    setMessages((current) => [...current, userMessage])
    setInput('')
    setError(null)
    setIsSending(true)

    try {
      const response = await fetch('/api/baby-maan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message }),
      })

      const data = (await response.json()) as {
        error?: string
        reply?: string
        applied?: boolean
        preview?: Record<string, unknown> | null
      }

      if (!response.ok) {
        setError(data.error ?? 'Baby Maan could not save that update.')
        return
      }

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: data.reply ?? 'Saved.',
          applied: data.applied,
          preview: data.preview ?? null,
        },
      ])
    } catch {
      setError('Baby Maan could not reach the server just now.')
    } finally {
      setIsSending(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="space-y-8"
    >
      <section className="soft-panel rounded-[2rem] p-6 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-pink-200 bg-pink-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.26em] text-pink-500">
              <Sparkles size={14} />
              Baby Maan
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Update the app by chatting</h1>
            <p className="mt-3 text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
              Keep this simple. Tell Baby Maan what you studied, what felt unclear, ask for a flashcard, share your mock result, or change a setting. If it understands the update, it writes it into your synced study data.
            </p>
          </div>

          <div className="rounded-3xl border border-pink-100 bg-white/90 p-4 text-sm text-slate-600 shadow-sm">
            <p className="font-semibold text-slate-900">What it can update</p>
            <p className="mt-2">Progress, notes, flashcards, mock scores, and study settings.</p>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.6fr_0.8fr]">
        <div className="soft-panel rounded-[2rem] p-4 sm:p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-pink-500 text-white shadow-sm">
              <Bot size={22} />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Chat</h2>
              <p className="text-sm text-slate-500">One update at a time works best.</p>
            </div>
          </div>

          <div className="space-y-4 rounded-[1.75rem] border border-pink-100 bg-white/80 p-4">
            {messages.map((message) => {
              const label = previewLabel(message.preview)
              const snapshot =
                message.preview?.type === 'progress_snapshot' || message.preview?.type === 'progress'
                  ? {
                      scope: message.preview.scope,
                      title: message.preview.title,
                      status: message.preview.status,
                      completionPercentage: message.preview.completionPercentage,
                      confidence: message.preview.confidence,
                      minutesSpent: message.preview.minutesSpent,
                      totalItems: message.preview.totalItems,
                      completedItems: message.preview.completedItems,
                      receiptSummary: message.preview.receiptSummary,
                    }
                  : null
              const confidenceLabel =
                snapshot && (typeof snapshot.confidence === 'number' || typeof snapshot.confidence === 'string')
                  ? String(snapshot.confidence)
                  : 'Not set'
              const minutesLabel =
                snapshot && (typeof snapshot.minutesSpent === 'number' || typeof snapshot.minutesSpent === 'string')
                  ? String(snapshot.minutesSpent)
                  : '0'
              const countLabel =
                snapshot && typeof snapshot.totalItems === 'number'
                  ? `${typeof snapshot.completedItems === 'number' ? snapshot.completedItems : 0}/${snapshot.totalItems}`
                  : null

              return (
                <div
                  key={message.id}
                  className={cn(
                    'max-w-3xl rounded-[1.5rem] px-4 py-3 text-sm leading-7',
                    message.role === 'user'
                      ? 'ml-auto bg-pink-500 text-white shadow-sm'
                      : 'border border-pink-100 bg-pink-50/70 text-slate-700',
                  )}
                >
                  <p>{message.content}</p>
                  {message.role === 'assistant' && label ? (
                    <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                      <CheckCircle2 size={14} />
                      {label}
                    </div>
                  ) : null}
                  {message.role === 'assistant' && snapshot ? (
                    <div className="mt-3 space-y-3">
                      {typeof snapshot.receiptSummary === 'string' ? (
                        <div className="rounded-2xl border border-pink-100 bg-white/80 px-3 py-2 text-xs text-slate-600">
                          {snapshot.receiptSummary}
                        </div>
                      ) : null}
                      <div className="grid gap-2 sm:grid-cols-4">
                      <div className="rounded-2xl border border-pink-100 bg-white/80 px-3 py-2 text-xs text-slate-600">
                        <span className="block uppercase tracking-[0.2em] text-slate-400">Status</span>
                        <span className="mt-1 block font-semibold text-slate-900">{String(snapshot.status ?? 'not_started').replaceAll('_', ' ')}</span>
                      </div>
                      <div className="rounded-2xl border border-pink-100 bg-white/80 px-3 py-2 text-xs text-slate-600">
                        <span className="block uppercase tracking-[0.2em] text-slate-400">Done</span>
                        <span className="mt-1 block font-semibold text-slate-900">{String(snapshot.completionPercentage ?? 0)}%</span>
                      </div>
                      <div className="rounded-2xl border border-pink-100 bg-white/80 px-3 py-2 text-xs text-slate-600">
                        <span className="block uppercase tracking-[0.2em] text-slate-400">Confidence</span>
                        <span className="mt-1 block font-semibold text-slate-900">{confidenceLabel} / 5</span>
                      </div>
                      <div className="rounded-2xl border border-pink-100 bg-white/80 px-3 py-2 text-xs text-slate-600">
                        <span className="block uppercase tracking-[0.2em] text-slate-400">Minutes</span>
                        <span className="mt-1 block font-semibold text-slate-900">{minutesLabel}</span>
                      </div>
                      </div>
                      {countLabel ? (
                        <div className="rounded-2xl border border-pink-100 bg-white/80 px-3 py-2 text-xs text-slate-600">
                          <span className="block uppercase tracking-[0.2em] text-slate-400">Items fully done</span>
                          <span className="mt-1 block font-semibold text-slate-900">{countLabel}</span>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )
            })}

            {isSending ? (
              <div className="inline-flex items-center gap-2 rounded-full border border-pink-100 bg-white px-4 py-2 text-sm text-slate-500">
                <LoaderCircle size={16} className="animate-spin text-pink-400" />
                Baby Maan is updating things...
              </div>
            ) : null}

            {error ? <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</p> : null}
          </div>

          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Baby Maan, create a flashcard for type I vs type II errors."
              className="min-h-32 w-full rounded-[1.5rem] border border-pink-100 bg-white px-4 py-4 text-sm text-slate-700 outline-none transition focus:border-pink-300 focus:ring-4 focus:ring-pink-100"
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500">Tip: mention the reading name and what changed.</p>
              <button
                type="submit"
                disabled={isSending || !input.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-pink-500 px-5 py-3 text-sm font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                <SendHorizonal size={16} />
                Send update
              </button>
            </div>
          </form>
        </div>

        <div className="space-y-6">
          <div className="soft-panel rounded-[2rem] p-6">
            <h2 className="text-xl font-semibold text-slate-900">Try one of these</h2>
            <div className="mt-4 space-y-3">
              {starterPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void handleSubmit(undefined, prompt)}
                  className="w-full rounded-[1.5rem] border border-pink-100 bg-white px-4 py-4 text-left text-sm leading-6 text-slate-600 transition hover:border-pink-200 hover:bg-pink-50/60"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          <div className="soft-panel rounded-[2rem] p-6">
            <h2 className="text-xl font-semibold text-slate-900">Keep it reliable</h2>
            <div className="mt-4 space-y-3 text-sm leading-7 text-slate-600">
              <p>Ask for one clear update per message.</p>
              <p>Use the exact reading or subtopic name when you can.</p>
              <p>For mocks, include a score or percent.</p>
              <p>For settings, include dates in <code>YYYY-MM-DD</code> format.</p>
            </div>
          </div>
        </div>
      </section>
    </motion.div>
  )
}
