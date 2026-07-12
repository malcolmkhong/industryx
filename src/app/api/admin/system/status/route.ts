/**
 * GET /api/admin/system/status
 * Service health dashboard for admins.
 * Iteration 8: routed through db/serverGameState.ts, db/cheatInvestigations.ts,
 * db/market.ts, db/admins.ts, db/configGame.ts.
 */
import { NextResponse } from "next/server";
import { verifyAdmin, withSecurityHeaders } from "@/lib/auth/admin";
import { countPlayersTotal, countLockedPlayers } from "@/lib/db/game/serverGameState";
import { countOpenCheatInvestigations, getLatestCheatInvestigation } from "@/lib/db/admin/cheatInvestigations";
import { getLatestMarketTickInfo, getLatestMarketNews } from "@/lib/db/game/market";
import { countAdmins } from "@/lib/db/admin/admins";
import { pingGameConfig } from "@/lib/db/config/configGame";

interface ServiceStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'down' | 'unknown';
  latencyMs?: number;
  detail?: string;
}

interface JobStatus {
  name: string;
  schedule: string;
  lastRun: string | null;
  status: 'ok' | 'late' | 'failed' | 'unknown';
  detail: string;
}

export async function GET() {
  const authResult = await verifyAdmin();
  if ("error" in authResult) return authResult.error;

  const startTime = Date.now();
  const services: ServiceStatus[] = [];
  const jobs: JobStatus[] = [];
  const alerts: string[] = [];

  // 1. Database connectivity
  const dbStart = Date.now();
  const ping = await pingGameConfig();
  const dbLatency = Date.now() - dbStart;
  services.push({
    name: 'Database',
    status: ping.ok ? 'healthy' : 'degraded',
    latencyMs: dbLatency,
    detail: ping.ok ? undefined : ping.error,
  });
  if (!ping.ok) alerts.push(`Database error: ${ping.error}`);

  // 2. Admin stats (player count, investigations, etc.)
  const [playerCount, openInvestigations, lockedAccounts, adminCount] = await Promise.all([
    countPlayersTotal(),
    countOpenCheatInvestigations(),
    countLockedPlayers(),
    countAdmins(),
  ]);

  services.push({ name: 'Auth', status: 'healthy' });

  // 3. Market tick worker (Cloudflare)
  const marketTick = await getLatestMarketTickInfo();
  if (marketTick) {
    const lastTick = new Date(marketTick.updated_at);
    const minutesSinceTick = (Date.now() - lastTick.getTime()) / 60_000;
    const jobStatus = minutesSinceTick < 2 ? 'ok' : minutesSinceTick < 5 ? 'late' : 'failed';
    jobs.push({
      name: 'Market Tick',
      schedule: 'Every 60 seconds',
      lastRun: marketTick.updated_at,
      status: jobStatus,
      detail: `Tick #${marketTick.tick} · ${marketTick.resourceCount} resources tracked`,
    });
    if (jobStatus !== 'ok') {
      alerts.push(`Market tick is ${jobStatus}: last run ${Math.round(minutesSinceTick)} min ago`);
    }
    services.push({
      name: 'Cloudflare Worker (markettick)',
      status: jobStatus === 'ok' ? 'healthy' : jobStatus === 'late' ? 'degraded' : 'down',
      detail: `Last tick: ${lastTick.toISOString()}`,
    });
  } else {
    jobs.push({ name: 'Market Tick', schedule: 'Every 60 seconds', lastRun: null, status: 'unknown', detail: 'No market state data' });
    services.push({ name: 'Cloudflare Worker (markettick)', status: 'unknown', detail: 'No market state data' });
    alerts.push('Market tick worker: no data in server_market_state');
  }

  // 4. News generator worker
  const recentNews = await getLatestMarketNews();
  const newsItems = Array.isArray(recentNews?.news) ? recentNews.news as unknown[] : [];
  const hasNews = newsItems.length > 0;
  services.push({
    name: 'AI News Generator',
    status: hasNews ? 'healthy' : 'degraded',
    detail: hasNews ? `${newsItems.length} headlines generated` : 'No recent news',
  });
  if (!hasNews) alerts.push('AI news generator: no headlines in latest tick');

  // 5. Validation cron
  const recentCheatFlags = await getLatestCheatInvestigation();
  const lastFlagTime = recentCheatFlags?.created_at ? new Date(recentCheatFlags.created_at).getTime() : null;
  const minutesSinceFlag = lastFlagTime ? (Date.now() - lastFlagTime) / 60_000 : null;

  jobs.push({
    name: 'Validate Ticks (Cron)',
    schedule: 'Every 5 minutes',
    lastRun: recentCheatFlags?.created_at ?? null,
    status: 'ok',
    detail: minutesSinceFlag !== null
      ? `Investigation activity seen (last: ${Math.round(minutesSinceFlag)} min ago)`
      : 'No recent investigation activity',
  });

  // 6. Overall status
  const downServices = services.filter((s) => s.status === 'down').length;
  const degradedServices = services.filter((s) => s.status === 'degraded').length;
  const overallStatus = downServices > 0 ? 'degraded' : degradedServices > 1 ? 'degraded' : 'healthy';

  const response = NextResponse.json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    responseTimeMs: Date.now() - startTime,
    services,
    jobs,
    alerts,
    stats: {
      playerCount,
      openInvestigations,
      lockedAccounts,
      adminCount,
    },
  });
  return withSecurityHeaders(response);
}
