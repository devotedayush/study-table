import { NextResponse } from 'next/server'
import { DEMO_AUTH_COOKIE, matchesDemoCredentials } from '@/lib/demo-auth'

export async function POST(request: Request) {
  const body = (await request.json()) as { identifier?: string; password?: string }

  if (!body.identifier || !body.password || !matchesDemoCredentials(body.identifier, body.password)) {
    return NextResponse.json({ error: 'Invalid demo credentials.' }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set(DEMO_AUTH_COOKIE, '1', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 8,
  })

  return response
}
