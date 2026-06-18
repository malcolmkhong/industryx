import { NextResponse } from "next/server";
import { verifyAdmin, withSecurityHeaders } from "@/lib/auth/admin";
import { createServiceRoleClient } from "@/lib/supabase/server";

interface ConfigRow {
  resource_id: string;
  base_price: number;
  sector: string;
  elasticity: number;
  is_tradable: boolean;
}

interface ResourceView {
  resource: string;
  price: number | null;
  basePrice: number | null;
  changePercent: string | null;
  circuitBreaker: { active?: boolean; triggered_at?: string; cooldown_ticks?: number } | null;
  sector: string | null;
  elasticity: number | null;
  isTradable: boolean | null;
  inMarket: boolean;
}

export async function GET() {
  const authResult = await verifyAdmin();
  if ("error" in authResult) return authResult.error;

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return withSecurityHeaders(
      NextResponse.json({ error: 'Database not configured' }, { status: 503 }),
    );
  }

  const [{ data: marketState }, { data: configRows }] = await Promise.all([
    supabase
      .from('server_market_state')
      .select('tick, prices, base_prices, volatility, circuit_breakers, news, updated_at')
      .order('tick', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('game_config_market')
      .select('resource_id, base_price, sector, elasticity, is_tradable'),
  ]);

  const prices = (marketState?.prices ?? {}) as Record<string, number>;
  const basePrices = (marketState?.base_prices ?? {}) as Record<string, number>;
  const circuitBreakers = (marketState?.circuit_breakers ?? {}) as Record<string, { active?: boolean }>;

  // Build config lookup
  const configMap = new Map<string, ConfigRow>();
  for (const row of (configRows ?? []) as ConfigRow[]) {
    configMap.set(row.resource_id, row);
  }

  // Build resource list, merging market + config sources
  const resourceMap = new Map<string, ResourceView>();

  for (const [resource, price] of Object.entries(prices)) {
    const cfg = configMap.get(resource);
    const basePrice = basePrices[resource] ?? cfg?.base_price ?? null;
    resourceMap.set(resource, {
      resource,
      price,
      basePrice,
      changePercent:
        basePrice && basePrice > 0
          ? (((price - basePrice) / basePrice) * 100).toFixed(1)
          : null,
      circuitBreaker: circuitBreakers[resource] ?? null,
      sector: cfg?.sector ?? null,
      elasticity: cfg?.elasticity ?? null,
      isTradable: cfg?.is_tradable ?? null,
      inMarket: true,
    });
  }

  // Add configured resources not yet in the market state (newly added)
  for (const [resource, cfg] of configMap) {
    if (resourceMap.has(resource)) continue;
    resourceMap.set(resource, {
      resource,
      price: null,
      basePrice: cfg.base_price,
      changePercent: null,
      circuitBreaker: null,
      sector: cfg.sector,
      elasticity: cfg.elasticity,
      isTradable: cfg.is_tradable,
      inMarket: false,
    });
  }

  const resources = Array.from(resourceMap.values()).sort((a, b) => {
    if (a.inMarket && !b.inMarket) return -1;
    if (!a.inMarket && b.inMarket) return 1;
    if (a.price != null && b.price != null) return b.price - a.price;
    return a.resource.localeCompare(b.resource);
  });

  return withSecurityHeaders(
    NextResponse.json({
      state: marketState
        ? {
            tick: marketState.tick,
            volatility: marketState.volatility,
            updatedAt: marketState.updated_at,
            news: marketState.news ?? [],
            circuitBreakers,
          }
        : null,
      resources,
    }),
  );
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
