import type { ExamAttempt, ExamQuestion } from '@/lib/learning-store'

export type WeaknessSignal = 'incorrect' | 'unanswered' | 'slow_correct'

export type ExamQuestionEvidence = {
  questionId: string
  /** Zero-based position in `attempt.questions`. */
  questionIndex: number
  /** Original paper number when supplied, otherwise the one-based attempt position. */
  questionNumber: number
  /** The original mock session when known. CFA full mocks infer sessions at the 90-question boundary. */
  sourceSession?: number
}

export type TopicDiagnostic = {
  topicId: string
  topic: string
  subjectId: string
  subject: string
  /** Verified questions in this topic. Unverified source keys are counted separately. */
  questionCount: number
  answered: number
  correct: number
  incorrect: number
  unanswered: number
  unverifiedQuestionCount: number
  accuracy: number | null
  averageSeconds: number | null
  wrongQuestionIds: string[]
  unansweredQuestionIds: string[]
  slowCorrectQuestionIds: string[]
  unverifiedQuestionIds: string[]
  evidenceQuestionIds: string[]
  evidenceQuestionNumbers: number[]
  evidenceQuestions: ExamQuestionEvidence[]
  weaknessSignals: WeaknessSignal[]
  /** True below five answered verified questions; findings are descriptive and inconclusive. */
  limitedEvidence: boolean
}

export type ExamDiagnosticTotals = {
  /** Verified questions included in this diagnostic. */
  questionCount: number
  answered: number
  correct: number
  incorrect: number
  unanswered: number
  unverifiedQuestionCount: number
  accuracy: number | null
  averageSeconds: number | null
  /** True below five answered verified questions. */
  limitedEvidence: boolean
}

export type ExamDiagnostic = {
  attemptId: string
  totals: ExamDiagnosticTotals
  /** Every subject/topic grouping represented in this attempt, including unverified-only groups. */
  topicPerformance: TopicDiagnostic[]
  /** Topics with an incorrect, unanswered, or unusually slow correct verified response. */
  weakTopics: TopicDiagnostic[]
  /** Correct answers slower than this many seconds are relatively slow in this attempt. */
  slowCorrectThresholdSeconds: number | null
}

export type ExamAIAnalysis = {
  generatedBy?: 'ai' | 'rules'
  summary: string
  focusAreas: Array<{
    topicId: string
    subjectId: string
    concept: string
    evidenceQuestionIds: string[]
    explanation: string
    practiceTask: string
  }>
}

type QuestionWithImportMetadata = ExamQuestion & {
  answerVerified?: boolean
  sourceQuestionNumber?: number
  sourceSession?: number
}

type TopicAccumulator = {
  topicId: string
  topic: string
  subjectId: string
  subject: string
  firstIndex: number
  questionCount: number
  answered: number
  correct: number
  incorrect: number
  unanswered: number
  unverifiedQuestionCount: number
  timedSeconds: number[]
  wrongQuestions: ExamQuestionEvidence[]
  unansweredQuestions: ExamQuestionEvidence[]
  slowCorrectQuestions: ExamQuestionEvidence[]
  unverifiedQuestions: ExamQuestionEvidence[]
}

type QuestionResult = {
  question: QuestionWithImportMetadata
  reference: ExamQuestionEvidence
  topicKey: string
  verified: boolean
  answer: number | null | undefined
  seconds: number | null
}

const MIN_ANSWERED_FOR_STRONGER_EVIDENCE = 5
const SLOW_TIME_MULTIPLIER = 1.5
const CFA_FULL_MOCK_SESSION_SIZE = 90

function roundToOneDecimal(value: number) {
  return Math.round(value * 10) / 10
}

function getPositiveSeconds(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function getQuestionNumber(question: QuestionWithImportMetadata, index: number) {
  const sourceNumber = question.sourceQuestionNumber
  return typeof sourceNumber === 'number' && Number.isInteger(sourceNumber) && sourceNumber > 0
    ? sourceNumber
    : index + 1
}

function getSourceSession(attempt: ExamAttempt, question: QuestionWithImportMetadata, index: number) {
  if (typeof question.sourceSession === 'number' && Number.isInteger(question.sourceSession) && question.sourceSession > 0) {
    return question.sourceSession
  }
  if (attempt.mode !== 'full_mock') return undefined
  return Math.floor(index / CFA_FULL_MOCK_SESSION_SIZE) + 1
}

function getQuestionReference(attempt: ExamAttempt, question: QuestionWithImportMetadata, index: number): ExamQuestionEvidence {
  return {
    questionId: question.id,
    questionIndex: index,
    questionNumber: getQuestionNumber(question, index),
    sourceSession: getSourceSession(attempt, question, index),
  }
}

function getTopicKey(question: ExamQuestion) {
  const subjectId = question.subjectId?.trim() ?? ''
  const topicId = question.topicId?.trim() ?? ''
  const topic = question.topic?.trim() ?? ''
  const topicIdentity = topicId || topic.toLowerCase() || 'unassigned'
  return `${subjectId}\u0000${topicIdentity}`
}

function getMedian(values: number[]) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
  return roundToOneDecimal(median)
}

function average(values: number[]) {
  if (values.length === 0) return null
  return roundToOneDecimal(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function accuracy(correct: number, answered: number) {
  return answered === 0 ? null : roundToOneDecimal((correct / answered) * 100)
}

function uniqueReferences(references: ExamQuestionEvidence[]) {
  const seen = new Set<string>()
  return references.filter((reference) => {
    if (seen.has(reference.questionId)) return false
    seen.add(reference.questionId)
    return true
  })
}

function getWeaknessSignals(topic: Pick<TopicDiagnostic, 'incorrect' | 'unanswered' | 'slowCorrectQuestionIds'>): WeaknessSignal[] {
  const signals: WeaknessSignal[] = []
  if (topic.incorrect > 0) signals.push('incorrect')
  if (topic.unanswered > 0) signals.push('unanswered')
  if (topic.slowCorrectQuestionIds.length > 0) signals.push('slow_correct')
  return signals
}

function weaknessGroup(topic: TopicDiagnostic) {
  if (topic.incorrect > 0) return 0
  if (topic.unanswered > 0) return 1
  if (topic.slowCorrectQuestionIds.length > 0) return 2
  return 3
}

function compareText(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0
}

function sortWeakTopics(a: TopicDiagnostic, b: TopicDiagnostic) {
  const groupDifference = weaknessGroup(a) - weaknessGroup(b)
  if (groupDifference !== 0) return groupDifference

  if (groupDifference === 0 && weaknessGroup(a) < 3) {
    if (a.incorrect !== b.incorrect) return b.incorrect - a.incorrect
    if (a.unanswered !== b.unanswered) return b.unanswered - a.unanswered
    if (a.accuracy !== b.accuracy && a.accuracy !== null && b.accuracy !== null) return a.accuracy - b.accuracy
    if (a.slowCorrectQuestionIds.length !== b.slowCorrectQuestionIds.length) {
      return b.slowCorrectQuestionIds.length - a.slowCorrectQuestionIds.length
    }
  }

  return compareText(a.topic, b.topic) || compareText(a.subject, b.subject) || compareText(a.topicId, b.topicId)
}

/**
 * Builds a reproducible result summary from one saved attempt. Accuracy is a percentage (0–100),
 * average time is seconds over questions with recorded positive time, and unverified answer keys
 * never affect scores or weakness signals. Relative slow timing uses 1.5× the median positive
 * time for answered questions in this attempt; it is not an exam-readiness benchmark.
 */
export function buildExamDiagnostic(attempt: ExamAttempt): ExamDiagnostic {
  const questions = attempt.questions ?? []
  const answers = attempt.answers ?? []
  const questionSeconds = attempt.questionSeconds ?? []
  const topicGroups = new Map<string, TopicAccumulator>()
  const results: QuestionResult[] = []

  questions.forEach((rawQuestion, index) => {
    const question = rawQuestion as QuestionWithImportMetadata
    const reference = getQuestionReference(attempt, question, index)
    const topicKey = getTopicKey(question)
    const verified = question.answerVerified !== false
    const answer = answers[index]
    const seconds = getPositiveSeconds(questionSeconds[index])
    let topic = topicGroups.get(topicKey)

    if (!topic) {
      topic = {
        topicId: question.topicId?.trim() ?? '',
        topic: question.topic?.trim() || 'Unassigned topic',
        subjectId: question.subjectId?.trim() ?? '',
        subject: question.subject?.trim() || 'Unassigned subject',
        firstIndex: index,
        questionCount: 0,
        answered: 0,
        correct: 0,
        incorrect: 0,
        unanswered: 0,
        unverifiedQuestionCount: 0,
        timedSeconds: [],
        wrongQuestions: [],
        unansweredQuestions: [],
        slowCorrectQuestions: [],
        unverifiedQuestions: [],
      }
      topicGroups.set(topicKey, topic)
    }

    const result = { question, reference, topicKey, verified, answer, seconds }
    results.push(result)

    if (!verified) {
      topic.unverifiedQuestionCount += 1
      topic.unverifiedQuestions.push(reference)
      return
    }

    topic.questionCount += 1
    if (seconds !== null) topic.timedSeconds.push(seconds)

    if (typeof answer !== 'number' || !Number.isInteger(answer)) {
      topic.unanswered += 1
      topic.unansweredQuestions.push(reference)
      return
    }

    topic.answered += 1
    if (answer === question.correctIndex) topic.correct += 1
    else {
      topic.incorrect += 1
      topic.wrongQuestions.push(reference)
    }
  })

  const answeredPositiveTimes = results
    .filter((result) => result.verified && typeof result.answer === 'number' && Number.isInteger(result.answer) && result.seconds !== null)
    .map((result) => result.seconds as number)
  const medianAnsweredSeconds = getMedian(answeredPositiveTimes)
  const slowCorrectThresholdSeconds = medianAnsweredSeconds === null
    ? null
    : roundToOneDecimal(medianAnsweredSeconds * SLOW_TIME_MULTIPLIER)

  if (slowCorrectThresholdSeconds !== null) {
    for (const result of results) {
      if (!result.verified || result.answer !== result.question.correctIndex || result.seconds === null) continue
      if (result.seconds > slowCorrectThresholdSeconds) {
        topicGroups.get(result.topicKey)?.slowCorrectQuestions.push(result.reference)
      }
    }
  }

  const topicPerformance: TopicDiagnostic[] = [...topicGroups.values()]
    .sort((a, b) => a.firstIndex - b.firstIndex)
    .map((topic) => {
      const evidence = uniqueReferences([
        ...topic.wrongQuestions,
        ...topic.unansweredQuestions,
        ...topic.slowCorrectQuestions,
      ].sort((a, b) => a.questionIndex - b.questionIndex))
      const wrongQuestions = uniqueReferences(topic.wrongQuestions)
      const unansweredQuestions = uniqueReferences(topic.unansweredQuestions)
      const slowCorrectQuestions = uniqueReferences(topic.slowCorrectQuestions)
      const answered = topic.answered
      const diagnostic: TopicDiagnostic = {
        topicId: topic.topicId,
        topic: topic.topic,
        subjectId: topic.subjectId,
        subject: topic.subject,
        questionCount: topic.questionCount,
        answered,
        correct: topic.correct,
        incorrect: topic.incorrect,
        unanswered: topic.unanswered,
        unverifiedQuestionCount: topic.unverifiedQuestionCount,
        accuracy: accuracy(topic.correct, answered),
        averageSeconds: average(topic.timedSeconds),
        wrongQuestionIds: wrongQuestions.map((item) => item.questionId),
        unansweredQuestionIds: unansweredQuestions.map((item) => item.questionId),
        slowCorrectQuestionIds: slowCorrectQuestions.map((item) => item.questionId),
        unverifiedQuestionIds: uniqueReferences(topic.unverifiedQuestions).map((item) => item.questionId),
        evidenceQuestionIds: evidence.map((item) => item.questionId),
        evidenceQuestionNumbers: evidence.map((item) => item.questionNumber),
        evidenceQuestions: evidence,
        weaknessSignals: [],
        limitedEvidence: answered < MIN_ANSWERED_FOR_STRONGER_EVIDENCE,
      }
      diagnostic.weaknessSignals = getWeaknessSignals(diagnostic)
      return diagnostic
    })

  const questionCount = topicPerformance.reduce((sum, topic) => sum + topic.questionCount, 0)
  const answered = topicPerformance.reduce((sum, topic) => sum + topic.answered, 0)
  const correct = topicPerformance.reduce((sum, topic) => sum + topic.correct, 0)
  const incorrect = topicPerformance.reduce((sum, topic) => sum + topic.incorrect, 0)
  const unanswered = topicPerformance.reduce((sum, topic) => sum + topic.unanswered, 0)
  const unverifiedQuestionCount = topicPerformance.reduce((sum, topic) => sum + topic.unverifiedQuestionCount, 0)
  const allTimedSeconds = results
    .filter((result) => result.verified && result.seconds !== null)
    .map((result) => result.seconds as number)

  const totals: ExamDiagnosticTotals = {
    questionCount,
    answered,
    correct,
    incorrect,
    unanswered,
    unverifiedQuestionCount,
    accuracy: accuracy(correct, answered),
    averageSeconds: average(allTimedSeconds),
    limitedEvidence: answered < MIN_ANSWERED_FOR_STRONGER_EVIDENCE,
  }

  const weakTopics = topicPerformance
    .filter((topic) => topic.weaknessSignals.length > 0)
    .sort(sortWeakTopics)

  return {
    attemptId: attempt.id,
    totals,
    topicPerformance,
    weakTopics,
    slowCorrectThresholdSeconds,
  }
}
