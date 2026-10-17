import { readMockFile, mockError, PRIVATE_MOCK_HEADERS } from '@/lib/server/imported-mocks'
export const runtime = 'nodejs'
export async function GET(request: Request) {
  try {
    const catalog = JSON.parse((await readMockFile(request, 'catalog.json')).toString('utf8'))
    return Response.json(catalog, { headers: PRIVATE_MOCK_HEADERS })
  } catch (error) { return mockError(error) }
}
