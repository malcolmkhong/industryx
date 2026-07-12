import { NextResponse } from "next/server";
import { withSecurityHeaders, type AdminUser } from "@/lib/auth/admin";
import { canWrite, getAdminRole, hasRole } from "@/lib/auth/admin-helpers";

export async function requireAdminWrite(
  admin: AdminUser,
  message = "Write permission required",
): Promise<NextResponse | null> {
  const role = await getAdminRole(admin);
  if (canWrite(role)) return null;

  return withSecurityHeaders(
    NextResponse.json({ error: "Forbidden", message }, { status: 403 }),
  );
}

export async function requireSuperAdmin(
  admin: AdminUser,
  message = "Super admin permission required",
): Promise<NextResponse | null> {
  const role = await getAdminRole(admin);
  if (hasRole(role, "super_admin")) return null;

  return withSecurityHeaders(
    NextResponse.json({ error: "Forbidden", message }, { status: 403 }),
  );
}
