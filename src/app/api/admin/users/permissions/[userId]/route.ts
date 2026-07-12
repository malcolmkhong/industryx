import { NextResponse, type NextRequest } from "next/server";
import { verifyAdmin, withSecurityHeaders } from "@/lib/auth/admin";
import { requireSuperAdmin } from "@/lib/auth/admin-route-guards";
import { logAdminAction } from "@/lib/auth/admin-helpers";
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

  const permissionError = await requireSuperAdmin(
    authResult.admin,
    "Only super admins can grant or revoke admin permissions",
  );
  if (permissionError) return permissionError;

  const { userId } = await context.params;

  try {
    const body = await request.json();
    const { permission, action } = body;

    if (!permission || !getValidPermissions().includes(permission as Permission)) {
      return NextResponse.json({ error: "Invalid permission" }, { status: 400 });
    }

    if (action === "grant") {
      const ok = await grantPermission(userId, permission as Permission, authResult.admin.id);
      if (ok) {
        await logAdminAction({
          adminId: authResult.admin.id,
          actionType: "grant_permission",
          targetUserId: userId,
          details: { permission },
        });
      }
      return withSecurityHeaders(NextResponse.json({ success: ok }));
    }

    if (action === "revoke") {
      const ok = await revokePermission(userId, permission as Permission);
      if (ok) {
        await logAdminAction({
          adminId: authResult.admin.id,
          actionType: "revoke_permission",
          targetUserId: userId,
          details: { permission },
        });
      }
      return withSecurityHeaders(NextResponse.json({ success: ok }));
    }

    return NextResponse.json({ error: "Action must be 'grant' or 'revoke'" }, { status: 400 });
  } catch (err) {
    console.error("[Admin/Permissions] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
