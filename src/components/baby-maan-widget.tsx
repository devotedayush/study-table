'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Bot, CheckCircle2, LoaderCircle, Maximize2, MessageCircleHeart, SendHorizonal, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type ChatMessage = {
  id: string
  role: 'assistant' | 'user'
  content: string
  preview?: Record<string, unknown> | null
}

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

  if (preview.type === 'feedback') {
    return typeof preview.receiptTitle === 'string' ? preview.receiptTitle : 'Feedback sent'
  }

  if (preview.type === 'progress_snapshot') {
    return `${preview.completionPercentage ?? 0}% done right now`
  }

  return null
}

export function BabyMaanWidget() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: 'I can update progress, create flashcards, save notes, log mocks, or change settings.',
    },
  ])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const message = input.trim()

    if (!message || isSending) {
      return
    }

    setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', content: message }])
    setInput('')
    setError(null)
    setIsSending(true)

    try {
      const response = await fetch('/api/baby-maan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })
      const data = (await response.json()) as {
        error?: string
        reply?: string
        preview?: Record<string, unknown> | null
      }

      if (!response.ok) {
        setError(data.error ?? 'Baby Maan could not save that.')
        return
      }

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: data.reply ?? 'Saved.',
          preview: data.preview ?? null,
        },
      ])
    } catch {
      setError('Baby Maan could not reach the server.')
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="fixed bottom-3 left-3 right-3 z-50 sm:bottom-5 sm:right-6 sm:left-auto">
      {open ? (
        <div className="mb-3 w-full max-w-[24rem] overflow-hidden rounded-lg border border-border bg-card shadow-[0_24px_70px_-28px_rgba(244,114,182,0.55)] max-h-[calc(100dvh-8rem)]">
          <div className="flex items-center justify-between gap-3 border-b border-border bg-secondary/80 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Bot size={18} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">Baby Maan</p>
                <p className="truncate text-xs text-muted-foreground">Quick update window</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => router.push('/assistant')}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-primary transition-colors hover:bg-secondary"
                aria-label="Open Baby Maan full screen"
              >
                <Maximize2 size={16} />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-secondary"
                aria-label="Close Baby Maan"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="max-h-[calc(100dvh-18rem)] space-y-3 overflow-y-auto px-4 py-4">
            {messages.map((message) => {
              const label = previewLabel(message.preview)

              return (
                <div
                  key={message.id}
                  className={cn(
                    'max-w-[92%] rounded-lg px-3 py-2 text-sm leading-6',
                    message.role === 'user'
                      ? 'ml-auto bg-primary text-primary-foreground'
                      : 'border border-border bg-secondary/70 text-foreground',
                  )}
                >
                  <p>{message.content}</p>
                  {label ? (
                    <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-foreground">
                      <CheckCircle2 size={12} />
                      {label}
                    </div>
                  ) : null}
                </div>
              )
            })}

            {isSending ? (
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
                <LoaderCircle size={14} className="animate-spin text-pink-400" />
                Updating...
              </div>
            ) : null}

            {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600">{error}</p> : null}
          </div>

          <form onSubmit={handleSubmit} className="border-t border-border bg-card px-3 py-3">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask Baby Maan..."
                rows={2}
                className="min-h-12 flex-1 resize-none rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-4 focus:ring-ring/50"
              />
              <button
                type="submit"
                disabled={isSending || !input.trim()}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Send message to Baby Maan"
              >
                <SendHorizonal size={17} />
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="ml-auto flex h-12 sm:h-14 items-center gap-2 sm:gap-3 rounded-lg border border-border bg-primary px-3 sm:px-4 text-sm font-semibold text-primary-foreground shadow-[0_18px_45px_-20px_rgba(236,72,153,0.8)] transition-transform hover:-translate-y-0.5"
        aria-expanded={open}
      >
        <MessageCircleHeart size={18} />
        <span className="hidden sm:inline">Baby Maan</span>
      </button>
    </div>
  )
}
