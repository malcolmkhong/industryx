import { NextResponse } from "next/server";
import { verifyAdmin, withSecurityHeaders } from "@/lib/auth/admin";
import { getDbClient } from '@/lib/db/access';

export async function GET() {
  const authResult = await verifyAdmin();
  if ("error" in authResult) return authResult.error;

  const supabase = getDbClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const { data: tickets, error } = await supabase
    .from("support_tickets")
    .select(
      "id,user_id,subject,message,status,priority,created_at,updated_at,assigned_admin_id",
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const counts = {
    open: (tickets || []).filter((t) => t.status === "open").length,
    accepted: (tickets || []).filter((t) => t.status === "accepted").length,
    resolved: (tickets || []).filter((t) => t.status === "resolved").length,
    total: (tickets || []).length,
  };

  const response = NextResponse.json({ data: tickets || [], counts });
  return withSecurityHeaders(response);
}
