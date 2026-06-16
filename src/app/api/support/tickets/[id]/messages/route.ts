import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { verifyAuth } from "@/lib/auth/verifyAuth";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const authResult = await verifyAuth();
  if (!authResult.success) return authResult.response;

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
      .select("id, status, user_id")
      .eq("id", id)
      .eq("user_id", authResult.userId)
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
        sender_id: authResult.userId,
        sender_type: "player",
        message,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: msg }, { status: 201 });
  } catch (err) {
    console.error("[Support] Error sending message:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
