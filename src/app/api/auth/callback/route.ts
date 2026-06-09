import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
              // Can be ignored if middleware is refreshing sessions
            }
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Check if this is an admin login (redirected from /admin/login)
      // by checking if the next param or referer indicates admin context
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const adminUids = (process.env.ADMIN_UIDS || '')
        .split(',')
        .map((uid) => uid.trim())
        .filter(Boolean);

      if (user && adminUids.includes(user.id)) {
        // Admin user → redirect to admin dashboard
        return NextResponse.redirect(`${origin}/admin`);
      }

      // Regular user → redirect to the game
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Code exchange failed → redirect to home with error
  return NextResponse.redirect(`${origin}/?auth=error`);
}
