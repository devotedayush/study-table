import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import typescript from 'typescript'

const sourceText = fs.readFileSync(new URL('./exam-analysis.ts', import.meta.url), 'utf8')
const transpiled = typescript.transpileModule(sourceText, {
  compilerOptions: {
    module: typescript.ModuleKind.CommonJS,
    target: typescript.ScriptTarget.ES2022,
  },
})
const compiledExports = {}
new Function('exports', transpiled.outputText)(compiledExports)
const { buildExamDiagnostic } = compiledExports

function question(id, subjectId, subject, topicId, topic, correctIndex = 0, extra = {}) {
  return {
    id,
    prompt: `Prompt for ${id}`,
    options: ['A', 'B', 'C'],
    correctIndex,
    rationale: `Rationale for ${id}`,
    subjectId,
    subject,
    topicId,
    topic,
    ...extra,
  }
}

function attempt({ questions, answers, questionSeconds = [], mode = 'custom' }) {
  return {
    id: 'attempt-1',
    title: 'Diagnostic paper',
    mode,
    startedAt: '2026-10-17T10:00:00.000Z',
    finishedAt: '2026-10-17T11:00:00.000Z',
    questions,
    answers,
    flagged: [],
    elapsedSeconds: 3600,
    questionSeconds,
    score: 0,
  }
}

test('scores topic evidence and orders incorrect, unanswered, then slow-correct signals', () => {
  const savedAttempt = attempt({
    questions: [
      question('wrong-rate', 'quant', 'Quantitative Methods', 'rates', 'Rates and Returns', 0, { sourceQuestionNumber: 7, sourceSession: 1 }),
      question('right-rate', 'quant', 'Quantitative Methods', 'rates', 'Rates and Returns', 1, { sourceQuestionNumber: 8, sourceSession: 1 }),
      question('skip-ethics', 'ethics', 'Ethical and Professional Standards', 'ethics-application', 'Ethics Application', 0, { sourceQuestionNumber: 1, sourceSession: 2 }),
      question('slow-equity', 'equity', 'Equity Investments', 'equity-valuation', 'Equity Valuation', 2, { sourceQuestionNumber: 1, sourceSession: 2 }),
    ],
    answers: [2, 1, null, 2],
    questionSeconds: [20, 20, 90, 80],
  })
  const before = structuredClone(savedAttempt)

  const result = buildExamDiagnostic(savedAttempt)

  assert.deepEqual(savedAttempt, before, 'analysis leaves the saved attempt unchanged')
  assert.deepEqual(result, buildExamDiagnostic(savedAttempt), 'identical attempts produce identical diagnostics')
  assert.deepEqual(result.totals, {
    questionCount: 4,
    answered: 3,
    correct: 2,
    incorrect: 1,
    unanswered: 1,
    unverifiedQuestionCount: 0,
    accuracy: 66.7,
    averageSeconds: 52.5,
    limitedEvidence: true,
  })
  assert.equal(result.slowCorrectThresholdSeconds, 30)

  const [incorrectTopic, unansweredTopic, slowTopic] = result.weakTopics
  assert.deepEqual(result.weakTopics.map((topic) => topic.topicId), ['rates', 'ethics-application', 'equity-valuation'])
  assert.deepEqual(incorrectTopic.weaknessSignals, ['incorrect'])
  assert.deepEqual(incorrectTopic.wrongQuestionIds, ['wrong-rate'])
  assert.deepEqual(incorrectTopic.evidenceQuestionNumbers, [7])
  assert.deepEqual(incorrectTopic.evidenceQuestions[0], {
    questionId: 'wrong-rate',
    questionIndex: 0,
    questionNumber: 7,
    sourceSession: 1,
  })
  assert.equal(incorrectTopic.accuracy, 50)
  assert.equal(incorrectTopic.averageSeconds, 20)

  assert.deepEqual(unansweredTopic.weaknessSignals, ['unanswered'])
  assert.deepEqual(unansweredTopic.unansweredQuestionIds, ['skip-ethics'])
  assert.equal(unansweredTopic.accuracy, null)
  assert.equal(unansweredTopic.evidenceQuestions[0].sourceSession, 2)

  assert.deepEqual(slowTopic.weaknessSignals, ['slow_correct'])
  assert.deepEqual(slowTopic.slowCorrectQuestionIds, ['slow-equity'])
  assert.deepEqual(slowTopic.evidenceQuestionNumbers, [1])
  assert.equal(slowTopic.evidenceQuestions[0].sourceSession, 2)
  assert.equal(slowTopic.limitedEvidence, true)
})

test('excludes explicitly unverified keys but treats legacy questions without the field as verified', () => {
  const savedAttempt = attempt({
    questions: [
      question('unverified-wrong', 'quant', 'Quantitative Methods', 'rates', 'Rates and Returns', 1, {
        answerVerified: false,
        sourceQuestionNumber: 44,
      }),
      question('legacy-correct', 'quant', 'Quantitative Methods', 'rates', 'Rates and Returns', 0),
      question('verified-skip', 'ethics', 'Ethical and Professional Standards', 'ethics-application', 'Ethics Application', 2),
      question('unverified-only-topic', 'derivatives', 'Derivatives', 'options', 'Options', 1, { answerVerified: false }),
    ],
    answers: [0, 0, null, 1],
    questionSeconds: [300, 20, 0, 500],
  })

  const result = buildExamDiagnostic(savedAttempt)
  const rates = result.topicPerformance.find((topic) => topic.topicId === 'rates')
  const ethics = result.topicPerformance.find((topic) => topic.topicId === 'ethics-application')
  const unverifiedOnly = result.topicPerformance.find((topic) => topic.topicId === 'options')

  assert.equal(result.totals.questionCount, 2)
  assert.equal(result.totals.unverifiedQuestionCount, 2)
  assert.equal(result.totals.answered, 1)
  assert.equal(result.totals.correct, 1)
  assert.equal(result.totals.incorrect, 0)
  assert.equal(result.totals.accuracy, 100)
  assert.equal(result.totals.averageSeconds, 20)

  assert.equal(rates.questionCount, 1)
  assert.equal(rates.unverifiedQuestionCount, 1)
  assert.deepEqual(rates.unverifiedQuestionIds, ['unverified-wrong'])
  assert.deepEqual(rates.wrongQuestionIds, [])
  assert.deepEqual(rates.weaknessSignals, [])
  assert.equal(unverifiedOnly.questionCount, 0)
  assert.equal(unverifiedOnly.accuracy, null)
  assert.equal(unverifiedOnly.averageSeconds, null)
  assert.deepEqual(unverifiedOnly.weaknessSignals, [])
  assert.deepEqual(unverifiedOnly.unverifiedQuestionIds, ['unverified-only-topic'])
  assert.equal(ethics.accuracy, null)
  assert.deepEqual(ethics.unansweredQuestionIds, ['verified-skip'])
  assert.deepEqual(result.weakTopics.map((topic) => topic.topicId), ['ethics-application'])
})

test('keeps missing score and time as null and labels one-answer findings as limited evidence', () => {
  const unanswered = buildExamDiagnostic(attempt({
    questions: [question('unanswered', 'quant', 'Quantitative Methods', 'rates', 'Rates and Returns')],
    answers: [null],
  }))

  assert.equal(unanswered.totals.accuracy, null)
  assert.equal(unanswered.totals.averageSeconds, null)
  assert.equal(unanswered.totals.limitedEvidence, true)
  assert.equal(unanswered.weakTopics[0].limitedEvidence, true)
  assert.deepEqual(unanswered.weakTopics[0].weaknessSignals, ['unanswered'])

  const oneCorrect = buildExamDiagnostic(attempt({
    questions: [question('one-correct', 'quant', 'Quantitative Methods', 'rates', 'Rates and Returns')],
    answers: [0],
    questionSeconds: [90],
  }))

  assert.equal(oneCorrect.totals.accuracy, 100)
  assert.equal(oneCorrect.totals.limitedEvidence, true)
  assert.equal(oneCorrect.slowCorrectThresholdSeconds, 135)
  assert.deepEqual(oneCorrect.weakTopics, [], 'one timed correct answer is not compared against itself as slow')
})

test('uses full-mock session fallback only when explicit source session metadata is missing', () => {
  const questions = Array.from({ length: 91 }, (_, index) => question(
    `full-${index + 1}`,
    'quant',
    'Quantitative Methods',
    'rates',
    'Rates and Returns',
    0,
    index === 90 ? { sourceQuestionNumber: 3 } : { answerVerified: false },
  ))
  const savedAttempt = attempt({
    mode: 'full_mock',
    questions,
    answers: Array.from({ length: questions.length }, () => null),
  })

  const result = buildExamDiagnostic(savedAttempt)
  const evidence = result.weakTopics[0].evidenceQuestions[0]

  assert.equal(evidence.questionIndex, 90)
  assert.equal(evidence.questionNumber, 3)
  assert.equal(evidence.sourceSession, 2)
  assert.equal(result.totals.questionCount, 1)
  assert.equal(result.totals.unverifiedQuestionCount, 90)
})
