import { readMockFile, mockError, PRIVATE_MOCK_HEADERS } from '@/lib/server/imported-mocks'
export const runtime = 'nodejs'
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const bytes = await readMockFile(request, `${id}/original.pdf`)
    return new Response(new Uint8Array(bytes), { headers: { ...PRIVATE_MOCK_HEADERS, 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${id}.pdf"` } })
  } catch (error) { return mockError(error) }
}
