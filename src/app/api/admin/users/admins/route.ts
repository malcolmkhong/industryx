import { NextResponse, type NextRequest } from "next/server";
import { verifyAdmin, withSecurityHeaders } from "@/lib/auth/admin";
import { requireSuperAdmin } from "@/lib/auth/admin-route-guards";
import {
  addAdminUser,
  listAdminUsers,
} from "@/lib/admin/users/adminManagement";

export async function GET() {
  const authResult = await verifyAdmin();
  if ("error" in authResult) {
    return authResult.error;
  }

  const response = await listAdminUsers();
  return withSecurityHeaders(response);
}

export async function POST(request: NextRequest) {
  const authResult = await verifyAdmin();
  if ("error" in authResult) {
    return authResult.error;
  }

  const permissionError = await requireSuperAdmin(
    authResult.admin,
    "Only super admins can add admin users",
  );
  if (permissionError) return permissionError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: "Validation Error",
        message: "userId is required and must be a string",
      },
      { status: 400 },
    );
  }

  const response = await addAdminUser(authResult.admin, body);
  return withSecurityHeaders(response);
}
