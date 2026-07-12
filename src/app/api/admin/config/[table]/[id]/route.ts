import { NextResponse, type NextRequest } from "next/server";
import { verifyAdmin, withSecurityHeaders } from "@/lib/auth/admin";
import { requireAdminWrite } from "@/lib/auth/admin-route-guards";
import {
  deleteConfigRow,
  getConfigRow,
  updateConfigRow,
} from "@/lib/admin/config/tableRows";

interface RouteContext {
  params: Promise<{ table: string; id: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const authResult = await verifyAdmin();
  if ("error" in authResult) {
    return authResult.error;
  }

  const { table, id } = await context.params;
  const response = await getConfigRow(table, id);
  return withSecurityHeaders(response);
}

export async function PUT(request: NextRequest, context: RouteContext) {
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
    return withSecurityHeaders(
      NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }),
    );
  }

  const { table, id } = await context.params;
  const response = await updateConfigRow(authResult.admin, table, id, body);
  return withSecurityHeaders(response);
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const authResult = await verifyAdmin();
  if ("error" in authResult) {
    return authResult.error;
  }

  const writeError = await requireAdminWrite(authResult.admin);
  if (writeError) return writeError;

  const { table, id } = await context.params;
  const response = await deleteConfigRow(authResult.admin, table, id);
  return withSecurityHeaders(response);
}
