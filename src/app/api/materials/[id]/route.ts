import { openStudyMaterial, MATERIAL_HEADERS } from '@/lib/server/study-materials'

export const runtime = 'nodejs'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    return await openStudyMaterial(request, id)
  } catch {
    return Response.json({ error: 'Could not open this PDF. Please try again.' }, { status: 503, headers: MATERIAL_HEADERS })
  }
}
