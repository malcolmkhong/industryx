import { NextResponse, type NextRequest } from 'next/server'

// Capture the real client IP for analytics logging on auth routes.
// Phase 1 — Foundation (Storage + Audit).
// IP is for ANALYTICS ONLY; never used for bans, locks, or recovery denial.
const REAL_IP_HEADERS = ['cf-connecting-ip', 'x-real-ip', 'x-forwarded-for'] as const

function extractRealIp(headers: Headers): string {
  for (const name of REAL_IP_HEADERS) {
    const value = headers.get(name)
    if (value) {
      // x-forwarded-for is a comma-separated list; first entry is the original client
      return value.split(',')[0]?.trim() || 'unknown'
    }
  }
  return 'unknown'
}

// Paths that should bypass auth checks entirely (let them handle their own auth)
const AUTH_ROUTES = ['/admin/login', '/admin/auth/callback', '/api/auth/']

// API routes handle their own auth — let them through
const API_PREFIX = '/api/'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Capture real client IP for analytics logging (Phase 1)
  const realIp = extractRealIp(request.headers)

  // Skip proxy logic entirely for auth callback routes
  if (AUTH_ROUTES.some((path) => pathname.startsWith(path))) {
    const res = NextResponse.next()
    res.headers.set('x-real-ip', realIp)
    return res
  }

  // If Supabase is not configured, skip auth checks entirely
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next()
  }

  // Only import and use Supabase when credentials are available
  const { createServerClient } = await import('@supabase/ssr')

  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
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
    // Set CSRF cookie on admin page loads so client JS can read it
    supabaseResponse.cookies.set('csrf_token', crypto.randomUUID(), {
      httpOnly: false,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24,
    });
    // No valid session → redirect to admin login
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = '/admin/login'
      return NextResponse.redirect(url)
    }

    const adminUids = (process.env.ADMIN_UIDS || '')
      .split(',')
      .map((uid) => uid.trim())
      .filter(Boolean)

    if (adminUids.includes(user.id)) {
      return supabaseResponse
    }

    let isDbAdmin = false
    try {
      const { data } = await supabase.rpc('is_game_admin')
      isDbAdmin = data === true
    } catch {
      isDbAdmin = false
    }

    if (!isDbAdmin) {
      const url = request.nextUrl.clone()
      url.pathname = '/admin/login'
      url.searchParams.set('error', 'unauthorized')
      return NextResponse.redirect(url)
    }
  }

  // Propagate x-real-ip to API routes for analytics (Phase 1)
  supabaseResponse.headers.set('x-real-ip', realIp)
  return supabaseResponse
}

export const config = {
  matcher: [
    // API routes handle their own auth via verifyAuth() in each handler.
    // Running middleware here was costing 100ms-8s on every API call
    // (a redundant supabase.auth.getUser() round-trip per request).
    // Admin page routes still need the proxy for session-checked redirects.
    '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
