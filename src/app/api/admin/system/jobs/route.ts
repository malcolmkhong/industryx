/**
 * GET /api/admin/system/jobs
 * Background job status dashboard (Cloudflare workers + Next.js crons).
 * Iteration 8: routed through db/market.ts and db/cheatInvestigations.ts.
 */

import { NextResponse } from "next/server";
import { verifyAdmin, withSecurityHeaders } from "@/lib/auth/admin";
import { getLatestMarketTickInfo } from "@/lib/db/market";
import { getLatestCheatInvestigation } from "@/lib/db/cheatInvestigations";

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

  // Market Tick (Cloudflare worker — every 60s)
  const marketTick = await getLatestMarketTickInfo();
  if (marketTick) {
    const minutesSinceTick = (Date.now() - new Date(marketTick.updated_at).getTime()) / 60_000;
    jobs.push({
      name: 'Market Tick Worker',
      type: 'cloudflare_worker',
      schedule: 'Every 60 seconds',
      lastRun: marketTick.updated_at,
      status: minutesSinceTick < 2 ? 'ok' : minutesSinceTick < 5 ? 'late' : 'failed',
      detail: `Tick #${marketTick.tick} · ${marketTick.resourceCount} resources`,
    });
  } else {
    jobs.push({
      name: 'Market Tick Worker',
      type: 'cloudflare_worker',
      schedule: 'Every 60 seconds',
      lastRun: null,
      status: 'unknown',
      detail: 'No market state data',
    });
  }

  // Validate Ticks (Next.js cron — every 5 minutes)
  const recentFlag = await getLatestCheatInvestigation();
  jobs.push({
    name: 'Validate Ticks (Cron)',
    type: 'cron',
    schedule: 'Every 5 minutes',
    lastRun: recentFlag?.created_at ?? null,
    status: 'ok',
    detail: 'Anti-cheat tick validation',
    triggerPath: '/api/cron/validate-ticks',
  });

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

  return withSecurityHeaders(NextResponse.json({ jobs }));
}