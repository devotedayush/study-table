/* Validates private Terra-authored batches, binds them to source hashes and emits
   escaped, bounded SQL batches for the authenticated Supabase MCP importer.
   Private question/explanation content must never be committed to Git. */
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const ts = require('typescript')
const katex = require('katex')
const root = path.join(__dirname, '..')
const code = ts.transpileModule(fs.readFileSync(path.join(root, 'src/lib/mock-explanation.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const helpers = {}
new Function('exports', code)(helpers)
const folder = path.join(root, 'data/mock-explanations')
const partial = process.argv.includes('--partial')
const sqlBatch = process.argv.find(arg => arg.startsWith('--sql-batch='))
const rows = [], coverage = [], cautions = [], errors = []
let formulaCount = 0
for (let n = 1; n <= 6; n++) {
  const mockId = `mock-${n}`
  const paper = JSON.parse(fs.readFileSync(path.join(root, `data/imported-mocks/${mockId}/paper.json`), 'utf8'))
  const file = path.join(folder, `${mockId}.json`)
  const entries = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : []
  if (!Array.isArray(entries)) throw new Error(`${mockId}: expected an array`)
  const byId = new Map(paper.questions.map(q => [q.id, q]))
  const seen = new Set()
  for (const item of entries) {
    const q = byId.get(item.questionId)
    if (!q || seen.has(item.questionId)) { errors.push(`${mockId}: unknown or duplicate ID ${item.questionId}`); continue }
    seen.add(q.id)
    const explanation = helpers.normalizeMockExplanation(item, q)
    if (!explanation) { errors.push(`${q.id}: invalid shape, empty text or incomplete option coverage`); continue }
    const words = [explanation.intuition, explanation.reasoning, ...explanation.options.map(o => o.explanation), explanation.learningHack].join(' ').split(/\s+/).length
    if (words < 100) errors.push(`${q.id}: only ${words} words; requires substantive reasoning`)
    if (q.answerVerified === false && !explanation.caution) errors.push(`${q.id}: unverified key requires a source caution`)
    if (q.nativeTranscription?.status === 'needs_review' && !explanation.caution) errors.push(`${q.id}: source text needs review and requires a caution`)
    for (const text of [explanation.intuition, explanation.reasoning, ...explanation.options.map(option => option.explanation), explanation.learningHack, explanation.caution ?? '']) {
      for (const match of text.matchAll(/\\\(([\s\S]+?)\\\)|\\\[([\s\S]+?)\\\]/g)) {
        try { katex.renderToString(match[1] ?? match[2], { throwOnError: true, strict: 'error', trust: false }); formulaCount++ }
        catch (error) { errors.push(`${q.id}: invalid LaTeX: ${error.message}`) }
      }
    }
    if (explanation.caution) cautions.push({ questionId: q.id, caution: explanation.caution })
    rows.push({ question_id: q.id, mock_id: mockId, source_hash: crypto.createHash('sha256').update(helpers.explanationSource(q)).digest('hex'), explanation, model: 'gpt-6.1-terra', reasoning_effort: 'medium' })
  }
  if (!partial && seen.size !== paper.questions.length) errors.push(`${mockId}: ${seen.size}/${paper.questions.length} explained`)
  coverage.push({ mockId, explained: seen.size, total: paper.questions.length })
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1) }
if (sqlBatch) {
  const index = Number(sqlBatch.split('=')[1])
  if (!Number.isInteger(index) || index < 0) throw new Error('Invalid batch index')
  const batch = rows.slice(index * 20, (index + 1) * 20)
  if (!batch.length) throw new Error('Empty SQL batch')
  const literal = JSON.stringify(batch).replace(/'/g, "''")
  process.stdout.write(`insert into public.mock_question_explanations(question_id,mock_id,source_hash,explanation,model,reasoning_effort) select question_id,mock_id,source_hash,explanation,model,reasoning_effort from jsonb_to_recordset('${literal}'::jsonb) as x(question_id text,mock_id text,source_hash text,explanation jsonb,model text,reasoning_effort text) on conflict(question_id) do update set source_hash=excluded.source_hash, explanation=excluded.explanation, model=excluded.model, reasoning_effort=excluded.reasoning_effort, updated_at=now();`)
} else {
  fs.mkdirSync(folder, { recursive: true })
  fs.writeFileSync(path.join(folder, 'prepared.json'), JSON.stringify(rows, null, 2))
  fs.writeFileSync(path.join(folder, 'cautions.json'), JSON.stringify(cautions, null, 2))
  console.log(JSON.stringify({ complete: !partial, total: rows.length, batches: Math.ceil(rows.length / 20), cautions: cautions.length, formulaCount, coverage }, null, 2))
}
