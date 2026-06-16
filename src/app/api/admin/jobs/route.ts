import { NextResponse } from "next/server";
import { verifyAdmin, withSecurityHeaders } from "@/lib/auth/admin";
import { createServiceRoleClient } from "@/lib/supabase/server";

interface JobInfo {
  name: string;
  type: 'cloudflare_worker' | 'cron' | 'manual';
  schedule: string;
  lastRun: string | null;
  status: 'ok' | 'late' | 'failed' | 'unknown';
  detail: string;
  triggerPath?: string;
}

export async function GET() {
  const authResult = await verifyAdmin();
  if ("error" in authResult) return authResult.error;

  const jobs: JobInfo[] = [];
  const supabase = createServiceRoleClient();

  // Market Tick (Cloudflare worker — every 60s)
  if (supabase) {
    const { data: marketState } = await supabase
      .from('server_market_state')
      .select('tick, updated_at, prices')
      .order('tick', { ascending: false })
      .limit(1)
      .single();

    const minutesSinceTick = marketState
      ? (Date.now() - new Date(marketState.updated_at).getTime()) / 60_000
      : Infinity;

    jobs.push({
      name: 'Market Tick Worker',
      type: 'cloudflare_worker',
      schedule: 'Every 60 seconds',
      lastRun: marketState?.updated_at ?? null,
      status: marketState ? (minutesSinceTick < 2 ? 'ok' : minutesSinceTick < 5 ? 'late' : 'failed') : 'unknown',
      detail: marketState
        ? `Tick #${marketState.tick} · ${marketState.prices ? Object.keys(marketState.prices).length : 0} resources`
        : 'No market state data',
    });
  }

  // Validate Ticks (Next.js cron — every 5 minutes)
  if (supabase) {
    const { data: recentFlag } = await supabase
      .from('cheat_investigations')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    jobs.push({
      name: 'Validate Ticks (Cron)',
      type: 'cron',
      schedule: 'Every 5 minutes',
      lastRun: recentFlag?.created_at ?? null,
      status: 'ok',
      detail: 'Anti-cheat tick validation',
      triggerPath: '/api/cron/validate-ticks',
    });
  }

  // Market Tick (manual trigger via Next.js proxy)
  jobs.push({
    name: 'Market Tick (Manual)',
    type: 'manual',
    schedule: 'On demand',
    lastRun: null,
    status: 'ok',
    detail: 'Manual market tick trigger',
    triggerPath: '/api/market/tick',
  });

  const response = NextResponse.json({ jobs });
  return withSecurityHeaders(response);
}
