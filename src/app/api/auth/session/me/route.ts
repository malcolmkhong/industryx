import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/db/access";
import { isAdminUserDb } from "@/lib/auth/admin";
import { checkRateLimit, RATE_LIMITS } from "@/lib/auth/rateLimiter";
import {
  hashIp,
  extractClientIp,
} from "@/app/api/auth/_shared/request-ip-log-helper";

export async function GET(request: NextRequest) {
  // A7 (REAL-DEFECT-A7d): API-001 requires rate limiting on every
  // useful route. The session probe is unauthenticated, so we key
  // the bucket on the client IP hash. 30/min, best-effort.
  // Next.js always supplies the `request` argument at runtime,
  // so we type it as required (NextRequest) rather than optional.
  // Previously this was `request?: Request` to support legacy
  // test callers that invoked `GET()` without an argument; those
  // callers now pass an explicit `NextRequest` mock.
  if (request.headers) {
    const ipHash = hashIp(extractClientIp(request.headers));
    const limited = await checkRateLimit(
      ipHash,
      RATE_LIMITS.general,
      "/api/auth/session/me",
    );
    if (limited) return limited;
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json(
        { error: "Unauthorized", message: "No valid session found" },
        { status: 401 },
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
      { status: 500 },
    );
  }
}
