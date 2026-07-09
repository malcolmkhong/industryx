import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyAuth } from "@/lib/auth/verifyAuth";
import {
  listTickets,
  createTicket,
  addTicketMessage,
} from "@/lib/db/supportTickets";

export async function POST(request: NextRequest) {
  const authResult = await verifyAuth();
  if (!authResult.success) return authResult.response;

  try {
    const body = await request.json();
    const { subject, message } = body;

    if (!subject || !message || typeof subject !== "string" || typeof message !== "string") {
      return NextResponse.json({ error: "Subject and message are required" }, { status: 400 });
    }

    const ticket = await createTicket({
      user_id: authResult.userId,
      subject,
      status: "open",
    });

    if (!ticket) {
      return NextResponse.json({ error: "Failed to create ticket" }, { status: 500 });
    }

    await addTicketMessage({
      ticket_id: ticket.id,
      sender_id: authResult.userId,
      sender_type: "player",
      message,
    });

    return NextResponse.json({ data: ticket }, { status: 201 });
  } catch (err) {
    console.error("[Support] Error creating ticket:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(_request: NextRequest) {
  const authResult = await verifyAuth();
  if (!authResult.success) return authResult.response;

  const tickets = await listTickets({ userId: authResult.userId });
  return NextResponse.json({ data: tickets });
}
