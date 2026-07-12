import { verifyAdmin, withSecurityHeaders } from "@/lib/auth/admin";
import { requireAdminWrite } from "@/lib/auth/admin-route-guards";
import { handleDeleteMarketResource } from "@/lib/admin/market/resources";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await verifyAdmin();
  if ("error" in authResult) return authResult.error;

  const writeError = await requireAdminWrite(authResult.admin);
  if (writeError) return writeError;

  const { id } = await params;
  const response = await handleDeleteMarketResource(
    authResult.admin,
    id,
    request.headers.get("x-forwarded-for"),
  );
  return withSecurityHeaders(response);
}
