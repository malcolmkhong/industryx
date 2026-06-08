import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin, withSecurityHeaders } from "@/lib/auth/admin";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * GET /api/admin/admin-actions
 * List admin action audit trail with filters and pagination.
 * This queries the admin_actions table (migration 006) which logs all
 * admin operations like lock/unlock, resolve/dismiss investigations, etc.
 *
 * Query params: admin_user_id, target_user_id, action_type, date_from, date_to, page, limit
 */
export async function GET(request: NextRequest) {
  const authResult = await verifyAdmin();
  if ("error" in authResult) {
    return authResult.error;
  }

  try {
    const supabase = createServiceRoleClient();
    const url = new URL(request.url);

    const adminUserId = url.searchParams.get("admin_user_id") || "";
    const targetUserId = url.searchParams.get("target_user_id") || "";
    const actionType = url.searchParams.get("action_type") || "";
    const dateFrom = url.searchParams.get("date_from") || "";
    const dateTo = url.searchParams.get("date_to") || "";
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Build query with filters
    let query = supabase
      .from("admin_actions")
      .select("*", { count: "exact" })
      .range(from, to)
      .order("created_at", { ascending: false });

    if (adminUserId) {
      query = query.eq("admin_user_id", adminUserId);
    }
    if (targetUserId) {
      query = query.eq("target_user_id", targetUserId);
    }
    if (actionType) {
      query = query.eq("action_type", actionType);
    }
    if (dateFrom) {
      query = query.gte("created_at", dateFrom);
    }
    if (dateTo) {
      query = query.lte("created_at", dateTo);
    }

    const { data: actions, count, error } = await query;

    if (error) {
      console.error("[Admin/AdminActions] Error fetching admin actions:", error.message);
      return NextResponse.json(
        { error: "Database Error", message: error.message },
        { status: 500 }
      );
    }

    // Batch lookup admin emails
    const adminUserIds = [
      ...new Set(
        (actions || [])
          .map((a: Record<string, unknown>) => a.admin_user_id as string)
          .filter(Boolean)
      ),
    ];

    let adminEmailMap: Record<string, string> = {};
    if (adminUserIds.length > 0) {
      try {
        const { data: adminData } = await supabase
          .from("admin_users")
          .select("user_id, email")
          .in("user_id", adminUserIds);

        if (adminData) {
          for (const admin of adminData) {
            adminEmailMap[admin.user_id] = admin.email;
          }
        }
      } catch {
        // Non-critical
      }

      // Also try auth admin API for admin emails not found in admin_users
      const missingIds = adminUserIds.filter((id) => !adminEmailMap[id]);
      if (missingIds.length > 0) {
        try {
          const { data: usersData } = await supabase.auth.admin.listUsers();
          if (usersData?.users) {
            for (const user of usersData.users) {
              if (missingIds.includes(user.id) && user.email) {
                adminEmailMap[user.id] = user.email;
              }
            }
          }
        } catch {
          // Non-critical
        }
      }
    }

    // Batch lookup target user emails
    const targetUserIds = [
      ...new Set(
        (actions || [])
          .map((a: Record<string, unknown>) => a.target_user_id as string)
          .filter(Boolean)
      ),
    ];

    let targetEmailMap: Record<string, string> = {};
    if (targetUserIds.length > 0) {
      try {
        const { data: usersData } = await supabase.auth.admin.listUsers();
        if (usersData?.users) {
          for (const user of usersData.users) {
            if (targetUserIds.includes(user.id) && user.email) {
              targetEmailMap[user.id] = user.email;
            }
          }
        }
      } catch {
        // Non-critical
      }
    }

    // Enrich actions with email info
    const enrichedActions = (actions || []).map(
      (action: Record<string, unknown>) => ({
        ...action,
        admin_email: adminEmailMap[action.admin_user_id as string] || null,
        target_email: targetEmailMap[action.target_user_id as string] || null,
      })
    );

    const total = count ?? 0;
    const totalPages = Math.ceil(total / limit);

    const response = NextResponse.json({
      data: enrichedActions,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });

    return withSecurityHeaders(response);
  } catch (err) {
    console.error("[Admin/AdminActions] Error listing admin actions:", err);
    return NextResponse.json(
      { error: "Internal Server Error", message: "Failed to list admin actions" },
      { status: 500 }
    );
  }
}
