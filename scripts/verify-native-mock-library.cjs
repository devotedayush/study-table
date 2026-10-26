#!/usr/bin/env node
/* Read-only pre-upload integrity audit for the six source-faithful mock papers. */
/* eslint @typescript-eslint/no-require-imports: off */
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const { isDeepStrictEqual } = require('node:util')
const typescript = require('typescript')
const katex = require('katex')

const root = path.resolve(__dirname, '..')
const paperRoot = path.resolve(process.env.MOCK_LIBRARY_ROOT ?? path.join(root, 'data', 'imported-mocks'))
const maxPayloadCharacters = 3_000_000
const issues = []
const nativeFlags = []
const unverifiedFlags = []
const checkedCount = { checked: 0, needs_review: 0 }
let formulaCount = 0
const printedKeyFlags = []
const numericChoiceReview = []
const keyParseNotices = []
let baselineUnscoredIds = []
let preparedUnscoredIds = []

function loadQuestionContentHelpers() {
  const filename = path.join(root, 'src', 'lib', 'question-content.ts')
  const source = fs.readFileSync(filename, 'utf8')
  const transpiled = typescript.transpileModule(source, {
    compilerOptions: {
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2017,
    },
  })
  const loaded = new Module(filename, module)
  loaded.filename = filename
  loaded.paths = Module._nodeModulePaths(path.dirname(filename))
  loaded._compile(transpiled.outputText, filename)
  return loaded.exports
}

const { validateQuestionBlocks } = loadQuestionContentHelpers()

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function findBaselineRoot() {
  const configured = process.env.MOCK_ORIGINAL_PAPER_JSON_ROOT
  const candidates = [
    configured ? path.resolve(configured) : null,
    path.join(root, 'tmp', 'mock-import', 'native', 'original-paper-json'),
    path.join(root, 'tmp', 'mock-import', 'original-paper-json'),
    path.join(root, 'tmp', 'mock-import', 'paper-json-original'),
  ].filter(Boolean)
  return candidates.find((candidate) => fs.existsSync(path.join(candidate, 'mock-1', 'paper.json')))
}

function protectedMetadata(before, after, label) {
  const mutable = new Set(['prompt', 'options', 'content', 'nativeTranscription'])
  for (const key of Object.keys(before)) {
    if (!mutable.has(key) && !isDeepStrictEqual(before[key], after[key])) {
      issues.push(`${label}: protected metadata changed: ${key}`)
    }
  }
  for (const key of Object.keys(after)) {
    if (!mutable.has(key) && !Object.hasOwn(before, key)) {
      issues.push(`${label}: unexpected metadata field: ${key}`)
    }
  }
}

function textFields(block) {
  const strings = (values) => Array.isArray(values) ? values.filter((value) => typeof value === 'string') : []
  if (block.type === 'math') return []
  if (block.type === 'table') return [...strings([block.text]), ...strings(block.headers), ...strings(Array.isArray(block.rows) ? block.rows.flat() : [])]
  if (block.type === 'list') return [...strings([block.text]), ...strings(block.items)]
  return strings([block.text])
}

function validateFormulaText(text, label) {
  if (typeof text !== 'string') return
  const delimiter = /\\\(([^]*?)\\\)|\\\[([^]*?)\\\]/g
  for (const match of text.matchAll(delimiter)) {
    const source = match[1] ?? match[2] ?? ''
    try {
      katex.renderToString(source, {
        displayMode: match[2] !== undefined,
        output: 'htmlAndMathml',
        strict: 'error',
        throwOnError: true,
        trust: false,
      })
      formulaCount += 1
    } catch (error) {
      issues.push(`${label}: invalid explicit formula ${JSON.stringify(source)} (${error.message})`)
    }
  }
}

function printedAnswer(rationale) {
  if (typeof rationale !== 'string') return null
  const marker = rationale.match(/printed\s+answer\s+key\s*:\s*([\s\S]*)/i)
  if (!marker) return null
  const match = marker[1].match(/(?:^|\n)\s*([A-CАВС])(?:\s*[.):]\s*|\s+)([\s\S]*)/i)
  if (!match) return null
  const letter = match[1].toUpperCase().replace(/[АВС]/g, (value) => ({ А: 'A', В: 'B', С: 'C' })[value])
  return { letter, body: match[2] }
}

function numericTokens(text) {
  if (typeof text !== 'string') return []
  return [...text.matchAll(/(?<![\p{L}\d])[-−]?(?:[$€£₹]\s*)?\(?\d[\d,]*(?:\.\d+)?%?\)?/gu)].map(([token]) => {
    let normalized = token.replace(/\s/g, '').replace(/[$€£₹,]/g, '').replace('−', '-')
    if (normalized.startsWith('(') && normalized.endsWith(')')) normalized = `-${normalized.slice(1, -1)}`
    return normalized
  })
}

function hasNumericMismatch(left, right) {
  if (left.length === 0 || right.length === 0) return false
  const rightSet = new Set(right)
  return !left.some((value) => rightSet.has(value))
}

function validateDisplayText(text, label) {
  if (typeof text !== 'string') return
  if (/\[\s*text cut off in supplied scan\s*\]/i.test(text)) {
    issues.push(`${label}: learner-facing text contains an unresolved scan cutoff`)
  }
  if (/^\s*Question\s+\d+\b/i.test(text)) {
    issues.push(`${label}: printed question heading duplicates the exam navigator`)
  }
  if (/Mahakali\s+Book\s+Centre/i.test(text)) {
    issues.push(`${label}: scan imprint appears in learner-facing text`)
  }
}

function validateQuestion(question, mockId, seenIds) {
  const label = `${mockId} ${question.id ?? '(missing id)'}`
  if (typeof question.id !== 'string' || seenIds.has(question.id)) issues.push(`${label}: missing or duplicate question id`)
  else seenIds.add(question.id)
  for (const field of ['prompt', 'rationale', 'subjectId', 'subject']) {
    if (typeof question[field] !== 'string' || (field === 'prompt' && !question[field].trim())) issues.push(`${label}: ${field} is missing`)
  }
  if (typeof question.prompt === 'string' && question.prompt.length > 10_000) issues.push(`${label}: prompt exceeds the analysis API limit`)
  if (typeof question.rationale === 'string' && question.rationale.length > 10_000) issues.push(`${label}: rationale exceeds the analysis API limit`)
  validateDisplayText(question.prompt, `${label} prompt`)
  for (const [index, option] of (Array.isArray(question.options) ? question.options : []).entries()) {
    validateDisplayText(option, `${label} option ${index + 1}`)
  }

  if (!Array.isArray(question.options) || question.options.length !== 3 || question.options.some((item) => typeof item !== 'string' || !item.trim())) {
    issues.push(`${label}: expected exactly three nonempty answer choices`)
  } else if (question.options.some((option) => /(?:\[\s*(?:missing|unavailable)[^\]]*\]|(?:missing|unavailable)\s+(?:source\s+)?option)/i.test(option)) && question.answerVerified !== false) {
    issues.push(`${label}: placeholder choice must remain unscored (answerVerified=false)`)
  } else if (question.options.some((option) => option.length > 5_000)) {
    issues.push(`${label}: an answer choice exceeds the analysis API limit`)
  }
  if (!Number.isInteger(question.correctIndex) || question.correctIndex < -1 || question.correctIndex > 7 || (question.answerVerified !== false && question.correctIndex >= question.options?.length)) {
    issues.push(`${label}: answer index is invalid for its verification status and choices`)
  }

  const status = question.nativeTranscription?.status
  if (question.nativeTranscription?.version !== 1 || !['checked', 'needs_review'].includes(status) || !Array.isArray(question.nativeTranscription?.notes) || question.nativeTranscription.notes.some((note) => typeof note !== 'string')) {
    issues.push(`${label}: invalid native transcription status or notes`)
  } else {
    checkedCount[status] += 1
    if (status === 'needs_review') {
      nativeFlags.push({ id: question.id, notes: question.nativeTranscription.notes })
      if (!question.nativeTranscription.notes.some((note) => note.trim())) issues.push(`${label}: needs_review must include an explanation`)
    }
  }
  if (question.answerVerified === false) unverifiedFlags.push({ id: question.id, rationale: question.rationale })

  const urls = question.sourceAssetUrls ?? (question.sourceAssetUrl ? [question.sourceAssetUrl] : [])
  if (!Array.isArray(urls) || urls.length === 0 || urls.some((url) => typeof url !== 'string' || !new RegExp(`^/api/mocks/${mockId}/assets/[^/]+$`).test(url))) {
    issues.push(`${label}: source asset URL is missing or invalid`)
  } else {
    for (const url of urls) {
      const asset = path.join(paperRoot, mockId, 'assets', path.basename(url))
      if (!fs.existsSync(asset)) issues.push(`${label}: source asset file is missing: ${url}`)
    }
  }

  const blocks = question.content
  for (const problem of validateQuestionBlocks(blocks)) issues.push(`${label}: ${problem}`)
  if (Array.isArray(blocks)) {
    blocks.forEach((block, index) => {
      if (!block || typeof block !== 'object') return
      const blockLabel = `${label} block ${index + 1}`
      // Inspect the actual rendered blocks as well as the plain-text prompt.
      for (const text of textFields(block)) validateDisplayText(text, blockLabel)
      const isEmptyArray = (value) => Array.isArray(value) && value.length === 0
      if (block.type === 'paragraph' || block.type === 'math') {
        if (!isEmptyArray(block.headers) || !isEmptyArray(block.rows) || !isEmptyArray(block.items)) issues.push(`${blockLabel}: unused block fields must be empty`)
      } else if (block.type === 'table' && !isEmptyArray(block.items)) {
        issues.push(`${blockLabel}: unused block fields must be empty`)
      } else if (block.type === 'list' && (!isEmptyArray(block.headers) || !isEmptyArray(block.rows))) {
        issues.push(`${blockLabel}: unused block fields must be empty`)
      }
      if (typeof block.text === 'string' && block.text.length > 10_000) issues.push(`${blockLabel}: text exceeds the analysis API limit`)
      if (block.type === 'table') {
        if (Array.isArray(block.rows) && block.rows.some((row) => Array.isArray(row) && row.length > 0 && row.every((cell) => typeof cell === 'string' && !cell.trim()))) {
          issues.push(`${blockLabel}: empty table spacer row should be removed`)
        }
        if (Array.isArray(block.headers) && (block.headers.length > 32 || block.headers.some((cell) => typeof cell === 'string' && cell.length > 1_500))) issues.push(`${blockLabel}: table headers exceed the analysis API limits`)
        if (Array.isArray(block.rows) && (block.rows.length > 200 || block.rows.some((row) => Array.isArray(row) && (row.length > 32 || row.some((cell) => typeof cell === 'string' && cell.length > 1_500))))) issues.push(`${blockLabel}: table cells exceed the analysis API limits`)
      }
      if (block.type === 'list' && Array.isArray(block.items) && (block.items.length > 100 || block.items.some((item) => typeof item === 'string' && item.length > 5_000))) issues.push(`${blockLabel}: list items exceed the analysis API limits`)
      if (block.type === 'math') {
        if (typeof block.text !== 'string') return
        try {
          katex.renderToString(block.text, {
            displayMode: true,
            output: 'htmlAndMathml',
            strict: 'error',
            throwOnError: true,
            trust: false,
          })
          formulaCount += 1
        } catch (error) {
          issues.push(`${blockLabel}: invalid standalone formula ${JSON.stringify(block.text)} (${error.message})`)
        }
      } else {
        for (const text of textFields(block)) validateFormulaText(text, blockLabel)
      }
    })
  }
  for (const option of Array.isArray(question.options) ? question.options : []) validateFormulaText(option, `${label} option`)
}

function main() {
  const baselineRoot = findBaselineRoot()
  if (!baselineRoot) issues.push('Original paper JSON backups not found. Set MOCK_ORIGINAL_PAPER_JSON_ROOT to the directory containing mock-1/paper.json through mock-6/paper.json.')

  const catalogPath = path.join(paperRoot, 'catalog.json')
  if (!fs.existsSync(catalogPath)) issues.push('Missing data/imported-mocks/catalog.json')
  const catalog = fs.existsSync(catalogPath) ? readJson(catalogPath) : null
  const entries = Array.isArray(catalog?.mocks) ? catalog.mocks : []
  if (entries.length !== 6) issues.push(`Catalog must contain six papers; found ${entries.length}`)
  if (JSON.stringify(entries.map((entry) => entry.id)) !== JSON.stringify(Array.from({ length: 6 }, (_, index) => `mock-${index + 1}`))) {
    issues.push('Catalog paper IDs must be ordered mock-1 through mock-6')
  }
  const catalogById = new Map(entries.map((entry) => [entry.id, entry]))
  const globalIds = new Set()
  const payloadSizes = []
  const summary = []

  for (let index = 1; index <= 6; index += 1) {
    const mockId = `mock-${index}`
    const paperPath = path.join(paperRoot, mockId, 'paper.json')
    const baselinePath = baselineRoot ? path.join(baselineRoot, mockId, 'paper.json') : null
    if (!fs.existsSync(paperPath)) {
      issues.push(`Missing ${mockId}/paper.json`)
      continue
    }
    const paper = readJson(paperPath)
    const baseline = baselinePath && fs.existsSync(baselinePath) ? readJson(baselinePath) : null
    if (!baseline) issues.push(`${mockId}: original paper JSON backup is missing`)
    if (paper.id !== mockId) issues.push(`${mockId}: paper id is ${JSON.stringify(paper.id)}`)
    if (!Array.isArray(paper.questions)) {
      issues.push(`${mockId}: questions must be an array`)
      continue
    }
    if (paper.questionCount !== paper.questions.length) issues.push(`${mockId}: questionCount does not match the question array`)
    if (paper.sourceUrl !== `/api/mocks/${mockId}/source`) issues.push(`${mockId}: sourceUrl is missing or invalid`)

    const actualOrder = paper.questions.map((question) => question.id)
    if (baseline) {
      const expectedOrder = (baseline.questions ?? []).map((question) => question.id)
      if (JSON.stringify(actualOrder) !== JSON.stringify(expectedOrder)) issues.push(`${mockId}: question IDs, count, or order differ from original backup`)
      for (const key of ['id', 'title', 'questionCount', 'scoredQuestionCount', 'unverifiedQuestionCount', 'sessionCounts', 'ready', 'complete', 'sourceUrl', 'notes']) {
        if (!isDeepStrictEqual(paper[key], baseline[key])) issues.push(`${mockId}: paper metadata changed from original: ${key}`)
      }
      for (let questionIndex = 0; questionIndex < Math.min(paper.questions.length, baseline.questions?.length ?? 0); questionIndex += 1) {
        const before = baseline.questions[questionIndex]
        const after = paper.questions[questionIndex]
        const label = `${mockId} ${actualOrder[questionIndex]}`
        protectedMetadata(before, after, label)
        if (before.answerVerified === false) baselineUnscoredIds.push(before.id)
        if (after.answerVerified === false) preparedUnscoredIds.push(after.id)
        if (after.answerVerified !== false && Number.isInteger(after.correctIndex) && after.correctIndex >= 0) {
          const key = printedAnswer(after.rationale)
          if (key) {
            const expectedLetter = String.fromCharCode(65 + after.correctIndex)
            if (key.letter !== expectedLetter) {
              const flag = { id: after.id, correctIndex: after.correctIndex, rationaleLetter: key.letter }
              printedKeyFlags.push(flag)
              issues.push(`${label}: printed rationale key ${key.letter} disagrees with correctIndex (${expectedLetter})`)
            }
            const nativeOption = after.options?.[after.correctIndex]
            const sourceOption = before.options?.[before.correctIndex]
            const answerNumbers = numericTokens(key.body)
            const nativeNumbers = numericTokens(nativeOption)
            const sourceNumbers = numericTokens(sourceOption)
            const nativeMismatch = hasNumericMismatch(nativeNumbers, answerNumbers)
            if (nativeMismatch) {
              const sourceMismatch = hasNumericMismatch(sourceNumbers, answerNumbers)
              numericChoiceReview.push({
                id: after.id,
                classification: sourceMismatch ? 'pre-existing numeric mismatch' : 'new native-choice numeric mismatch',
                printedAnswer: key.body,
                printedNumbers: answerNumbers,
                sourceCorrectChoice: sourceOption,
                sourceNumbers,
                nativeCorrectChoice: nativeOption,
                nativeNumbers,
              })
            }
          }
          else {
            keyParseNotices.push({ id: after.id, note: 'No standalone printed choice letter could be parsed from the answer-key text.' })
          }
        }
      }
    }

    const sessionCounts = [0, 0]
    for (const question of paper.questions) {
      if ([1, 2].includes(question.sourceSession)) sessionCounts[question.sourceSession - 1] += 1
      else issues.push(`${mockId} ${question.id}: invalid sourceSession`)
      validateQuestion(question, mockId, globalIds)
    }
    if (JSON.stringify(sessionCounts) !== JSON.stringify(paper.sessionCounts)) issues.push(`${mockId}: sessionCounts do not match the actual questions`)
    for (const session of [1, 2]) {
      const numbers = paper.questions.filter((question) => question.sourceSession === session).map((question) => question.sourceQuestionNumber)
      if (numbers.some((number, position) => !Number.isInteger(number) || (position > 0 && number <= numbers[position - 1]))) {
        issues.push(`${mockId}: session ${session} question numbering is missing or out of order`)
      }
    }

    const catalogEntry = catalogById.get(mockId)
    if (!catalogEntry) issues.push(`Catalog is missing ${mockId}`)
    else {
      for (const key of ['id', 'title', 'questionCount', 'scoredQuestionCount', 'unverifiedQuestionCount', 'sessionCounts', 'ready', 'complete', 'sourceUrl', 'notes']) {
        if (JSON.stringify(catalogEntry[key]) !== JSON.stringify(paper[key])) issues.push(`${mockId}: catalog metadata differs from paper.json: ${key}`)
      }
    }

    const analysisAttempt = {
      id: '00000000-0000-4000-8000-000000000000',
      title: paper.title,
      mode: 'full_mock',
      startedAt: '2026-10-17T00:00:00.000Z',
      finishedAt: '2026-10-17T03:00:00.000Z',
      questions: paper.questions.map((question) => ({
        id: question.id,
        prompt: question.prompt,
        options: question.options,
        correctIndex: question.correctIndex,
        rationale: question.rationale,
        subjectId: question.subjectId,
        subject: question.subject,
        topicId: question.topicId,
        topic: question.topic,
        concept: question.concept,
        sourceQuestionNumber: question.sourceQuestionNumber,
        sourceSession: question.sourceSession,
        answerVerified: question.answerVerified,
        content: question.content,
      })),
      answers: Array(paper.questions.length).fill(null),
      flagged: [],
      elapsedSeconds: 10_800,
      questionSeconds: Array(paper.questions.length).fill(0),
      score: 0,
    }
    const attemptJson = JSON.stringify({ attempt: analysisAttempt })
    const payloadBytes = Buffer.byteLength(attemptJson)
    payloadSizes.push({ file: `/api/exam/analyze ${mockId} full_mock`, bytes: payloadBytes, characters: attemptJson.length })
    summary.push({ id: mockId, count: paper.questions.length, sessions: sessionCounts, estimatedAttemptBytes: payloadBytes })
  }

  baselineUnscoredIds.sort()
  preparedUnscoredIds.sort()
  if (baselineRoot && baselineUnscoredIds.length !== 6) issues.push(`Original papers must contain six unscored questions; found ${baselineUnscoredIds.length}`)
  if (JSON.stringify(preparedUnscoredIds) !== JSON.stringify(baselineUnscoredIds)) issues.push('The six pre-existing unscored question IDs changed')

  if (globalIds.size !== 1071) issues.push(`Expected 1071 unique question IDs across six papers; found ${globalIds.size}`)

  payloadSizes.sort((a, b) => b.bytes - a.bytes)
  const maxPayload = payloadSizes[0]
  if (maxPayload && maxPayload.characters >= maxPayloadCharacters) issues.push(`Largest /api/exam/analyze body is ${maxPayload.characters.toLocaleString()} characters, at or above the 3,000,000-character limit (${maxPayload.file})`)

  console.log('Prepared native mock library audit')
  console.log(JSON.stringify({
    papers: summary,
    baseline: baselineRoot ? path.relative(root, baselineRoot) : null,
    nativeTranscription: checkedCount,
    answerUnverifiedCount: unverifiedFlags.length,
    formulaCount,
    largestAnalysisAttempt: maxPayload ? { ...maxPayload, limitCharacters: maxPayloadCharacters } : null,
    nativeNeedsReview: nativeFlags,
    answerUnverified: unverifiedFlags,
    baselineUnscoredIds,
    preparedUnscoredIds,
    printedKeyFlags,
    numericChoiceReview,
    keyParseNotices,
    issueCount: issues.length,
    issues,
  }, null, 2))
  if (issues.length) process.exitCode = 1
}

main()
