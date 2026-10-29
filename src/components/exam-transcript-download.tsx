'use client'

import { useRef, useState } from 'react'
import { Download, LoaderCircle } from 'lucide-react'
import type { ExamAttempt } from '@/lib/learning-store'

export function ExamTranscriptDownload({ attempt }: { attempt: ExamAttempt }) {
  const busy = useRef(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')

  async function download() {
    if (busy.current) return
    busy.current = true
    setDownloading(true)
    setError('')
    try {
      // Only load the PDF engine when requested; exam-taking stays lightweight.
      const { downloadExamTranscript } = await import('@/lib/exam-transcript-pdf')
      await downloadExamTranscript(attempt)
    } catch {
      setError('The transcript could not be generated. Please try again.')
    } finally {
      busy.current = false
      setDownloading(false)
    }
  }

  return <div className="flex flex-col items-start gap-2">
    <button type="button" onClick={() => void download()} disabled={downloading} aria-busy={downloading} className="inline-flex items-center gap-2 rounded-xl border border-white/30 px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-white/10 disabled:cursor-wait disabled:opacity-70">
      {downloading ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> : <Download size={14} aria-hidden="true" />}
      {downloading ? 'Preparing PDF…' : 'Download transcript'}
    </button>
    {error ? <p role="alert" className="max-w-64 text-xs text-rose-100">{error}</p> : null}
  </div>
}
