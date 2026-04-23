'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { BookOpenCheck, CalendarClock, FileCheck2, Layers, PenTool, Pin, Plus, Search, Sparkles, Trash2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/browser'
import {
  deleteRemoteNote,
  fetchRemoteNotes,
  getAuthenticatedUserId,
  mergeNotes,
  upsertRemoteCustomFlashcards,
  upsertRemoteNotes,
} from '@/lib/study-sync'
import { cn } from '@/lib/utils'
import { formulaHeavySubjects, revisionNotes, type RevisionNote } from '@/lib/revision-content'
import {
  createNoteFromDraft,
  formatShortDate,
  loadNotes,
  normalizeTags,
  noteReviewLabel,
  NOTE_TOPIC_SUGGESTIONS,
  saveNotes,
  type NoteRecord,
} from '@/lib/study-workspace'
import {
  createCustomFlashcard,
  loadCustomFlashcards,
  saveCustomFlashcards,
  type CustomFlashcard,
} from '@/lib/custom-flashcards'
import { KatexFormula } from '@/components/katex-formula'

type NoteDraft = {
  title: string
  topic: string
  body: string
  tags: string
  pinned: boolean
  reviewIntervalDays: string
}

const emptyDraft: NoteDraft = {
  title: '',
  topic: 'Ethics',
  body: '',
  tags: '',
  pinned: false,
  reviewIntervalDays: '7',
}

function mapNoteToDraft(note: NoteRecord): NoteDraft {
  return {
    title: note.title,
    topic: note.topic,
    body: note.body,
    tags: note.tags.join(', '),
    pinned: note.pinned,
    reviewIntervalDays: String(note.reviewIntervalDays),
  }
}

function sortNotes(notes: NoteRecord[]) {
  return notes.slice().sort((a, b) => {
    if (a.pinned !== b.pinned) {
      return a.pinned ? -1 : 1
    }

    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })
}

export default function NotesPage() {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const [notes, setNotes] = useState<NoteRecord[]>([])
  const [draft, setDraft] = useState<NoteDraft>(emptyDraft)
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [remoteUserId, setRemoteUserId] = useState<string | null>(null)
  const [librarySearch, setLibrarySearch] = useState('')
  const [librarySubject, setLibrarySubject] = useState<'all' | (typeof formulaHeavySubjects)[number]>('all')
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [assessOpenId, setAssessOpenId] = useState<string | null>(null)
  const [assessBusyId, setAssessBusyId] = useState<string | null>(null)
  const [assessMessage, setAssessMessage] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function hydrate() {
      const localNotes = loadNotes()
      const userId = await getAuthenticatedUserId(supabase)

      if (!active) {
        return
      }

      if (!userId) {
        setRemoteUserId(null)
        setNotes(sortNotes(localNotes))
        setReady(true)
        return
      }

      setRemoteUserId(userId)

      try {
        const remoteNotes = await fetchRemoteNotes(supabase, userId)
        if (!active) {
          return
        }

        const mergedNotes = sortNotes(mergeNotes(localNotes, remoteNotes))
        setNotes(mergedNotes)
        saveNotes(mergedNotes)
        await upsertRemoteNotes(supabase, userId, mergedNotes)
      } catch {
        if (!active) {
          return
        }

        setNotes(sortNotes(localNotes))
      }

      if (active) {
        setReady(true)
      }
    }

    hydrate()

    return () => {
      active = false
    }
  }, [supabase])

  const filteredNotes = sortNotes(notes).filter((note) => {
    const haystack = [note.title, note.topic, note.body, note.tags.join(' ')].join(' ').toLowerCase()
    return haystack.includes(search.trim().toLowerCase())
  })

  const dueQueue = sortNotes(notes).filter((note) => noteReviewLabel(note) === 'Overdue' || noteReviewLabel(note) === 'Due today')

  const filteredLibrary = revisionNotes.filter((note) => {
    if (librarySubject !== 'all' && note.subject !== librarySubject) {
      return false
    }
    if (!librarySearch.trim()) {
      return true
    }
    const haystack = [note.module, note.concept, note.trap, note.quickRecall, note.terms.join(' '), note.tags.join(' ')].join(' ').toLowerCase()
    return haystack.includes(librarySearch.trim().toLowerCase())
  })

  function resetDraft() {
    setEditingId(null)
    setDraft(emptyDraft)
  }

  function openNewNote() {
    resetDraft()
    setIsEditorOpen(true)
  }

  function closeEditor() {
    setIsEditorOpen(false)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const nextNote = createNoteFromDraft({
      id: editingId ?? undefined,
      title: draft.title,
      topic: draft.topic,
      body: draft.body,
      tags: normalizeTags(draft.tags),
      pinned: draft.pinned,
      reviewIntervalDays: Number(draft.reviewIntervalDays) || 7,
      createdAt: editingId ? notes.find((note) => note.id === editingId)?.createdAt : undefined,
    })

    const existing = notes.filter((note) => note.id !== nextNote.id)
    const nextNotes = sortNotes([nextNote, ...existing])
    setNotes(nextNotes)
    saveNotes(nextNotes)
    if (remoteUserId) {
      void upsertRemoteNotes(supabase, remoteUserId, nextNotes)
    }
    setEditingId(nextNote.id)
    setDraft(mapNoteToDraft(nextNote))
    setIsEditorOpen(false)
  }

  function handleEdit(note: NoteRecord) {
    setEditingId(note.id)
    setDraft(mapNoteToDraft(note))
    setIsEditorOpen(true)
  }

  function handleDelete(id: string) {
    const nextNotes = notes.filter((note) => note.id !== id)
    setNotes(nextNotes)
    saveNotes(nextNotes)
    if (remoteUserId) {
      void deleteRemoteNote(supabase, remoteUserId, id)
    }

    if (editingId === id) {
      resetDraft()
    }
  }

  function saveShortNoteAsDraft(note: RevisionNote) {
    const body = [
      note.concept,
      note.formulas.length ? `\nFormulas:\n${note.formulas.map((line) => `• ${line}`).join('\n')}` : '',
      note.trap ? `\nTrap: ${note.trap}` : '',
      note.quickRecall ? `\nQuick recall: ${note.quickRecall}` : '',
    ]
      .filter(Boolean)
      .join('\n')

    setEditingId(null)
    setDraft({
      title: `${note.subject} · ${note.module}`,
      topic: note.subject,
      body,
      tags: note.tags.join(', '),
      pinned: false,
      reviewIntervalDays: '7',
    })
    setIsEditorOpen(true)
  }

  function togglePinned(id: string) {
    const nextNotes = notes.map((note) =>
      note.id === id
        ? {
            ...note,
            pinned: !note.pinned,
            updatedAt: new Date().toISOString(),
          }
        : note,
    )

    const sorted = sortNotes(nextNotes)
    setNotes(sorted)
    saveNotes(sorted)
    if (remoteUserId) {
      void upsertRemoteNotes(supabase, remoteUserId, sorted)
    }
  }

  async function createFlashcardsFromNote(note: RevisionNote) {
    setAssessBusyId(note.id)
    setAssessMessage(null)
    try {
      const sources = note.formulas.length > 0 ? note.formulas : [note.concept]
      const cards: CustomFlashcard[] = sources.map((formula, index) =>
        createCustomFlashcard({
          subject: note.subject,
          module: note.module,
          title: note.formulas.length > 0 ? `${note.module} formula ${index + 1}` : note.module,
          prompt: note.concept,
          answer: formula,
          memoryHook: note.quickRecall || note.trap || 'Review under exam pressure.',
          tags: note.tags.join(', '),
        }),
      )

      const existing = loadCustomFlashcards()
      const next = [...cards, ...existing]
      saveCustomFlashcards(next)

      if (remoteUserId) {
        try {
          await upsertRemoteCustomFlashcards(supabase, remoteUserId, cards)
        } catch {
          // local save still works
        }
      }

      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(
          'cfa-flashcard-focus',
          JSON.stringify({
            ids: cards.map((card) => card.id),
            label: `${note.subject} · ${note.module}`,
          }),
        )
      }

      router.push('/flashcards')
    } finally {
      setAssessBusyId(null)
      setAssessOpenId(null)
    }
  }

  function buildLocalQuizFromNote(note: RevisionNote) {
    const distractorPool = revisionNotes
      .filter((other) => other.subject === note.subject && other.id !== note.id)
      .flatMap((other) => other.formulas)
      .filter((formula) => !note.formulas.includes(formula))

    const globalPool = revisionNotes
      .filter((other) => other.id !== note.id)
      .flatMap((other) => other.formulas)

    function pickDistractors(correct: string, take: number) {
      const bag = (distractorPool.length >= take ? distractorPool : globalPool).filter((item) => item !== correct)
      const picked = new Set<string>()
      while (picked.size < take && bag.length > 0) {
        const index = Math.floor(Math.random() * bag.length)
        picked.add(bag.splice(index, 1)[0])
      }
      return [...picked]
    }

    const sourceFormulas = note.formulas.length > 0 ? note.formulas : [note.concept]
    const repeated: string[] = []
    for (let i = 0; i < 3; i += 1) {
      repeated.push(sourceFormulas[i % sourceFormulas.length])
    }

    return repeated.map((correct, index) => {
      const distractors = pickDistractors(correct, 2)
      while (distractors.length < 2) {
        distractors.push(`Not a standard ${note.subject} expression for this concept.`)
      }
      const options = [correct, ...distractors]
      for (let i = options.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[options[i], options[j]] = [options[j], options[i]]
      }
      const correctIndex = options.indexOf(correct)
      const prompt =
        index === 0
          ? `For ${note.module} (${note.subject}), which expression is correct?`
          : index === 1
            ? `When revising ${note.module}, which formula below matches: "${note.concept.slice(0, 120)}${note.concept.length > 120 ? '…' : ''}"?`
            : `Quick recall — pick the valid ${note.module} relationship:`
      const rationale = note.trap
        ? `Correct: ${correct}. Trap to remember: ${note.trap}`
        : `Correct: ${correct}. ${note.quickRecall || 'Match the formula to the concept before moving on.'}`
      return { prompt, options, correctIndex, rationale }
    })
  }

  async function quizMeFromNote(note: RevisionNote) {
    setAssessBusyId(note.id)
    setAssessMessage(null)
    try {
      const context = [
        note.concept,
        note.formulas.length ? `Formulas: ${note.formulas.join(' ; ')}` : '',
        note.trap ? `Trap: ${note.trap}` : '',
      ]
        .filter(Boolean)
        .join(' | ')

      let questions: unknown[] = []

      try {
        const response = await fetch('/api/assessments/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: note.subject,
            subtopic: note.module,
            mode: 'topic_quiz',
            scope: 'topic_quiz',
            count: 3,
            feedback: `Write 3 tight CFA Level I questions that test the formula(s) in this note. Context: ${context}`,
            persist: false,
          }),
        })

        if (response.ok) {
          const data = (await response.json()) as { questions?: unknown[] }
          questions = data.questions ?? []
        }
      } catch {
        // fall through to local build
      }

      if (questions.length === 0) {
        questions = buildLocalQuizFromNote(note)
      }

      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(
          'cfa-steered-quiz',
          JSON.stringify({
            questions,
            source: `note:${note.id}`,
            title: `${note.subject} · ${note.module}`,
            topic: note.subject,
            subtopic: note.module,
          }),
        )
      }

      router.push('/assessments')
    } finally {
      setAssessBusyId(null)
      setAssessOpenId(null)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="space-y-6"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Notebook</h1>
          <p className="mt-2 max-w-2xl text-base text-slate-600 sm:text-lg">
            Your notes and due reviews up top. Formula library below — tap a card to save it, quiz on it, or turn it into flashcards.
          </p>
        </div>

        <button
          type="button"
          onClick={openNewNote}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-400 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-pink-200 transition-transform hover:-translate-y-0.5"
        >
          <Plus size={16} />
          New note
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="soft-panel rounded-[1.75rem] p-4 sm:rounded-[2rem] sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <PenTool className="text-pink-500" size={15} />
              My notes
            </h2>
            <span className="rounded-full border border-pink-100 bg-pink-50 px-2 py-0.5 text-[10px] font-semibold text-pink-500">
              {filteredNotes.length}
            </span>
          </div>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full rounded-full border border-pink-100 bg-white px-3 py-2 text-xs text-slate-900 outline-none"
            placeholder="Search my notes"
          />

          <div className="mt-3 grid max-h-[260px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
            {ready && filteredNotes.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-pink-200 bg-white/70 p-4 text-xs text-slate-500 sm:col-span-2">
                No notes yet. Save one from the library or use &ldquo;New note&rdquo;.
              </p>
            ) : null}

            <AnimatePresence initial={false}>
              {filteredNotes.map((note) => (
                <motion.div
                  key={note.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className={cn(
                    'group rounded-2xl border bg-white p-3 transition-colors',
                    editingId === note.id
                      ? 'border-pink-300 shadow-[0_10px_22px_-16px_rgba(244,114,182,0.45)]'
                      : 'border-pink-100 hover:border-pink-200',
                  )}
                >
                  <button type="button" onClick={() => handleEdit(note)} className="w-full text-left">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {note.pinned ? <Pin size={12} className="mr-1 inline text-pink-500" /> : null}
                        {note.title || 'Untitled note'}
                      </p>
                      <span className="shrink-0 rounded-full border border-pink-100 bg-pink-50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-pink-500">
                        {noteReviewLabel(note)}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-[11px] text-slate-500">
                      {note.topic || 'General'} · {formatShortDate(note.updatedAt)}
                    </p>
                  </button>
                  <div className="mt-2 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => togglePinned(note.id)}
                      className="rounded-full border border-pink-100 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600"
                    >
                      {note.pinned ? 'Unpin' : 'Pin'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(note.id)}
                      className="inline-flex items-center gap-1 rounded-full border border-rose-100 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-600"
                    >
                      <Trash2 size={11} />
                      Delete
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        <div className="soft-panel rounded-[1.75rem] p-4 sm:rounded-[2rem] sm:p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
            <CalendarClock className="text-pink-500" size={15} />
            Review queue
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {dueQueue.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-pink-200 bg-white/70 p-3 text-xs text-slate-500 sm:col-span-2">
                Nothing due. Your saved notes will land here when their interval passes.
              </p>
            ) : null}
            {dueQueue.slice(0, 6).map((note) => (
              <button
                key={note.id}
                type="button"
                onClick={() => handleEdit(note)}
                className="flex w-full items-center justify-between rounded-2xl border border-pink-100 bg-white px-3 py-2 text-left transition-colors hover:bg-pink-50/60"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-slate-900">{note.title}</p>
                  <p className="mt-0.5 truncate text-[10px] text-slate-500">{note.topic}</p>
                </div>
                <span className="shrink-0 rounded-full border border-pink-200 bg-pink-50 px-2 py-0.5 text-[9px] font-semibold text-pink-500">
                  {noteReviewLabel(note)}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="soft-panel rounded-[1.75rem] p-4 sm:rounded-[2rem] sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <BookOpenCheck className="text-pink-500" size={18} />
              Formula library
            </h2>
            <p className="mt-1 text-xs text-slate-500">Short notes across every subject. Save, quiz, or turn into flashcards.</p>
          </div>
          <span className="rounded-full border border-pink-100 bg-pink-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-pink-500">
            {filteredLibrary.length} of {revisionNotes.length}
          </span>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={librarySearch}
              onChange={(event) => setLibrarySearch(event.target.value)}
              className="w-full rounded-full border border-pink-100 bg-white py-2 pl-8 pr-3 text-sm text-slate-900 outline-none"
              placeholder="Search formulas, traps, terms"
            />
          </div>
          <select
            value={librarySubject}
            onChange={(event) => setLibrarySubject(event.target.value as typeof librarySubject)}
            className="rounded-full border border-pink-100 bg-white px-3 py-2 text-sm text-slate-700 outline-none"
          >
            <option value="all">All subjects</option>
            {formulaHeavySubjects.map((subject) => (
              <option key={subject} value={subject}>
                {subject}
              </option>
            ))}
          </select>
        </div>

        {assessMessage ? (
          <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-700">{assessMessage}</p>
        ) : null}

        <div className="mt-5 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {filteredLibrary.length === 0 ? (
            <p className="col-span-full rounded-2xl border border-dashed border-pink-200 bg-white/70 p-6 text-sm text-slate-500">
              No short notes match. Try a different subject or keyword.
            </p>
          ) : null}

          {filteredLibrary.map((note) => {
            const assessOpen = assessOpenId === note.id
            const assessBusy = assessBusyId === note.id

            return (
              <article key={note.id} className="flex h-full flex-col rounded-2xl border border-pink-100 bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-pink-400">{note.subject}</p>
                    <p className="mt-1 text-base font-semibold text-slate-900">{note.module}</p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      onClick={() => saveShortNoteAsDraft(note)}
                      className="inline-flex items-center gap-1 rounded-full border border-pink-200 bg-pink-50 px-3 py-1.5 text-[11px] font-semibold text-pink-600 hover:bg-pink-100"
                    >
                      <Plus size={12} />
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setAssessOpenId(assessOpen ? null : note.id)}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors',
                        assessOpen
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                          : 'border-pink-200 bg-white text-pink-600 hover:bg-pink-50',
                      )}
                    >
                      Assess?
                    </button>
                  </div>
                </div>

                {assessOpen ? (
                  <div className="mt-3 rounded-2xl border border-pink-100 bg-pink-50/60 p-3">
                    <p className="text-[11px] font-semibold text-slate-700">How do you want to assess this?</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        disabled={assessBusy}
                        onClick={() => createFlashcardsFromNote(note)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-full bg-pink-500 px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-70"
                      >
                        <Layers size={12} />
                        {assessBusy ? 'Working…' : 'Create flashcards'}
                      </button>
                      <button
                        type="button"
                        disabled={assessBusy}
                        onClick={() => quizMeFromNote(note)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-full bg-slate-900 px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-70"
                      >
                        <FileCheck2 size={12} />
                        {assessBusy ? 'Working…' : 'Quiz me (3 Qs)'}
                      </button>
                    </div>
                  </div>
                ) : null}

                <p className="mt-3 text-sm leading-6 text-slate-600">{note.concept}</p>
                {note.formulas.length ? (
                  <div className="mt-4 space-y-2 rounded-xl border border-pink-100 bg-pink-50/60 p-3">
                    {note.formulas.map((formula) => (
                      <div key={formula} className="overflow-x-auto text-sm leading-6 text-slate-800">
                        <KatexFormula source={formula} displayMode />
                      </div>
                    ))}
                  </div>
                ) : null}
                {note.trap ? (
                  <p className="mt-3 rounded-xl border border-rose-100 bg-rose-50/70 px-3 py-2 text-xs leading-5 text-rose-700">
                    <span className="font-semibold">Trap · </span>
                    {note.trap}
                  </p>
                ) : null}
                {note.quickRecall ? (
                  <p className="mt-auto pt-3 text-[11px] italic text-slate-500">&ldquo;{note.quickRecall}&rdquo;</p>
                ) : null}
              </article>
            )
          })}
        </div>
      </div>

      <AnimatePresence>
        {isEditorOpen ? (
          <motion.div
            key="editor-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-10 backdrop-blur-sm"
            onClick={closeEditor}
          >
            <motion.div
              key="editor-panel"
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              onClick={(event) => event.stopPropagation()}
              className="w-full max-w-2xl rounded-[1.75rem] border border-pink-100 bg-white p-4 shadow-[0_30px_80px_-30px_rgba(244,114,182,0.6)] sm:rounded-[2rem] sm:p-6"
            >
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                    <PenTool className="text-pink-500" size={18} />
                    {editingId ? 'Edit note' : 'New note'}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">Notes sync to Supabase when signed in, and fall back to local storage otherwise.</p>
                </div>
                <div className="flex items-center gap-2">
                  {editingId ? (
                    <button
                      type="button"
                      onClick={() => {
                        handleDelete(editingId)
                        setIsEditorOpen(false)
                      }}
                      className="inline-flex items-center gap-1 rounded-full border border-rose-100 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600"
                    >
                      <Trash2 size={13} />
                      Delete
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={closeEditor}
                    aria-label="Close editor"
                    className="rounded-full border border-pink-100 bg-white p-1.5 text-slate-500 hover:bg-pink-50"
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>

              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-700">Title</span>
                    <input
                      value={draft.title}
                      onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                      required
                      className="w-full rounded-2xl border border-pink-100 bg-white px-4 py-3 text-slate-900 outline-none"
                      placeholder="Ethics formula trap"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-700">Topic</span>
                    <select
                      value={draft.topic}
                      onChange={(event) => setDraft({ ...draft, topic: event.target.value })}
                      className="w-full rounded-2xl border border-pink-100 bg-white px-4 py-3 text-slate-900 outline-none"
                    >
                      {NOTE_TOPIC_SUGGESTIONS.map((topic) => (
                        <option key={topic} value={topic}>
                          {topic}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">Body</span>
                  <textarea
                    value={draft.body}
                    onChange={(event) => setDraft({ ...draft, body: event.target.value })}
                    required
                    rows={8}
                    className="w-full rounded-3xl border border-pink-100 bg-white px-4 py-3 text-slate-900 outline-none"
                    placeholder="Write the rule, the trap, and the memory hook."
                  />
                </label>

                <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-700">Tags</span>
                    <input
                      value={draft.tags}
                      onChange={(event) => setDraft({ ...draft, tags: event.target.value })}
                      className="w-full rounded-2xl border border-pink-100 bg-white px-4 py-3 text-slate-900 outline-none"
                      placeholder="formula, ethics, trap"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-700">Review interval (days)</span>
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={draft.reviewIntervalDays}
                      onChange={(event) => setDraft({ ...draft, reviewIntervalDays: event.target.value })}
                      className="w-full rounded-2xl border border-pink-100 bg-white px-4 py-3 text-slate-900 outline-none"
                    />
                  </label>
                  <label className="flex items-end gap-3 rounded-2xl border border-pink-100 bg-pink-50/60 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={draft.pinned}
                      onChange={(event) => setDraft({ ...draft, pinned: event.target.checked })}
                      className="h-4 w-4 accent-pink-500"
                    />
                    <span className="text-sm font-medium text-slate-700">Pin</span>
                  </label>
                </div>

                <div className="flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    onClick={closeEditor}
                    className="rounded-2xl border border-pink-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-400 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-pink-200 transition-transform hover:-translate-y-0.5"
                  >
                    <Sparkles size={16} />
                    Save note
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  )
}
