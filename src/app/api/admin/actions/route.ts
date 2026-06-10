import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin, withSecurityHeaders } from "@/lib/auth/admin";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * GET /api/admin/actions
 * Action audit log with filters and pagination.
 * Query params: user_id, action_type, is_valid, date_from, date_to, page, limit
 */
export async function GET(request: NextRequest) {
  const authResult = await verifyAdmin();
  if ("error" in authResult) {
    return authResult.error;
  }

  try {
    const supabase = createServiceRoleClient();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Service temporarily unavailable — database not configured' },
        { status: 503 }
      );
    }
    const url = new URL(request.url);

    const userId = url.searchParams.get("user_id") || "";
    const actionType = url.searchParams.get("action_type") || "";
    const isValidParam = url.searchParams.get("is_valid") || "";
    const dateFrom = url.searchParams.get("date_from") || "";
    const dateTo = url.searchParams.get("date_to") || "";
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Build query with filters
    let query = supabase
      .from("player_actions")
      .select("*", { count: "exact" })
      .range(from, to)
      .order("created_at", { ascending: false });

    if (userId) {
      query = query.eq("user_id", userId);
    }
    if (actionType) {
      query = query.eq("action_type", actionType);
    }
    if (isValidParam === "true") {
      query = query.eq("is_valid", true);
    } else if (isValidParam === "false") {
      query = query.eq("is_valid", false);
    }
    if (dateFrom) {
      query = query.gte("created_at", dateFrom);
    }
    if (dateTo) {
      query = query.lte("created_at", dateTo);
    }

    const { data: actions, count, error } = await query;

    if (error) {
      console.error("[Admin/Actions] Error fetching actions:", error.message);
      return NextResponse.json(
        { error: "Database Error", message: error.message },
        { status: 500 }
      );
    }

    // Batch lookup user emails
    let emailMap: Record<string, string> = {};
    const uniqueUserIds = [
      ...new Set(
        (actions || [])
          .map((a: Record<string, unknown>) => a.user_id as string)
          .filter(Boolean)
      ),
    ];

    if (uniqueUserIds.length > 0) {
      try {
        const { data: usersData } = await supabase.auth.admin.listUsers();
        if (usersData?.users) {
          for (const user of usersData.users) {
            if (uniqueUserIds.includes(user.id)) {
              emailMap[user.id] = user.email ?? "";
            }
          }
        }
      } catch (authErr) {
        console.error("[Admin/Actions] Error fetching user emails:", authErr);
      }
    }

    // Enrich actions with user email
    const enrichedActions = (actions || []).map(
      (action: Record<string, unknown>) => ({
        ...action,
        user_email: emailMap[action.user_id as string] || null,
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
    console.error("[Admin/Actions] Error listing actions:", err);
    return NextResponse.json(
      { error: "Internal Server Error", message: "Failed to list actions" },
      { status: 500 }
    );
  }
}
