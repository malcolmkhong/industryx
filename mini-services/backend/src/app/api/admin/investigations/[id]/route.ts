import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin, withSecurityHeaders } from "@/lib/auth/admin";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAdminRole, canWrite, logAdminAction } from "@/lib/auth/admin-helpers";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/investigations/[id]
 * Fetch single investigation detail with user info.
 */
export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  const authResult = await verifyAdmin();
  if ("error" in authResult) {
    return authResult.error;
  }

  const { id: investigationId } = await context.params;

  try {
    const supabase = createServiceRoleClient();

    // Fetch the investigation
    const { data: investigation, error } = await supabase
      .from("cheat_investigations")
      .select("*")
      .eq("id", investigationId)
      .single();

    if (error || !investigation) {
      return NextResponse.json(
        { error: "Not Found", message: "Investigation not found" },
        { status: 404 }
      );
    }

    // Fetch user email from auth admin API
    let userEmail: string | null = null;
    try {
      const { data: userData } = await supabase.auth.admin.getUserById(
        investigation.user_id as string
      );
      if (userData?.user) {
        userEmail = userData.user.email ?? null;
      }
    } catch {
      // Non-critical
    }

    // Fetch resolved_by admin email
    let resolvedByEmail: string | null = null;
    if (investigation.resolved_by) {
      try {
        const { data: adminData } = await supabase
          .from("admin_users")
          .select("email")
          .eq("user_id", investigation.resolved_by)
          .single();
        if (adminData) {
          resolvedByEmail = adminData.email;
        }
      } catch {
        // Non-critical
      }
    }

    const response = NextResponse.json({
      data: {
        ...investigation,
        user_email: userEmail,
        resolved_by_email: resolvedByEmail,
      },
    });

    return withSecurityHeaders(response);
  } catch (err) {
    console.error(
      "[Admin/Investigations/Detail] Error fetching investigation:",
      err
    );
    return NextResponse.json(
      { error: "Internal Server Error", message: "Failed to fetch investigation" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/investigations/[id]
 * Resolve or dismiss an investigation.
 * Body: { action: 'resolve' | 'dismiss', note: string }
 * Viewers cannot resolve/dismiss investigations.
 */
export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  const authResult = await verifyAdmin();
  if ("error" in authResult) {
    return authResult.error;
  }

  const { id: investigationId } = await context.params;

  // Verify admin is not a viewer
  const role = await getAdminRole(authResult.admin);
  if (!canWrite(role)) {
    return NextResponse.json(
      {
        error: "Forbidden",
        message: "Viewers cannot resolve or dismiss investigations",
      },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { action, note } = body;

    // Validate action
    if (!action || !["resolve", "dismiss"].includes(action)) {
      return NextResponse.json(
        {
          error: "Validation Error",
          message: "action must be 'resolve' or 'dismiss'",
        },
        { status: 400 }
      );
    }

    // Validate note
    if (!note || typeof note !== "string" || note.trim().length === 0) {
      return NextResponse.json(
        {
          error: "Validation Error",
          message: "note is required and must be a non-empty string",
        },
        { status: 400 }
      );
    }

    const supabase = createServiceRoleClient();

    // Check that the investigation exists
    const { data: existingInv, error: fetchError } = await supabase
      .from("cheat_investigations")
      .select("id, status, user_id, severity, detection_type")
      .eq("id", investigationId)
      .single();

    if (fetchError || !existingInv) {
      return NextResponse.json(
        { error: "Not Found", message: "Investigation not found" },
        { status: 404 }
      );
    }

    // Check if already resolved/dismissed
    if (existingInv.status === "resolved" || existingInv.status === "dismissed") {
      return NextResponse.json(
        {
          error: "Conflict",
          message: `Investigation is already ${existingInv.status}`,
        },
        { status: 409 }
      );
    }

    // Update the investigation
    const newStatus = action === "resolve" ? "resolved" : "dismissed";
    const updateData = {
      status: newStatus,
      resolved_by: authResult.admin.id,
      resolution_note: note.trim(),
      resolved_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("cheat_investigations")
      .update(updateData)
      .eq("id", investigationId)
      .select()
      .single();

    if (error) {
      console.error(
        "[Admin/Investigations/Resolve] Error updating investigation:",
        error.message
      );
      return NextResponse.json(
        { error: "Database Error", message: error.message },
        { status: 500 }
      );
    }

    // Log the admin action
    await logAdminAction({
      adminId: authResult.admin.id,
      actionType: action === "resolve" ? "resolve_investigation" : "dismiss_investigation",
      targetUserId: existingInv.user_id,
      details: {
        investigation_id: investigationId,
        previous_status: existingInv.status,
        new_status: newStatus,
        severity: existingInv.severity,
        detection_type: existingInv.detection_type,
        note: note.trim(),
      },
    });

    const response = NextResponse.json({
      success: true,
      message: `Investigation ${newStatus} successfully`,
      data,
    });

    return withSecurityHeaders(response);
  } catch (err) {
    console.error(
      "[Admin/Investigations/Resolve] Error resolving investigation:",
      err
    );
    return NextResponse.json(
      { error: "Internal Server Error", message: "Failed to update investigation" },
      { status: 500 }
    );
  }
}
