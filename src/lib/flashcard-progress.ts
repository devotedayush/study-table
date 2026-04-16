'use client'

export type FlashcardProgress = {
  confidence: number | null
  known: boolean
  bookmarked: boolean
  lastReviewedAt: string | null
  reviewCount: number
}

export const FLASHCARD_PROGRESS_KEY = 'cfa-formula-flashcards-v1'

function isBrowser() {
  return typeof window !== 'undefined'
}

export function loadFlashcardProgressMap() {
  if (!isBrowser()) {
    return {} as Record<string, FlashcardProgress>
  }

  try {
    const raw = window.localStorage.getItem(FLASHCARD_PROGRESS_KEY)
    return raw ? (JSON.parse(raw) as Record<string, FlashcardProgress>) : {}
  } catch {
    return {}
  }
}

export function saveFlashcardProgressMap(progressMap: Record<string, FlashcardProgress>) {
  if (!isBrowser()) {
    return
  }

  window.localStorage.setItem(FLASHCARD_PROGRESS_KEY, JSON.stringify(progressMap))
}

export function getFlashcardProgress(progressMap: Record<string, FlashcardProgress>, cardId: string): FlashcardProgress {
  return (
    progressMap[cardId] ?? {
      confidence: null,
      known: false,
      bookmarked: false,
      lastReviewedAt: null,
      reviewCount: 0,
    }
  )
}

