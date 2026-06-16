import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin, withSecurityHeaders, clearAdminCache } from "@/lib/auth/admin";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAdminRole, hasRole, logAdminAction } from "@/lib/auth/admin-helpers";

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

    const supabase = createServiceRoleClient();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Service temporarily unavailable — database not configured' },
        { status: 503 }
      );
    }

    const { data: adminRecord, error: fetchError } = await supabase
      .from("admin_users")
      .select("id, user_id, role")
      .eq("id", adminRecordId)
      .single();

    if (fetchError || !adminRecord) {
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
      const { count, error: countError } = await supabase
        .from("admin_users")
        .select("id", { count: "exact", head: true })
        .eq("role", "super_admin");

      if (!countError && (count ?? 0) <= 1) {
        return NextResponse.json(
          { error: "Forbidden", message: "Cannot demote yourself — you are the last super admin" },
          { status: 403 }
        );
      }
    }

    const { error: updateError } = await supabase
      .from("admin_users")
      .update({ role })
      .eq("id", adminRecordId);

    if (updateError) {
      console.error("[Admin/Admins] Error updating admin role:", updateError.message);
      return NextResponse.json(
        { error: "Database Error", message: updateError.message },
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
