import { NextResponse, type NextRequest } from "next/server";
import { verifyAdmin, withSecurityHeaders, clearAdminCache } from "@/lib/auth/admin";
import { getAdminRole, hasRole, logAdminAction } from "@/lib/auth/admin-helpers";
import {
  isAdminsAvailable,
  getAdminById,
  deleteAdminById,
} from "@/lib/db/admins";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * DELETE /api/admin/admins/[id]
 * Remove an admin user by their admin_users table id.
 * Cannot remove admins defined in ADMIN_UIDS env var.
 * Requires super_admin role.
 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  const authResult = await verifyAdmin();
  if ("error" in authResult) {
    return authResult.error;
  }

  const callerRole = await getAdminRole(authResult.admin);
  if (!hasRole(callerRole, "super_admin")) {
    return NextResponse.json(
      { error: "Forbidden", message: "Only super admins can remove admin users" },
      { status: 403 }
    );
  }

  const { id: adminRecordId } = await context.params;

  try {
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

    const envAdminUids = (process.env.ADMIN_UIDS || "")
      .split(",")
      .map((uid) => uid.trim())
      .filter(Boolean);

    if (envAdminUids.includes(adminRecord.user_id)) {
      return NextResponse.json(
        { error: "Forbidden", message: "Cannot remove env-defined admin. Remove from ADMIN_UIDS env var first." },
        { status: 403 }
      );
    }

    if (adminRecord.user_id === authResult.admin.id) {
      return NextResponse.json(
        { error: "Forbidden", message: "Cannot remove yourself as admin" },
        { status: 403 }
      );
    }

    const ok = await deleteAdminById(adminRecordId);

    if (!ok) {
      return NextResponse.json(
        { error: "Database Error", message: "Failed to delete admin" },
        { status: 500 }
      );
    }

    await logAdminAction({
      adminId: authResult.admin.id,
      actionType: "remove_admin",
      targetUserId: adminRecord.user_id,
      details: { previousRole: adminRecord.role },
    });

    clearAdminCache();

    const response = NextResponse.json({
      success: true,
      message: `Admin user ${adminRecord.user_id} removed`,
    });
    return withSecurityHeaders(response);
  } catch (err) {
    console.error("[Admin/Admins] Error removing admin:", err);
    return NextResponse.json(
      { error: "Internal Server Error", message: "Failed to remove admin" },
      { status: 500 }
    );
  }
}
