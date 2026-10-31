import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import ts from 'typescript'
const require = createRequire(import.meta.url)
const exports = {}
new Function('exports', ts.transpileModule(fs.readFileSync(new URL('./mock-explanation.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(exports)
const { normalizeMockExplanation, mergeMockExplanation, explanationSource } = exports
const question = { id: 'mock-1-s1-q001', prompt: 'Return from 100 to 110?', options: ['10%', '110%', '0%'], correctIndex: 0, answerVerified: true, rationale: 'Source key A', subject: 'Quant', subjectId: 'quant' }
const explanation = { questionId: question.id, intuition: 'Think of the gain relative to your starting money.', reasoning: String.raw`\(R=(110-100)/100=10\%\).`, options: [{ index: 0, explanation: 'Ten earned on one hundred is ten percent.' }, { index: 1, explanation: 'This counts the original capital as a gain.' }, { index: 2, explanation: 'This ignores the price increase.' }], learningHack: 'Subtract first, divide by the starting price.' }
test('accepts complete option reasoning and preserves explicit math', () => {
  assert.deepEqual(normalizeMockExplanation(explanation, question), explanation)
})
test('rejects missing, duplicate, reordered and unknown option records', () => {
  for (const options of [explanation.options.slice(1), [explanation.options[0], explanation.options[0], explanation.options[2]], explanation.options.toReversed()]) assert.equal(normalizeMockExplanation({ ...explanation, options }, question), null)
  assert.equal(normalizeMockExplanation({ ...explanation, questionId: 'other' }, question), null)
  assert.equal(normalizeMockExplanation({ ...explanation, reasoning: '' }, question), null)
})
test('saved reviews acquire commentary without changing score-related fields', () => {
  const original = structuredClone(question)
  const next = mergeMockExplanation(question, { ...question, explanation })
  assert.deepEqual(next.explanation, explanation)
  assert.deepEqual(question, original)
  assert.deepEqual({ ...next, explanation: undefined }, { ...question, explanation: undefined })
  assert.equal(mergeMockExplanation(next, { ...question, explanation }), next)
})
test('never attaches commentary for changed stems, options, keys or scoring status', () => {
  for (const changed of [{ prompt: 'Changed stem' }, { options: ['0%', '10%', '110%'] }, { correctIndex: 2 }, { answerVerified: false }, { content: [{ type: 'paragraph', text: 'Different table data' }] }]) {
    assert.notEqual(explanationSource({ ...question, ...changed }), explanationSource(question))
    assert.equal(mergeMockExplanation(question, { ...question, ...changed, explanation }), question)
  }
})
test('unscored source cautions remain readable without inventing a key', () => {
  const q = { ...question, correctIndex: -1, answerVerified: false }
  const latest = { ...q, explanation: { ...explanation, caution: 'Printed source is incomplete. No verified key is available.' } }
  assert.equal(mergeMockExplanation(q, latest).correctIndex, -1)
  assert.match(mergeMockExplanation(q, latest).explanation.caution, /incomplete/)
})
test('explanation UI renders formula MathML, every option and submitted-choice label', () => {
  const { renderToStaticMarkup } = require('react-dom/server')
  const code = ts.transpileModule(fs.readFileSync(new URL('../components/mock-question-explanation.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const component = {}
  new Function('exports', 'require', code)(component, name => {
    if (name === '@/lib/mock-explanation') return exports
    if (name === './question-content') {
      const mod = {}, source = ts.transpileModule(fs.readFileSync(new URL('../components/question-content.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
      new Function('exports', 'require', source)(mod, n => n.endsWith('.css') ? {} : require(n))
      return mod
    }
    return require(name)
  })
  const html = renderToStaticMarkup(component.MockQuestionExplanation({ question: { ...question, explanation }, submittedIndex: 1 }))
  for (const text of ['The intuition', 'Work it through', 'Why each option', 'Remember it', 'Your answer', 'original capital', '<math']) assert.ok(html.includes(text), text)
})
