import { NextResponse, type NextRequest } from "next/server";
import { verifyAdmin, withSecurityHeaders } from "@/lib/auth/admin";
import { createServiceRoleClient } from "@/lib/supabase/server";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const authResult = await verifyAdmin();
  if ("error" in authResult) return authResult.error;

  const { id } = await context.params;

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const { data: ticket, error } = await supabase
    .from("support_tickets")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  const { data: messages } = await supabase
    .from("support_messages")
    .select("*")
    .eq("ticket_id", id)
    .order("created_at", { ascending: true });

  const response = NextResponse.json({ data: { ticket, messages: messages || [] } });
  return withSecurityHeaders(response);
}

export async function POST(request: NextRequest, context: RouteContext) {
  const authResult = await verifyAdmin();
  if ("error" in authResult) return authResult.error;

  const { id } = await context.params;

  try {
    const body = await request.json();
    const { action } = body;

    const supabase = createServiceRoleClient();
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

      return withSecurityHeaders(NextResponse.json({ success: true, status: "resolved" }));
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    console.error("[Admin/Support] Error updating ticket:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
