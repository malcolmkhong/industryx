import { NextResponse, type NextRequest } from 'next/server'

// Paths that should bypass auth checks entirely (let them handle their own auth)
const AUTH_ROUTES = ['/admin/login', '/admin/auth/callback', '/api/auth/']

// API routes handle their own auth — let them through
const API_PREFIX = '/api/'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip middleware logic entirely for auth callback routes
  if (AUTH_ROUTES.some((path) => pathname.startsWith(path))) {
    return NextResponse.next()
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

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
