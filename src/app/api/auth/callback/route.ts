import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { checkRateLimit, RATE_LIMITS } from "@/lib/auth/rateLimiter";
import { hashIp, extractClientIp } from "@/app/api/auth/_shared/request-ip-log-helper";

export async function GET(request: Request) {
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
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.redirect(`${origin}/?auth=error`);
    }

    const cookieStore = await cookies();

    const supabase = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // Can be ignored if proxy is refreshing sessions
            }
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Redirect to where the user came from (next param, defaults to /)
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Code exchange failed → redirect to home with error
  return NextResponse.redirect(`${origin}/?auth=error`);
}
