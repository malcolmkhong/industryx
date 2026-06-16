import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { verifyAuth } from "@/lib/auth/verifyAuth";

export async function POST(request: NextRequest) {
  const authResult = await verifyAuth();
  if (!authResult.success) return authResult.response;

  try {
    const body = await request.json();
    const { subject, message } = body;

    if (!subject || !message || typeof subject !== "string" || typeof message !== "string") {
      return NextResponse.json({ error: "Subject and message are required" }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const { data: ticket, error } = await supabase
      .from("support_tickets")
      .insert({ user_id: authResult.userId, subject, status: "open" })
      .select()
      .single();

    if (error || !ticket) {
      return NextResponse.json({ error: error?.message || "Failed to create ticket" }, { status: 500 });
    }

    await supabase.from("support_messages").insert({
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

export async function GET(request: NextRequest) {
  const authResult = await verifyAuth();
  if (!authResult.success) return authResult.response;

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const { data: tickets, error } = await supabase
    .from("support_tickets")
    .select("*")
    .eq("user_id", authResult.userId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: tickets || [] });
}
