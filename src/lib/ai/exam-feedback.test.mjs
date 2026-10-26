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
test('client polls by stable attempt ID after connection failure, without resubmitting the attempt', async () => {
  const bodies = []
  let step = 0
  const client = load('./feedback-client.ts', undefined, {
    crypto: crypto.webcrypto,
    fetch: async (_url, init) => {
      bodies.push(JSON.parse(init.body))
      step++
      if (step === 2) throw new Error('Connection lost during status check')
      return step < 4 ? Response.json({ status: 'pending', retryAfterMs: 1 }, { status: 202 }) : Response.json({ analysis })
    },
    setTimeout: callback => setTimeout(callback, 0), clearTimeout,
  })
  const options = { scope: 'owner', signal: new AbortController().signal }
  assert.equal((await client.requestExamFeedback(attempt, options)).analysis.summary, analysis.summary)
  assert.ok(bodies[0].attempt)
  assert.ok(bodies.slice(1).every(body => body.attemptId === attempt.id && !body.attempt))
})

test('client stops the spinner after 90 seconds even if the provider stays pending', async () => {
  let now = 0, requests = 0
  const client = load('./feedback-client.ts', undefined, {
    Date: { now: () => now },
    fetch: async () => { requests++; return Response.json({ status: 'pending', retryAfterMs: 10000 }, { status: 202 }) },
    setTimeout: (callback, ms) => { now += ms; return setTimeout(callback, 0) }, clearTimeout,
  })
  await assert.rejects(client.requestExamFeedback(attempt, { scope: 'owner', signal: new AbortController().signal }), error => error.name === 'FeedbackPendingError')
  assert.equal(now, 90000)
  assert.equal(requests, 9)
})

test('a lost refresh response reuses its nonce instead of generating a second report', async () => {
  const bodies = []
  const client = load('./feedback-client.ts', undefined, {
    crypto: crypto.webcrypto,
    fetch: async (_url, init) => { bodies.push(JSON.parse(init.body)); if (bodies.length === 1) throw new Error('Lost start response'); return Response.json({ analysis }) },
    setTimeout: callback => setTimeout(callback, 0), clearTimeout,
  })
  await client.requestExamFeedback(attempt, { scope: 'owner', signal: new AbortController().signal, refresh: true })
  assert.equal(bodies[0].refreshId, bodies[1].refreshId)
  assert.ok(bodies[0].refreshId)
})

test('Check status never submits an attempt or starts a missing analysis', async () => {
  let body
  const client = load('./feedback-client.ts', undefined, {
    fetch: async (_url, init) => { body = JSON.parse(init.body); return Response.json({ error: 'No saved analysis' }, { status: 404 }) },
  })
  await assert.rejects(client.requestExamFeedback(attempt, { scope: 'owner', signal: new AbortController().signal, checkOnly: true }), /No saved analysis/)
  assert.deepEqual(body, { attemptId: attempt.id })
})

function harness(legacy = null) {
  let starts = 0, charges = 0, status = 'pending'
  const jobs = load('./feedback-job.ts', name => name === 'node:crypto' ? crypto : {})
  const stores = load('./feedback-store.ts')
  const store = stores.createFeedbackStore({}, 'owner', true)
  store.legacyAnalysis = async () => legacy
  const service = load('./feedback-service.ts', name => ({
    'node:crypto': crypto,
    './feedback-job': jobs,
    './exam-feedback': {
      startExamFeedback: async () => ({ responseId: `resp_${++starts}`, context }),
      pollExamFeedback: async () => { if (status === 'failed') throw Error('Incomplete explanation'); return status === 'completed' ? { ...analysis, generatedBy: 'ai' } : null },
    },
  })[name], { process: { env: { OPENAI_API_KEY: 'secret' } } })
  const route = () => load('../../app/api/exam/analyze/route.ts', name => ({
    'next/server': { after: () => {} },
    zod: { z },
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) }, rpc: async () => { charges++; return { data: true } } }) },
    '@/lib/server/imported-mocks': { isLocalStudyRequest: () => false },
    '@/lib/ai/exam-generation': constants,
    '@/lib/exam-analysis': diagnostic,
    '@/lib/ai/feedback-job': jobs,
    '@/lib/ai/feedback-store': { createFeedbackStore: () => store },
    '@/lib/ai/feedback-service': service,
  })[name], { process: { env: { OPENAI_API_KEY: 'secret' } } })
  const post = (body, api = route()) => api.POST(new Request('https://study-table-vert.vercel.app/api/exam/analyze', { method: 'POST', body: JSON.stringify(body) }))
  return { post, store, route, service, setStatus: next => { status = next }, counts: () => ({ starts, charges }) }
}

test('concurrent cold server instances claim one generation; completed result survives another cold instance', async () => {
  const h = harness()
  const [first, duplicate] = await Promise.all([h.post({ attempt }), h.post({ attempt })])
  assert.equal(first.status, 202)
  assert.equal(duplicate.status, 202)
  assert.deepEqual(h.counts(), { starts: 1, charges: 1 })
  h.setStatus('completed')
  assert.equal((await h.post({ attemptId: attempt.id })).status, 200)
  const reopened = await h.post({ attempt: { ...attempt, title: 'Newly corrected display text' } })
  assert.equal((await reopened.json()).analysis.summary, analysis.summary)
  assert.deepEqual(h.counts(), { starts: 1, charges: 1 })
})

test('terminal failure stays failed on reopen; only explicit Refresh starts new work', async () => {
  const h = harness()
  await h.post({ attempt })
  h.setStatus('failed')
  assert.equal((await h.post({ attemptId: attempt.id })).status, 422)
  assert.equal((await h.post({ attempt })).status, 422)
  assert.deepEqual(h.counts(), { starts: 1, charges: 1 })
  h.setStatus('pending')
  const refreshId = crypto.randomUUID()
  assert.equal((await h.post({ attempt, refreshId })).status, 202)
  assert.equal((await h.post({ attempt, refreshId })).status, 202)
  assert.deepEqual(h.counts(), { starts: 2, charges: 2 })
  h.setStatus('completed')
  await h.post({ attemptId: attempt.id })
  assert.equal((await h.post({ attempt, refreshId })).status, 200)
  assert.deepEqual(h.counts(), { starts: 2, charges: 2 })
})

test('refresh keeps the last successful report even when the replacement fails', async () => {
  const h = harness()
  await h.post({ attempt }); h.setStatus('completed'); await h.post({ attemptId: attempt.id })
  h.setStatus('pending')
  await h.post({ attempt, refreshId: crypto.randomUUID() })
  assert.equal((await h.store.read(attempt.id)).analysis.summary, analysis.summary)
  h.setStatus('failed'); await h.post({ attemptId: attempt.id })
  assert.equal((await h.store.read(attempt.id)).analysis.summary, analysis.summary)
})

test('legacy saved reports are reused without a generation and retained during their first refresh', async () => {
  const h = harness(analysis)
  assert.equal((await h.post({ attempt })).status, 200)
  assert.deepEqual(h.counts(), { starts: 0, charges: 0 })
  const firstRefresh = harness(analysis)
  assert.equal((await firstRefresh.post({ attempt, refreshId: crypto.randomUUID() })).status, 202)
  assert.equal((await firstRefresh.store.read(attempt.id)).analysis.summary, analysis.summary)
  assert.deepEqual(firstRefresh.counts(), { starts: 1, charges: 1 })
})

test('expired jobs become a terminal error, while late workers cannot overwrite a new revision', async () => {
  const h = harness()
  await h.post({ attempt })
  let previous = await h.store.read(attempt.id)
  await h.store.update(previous, { expires_at: '2000-01-01T00:00:00Z' })
  assert.equal((await h.post({ attemptId: attempt.id })).status, 422)
  previous = await h.store.read(attempt.id)
  await h.post({ attempt, refreshId: crypto.randomUUID() })
  const next = await h.store.read(attempt.id)
  await h.store.update(previous, { status: 'completed', analysis })
  assert.equal((await h.store.read(attempt.id)).revision, next.revision)
  assert.equal((await h.store.read(attempt.id)).status, 'pending')
})
