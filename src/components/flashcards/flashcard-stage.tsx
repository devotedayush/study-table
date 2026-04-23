'use client'

import { motion } from 'framer-motion'
import { Bookmark, CheckCircle2, CornerDownLeft, Flame, Shuffle, Star, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FlashcardCard } from '@/lib/flashcards-data'

export type FlashcardProgress = {
  status: 'new' | 'learning' | 'known' | 'mastered'
  confidence: number
  reviewCount: number
  lastReviewedAt: string | null
  bookmarked: boolean
}

type FlashcardStageProps = {
  card: FlashcardCard
  progress: FlashcardProgress
  flipped: boolean
  dueLabel: string
  reviewLabel: string
  onFlip: () => void
  onMark: (status: FlashcardProgress['status'], confidence?: number) => void
  onConfidenceChange: (confidence: number) => void
  onBookmark: () => void
  onPrevious: () => void
  onNext: () => void
}

export function progressTone(status: FlashcardProgress['status']) {
  return {
    new: 'bg-white border-pink-100 text-slate-500',
    learning: 'bg-amber-50 border-amber-200 text-amber-700',
    known: 'bg-rose-50 border-rose-200 text-rose-700',
    mastered: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  }[status]
}

export function FlashcardStage({
  card,
  progress,
  flipped,
  dueLabel,
  reviewLabel,
  onFlip,
  onMark,
  onConfidenceChange,
  onBookmark,
  onPrevious,
  onNext,
}: FlashcardStageProps) {
  return (
    <div className="soft-panel rounded-[2rem] p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-pink-100 bg-pink-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-pink-500">
            {card.subjectTitle}
          </span>
          <span className="rounded-full border border-pink-100 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            {card.topicTitle}
          </span>
          <span className={cn('rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em]', progressTone(progress.status))}>
            {progress.status.replaceAll('_', ' ')}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Star size={14} className="text-amber-500" />
          {reviewLabel}
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-3 text-sm text-slate-600">
        <span className="rounded-full border border-pink-100 bg-white px-3 py-1.5">{dueLabel}</span>
        <span className="rounded-full border border-pink-100 bg-white px-3 py-1.5">Difficulty {card.difficulty}/5</span>
        <span className="rounded-full border border-pink-100 bg-white px-3 py-1.5">Confidence {progress.confidence}/5</span>
        <span className="rounded-full border border-pink-100 bg-white px-3 py-1.5">{progress.reviewCount} reviews</span>
      </div>

      <div
        className="group relative min-h-[360px] cursor-pointer rounded-[2rem] border border-pink-100 bg-white p-4 shadow-[0_24px_70px_-45px_rgba(244,114,182,0.55)] sm:min-h-[420px]"
        style={{ perspective: '1800px' }}
        onClick={onFlip}
      >
        <motion.div
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: 0.55, ease: 'easeInOut' }}
          className="relative h-full min-h-[390px] w-full"
          style={{ transformStyle: 'preserve-3d' }}
        >
          <div
            className="absolute inset-0 flex flex-col justify-between rounded-[1.5rem] border border-pink-100 bg-white p-4 sm:p-6"
            style={{ backfaceVisibility: 'hidden' }}
          >
            <div>
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pink-400">Front</p>
                <div className="rounded-full border border-pink-100 bg-pink-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-pink-500">
                  Tap to flip
                </div>
              </div>
              <h3 className="max-w-2xl text-2xl font-semibold leading-tight text-slate-900 sm:text-3xl">{card.front}</h3>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base sm:leading-7">{card.hint}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  onPrevious()
                }}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-pink-100 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-pink-50"
              >
                <CornerDownLeft size={16} className="rotate-180" />
                Previous
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  onNext()
                }}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-pink-100 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-pink-50"
              >
                <Shuffle size={16} />
                Next card
              </button>
            </div>
          </div>

          <div
            className="absolute inset-0 flex flex-col justify-between rounded-[1.5rem] border border-pink-100 bg-white p-4 sm:p-6"
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
            <div>
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pink-400">Back</p>
                <div className="flex items-center gap-2 text-pink-500">
                  {progress.bookmarked ? <Bookmark size={16} fill="currentColor" /> : <Bookmark size={16} />}
                </div>
              </div>
              <p className="max-w-3xl whitespace-pre-wrap text-base leading-7 text-slate-800 sm:text-lg sm:leading-8">{card.back}</p>

              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-2xl border border-pink-100 bg-white px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Tags</p>
                  <p className="mt-2 text-sm text-slate-600">{card.tags.join(' · ')}</p>
                </div>
                <div className="rounded-2xl border border-pink-100 bg-white px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Level</p>
                  <p className="mt-2 text-sm text-slate-600">{card.kind.replace('_', ' ')}</p>
                </div>
                <div className="rounded-2xl border border-pink-100 bg-white px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Memory cue</p>
                  <p className="mt-2 text-sm text-slate-600">{card.hint}</p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-2xl border border-pink-100 bg-white px-4 py-3">
                <div className="flex items-center justify-between gap-3 text-sm text-slate-600">
                  <span className="font-semibold text-slate-700">Confidence</span>
                  <span>{progress.confidence}/5</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="5"
                  step="1"
                  value={progress.confidence}
                  onChange={(event) => {
                    event.stopPropagation()
                    onConfidenceChange(Number(event.target.value))
                  }}
                  onClick={(event) => event.stopPropagation()}
                  className="mt-3 w-full accent-pink-500"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    onMark('new', 2)
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-pink-100 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-pink-50"
                >
                  <XCircle size={16} className="text-rose-400" />
                  Reset
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    onMark('learning', 2)
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700 transition-colors hover:bg-amber-100"
                >
                  <Flame size={16} />
                  Learning
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    onMark('known', 4)
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-100"
                >
                  <CheckCircle2 size={16} />
                  Known
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    onMark('mastered', 5)
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
                >
                  <Star size={16} />
                  Mastered
                </button>
              </div>

              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  onBookmark()
                }}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-pink-100 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-pink-50"
              >
                <Bookmark size={16} fill={progress.bookmarked ? 'currentColor' : 'none'} />
                {progress.bookmarked ? 'Bookmarked' : 'Bookmark for later'}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
