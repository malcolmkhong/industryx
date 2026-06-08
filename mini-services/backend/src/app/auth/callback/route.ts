import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/backend";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Verify the user is an admin
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const adminUids = (process.env.ADMIN_UIDS || "")
          .split(",")
          .map((uid) => uid.trim())
          .filter(Boolean);

        if (adminUids.includes(user.id)) {
          // Authorized admin → redirect to backend dashboard
          return NextResponse.redirect(`${origin}${next}`);
        } else {
          // Authenticated but NOT admin → unauthorized
          return NextResponse.redirect(`${origin}/login?error=unauthorized`);
        }
      }
    }
  }

  // If code exchange failed or no code, redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
