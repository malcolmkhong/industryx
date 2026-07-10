// ============================================
// POST /api/market/tick
// Thin proxy to the same apply_market_tick RPC the Cloudflare Worker uses.
// Useful for manual debugging and dev triggers.
//
// Per the architecture rules:
//   - Next.js route EXECUTES the simulation LOCALLY (same TypeScript port of
//     marketEngine that the Cloudflare Worker runs in JS)
//   - Supabase VALIDATES + PERSISTS via the apply_market_tick RPC (the gate)
//
// No direct REST writes to server_market_state here. The RPC is the sole
// writer of tick, prices, volatility, circuit_breakers.
// ============================================

import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  getMarketStateFull,
  getAllPlayerPressure,
  getAllSupplyDemand,
  updateMarketNews,
} from '@/lib/db/market';
import { getBalance } from '@/lib/game/balanceConfig';
import { ensureConfigLoaded } from '@/lib/game/configLoader.server';

// Phase 3 F3: market simulation constants moved to balanceConfig.ts (single source of truth).
// Defaults match prior behavior. Operators can tune via Supabase overrides.
const NEWS_WORKER_URL =
  process.env.MARKET_NEWS_WORKER_URL || 'https://newsgenerator.malcolmkhong.workers.dev';

interface BreakerState {
  cooldown: number;
  spikes: number;
  soldOut: boolean;
  // Phase 3 F4: consecutive soldOut-only ticks (no sell pressure). When this
  // exceeds the configured escape threshold, the breaker auto-clears to
  // prevent permanent deadlock when a resource's supply disappears.
  soldOutTicks: number;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

interface MarketPrice {
  resource: string;
  currentPrice: number;
  basePrice: number;
  trend: string;
  volume: number;
}

interface PressureData {
  buyVol: number;
  sellVol: number;
}

function marketTick(
  prices: { resource: string; currentPrice: number; basePrice: number }[],
  pressure: Record<string, PressureData>,
  volatility: number,
  breakers: Record<string, BreakerState>,
) {
  const newPrices: MarketPrice[] = [];
  const events: Array<Record<string, unknown>> = [];
  const newBreakers: Record<string, BreakerState> = { ...breakers };

  for (const entry of prices) {
    const p = pressure[entry.resource] || { buyVol: 0, sellVol: 0 };
    const br = breakers[entry.resource] || { cooldown: 0, spikes: 0, soldOut: false, soldOutTicks: 0 };
    let netPressure = p.buyVol - p.sellVol;
    const oldPrice = entry.currentPrice;

    const isSoldOut = (p.sellVol === 0 && p.buyVol > 0 && netPressure > 0);
    if (isSoldOut) { br.soldOut = true; br.cooldown = getBalance().market.breakerCooldown; netPressure = 0; }
    if (br.cooldown > 0 && br.soldOut) { netPressure = 0; br.cooldown--; }
    else if (br.cooldown > 0) { netPressure = Math.min(0, netPressure); br.cooldown--; }

    const shift = Math.sign(netPressure) * Math.sqrt(Math.abs(netPressure)) * getBalance().market.pressureFactor * (1 + (volatility || 0) * 5);
    let newPrice = clamp(oldPrice + oldPrice * shift, getBalance().market.minPrice, getBalance().market.maxPrice);
    const changePct = oldPrice > 0 ? (newPrice - oldPrice) / oldPrice : 0;

    if (Math.abs(changePct) > getBalance().market.spikeCap) {
      const sign = changePct > 0 ? 1 : -1;
      newPrice = oldPrice * (1 + sign * getBalance().market.spikeCap);
      br.spikes++; br.cooldown = getBalance().market.breakerCooldown;
      events.push({
        type: 'price_move', resource: entry.resource,
        delta: `${sign > 0 ? '+' : ''}${(getBalance().market.spikeCap * 100).toFixed(1)}%`,
        severity: 'high',
        context: {
          cause: `CIRCUIT BREAKER: ${(Math.abs(changePct) * 100).toFixed(0)}% spike capped at 40%${br.soldOut ? ' — SOLD OUT' : ''}`,
          trend: sign > 0 ? 'up' : 'down',
          oldPrice: Math.round(oldPrice * 100) / 100, newPrice: Math.round(newPrice * 100) / 100,
          buyVolume: p.buyVol, sellVolume: p.sellVol,
        },
      });
    } else if (Math.abs(changePct) >= getBalance().market.eventThreshold) {
      events.push({
        type: 'price_move', resource: entry.resource,
        delta: `${changePct > 0 ? '+' : ''}${(Math.abs(changePct) * 100).toFixed(1)}%`,
        severity: severityForChangePct(changePct),
        context: {
          cause: netPressure > 0 ? 'buy pressure exceeding supply' : 'sell pressure exceeding demand',
          trend: changePct > 0 ? 'up' : 'down',
          oldPrice: Math.round(oldPrice * 100) / 100, newPrice: Math.round(newPrice * 100) / 100,
          buyVolume: p.buyVol, sellVolume: p.sellVol,
        },
      });
    }

    if (br.soldOut && p.sellVol > 0) { br.soldOut = false; br.cooldown = 0; br.soldOutTicks = 0; }
    if (br.cooldown <= 0 && !br.soldOut) { br.spikes = 0; }

    // Phase 3 F4: Track consecutive soldOut-only ticks. If supply never
    // recovers within soldOutEscapeTicks, force-clear the breaker so the
    // price can mean-revert toward basePrice.
    if (br.soldOut) {
      br.soldOutTicks++;
      const escapeAt = getBalance().market.soldOutEscapeTicks;
      if (br.soldOutTicks >= escapeAt) {
        // Force recovery: clear breaker state and emit a one-time informational event.
        const wasEscaped = true;
        events.push({
          type: 'breaker_escape',
          resource: entry.resource,
          delta: '0%',
          severity: 'medium',
          context: {
            cause: `CIRCUIT BREAKER ESCAPE: ${br.soldOutTicks} consecutive soldOut ticks — forcing recovery to basePrice`,
            trend: 'neutral',
            oldPrice: Math.round(oldPrice * 100) / 100,
            newPrice: Math.round(entry.basePrice * 100) / 100,
            buyVolume: p.buyVol,
            sellVolume: p.sellVol,
          },
        });
        if (wasEscaped) { br.soldOut = false; br.cooldown = 0; br.spikes = 0; br.soldOutTicks = 0; newPrice = entry.basePrice; }
      }
    } else {
      br.soldOutTicks = 0;
    }

    newPrices.push({
      resource: entry.resource, currentPrice: Math.round(newPrice * 100) / 100,
      basePrice: entry.basePrice,
      trend: trendForChangePct(changePct),
      volume: p.buyVol + p.sellVol,
    });
    newBreakers[entry.resource] = br;
  }

  const newVolatility = clamp((volatility || 0) * getBalance().market.volatilityDecay + events.length * 0.02, 0, 1);
  return { prices: newPrices, events, volatility: newVolatility, breakers: newBreakers };
}

/** Map a per-tick price change fraction to a severity label. Extracted
 *  to keep marketTick() free of nested ternaries.
 */
function severityForChangePct(
  changePct: number,
): "low" | "medium" | "high" {
  const abs = Math.abs(changePct);
  if (abs > 0.10) return "high";
  if (abs > 0.06) return "medium";
  return "low";
}

/** Map a per-tick price change fraction to a trend label. Extracted
 *  to keep marketTick() free of nested ternaries.
 */
function trendForChangePct(
  changePct: number,
): "up" | "down" | "stable" {
  if (changePct > 0.01) return "up";
  if (changePct < -0.01) return "down";
  return "stable";
}

function categoryForEventType(eventType: unknown): 'price_move' | 'volatility' | 'trade' {
  if (eventType === 'trade') return 'trade';
  if (eventType === 'volatility') return 'volatility';
  return 'price_move';
}

function newsFromEvent(
  event: Record<string, unknown>,
  text: { title?: unknown; description?: unknown; affectedResources?: unknown },
  tick: number,
  index: number,
  textSource: 'llm' | 'fallback',
): Record<string, unknown> {
  const resource = typeof event.resource === 'string' ? event.resource : 'market';
  const delta = typeof event.delta === 'string' ? event.delta : 'changed';
  const severity =
    event.severity === 'low' || event.severity === 'medium' || event.severity === 'high'
      ? event.severity
      : 'medium';
  const affectedResources = Array.isArray(text.affectedResources)
    ? text.affectedResources.filter((r): r is string => typeof r === 'string' && r.length > 0)
    : [resource];

  return {
    id: `market-${tick}-${index}`,
    title: typeof text.title === 'string' ? text.title : `${resource} Market Update`,
    description:
      typeof text.description === 'string'
        ? text.description
        : `${resource} moved ${delta}.`,
    affectedResources,
    impactSummary: `${resource} ${delta}`,
    severity,
    gameTick: tick,
    category: categoryForEventType(event.type),
    textSource,
  };
}

export async function POST() {
  // Phase 3 F3: pull balance overrides BEFORE touching DB. Fail-closed
  // per RULES.md [SEC-002] / [ARC-011]: if Supabase is unreachable, refuse
  // the request. do NOT swallow and fall back to code-level defaults.
  const configLoad = await ensureConfigLoaded();
  if (!configLoad.ok) {
    console.error(
      "[MarketTick] config load failed:",
      configLoad.error ?? "unknown",
    );
    return NextResponse.json(
      { error: 'Service temporarily unavailable', code: 'CONFIG_UNAVAILABLE' },
      { status: 503 },
    );
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
  }

  try {
    // 1. Read current state
    const stateData = await getMarketStateFull();

    // 2. Read player pressure
    const pressureRows = await getAllPlayerPressure();

    // 3. Aggregate pressure
    const pressure: Record<string, PressureData> = {};
    for (const row of pressureRows) {
      if (!pressure[row.resource]) {
        pressure[row.resource] = { buyVol: 0, sellVol: 0 };
      }
      pressure[row.resource].buyVol += row.buy_volume || 0;
      pressure[row.resource].sellVol += row.sell_volume || 0;
    }

    // 3b. Add global supply/demand pressure (same as Cloudflare Worker)
    const supplyDemandRows = await getAllSupplyDemand();
    for (const row of supplyDemandRows) {
      if (!pressure[row.resource]) {
        pressure[row.resource] = { buyVol: 0, sellVol: 0 };
      }
      const production = Number(row.production) || 0;
      const consumption = Number(row.consumption) || 0;
      pressure[row.resource].sellVol += production * getBalance().market.supplyDemandScale;
      pressure[row.resource].buyVol += consumption * getBalance().market.supplyDemandScale;
    }

    // 4. Get or initialize prices
    let prices = (stateData?.prices as unknown as MarketPrice[]) || [];
    if (!Array.isArray(prices) || prices.length === 0) {
      prices = [
        { resource: 'iron', currentPrice: 5, basePrice: 5, trend: 'stable', volume: 0 },
        { resource: 'copper', currentPrice: 8, basePrice: 8, trend: 'stable', volume: 0 },
      ];
    }

    // 5. Run simulation LOCALLY (same logic as Cloudflare Worker marketEngine.js)
    const breakers = (stateData?.circuit_breakers as unknown as Record<string, BreakerState>) || {};
    const result = marketTick(prices, pressure, stateData?.volatility || 0, breakers);

    // 5b. Clamp computed prices to within 50% of basePrice.
    //     The RPC (apply_market_tick) validates ABS((current - base) / base) <= 0.50
    //     and rejects the entire tick if any resource exceeds. Since prices can
    //     drift (mean reversion is slow), the per-tick change can compound.
    //     Clamp here so the RPC accepts the batch.
    for (const p of result.prices) {
      if (!p.basePrice || p.basePrice <= 0) continue;
      const minAllowed = p.basePrice * 0.5;
      const maxAllowed = p.basePrice * 1.5;
      if (p.currentPrice < minAllowed) p.currentPrice = minAllowed;
      if (p.currentPrice > maxAllowed) p.currentPrice = maxAllowed;
    }

    // 6. PERSIST via the Supabase RPC — the validated gate (Rule 1).
    //    The RPC: validates bounds, increments tick atomically, writes
    //    game_config_market_history, clears market_player_pressure.
    //    No direct REST write to server_market_state here.
    const newTick = (stateData?.tick || 0) + 1;
    const { data: rpcSummary, error: rpcError } = await supabase.rpc(
      'apply_market_tick',
      {
        p_tick: newTick,
        p_prices: result.prices as unknown as Record<string, unknown>[],
        p_events: result.events as unknown as Record<string, unknown>[],
        p_volatility: result.volatility,
        p_breakers: result.breakers as unknown as Record<string, unknown>,
      }
    );

    if (rpcError) {
      console.error('[MarketTick] RPC rejected tick', newTick, ':', rpcError.message);
      return NextResponse.json(
        {
          tick: newTick,
          events: result.events.length,
          headlines: 0,
          volatility: result.volatility,
          error: rpcError.message,
        },
        { status: 409 } // Conflict — another caller beat us to this tick
      );
    }

    // 7. Generate AI news (informational, separate from market state)
    let news: Array<Record<string, unknown>> = [];
    if (result.events.length > 0) {
      let textSource: 'llm' | 'fallback' = 'llm';
      try {
        const newsRes = await fetch(NEWS_WORKER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ events: result.events.slice(0, 8) }),
          signal: AbortSignal.timeout(15000),
        });
        if (newsRes.ok) {
          const newsData = await newsRes.json();
          news = newsData.headlines || [];
        }
      } catch {
        console.warn('[MarketTick] AI news failed, using templates');
      }

      if (news.length === 0) {
        textSource = 'fallback';
        news = result.events.slice(0, 5).map(e => ({
          title: `${e.resource} Market Update`,
          description: `${e.resource} moved ${e.delta} due to ${(e.context as Record<string, unknown>).cause}.`,
          affectedResources: [e.resource],
        }));
      }

      news = result.events
        .slice(0, news.length)
        .map((event, index) => newsFromEvent(event, news[index] ?? {}, newTick, index, textSource));
    }

    // 8. Persist news (separate from market state — informational only, no RPC needed)
    if (news.length > 0) {
      await updateMarketNews(news);
    }

    const summary = Array.isArray(rpcSummary) ? rpcSummary[0] : rpcSummary;
    return NextResponse.json({
      tick: summary?.tick_number ?? newTick,
      events: summary?.events_recorded ?? result.events.length,
      prices_recorded: summary?.prices_recorded ?? result.prices.length,
      history_inserted: summary?.history_inserted ?? 0,
      headlines: news.length,
      volatility: result.volatility,
    });
  } catch (err) {
    console.error('[MarketTick] Error:', err);
    return NextResponse.json(
      { error: 'Market tick failed', details: String(err) },
      { status: 500 },
    );
  }
}
