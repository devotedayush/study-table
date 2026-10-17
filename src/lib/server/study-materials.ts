import 'server-only'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import catalog from '@/lib/study-material-catalog.json'
import { createClient } from '@/lib/supabase/server'
import { isLocalStudyRequest } from './imported-mocks'

export const MATERIAL_HEADERS = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }

export async function materialAccess(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, allowed: Boolean(user) || isLocalStudyRequest(request), local: isLocalStudyRequest(request) }
}

export async function openStudyMaterial(request: Request, id: string) {
  const material = catalog.find(item => item.id === id)
  if (!material) return Response.json({ error: 'Study material not found.' }, { status: 404, headers: MATERIAL_HEADERS })
  const { supabase, allowed, local } = await materialAccess(request)
  if (!allowed) return Response.json({ error: 'Sign in to open the study materials.' }, { status: 401, headers: MATERIAL_HEADERS })
  const download = new URL(request.url).searchParams.get('download') === '1'
  if (local) {
    try {
      const bytes = await readFile(path.join(process.cwd(), 'data', 'study-materials', `${material.id}.pdf`))
      return new Response(new Uint8Array(bytes), { headers: {
        ...MATERIAL_HEADERS,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${material.filename}"`,
      } })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  const { data, error } = await supabase.storage.from('study-materials').createSignedUrl(
    `${material.id}.pdf`, 300, download ? { download: material.filename } : undefined,
  )
  if (error || !data) return Response.json({ error: 'This PDF is unavailable. Please try again.' }, { status: 503, headers: MATERIAL_HEADERS })
  return new Response(null, { status: 302, headers: { ...MATERIAL_HEADERS, Location: data.signedUrl } })
}
