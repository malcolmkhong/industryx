import { NextResponse } from "next/server";
import { verifyAdmin, withSecurityHeaders } from "@/lib/auth/admin";
import { requireAdminWrite } from "@/lib/auth/admin-route-guards";
import { logAdminAction } from "@/lib/auth/admin-helpers";
import { getLatestMarketStateExtended, updateMarketCircuitBreakers } from "@/lib/db/game/market";
import { listAllMarketConfig } from "@/lib/db/config/configMarket";

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

  const [marketState, configRows] = await Promise.all([
    getLatestMarketStateExtended(),
    listAllMarketConfig(),
  ]);

  const prices = (marketState?.prices ?? {}) as Record<string, number>;
  const basePrices = (marketState?.base_prices ?? {}) as Record<string, number>;
  const circuitBreakers = (marketState?.circuit_breakers ?? {}) as Record<string, { active?: boolean }>;

  const configMap = new Map<string, ConfigRow>();
  for (const row of configRows) {
    configMap.set(row.resource_id, row);
  }

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

  const writeError = await requireAdminWrite(authResult.admin);
  if (writeError) return writeError;

  const marketState = await getLatestMarketStateExtended();
  if (!marketState) {
    return withSecurityHeaders(
      NextResponse.json({ success: true, message: 'No market state to clear' }),
    );
  }

  const breakers = marketState.circuit_breakers ?? {};
  const clearedBreakers: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(breakers as Record<string, { active?: boolean }>)) {
    clearedBreakers[key] = { ...val, active: false, cleared_at: new Date().toISOString() };
  }

  // We need to update by tick (not id) — use direct query since the helper updates by id=1.
  // The single-row server_market_state has id=1 always, so this is equivalent.
  await updateMarketCircuitBreakers(clearedBreakers);
  await logAdminAction({
    adminId: authResult.admin.id,
    actionType: "market.clear_circuit_breakers",
    details: { clearedBreakers },
  });

  const response = NextResponse.json({ success: true, message: 'Circuit breakers cleared' });
  return withSecurityHeaders(response);
}
