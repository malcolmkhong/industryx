import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth/verifyAuth";
import { getTicket, listTicketMessages } from "@/lib/db/shared/supportTickets";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const authResult = await verifyAuth();
  if (!authResult.success) return authResult.response;

  const { id } = await context.params;

  const ticket = await getTicket(id);

  // Ownership check: ticket must belong to the authenticated user.
  if (!ticket || ticket.user_id !== authResult.userId) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  const messages = await listTicketMessages(id);
  return NextResponse.json({ data: { ticket, messages } });
}
