import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { verifyAuth } from "@/lib/auth/verifyAuth";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const authResult = await verifyAuth();
  if (!authResult.success) return authResult.response;

  const { id } = await context.params;

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const { data: ticket, error } = await supabase
    .from("support_tickets")
    .select("*")
    .eq("id", id)
    .eq("user_id", authResult.userId)
    .single();

  if (error || !ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  const { data: messages } = await supabase
    .from("support_messages")
    .select("*")
    .eq("ticket_id", id)
    .order("created_at", { ascending: true });

  return NextResponse.json({ data: { ticket, messages: messages || [] } });
}
