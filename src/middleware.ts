import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Paths that should bypass auth checks entirely (let them handle their own auth)
const AUTH_ROUTES = ['/admin/login', '/admin/auth/callback', '/api/auth/']

// API routes handle their own auth — let them through
const API_PREFIX = '/api/'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip middleware logic entirely for auth callback routes
  // to prevent double code exchange (middleware + route handler both calling exchangeCodeForSession)
  if (AUTH_ROUTES.some((path) => pathname.startsWith(path))) {
    return NextResponse.next()
  }

  let supabaseResponse = NextResponse.next({
    request,
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
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh the session so auth state stays current
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Admin route protection — only for /admin/* page routes (not API)
  if (
    pathname.startsWith('/admin') &&
    !pathname.startsWith(API_PREFIX)
  ) {
    // No valid session → redirect to admin login
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = '/admin/login'
      return NextResponse.redirect(url)
    }

    // Check if user is an admin
    const adminUids = (process.env.ADMIN_UIDS || '')
      .split(',')
      .map((uid) => uid.trim())
      .filter(Boolean)

    if (!adminUids.includes(user.id)) {
      // Unauthorized user — redirect to admin login with error
      const url = request.nextUrl.clone()
      url.pathname = '/admin/login'
      url.searchParams.set('error', 'unauthorized')
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
