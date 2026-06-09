/**
 * Shared admin authentication utility for API routes.
 * Verifies the user's session and checks admin status against ADMIN_UIDS env var.
 */

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export interface AdminUser {
  id: string;
  email: string | undefined;
}

/**
 * Check if a given userId is in the ADMIN_UIDS list.
 * This is a lightweight check that doesn't require a session.
 */
export function isAdminUserId(userId: string): boolean {
  const adminUids = (process.env.ADMIN_UIDS || "")
    .split(",")
    .map((uid) => uid.trim())
    .filter(Boolean);
  return adminUids.includes(userId);
}

/**
 * Verify that the current request is from an authenticated admin user.
 * Returns the admin user info on success, or a NextResponse error on failure.
 */
export async function verifyAdmin(): Promise<
  { admin: AdminUser } | { error: NextResponse }
> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return {
        error: NextResponse.json(
          { error: "Unauthorized", message: "No valid session found" },
          { status: 401 }
        ),
      };
    }

    // Check admin status from ADMIN_UIDS env var
    const adminUids = (process.env.ADMIN_UIDS || "")
      .split(",")
      .map((uid) => uid.trim())
      .filter(Boolean);

    if (!adminUids.includes(user.id)) {
      return {
        error: NextResponse.json(
          { error: "Forbidden", message: "User is not an admin" },
          { status: 403 }
        ),
      };
    }

    return {
      admin: {
        id: user.id,
        email: user.email,
      },
    };
  } catch (err) {
    console.error("[Auth] Admin verification failed:", err);
    return {
      error: NextResponse.json(
        { error: "Internal Server Error", message: "Auth verification failed" },
        { status: 500 }
      ),
    };
  }
}

/**
 * Add common rate limiting and security headers to a response.
 */
export function withSecurityHeaders(
  response: NextResponse | Response
): NextResponse {
  if (response instanceof NextResponse) {
    response.headers.set("X-RateLimit-Limit", "100");
    response.headers.set("X-RateLimit-Remaining", "99");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("Cache-Control", "no-store");
  }
  return response as NextResponse;
}
