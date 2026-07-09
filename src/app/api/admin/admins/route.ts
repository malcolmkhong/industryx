import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyAdmin, withSecurityHeaders, clearAdminCache } from "@/lib/auth/admin";
import { getAdminRole, hasRole, logAdminAction } from "@/lib/auth/admin-helpers";
import {
  isAdminsAvailable,
  listAdmins,
  findAdminIdByUserId,
  insertAdmin,
} from "@/lib/db/admins";

/**
 * GET /api/admin/admins
 * List all admin users (from admin_users table + ADMIN_UIDS env).
 */
export async function GET() {
  const authResult = await verifyAdmin();
  if ("error" in authResult) {
    return authResult.error;
  }

  try {
    if (!isAdminsAvailable()) {
      return NextResponse.json(
        { error: 'Service temporarily unavailable — database not configured' },
        { status: 503 }
      );
    }

    const dbAdmins = await listAdmins();

    const envAdminUids = (process.env.ADMIN_UIDS || "")
      .split(",")
      .map((uid) => uid.trim())
      .filter(Boolean);

    const admins = (dbAdmins || []).map((admin: Record<string, unknown>) => ({
      id: admin.id,
      userId: admin.user_id,
      email: admin.email,
      role: admin.role,
      addedBy: admin.added_by,
      createdAt: admin.created_at,
      source: envAdminUids.includes(admin.user_id as string) ? "env+db" : "db",
    }));

    const dbUserIds = new Set((dbAdmins || []).map((a: Record<string, unknown>) => a.user_id as string));
    const envOnlyAdmins = envAdminUids
      .filter((uid) => !dbUserIds.has(uid))
      .map((uid) => ({
        id: null,
        userId: uid,
        email: null,
        role: "super_admin",
        addedBy: null,
        createdAt: null,
        source: "env" as const,
      }));

    const allAdmins = [...admins, ...envOnlyAdmins];

    const response = NextResponse.json({
      data: allAdmins,
      total: allAdmins.length,
    });

    return withSecurityHeaders(response);
  } catch (err) {
    console.error("[Admin/Admins] Error listing admins:", err);
    return NextResponse.json(
      { error: "Internal Server Error", message: "Failed to list admins" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/admins
 * Add an admin user by UUID. Requires super_admin role.
 */
export async function POST(request: NextRequest) {
  const authResult = await verifyAdmin();
  if ("error" in authResult) {
    return authResult.error;
  }

  const callerRole = await getAdminRole(authResult.admin);
  if (!hasRole(callerRole, "super_admin")) {
    return NextResponse.json(
      { error: "Forbidden", message: "Only super admins can add admin users" },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { userId, email, role } = body;

    if (!userId || typeof userId !== "string") {
      return NextResponse.json(
        { error: "Validation Error", message: "userId is required and must be a string" },
        { status: 400 }
      );
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId)) {
      return NextResponse.json(
        { error: "Validation Error", message: "userId must be a valid UUID" },
        { status: 400 }
      );
    }

    const validRoles = ["admin", "super_admin", "viewer"];
    const adminRole = role && validRoles.includes(role) ? role : "admin";

    if (!isAdminsAvailable()) {
      return NextResponse.json(
        { error: 'Service temporarily unavailable — database not configured' },
        { status: 503 }
      );
    }

    const existing = await findAdminIdByUserId(userId);

    if (existing) {
      return NextResponse.json(
        { error: "Conflict", message: "User is already an admin" },
        { status: 409 }
      );
    }

    const data = await insertAdmin({
      user_id: userId,
      email: email || null,
      role: adminRole,
      added_by: authResult.admin.id,
    });

    if (!data) {
      return NextResponse.json(
        { error: "Database Error", message: "Failed to insert admin" },
        { status: 500 }
      );
    }

    await logAdminAction({
      adminId: authResult.admin.id,
      actionType: "add_admin",
      targetUserId: userId,
      details: { role: adminRole, email: email || null },
    });

    clearAdminCache();

    const response = NextResponse.json({ data }, { status: 201 });
    return withSecurityHeaders(response);
  } catch (err) {
    console.error("[Admin/Admins] Error adding admin:", err);
    return NextResponse.json(
      { error: "Internal Server Error", message: "Failed to add admin" },
      { status: 500 }
    );
  }
}
