import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminUserDb } from "@/lib/auth/admin";

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

    // Admin status via authoritative admin_users table (cached, env fallback).
    const isAdmin = await isAdminUserDb(user.id);

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
    console.error("[AuthAPI] GET /api/auth/session/me failed:", err);
    return NextResponse.json(
      { error: "Internal Server Error", message: "Failed to fetch user info" },
      { status: 500 }
    );
  }
}
