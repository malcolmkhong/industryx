import { NextResponse } from "next/server";
import { verifyAdmin, withSecurityHeaders } from "@/lib/auth/admin";
import { requireAdminWrite } from "@/lib/auth/admin-route-guards";
import {
  handleCreateMarketResource,
  handleDeleteMarketResource,
  handleUpdateMarketResource,
} from "@/lib/admin/market/resources";

export async function POST(request: Request) {
  const authResult = await verifyAdmin();
  if ("error" in authResult) return authResult.error;

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

  const response = await handleCreateMarketResource(
    authResult.admin,
    body,
    request.headers.get("x-forwarded-for"),
  );
  return withSecurityHeaders(response);
}

export async function PUT(request: Request) {
  const authResult = await verifyAdmin();
  if ("error" in authResult) return authResult.error;

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

  const response = await handleUpdateMarketResource(
    authResult.admin,
    body,
    request.headers.get("x-forwarded-for"),
  );
  return withSecurityHeaders(response);
}

export async function DELETE(request: Request) {
  const authResult = await verifyAdmin();
  if ("error" in authResult) return authResult.error;

  const writeError = await requireAdminWrite(authResult.admin);
  if (writeError) return writeError;

  const url = new URL(request.url);
  const resourceId = url.searchParams.get("resource_id") ?? "";
  const response = await handleDeleteMarketResource(
    authResult.admin,
    resourceId,
    request.headers.get("x-forwarded-for"),
  );
  return withSecurityHeaders(response);
}
