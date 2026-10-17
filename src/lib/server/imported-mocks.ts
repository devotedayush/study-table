import 'server-only'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@/lib/supabase/server'
import type { ExamQuestion } from '@/lib/learning-store'

export type ImportedMock = {
  id: string; title: string; questionCount: number; scoredQuestionCount?: number; unverifiedQuestionCount?: number; sessionCounts: [number, number]
  ready: boolean; complete: boolean; sourceUrl: string; notes: string[]
}
export type ImportedPaper = ImportedMock & { questions: ExamQuestion[] }
const BUCKET = 'study-mocks'
const LOCAL_ROOT = path.join(process.cwd(), 'data', 'imported-mocks')
export function isLocalStudyRequest(request: Request) {
  const localHosts = ['localhost', '127.0.0.1', '[::1]']
  const host = new URL(request.url).hostname
  const hostHeader = request.headers.get('host')
  try {
    const requestedHost = hostHeader ? new URL(`http://${hostHeader}`).hostname : host
    return process.env.ALLOW_LOCAL_STUDY_GUEST === 'true' && localHosts.includes(host) && localHosts.includes(requestedHost)
  } catch { return false }
}
export class MockLibraryError extends Error {
  constructor(message: string, public status: number) { super(message) }
}
export async function readMockFile(request: Request, objectPath: string) {
  if (!/^(catalog\.json|mock-[1-6]\/(paper\.json|original\.pdf|assets\/[a-z0-9-]+\.jpg))$/.test(objectPath)) throw new MockLibraryError('Paper not found.', 404)
  const local = isLocalStudyRequest(request)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!local && !user) throw new MockLibraryError('Sign in to open the uploaded mock library.', 401)
  if (local) {
    try { return await readFile(path.join(LOCAL_ROOT, objectPath)) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
  if (!user) throw new MockLibraryError('The local mock library has not been imported yet.', 404)
  const { data, error } = await supabase.storage.from(BUCKET).download(objectPath)
  if (error || !data) throw new MockLibraryError('This mock file is unavailable. Try again shortly.', 404)
  return Buffer.from(await data.arrayBuffer())
}
export async function readImportedPaper(request: Request, id: string): Promise<ImportedPaper> {
  if (!/^mock-[1-6]$/.test(id)) throw new MockLibraryError('Paper not found.', 404)
  return JSON.parse((await readMockFile(request, `${id}/paper.json`)).toString('utf8')) as ImportedPaper
}
export function mockError(error: unknown) {
  return Response.json({ error: error instanceof MockLibraryError ? error.message : 'Could not open this paper.' }, { status: error instanceof MockLibraryError ? error.status : 500 })
}
export const PRIVATE_MOCK_HEADERS = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }
