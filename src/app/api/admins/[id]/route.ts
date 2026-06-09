import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin, withSecurityHeaders } from "@/lib/auth/admin";
import { createServiceRoleClient } from "@/lib/supabase/server";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * DELETE /api/admins/[id]
 * Remove an admin user by their admin_users table id.
 * Cannot remove admins defined in ADMIN_UIDS env var.
 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  const authResult = await verifyAdmin();
  if ("error" in authResult) {
    return authResult.error;
  }

  const { id: adminRecordId } = await context.params;

  try {
    const supabase = createServiceRoleClient();

    // First, get the admin record to check if it's an env admin
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

    // Check if this is an env-defined admin (cannot be removed)
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

    // Prevent self-removal
    if (adminRecord.user_id === authResult.admin.id) {
      return NextResponse.json(
        { error: "Forbidden", message: "Cannot remove yourself as admin" },
        { status: 403 }
      );
    }

    // Delete the admin record
    const { error: deleteError } = await supabase
      .from("admin_users")
      .delete()
      .eq("id", adminRecordId);

    if (deleteError) {
      console.error("[Admins] Error deleting admin:", deleteError.message);
      return NextResponse.json(
        { error: "Database Error", message: deleteError.message },
        { status: 500 }
      );
    }

    const response = NextResponse.json({
      success: true,
      message: `Admin user ${adminRecord.user_id} removed`,
    });
    return withSecurityHeaders(response);
  } catch (err) {
    console.error("[Admins] Error removing admin:", err);
    return NextResponse.json(
      { error: "Internal Server Error", message: "Failed to remove admin" },
      { status: 500 }
    );
  }
}
