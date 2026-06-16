// ============================================
// FACTORY DOMINION — Cloudflare Cron Worker
// Global Market Tick Processor
// ============================================
// Runs every 60 seconds via Cloudflare Cron.
// 1. Reads aggregate player pressure from Supabase
// 2. Runs market simulation via marketEngine.js
// 3. Sends events to newsgenerator worker for AI news
// 4. Stores updated prices + news in Supabase
// 5. Clears the pressure pool
// ============================================

import { tick, createInitialPrices } from './shared/marketEngine.js';

// ── Config ──────────────────────────────────────────────
const SUPABASE_URL = 'https://wkkzqtseqwcyyyezroqq.supabase.co';
const NEWS_WORKER_URL = 'https://newsgenerator.malcolmkhong.workers.dev';

// ── Default market definition (seed prices) ────────────
// This is used ONLY on first tick when the table is empty.
// After that, prices evolve from previous tick.
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

export default {
  // ── Cron trigger ─────────────────────────────────
  async scheduled(event, env, ctx) {
    console.log('[MarketTick] Cron fired');
    const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseKey) {
      console.error('[MarketTick] Missing SUPABASE_SERVICE_ROLE_KEY');
      return;
    }

    try {
      await processTick(supabaseKey);
    } catch (err) {
      console.error('[MarketTick] Error:', err?.message || err);
    }
  },

  // ── HTTP handler (for manual trigger / debug) ──────
  async fetch(request, env) {
    if (request.method === 'GET') {
      return Response.json({ status: 'ok', message: 'Market tick worker' });
    }
    if (request.method === 'POST') {
      const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
      if (!supabaseKey) {
        return Response.json({ error: 'Missing key' }, { status: 500 });
      }
      try {
        const result = await processTick(supabaseKey);
        return Response.json(result);
      } catch (err) {
        return Response.json({ error: err.message }, { status: 500 });
      }
    }
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  },
};

// ── Tick Processor ───────────────────────────────────

async function processTick(supabaseKey) {
  const headers = {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
  };

  // 1. Read current state
  const stateRes = await fetch(
    `${SUPABASE_URL}/rest/v1/server_market_state?id=eq.1&select=*`,
    { headers: { ...headers, 'Accept': 'application/json' } }
  );
  const stateData = await stateRes.json();
  const state = stateData?.[0] || null;

  // 2. Read aggregate player pressure
  const pressureRes = await fetch(
    `${SUPABASE_URL}/rest/v1/market_player_pressure?select=*`,
    { headers: { ...headers, 'Accept': 'application/json' } }
  );
  const pressureRows = await pressureRes.json();

  // Aggregate pressure per resource
  const pressure = {};
  for (const row of pressureRows) {
    if (!pressure[row.resource]) {
      pressure[row.resource] = { buyVol: 0, sellVol: 0 };
    }
    pressure[row.resource].buyVol += row.buy_volume || 0;
    pressure[row.resource].sellVol += row.sell_volume || 0;
  }

  // 3. Get or initialize prices
  let prices = state?.prices || [];
  if (!Array.isArray(prices) || prices.length === 0) {
    prices = createInitialPrices(DEFAULT_RESOURCES);
  }

  // 4. Run market simulation
  const currentVolatility = state?.volatility || 0;
  const result = tick(prices, pressure, currentVolatility);

  // 5. Generate AI news
  let news = [];
  if (result.events.length > 0) {
    try {
      const newsRes = await fetch(NEWS_WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: result.events.slice(0, 8) }),
      });
      if (newsRes.ok) {
        const newsData = await newsRes.json();
        news = newsData.headlines || [];
      }
    } catch (err) {
      console.warn('[MarketTick] AI news failed, using templates');
    }

    // If AI failed, generate template news
    if (news.length === 0) {
      news = result.events.slice(0, 5).map(e => ({
        title: `${e.resource} Market Update`,
        description: `${e.resource} prices moved ${e.delta} due to ${e.context.cause}.`,
        affectedResources: [e.resource],
      }));
    }
  }

  // 6. Store updated state
  const newTick = (state?.tick || 0) + 1;
  const updateBody = {
    tick: newTick,
    prices: result.prices,
    news,
    volatility: result.volatility,
    updated_at: new Date().toISOString(),
  };

  await fetch(`${SUPABASE_URL}/rest/v1/server_market_state?id=eq.1`, {
    method: 'PATCH',
    headers: { ...headers, 'Prefer': 'return=minimal' },
    body: JSON.stringify(updateBody),
  });

  // 7. Clear pressure pool
  if (pressureRows.length > 0) {
    const deleteIds = pressureRows.map(r => `user_id=eq.${r.user_id}&resource=eq.${r.resource}`).join('&or=');
    if (deleteIds) {
      // Delete in batches (Supabase REST has URL length limits)
      for (let i = 0; i < pressureRows.length; i += 50) {
        const batch = pressureRows.slice(i, i + 50);
        const filter = batch.map(r =>
          `(user_id.eq.${r.user_id},resource.eq.${r.resource})`
        ).join(',');
        await fetch(
          `${SUPABASE_URL}/rest/v1/market_player_pressure?or=(${encodeURIComponent(filter)})`,
          { method: 'DELETE', headers }
        );
      }
    }
  }

  console.log(`[MarketTick] Tick ${newTick}: ${result.events.length} events, ${news.length} headlines`);

  return {
    tick: newTick,
    events: result.events.length,
    headlines: news.length,
    volatility: result.volatility,
  };
}
