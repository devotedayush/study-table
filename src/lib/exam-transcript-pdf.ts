import type { Content, ContentTable, TDocumentDefinitions, TableCell } from 'pdfmake/interfaces'
import { mathjax } from 'mathjax-full/js/mathjax.js'
import { TeX } from 'mathjax-full/js/input/tex.js'
import { SVG } from 'mathjax-full/js/output/svg.js'
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js'
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js'
import 'mathjax-full/js/input/tex/ams/AmsConfiguration.js'
import 'mathjax-full/js/input/tex/newcommand/NewcommandConfiguration.js'
import 'mathjax-full/js/input/tex/boldsymbol/BoldsymbolConfiguration.js'
import { normalizeQuestionBlocks } from './question-content'
import { buildExamTranscript, transcriptFilename, type TranscriptStatus } from './exam-transcript'
import type { ExamAttempt } from './learning-store'

const adaptor = liteAdaptor()
RegisterHTMLHandler(adaptor)
const math = mathjax.document('', {
  InputJax: new TeX({ packages: ['base', 'ams', 'newcommand', 'boldsymbol'], maxBuffer: 20000, maxMacros: 1000 }),
  OutputJax: new SVG({ fontCache: 'none' }),
})
const palette: Record<TranscriptStatus, { color: string; fill: string }> = {
  Correct: { color: '#126044', fill: '#edf8f2' },
  Incorrect: { color: '#a52838', fill: '#fff0f1' },
  Unanswered: { color: '#596270', fill: '#f1f3f6' },
  'Not scored': { color: '#79571c', fill: '#fff7e8' },
}
const WIDTH = 507
const INLINE_MATH = /\\\(([\s\S]+?)\\\)|\\\[([\s\S]+?)\\\]/g

function equation(source: string, maxWidth: number): Content {
  try {
    const container = math.convert(source, { display: true })
    const svg = adaptor.tags(container, 'svg')[0]
    if (!svg) throw new Error('Missing formula output')
    const markup = adaptor.outerHTML(svg)
    if (markup.includes('data-mml-node="merror"')) throw new Error('Unsupported formula')
    const bounds = /viewBox="([^"]+)"/.exec(markup)?.[1].split(/\s+/).map(Number)
    if (!bounds || bounds.length !== 4 || !Number.isFinite(bounds[2]) || bounds[2] <= 0) throw new Error('Invalid formula bounds')
    const width = Math.min(maxWidth, bounds[2] / 1000 * 12)
    const height = bounds[3] / bounds[2] * width
    if (height > 550) throw new Error('Formula too tall to lay out')
    const scaled = markup.replace(/width="[^"]*"/, `width="${width}"`).replace(/height="[^"]*"/, `height="${height}"`).replace(/currentColor/g, '#172f43')
    return { svg: scaled, width, margin: [0, 4, 0, 6] }
  } catch {
    // Preserve the supplied expression if it cannot be typeset; never silently drop it.
    return { text: `Formula as supplied: ${source}`, fontSize: 9, color: '#79571c', margin: [0, 3, 0, 5] }
  }
}

function rich(text: string, maxWidth = WIDTH): Content[] {
  const result: Content[] = []
  let last = 0
  for (const match of text.matchAll(INLINE_MATH)) {
    const before = text.slice(last, match.index).trim()
    if (before) result.push({ text: before, margin: [0, 0, 0, 4] })
    const end = (match.index ?? 0) + match[0].length
    const punctuation = /^[.,;:!?](?=\s|$)/.exec(text.slice(end))?.[0] ?? ''
    result.push(equation((match[1] ?? match[2]) + punctuation, maxWidth))
    last = end + punctuation.length
  }
  const rest = text.slice(last).trim()
  if (rest) result.push({ text: rest, margin: [0, 0, 0, 4] })
  return result.length ? result : [{ text: '' }]
}

function questionBody(attempt: ReturnType<typeof buildExamTranscript>['questions'][number]): Content[] {
  const blocks = normalizeQuestionBlocks(attempt.question.content)
  if (!blocks.length) return rich(attempt.question.prompt)
  return blocks.flatMap((block): Content[] => {
    if (block.type === 'math') return [equation(block.text, WIDTH)]
    if (block.type === 'list') return [
      ...rich(block.text),
      { ul: block.items.map(item => ({ stack: rich(item, WIDTH - 18) })), margin: [0, 0, 0, 7] },
    ]
    if (block.type === 'table') {
      const columns = Math.max(block.headers.length, block.rows[0]?.length ?? 0)
      const cellWidth = WIDTH / Math.max(columns, 1) - 13
      const row = (cells: string[], header = false): TableCell[] => cells.map(value => ({ stack: rich(value, cellWidth), ...(header ? { bold: true, fillColor: '#edf2f6' } : {}), margin: [3, 4, 3, 4] }))
      // Wide source tables are retained row-by-row rather than compressed into illegible columns.
      if (columns > 6) return [
        ...rich(block.text),
        ...block.rows.map((cells, index): Content => ({
          stack: [{ text: `Table row ${index + 1}`, bold: true }, ...cells.flatMap((value, column) => rich(`${block.headers[column] || `Column ${column + 1}`}: ${value}`))],
          margin: [0, 3, 0, 7],
        })),
      ]
      const table: ContentTable = {
        table: { headerRows: block.headers.length ? 1 : 0, widths: Array(columns).fill('*'), body: [...(block.headers.length ? [row(block.headers, true)] : []), ...block.rows.map(cells => row(cells))] },
        layout: { hLineColor: () => '#d9e0e7', vLineColor: () => '#d9e0e7', hLineWidth: () => 0.5, vLineWidth: () => 0.5 },
        margin: [0, 4, 0, 9], fontSize: 9,
      }
      return [...rich(block.text), table]
    }
    return rich(block.text)
  })
}

export function buildTranscriptPdfDefinition(attempt: ExamAttempt, sourceImages: Record<string, string[]> = {}): TDocumentDefinitions {
  const transcript = buildExamTranscript(attempt)
  const completed = new Date(attempt.finishedAt)
  const date = Number.isFinite(completed.getTime()) ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(completed) + ' IST' : attempt.finishedAt
  const elapsed = Math.max(0, Math.round(attempt.elapsedSeconds))
  const content: Content[] = [
    { text: 'STUDY TABLE / EXAM TRANSCRIPT', fontSize: 9, bold: true, color: '#416176', characterSpacing: 1.2, margin: [0, 0, 0, 12] },
    { text: attempt.title, fontSize: 23, bold: true, color: '#163d54', margin: [0, 0, 0, 8] },
    { text: `Completed ${date}`, color: '#596270', margin: [0, 0, 0, 5] },
    { text: `${attempt.questions.length} questions  |  Time used: ${Math.floor(elapsed / 60)}m ${elapsed % 60}s`, color: '#596270', margin: [0, 0, 0, 16] },
    { table: { widths: ['*', '*', '*', '*'], body: [[
      { text: `CORRECT\n${transcript.counts.correct}`, color: palette.Correct.color, fillColor: palette.Correct.fill },
      { text: `INCORRECT\n${transcript.counts.incorrect}`, color: palette.Incorrect.color, fillColor: palette.Incorrect.fill },
      { text: `UNANSWERED\n${transcript.counts.unanswered}`, color: palette.Unanswered.color, fillColor: palette.Unanswered.fill },
      { text: `NOT SCORED\n${transcript.counts.unscored}`, color: palette['Not scored'].color, fillColor: palette['Not scored'].fill },
    ].map(cell => ({ ...cell, bold: true, margin: [8, 9, 8, 9], fontSize: 10 }))] }, layout: 'noBorders', margin: [0, 0, 0, 12] },
    { text: transcript.percent === null ? 'Score: unavailable - no verified answer keys.' : `Paper score: ${transcript.percent}% (${transcript.counts.correct}/${transcript.scored} scored questions). Skipped scored questions count toward this denominator.`, margin: [0, 0, 0, 6] },
    { text: 'All questions from this completed attempt are included in their original attempt order. Unverified answer keys are never marked correct or incorrect.', fontSize: 9, color: '#596270', margin: [0, 0, 0, 22] },
  ]
  for (const item of transcript.questions) {
    const questionStart = content.length
    const { question } = item
    const theme = palette[item.status]
    const original = question.sourceQuestionNumber ? ` | Original Q${question.sourceQuestionNumber}` : ''
    const session = question.sourceSession ? ` | Session ${question.sourceSession}` : ''
    content.push(
      { id: `question-${item.number}`, headlineLevel: 1, text: `QUESTION ${item.number}${session}${original}  /  ${item.status.toUpperCase()}`, bold: true, fontSize: 11, color: theme.color, margin: [0, 12, 0, 5] },
      { text: [question.subject, question.topic].filter(Boolean).join(' / '), fontSize: 9, color: '#596270', margin: [0, 0, 0, 8] },
      ...questionBody(item),
    )
    const images = sourceImages[question.id] ?? []
    if (images.length) content.push({ text: 'ORIGINAL SOURCE CROP', fontSize: 8, bold: true, color: '#596270', margin: [0, 5, 0, 4] }, ...images.map((image): Content => ({ image, fit: [WIDTH, 440], margin: [0, 0, 0, 8] })))
    if (question.nativeTranscription?.status === 'needs_review') content.push({ text: `Source text needs review: ${question.nativeTranscription.notes.join(' ') || 'Some source text could not be verified.'}`, fontSize: 9, color: '#79571c', margin: [0, 4, 0, 7] })
    if (!images.length && (question.sourceAssetUrl || question.sourceAssetUrls?.length) && (question.nativeTranscription?.status === 'needs_review' || !question.content?.length)) content.push({ text: 'Source crop was unavailable for export. Consult the original paper for any text or figure missing from this saved question.', fontSize: 9, color: '#79571c', margin: [0, 3, 0, 7] })
    const optionRows: TableCell[][] = question.options.map((option, index) => {
      const selected = item.submittedIndex === index
      const correct = item.correctIndex === index
      const color = correct ? palette.Correct.color : selected && item.status === 'Incorrect' ? palette.Incorrect.color : '#263b49'
      const fillColor = correct ? palette.Correct.fill : selected ? theme.fill : '#ffffff'
      return [
        { text: `${String.fromCharCode(65 + index)}.`, bold: true, color, fillColor, margin: [4, 6, 0, 6] },
        { stack: [...(selected || correct ? [{ text: [selected && 'YOUR ANSWER', correct && 'CORRECT ANSWER'].filter(Boolean).join(' / '), bold: true, color, fontSize: 8, margin: [0, 0, 0, 4] } as Content] : []), ...rich(option, WIDTH - 56)], fillColor, margin: [4, 6, 4, 6] },
      ]
    })
    content.push(
      { table: { widths: [24, '*'], body: optionRows }, layout: { hLineColor: () => '#d9e0e7', vLineWidth: () => 0, hLineWidth: () => 0.5 }, margin: [0, 5, 0, 7] },
      { text: `Your answer: ${item.submittedIndex === null ? 'No answer submitted' : String.fromCharCode(65 + item.submittedIndex)}  |  Correct answer: ${item.correctIndex === null ? 'Unverified / not available' : String.fromCharCode(65 + item.correctIndex)}${item.flagged ? '  |  Flagged for review' : ''}`, fontSize: 9, bold: true, color: theme.color, margin: [0, 0, 0, 7] },
    )
    if (item.correctIndex !== null && question.rationale) content.push({ text: 'EXPLANATION', bold: true, fontSize: 8, color: '#416176', margin: [0, 1, 0, 4] }, ...rich(question.rationale))
    if (item.correctIndex === null) content.push({ text: question.unscoredReason || 'The answer key is unavailable or unverified; this question is excluded from the score.', color: '#79571c', fontSize: 9, margin: [0, 0, 0, 6] })
    content.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: WIDTH, y2: 0, lineWidth: 0.6, lineColor: '#d9e0e7' }], margin: [0, 8, 0, 5] })
    const textLength = [question.prompt, ...question.options, question.rationale, ...normalizeQuestionBlocks(question.content).map(block => block.text)].join(' ').length
    const formulaHeight = (value: unknown): number => {
      if (Array.isArray(value)) return value.reduce((sum, node) => sum + formulaHeight(node), 0)
      if (!value || typeof value !== 'object') return 0
      const node = value as Record<string, unknown>
      return typeof node.svg === 'string'
        ? Number(/height="([\d.]+)"/.exec(node.svg)?.[1] ?? 0)
        : Object.values(node).reduce<number>((sum, child) => sum + formulaHeight(child), 0)
    }
    const nodes = content.slice(questionStart)
    // Keep short questions with their complete option list. Long questions and
    // tables remain breakable so no content can be clipped by an oversized block.
    if (textLength <= 650 && !question.content?.some(block => block.type === 'table') && !images.length && formulaHeight(nodes) <= 120) {
      content.splice(questionStart, nodes.length, { stack: nodes, unbreakable: true })
    }
  }
  return {
    pageSize: 'A4', pageMargins: [44, 42, 44, 48],
    defaultStyle: { font: 'Roboto', fontSize: 10, lineHeight: 1.22, color: '#263b49' },
    info: { title: `${attempt.title} - Exam transcript`, author: 'Study Table', subject: 'Completed practice attempt with submitted answers and verified results' },
    content,
    footer: (page, pages) => ({ text: `Study Table | Personal practice transcript | ${page} / ${pages}`, fontSize: 8, color: '#687786', margin: [44, 16, 44, 0] }),
    pageBreakBefore: (node, following) => node.headlineLevel === 1 && following.length === 0,
  }
}

export async function createExamTranscriptPdf(attempt: ExamAttempt): Promise<Blob> {
  const [{ default: pdfMake }, { default: fonts }] = await Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts')])
  const images: Record<string, string[]> = {}
  const candidates = attempt.questions.filter(question => question.nativeTranscription?.status === 'needs_review' || !question.content?.length)
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(4, candidates.length) }, async () => {
    while (cursor < candidates.length) {
      const question = candidates[cursor++]
      const urls = [...new Set(question.sourceAssetUrls ?? (question.sourceAssetUrl ? [question.sourceAssetUrl] : []))].filter(url => /^\/api\/mocks\/mock-[1-6]\/assets\/[a-z0-9-]+\.jpg$/.test(url))
      images[question.id] = []
      for (const url of urls) {
        try {
          const response = await fetch(url, { credentials: 'same-origin', signal: AbortSignal.timeout(15000) })
          if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) continue
          const blob = await response.blob()
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(String(reader.result))
            reader.onerror = () => reject(new Error('Source crop could not be read'))
            reader.readAsDataURL(blob)
          })
          images[question.id].push(dataUrl)
        } catch { /* The transcript explicitly labels an unavailable source crop. */ }
      }
    }
  }))
  const definition = buildTranscriptPdfDefinition(attempt, images)
  return new Promise<Blob>((resolve, reject) => {
    // Embedded fonts and SVGs need no URL resolver. Using the stream also catches
    // generation errors instead of leaving the download button waiting forever.
    const stream = pdfMake.createPdf(definition, undefined, undefined, fonts as unknown as Record<string, string>).getStream()
    const chunks: Uint8Array<ArrayBuffer>[] = []
    stream.on('data', (chunk: Uint8Array) => chunks.push(new Uint8Array(chunk)))
    stream.on('error', reject)
    stream.on('end', () => resolve(new Blob(chunks, { type: 'application/pdf' })))
    stream.end()
  })
}

export async function downloadExamTranscript(attempt: ExamAttempt) {
  const blob = await createExamTranscriptPdf(attempt)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = transcriptFilename(attempt)
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}
