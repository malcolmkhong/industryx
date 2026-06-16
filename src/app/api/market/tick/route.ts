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

const DEFAULT_RESOURCES = [
  { resource: 'iron', basePrice: 10 }, { resource: 'copper', basePrice: 8 },
  { resource: 'coal', basePrice: 6 }, { resource: 'oil', basePrice: 15 },
  { resource: 'sand', basePrice: 4 }, { resource: 'lithium', basePrice: 20 },
  { resource: 'ironPlate', basePrice: 25 }, { resource: 'copperWire', basePrice: 22 },
  { resource: 'plastic', basePrice: 15 }, { resource: 'steel', basePrice: 40 },
  { resource: 'circuit', basePrice: 80 }, { resource: 'engine', basePrice: 150 },
  { resource: 'battery', basePrice: 70 }, { resource: 'gear', basePrice: 50 },
  { resource: 'aiChip', basePrice: 600 }, { resource: 'robotics', basePrice: 2500 },
];

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
) {
  const newPrices: MarketPrice[] = [];
  const events: Array<Record<string, unknown>> = [];

  for (const entry of prices) {
    const p = pressure[entry.resource] || { buyVol: 0, sellVol: 0 };
    const netPressure = p.buyVol - p.sellVol;
    const oldPrice = entry.currentPrice;
    const shift = Math.sign(netPressure) * Math.sqrt(Math.abs(netPressure)) * PRESSURE_FACTOR * (1 + (volatility || 0) * 5);
    const newPrice = clamp(oldPrice + oldPrice * shift, MIN_PRICE, MAX_PRICE);
    const changePct = oldPrice > 0 ? (newPrice - oldPrice) / oldPrice : 0;

    if (Math.abs(changePct) >= EVENT_THRESHOLD) {
      events.push({
        type: 'price_move',
        resource: entry.resource,
        delta: `${changePct > 0 ? '+' : ''}${(Math.abs(changePct) * 100).toFixed(1)}%`,
        severity:
          Math.abs(changePct) > 0.10 ? 'high'
          : Math.abs(changePct) > 0.06 ? 'medium'
          : 'low',
        context: {
          cause: netPressure > 0 ? 'buy pressure exceeding supply' : 'sell pressure exceeding demand',
          trend: changePct > 0 ? 'up' : 'down',
          oldPrice: Math.round(oldPrice * 100) / 100,
          newPrice: Math.round(newPrice * 100) / 100,
          buyVolume: p.buyVol,
          sellVolume: p.sellVol,
        },
      });
    }

    newPrices.push({
      resource: entry.resource,
      currentPrice: Math.round(newPrice * 100) / 100,
      basePrice: entry.basePrice,
      trend: changePct > 0.01 ? 'up' : changePct < -0.01 ? 'down' : 'stable',
      volume: p.buyVol + p.sellVol,
    });
  }

  const newVolatility = clamp(
    (volatility || 0) * VOLATILITY_DECAY + events.length * 0.02,
    0,
    1,
  );

  return { prices: newPrices, events, volatility: newVolatility };
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

    // 4. Get or initialize prices
    let prices = (stateData?.prices as MarketPrice[]) || [];
    if (!Array.isArray(prices) || prices.length === 0) {
      prices = DEFAULT_RESOURCES.map(r => ({
        resource: r.resource,
        currentPrice: r.basePrice,
        basePrice: r.basePrice,
        trend: 'stable',
        volume: 0,
      }));
    }

    // 5. Run market simulation
    const result = marketTick(prices, pressure, stateData?.volatility || 0);

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
