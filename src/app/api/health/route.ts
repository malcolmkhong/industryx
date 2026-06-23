import { NextResponse } from "next/server";
import { pingGameConfig } from "@/lib/db/configGame";

// Iteration 9 close-out: replaced inline supabase.from('game_config_game')
// with the existing pingGameConfig helper (added in iter 8 for
// /api/admin/system-status). The helper already returns { ok, error }
// so we don't need the raw supabase client here.
export async function GET() {
  const startTime = Date.now();

  const dbStart = Date.now();
  const ping = await pingGameConfig();
  const dbLatencyMs = Date.now() - dbStart;
  const dbStatus: 'connected' | 'error' | 'unavailable' = ping.ok
    ? 'connected'
    : ping.error?.includes('not configured')
      ? 'unavailable'
      : 'error';

  const overallStatus = dbStatus === 'connected' ? 'ok' : dbStatus === 'error' ? 'degraded' : 'unavailable';

  return NextResponse.json({
    status: overallStatus,
    service: "IndustriaX Backend",
    version: "0.1.0",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    db: {
      status: dbStatus,
      latencyMs: dbLatencyMs,
    },
    responseTimeMs: Date.now() - startTime,
  }, {
    status: overallStatus === 'ok' ? 200 : 503,
  });
}
