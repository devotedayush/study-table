'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  Check,
  ChevronRight,
  Download,
  Layers3,
  RotateCcw,
  Search,
  Sparkles,
} from 'lucide-react'
import { KatexFormula, MathText } from '@/components/katex-formula'
import { InlineQuestionText } from '@/components/question-content'
import { createClient } from '@/lib/supabase/browser'
import { cfaLevel1Syllabus, type SyllabusSubject, type SyllabusTopic } from '@/lib/cfa-data'
import { flashcardCatalogue, formulaFlashcards, type FlashcardCard } from '@/lib/flashcards-data'
import { fetchRevisionLibraryNotes, type RevisionNote } from '@/lib/revision-library'
import { recordLearningEvent, useLearningData } from '@/lib/learning-store'
import { cn } from '@/lib/utils'
import type { RecallFlashcard } from '@/lib/recall-flashcards'

type StudyCard = {
  id: string
  subjectId: string
  subject: string
  topicId: string
  topic: string
  module: string
  kind: string
  front: string
  back: string
  hint: string
  tags: string[]
  source?: RecallFlashcard['source']
}

type LibraryTopic = {
  topic: SyllabusTopic
  notes: RevisionNote[]
  cards: StudyCard[]
}

const topicStopWords = new Set([
  'and', 'for', 'the', 'with', 'from', 'into', 'about', 'using', 'based', 'introduction',
  'analysis', 'analyzing', 'measure', 'measures', 'methods', 'finance', 'financial',
  'investment', 'investments', 'professional', 'standards', 'level', 'cfa',
])

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function words(value: string) {
  return normalize(value).split(/\s+/).filter((word) => word.length > 2 && !topicStopWords.has(word))
}

function titleOverlap(left: string, right: string) {
  const leftWords = new Set(words(left))
  return words(right).filter((word) => leftWords.has(word)).length
}

function getCardsForSubject(subject: SyllabusSubject): StudyCard[] {
  const group = flashcardCatalogue.find((entry) => entry.subjectTitle === subject.title)
  const catalogueCards = group?.topics.flatMap((topic) => topic.cards) ?? []
  const mappedCatalogueCards: StudyCard[] = catalogueCards.map((card: FlashcardCard) => ({
    id: card.id,
    subjectId: subject.id,
    subject: subject.title,
    topicId: card.topicId,
    topic: card.topicTitle,
    module: card.topicTitle,
    kind: card.kind,
    front: card.front,
    back: card.back,
    hint: card.hint,
    tags: card.tags,
  }))

  const mappedFormulaCards: StudyCard[] = formulaFlashcards
    .filter((card) => card.subject === subject.title)
    .map((card) => {
      const topic = subject.topics.find((candidate) => candidate.title === card.module)
      return {
        id: card.id,
        subjectId: subject.id,
        subject: subject.title,
        topicId: topic?.id ?? `${subject.id}-${normalize(card.module).replace(/\s+/g, '-')}`,
        topic: card.module,
        module: card.module,
        kind: 'formula',
        front: card.title,
        back: card.answer,
        hint: card.memoryHook,
        tags: card.tags,
      }
    })

  const unique = new Map<string, StudyCard>()
  for (const card of [...mappedCatalogueCards, ...mappedFormulaCards]) {
    if (!unique.has(card.id)) unique.set(card.id, card)
  }
  return Array.from(unique.values())
}

function noteMatchesTopic(note: RevisionNote, topic: SyllabusTopic) {
  const noteTitle = normalize(note.module)
  const topicTitle = normalize(topic.title)
  if (noteTitle === topicTitle || noteTitle.startsWith(topicTitle) || topicTitle.startsWith(noteTitle)) {
    return true
  }

  const overlap = titleOverlap(note.module, topic.title)
  return overlap > 0 && overlap >= Math.min(2, words(topic.title).length)
}

function cardsForTopic(cards: StudyCard[], topic: SyllabusTopic) {
  const exact = cards.filter((card) => (
    card.topicId === topic.id || normalize(card.module) === normalize(topic.title) || normalize(card.topic) === normalize(topic.title)
  ))
  if (exact.length > 0) return exact

  const suffix = topic.id.replace(/^[^-]+-/, '')
  const idMatches = cards.filter((card) => {
    const cardId = normalize(card.topicId).replace(/\s+/g, '-')
    return cardId.includes(suffix) || suffix.includes(cardId)
  })
  if (idMatches.length > 0) return idMatches

  const scored = cards
    .map((card) => ({ card, score: titleOverlap(topic.title, `${card.topic} ${card.module} ${card.tags.join(' ')}`) }))
    .filter((item) => item.score > 0)
  const maxScore = Math.max(0, ...scored.map((item) => item.score))
  return scored.filter((item) => item.score === maxScore && maxScore >= Math.min(2, words(topic.title).length)).map((item) => item.card)
}

function getTopicResources(subject: SyllabusSubject, topic: SyllabusTopic, notes: RevisionNote[], cards: StudyCard[]): LibraryTopic {
  const subjectNotes = notes.filter((note) => note.subject === subject.title)
  const exactNotes = subjectNotes.filter((note) => noteMatchesTopic(note, topic))

  if (exactNotes.length > 0) {
    return { topic, notes: exactNotes, cards: cardsForTopic(cards, topic) }
  }

  const topicCards = cardsForTopic(cards, topic)
  return { topic, notes: [], cards: topicCards }
}

function noteSearchText(note: RevisionNote) {
  return [note.module, note.concept, note.terms.join(' '), note.formulas.join(' '), note.trap, note.quickRecall, note.tags.join(' ')].join(' ')
}

function cardSearchText(card: StudyCard) {
  return [card.topic, card.front, card.back, card.hint, card.tags.join(' ')].join(' ')
}

function learningTopicId(subject: SyllabusSubject, topic: SyllabusTopic | undefined) {
  return topic?.id ?? subject.topics[0]?.id
}

export function NotesWorkspace() {
  const { ready, scopeKey } = useLearningData()
  const lastNoteView = useRef('')
  const [selectedSubjectId, setSelectedSubjectId] = useState(cfaLevel1Syllabus[0]?.id ?? '')
  const [selectedTopicId, setSelectedTopicId] = useState(cfaLevel1Syllabus[0]?.topics[0]?.id ?? '')
  const [activeTab, setActiveTab] = useState<'notes' | 'flashcards'>('notes')
  const [search, setSearch] = useState('')
  const [libraryNotes, setLibraryNotes] = useState<RevisionNote[]>([])
  const [libraryReady, setLibraryReady] = useState(false)
  const [recallCards, setRecallCards] = useState<RecallFlashcard[]>([])
  const [recallStatus, setRecallStatus] = useState<'loading' | 'ready' | 'sign-in' | 'error'>('loading')
  const [recallRetry, setRecallRetry] = useState(0)
  const [deckSource, setDeckSource] = useState('all')
  const [isFlipped, setIsFlipped] = useState(false)
  const [cursorState, setCursorState] = useState<{ scopeKey: string; cursors: Record<string, string> }>({
    scopeKey: '',
    cursors: {},
  })

  useEffect(() => {
    let active = true

    async function loadLibrary() {
      try {
        const notes = await fetchRevisionLibraryNotes(createClient())
        if (active) setLibraryNotes(notes)
      } catch {
        if (active) setLibraryNotes([])
      } finally {
        if (active) setLibraryReady(true)
      }
    }

    void loadLibrary()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    async function loadRecallCards() {
      setRecallCards([])
      setRecallStatus('loading')
      try {
        const response = await fetch('/api/flashcards', { signal: controller.signal, cache: 'no-store' })
        if (controller.signal.aborted) return
        if (response.status === 401) { setRecallStatus('sign-in'); return }
        if (!response.ok) throw new Error('Recall cards unavailable')
        const data = await response.json() as RecallFlashcard[]
        if (!controller.signal.aborted) { setRecallCards(data); setRecallStatus('ready') }
      } catch {
        if (!controller.signal.aborted) setRecallStatus('error')
      }
    }
    void loadRecallCards()
    return () => controller.abort()
  }, [scopeKey, recallRetry])

  useEffect(() => {
    if (!scopeKey) {
      setCursorState({ scopeKey: '', cursors: {} })
      return
    }

    let cursors: Record<string, string> = {}
    try {
      const saved = window.localStorage.getItem(`study-table.notes-cursor:${scopeKey}`)
      if (saved) {
        const parsed: unknown = JSON.parse(saved)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          cursors = Object.fromEntries(
            Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
          )
        }
      }
    } catch {
      cursors = {}
    }
    setCursorState({ scopeKey, cursors })
  }, [scopeKey])

  const selectedSubject = useMemo(
    () => cfaLevel1Syllabus.find((subject) => subject.id === selectedSubjectId) ?? cfaLevel1Syllabus[0],
    [selectedSubjectId],
  )

  const subjectCards = useMemo(
    () => selectedSubject ? [...recallCards.filter(card => card.subjectId === selectedSubject.id), ...getCardsForSubject(selectedSubject)] : [],
    [selectedSubject, recallCards],
  )

  const cardCounts = useMemo(() => new Map(cfaLevel1Syllabus.map(subject => [
    subject.id,
    getCardsForSubject(subject).length + recallCards.filter(card => card.subjectId === subject.id).length,
  ])), [recallCards])

  const subjectNotes = useMemo(
    () => libraryNotes.filter((note) => note.subject === selectedSubject?.title),
    [libraryNotes, selectedSubject],
  )

  const topicResources = useMemo(() => {
    if (!selectedSubject) return []
    return selectedSubject.topics.map((topic) => getTopicResources(selectedSubject, topic, libraryNotes, subjectCards))
  }, [selectedSubject, libraryNotes, subjectCards])

  const query = normalize(search)
  const visibleTopicResources = topicResources.filter((resource) => {
    if (!query) return true
    const haystack = [
      resource.topic.title,
      ...resource.notes.map(noteSearchText),
      ...resource.cards.map(cardSearchText),
    ].join(' ')
    return normalize(haystack).includes(query)
  })

  const selectedTopicResource = visibleTopicResources.find((resource) => resource.topic.id === selectedTopicId)
    ?? visibleTopicResources[0]
  const visibleCards = subjectCards.filter((card) => (
    (deckSource === 'all' || (deckSource === 'recall' ? Boolean(card.source) : !card.source)) &&
    (!query || normalize(cardSearchText(card)).includes(query))
  ))
  const cursors = cursorState.scopeKey === scopeKey ? cursorState.cursors : {}
  const rememberedCardId = selectedSubject ? cursors[selectedSubject.id] : undefined
  const rememberedIndex = rememberedCardId ? visibleCards.findIndex((card) => card.id === rememberedCardId) : -1
  const activeCardIndex = rememberedIndex >= 0 ? rememberedIndex : 0
  const activeCard = visibleCards[activeCardIndex]

  const noteTopic = selectedTopicResource?.topic
  const hasNoteContent = Boolean(selectedTopicResource && (selectedTopicResource.notes.length || selectedTopicResource.cards.length))
  useEffect(() => {
    if (!ready || !libraryReady || activeTab !== 'notes' || !selectedSubject || !noteTopic || !hasNoteContent) return
    const key = `${scopeKey}:${selectedSubject.id}:${noteTopic.id}`
    if (lastNoteView.current === key) return
    lastNoteView.current = key
    recordLearningEvent({ type: 'note_open', subjectId: selectedSubject.id, subject: selectedSubject.title, topicId: noteTopic.id, topic: noteTopic.title, itemId: `${selectedSubject.id}:${noteTopic.id}` })
  }, [ready, libraryReady, scopeKey, activeTab, selectedSubject, noteTopic, hasNoteContent])

  function saveCardCursor(subjectId: string, cardId: string) {
    const current = cursorState.scopeKey === scopeKey ? cursorState.cursors : {}
    const next = { ...current, [subjectId]: cardId }
    setCursorState({ scopeKey, cursors: next })
    if (!scopeKey) return
    try {
      window.localStorage.setItem(`study-table.notes-cursor:${scopeKey}`, JSON.stringify(next))
    } catch {
      // The deck remains usable if the browser blocks local storage.
    }
  }

  function recordCardEvent(type: 'flashcard_view' | 'flashcard_flip' | 'flashcard_known' | 'flashcard_again', card: StudyCard) {
    recordLearningEvent({
      type,
      subjectId: card.subjectId,
      subject: card.subject,
      topicId: card.topicId,
      topic: card.topic,
      itemId: card.id,
    })
  }

  function openSubject(subject: SyllabusSubject) {
    setSelectedSubjectId(subject.id)
    const firstTopic = subject.topics[0]
    setSelectedTopicId(learningTopicId(subject, firstTopic) ?? '')
    setIsFlipped(false)
    recordLearningEvent({ type: 'syllabus_open', subjectId: subject.id, subject: subject.title })

    if (activeTab === 'flashcards') {
      const savedId = cursorState.scopeKey === scopeKey ? cursorState.cursors[subject.id] : undefined
      const nextCard = getCardsForSubject(subject).find((card) => card.id === savedId) ?? getCardsForSubject(subject)[0]
      if (nextCard) {
        saveCardCursor(subject.id, nextCard.id)
        recordCardEvent('flashcard_view', nextCard)
      }
    }
  }

  function selectTopic(resource: LibraryTopic) {
    setSelectedTopicId(resource.topic.id)

  }

  function openFlashcards(cardToOpen?: StudyCard) {
    setActiveTab('flashcards')
    setIsFlipped(false)
    const card = cardToOpen ?? activeCard
    if (card && selectedSubject) {
      if (cardToOpen) setSearch('')
      saveCardCursor(selectedSubject.id, card.id)
      recordCardEvent('flashcard_view', card)
    }
  }

  function showNotes() {
    setActiveTab('notes')
    setIsFlipped(false)
  }

  function moveCard(direction: -1 | 1) {
    if (!activeCard || visibleCards.length === 0 || !selectedSubject) return
    const nextIndex = (activeCardIndex + direction + visibleCards.length) % visibleCards.length
    const nextCard = visibleCards[nextIndex]
    setIsFlipped(false)
    saveCardCursor(selectedSubject.id, nextCard.id)
    recordCardEvent('flashcard_view', nextCard)
  }

  function flipCard() {
    if (!activeCard) return
    setIsFlipped((flipped) => !flipped)
    recordCardEvent('flashcard_flip', activeCard)
  }

  function openPdf() {
    if (!selectedSubject) return
    recordLearningEvent({
      type: 'note_open',
      subjectId: selectedSubject.id,
      subject: selectedSubject.title,
      itemId: 'study-notes-pdf',
    })
  }

  if (!selectedSubject) return null

  return (
    <div className="space-y-6 pb-6">
      <header className="flex flex-col gap-5 rounded-[2rem] border border-border/80 bg-card p-5 shadow-[0_24px_70px_-56px_rgba(39,39,42,0.35)] sm:p-7 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">CFA Level I · Learning library</p>
          <h1 className="mt-2 font-heading text-4xl font-semibold leading-tight tracking-tight text-foreground sm:text-5xl">Notes &amp; flashcards</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
            Find a syllabus topic, read the key ideas, then flip through the cards when you are ready.
          </p>
          <Link href="/materials" className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold text-primary hover:bg-secondary"><BookOpenText size={16} />Study materials · 26 PDFs<ChevronRight size={15} /></Link>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row lg:min-w-[420px] lg:justify-end">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search notes and flashcards</span>
            <Search size={17} aria-hidden="true" className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search this subject"
              className="h-12 w-full rounded-2xl border border-border bg-background pl-11 pr-4 text-sm text-foreground outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
            />
          </label>
          <a
            href={`/api/notes/pdf?subjectId=${encodeURIComponent(selectedSubject.id)}`}
            target="_blank"
            rel="noreferrer"
            onClick={openPdf}
            className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-[0.98] focus:outline-none focus:ring-4 focus:ring-primary/20"
          >
            <Download size={16} aria-hidden="true" />
            Study notes PDF
          </a>
        </div>
      </header>

      <div className="rounded-[1.5rem] border border-border/80 bg-card p-4 lg:hidden">
        <label htmlFor="notes-subject-select" className="block">
          <span className="block text-sm font-semibold text-foreground">Study subject</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">Choose from all {cfaLevel1Syllabus.length} CFA Level I subjects.</span>
          <select
            id="notes-subject-select"
            value={selectedSubject.id}
            onChange={(event) => {
              const subject = cfaLevel1Syllabus.find((item) => item.id === event.target.value)
              if (subject) openSubject(subject)
            }}
            className="mt-3 h-12 w-full rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
          >
            {cfaLevel1Syllabus.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.title} · {subject.topics.length} topics · {cardCounts.get(subject.id) ?? 0} cards
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside aria-label="CFA Level I subjects" className="hidden rounded-[1.75rem] border border-border/80 bg-card p-3 sm:p-4 lg:block">
          <div className="flex items-center justify-between px-2 pb-3 pt-1">
            <div>
              <p className="text-sm font-semibold text-foreground">Subjects</p>
              <p className="mt-0.5 text-xs text-muted-foreground">CFA Level I syllabus</p>
            </div>
            <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-primary">{cfaLevel1Syllabus.length}</span>
          </div>
          <nav className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-1" aria-label="Subjects">
            {cfaLevel1Syllabus.map((subject) => {
              const isSelected = selectedSubject.id === subject.id
              const cardCount = cardCounts.get(subject.id) ?? 0
              return (
                <button
                  type="button"
                  key={subject.id}
                  onClick={() => openSubject(subject)}
                  aria-current={isSelected ? 'true' : undefined}
                  className={cn(
                    'group flex min-w-0 items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-colors',
                    isSelected
                      ? 'border-primary/25 bg-secondary/75 text-foreground'
                      : 'border-transparent text-muted-foreground hover:border-border hover:bg-background hover:text-foreground',
                  )}
                >
                  <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', isSelected ? 'bg-card text-primary' : 'bg-secondary/70 text-primary/75')}>
                    <BookOpenText size={16} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold leading-5">{subject.title}</span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">{subject.topics.length} topics · {cardCount} cards</span>
                  </span>
                  <ChevronRight size={15} aria-hidden="true" className={cn('shrink-0 transition-transform', isSelected ? 'translate-x-0.5 text-primary' : 'text-muted-foreground/50 group-hover:translate-x-0.5')} />
                </button>
              )
            })}
          </nav>
        </aside>

        <main className="min-w-0 space-y-4">
          <section className="rounded-[1.75rem] border border-border/80 bg-card px-5 py-5 sm:px-6 sm:py-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-secondary px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">{selectedSubject.weight} exam weight</span>
                  <span className="text-xs text-muted-foreground">{selectedSubject.topics.length} syllabus topics</span>
                  {subjectNotes.length > 0 ? <span className="text-xs text-muted-foreground">{subjectNotes.length} study notes</span> : null}
                </div>
                <h2 className="mt-3 font-heading text-3xl font-semibold leading-tight text-foreground sm:text-4xl">{selectedSubject.title}</h2>
              </div>
              <div className="inline-flex w-fit rounded-2xl border border-border bg-background p-1" role="tablist" aria-label={`${selectedSubject.title} study tools`}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'notes'}
                  onClick={showNotes}
                  className={cn('rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors', activeTab === 'notes' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
                >
                  <span className="inline-flex items-center gap-2"><BookOpenText size={15} aria-hidden="true" /> Notes</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'flashcards'}
                  onClick={() => openFlashcards()}
                  className={cn('rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors', activeTab === 'flashcards' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
                >
                  <span className="inline-flex items-center gap-2"><Layers3 size={15} aria-hidden="true" /> Flashcards</span>
                </button>
              </div>
            </div>
          </section>

          {activeTab === 'notes' ? (
            <section role="tabpanel" className="grid min-w-0 items-start gap-4 xl:grid-cols-[250px_minmax(0,1fr)]">
              <div className="rounded-[1.5rem] border border-border/80 bg-card p-4 xl:hidden">
                <label htmlFor="notes-topic-select" className="block">
                  <span className="block text-sm font-semibold text-foreground">Study topic</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{visibleTopicResources.length} topics in {selectedSubject.title}</span>
                  <select
                    id="notes-topic-select"
                    value={selectedTopicResource?.topic.id ?? ''}
                    disabled={visibleTopicResources.length === 0}
                    onChange={(event) => {
                      const resource = visibleTopicResources.find((item) => item.topic.id === event.target.value)
                      if (resource) selectTopic(resource)
                    }}
                    className="mt-3 h-12 w-full rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 disabled:opacity-60"
                  >
                    {visibleTopicResources.map((resource) => {
                      const itemCount = resource.notes.length + resource.cards.length
                      return (
                        <option key={resource.topic.id} value={resource.topic.id}>
                          {resource.topic.title} · {itemCount} study items
                        </option>
                      )
                    })}
                  </select>
                  {visibleTopicResources.length === 0 ? <span className="mt-2 block text-xs text-muted-foreground">No topics match “{search}”. Try another keyword.</span> : null}
                </label>
              </div>

              <div className="hidden rounded-[1.75rem] border border-border/80 bg-card p-3 sm:p-4 xl:block">
                <div className="flex items-center justify-between px-2 pb-3 pt-1">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Topics</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">Choose what to read</p>
                  </div>
                  <span className="rounded-full bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground">{visibleTopicResources.length}</span>
                </div>
                {visibleTopicResources.length ? (
                  <nav aria-label={`${selectedSubject.title} topics`} className="grid max-h-[520px] gap-1 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-1">
                    {visibleTopicResources.map((resource) => {
                      const isSelected = selectedTopicResource?.topic.id === resource.topic.id
                      const resourceCount = resource.notes.length + resource.cards.length
                      return (
                        <button
                          type="button"
                          key={resource.topic.id}
                          onClick={() => selectTopic(resource)}
                          aria-current={isSelected ? 'true' : undefined}
                          className={cn(
                            'flex items-start gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors',
                            isSelected ? 'border-primary/25 bg-secondary/70 text-foreground' : 'border-transparent text-muted-foreground hover:border-border hover:bg-background hover:text-foreground',
                          )}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block text-xs font-semibold leading-5">{resource.topic.title}</span>
                            <span className="mt-1 block text-[10px] text-muted-foreground">
                              {resourceCount ? `${resourceCount} study items` : 'Syllabus topic'}
                            </span>
                          </span>
                          {isSelected ? <ChevronRight size={14} aria-hidden="true" className="mt-1 shrink-0 text-primary" /> : null}
                        </button>
                      )
                    })}
                  </nav>
                ) : (
                  <p className="rounded-xl border border-dashed border-border bg-background px-4 py-5 text-sm leading-6 text-muted-foreground">
                    No topics match “{search}”. Try another keyword.
                  </p>
                )}
              </div>

              <div className="min-w-0 space-y-4">
                {selectedTopicResource ? (
                  <>
                    <div className="rounded-[1.75rem] border border-border/80 bg-card p-5 sm:p-6">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Study notes</p>
                          <h3 className="mt-2 font-heading text-2xl font-semibold leading-tight text-foreground sm:text-3xl">{selectedTopicResource.topic.title}</h3>
                        </div>
                        {selectedTopicResource.cards.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => openFlashcards(selectedTopicResource.cards[0])}
                            className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-secondary/60 focus:outline-none focus:ring-4 focus:ring-primary/10"
                          >
                            <Layers3 size={14} aria-hidden="true" />
                            Practice {selectedTopicResource.cards.length} related cards
                          </button>
                        ) : null}
                      </div>

                      {selectedTopicResource.notes.length > 0 ? (
                        <div className="mt-5 space-y-4">
                          {selectedTopicResource.notes.map((note) => (
                            <article key={note.id} className="rounded-2xl border border-border/75 bg-background/75 p-4 sm:p-5">
                              <h4 className="text-sm font-semibold text-foreground">{note.module}</h4>
                              <p className="mt-2 text-sm leading-6 text-muted-foreground">{note.concept}</p>
                              {note.terms.length > 0 ? (
                                <div className="mt-4">
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Key terms</p>
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {note.terms.map((term) => <span key={term} className="rounded-full border border-border bg-card px-2.5 py-1 text-xs text-foreground">{term}</span>)}
                                  </div>
                                </div>
                              ) : null}
                              {note.formulas.length > 0 ? (
                                <div className="mt-4 rounded-2xl border border-border bg-card p-4">
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Formulas &amp; rules</p>
                                  <div className="mt-2 space-y-2">
                                    {note.formulas.map((formula) => (
                                      <div key={formula} className="overflow-x-auto text-sm leading-6 text-foreground">
                                        <KatexFormula source={formula} displayMode />
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                              {note.trap ? (
                                <p className="mt-4 rounded-xl border border-orange-200/70 bg-orange-50/80 px-3.5 py-3 text-sm leading-6 text-orange-900">
                                  <span className="font-semibold">Common trap · </span>{note.trap}
                                </p>
                              ) : null}
                              {note.quickRecall ? (
                                <p className="mt-4 flex gap-2 text-sm leading-6 text-foreground">
                                  <Sparkles size={15} aria-hidden="true" className="mt-1 shrink-0 text-primary" />
                                  <span><span className="font-semibold">Remember: </span>{note.quickRecall}</span>
                                </p>
                              ) : null}
                            </article>
                          ))}
                        </div>
                      ) : selectedTopicResource.cards.length > 0 ? (
                        <div className="mt-5 space-y-3">
                          <p className="text-sm leading-6 text-muted-foreground">
                            Key ideas from the available {selectedSubject.title} study cards.
                          </p>
                          {selectedTopicResource.cards.map((card) => (
                            <article key={card.id} className="rounded-2xl border border-border/75 bg-background/75 p-4 sm:p-5">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-primary">{card.kind === 'formula' ? 'Formula' : 'Key idea'}</p>
                              <h4 className="mt-2 text-base font-semibold text-foreground">{card.front}</h4>
                              {card.source
                                ? <InlineQuestionText text={card.back} className="mt-2 block whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground" />
                                : <MathText text={card.back} className="mt-2 text-sm leading-6 text-muted-foreground" />}
                              {card.hint ? <p className="mt-3 text-sm leading-6 text-foreground"><span className="font-semibold">Memory cue · </span>{card.source ? <InlineQuestionText text={card.hint} /> : card.hint}</p> : null}
                              {card.source ? <a href={`/api/materials/${card.source.id}#page=${card.source.page}`} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs text-primary underline">AI recall source PDF, page {card.source.page}</a> : null}
                            </article>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-5 rounded-2xl border border-dashed border-border bg-background px-5 py-6">
                  <p className="text-sm font-semibold text-foreground">No study note for this topic yet</p>
                          <p className="mt-1.5 max-w-xl text-sm leading-6 text-muted-foreground">
                            This topic is in your CFA syllabus. Switch to the subject flashcards to study the available concepts, or download the subject notes PDF.
                          </p>
                          <button
                            type="button"
                            onClick={() => openFlashcards()}
                            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-3.5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:brightness-[0.98]"
                          >
                            <Layers3 size={15} aria-hidden="true" />
                            Open subject flashcards
                          </button>
                        </div>
                      )}
                    </div>

                    {selectedTopicResource.cards.length > 0 && selectedTopicResource.notes.length > 0 ? (
                      <div className="rounded-[1.5rem] border border-border/80 bg-card px-4 py-3.5">
                        <p className="text-xs text-muted-foreground">
                          The flashcard deck includes {selectedTopicResource.cards.length} cards connected to this topic. Open the deck to flip through them.
                        </p>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="rounded-[1.75rem] border border-dashed border-border bg-card p-8 text-sm leading-6 text-muted-foreground">
                    Choose a topic to open its study notes.
                  </div>
                )}
              </div>
            </section>
          ) : (
            <section role="tabpanel" className="rounded-[1.75rem] border border-border/80 bg-card p-4 sm:p-6">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm font-medium">Card collection
                  <select value={deckSource} onChange={event => { setDeckSource(event.target.value); setIsFlipped(false) }} className="max-w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
                    <option value="all">All cards</option>
                    <option value="recall">From recall PDFs</option>
                    <option value="built-in">Built-in cards</option>
                  </select>
                </label>
                <p role="status" className="text-xs text-muted-foreground">
                  {recallStatus === 'loading' ? 'Loading recall cards…' : recallStatus === 'ready' ? `${subjectCards.filter(card => card.source).length} recall PDF cards in this subject` : recallStatus === 'sign-in' ? <Link href="/login" className="text-primary underline">Sign in for the recall PDF collection</Link> : <button onClick={() => setRecallRetry(value => value + 1)} className="text-primary underline">Recall cards unavailable · Try again</button>}
                </p>
              </div>
              {activeCard ? (
                <>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Flashcards</p>
                      <p className="mt-1 text-sm text-muted-foreground">{activeCard.topic} <span aria-hidden="true">·</span> Card {activeCardIndex + 1} of {visibleCards.length}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">Select the card to flip it. Use the arrow keys on the navigation buttons to move.</p>
                  </div>

                  <button
                    type="button"
                    onClick={flipCard}
                    aria-pressed={isFlipped}
                    aria-label={isFlipped ? 'Show flashcard question' : 'Show flashcard answer'}
                    className="mt-5 flex min-h-[300px] w-full flex-col items-start justify-between rounded-[1.5rem] border border-border bg-background p-5 text-left transition hover:border-primary/30 hover:shadow-[0_18px_50px_-38px_rgba(39,39,42,0.35)] focus:outline-none focus:ring-4 focus:ring-primary/15 sm:min-h-[360px] sm:p-8"
                  >
                    <div className="flex w-full items-center justify-between gap-3">
                      <span className="rounded-full bg-secondary px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">{isFlipped ? 'Answer' : 'Question'}</span>
                      <span className="text-xs font-medium text-muted-foreground">Click, Enter, or Space to {isFlipped ? 'see question' : 'flip'}</span>
                    </div>
                    <div className="my-8 w-full min-w-0 max-w-3xl">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{isFlipped ? activeCard.front : activeCard.topic}</p>
                      {isFlipped ? (
                        activeCard.source
                          ? <InlineQuestionText text={activeCard.back} className="mt-3 block whitespace-pre-wrap break-words text-lg font-medium leading-7 text-foreground sm:text-xl sm:leading-8" />
                          : <MathText text={activeCard.back} className="mt-3 whitespace-pre-wrap text-lg font-medium leading-7 text-foreground sm:text-xl sm:leading-8" />
                      ) : (
                        <p className="mt-3 font-heading text-2xl font-semibold leading-snug text-foreground sm:text-4xl">{activeCard.front}</p>
                      )}
                      {isFlipped && activeCard.hint ? <p className="mt-5 max-w-2xl text-sm leading-6 text-muted-foreground"><span className="font-semibold text-foreground">Memory cue · </span>{activeCard.source ? <InlineQuestionText text={activeCard.hint} /> : activeCard.hint}</p> : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {activeCard.tags.map((tag) => <span key={tag} className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] text-muted-foreground">{tag}</span>)}
                    </div>
                  </button>

                  {activeCard.source ? <p className="mt-3 text-xs leading-5 text-muted-foreground">AI recall study aid · Cross-reviewed by AI agents · <a href={`/api/materials/${activeCard.source.id}#page=${activeCard.source.page}`} target="_blank" rel="noreferrer" className="text-primary underline">Source PDF, page {activeCard.source.page}</a></p> : null}

                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex gap-2">
                      <button type="button" onClick={() => moveCard(-1)} aria-label="Previous flashcard" className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground transition hover:bg-background focus:outline-none focus:ring-4 focus:ring-primary/10">
                        <ArrowLeft size={16} aria-hidden="true" /> Previous
                      </button>
                      <button type="button" onClick={() => moveCard(1)} aria-label="Next flashcard" className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground transition hover:bg-background focus:outline-none focus:ring-4 focus:ring-primary/10">
                        Next <ArrowRight size={16} aria-hidden="true" />
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2 sm:justify-end">
                      <button type="button" onClick={() => recordCardEvent('flashcard_again', activeCard)} className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground transition hover:bg-background focus:outline-none focus:ring-4 focus:ring-primary/10">
                        <RotateCcw size={15} aria-hidden="true" /> Repeat
                      </button>
                      <button type="button" onClick={() => recordCardEvent('flashcard_known', activeCard)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-[0.98] focus:outline-none focus:ring-4 focus:ring-primary/20">
                        <Check size={16} aria-hidden="true" /> Got it
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-border bg-background px-5 py-8">
                  <p className="text-sm font-semibold text-foreground">No cards match this search</p>
                  <p className="mt-1 text-sm text-muted-foreground">Clear the search or choose another subject.</p>
                  {search ? <button type="button" onClick={() => setSearch('')} className="mt-3 text-sm font-semibold text-primary underline-offset-4 hover:underline">Clear search</button> : null}
                </div>
              )}
            </section>
          )}

          <p className="px-1 text-xs leading-5 text-muted-foreground">
            Notes combine available library entries with formula and concept cards. Recall PDF cards are AI study aids with source-page links.
          </p>
        </main>
      </div>
    </div>
  )
}
