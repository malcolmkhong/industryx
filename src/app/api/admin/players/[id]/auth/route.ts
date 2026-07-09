/**
 * GET /api/admin/players/[id]/auth
 *
 * Single-user auth lookup for the player detail page header.
 * Returns full AuthUser shape: provider, avatar_url, full_name, last_sign_in_at,
 * email_confirmed_at, banned_until, is_anonymous, created_at.
 *
 * Iteration 8+: routed through db/adminUsers.ts#getAuthUserById (single-row,
 * no roster scan).
 *
 * RLS: service-role client; admin auth gate via verifyAdmin().
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyAdmin, withSecurityHeaders } from "@/lib/auth/admin";
import { checkRateLimit, RATE_LIMITS } from "@/lib/auth/rateLimiter";
import { getAuthUserById } from "@/lib/db/adminUsers";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await verifyAdmin();
  if ("error" in authResult) {
    return authResult.error;
  }

  const rateLimitResult = await checkRateLimit(
    authResult.admin.id,
    RATE_LIMITS.admin,
    "admin-player-auth",
  );
  if (rateLimitResult) return rateLimitResult;

  const { id } = await params;

  if (!UUID_RE.test(id)) {
    const response = NextResponse.json(
      { error: "Invalid user id (must be UUID)" },
      { status: 400 },
    );
    return withSecurityHeaders(response);
  }

  const authUser = await getAuthUserById(id);

  if (!authUser) {
    const response = NextResponse.json(
      { error: "Auth record not found for this user id" },
      { status: 404 },
    );
    return withSecurityHeaders(response);
  }

  const response = NextResponse.json({ data: authUser });
  return withSecurityHeaders(response);
}