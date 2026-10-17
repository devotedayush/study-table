import catalog from '@/lib/study-material-catalog.json'
import { materialAccess, MATERIAL_HEADERS } from '@/lib/server/study-materials'

export async function GET(request: Request) {
  try {
    const { allowed } = await materialAccess(request)
    if (!allowed) return Response.json({ error: 'Sign in to browse the uploaded study materials.' }, { status: 401, headers: MATERIAL_HEADERS })
    return Response.json(catalog, { headers: MATERIAL_HEADERS })
  } catch {
    return Response.json({ error: 'Could not load the study materials. Please try again.' }, { status: 503, headers: MATERIAL_HEADERS })
  }
}
