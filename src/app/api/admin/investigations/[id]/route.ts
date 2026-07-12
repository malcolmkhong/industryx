import { NextResponse, type NextRequest } from "next/server";
import { verifyAdmin, withSecurityHeaders } from "@/lib/auth/admin";
import { requireAdminWrite } from "@/lib/auth/admin-route-guards";
import {
  getInvestigationDetail,
  resolveOrDismissInvestigation,
} from "@/lib/admin/investigations/detail";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const authResult = await verifyAdmin();
  if ("error" in authResult) {
    return authResult.error;
  }

  const { id } = await context.params;
  const response = await getInvestigationDetail(id);
  return withSecurityHeaders(response);
}

export async function POST(request: NextRequest, context: RouteContext) {
  const authResult = await verifyAdmin();
  if ("error" in authResult) {
    return authResult.error;
  }

  const writeError = await requireAdminWrite(
    authResult.admin,
    "Viewers cannot resolve or dismiss investigations",
  );
  if (writeError) return writeError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: "Validation Error",
        message: "action must be 'resolve' or 'dismiss'",
      },
      { status: 400 },
    );
  }

  const { id } = await context.params;
  const response = await resolveOrDismissInvestigation(
    authResult.admin,
    id,
    body,
  );
  return withSecurityHeaders(response);
}
