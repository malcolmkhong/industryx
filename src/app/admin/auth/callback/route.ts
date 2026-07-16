import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from '@/lib/db/access';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/admin";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Verify the user is an admin
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        // Defense-in-depth: verify user is in admin_users table (after env-var proxy check).
        // Direct table query (not is_game_admin RPC) because auth.uid() returns NULL for
        // service role clients, which would make the RPC always return false.
        // Service role bypasses RLS, so this read is safe.
        const serviceRoleClient = createServiceRoleClient();
        if (serviceRoleClient) {
          const { data: adminRecord, error: adminError } = await serviceRoleClient
            .from("admin_users")
            .select("user_id, role")
            .eq("user_id", user.id)
            .maybeSingle();

          if (adminError || !adminRecord) {
            console.warn(
              `[AdminCallback] User ${user.id} not in admin_users — denying access`
            );
            return NextResponse.redirect(new URL("/admin/forbidden", request.url));
          }
        }

        const adminUids = (process.env.ADMIN_UIDS || "")
          .split(",")
          .map((uid) => uid.trim())
          .filter(Boolean);

        if (adminUids.includes(user.id)) {
          // Authorized admin → redirect to admin dashboard
          return NextResponse.redirect(`${origin}${next}`);
        } else {
          return NextResponse.redirect(`${origin}/admin/login?error=unauthorized`);
        }
      }
    }
  }

  // If code exchange failed or no code, redirect to login with error
  return NextResponse.redirect(`${origin}/admin/login?error=auth_failed`);
}
