import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { DEMO_AUTH_COOKIE, getDemoCredentials } from '@/lib/demo-auth'
import { getSupabaseConfig } from '@/lib/supabase/config'

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabaseConfig = getSupabaseConfig()
  const supabase = supabaseConfig
    ? createServerClient(supabaseConfig.url, supabaseConfig.anonKey, {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options)
            })
          },
        },
      })
    : null

  const {
    data: { user },
  } = supabase ? await supabase.auth.getUser() : { data: { user: null } }
  const demoCredentials = getDemoCredentials()
  const hasDemoSession = Boolean(demoCredentials && request.cookies.get(DEMO_AUTH_COOKIE)?.value === '1')
  const isAuthenticated = Boolean(user || hasDemoSession)

  const { pathname } = request.nextUrl
  const publicRoutes = new Set(['/', '/notes', '/mocks', '/login', '/signup'])
  const publicAssets =
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico' ||
    pathname.startsWith('/api')

  if (publicAssets) {
    return response
  }

  if (!isAuthenticated && !publicRoutes.has(pathname)) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (!isAuthenticated || !publicRoutes.has(pathname)) {
    return response
  }

  if (pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  if (hasDemoSession && (pathname === '/signup' || pathname === '/onboarding')) {
    return NextResponse.redirect(new URL('/', request.url))
  }


  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
