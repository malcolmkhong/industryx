import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin, withSecurityHeaders } from "@/lib/auth/admin";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * GET /api/admin/investigations
 * List cheat investigations with filters and pagination.
 * Query params: status, severity, detection_type, page, limit
 */
export async function GET(request: NextRequest) {
  const authResult = await verifyAdmin();
  if ("error" in authResult) {
    return authResult.error;
  }

  try {
    const supabase = createServiceRoleClient();
    const url = new URL(request.url);

    const status = url.searchParams.get("status") || "";
    const severity = url.searchParams.get("severity") || "";
    const detectionType = url.searchParams.get("detection_type") || "";
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Build query with filters
    let query = supabase
      .from("cheat_investigations")
      .select("*", { count: "exact" })
      .range(from, to)
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }
    if (severity) {
      query = query.eq("severity", severity);
    }
    if (detectionType) {
      query = query.eq("detection_type", detectionType);
    }

    const { data: investigations, count, error } = await query;

    if (error) {
      console.error(
        "[Admin/Investigations] Error fetching investigations:",
        error.message
      );
      return NextResponse.json(
        { error: "Database Error", message: error.message },
        { status: 500 }
      );
    }

    // Batch lookup user emails via Supabase Auth Admin API
    let emailMap: Record<string, string> = {};
    const userIds = [
      ...new Set(
        (investigations || [])
          .map((inv: Record<string, unknown>) => inv.user_id as string)
          .filter(Boolean)
      ),
    ];

    if (userIds.length > 0) {
      try {
        const { data: usersData, error: usersError } =
          await supabase.auth.admin.listUsers();

        if (!usersError && usersData?.users) {
          for (const user of usersData.users) {
            if (userIds.includes(user.id)) {
              emailMap[user.id] = user.email ?? "";
            }
          }
        }
      } catch (authErr) {
        console.error(
          "[Admin/Investigations] Error fetching user emails:",
          authErr
        );
      }
    }

    // Also fetch resolved_by admin emails
    const resolvedByIds = [
      ...new Set(
        (investigations || [])
          .map((inv: Record<string, unknown>) => inv.resolved_by as string)
          .filter(Boolean)
      ),
    ];

    let resolvedByEmailMap: Record<string, string> = {};
    if (resolvedByIds.length > 0) {
      try {
        const { data: adminUsers } = await supabase
          .from("admin_users")
          .select("user_id, email")
          .in("user_id", resolvedByIds);

        if (adminUsers) {
          for (const admin of adminUsers) {
            resolvedByEmailMap[admin.user_id] = admin.email;
          }
        }
      } catch {
        // Non-critical, skip
      }
    }

    // Enrich investigations with email info
    const enrichedInvestigations = (investigations || []).map(
      (inv: Record<string, unknown>) => ({
        ...inv,
        user_email: emailMap[inv.user_id as string] || null,
        resolved_by_email: resolvedByEmailMap[inv.resolved_by as string] || null,
      })
    );

    const total = count ?? 0;
    const totalPages = Math.ceil(total / limit);

    const response = NextResponse.json({
      data: enrichedInvestigations,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });

    return withSecurityHeaders(response);
  } catch (err) {
    console.error(
      "[Admin/Investigations] Error listing investigations:",
      err
    );
    return NextResponse.json(
      { error: "Internal Server Error", message: "Failed to list investigations" },
      { status: 500 }
    );
  }
}
