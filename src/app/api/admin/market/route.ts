import { NextResponse } from "next/server";
import { verifyAdmin, withSecurityHeaders } from "@/lib/auth/admin";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function GET() {
  const authResult = await verifyAdmin();
  if ("error" in authResult) return authResult.error;

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const { data: marketState, error } = await supabase
    .from('server_market_state')
    .select('tick, prices, base_prices, volatility, circuit_breakers, news, updated_at')
    .order('tick', { ascending: false })
    .limit(1)
    .single();

  if (error || !marketState) {
    return NextResponse.json({ state: null, resources: [] });
  }

  const prices = marketState.prices || {};
  const basePrices = marketState.base_prices || {};
  const circuitBreakers = marketState.circuit_breakers || {};

  const resources = Object.keys(prices).map((resource) => ({
    resource,
    price: prices[resource],
    basePrice: basePrices[resource] ?? null,
    changePercent: basePrices[resource]
      ? (((prices[resource] - basePrices[resource]) / basePrices[resource]) * 100).toFixed(1)
      : null,
    circuitBreaker: circuitBreakers[resource] || null,
  }));

  const response = NextResponse.json({
    state: {
      tick: marketState.tick,
      volatility: marketState.volatility,
      updatedAt: marketState.updated_at,
      news: marketState.news || [],
      circuitBreakers,
    },
    resources: resources.sort((a, b) => b.price - a.price),
  });

  return withSecurityHeaders(response);
}

export async function POST() {
  const authResult = await verifyAdmin();
  if ("error" in authResult) return authResult.error;

  try {
    const supabase = createServiceRoleClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    const { data: currentState } = await supabase
      .from('server_market_state')
      .select('tick, circuit_breakers')
      .order('tick', { ascending: false })
      .limit(1)
      .single();

    if (currentState) {
      const clearedBreakers: Record<string, unknown> = {};
      if (currentState.circuit_breakers) {
        for (const [key, val] of Object.entries(currentState.circuit_breakers as Record<string, { active?: boolean }>)) {
          clearedBreakers[key] = { ...val, active: false, cleared_at: new Date().toISOString() };
        }
      }

      await supabase
        .from('server_market_state')
        .update({ circuit_breakers: clearedBreakers })
        .eq('tick', currentState.tick);
    }

    const response = NextResponse.json({ success: true, message: 'Circuit breakers cleared' });
    return withSecurityHeaders(response);
  } catch (err) {
    console.error('[Admin/Market] Error clearing circuit breakers:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
