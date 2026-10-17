import katex from 'katex'
import 'katex/dist/katex.min.css'
import type { QuestionBlock } from '@/lib/question-content'

type InlineSegment = { kind: 'text'; value: string } | { kind: 'math'; value: string; display: boolean; source: string }

const INLINE_MATH = /\\\(([\s\S]+?)\\\)|\\\[([\s\S]+?)\\\]/g

function splitInlineMath(text: string): InlineSegment[] {
  const segments: InlineSegment[] = []
  let lastIndex = 0
  for (const match of text.matchAll(INLINE_MATH)) {
    const index = match.index ?? 0
    if (index > lastIndex) segments.push({ kind: 'text', value: text.slice(lastIndex, index) })
    const display = match[2] !== undefined
    const value = match[1] ?? match[2] ?? ''
    segments.push({ kind: 'math', value, display, source: match[0] })
    lastIndex = index + match[0].length
  }
  if (lastIndex < text.length) segments.push({ kind: 'text', value: text.slice(lastIndex) })
  return segments.length ? segments : [{ kind: 'text', value: text }]
}

function renderMath(source: string, displayMode: boolean): string | null {
  try {
    return katex.renderToString(source, {
      displayMode,
      output: 'htmlAndMathml',
      strict: 'error',
      throwOnError: true,
      trust: false,
    })
  } catch {
    return null
  }
}

/** Render only explicit \(...\) and \[...\] math; all other text stays literal React text. */
export function InlineQuestionText({ text, className }: { text: string; className?: string }) {
  return (
    <span className={className}>
      {splitInlineMath(text).map((segment, index) => {
        if (segment.kind === 'text') return <span key={index}>{segment.value}</span>
        const html = renderMath(segment.value, segment.display)
        return html ? (
          <span
            key={index}
            className={segment.display ? 'my-1 block max-w-full overflow-x-auto align-middle' : 'inline-block max-w-full overflow-x-auto align-middle'}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <span key={index} className="font-mono" aria-label={`Unrendered formula: ${segment.value}`}>
            {segment.source}
          </span>
        )
      })}
    </span>
  )
}

function QuestionBlockView({ block }: { block: QuestionBlock }) {
  if (block.type === 'math') {
    const html = renderMath(block.text, true)
    return (
      <div className="my-3 max-w-full overflow-x-auto" aria-label="Mathematical expression">
        {html ? (
          <div dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <pre className="whitespace-pre-wrap font-mono">{block.text}</pre>
        )}
      </div>
    )
  }

  if (block.type === 'table') {
    const hasHeaders = block.headers.some((header) => header.length > 0)
    return (
      <div className="my-4 max-w-full overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full border-collapse text-left text-sm">
          {block.text ? <caption className="px-3 py-2 text-left text-slate-600"><InlineQuestionText text={block.text} /></caption> : null}
          {hasHeaders ? (
            <thead className="bg-slate-50">
              <tr>
                {block.headers.map((header, index) => (
                  <th key={index} scope="col" className="whitespace-nowrap border-b border-slate-200 px-3 py-2 font-semibold">
                    <InlineQuestionText text={header} />
                  </th>
                ))}
              </tr>
            </thead>
          ) : null}
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b border-slate-100 last:border-0">
                {row.map((cell, cellIndex) => {
                  const Cell = !hasHeaders && cellIndex === 0 ? 'th' : 'td'
                  return (
                    <Cell key={cellIndex} {...(!hasHeaders && cellIndex === 0 ? { scope: 'row' as const } : {})} className="min-w-24 px-3 py-2 align-top">
                      <InlineQuestionText text={cell} />
                    </Cell>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (block.type === 'list') {
    return (
      <div className="my-2">
        {block.text ? <p className="whitespace-pre-wrap"><InlineQuestionText text={block.text} /></p> : null}
        <ul className="my-2 list-disc space-y-1 pl-6">
          {block.items.map((item, index) => <li key={index}><InlineQuestionText text={item} /></li>)}
        </ul>
      </div>
    )
  }

  return <p className="my-2 whitespace-pre-wrap"><InlineQuestionText text={block.text} /></p>
}

export function QuestionContent({ blocks, className }: { blocks: QuestionBlock[]; className?: string }) {
  return (
    <div className={className}>
      {blocks.map((block, index) => <QuestionBlockView key={`${block.type}-${index}`} block={block} />)}
    </div>
  )
}
