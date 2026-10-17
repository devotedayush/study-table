/** Source-faithful exam content. Inline mathematics uses \\( ... \\), never currency dollars. */
export type QuestionBlock = {
  type: 'paragraph' | 'table' | 'math' | 'list'
  text: string
  headers: string[]
  rows: string[][]
  items: string[]
}

export type NativeTranscription = {
  version: 1
  status: 'checked' | 'needs_review'
  notes: string[]
}

const QUESTION_BLOCK_TYPES = new Set<QuestionBlock['type']>(['paragraph', 'table', 'math', 'list'])

/** Return structural issues without interpreting or rewriting source wording. */
export function validateQuestionBlocks(value: unknown): string[] {
  if (!Array.isArray(value)) return ['Question content must be an array.']
  if (value.length === 0) return ['Question content must contain at least one block.']

  const errors: string[] = []
  value.forEach((candidate, blockIndex) => {
    const prefix = `Block ${blockIndex + 1}`
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      errors.push(`${prefix} must be an object.`)
      return
    }

    const block = candidate as Record<string, unknown>
    if (!QUESTION_BLOCK_TYPES.has(block.type as QuestionBlock['type'])) {
      errors.push(`${prefix} has an unsupported type.`)
      return
    }
    if (typeof block.text !== 'string') errors.push(`${prefix} text must be a string.`)
    if (block.type === 'paragraph' && typeof block.text === 'string' && !block.text.trim()) {
      errors.push(`${prefix} paragraph must contain text.`)
    }
    if (block.type === 'math' && typeof block.text === 'string' && !block.text.trim()) {
      errors.push(`${prefix} formula must contain text.`)
    }

    if (block.type === 'table') {
      if (!Array.isArray(block.headers) || !block.headers.every((cell) => typeof cell === 'string')) {
        errors.push(`${prefix} table headers must be an array of strings.`)
      }
      if (!Array.isArray(block.rows) || !block.rows.every((row) => Array.isArray(row) && row.every((cell) => typeof cell === 'string'))) {
        errors.push(`${prefix} table rows must be arrays of strings.`)
      }
      if (Array.isArray(block.headers) && Array.isArray(block.rows)) {
        if (block.rows.length === 0) errors.push(`${prefix} table must contain at least one row.`)
        const firstRow = block.rows.find(Array.isArray) as unknown[] | undefined
        const width = block.headers.length || firstRow?.length || 0
        if (width === 0) errors.push(`${prefix} table must contain at least one column.`)
        block.rows.forEach((row, rowIndex) => {
          if (Array.isArray(row) && row.length !== width) {
            errors.push(`${prefix} table row ${rowIndex + 1} has ${row.length} cells; expected ${width}.`)
          }
        })
      }
    }

    if (block.type === 'list') {
      if (!Array.isArray(block.items) || !block.items.every((item) => typeof item === 'string')) {
        errors.push(`${prefix} list items must be an array of strings.`)
      } else if (block.items.length === 0 || block.items.every((item) => !item.trim())) {
        errors.push(`${prefix} list must contain at least one nonempty item.`)
      }
    }
  })

  return errors
}

/** Convert unknown persisted content to safe, renderable blocks while retaining every string cell. */
export function normalizeQuestionBlocks(value: unknown): QuestionBlock[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((candidate): QuestionBlock[] => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return []
    const source = candidate as Record<string, unknown>
    if (!QUESTION_BLOCK_TYPES.has(source.type as QuestionBlock['type'])) return []
    const text = typeof source.text === 'string' ? source.text : ''
    if (source.type === 'table') {
      const headers = stringArray(source.headers)
      const rows = Array.isArray(source.rows)
        ? source.rows.map((row) => stringArray(row))
        : []
      const width = Math.max(headers.length, ...rows.map((row) => row.length), 0)
      return [{
        type: 'table',
        text,
        headers: headers.length ? padCells(headers, width) : [],
        rows: rows.map((row) => padCells(row, width)),
        items: [],
      }]
    }
    if (source.type === 'list') {
      return [{ type: 'list', text, headers: [], rows: [], items: stringArray(source.items) }]
    }
    return [{ type: source.type as 'paragraph' | 'math', text, headers: [], rows: [], items: [] }]
  })
}

/** Plain text for search and model context; formulas remain literal source text. */
export function serializeQuestionBlocksPlaintext(blocks: QuestionBlock[]): string {
  return blocks.map((block) => {
    if (block.type === 'table') {
      const lines = [
        ...(block.headers.length ? [block.headers.join('\t')] : []),
        ...block.rows.map((row) => row.join('\t')),
      ]
      return [block.text, ...lines].filter(Boolean).join('\n')
    }
    if (block.type === 'list') {
      return [block.text, ...block.items.map((item) => `• ${item}`)].filter(Boolean).join('\n')
    }
    return block.text
  }).filter(Boolean).join('\n\n')
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => (typeof item === 'string' ? item : '')) : []
}

function padCells(cells: string[], width: number): string[] {
  return Array.from({ length: width }, (_, index) => cells[index] ?? '')
}
