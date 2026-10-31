import type { ExamQuestion } from './learning-store'

export type MockExplanation = {
  questionId: string
  intuition: string
  reasoning: string
  options: { index: number; explanation: string }[]
  learningHack: string
  caution?: string
}

/** Bind commentary to the exact stem, options, source content and saved scoring key. */
export function explanationSource(question: ExamQuestion) {
  return JSON.stringify([question.prompt, question.options, question.correctIndex, question.answerVerified !== false, question.content ?? null])
}

export function normalizeMockExplanation(value: unknown, question: ExamQuestion): MockExplanation | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Record<string, unknown>
  if (item.questionId !== question.id || !Array.isArray(item.options) || item.options.length !== question.options.length) return null
  const text = (value: unknown) => typeof value === 'string' && value.trim().length > 0 && value.length <= 16000
  if (!text(item.intuition) || !text(item.reasoning) || typeof item.learningHack !== 'string' || item.learningHack.length > 16000) return null
  if (item.caution !== undefined && !text(item.caution)) return null
  const options = item.options as Record<string, unknown>[]
  if (options.some((option, index) => !option || option.index !== index || !text(option.explanation))) return null
  return {
    questionId: question.id, intuition: item.intuition as string, reasoning: item.reasoning as string,
    options: options.map(option => ({ index: option.index as number, explanation: option.explanation as string })),
    learningHack: item.learningHack as string, ...(item.caution ? { caution: item.caution as string } : {}),
  }
}

/** Refresh commentary without changing any saved answer, key, score or timing. */
export function mergeMockExplanation(saved: ExamQuestion, latest: ExamQuestion): ExamQuestion {
  if (saved.id !== latest.id || explanationSource(saved) !== explanationSource(latest)) return saved
  const explanation = normalizeMockExplanation(latest.explanation, saved)
  if (!explanation || JSON.stringify(saved.explanation) === JSON.stringify(explanation)) return saved
  return { ...saved, explanation }
}
