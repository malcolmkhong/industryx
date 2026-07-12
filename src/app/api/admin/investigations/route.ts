import { NextResponse, type NextRequest } from "next/server";
import { verifyAdmin, withSecurityHeaders } from "@/lib/auth/admin";
import { requireAdminWrite } from "@/lib/auth/admin-route-guards";
import { handleInvestigationAction } from "@/lib/admin/investigations/actions";
import { DETECTION_TYPE_LABELS } from "@/lib/admin/investigations/detectionTypes";
import {
  countResolvedSince,
  listInvestigations,
} from "@/lib/db/admin/cheatInvestigations";
import { createServiceRoleClient } from "@/lib/supabase/server";

type InvestigationStatus = "open" | "resolved" | "dismissed";
type InvestigationSeverity = "low" | "medium" | "high" | "critical";

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
    if (!supabase) {
      return NextResponse.json(
        { error: "Service temporarily unavailable - database not configured" },
        { status: 503 },
      );
    }

    const url = new URL(request.url);
    const status = url.searchParams.get("status") || "";
    const severity = url.searchParams.get("severity") || "";
    const detectionType = url.searchParams.get("detection_type") || "";
    const page = Math.max(
      1,
      parseInt(url.searchParams.get("page") || "1", 10),
    );
    const limit = Math.min(
      200,
      Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)),
    );
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data: investigations, total } = await listInvestigations({
      ...(status ? { status: status as InvestigationStatus } : {}),
      ...(severity ? { severity: severity as InvestigationSeverity } : {}),
      ...(detectionType ? { detectionType } : {}),
      from,
      to,
    });

    const emailMap = await loadUserEmailMap(
      supabase,
      (investigations || [])
        .map((inv: Record<string, unknown>) => inv.user_id as string)
        .filter(Boolean),
    );
    const resolvedByEmailMap = await loadResolvedByEmailMap(
      supabase,
      (investigations || [])
        .map((inv: Record<string, unknown>) => inv.resolved_by as string)
        .filter(Boolean),
    );

    const enrichedInvestigations = (investigations || []).map(
      (inv: Record<string, unknown>) => ({
        ...inv,
        user_email: emailMap[inv.user_id as string] || null,
        resolved_by_email:
          resolvedByEmailMap[inv.resolved_by as string] || null,
      }),
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const resolvedToday = await countResolvedSince(today.toISOString());

    const response = NextResponse.json({
      data: enrichedInvestigations,
      detection_types: DETECTION_TYPE_LABELS,
      resolved_today: resolvedToday,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });

    return withSecurityHeaders(response);
  } catch (err) {
    console.error("[Admin/Investigations] Error listing investigations:", err);
    return NextResponse.json(
      {
        error: "Internal Server Error",
        message: "Failed to list investigations",
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/investigations
 * Perform admin actions on investigations.
 * Body: { action: "reset-money" | "lock-account", userId, ... }
 */
export async function POST(request: NextRequest) {
  const authResult = await verifyAdmin();
  if ("error" in authResult) {
    return authResult.error;
  }

  const writeError = await requireAdminWrite(authResult.admin);
  if (writeError) return writeError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  return handleInvestigationAction(authResult.admin, body);
}

async function loadUserEmailMap(
  supabase: ReturnType<typeof createServiceRoleClient>,
  userIds: string[],
): Promise<Record<string, string>> {
  if (!supabase || userIds.length === 0) return {};

  const uniqueUserIds = [...new Set(userIds)];
  const emailMap: Record<string, string> = {};

  try {
    const { data: usersData, error: usersError } =
      await supabase.auth.admin.listUsers();

    if (!usersError && usersData?.users) {
      for (const user of usersData.users) {
        if (uniqueUserIds.includes(user.id)) {
          emailMap[user.id] = user.email ?? "";
        }
      }
    }
  } catch (authErr) {
    console.error(
      "[Admin/Investigations] Error fetching user emails:",
      authErr,
    );
  }

  return emailMap;
}

async function loadResolvedByEmailMap(
  supabase: ReturnType<typeof createServiceRoleClient>,
  resolvedByIds: string[],
): Promise<Record<string, string>> {
  if (!supabase || resolvedByIds.length === 0) return {};

  try {
    const { data: adminUsers } = await supabase
      .from("admin_users")
      .select("user_id, email")
      .in("user_id", [...new Set(resolvedByIds)]);

    return Object.fromEntries(
      (adminUsers || []).map((admin) => [admin.user_id, admin.email]),
    );
  } catch {
    return {};
  }
}
