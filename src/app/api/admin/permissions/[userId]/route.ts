import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin, withSecurityHeaders } from "@/lib/auth/admin";
import { getValidPermissions, getUserPermissions, grantPermission, revokePermission, type Permission } from "@/lib/auth/permissions";

interface RouteContext {
  params: Promise<{ userId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const authResult = await verifyAdmin();
  if ("error" in authResult) return authResult.error;

  const { userId } = await context.params;
  const perms = await getUserPermissions(userId);

  const response = NextResponse.json({
    data: perms,
    available: getValidPermissions(),
  });

  return withSecurityHeaders(response);
}

export async function POST(request: NextRequest, context: RouteContext) {
  const authResult = await verifyAdmin();
  if ("error" in authResult) return authResult.error;

  const { userId } = await context.params;

  try {
    const body = await request.json();
    const { permission, action } = body;

    if (!permission || !getValidPermissions().includes(permission as Permission)) {
      return NextResponse.json({ error: "Invalid permission" }, { status: 400 });
    }

    if (action === "grant") {
      const ok = await grantPermission(userId, permission as Permission, authResult.admin.id);
      return withSecurityHeaders(NextResponse.json({ success: ok }));
    }

    if (action === "revoke") {
      const ok = await revokePermission(userId, permission as Permission);
      return withSecurityHeaders(NextResponse.json({ success: ok }));
    }

    return NextResponse.json({ error: "Action must be 'grant' or 'revoke'" }, { status: 400 });
  } catch (err) {
    console.error("[Admin/Permissions] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
