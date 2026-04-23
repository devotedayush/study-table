'use client'

import { useState, type FormEvent } from 'react'
import { usePathname } from 'next/navigation'
import { CheckCircle2, LoaderCircle, MessageSquarePlus, X } from 'lucide-react'

export function FeedbackButton() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = message.trim()
    if (!text || sending) return

    setSending(true)
    setStatus('idle')
    setErrorMessage(null)

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, area: pathname, source: 'button' }),
      })
      const data = (await response.json()) as { saved?: boolean; error?: string; reply?: string }

      if (!response.ok || data.error) {
        setStatus('error')
        setErrorMessage(data.error ?? 'Could not send feedback.')
        return
      }

      if (data.saved === false && data.reply) {
        setStatus('error')
        setErrorMessage(data.reply)
        return
      }

      setStatus('saved')
      setMessage('')
      setTimeout(() => {
        setOpen(false)
        setStatus('idle')
      }, 1400)
    } catch {
      setStatus('error')
      setErrorMessage('Network error — feedback not sent.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed bottom-5 left-4 z-50 sm:left-6">
      {open ? (
        <div className="mb-3 w-[calc(100vw-2rem)] max-w-sm overflow-hidden rounded-lg border border-amber-200 bg-white shadow-[0_24px_70px_-28px_rgba(251,191,36,0.55)]">
          <div className="flex items-center justify-between gap-3 border-b border-amber-100 bg-amber-50/80 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white">
                <MessageSquarePlus size={18} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">Feedback</p>
                <p className="truncate text-xs text-slate-500">What should we improve or add?</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-amber-100 bg-white text-slate-500 transition-colors hover:bg-amber-50"
              aria-label="Close feedback"
            >
              <X size={16} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="px-4 py-4 space-y-3">
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Bugs, feature ideas, missing content, anything…"
              rows={5}
              maxLength={4000}
              className="w-full resize-none rounded-lg border border-amber-100 bg-amber-50/40 px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-300 focus:ring-4 focus:ring-amber-100"
            />

            {pathname ? (
              <p className="text-[11px] text-slate-400">Page: <span className="font-mono">{pathname}</span></p>
            ) : null}

            {status === 'saved' ? (
              <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                <CheckCircle2 size={12} /> Sent — thank you!
              </div>
            ) : null}
            {status === 'error' && errorMessage ? (
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600">{errorMessage}</p>
            ) : null}

            <button
              type="submit"
              disabled={sending || !message.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sending ? <LoaderCircle size={14} className="animate-spin" /> : null}
              {sending ? 'Sending…' : 'Send feedback'}
            </button>
          </form>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-12 items-center gap-2 rounded-lg border border-amber-200 bg-white px-3 text-sm font-semibold text-amber-700 shadow-[0_18px_45px_-20px_rgba(251,191,36,0.65)] transition-transform hover:-translate-y-0.5"
        aria-expanded={open}
      >
        <MessageSquarePlus size={16} />
        Feedback
      </button>
    </div>
  )
}
