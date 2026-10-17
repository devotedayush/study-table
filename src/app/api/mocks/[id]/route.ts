import { readImportedPaper, mockError, PRIVATE_MOCK_HEADERS } from '@/lib/server/imported-mocks'
export const runtime = 'nodejs'
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { return Response.json({ mock: await readImportedPaper(request, (await params).id) }, { headers: PRIVATE_MOCK_HEADERS }) }
  catch (error) { return mockError(error) }
}
