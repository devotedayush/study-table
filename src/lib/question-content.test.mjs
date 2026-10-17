import assert from 'node:assert/strict'
import fs from 'node:fs'
import Module from 'node:module'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import typescript from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
require.extensions['.css'] ??= () => {}

function loadTypeScript(relativePath) {
  const filename = path.resolve(process.cwd(), relativePath)
  const source = fs.readFileSync(filename, 'utf8')
  const transpiled = typescript.transpileModule(source, {
    compilerOptions: {
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2022,
      jsx: typescript.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  })
  const loaded = new Module(filename)
  loaded.filename = filename
  loaded.paths = Module._nodeModulePaths(path.dirname(filename))
  loaded._compile(transpiled.outputText, filename)
  return loaded.exports
}

const content = loadTypeScript('src/lib/question-content.ts')
const renderer = loadTypeScript('src/components/question-content.tsx')

function render(node) {
  return renderToStaticMarkup(node)
}

test('currency and percentages remain ordinary text unless explicitly delimited', () => {
  const html = render(React.createElement(renderer.InlineQuestionText, {
    text: 'Revenue was $1.25 million and the return was 5%.',
  }))

  assert.match(html, /\$1\.25 million/)
  assert.match(html, /5%/)
  assert.doesNotMatch(html, /<math|katex/)
})

test('renders an explicit inline fraction as accessible MathML', () => {
  const html = render(React.createElement(renderer.InlineQuestionText, {
    text: 'The ratio is \\(\\frac{1}{2}\\).',
  }))

  assert.match(html, /<math/)
  assert.match(html, /<mfrac>/)
})

test('renders explicit display delimiters and keeps invalid TeX readable', () => {
  const display = render(React.createElement(renderer.InlineQuestionText, {
    text: String.raw`Value: \[x^2\]`,
  }))
  assert.match(display, /<math[^>]*display="block"/)
  assert.match(display, /<msup>/)

  const invalid = render(React.createElement(renderer.InlineQuestionText, {
    text: String.raw`Keep this \(\notARealCfaCommand{x}\) readable`,
  }))
  assert.match(invalid, /\\notARealCfaCommand\{x\}/)
})

test('escapes ordinary HTML-like text and keeps untrusted TeX from creating links', () => {
  const plain = render(React.createElement(renderer.InlineQuestionText, {
    text: '<img src=x onerror=alert(1)>',
  }))
  assert.match(plain, /&lt;img/)
  assert.doesNotMatch(plain, /<img/)

  const formula = render(React.createElement(renderer.InlineQuestionText, {
    text: String.raw`\(\href{javascript:alert(1)}{open}\)`,
  }))
  assert.doesNotMatch(formula, /href="javascript:/i)
  assert.match(formula, /javascript:alert\(1\)/)
})

test('validates ragged tables and pads cells without dropping source content', () => {
  const source = [{
    type: 'table', text: 'Balances', headers: ['Year', 'Assets'],
    rows: [['2025', '$100'], ['2024']], items: [],
  }]
  assert.match(content.validateQuestionBlocks(source).join(' '), /row 2 has 1 cells; expected 2/)

  const [normalized] = content.normalizeQuestionBlocks(source)
  assert.deepEqual(normalized.rows, [['2025', '$100'], ['2024', '']])
  const html = render(React.createElement(renderer.QuestionContent, { blocks: [normalized] }))
  assert.match(html, /<caption\b/)
  assert.equal((html.match(/<th\b[^>]*scope="col"/g) ?? []).length, 2)
  assert.equal((html.match(/<td\b/g) ?? []).length, 4)
})

test('supports rectangular headerless tables with accessible row headers', () => {
  const blocks = [{ type: 'table', text: '', headers: [], rows: [['Assets', '$100'], ['Debt', '$40']], items: [] }]
  assert.deepEqual(content.validateQuestionBlocks(blocks), [])

  const html = render(React.createElement(renderer.QuestionContent, {
    blocks: content.normalizeQuestionBlocks(blocks),
  }))
  assert.equal((html.match(/scope="row"/g) ?? []).length, 2)
  assert.equal((html.match(/<td\b/g) ?? []).length, 2)
})

test('rejects empty content and preserves table/list order in plain text', () => {
  assert.match(content.validateQuestionBlocks([]).join(' '), /at least one block/)
  assert.match(content.validateQuestionBlocks([
    { type: 'paragraph', text: '  ', headers: [], rows: [], items: [] },
  ]).join(' '), /paragraph must contain text/)
  const blocks = [
    { type: 'paragraph', text: 'Opening', headers: [], rows: [], items: [] },
    { type: 'table', text: 'Returns', headers: ['Year', 'Rate'], rows: [['2025', '$1.25']], items: [] },
    { type: 'list', text: 'Notes', headers: [], rows: [], items: ['First', 'Second'] },
  ]
  assert.equal(content.serializeQuestionBlocksPlaintext(blocks), 'Opening\n\nReturns\nYear\tRate\n2025\t$1.25\n\nNotes\n• First\n• Second')
})
