import { NextResponse } from "next/server";
import { clearAdminCache, type AdminUser } from "@/lib/auth/admin";
import { logAdminAction } from "@/lib/auth/admin-helpers";
import {
  findAdminIdByUserId,
  insertAdmin,
  isAdminsAvailable,
  listAdmins,
} from "@/lib/db/admins";

const VALID_ADMIN_ROLES = ["admin", "super_admin", "viewer"] as const;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface AddAdminBody {
  userId?: unknown;
  email?: unknown;
  role?: unknown;
}

export async function listAdminUsers(): Promise<NextResponse> {
  try {
    if (!isAdminsAvailable()) {
      return NextResponse.json(
        { error: "Service temporarily unavailable - database not configured" },
        { status: 503 },
      );
    }

    const dbAdmins = await listAdmins();
    const envAdminUids = (process.env.ADMIN_UIDS || "")
      .split(",")
      .map((uid) => uid.trim())
      .filter(Boolean);
    const dbUserIds = new Set(
      (dbAdmins || []).map((admin: Record<string, unknown>) => admin.user_id as string),
    );

    const admins = (dbAdmins || []).map((admin: Record<string, unknown>) => ({
      id: admin.id,
      userId: admin.user_id,
      email: admin.email,
      role: admin.role,
      addedBy: admin.added_by,
      createdAt: admin.created_at,
      source: envAdminUids.includes(admin.user_id as string) ? "env+db" : "db",
    }));
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

    return NextResponse.json({
      data: allAdmins,
      total: allAdmins.length,
    });
  } catch (err) {
    console.error("[Admin/Admins] Error listing admins:", err);
    return NextResponse.json(
      { error: "Internal Server Error", message: "Failed to list admins" },
      { status: 500 },
    );
  }
}

export async function addAdminUser(
  caller: AdminUser,
  body: unknown,
): Promise<NextResponse> {
  const parsed = parseAddAdminBody(body);
  if (!parsed.ok) return parsed.response;

  try {
    if (!isAdminsAvailable()) {
      return NextResponse.json(
        { error: "Service temporarily unavailable - database not configured" },
        { status: 503 },
      );
    }

    const existing = await findAdminIdByUserId(parsed.data.userId);
    if (existing) {
      return NextResponse.json(
        { error: "Conflict", message: "User is already an admin" },
        { status: 409 },
      );
    }

    const data = await insertAdmin({
      user_id: parsed.data.userId,
      email: parsed.data.email ?? "",
      role: parsed.data.role,
      added_by: caller.id,
    });

    if (!data) {
      return NextResponse.json(
        { error: "Database Error", message: "Failed to insert admin" },
        { status: 500 },
      );
    }

    await logAdminAction({
      adminId: caller.id,
      actionType: "add_admin",
      targetUserId: parsed.data.userId,
      details: { role: parsed.data.role, email: parsed.data.email },
    });

    clearAdminCache();

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    console.error("[Admin/Admins] Error adding admin:", err);
    return NextResponse.json(
      { error: "Internal Server Error", message: "Failed to add admin" },
      { status: 500 },
    );
  }
}

function parseAddAdminBody(body: unknown):
  | {
      ok: true;
      data: { userId: string; email: string | null; role: "admin" | "super_admin" | "viewer" };
    }
  | { ok: false; response: NextResponse } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return validationError("userId is required and must be a string");
  }

  const { userId, email, role } = body as AddAdminBody;
  if (typeof userId !== "string") {
    return validationError("userId is required and must be a string");
  }

  if (!UUID_RE.test(userId)) {
    return validationError("userId must be a valid UUID");
  }

  return {
    ok: true,
    data: {
      userId,
      email: typeof email === "string" && email.length > 0 ? email : null,
      role:
        typeof role === "string" && isValidAdminRole(role)
          ? role
          : "admin",
    },
  };
}

function isValidAdminRole(
  role: string,
): role is "admin" | "super_admin" | "viewer" {
  return VALID_ADMIN_ROLES.includes(
    role as (typeof VALID_ADMIN_ROLES)[number],
  );
}

function validationError(message: string): { ok: false; response: NextResponse } {
  return {
    ok: false,
    response: NextResponse.json(
      { error: "Validation Error", message },
      { status: 400 },
    ),
  };
}
