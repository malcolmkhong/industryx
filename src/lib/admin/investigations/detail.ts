import { NextResponse } from "next/server";
import type { AdminUser } from "@/lib/auth/admin";
import { logAdminAction } from "@/lib/auth/admin-helpers";
import {
  dismissInvestigation,
  getInvestigation,
  resolveInvestigation,
} from "@/lib/db/admin/cheatInvestigations";
import { createServiceRoleClient } from "@/lib/supabase/server";

interface ResolutionBody {
  action?: unknown;
  note?: unknown;
}

export async function getInvestigationDetail(
  investigationId: string,
): Promise<NextResponse> {
  try {
    const supabase = createServiceRoleClient();
    if (!supabase) {
      return NextResponse.json(
        { error: "Service temporarily unavailable - database not configured" },
        { status: 503 },
      );
    }

    const investigation = await getInvestigation(investigationId);
    if (!investigation) {
      return NextResponse.json(
        { error: "Not Found", message: "Investigation not found" },
        { status: 404 },
      );
    }

    const [userEmail, resolvedByEmail] = await Promise.all([
      loadInvestigationUserEmail(supabase, investigation.user_id as string),
      investigation.resolved_by
        ? loadResolvedByEmail(supabase, investigation.resolved_by)
        : Promise.resolve(null),
    ]);

    return NextResponse.json({
      data: {
        ...investigation,
        user_email: userEmail,
        resolved_by_email: resolvedByEmail,
      },
    });
  } catch (err) {
    console.error(
      "[Admin/Investigations/Detail] Error fetching investigation:",
      err,
    );
    return NextResponse.json(
      { error: "Internal Server Error", message: "Failed to fetch investigation" },
      { status: 500 },
    );
  }
}

export async function resolveOrDismissInvestigation(
  admin: AdminUser,
  investigationId: string,
  body: unknown,
): Promise<NextResponse> {
  const parsed = parseResolutionBody(body);
  if (!parsed.ok) return parsed.response;

  try {
    const supabase = createServiceRoleClient();
    if (!supabase) {
      return NextResponse.json(
        { error: "Service temporarily unavailable - database not configured" },
        { status: 503 },
      );
    }

    const existingInvestigation = await getInvestigation(investigationId);
    if (!existingInvestigation) {
      return NextResponse.json(
        { error: "Not Found", message: "Investigation not found" },
        { status: 404 },
      );
    }

    if (
      existingInvestigation.status === "resolved" ||
      existingInvestigation.status === "dismissed"
    ) {
      return NextResponse.json(
        {
          error: "Conflict",
          message: `Investigation is already ${existingInvestigation.status}`,
        },
        { status: 409 },
      );
    }

    const newStatus =
      parsed.data.action === "resolve" ? "resolved" : "dismissed";
    const updater =
      newStatus === "resolved" ? resolveInvestigation : dismissInvestigation;
    const data = await updater(
      investigationId,
      parsed.data.note,
      admin.id,
    );

    if (!data) {
      return NextResponse.json(
        { error: "Database Error", message: "Failed to update investigation" },
        { status: 500 },
      );
    }

    await logAdminAction({
      adminId: admin.id,
      actionType:
        parsed.data.action === "resolve"
          ? "resolve_investigation"
          : "dismiss_investigation",
      targetUserId: existingInvestigation.user_id,
      details: {
        investigation_id: investigationId,
        previous_status: existingInvestigation.status,
        new_status: newStatus,
        severity: existingInvestigation.severity,
        detection_type: existingInvestigation.detection_type,
        note: parsed.data.note,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Investigation ${newStatus} successfully`,
      data,
    });
  } catch (err) {
    console.error(
      "[Admin/Investigations/Resolve] Error resolving investigation:",
      err,
    );
    return NextResponse.json(
      { error: "Internal Server Error", message: "Failed to update investigation" },
      { status: 500 },
    );
  }
}

async function loadInvestigationUserEmail(
  supabase: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  userId: string,
): Promise<string | null> {
  try {
    const { data: userData } = await supabase.auth.admin.getUserById(userId);
    return userData?.user?.email ?? null;
  } catch {
    return null;
  }
}

async function loadResolvedByEmail(
  supabase: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  resolvedBy: string,
): Promise<string | null> {
  try {
    const { data: adminData } = await supabase
      .from("admin_users")
      .select("email")
      .eq("user_id", resolvedBy)
      .single();
    return adminData?.email ?? null;
  } catch {
    return null;
  }
}

function parseResolutionBody(body: unknown):
  | { ok: true; data: { action: "resolve" | "dismiss"; note: string } }
  | { ok: false; response: NextResponse } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Validation Error",
          message: "action must be 'resolve' or 'dismiss'",
        },
        { status: 400 },
      ),
    };
  }

  const { action, note } = body as ResolutionBody;
  if (action !== "resolve" && action !== "dismiss") {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Validation Error",
          message: "action must be 'resolve' or 'dismiss'",
        },
        { status: 400 },
      ),
    };
  }

  if (typeof note !== "string" || note.trim().length === 0) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Validation Error",
          message: "note is required and must be a non-empty string",
        },
        { status: 400 },
      ),
    };
  }

  return { ok: true, data: { action, note: note.trim() } };
}
