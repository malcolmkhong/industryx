import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json(
        { error: "Unauthorized", message: "No valid session found" },
        { status: 401 }
      );
    }

    // Check admin status
    const adminUids = (process.env.ADMIN_UIDS || "")
      .split(",")
      .map((uid) => uid.trim())
      .filter(Boolean);

    const isAdmin = adminUids.includes(user.id);

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        lastSignInAt: user.last_sign_in_at,
        createdAt: user.created_at,
        isAdmin,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Internal Server Error", message: "Failed to fetch user info" },
      { status: 500 }
    );
  }
}
