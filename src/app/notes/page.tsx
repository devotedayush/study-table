'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BookOpenText, CalendarClock, ClipboardList, PenTool, Pin, Plus, Search, Sparkles, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/browser'
import { deleteRemoteNote, fetchRemoteNotes, getAuthenticatedUserId, mergeNotes, upsertRemoteNotes } from '@/lib/study-sync'
import { cn } from '@/lib/utils'
import {
  computeNoteMetrics,
  createNoteFromDraft,
  formatShortDate,
  loadNotes,
  normalizeTags,
  noteReviewLabel,
  NOTE_TOPIC_SUGGESTIONS,
  saveNotes,
  type NoteRecord,
} from '@/lib/study-workspace'

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

const quickPrompts = [
  'A formula I keep forgetting',
  'A trap I missed in a question set',
  'A simple summary of a difficult concept',
]

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
  const [supabase] = useState(() => createClient())
  const [notes, setNotes] = useState<NoteRecord[]>([])
  const [draft, setDraft] = useState<NoteDraft>(emptyDraft)
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [remoteUserId, setRemoteUserId] = useState<string | null>(null)

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

  const metrics = computeNoteMetrics(notes)
  const dueQueue = sortNotes(notes).filter((note) => noteReviewLabel(note) === 'Overdue' || noteReviewLabel(note) === 'Due today')

  function resetDraft() {
    setEditingId(null)
    setDraft(emptyDraft)
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
  }

  function handleEdit(note: NoteRecord) {
    setEditingId(note.id)
    setDraft(mapNoteToDraft(note))
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="space-y-8"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900">Notes</h1>
          <p className="mt-2 max-w-2xl text-lg text-slate-600">
            Capture formulas, traps, and quick reflections. Notes now sync to Supabase when you are signed in and still fall back to local storage when you are not.
          </p>
        </div>

        <button
          type="button"
          onClick={resetDraft}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-400 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-pink-200 transition-transform hover:-translate-y-0.5"
        >
          <Plus size={16} />
          New note
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="soft-panel rounded-[1.75rem] p-5">
          <p className="text-sm text-slate-500">Notes saved</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{metrics.total}</p>
        </div>
        <div className="soft-panel rounded-[1.75rem] p-5">
          <p className="text-sm text-slate-500">Pinned</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{metrics.pinned}</p>
        </div>
        <div className="soft-panel rounded-[1.75rem] p-5">
          <p className="text-sm text-slate-500">Topics covered</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{metrics.uniqueTopics}</p>
        </div>
        <div className="soft-panel rounded-[1.75rem] p-5">
          <p className="text-sm text-slate-500">Review queue</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{metrics.dueSoon}</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-6">
          <div className="soft-panel rounded-[2rem] p-6">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                <PenTool className="text-pink-500" size={18} />
                Note editor
              </h2>
              <span className="rounded-full border border-pink-200 bg-pink-50 px-3 py-1 text-xs font-semibold text-pink-500">
                {editingId ? 'Editing note' : 'Create note'}
              </span>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">Title</span>
                  <input
                    value={draft.title}
                    onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                    required
                    className="app-select"
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
                <span className="mb-2 block text-sm font-medium text-slate-700">Quick prompt</span>
                <div className="flex flex-wrap gap-2">
                  {quickPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => setDraft({ ...draft, title: draft.title || prompt })}
                      className="rounded-full border border-pink-100 bg-pink-50/60 px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-pink-50"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Body</span>
                <textarea
                  value={draft.body}
                  onChange={(event) => setDraft({ ...draft, body: event.target.value })}
                  required
                  rows={7}
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
                  <span className="mb-2 block text-sm font-medium text-slate-700">Review interval</span>
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
                  <span className="text-sm font-medium text-slate-700">Pin note</span>
                </label>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-400 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-pink-200 transition-transform hover:-translate-y-0.5"
                >
                  <Sparkles size={16} />
                  Save note
                </button>
                <button
                  type="button"
                  onClick={resetDraft}
                  className="rounded-2xl border border-pink-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
                >
                  Clear
                </button>
              </div>
            </form>
          </div>

          <div className="soft-panel rounded-[2rem] p-6">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                <Search className="text-pink-500" size={18} />
                Saved notes
              </h2>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full max-w-xs rounded-full border border-pink-100 bg-white px-4 py-2 text-sm text-slate-900 outline-none"
                placeholder="Search notes"
              />
            </div>

            <div className="space-y-3">
              {ready && filteredNotes.length === 0 ? (
                <div className="rounded-[1.5rem] border border-dashed border-pink-200 bg-white/70 p-6 text-sm text-slate-600">
                  Create a note to capture formulas, traps, or ideas you want to review later.
                </div>
              ) : null}

              <AnimatePresence initial={false}>
                {filteredNotes.map((note) => (
                  <motion.article
                    key={note.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className={cn(
                      'rounded-[1.5rem] border bg-white p-5 transition-colors',
                      editingId === note.id ? 'border-pink-300 shadow-[0_14px_30px_-18px_rgba(244,114,182,0.45)]' : 'border-pink-100 hover:border-pink-200',
                    )}
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          {note.pinned ? <Pin size={14} className="text-pink-500" /> : null}
                          <h3 className="text-lg font-semibold text-slate-900">{note.title || 'Untitled note'}</h3>
                        </div>
                        <p className="text-sm text-pink-500">{note.topic || 'General'}</p>
                        <p className="max-w-3xl text-sm leading-6 text-slate-600">
                          {note.body.length > 180 ? `${note.body.slice(0, 180)}...` : note.body || 'No body yet.'}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
                        <span className="rounded-full border border-pink-100 bg-pink-50 px-3 py-1">{noteReviewLabel(note)}</span>
                        <span className="rounded-full border border-pink-100 bg-white px-3 py-1">{formatShortDate(note.updatedAt)}</span>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {note.tags.map((tag) => (
                        <span key={tag} className="rounded-full border border-pink-100 bg-pink-50/60 px-3 py-1 text-xs text-slate-600">
                          {tag}
                        </span>
                      ))}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleEdit(note)}
                        className="rounded-full border border-pink-100 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => togglePinned(note.id)}
                        className="rounded-full border border-pink-100 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                      >
                        {note.pinned ? 'Unpin' : 'Pin'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(note.id)}
                        className="inline-flex items-center gap-1 rounded-full border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600"
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    </div>
                  </motion.article>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="soft-panel rounded-[2rem] p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
              <CalendarClock className="text-pink-500" size={18} />
              Review queue
            </h2>
            <div className="space-y-3">
              {dueQueue.length === 0 ? (
                <div className="rounded-[1.5rem] border border-dashed border-pink-200 bg-white/70 p-5 text-sm text-slate-600">
                  No notes are overdue yet. Add a few notes and they will appear here when due.
                </div>
              ) : null}
              {dueQueue.slice(0, 4).map((note) => (
                <button
                  key={note.id}
                  type="button"
                  onClick={() => handleEdit(note)}
                  className="flex w-full items-center justify-between rounded-[1.25rem] border border-pink-100 bg-white px-4 py-4 text-left transition-colors hover:bg-pink-50/60"
                >
                  <div>
                    <p className="font-medium text-slate-900">{note.title}</p>
                    <p className="text-xs text-slate-500">{note.topic}</p>
                  </div>
                  <span className="rounded-full border border-pink-200 bg-pink-50 px-3 py-1 text-xs font-semibold text-pink-500">
                    {noteReviewLabel(note)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="soft-panel rounded-[2rem] p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
              <BookOpenText className="text-pink-500" size={18} />
              Useful patterns
            </h2>
            <div className="space-y-3 text-sm leading-6 text-slate-600">
              <p className="flex items-center gap-2">
                <ClipboardList size={16} className="text-rose-500" />
                Write the rule, then one trap.
              </p>
              <p className="flex items-center gap-2">
                <Sparkles size={16} className="text-pink-500" />
                Keep one note per concept.
              </p>
              <p>
                Review due notes before starting a new topic so old mistakes stay visible.
              </p>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
