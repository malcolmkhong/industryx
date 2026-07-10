import { NextResponse, type NextRequest } from "next/server";
import { verifyAdmin, withSecurityHeaders, clearAdminCache } from "@/lib/auth/admin";
import { getAdminRole, hasRole, logAdminAction } from "@/lib/auth/admin-helpers";
import {
  isAdminsAvailable,
  getAdminById,
  countAdminsByRole,
  updateAdminRole,
} from "@/lib/db/admins";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const VALID_ROLES = ["viewer", "admin", "super_admin"] as const;

/**
 * PUT /api/admin/admins/[id]/role
 * Change an admin user's role. Requires super_admin role.
 * Body: { role: "viewer" | "admin" | "super_admin" }
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  const authResult = await verifyAdmin();
  if ("error" in authResult) {
    return authResult.error;
  }

  const callerRole = await getAdminRole(authResult.admin);
  if (!hasRole(callerRole, "super_admin")) {
    return NextResponse.json(
      { error: "Forbidden", message: "Only super admins can change admin roles" },
      { status: 403 }
    );
  }

  const { id: adminRecordId } = await context.params;

  try {
    const body = await request.json();
    const { role } = body;

    if (!role || !VALID_ROLES.includes(role)) {
      return NextResponse.json(
        { error: "Validation Error", message: `role must be one of: ${VALID_ROLES.join(", ")}` },
        { status: 400 }
      );
    }

    if (!isAdminsAvailable()) {
      return NextResponse.json(
        { error: 'Service temporarily unavailable — database not configured' },
        { status: 503 }
      );
    }

    const adminRecord = await getAdminById(adminRecordId);

    if (!adminRecord) {
      return NextResponse.json(
        { error: "Not Found", message: "Admin record not found" },
        { status: 404 }
      );
    }

    if (adminRecord.role === role) {
      return NextResponse.json(
        { error: "Conflict", message: `Admin already has role '${role}'` },
        { status: 409 }
      );
    }

    if (adminRecord.user_id === authResult.admin.id && role !== "super_admin") {
      const superAdminCount = await countAdminsByRole("super_admin");

      if (superAdminCount <= 1) {
        return NextResponse.json(
          { error: "Forbidden", message: "Cannot demote yourself — you are the last super admin" },
          { status: 403 }
        );
      }
    }

    const ok = await updateAdminRole(adminRecordId, role);

    if (!ok) {
      return NextResponse.json(
        { error: "Database Error", message: "Failed to update admin role" },
        { status: 500 }
      );
    }

    await logAdminAction({
      adminId: authResult.admin.id,
      actionType: "change_admin_role",
      targetUserId: adminRecord.user_id,
      details: { previousRole: adminRecord.role, newRole: role },
    });

    clearAdminCache();

    const response = NextResponse.json({
      success: true,
      message: `Admin role changed from '${adminRecord.role}' to '${role}'`,
      data: { id: adminRecord.id, userId: adminRecord.user_id, role },
    });
    return withSecurityHeaders(response);
  } catch (err) {
    console.error("[Admin/Admins] Error changing admin role:", err);
    return NextResponse.json(
      { error: "Internal Server Error", message: "Failed to change admin role" },
      { status: 500 }
    );
  }
}
