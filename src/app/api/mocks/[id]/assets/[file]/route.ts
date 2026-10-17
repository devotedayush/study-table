import { readMockFile, mockError, PRIVATE_MOCK_HEADERS } from '@/lib/server/imported-mocks'
export const runtime = 'nodejs'
export async function GET(request: Request, { params }: { params: Promise<{ id: string; file: string }> }) {
  try {
    const { id, file } = await params
    const bytes = await readMockFile(request, `${id}/assets/${file}`)
    return new Response(new Uint8Array(bytes), { headers: { ...PRIVATE_MOCK_HEADERS, 'Content-Type': 'image/jpeg' } })
  } catch (error) { return mockError(error) }
}
