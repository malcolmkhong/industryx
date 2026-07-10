import { NextResponse, type NextRequest } from "next/server";
import { verifyAuth } from "@/lib/auth/verifyAuth";
import { getTicket, addTicketMessage } from "@/lib/db/supportTickets";

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

    const ticket = await getTicket(id);

    // Ownership check: ticket must belong to the authenticated user.
    if (!ticket || ticket.user_id !== authResult.userId) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    if (ticket.status === "resolved") {
      return NextResponse.json({ error: "Cannot message on resolved ticket" }, { status: 400 });
    }

    const msg = await addTicketMessage({
      ticket_id: id,
      sender_id: authResult.userId,
      sender_type: "player",
      message,
    });

    if (!msg) {
      return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
    }

    return NextResponse.json({ data: msg }, { status: 201 });
  } catch (err) {
    console.error("[Support] Error sending message:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
