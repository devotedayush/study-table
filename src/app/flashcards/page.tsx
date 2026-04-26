'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { BookOpenCheck, Bookmark, ChevronDown, ChevronLeft, ChevronRight, Filter, Focus, Plus, RefreshCcw, Search, Sparkles, X } from 'lucide-react'
import {
  createCustomFlashcard,
  createEmptyCustomFlashcardDraft,
  loadCustomFlashcards,
  mergeCustomFlashcards,
  saveCustomFlashcards,
  type CustomFlashcard,
  type CustomFlashcardDraft,
} from '@/lib/custom-flashcards'
import { getFlashcardProgress, loadFlashcardProgressMap, saveFlashcardProgressMap, type FlashcardProgress } from '@/lib/flashcard-progress'
import { createClient } from '@/lib/supabase/browser'
import {
  clearRemoteFlashcardProgress,
  fetchRemoteCustomFlashcards,
  fetchRemoteFlashcardProgress,
  getAuthenticatedUserId,
  mergeFlashcardProgress,
  upsertRemoteCustomFlashcards,
  upsertRemoteFlashcardProgress,
} from '@/lib/study-sync'
import { cn } from '@/lib/utils'
import { flashcardSubjects, formulaFlashcards, type Flashcard } from '@/lib/flashcards-data'
import { MathText } from '@/components/katex-formula'

function confidenceLabel(value: number | null) {
  if (value === null) {
    return 'Not rated'
  }

  if (value >= 4) {
    return 'Strong'
  }

  if (value >= 3) {
    return 'Shaky'
  }

  return 'Needs work'
}

function subjectTone(subject: string) {
  const tones: Record<string, string> = {
    'Fixed Income': 'bg-slate-900 text-primary-foreground',
    'Financial Statement Analysis': 'bg-secondary text-primary',
    'Quantitative Methods': 'bg-rose-100 text-rose-700',
    'Equity Investments': 'bg-amber-100 text-foreground',
    'Derivatives': 'bg-fuchsia-100 text-fuchsia-700',
  }

  return tones[subject] ?? 'bg-card text-foreground'
}

export default function FlashcardsPage() {
  const [supabase] = useState(() => createClient())
  const [progressMap, setProgressMap] = useState<Record<string, FlashcardProgress>>({})
  const [query, setQuery] = useState('')
  const [subject, setSubject] = useState('All subjects')
  const [showOnlyWeak, setShowOnlyWeak] = useState(false)
  const [showOnlyBookmarked, setShowOnlyBookmarked] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [remoteUserId, setRemoteUserId] = useState<string | null>(null)
  const [customCards, setCustomCards] = useState<CustomFlashcard[]>([])
  const [draft, setDraft] = useState<CustomFlashcardDraft>(() => createEmptyCustomFlashcardDraft(flashcardSubjects[0] ?? 'Quantitative Methods'))
  const [formMessage, setFormMessage] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [focus, setFocus] = useState<{ ids: string[]; label: string } | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    const raw = window.sessionStorage.getItem('cfa-flashcard-focus')
    if (!raw) {
      return
    }
    window.sessionStorage.removeItem('cfa-flashcard-focus')
    try {
      const payload = JSON.parse(raw) as { ids?: string[]; label?: string }
      if (payload.ids && payload.ids.length > 0) {
        setFocus({ ids: payload.ids, label: payload.label ?? 'Focused deck' })
        setQuery('')
        setSubject('All subjects')
        setShowOnlyWeak(false)
        setShowOnlyBookmarked(false)
        setCurrentIndex(0)
        setFlipped(false)
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    let active = true

    async function hydrate() {
      const localProgress = loadFlashcardProgressMap()
      const localCustomCards = loadCustomFlashcards()
      const userId = await getAuthenticatedUserId(supabase)

      if (!active) {
        return
      }

      if (!userId) {
        setRemoteUserId(null)
        setProgressMap(localProgress)
        setCustomCards(localCustomCards)
        return
      }

      setRemoteUserId(userId)

      try {
        const [remoteProgress, remoteCustomCards] = await Promise.all([
          fetchRemoteFlashcardProgress(supabase, userId),
          fetchRemoteCustomFlashcards(supabase, userId),
        ])
        if (!active) {
          return
        }

        const mergedProgress = mergeFlashcardProgress(localProgress, remoteProgress) as Record<string, FlashcardProgress>
        const mergedCustomCards = mergeCustomFlashcards(localCustomCards, remoteCustomCards)
        setProgressMap(mergedProgress)
        setCustomCards(mergedCustomCards)
        saveFlashcardProgressMap(mergedProgress)
        saveCustomFlashcards(mergedCustomCards)
        await Promise.all([
          upsertRemoteFlashcardProgress(supabase, userId, mergedProgress),
          upsertRemoteCustomFlashcards(supabase, userId, mergedCustomCards),
        ])
      } catch {
        if (active) {
          setProgressMap(localProgress)
          setCustomCards(localCustomCards)
        }
      }
    }

    hydrate()

    return () => {
      active = false
    }
  }, [supabase])

  const deckCards = useMemo(() => [...formulaFlashcards, ...customCards], [customCards])
  const availableSubjects = useMemo(() => Array.from(new Set([...flashcardSubjects, ...customCards.map((card) => card.subject)])), [customCards])

  const filteredCards = useMemo(() => {
    if (focus) {
      const focusSet = new Set(focus.ids)
      const inFocus = deckCards.filter((card) => focusSet.has(card.id))
      return inFocus.sort((a, b) => focus.ids.indexOf(a.id) - focus.ids.indexOf(b.id))
    }

    const normalizedQuery = query.trim().toLowerCase()

    return deckCards.filter((card) => {
      const progress = getFlashcardProgress(progressMap, card.id)
      const matchesQuery =
        normalizedQuery.length === 0 ||
        [card.title, card.prompt, card.answer, card.memoryHook, card.subject, card.module, card.tags.join(' ')]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery)
      const matchesSubject = subject === 'All subjects' || card.subject === subject
      const matchesWeak = !showOnlyWeak || !progress.known || (progress.confidence ?? 0) <= 3
      const matchesBookmarked = !showOnlyBookmarked || progress.bookmarked
      return matchesQuery && matchesSubject && matchesWeak && matchesBookmarked
    })
  }, [deckCards, focus, progressMap, query, showOnlyBookmarked, showOnlyWeak, subject])

  useEffect(() => {
    setCurrentIndex(0)
    setFlipped(false)
  }, [query, showOnlyBookmarked, showOnlyWeak, subject])

  const currentCard = filteredCards[currentIndex] ?? null
  const currentProgress = currentCard ? getFlashcardProgress(progressMap, currentCard.id) : null
  const knownCount = deckCards.filter((card) => getFlashcardProgress(progressMap, card.id).known).length
  const weakCount = deckCards.filter((card) => {
    const progress = getFlashcardProgress(progressMap, card.id)
    return !progress.known || (progress.confidence ?? 0) <= 3
  }).length
  const bookmarkedCount = deckCards.filter((card) => getFlashcardProgress(progressMap, card.id).bookmarked).length

  function updateCardProgress(card: Flashcard, updates: Partial<FlashcardProgress>) {
    setProgressMap((current) => {
      const next = {
        ...current,
        [card.id]: {
          ...getFlashcardProgress(current, card.id),
          ...updates,
        },
      }
      saveFlashcardProgressMap(next)
      if (remoteUserId) {
        void upsertRemoteFlashcardProgress(supabase, remoteUserId, next)
      }
      return next
    })
  }

  function reviewCard(card: Flashcard, confidence: number) {
    const existing = getFlashcardProgress(progressMap, card.id)
    updateCardProgress(card, {
      confidence,
      known: confidence >= 4,
      lastReviewedAt: new Date().toISOString(),
      reviewCount: existing.reviewCount + 1,
    })

    if (currentIndex < filteredCards.length - 1) {
      setCurrentIndex((value) => value + 1)
      setFlipped(false)
    }
  }

  async function addCustomCard() {
    setFormError(null)
    setFormMessage(null)

    if (!draft.title.trim() || !draft.prompt.trim() || !draft.answer.trim()) {
      setFormError('Add a title, prompt, and answer before saving.')
      return
    }

    const nextCard = createCustomFlashcard(draft)
    const nextCards = [nextCard, ...customCards]
    setCustomCards(nextCards)
    saveCustomFlashcards(nextCards)

    if (remoteUserId) {
      try {
        await upsertRemoteCustomFlashcards(supabase, remoteUserId, [nextCard])
      } catch {
        setFormError('Saved locally, but Supabase sync did not finish.')
      }
    }

    setDraft(createEmptyCustomFlashcardDraft(draft.subject))
    setFormMessage('Flashcard added.')
    setShowAddForm(false)
    setSubject('All subjects')
    setShowOnlyWeak(false)
    setShowOnlyBookmarked(false)
    setQuery('')
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="space-y-8"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Formula Flashcards</h1>
          <p className="mt-2 max-w-3xl text-lg text-muted-foreground">
            A formula deck built around CFA Level I problem types. It syncs confidence and bookmarks to Supabase when you are signed in, and still works locally when you are not.
          </p>
        </div>
        <div className="rounded-[1.5rem] border border-border bg-card/85 px-5 py-4 text-right">
          <p className="text-[10px] uppercase tracking-[0.28em] text-pink-400">Mastered</p>
          <p className="mt-1 text-3xl font-semibold text-foreground">{knownCount}<span className="text-base text-muted-foreground">/{deckCards.length}</span></p>
        </div>
      </div>

      {focus ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.5rem] border border-emerald-200 bg-emerald-50/80 px-5 py-3">
          <div className="flex items-center gap-2 text-sm text-emerald-800">
            <Focus size={16} />
            <span>
              Focused on <span className="font-semibold">{focus.label}</span> · {focus.ids.length} card{focus.ids.length === 1 ? '' : 's'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setFocus(null)}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground"
          >
            <X size={12} />
            Clear focus
          </button>
        </div>
      ) : null}

      <div className="soft-panel rounded-[1.75rem] p-4 sm:rounded-[2rem] sm:p-6">
        <div className="grid gap-4 xl:grid-cols-[1.4fr_0.7fr_0.7fr_auto_auto]">
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
              <Search size={15} className="text-primary" />
              Search cards
            </span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search formula, concept, or module"
              className="w-full rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground shadow-sm outline-none transition-colors focus:border-ring focus:ring-4 focus:ring-ring/50"
            />
          </label>

          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
              <Filter size={15} className="text-primary" />
              Subject
            </span>
            <select
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              className="app-select"
            >
              <option>All subjects</option>
              {availableSubjects.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground">
            <input
              type="checkbox"
              checked={showOnlyWeak}
              onChange={(event) => setShowOnlyWeak(event.target.checked)}
              className="accent-pink-500"
            />
            Weak only
          </label>

          <label className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground">
            <input
              type="checkbox"
              checked={showOnlyBookmarked}
              onChange={(event) => setShowOnlyBookmarked(event.target.checked)}
              className="accent-pink-500"
            />
            Bookmarked
          </label>

          <button
            type="button"
            onClick={() => {
              setQuery('')
              setSubject('All subjects')
              setShowOnlyWeak(false)
              setShowOnlyBookmarked(false)
            }}
            className="rounded-2xl border border-border bg-secondary px-4 py-3 text-sm font-semibold text-primary"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="soft-panel rounded-[1.75rem] p-4 sm:rounded-[2rem] sm:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Plus className="text-primary" size={18} />
              Add flashcard
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">Create a card for any formula, trap, or concept you want to drill.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {remoteUserId ? (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-foreground">Sync on</span>
            ) : (
              <span className="rounded-full border border-border bg-secondary px-3 py-1 text-xs font-semibold text-primary">Local only</span>
            )}
            <button
              type="button"
              onClick={() => setShowAddForm((value) => !value)}
              aria-expanded={showAddForm}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm font-semibold text-primary shadow-sm transition-colors hover:bg-secondary"
            >
              {showAddForm ? 'Hide form' : 'Add flashcard'}
              <ChevronDown size={16} className={cn('transition-transform', showAddForm ? 'rotate-180' : '')} />
            </button>
          </div>
        </div>

        {showAddForm ? (
          <>
            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-foreground">Subject</span>
                <select
                  value={draft.subject}
                  onChange={(event) => setDraft((current) => ({ ...current, subject: event.target.value }))}
                  className="app-select"
                >
                  {flashcardSubjects.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-foreground">Module</span>
                <input
                  value={draft.module}
                  onChange={(event) => setDraft((current) => ({ ...current, module: event.target.value }))}
                  placeholder="Time Value of Money"
                  className="w-full rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground shadow-sm outline-none transition-colors focus:border-ring focus:ring-4 focus:ring-ring/50"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-foreground">Title</span>
                <input
                  value={draft.title}
                  onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Bond duration trap"
                  className="w-full rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground shadow-sm outline-none transition-colors focus:border-ring focus:ring-4 focus:ring-ring/50"
                />
              </label>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-foreground">Prompt</span>
                <textarea
                  value={draft.prompt}
                  onChange={(event) => setDraft((current) => ({ ...current, prompt: event.target.value }))}
                  placeholder="What should I remember?"
                  rows={4}
                  className="w-full resize-none rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground shadow-sm outline-none transition-colors focus:border-ring focus:ring-4 focus:ring-ring/50"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-foreground">Answer</span>
                <textarea
                  value={draft.answer}
                  onChange={(event) => setDraft((current) => ({ ...current, answer: event.target.value }))}
                  placeholder="The formula, rule, or explanation"
                  rows={4}
                  className="w-full resize-none rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground shadow-sm outline-none transition-colors focus:border-ring focus:ring-4 focus:ring-ring/50"
                />
              </label>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_0.8fr_auto] lg:items-end">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-foreground">Memory hook</span>
                <input
                  value={draft.memoryHook}
                  onChange={(event) => setDraft((current) => ({ ...current, memoryHook: event.target.value }))}
                  placeholder="Short cue that makes it stick"
                  className="w-full rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground shadow-sm outline-none transition-colors focus:border-ring focus:ring-4 focus:ring-ring/50"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-foreground">Tags</span>
                <input
                  value={draft.tags}
                  onChange={(event) => setDraft((current) => ({ ...current, tags: event.target.value }))}
                  placeholder="duration, fixed-income"
                  className="w-full rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground shadow-sm outline-none transition-colors focus:border-ring focus:ring-4 focus:ring-ring/50"
                />
              </label>

              <button
                type="button"
                onClick={addCustomCard}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5"
              >
                <Plus size={16} />
                Add card
              </button>
            </div>
          </>
        ) : null}

        {formError ? <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">{formError}</p> : null}
        {formMessage ? <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-foreground">{formMessage}</p> : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="soft-panel rounded-[1.75rem] p-4 sm:rounded-[2rem] sm:p-6">
          {currentCard ? (
            <>
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn('rounded-full px-3 py-1 text-xs font-semibold', subjectTone(currentCard.subject))}>
                      {currentCard.subject}
                    </span>
                    <span className="rounded-full border border-border bg-secondary px-3 py-1 text-xs font-semibold text-primary">
                      {currentCard.module}
                    </span>
                  </div>
                  <h2 className="mt-4 text-2xl font-semibold text-foreground">{currentCard.title}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Card {currentIndex + 1} of {filteredCards.length}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    updateCardProgress(currentCard, {
                      bookmarked: !currentProgress?.bookmarked,
                    })
                  }
                  className={cn(
                    'rounded-full border px-3 py-3 transition-colors',
                    currentProgress?.bookmarked ? 'border-border bg-secondary text-primary' : 'border-border bg-card text-muted-foreground',
                  )}
                >
                  <Bookmark size={18} className={currentProgress?.bookmarked ? 'fill-current' : ''} />
                </button>
              </div>

              <button
                type="button"
                onClick={() => setFlipped((value) => !value)}
                className="group block w-full rounded-[1.75rem] border border-border bg-card p-4 text-left shadow-[0_18px_50px_-35px_rgba(244,114,182,0.25)] sm:rounded-[2rem] sm:p-6"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-pink-400">
                  {flipped ? 'Answer side' : 'Prompt side'}
                </p>

                {!flipped ? (
                  <div className="mt-6 min-h-[200px]">
                    <MathText text={currentCard.prompt} className="text-2xl font-semibold leading-10 text-foreground" />
                    <p className="mt-6 text-sm text-muted-foreground">Tap to flip and reveal the formula, hook, and what to remember.</p>
                  </div>
                ) : (
                  <div className="mt-6 min-h-[200px] space-y-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Formula / answer</p>
                      <MathText text={currentCard.answer} className="mt-2 text-xl font-semibold leading-9 text-foreground" />
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Memory hook</p>
                      <MathText text={currentCard.memoryHook} className="mt-2 text-base leading-7 text-muted-foreground" />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {currentCard.tags.map((tag) => (
                        <span key={tag} className="rounded-full border border-border bg-secondary/80 px-3 py-1 text-xs font-medium text-primary">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </button>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-muted-foreground">
                  Confidence: <span className="font-semibold text-foreground">{confidenceLabel(currentProgress?.confidence ?? null)}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentIndex((value) => Math.max(0, value - 1))}
                    disabled={currentIndex === 0}
                    className="inline-flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ChevronLeft size={16} />
                    Prev
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentIndex((value) => Math.min(filteredCards.length - 1, value + 1))}
                    disabled={currentIndex >= filteredCards.length - 1}
                    className="inline-flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-3">
                {[
                  { label: 'Again', value: 2, tone: 'border-rose-200 bg-rose-50 text-rose-600' },
                  { label: 'Good', value: 4, tone: 'border-border bg-secondary text-primary' },
                  { label: 'Easy', value: 5, tone: 'border-emerald-200 bg-emerald-50 text-emerald-600' },
                ].map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => reviewCard(currentCard, action.value)}
                    className={cn('rounded-2xl border px-4 py-3 text-sm font-semibold', action.tone)}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="rounded-[1.5rem] border border-dashed border-border bg-card/70 p-8 text-sm text-muted-foreground">
              No cards match the current filters. Clear one of the filters and the deck will repopulate.
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="soft-panel rounded-[1.75rem] p-4 sm:rounded-[2rem] sm:p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Sparkles className="text-primary" size={18} />
              Review guidance
            </h2>
            <div className="mt-4 space-y-3 text-sm leading-7 text-muted-foreground">
              <p>Use this deck before quizzes if formulas are leaking from memory, especially quant, FSA, fixed income, and derivatives.</p>
              <p>Mark cards as easy only when you can recall both the formula and when to use it under exam pressure.</p>
              <p>Bookmark cards that repeatedly trip you up so the deck doubles as a pre-mock rescue list.</p>
            </div>
          </div>

          <div className="soft-panel rounded-[1.75rem] p-4 sm:rounded-[2rem] sm:p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <BookOpenCheck className="text-primary" size={18} />
              Weak card queue
            </h2>
            <div className="mt-4 space-y-3">
              {deckCards
                .filter((card) => {
                  const progress = getFlashcardProgress(progressMap, card.id)
                  return !progress.known || (progress.confidence ?? 0) <= 3
                })
                .slice(0, 6)
                .map((card) => {
                  const progress = getFlashcardProgress(progressMap, card.id)
                  return (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => {
                        const nextIndex = filteredCards.findIndex((item) => item.id === card.id)
                        if (nextIndex >= 0) {
                          setCurrentIndex(nextIndex)
                          setFlipped(false)
                        }
                      }}
                      className="block w-full rounded-2xl border border-border bg-card px-4 py-4 text-left"
                    >
                      <p className="font-medium text-foreground">{card.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {card.subject} · {confidenceLabel(progress.confidence)}
                      </p>
                    </button>
                  )
                })}
            </div>
          </div>

          <div className="soft-panel rounded-[1.75rem] p-4 sm:rounded-[2rem] sm:p-6">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                <RefreshCcw className="text-primary" size={18} />
                Reset local deck
              </h2>
              <button
                type="button"
                onClick={() => {
                  setProgressMap({})
                  saveFlashcardProgressMap({})
                  if (remoteUserId) {
                    void clearRemoteFlashcardProgress(supabase, remoteUserId)
                  }
                }}
                className="rounded-2xl border border-border bg-secondary px-4 py-2 text-sm font-semibold text-primary"
              >
                Clear progress
              </button>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              This only resets local flashcard confidence and bookmarks for this browser. It does not affect syllabus progress, notes, or assessments.
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
