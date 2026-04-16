import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { DEMO_AUTH_COOKIE, getDemoCredentials } from '@/lib/demo-auth'

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
    },
  )

  const {
    data: { session },
  } = await supabase.auth.getSession()
  const demoCredentials = getDemoCredentials()
  const hasDemoSession = Boolean(demoCredentials && request.cookies.get(DEMO_AUTH_COOKIE)?.value === '1')
  const isAuthenticated = Boolean(session || hasDemoSession)

  const { pathname } = request.nextUrl
  const publicRoutes = new Set(['/', '/login', '/signup', '/onboarding'])
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

  if (session && (pathname === '/signup' || pathname === '/onboarding')) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('onboarding_completed')
      .eq('id', session.user.id)
      .maybeSingle()

    if (profile?.onboarding_completed) {
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
