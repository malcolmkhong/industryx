import { NextResponse, type NextRequest } from "next/server";
import { verifyAdmin, withSecurityHeaders } from "@/lib/auth/admin";
import { requireAdminWrite } from "@/lib/auth/admin-route-guards";
import { logAdminAction } from "@/lib/auth/admin-helpers";
import { createServiceRoleClient } from '@/lib/db/access';;

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const authResult = await verifyAdmin();
  if ("error" in authResult) return authResult.error;

  const writeError = await requireAdminWrite(authResult.admin);
  if (writeError) return writeError;

  const { id } = await context.params;

  try {
    const body = await request.json();
    const { message } = body;

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const { data: ticket, error: ticketError } = await supabase
      .from("support_tickets")
      .select("id, status")
      .eq("id", id)
      .single();

    if (ticketError || !ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    if (ticket.status === "resolved") {
      return NextResponse.json({ error: "Cannot message on resolved ticket" }, { status: 400 });
    }

    const { data: msg, error } = await supabase
      .from("support_messages")
      .insert({
        ticket_id: id,
        sender_id: authResult.admin.id,
        sender_type: "admin",
        message,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const response = NextResponse.json({ data: msg }, { status: 201 });
    await logAdminAction({
      adminId: authResult.admin.id,
      actionType: "support.send_message",
      details: { ticket_id: id },
    });
    return withSecurityHeaders(response);
  } catch (err) {
    console.error("[Admin/Support] Error sending message:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
