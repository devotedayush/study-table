'use client'

import { useMemo } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

function toTeX(source: string) {
  return source
    .replace(/\u2013|\u2014/g, '-')
    .replace(/\bapproximately\b/gi, '\\approx')
    .replace(/×/g, '\\times ')
    .replace(/÷/g, '\\div ')
    .replace(/≈/g, '\\approx ')
    .replace(/\^\(([^()]+)\)/g, '^{$1}')
    .replace(/_\(([^()]+)\)/g, '_{$1}')
    .replace(/\bsqrt\(([^()]+)\)/gi, '\\sqrt{$1}')
}

export function KatexFormula({
  source,
  displayMode = false,
  className,
}: {
  source: string
  displayMode?: boolean
  className?: string
}) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(toTeX(source), {
        throwOnError: false,
        displayMode,
        output: 'html',
        strict: 'ignore',
      })
    } catch {
      return null
    }
  }, [source, displayMode])

  if (!html) {
    return <span className={className}>{source}</span>
  }

  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />
}

function looksLikeFormula(line: string) {
  const trimmed = line.trim()
  if (!trimmed) return false
  if (/[=≈≥≤><]/.test(trimmed)) return true
  if (/\w[\^_]\w/.test(trimmed)) return true
  if (/\\[a-zA-Z]+/.test(trimmed)) return true
  return false
}

export function MathText({ text, className }: { text: string; className?: string }) {
  const segments: Array<{ type: 'math' | 'text'; value: string; display?: boolean }> = []

  const dollarRegex = /(\$\$[^$]+\$\$|\$[^$]+\$)/g
  const parts = text.split(dollarRegex)

  for (const part of parts) {
    if (!part) continue
    if (part.startsWith('$$') && part.endsWith('$$')) {
      segments.push({ type: 'math', value: part.slice(2, -2), display: true })
    } else if (part.startsWith('$') && part.endsWith('$')) {
      segments.push({ type: 'math', value: part.slice(1, -1), display: false })
    } else {
      const hasDollar = part.includes('$')
      if (!hasDollar) {
        const lines = part.split('\n')
        for (const line of lines) {
          if (looksLikeFormula(line)) {
            segments.push({ type: 'math', value: line, display: true })
          } else if (line.trim().length > 0) {
            segments.push({ type: 'text', value: line })
          }
        }
      } else {
        segments.push({ type: 'text', value: part })
      }
    }
  }

  return (
    <div className={className}>
      {segments.map((segment, index) =>
        segment.type === 'math' ? (
          <div key={index} className="my-1 overflow-x-auto">
            <KatexFormula source={segment.value} displayMode={segment.display ?? true} />
          </div>
        ) : (
          <p key={index} className="my-1 whitespace-pre-wrap">
            {segment.value}
          </p>
        ),
      )}
    </div>
  )
}
