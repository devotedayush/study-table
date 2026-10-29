import type { ExamAttempt, ExamQuestion } from './learning-store'

export type TranscriptStatus = 'Correct' | 'Incorrect' | 'Unanswered' | 'Not scored'
export type TranscriptQuestion = {
  number: number
  question: ExamQuestion
  submittedIndex: number | null
  correctIndex: number | null
  status: TranscriptStatus
  flagged: boolean
}

/** Use the same saved keys and full question order as the review, never its search/filter. */
export function buildExamTranscript(attempt: ExamAttempt) {
  const questions: TranscriptQuestion[] = attempt.questions.map((question, index) => {
    const answer = attempt.answers[index]
    const submittedIndex = typeof answer === 'number' && Number.isInteger(answer) && answer >= 0 && answer < question.options.length ? answer : null
    const verified = question.answerVerified !== false && Number.isInteger(question.correctIndex) && question.correctIndex >= 0 && question.correctIndex < question.options.length
    const correctIndex = verified ? question.correctIndex : null
    const status: TranscriptStatus = !verified ? 'Not scored' : submittedIndex === null ? 'Unanswered' : submittedIndex === correctIndex ? 'Correct' : 'Incorrect'
    return { number: index + 1, question, submittedIndex, correctIndex, status, flagged: attempt.flagged.includes(index) }
  })
  const counts = { correct: 0, incorrect: 0, unanswered: 0, unscored: 0 }
  questions.forEach(item => {
    if (item.status === 'Correct') counts.correct++
    else if (item.status === 'Incorrect') counts.incorrect++
    else if (item.status === 'Unanswered') counts.unanswered++
    else counts.unscored++
  })
  const scored = questions.length - counts.unscored
  return { attempt, questions, counts, scored, percent: scored ? Math.round(counts.correct / scored * 100) : null }
}

export function transcriptFilename(attempt: ExamAttempt) {
  const title = attempt.title.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 70) || 'exam'
  const date = /^\d{4}-\d{2}-\d{2}/.exec(attempt.finishedAt)?.[0] ?? 'undated'
  return `study-table-transcript-${title}-${date}-${attempt.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)}.pdf`
}
