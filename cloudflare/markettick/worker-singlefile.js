// ============================================
// FACTORY DOMINION — Market Tick Cron Worker
// Deploy via Cloudflare Dashboard → Workers & Pages → Create → "markettick"
// Settings → Triggers → Add Cron Trigger → */60 * * * *
// Settings → Variables → Add Secret: SUPABASE_SERVICE_ROLE_KEY
// ============================================

const SUPABASE_URL = 'https://wkkzqtseqwcyyyezroqq.supabase.co';
const NEWS_WORKER_URL = 'https://newsgenerator.malcolmkhong.workers.dev';
const PRESSURE_FACTOR = 0.0005;  // sqrt(volume) for diminishing returns
const VOLATILITY_DECAY = 0.95;
const MIN_PRICE = 1;
const MAX_PRICE = 1000000;
const EVENT_THRESHOLD = 0.04;

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function marketTick(prices, pressure, volatility) {
  const newPrices = [];
  const events = [];
  for (const entry of prices) {
    const p = pressure[entry.resource] || { buyVol: 0, sellVol: 0 };
    const netPressure = p.buyVol - p.sellVol;
    const oldPrice = entry.currentPrice;
    const shift = Math.sign(netPressure) * Math.sqrt(Math.abs(netPressure)) * PRESSURE_FACTOR * (1 + (volatility || 0) * 5);
    const newPrice = clamp(oldPrice + oldPrice * shift, MIN_PRICE, MAX_PRICE);
    const changePct = oldPrice > 0 ? (newPrice - oldPrice) / oldPrice : 0;
    if (Math.abs(changePct) >= EVENT_THRESHOLD) {
      const direction = changePct > 0 ? 'up' : 'down';
      events.push({
        type: 'price_move', resource: entry.resource,
        delta: `${changePct > 0 ? '+' : ''}${(Math.abs(changePct) * 100).toFixed(1)}%`,
        severity: Math.abs(changePct) > 0.10 ? 'high' : Math.abs(changePct) > 0.06 ? 'medium' : 'low',
        context: { cause: netPressure > 0 ? 'buy pressure exceeding supply' : 'sell pressure exceeding demand', trend: direction, oldPrice: Math.round(oldPrice * 100) / 100, newPrice: Math.round(newPrice * 100) / 100, buyVolume: p.buyVol, sellVolume: p.sellVol },
      });
    }
    newPrices.push({ resource: entry.resource, currentPrice: Math.round(newPrice * 100) / 100, basePrice: entry.basePrice, trend: changePct > 0.01 ? 'up' : changePct < -0.01 ? 'down' : 'stable', volume: p.buyVol + p.sellVol });
  }
  return { prices: newPrices, events, volatility: clamp((volatility || 0) * VOLATILITY_DECAY + events.length * 0.02, 0, 1) };
}

export default {
  async scheduled(event, env, ctx) {
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) { console.error('[MarketTick] Missing SUPABASE_SERVICE_ROLE_KEY'); return; }
    try { await processTick(key); } catch (e) { console.error('[MarketTick]', e.message); }
  },
  async fetch(request, env) {
    if (request.method === 'GET') return Response.json({ status: 'ok' });
    if (request.method === 'POST') {
      try { return Response.json(await processTick(env.SUPABASE_SERVICE_ROLE_KEY)); }
      catch (e) { return Response.json({ error: e.message }, { status: 500 }); }
    }
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  },
};

async function processTick(key) {
  const h = { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' };

  const sRes = await fetch(`${SUPABASE_URL}/rest/v1/server_market_state?id=eq.1&select=*`, { headers: { ...h, Accept: 'application/json' } });
  const sData = await sRes.json();
  const state = sData?.[0] || null;

  const pRes = await fetch(`${SUPABASE_URL}/rest/v1/market_player_pressure?select=*`, { headers: { ...h, Accept: 'application/json' } });
  const pRows = await pRes.json();

  const pressure = {};
  const discoveredResources = new Set();
  for (const r of pRows) {
    if (!pressure[r.resource]) pressure[r.resource] = { buyVol: 0, sellVol: 0 };
    pressure[r.resource].buyVol += r.buy_volume || 0;
    pressure[r.resource].sellVol += r.sell_volume || 0;
    discoveredResources.add(r.resource);
  }

  // Build base price map from Supabase (57 resources from INITIAL_MARKET)
  const basePriceMap = {};
  const basePrices = state?.base_prices || [];
  for (const bp of basePrices) { basePriceMap[bp.resource] = bp.basePrice; }

  // Initialize or extend prices
  let prices = state?.prices || [];
  if (!Array.isArray(prices)) prices = [];
  const existingResources = new Set(prices.map(p => p.resource));

  // Add missing resources from base_prices
  for (const bp of basePrices) {
    if (!existingResources.has(bp.resource)) {
      prices.push({ resource: bp.resource, currentPrice: bp.basePrice, basePrice: bp.basePrice, trend: 'stable', volume: 0 });
    }
  }

  // Auto-discover: add resources from pressure pool not yet in prices
  for (const res of discoveredResources) {
    if (!existingResources.has(res) && !basePriceMap[res]) {
      const avg = Object.values(basePriceMap).reduce((a, b) => a + b, 0) / Math.max(1, Object.keys(basePriceMap).length);
      prices.push({ resource: res, currentPrice: avg, basePrice: avg, trend: 'stable', volume: 0 });
    }
  }

  // Fallback: seed minimal prices if completely empty
  if (prices.length === 0 && Object.keys(basePriceMap).length === 0) {
    prices = [
      { resource: 'iron', currentPrice: 5, basePrice: 5, trend: 'stable', volume: 0 },
      { resource: 'copper', currentPrice: 8, basePrice: 8, trend: 'stable', volume: 0 },
      { resource: 'coal', currentPrice: 3, basePrice: 3, trend: 'stable', volume: 0 },
      { resource: 'oil', currentPrice: 12, basePrice: 12, trend: 'stable', volume: 0 },
    ];
  }

  const result = marketTick(prices, pressure, state?.volatility || 0);

  // AI news
  let news = [];
  if (result.events.length > 0) {
    try {
      const nRes = await fetch(NEWS_WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events: result.events.slice(0, 8) }) });
      if (nRes.ok) { const d = await nRes.json(); news = d.headlines || []; }
    } catch {}
    if (news.length === 0) {
      news = result.events.slice(0, 5).map(e => ({ title: `${e.resource} Market Update`, description: `${e.resource} moved ${e.delta} due to ${e.context.cause}.`, affectedResources: [e.resource] }));
    }
  }

  // Store
  const newTick = (state?.tick || 0) + 1;
  await fetch(`${SUPABASE_URL}/rest/v1/server_market_state?id=eq.1`, { method: 'PATCH', headers: { ...h, Prefer: 'return=minimal' }, body: JSON.stringify({ tick: newTick, prices: result.prices, news, volatility: result.volatility, updated_at: new Date().toISOString() }) });

  // Clear pressure pool
  for (let i = 0; i < pRows.length; i += 50) {
    const batch = pRows.slice(i, i + 50);
    const filter = batch.map(r => `(user_id.eq.${r.user_id},resource.eq.${r.resource})`).join(',');
    if (filter) { await fetch(`${SUPABASE_URL}/rest/v1/market_player_pressure?or=(${encodeURIComponent(filter)})`, { method: 'DELETE', headers: h }).catch(() => {}); }
  }

  console.log(`[MarketTick] Tick ${newTick}: ${result.events.length} events, ${news.length} headlines`);
  return { tick: newTick, events: result.events.length, headlines: news.length };
}
