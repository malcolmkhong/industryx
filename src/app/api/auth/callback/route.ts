import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { checkRateLimit, RATE_LIMITS } from "@/lib/auth/rateLimiter";
import {
  hashIp,
  extractClientIp,
} from "@/app/api/auth/_shared/request-ip-log-helper";

// ─────────────────────────────────────────────────────────────────────
// GET /api/auth/callback
//
// OAuth code-exchange endpoint for the Supabase auth flow.
// On success, the user is redirected to `next` (defaults to "/").
//
// IMPORTANT: in Next.js 15+/16 the App-Router `cookies()` store is
// read-only inside a GET route handler — `cookieStore.set()` throws
// outside Server Actions / POST handlers. The classic SSR
// `createServerClient` pattern that calls `cookies().set()` silently
// loses the session cookies via a swallowed try/catch, which is why
// callers see /api/auth/session/me return 401 right after OAuth.
//
// The Next.js 16–correct pattern is:
//   1. read cookies from the inbound request
//   2. let @supabase/ssr compute the new cookie set
//   3. forward those cookies on the OUTBOUND redirect response via
//      `NextResponse.redirect(url, { headers })`
//
// This is the fix the [AuthAPI] /api/auth/session/me 401 path needs.
// ─────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // A7 (REAL-DEFECT-A7a): API-001 requires rate limiting on every
  // useful route. The OAuth code-exchange endpoint is unauthenticated
  // (the code is the only credential) and is a high-value brute-force
  // target. Key the bucket on the client IP hash; 30/min, best-effort
  // so legitimate users on flaky networks still recover.
  const ipHash = hashIp(extractClientIp(request.headers));
  const limited = await checkRateLimit(
    ipHash,
    RATE_LIMITS.general,
    "/api/auth/callback",
  );
  if (limited) return limited;

  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/?auth=error`);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(`${origin}/?auth=error`);
  }

  // Capture the inbound cookies once so @supabase/ssr can refresh if
  // it wants to (it reads via getAll).
  const inboundCookies = request.cookies.getAll();

  // Track the cookie set that @supabase/ssr computes during the
  // code-exchange round-trip. We'll forward these on the redirect
  // response below, because cookies().set() throws inside a GET
  // route handler in Next.js 15+/16.
  const pendingCookies: Array<{
    name: string;
    value: string;
    options?: Record<string, unknown>;
  }> = [];

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return inboundCookies;
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          pendingCookies.push({ name, value, options });
        });
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/?auth=error`);
  }

  // Build the success redirect and attach the Supabase session
  // cookies to it. Without this, the client never receives the
  // session token and /api/auth/session/me keeps returning 401.
  const redirectUrl = `${origin}${next}`;
  const response = NextResponse.redirect(redirectUrl);
  for (const { name, value, options } of pendingCookies) {
    response.cookies.set({
      name,
      value,
      ...(options as Record<string, unknown>),
    });
  }
  return response;
}
