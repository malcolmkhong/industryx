import { NextResponse, type NextRequest } from "next/server";
import { verifyAdmin, withSecurityHeaders } from "@/lib/auth/admin";
import { requireAdminWrite } from "@/lib/auth/admin-route-guards";
import { logAdminAction } from "@/lib/auth/admin-helpers";
import { getDbClient } from '@/lib/db/access';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const authResult = await verifyAdmin();
  if ("error" in authResult) return authResult.error;

  const { id } = await context.params;

  const supabase = getDbClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const { data: ticket, error } = await supabase
    .from("support_tickets")
    .select(
      "id,user_id,subject,message,status,priority,created_at,updated_at,assigned_admin_id",
    )
    .eq("id", id)
    .single();

  if (error || !ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  const { data: messages } = await supabase
    .from("support_messages")
    .select("id,ticket_id,sender_id,sender_role,message,created_at")
    .eq("ticket_id", id)
    .order("created_at", { ascending: true });

  const response = NextResponse.json({ data: { ticket, messages: messages || [] } });
  return withSecurityHeaders(response);
}

export async function POST(request: NextRequest, context: RouteContext) {
  const authResult = await verifyAdmin();
  if ("error" in authResult) return authResult.error;

  const writeError = await requireAdminWrite(authResult.admin);
  if (writeError) return writeError;

  const { id } = await context.params;

  try {
    const body = await request.json();
    const { action } = body;

    const supabase = getDbClient();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    if (action === "accept") {
      const { data: ticket, error: ticketError } = await supabase
        .from("support_tickets")
        .select("id, status")
        .eq("id", id)
        .single();

      if (ticketError || !ticket) {
        return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
      }

      if (ticket.status !== "open") {
        return NextResponse.json({ error: "Ticket is not open" }, { status: 400 });
      }

      await supabase
        .from("support_tickets")
        .update({ status: "accepted", accepted_by: authResult.admin.id })
        .eq("id", id);

      await supabase.from("support_messages").insert({
        ticket_id: id,
        sender_id: authResult.admin.id,
        sender_type: "admin",
        message: "Ticket accepted — an admin will assist you shortly.",
      });

      await logAdminAction({
        adminId: authResult.admin.id,
        actionType: "support.accept_ticket",
        details: { ticket_id: id },
      });

      return withSecurityHeaders(NextResponse.json({ success: true, status: "accepted" }));
    }

    if (action === "resolve") {
      const { data: ticket, error: ticketError } = await supabase
        .from("support_tickets")
        .select("id, status")
        .eq("id", id)
        .single();

      if (ticketError || !ticket) {
        return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
      }

      if (ticket.status === "resolved") {
        return NextResponse.json({ error: "Ticket is already resolved" }, { status: 400 });
      }

      await supabase
        .from("support_tickets")
        .update({ status: "resolved", resolved_at: new Date().toISOString() })
        .eq("id", id);

      await supabase.from("support_messages").insert({
        ticket_id: id,
        sender_id: authResult.admin.id,
        sender_type: "admin",
        message: "Ticket resolved.",
      });

      await logAdminAction({
        adminId: authResult.admin.id,
        actionType: "support.resolve_ticket",
        details: { ticket_id: id },
      });

      return withSecurityHeaders(NextResponse.json({ success: true, status: "resolved" }));
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    console.error("[Admin/Support] Error updating ticket:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
