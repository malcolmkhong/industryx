// ============================================
// POST /api/market/tick
// Manual market tick processor — can be called
// by Vercel Cron or manually via curl.
// Does everything the Cloudflare worker does,
// using the existing Supabase service role client.
// ============================================

import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

const PRESSURE_FACTOR = 0.0005;
const VOLATILITY_DECAY = 0.95;
const MIN_PRICE = 1;
const MAX_PRICE = 1_000_000;
const EVENT_THRESHOLD = 0.04;
const SPIKE_CAP = 0.40;
const BREAKER_COOLDOWN = 5;

interface BreakerState {
  cooldown: number;
  spikes: number;
  soldOut: boolean;
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
    const br = breakers[entry.resource] || { cooldown: 0, spikes: 0, soldOut: false };
    let netPressure = p.buyVol - p.sellVol;
    const oldPrice = entry.currentPrice;

    const isSoldOut = (p.sellVol === 0 && p.buyVol > 0 && netPressure > 0);
    if (isSoldOut) { br.soldOut = true; br.cooldown = BREAKER_COOLDOWN; netPressure = 0; }
    if (br.cooldown > 0 && br.soldOut) { netPressure = 0; br.cooldown--; }
    else if (br.cooldown > 0) { netPressure = Math.min(0, netPressure); br.cooldown--; }

    const shift = Math.sign(netPressure) * Math.sqrt(Math.abs(netPressure)) * PRESSURE_FACTOR * (1 + (volatility || 0) * 5);
    let newPrice = clamp(oldPrice + oldPrice * shift, MIN_PRICE, MAX_PRICE);
    const changePct = oldPrice > 0 ? (newPrice - oldPrice) / oldPrice : 0;

    if (Math.abs(changePct) > SPIKE_CAP) {
      const sign = changePct > 0 ? 1 : -1;
      newPrice = oldPrice * (1 + sign * SPIKE_CAP);
      br.spikes++; br.cooldown = BREAKER_COOLDOWN;
      events.push({
        type: 'price_move', resource: entry.resource,
        delta: `${sign > 0 ? '+' : ''}${(SPIKE_CAP * 100).toFixed(1)}%`,
        severity: 'high',
        context: {
          cause: `CIRCUIT BREAKER: ${(Math.abs(changePct) * 100).toFixed(0)}% spike capped at 40%${br.soldOut ? ' — SOLD OUT' : ''}`,
          trend: sign > 0 ? 'up' : 'down',
          oldPrice: Math.round(oldPrice * 100) / 100, newPrice: Math.round(newPrice * 100) / 100,
          buyVolume: p.buyVol, sellVolume: p.sellVol,
        },
      });
    } else if (Math.abs(changePct) >= EVENT_THRESHOLD) {
      events.push({
        type: 'price_move', resource: entry.resource,
        delta: `${changePct > 0 ? '+' : ''}${(Math.abs(changePct) * 100).toFixed(1)}%`,
        severity: Math.abs(changePct) > 0.10 ? 'high' : Math.abs(changePct) > 0.06 ? 'medium' : 'low',
        context: {
          cause: netPressure > 0 ? 'buy pressure exceeding supply' : 'sell pressure exceeding demand',
          trend: changePct > 0 ? 'up' : 'down',
          oldPrice: Math.round(oldPrice * 100) / 100, newPrice: Math.round(newPrice * 100) / 100,
          buyVolume: p.buyVol, sellVolume: p.sellVol,
        },
      });
    }

    if (br.soldOut && p.sellVol > 0) { br.soldOut = false; br.cooldown = 0; }
    if (br.cooldown <= 0 && !br.soldOut) { br.spikes = 0; }

    newPrices.push({
      resource: entry.resource, currentPrice: Math.round(newPrice * 100) / 100,
      basePrice: entry.basePrice,
      trend: changePct > 0.01 ? 'up' : changePct < -0.01 ? 'down' : 'stable',
      volume: p.buyVol + p.sellVol,
    });
    newBreakers[entry.resource] = br;
  }

  const newVolatility = clamp((volatility || 0) * VOLATILITY_DECAY + events.length * 0.02, 0, 1);
  return { prices: newPrices, events, volatility: newVolatility, breakers: newBreakers };
}

export async function POST() {
  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
  }

  try {
    // 1. Read current state
    const { data: stateData } = await supabase
      .from('server_market_state')
      .select('*')
      .eq('id', 1)
      .single();

    // 2. Read player pressure
    const { data: pressureRows } = await supabase
      .from('market_player_pressure')
      .select('*');

    // 3. Aggregate pressure
    const pressure: Record<string, PressureData> = {};
    for (const row of pressureRows || []) {
      if (!pressure[row.resource]) {
        pressure[row.resource] = { buyVol: 0, sellVol: 0 };
      }
      pressure[row.resource].buyVol += row.buy_volume || 0;
      pressure[row.resource].sellVol += row.sell_volume || 0;
    }

    // 4. Sync base_prices from game_config_market (admin-added resources)
    const { data: marketConfig } = await supabase
      .from('game_config_market')
      .select('resource_id, base_price');
    if (marketConfig && marketConfig.length > 0) {
      const synced = marketConfig.map((m: { resource_id: string; base_price: number }) => ({
        resource: m.resource_id,
        basePrice: m.base_price,
      }));
      await supabase
        .from('server_market_state')
        .update({ base_prices: synced })
        .eq('id', 1);
    }

    // 5. Get or initialize prices from base_prices
    let prices = (stateData?.prices as MarketPrice[]) || [];
    if (!Array.isArray(prices)) prices = [];
    const basePrices = (stateData?.base_prices as Array<{ resource: string; basePrice: number }>) || [];
    const existingResources = new Set(prices.map(p => p.resource));

    for (const bp of basePrices) {
      if (!existingResources.has(bp.resource)) {
        prices.push({ resource: bp.resource, currentPrice: bp.basePrice, basePrice: bp.basePrice, trend: 'stable', volume: 0 });
        existingResources.add(bp.resource);
      }
    }

    if (prices.length === 0) {
      prices = [
        { resource: 'iron', currentPrice: 5, basePrice: 5, trend: 'stable', volume: 0 },
        { resource: 'copper', currentPrice: 8, basePrice: 8, trend: 'stable', volume: 0 },
      ];
    }

    // 5. Run market simulation with circuit breakers
    const breakers = (stateData?.circuit_breakers as Record<string, BreakerState>) || {};
    const result = marketTick(prices, pressure, stateData?.volatility || 0, breakers);

    // 6. Generate AI news
    let news: Array<Record<string, unknown>> = [];
    if (result.events.length > 0) {
      try {
        const newsUrl = process.env.MARKET_NEWS_WORKER_URL ||
          'https://newsgenerator.malcolmkhong.workers.dev';
        const newsRes = await fetch(newsUrl, {
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
        news = result.events.slice(0, 5).map(e => ({
          title: `${e.resource} Market Update`,
          description: `${e.resource} moved ${e.delta} due to ${(e.context as Record<string, unknown>).cause}.`,
          affectedResources: [e.resource],
        }));
      }
    }

    // 7. Store updated state
    const newTick = (stateData?.tick || 0) + 1;
    await supabase
      .from('server_market_state')
      .update({
        tick: newTick,
        prices: result.prices,
        news,
        volatility: result.volatility,
        circuit_breakers: result.breakers,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);

    // 8. Clear pressure pool
    if (pressureRows && pressureRows.length > 0) {
      const ids = pressureRows.map(r => r.user_id);
      const resources = pressureRows.map(r => r.resource);
      await supabase
        .from('market_player_pressure')
        .delete()
        .in('user_id', ids)
        .in('resource', resources);
    }

    return NextResponse.json({
      tick: newTick,
      events: result.events.length,
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
