import { NextResponse, type NextRequest } from "next/server";
import { verifyAdmin, withSecurityHeaders } from "@/lib/auth/admin";
import { requireAdminWrite } from "@/lib/auth/admin-route-guards";
import {
  createConfigRow,
  listConfigRows,
} from "@/lib/admin/config/tableRows";

interface RouteContext {
  params: Promise<{ table: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const authResult = await verifyAdmin();
  if ("error" in authResult) {
    return authResult.error;
  }

  const { table } = await context.params;
  const response = await listConfigRows(table, request.url);
  return withSecurityHeaders(response);
}

export async function POST(request: NextRequest, context: RouteContext) {
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

  const { table } = await context.params;
  const response = await createConfigRow(authResult.admin, table, body);
  return withSecurityHeaders(response);
}
