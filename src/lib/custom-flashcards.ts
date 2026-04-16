'use client'

import type { Flashcard } from '@/lib/flashcards-data'

export type CustomFlashcard = Flashcard & {
  createdAt: string
  updatedAt: string
}

export type CustomFlashcardDraft = {
  subject: string
  module: string
  title: string
  prompt: string
  answer: string
  memoryHook: string
  tags: string
}

export const CUSTOM_FLASHCARDS_KEY = 'cfa-custom-flashcards-v1'

function isBrowser() {
  return typeof window !== 'undefined'
}

export function createEmptyCustomFlashcardDraft(defaultSubject: string): CustomFlashcardDraft {
  return {
    subject: defaultSubject,
    module: '',
    title: '',
    prompt: '',
    answer: '',
    memoryHook: '',
    tags: '',
  }
}

export function parseTags(value: string) {
  return value
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
}

export function createCustomFlashcard(draft: CustomFlashcardDraft): CustomFlashcard {
  const now = new Date().toISOString()

  return {
    id: crypto.randomUUID(),
    subject: draft.subject as Flashcard['subject'],
    module: draft.module.trim() || 'Custom',
    title: draft.title.trim(),
    prompt: draft.prompt.trim(),
    answer: draft.answer.trim(),
    memoryHook: draft.memoryHook.trim() || 'Your own exam hook.',
    tags: parseTags(draft.tags),
    createdAt: now,
    updatedAt: now,
  }
}

export function loadCustomFlashcards() {
  if (!isBrowser()) {
    return [] as CustomFlashcard[]
  }

  try {
    const raw = window.localStorage.getItem(CUSTOM_FLASHCARDS_KEY)
    return raw ? (JSON.parse(raw) as CustomFlashcard[]) : []
  } catch {
    return []
  }
}

export function saveCustomFlashcards(cards: CustomFlashcard[]) {
  if (!isBrowser()) {
    return
  }

  window.localStorage.setItem(CUSTOM_FLASHCARDS_KEY, JSON.stringify(cards))
}

export function mergeCustomFlashcards(localCards: CustomFlashcard[], remoteCards: CustomFlashcard[]) {
  const merged = new Map<string, CustomFlashcard>()

  for (const card of [...remoteCards, ...localCards]) {
    const existing = merged.get(card.id)
    if (!existing || new Date(card.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()) {
      merged.set(card.id, card)
    }
  }

  return [...merged.values()].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}
