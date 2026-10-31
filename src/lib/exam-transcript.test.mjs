import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const cache = new Map()
function load(name) {
  if (cache.has(name)) return cache.get(name)
  const source = fs.readFileSync(new URL(`./${name}.ts`, import.meta.url), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  const exports = {}
  new Function('exports', 'require', code)(exports, name => name.startsWith('./') ? load(name.slice(2)) : require(name))
  cache.set(name, exports)
  return exports
}
const { buildExamTranscript, transcriptFilename } = load('exam-transcript')
const { buildTranscriptPdfDefinition } = load('exam-transcript-pdf')
test('PDF includes intuition, worked reasoning, every option and learning hacks', () => {
  const q = { id: 'mock-1-s1-q001', prompt: 'Return?', options: ['10%', '0%', '110%'], correctIndex: 0, answerVerified: true, subjectId: 'quant', subject: 'Quant', rationale: 'Source key A' }
  q.explanation = { questionId: q.id, intuition: 'Compare the gain with the original amount.', reasoning: String.raw`\(R=\frac{110-100}{100}=10\%\).`, options: [{ index: 0, explanation: 'Ten earned on one hundred is ten percent.' }, { index: 1, explanation: 'Zero ignores the gain.' }, { index: 2, explanation: '110 percent confuses wealth with return.' }], learningHack: 'Change divided by starting value.', caution: 'Example source caution.' }
  const definition = buildTranscriptPdfDefinition({ ...fixture, questions: [q], answers: [0], questionSeconds: [30] })
  const json = JSON.stringify(definition)
  for (const text of ['THE INTUITION', 'WORK IT THROUGH', 'OPTION A', 'OPTION B', 'OPTION C', 'REMEMBER IT', 'Example source caution.', 'SOURCE-KEY ANSWER (SEE CAUTION)']) assert.ok(json.includes(text), text)
  assert.ok(json.includes('<svg'))
  assert.ok(!json.includes('unbreakable'))
})
const question = (id, extra = {}) => ({ id, prompt: `Full question ${id}: what is the holding-period return on an asset bought for $100 and sold for $108 with a $2 dividend?`, options: ['8%', '10%', '12%'], correctIndex: 1, rationale: 'Include income: \\(\\mathrm{HPR}=\\frac{108-100+2}{100}=10\\%\\).', subjectId: 'quant', subject: 'Quantitative Methods', topicId: 'quant-rates-and-returns', topic: 'Rates and Returns', ...extra })
export const fixture = {
  id: '01234567-0000-4000-8000-000000000000', title: 'Practice transcript / mixed results', mode: 'chapter',
  startedAt: '2026-10-29T08:00:00.000Z', finishedAt: '2026-10-29T08:05:00.000Z',
  questions: [question('correct'), question('incorrect'), question('skipped'), question('unverified', { answerVerified: false, correctIndex: 0, unscoredReason: 'Printed answer keys conflict.', nativeTranscription: { version: 1, status: 'needs_review', notes: ['The source value needs checking.'] } }), question('table', { content: [
    { type: 'paragraph', text: 'Use the complete cash-flow table below. Currency is $100, not a math delimiter.', headers: [], rows: [], items: [] },
    { type: 'table', text: 'Cash-flow inputs', headers: ['Year', 'Cash flow', 'Discount rate'], rows: [['1', '$100', '5%'], ['2', '$120', '6%']], items: [] },
    { type: 'math', text: '\\mathrm{PV}=\\sum_{t=1}^{2}\\frac{CF_t}{(1+r_t)^t}', headers: [], rows: [], items: [] },
    { type: 'list', text: 'Assumptions', headers: [], rows: [], items: ['Payments occur at year-end.', 'Use each stated discount rate.'] },
  ], sourceSession: 2, sourceQuestionNumber: 91 })],
  answers: [1, 0, null, 0, 1], flagged: [1], elapsedSeconds: 300, questionSeconds: [40, 60, 0, 80, 120], score: 50,
}

test('exports every question in order and distinguishes wrong, skipped and unverified keys', () => {
  const original = structuredClone(fixture)
  const transcript = buildExamTranscript(fixture)
  assert.deepEqual(transcript.questions.map(item => item.status), ['Correct', 'Incorrect', 'Unanswered', 'Not scored', 'Correct'])
  assert.deepEqual(transcript.counts, { correct: 2, incorrect: 1, unanswered: 1, unscored: 1 })
  assert.equal(transcript.percent, 50)
  assert.equal(transcript.questions[3].correctIndex, null, 'an unverified key must never be presented as correct')
  assert.equal(transcript.questions[1].flagged, true)
  assert.deepEqual(fixture, original, 'export cannot mutate the saved attempt')
})
test('invalid legacy keys are unscored and missing or invalid selections are unanswered', () => {
  const legacy = { ...fixture, questions: [question('bad-key', { correctIndex: -1 }), question('bad-choice')], answers: [0, 9] }
  assert.deepEqual(buildExamTranscript(legacy).questions.map(item => item.status), ['Not scored', 'Unanswered'])
})
test('PDF definition preserves structured tables, lists, rendered math and all answer labels', () => {
  const definition = buildTranscriptPdfDefinition(fixture)
  const json = JSON.stringify(definition)
  assert.ok(json.includes('question-5'))
  assert.ok(json.includes('Cash-flow inputs') && json.includes('$120') && json.includes('Discount rate'))
  assert.ok(json.includes('Payments occur at year-end.'))
  assert.ok(json.includes('YOUR ANSWER') && json.includes('CORRECT ANSWER'))
  assert.ok(json.includes('Original Q91') && json.includes('Session 2'))
  assert.ok(json.includes('Printed answer keys conflict.'))
  assert.ok(json.includes('<svg'), 'valid LaTeX is typeset as vector math')
  assert.ok(!json.includes('Formula as supplied:'), 'the valid fixture formulas must render')
})
test('bad TeX stays readable rather than disappearing from the paper', () => {
  const definition = buildTranscriptPdfDefinition({ ...fixture, questions: [question('bad-tex', { prompt: 'Unknown expression: \\(\\notacommand{x}\\).' })], answers: [0] })
  assert.ok(JSON.stringify(definition).includes('Formula as supplied:'))
})
test('full mocks preserve 180 questions and original session numbering', () => {
  const mock = { ...fixture, mode: 'full_mock', questions: Array.from({ length: 180 }, (_, index) => question(`q${index + 1}`, { sourceSession: index < 90 ? 1 : 2, sourceQuestionNumber: index % 90 + 1 })), answers: Array(180).fill(1) }
  const serialized = JSON.stringify(buildTranscriptPdfDefinition(mock))
  assert.ok(serialized.includes('QUESTION 180 | Session 2 | Original Q90'))
  assert.equal((serialized.match(/"id":"question-/g) ?? []).length, 180)
})
test('download names are portable and tied to the completed attempt', () => {
  const name = transcriptFilename({ ...fixture, title: '../../My: Exam? / α' })
  assert.ok(name.endsWith('-2026-10-29-01234567.pdf'))
  assert.ok(!/[\\/:?]/.test(name))
})

test('download produces a real PDF blob with the attempt filename without posting answers', async () => {
  const originalDocument = globalThis.document
  const createUrl = URL.createObjectURL, revokeUrl = URL.revokeObjectURL, originalTimer = globalThis.setTimeout
  let exported, clicked = false, attached = false, removed = false
  const anchor = { href: '', download: '', click: () => { clicked = true }, remove: () => { removed = true } }
  try {
    globalThis.document = { createElement: () => anchor, body: { appendChild: () => { attached = true } } }
    URL.createObjectURL = blob => { exported = blob; return 'blob:transcript-test' }
    URL.revokeObjectURL = () => {}
    globalThis.setTimeout = (callback, delay, ...args) => originalTimer(callback, delay === 60000 ? 0 : delay, ...args)
    await load('exam-transcript-pdf').downloadExamTranscript(fixture)
    assert.equal(exported.type, 'application/pdf')
    assert.equal(new TextDecoder().decode((await exported.arrayBuffer()).slice(0, 5)), '%PDF-')
    assert.ok(clicked && attached && removed)
    assert.equal(anchor.download, transcriptFilename(fixture))
  } finally {
    globalThis.document = originalDocument
    URL.createObjectURL = createUrl
    URL.revokeObjectURL = revokeUrl
    globalThis.setTimeout = originalTimer
  }
})

export { load }
