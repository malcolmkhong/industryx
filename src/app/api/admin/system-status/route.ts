import { NextResponse } from "next/server";
import { verifyAdmin, withSecurityHeaders } from "@/lib/auth/admin";
import { createServiceRoleClient } from "@/lib/supabase/server";

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

  const supabase = createServiceRoleClient();
  const dbAvailable = !!supabase;

  // 1. Database connectivity
  if (supabase) {
    const dbStart = Date.now();
    const { error: dbError } = await supabase.from('game_config_game').select('id').limit(1);
    const dbLatency = Date.now() - dbStart;
    services.push({
      name: 'Database',
      status: dbError ? 'degraded' : 'healthy',
      latencyMs: dbLatency,
      detail: dbError ? dbError.message : undefined,
    });
    if (dbError) alerts.push(`Database error: ${dbError.message}`);
  } else {
    services.push({ name: 'Database', status: 'down', detail: 'Service role client not configured' });
    alerts.push('Database unavailable');
  }

  // 2. Admin stats (player count, investigations)
  if (supabase) {
    const { count: playerCount } = await supabase.from('server_game_state').select('*', { count: 'exact', head: true });
    const { count: openInvestigations } = await supabase.from('cheat_investigations').select('*', { count: 'exact', head: true }).eq('status', 'open');
    const { count: lockedAccounts } = await supabase.from('server_game_state').select('*', { count: 'exact', head: true }).eq('is_locked', true);
    const { count: adminCount } = await supabase.from('admin_users').select('*', { count: 'exact', head: true });

    services.push({ name: 'Auth', status: 'healthy' });
  } else {
    services.push({ name: 'Auth', status: 'unknown' });
  }

  // 3. Market tick worker (Cloudflare)
  if (supabase) {
    const { data: marketState } = await supabase
      .from('server_market_state')
      .select('tick, updated_at, prices')
      .order('tick', { ascending: false })
      .limit(1)
      .single();

    if (marketState) {
      const lastTick = new Date(marketState.updated_at);
      const minutesSinceTick = (Date.now() - lastTick.getTime()) / 60_000;

      const jobStatus = minutesSinceTick < 2 ? 'ok' : minutesSinceTick < 5 ? 'late' : 'failed';
      jobs.push({
        name: 'Market Tick',
        schedule: 'Every 60 seconds',
        lastRun: marketState.updated_at,
        status: jobStatus,
        detail: `Tick #${marketState.tick} · ${marketState.prices ? Object.keys(marketState.prices).length : 0} resources tracked`,
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
  }

  // 4. News generator worker
  if (supabase) {
    const { data: recentNews } = await supabase
      .from('server_market_state')
      .select('news, updated_at')
      .not('news', 'is', null)
      .order('tick', { ascending: false })
      .limit(1)
      .single();

    const hasNews = recentNews?.news && Array.isArray(recentNews.news) && recentNews.news.length > 0;
    services.push({
      name: 'AI News Generator',
      status: hasNews ? 'healthy' : 'degraded',
      detail: hasNews ? `${recentNews.news.length} headlines generated` : 'No recent news',
    });
    if (!hasNews) alerts.push('AI news generator: no headlines in latest tick');
  }

  // 5. Validation cron
  if (supabase) {
    const { data: recentCheatFlags } = await supabase
      .from('cheat_investigations')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const lastFlagTime = recentCheatFlags?.created_at ? new Date(recentCheatFlags.created_at).getTime() : null;
    const minutesSinceFlag = lastFlagTime ? (Date.now() - lastFlagTime) / 60_000 : null;

    jobs.push({
      name: 'Validate Ticks (Cron)',
      schedule: 'Every 5 minutes',
      lastRun: recentCheatFlags?.created_at || null,
      status: 'ok',
      detail: lastFlagTime
        ? `Investigation activity seen (last: ${Math.round(minutesSinceFlag!)} min ago)`
        : 'No recent investigation activity',
    });
  }

  // 6. Overall status
  const downServices = services.filter(s => s.status === 'down').length;
  const degradedServices = services.filter(s => s.status === 'degraded').length;
  const overallStatus = downServices > 0 ? 'degraded' : degradedServices > 1 ? 'degraded' : 'healthy';

  const response = NextResponse.json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    responseTimeMs: Date.now() - startTime,
    services,
    jobs,
    alerts,
    summary: {
      healthy: services.filter(s => s.status === 'healthy').length,
      degraded: degradedServices,
      down: downServices,
      unknown: services.filter(s => s.status === 'unknown').length,
    },
  });

  return withSecurityHeaders(response);
}
