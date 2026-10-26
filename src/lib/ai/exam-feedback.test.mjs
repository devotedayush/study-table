import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import ts from 'typescript'
import * as crypto from 'node:crypto'
import { z } from 'zod'

function load(file, requireModule = () => ({}), globals = {}) {
  const source = fs.readFileSync(new URL(file, import.meta.url), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}
  new Function('exports', 'require', ...Object.keys(globals), code)(exports, requireModule, ...Object.values(globals))
  return exports
}
const diagnostic = load('../exam-analysis.ts')
const constants = { EXAM_AI_MODEL: 'gpt-6-luna', EXAM_AI_REASONING: 'max' }
const attempt = { id: crypto.randomUUID(), title: 'Synthetic timeout regression', mode: 'chapter', startedAt: '2026-10-26T00:00:00Z', finishedAt: '2026-10-26T00:02:00Z', questions: [{ id: 'q1', prompt: 'Which answer is correct?', options: ['A', 'B', 'C'], correctIndex: 0, rationale: 'A is correct.', subjectId: 'quant', subject: 'Quantitative Methods', topicId: 'quant-rates-and-returns', topic: 'Rates and Returns' }], answers: [1], flagged: [], elapsedSeconds: 120, questionSeconds: [120], score: 0 }
const analysis = { summary: 'One observed mistake.', focusAreas: [{ subjectId: 'quant', topicId: 'quant-rates-and-returns', concept: 'Return calculation', evidenceQuestionIds: ['q1'], explanation: 'Include income.', practiceTask: 'Calculate total return.' }] }
const context = [{ subjectId: 'quant', topicId: 'quant-rates-and-returns', evidenceQuestionIds: ['q1'] }]
const provider = (fetch) => load('./exam-feedback.ts', name => name === '@/lib/exam-analysis' ? diagnostic : name === './exam-generation' ? constants : {}, { fetch, process: { env: { OPENAI_API_KEY: 'test-key' } } })

test('starts background work without waiting for the explanation, preserving model and retention', async () => {
  const api = provider(async (_url, init) => {
    const body = JSON.parse(init.body)
    assert.equal(body.background, true)
    assert.equal(body.store, false)
    assert.equal(body.model, constants.EXAM_AI_MODEL)
    assert.equal(body.reasoning.effort, 'max')
    return Response.json({ id: 'resp_test', status: 'queued' })
  })
  const result = await api.startExamFeedback(attempt)
  assert.equal(result.responseId, 'resp_test')
  assert.deepEqual(result.context, context)
})
test('pending states and transient status-check timeouts do not fail or restart the job', async () => {
  for (const fetch of [async () => Response.json({ status: 'in_progress' }), async () => { throw new DOMException('timeout', 'TimeoutError') }, async () => new Response('', { status: 503 })]) {
    assert.equal(await provider(fetch).pollExamFeedback('resp_test', context), null)
  }
})
test('completed explanations must still cite the original topic evidence', async () => {
  const completed = { status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(analysis) }] }] }
  const api = provider(async () => Response.json(completed))
  assert.equal((await api.pollExamFeedback('resp_test', context)).generatedBy, 'ai')
  assert.throws(() => api.parseExamFeedback(completed, [{ ...context[0], evidenceQuestionIds: ['other'] }]), /scored evidence/)
})
test('unanswered-only attempts remain rule-based without a provider request', async () => {
  const api = provider(async () => { throw new Error('Provider should not be called') })
  assert.equal((await api.startExamFeedback({ ...attempt, answers: [null] })).analysis.generatedBy, 'rules')
})
test('job tokens reject tampering, other accounts, and expired jobs', () => {
  const jobs = load('./feedback-job.ts', name => name === 'node:crypto' ? crypto : {})
  const token = jobs.signFeedbackJob('resp_test', 'owner', context, 'secret')
  assert.equal(jobs.verifyFeedbackJob(token, 'owner', 'secret').responseId, 'resp_test')
  assert.equal(jobs.verifyFeedbackJob(token, 'someone-else', 'secret'), null)
  assert.equal(jobs.verifyFeedbackJob(`${token}x`, 'owner', 'secret'), null)
  const now = Date.now
  let expired
  try { Date.now = () => 0; expired = jobs.signFeedbackJob('resp_old', 'owner', context, 'secret') } finally { Date.now = now }
  assert.equal(jobs.verifyFeedbackJob(expired, 'owner', 'secret'), null)
})
test('client polls and resumes the same job after network failure or refresh', async () => {
  const stored = new Map(), bodies = []
  let step = 0
  const client = load('./feedback-client.ts', undefined, {
    crypto: crypto.webcrypto,
    sessionStorage: { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) },
    fetch: async (_url, init) => {
      bodies.push(JSON.parse(init.body))
      step++
      if (step === 2) throw new Error('Connection lost during status check')
      return step < 4 ? Response.json({ job: 'signed-job', retryAfterMs: 1 }, { status: 202 }) : Response.json({ analysis })
    },
    setTimeout: callback => setTimeout(callback, 0), clearTimeout,
  })
  const options = { scope: 'owner', signal: new AbortController().signal }
  assert.equal((await client.requestExamFeedback(attempt, options)).analysis.summary, analysis.summary)
  assert.ok(bodies[0].attempt)
  assert.ok(bodies.slice(1).every(body => body.job === 'signed-job' && !body.attempt))
  assert.equal(stored.size, 0)
  const digest = crypto.createHash('sha256').update(JSON.stringify(attempt)).digest('hex')
  stored.set(`study-table:feedback-job:owner:${digest}`, 'signed-job')
  bodies.length = 0
  await client.requestExamFeedback(attempt, options)
  assert.deepEqual(bodies[0], { job: 'signed-job' })
})

test('concurrent starts charge once and a terminally failed job can actually be restarted', async () => {
  let starts = 0, charges = 0
  const jobs = load('./feedback-job.ts', name => name === 'node:crypto' ? crypto : {})
  const route = load('../../app/api/exam/analyze/route.ts', name => ({
    'node:crypto': crypto,
    zod: { z },
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) }, rpc: async () => { charges++; return { data: true } } }) },
    '@/lib/server/imported-mocks': { isLocalStudyRequest: () => false },
    '@/lib/ai/exam-generation': constants,
    '@/lib/exam-analysis': diagnostic,
    '@/lib/ai/feedback-job': jobs,
    '@/lib/ai/exam-feedback': { startExamFeedback: async () => ({ responseId: `resp_${++starts}`, context }), pollExamFeedback: async () => { throw new Error('Incomplete explanation') } },
  })[name], { process: { env: { OPENAI_API_KEY: 'secret' } } })
  const post = body => route.POST(new Request('https://study-table-vert.vercel.app/api/exam/analyze', { method: 'POST', body: JSON.stringify(body) }))
  const [first, duplicate] = await Promise.all([post({ attempt }), post({ attempt })])
  const firstBody = await first.json(), duplicateBody = await duplicate.json()
  assert.equal(first.status, 202)
  assert.equal(firstBody.job, duplicateBody.job)
  assert.equal(starts, 1)
  assert.equal(charges, 1)
  assert.equal((await post({ job: firstBody.job })).status, 422)
  const retry = await post({ attempt })
  assert.equal(retry.status, 202)
  assert.notEqual((await retry.json()).job, firstBody.job)
  assert.equal(starts, 2)
  assert.equal(charges, 2, 'only a new explicit start charges again; the failed poll did not')
})
