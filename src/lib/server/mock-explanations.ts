import 'server-only'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { ExamQuestion } from '@/lib/learning-store'
import { explanationSource, normalizeMockExplanation } from '@/lib/mock-explanation'
import { createClient } from '@/lib/supabase/server'

export async function attachMockExplanations(questions: ExamQuestion[], mockId: string, local: boolean): Promise<ExamQuestion[]> {
  if (!/^mock-[1-6]$/.test(mockId)) return questions
  const hashes = new Map(questions.map(question => [question.id, createHash('sha256').update(explanationSource(question)).digest('hex')]))
  let rows: { question_id: string; source_hash: string; explanation: unknown }[] = []
  if (local) {
    try {
      const prepared = JSON.parse(await readFile(path.join(process.cwd(), 'data/mock-explanations/prepared.json'), 'utf8')) as typeof rows
      rows = prepared.filter(row => hashes.has(row.question_id))
    } catch { /* Published data below remains the fallback for authenticated local users. */ }
  }
  if (!rows.length) {
    const supabase = await createClient()
    const { data, error } = await supabase.from('mock_question_explanations').select('question_id, source_hash, explanation').eq('mock_id', mockId).limit(200)
    if (error) {
      console.warn('Mock explanations could not be loaded:', error.code)
      return questions
    }
    rows = data ?? []
  }
  const byId = new Map(rows.map(row => [row.question_id, row]))
  return questions.map(question => {
    const row = byId.get(question.id)
    if (!row || row.source_hash !== hashes.get(question.id)) return question
    const explanation = normalizeMockExplanation(row.explanation, question)
    return explanation ? { ...question, explanation } : question
  })
}
