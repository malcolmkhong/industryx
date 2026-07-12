import { NextResponse, type NextRequest } from "next/server";
import { verifyAdmin, withSecurityHeaders } from "@/lib/auth/admin";
import { requireAdminWrite } from "@/lib/auth/admin-route-guards";
import { handlePlayerLockAction } from "@/lib/admin/players/lockAccount";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const authResult = await verifyAdmin();
  if ("error" in authResult) {
    return authResult.error;
  }

  const writeError = await requireAdminWrite(
    authResult.admin,
    "Viewers cannot lock/unlock accounts",
  );
  if (writeError) return writeError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Validation Error", message: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { id } = await context.params;
  const response = await handlePlayerLockAction(authResult.admin, id, body);
  return withSecurityHeaders(response);
}
