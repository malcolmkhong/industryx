// src/app/api/waitlist/route.ts
// Waitlist submission endpoint. Creates waitlist_entries + support_tickets
// (reuses existing support system — admin sees it in /admin/support).

import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  let body: { email?: string; name?: string; source?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const email = body.email?.trim();
  const name = body.name?.trim() || undefined;
  const source = body.source?.trim() || 'waitlist_page';

  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }

  const { data, error } = await supabase.rpc('submit_waitlist', {
    p_email: email,
    p_name: name ?? null,
    p_source: source,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true, ...(data?.[0] ?? {}) });
}
