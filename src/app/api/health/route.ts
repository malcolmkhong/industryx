import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function GET() {
  const startTime = Date.now();

  // Test Supabase connectivity
  const supabase = createServiceRoleClient();
  let dbStatus: 'connected' | 'error' | 'unavailable' = 'unavailable';
  let dbLatencyMs: number | null = null;

  if (supabase) {
    const dbStart = Date.now();
    const { error } = await supabase.from('game_config_game').select('id').limit(1);
    dbLatencyMs = Date.now() - dbStart;
    dbStatus = error ? 'error' : 'connected';
  }

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
    status: overallStatus === 'ok' ? 200 : overallStatus === 'degraded' ? 503 : 503,
  });
}
