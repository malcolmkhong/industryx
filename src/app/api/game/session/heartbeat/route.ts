// ============================================
// IndustriaX: Game Heartbeat API
// POST endpoint for session tracking
// LEAN MVP — no PII, no player_progress update.
// Heartbeat tracks presence only. It must not advance server tick cursors.
//
// Audit 2026-07-15 (BUG-074): heartbeat timestamps use Node `new Date()`
// intentionally. Presence metadata is never compared to another timestamp
// for gameplay decisions — `last_heartbeat_at` and `disconnected_at` are
// only read by admin dashboards / cleanup-sweep crons that tolerate a
// few seconds of drift. Routing through `getServerNowISO()` here would
// add an RPC per beat (PER-007: 10s minimum cadence already) without
// any gameplay correctness benefit. See `docs/SERVER_TICK_CHAIN_PLAN.md`.
// ============================================

import { NextResponse } from "next/server";
import { createServiceRoleClient } from '@/lib/db/access';;
import { verifyAuth } from "@/lib/auth/verifyAuth";
import { checkRateLimit, RATE_LIMITS } from "@/lib/auth/rateLimiter";

// ─── Main POST Handler ──────────────────────────────────────────────────

export async function POST(request: Request) {
  // ✅ Auth check
  const auth = await verifyAuth();
  if (!auth.success) return auth.response;

  // ✅ Rate limit (heartbeats can be frequent — 60/min)
  const rateLimitResponse = await checkRateLimit(
    auth.userId,
    RATE_LIMITS.presence,
    "/api/game/session/heartbeat",
  );
  if (rateLimitResponse) return rateLimitResponse;

  try {
    await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const now = new Date().toISOString();

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Service temporarily unavailable — database not configured" },
      { status: 503 },
    );
  }

  // Upsert session (lean: no session_token, no client_ip, no user_agent)
  const { error: sessionError } = await supabase.from("player_sessions").upsert(
    {
      user_id: auth.userId,
      is_online: true,
      last_heartbeat_at: now,
      disconnected_at: null,
    },
    { onConflict: "user_id" },
  );

  if (sessionError) {
    console.warn("[Heartbeat] Session upsert failed:", sessionError.message);
  }

  // Bump profiles.last_active so cleanup_orphan_anon_users can tell
  // active players from abandoned ones. Best-effort: failure does not
  // break the heartbeat. (Tier 1 fix 4.)
  await supabase
    .from("profiles")
    .update({ last_active: now })
    .eq("id", auth.userId);

  // Return server time for client sync
  return NextResponse.json({
    ok: true,
    serverTime: now,
  });
}

// ─── DELETE Handler — Disconnect ────────────────────────────────────────

export async function DELETE(_request: Request) {
  const auth = await verifyAuth();
  if (!auth.success) return auth.response;

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Service temporarily unavailable — database not configured" },
      { status: 503 },
    );
  }

  // Mark session as offline
  await supabase
    .from("player_sessions")
    .update({
      is_online: false,
      disconnected_at: new Date().toISOString(),
    })
    .eq("user_id", auth.userId)
    .eq("is_online", true);

  return NextResponse.json({ ok: true, disconnected: true });
}
