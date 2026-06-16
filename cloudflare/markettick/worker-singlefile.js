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
const SPIKE_CAP = 0.40;          // Max 40% price change per tick
const SOLD_OUT_RATIO = 10;       // buyVol > sellVol * 10 = sold out
const BREAKER_COOLDOWN = 5;      // Ticks before circuit breaker releases

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function marketTick(prices, pressure, volatility, breakers) {
  const newPrices = [];
  const events = [];
  const newBreakers = { ...breakers };

  for (const entry of prices) {
    const res = entry.resource;
    const p = pressure[res] || { buyVol: 0, sellVol: 0 };
    const br = breakers[res] || { cooldown: 0, spikes: 0, soldOut: false };
    let netPressure = p.buyVol - p.sellVol;
    const oldPrice = entry.currentPrice;

    // Circuit breaker: sold out (no sellers, buyers piling up)
    const isSoldOut = (p.sellVol === 0 && p.buyVol > 0 && netPressure > 0);
    if (isSoldOut) {
      br.soldOut = true;
      br.cooldown = BREAKER_COOLDOWN;
      netPressure = 0; // freeze price — can't buy what doesn't exist
    }

    // Circuit breaker: still in cooldown from previous spike
    if (br.cooldown > 0 && br.soldOut) {
      netPressure = 0; // completely frozen — no trades possible
      br.cooldown--;
    } else if (br.cooldown > 0) {
      // Cooling off from spike — only allow sell pressure (downward)
      netPressure = Math.min(0, netPressure);
      br.cooldown--;
    }

    // Calculate new price
    const shift = Math.sign(netPressure) * Math.sqrt(Math.abs(netPressure)) * PRESSURE_FACTOR * (1 + (volatility || 0) * 5);
    let newPrice = clamp(oldPrice + oldPrice * shift, MIN_PRICE, MAX_PRICE);

    // Spike protection: cap at 40% per tick
    const changePct = oldPrice > 0 ? (newPrice - oldPrice) / oldPrice : 0;
    if (Math.abs(changePct) > SPIKE_CAP) {
      const sign = changePct > 0 ? 1 : -1;
      newPrice = oldPrice * (1 + sign * SPIKE_CAP);
      br.spikes++;
      br.cooldown = BREAKER_COOLDOWN;
      const cappedPct = sign * SPIKE_CAP;
      events.push({
        type: 'price_move', resource: res,
        delta: `${cappedPct > 0 ? '+' : ''}${(Math.abs(cappedPct) * 100).toFixed(1)}%`,
        severity: 'high',
        context: {
          cause: `CIRCUIT BREAKER: ${(Math.abs(changePct) * 100).toFixed(0)}% spike capped at ${(SPIKE_CAP * 100).toFixed(0)}%${br.soldOut ? ' — SOLD OUT' : ''}`,
          trend: cappedPct > 0 ? 'up' : 'down',
          oldPrice: Math.round(oldPrice * 100) / 100,
          newPrice: Math.round(newPrice * 100) / 100,
          buyVolume: p.buyVol, sellVolume: p.sellVol,
        },
      });
    } else if (Math.abs(changePct) >= EVENT_THRESHOLD) {
      const cappedPct = changePct;
      events.push({
        type: 'price_move', resource: res,
        delta: `${cappedPct > 0 ? '+' : ''}${(Math.abs(cappedPct) * 100).toFixed(1)}%`,
        severity: Math.abs(cappedPct) > 0.10 ? 'high' : Math.abs(cappedPct) > 0.06 ? 'medium' : 'low',
        context: {
          cause: netPressure > 0 ? 'buy pressure exceeding supply' : 'sell pressure exceeding demand',
          trend: cappedPct > 0 ? 'up' : 'down',
          oldPrice: Math.round(oldPrice * 100) / 100,
          newPrice: Math.round(newPrice * 100) / 100,
          buyVolume: p.buyVol, sellVolume: p.sellVol,
        },
      });
    }

    // Release sold-out state when sell volume returns
    if (br.soldOut && p.sellVol > 0) {
      br.soldOut = false;
      br.cooldown = 0;
    }

    // Reset breaker when cooldown expires
    if (br.cooldown <= 0 && !br.soldOut) {
      br.spikes = 0;
    }

    newPrices.push({
      resource: res,
      currentPrice: Math.round(newPrice * 100) / 100,
      basePrice: entry.basePrice,
      trend: changePct > 0.01 ? 'up' : changePct < -0.01 ? 'down' : 'stable',
      volume: p.buyVol + p.sellVol,
    });

    newBreakers[res] = br;
  }

  return {
    prices: newPrices,
    events,
    volatility: clamp((volatility || 0) * VOLATILITY_DECAY + events.length * 0.02, 0, 1),
    breakers: newBreakers,
  };
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

  const basePriceMap = {};
  const basePrices = state?.base_prices || [];
  for (const bp of basePrices) { basePriceMap[bp.resource] = bp.basePrice; }

  let prices = state?.prices || [];
  if (!Array.isArray(prices)) prices = [];
  const existingResources = new Set(prices.map(p => p.resource));

  for (const bp of basePrices) {
    if (!existingResources.has(bp.resource)) {
      prices.push({ resource: bp.resource, currentPrice: bp.basePrice, basePrice: bp.basePrice, trend: 'stable', volume: 0 });
      existingResources.add(bp.resource);
    }
  }

  for (const res of discoveredResources) {
    if (!existingResources.has(res) && !basePriceMap[res]) {
      const avg = Object.values(basePriceMap).reduce((a, b) => a + b, 0) / Math.max(1, Object.keys(basePriceMap).length);
      prices.push({ resource: res, currentPrice: avg, basePrice: avg, trend: 'stable', volume: 0 });
      existingResources.add(res);
    }
  }

  if (prices.length === 0) {
    prices = [
      { resource: 'iron', currentPrice: 5, basePrice: 5, trend: 'stable', volume: 0 },
      { resource: 'copper', currentPrice: 8, basePrice: 8, trend: 'stable', volume: 0 },
    ];
  }

  const breakers = state?.circuit_breakers || {};
  const result = marketTick(prices, pressure, state?.volatility || 0, breakers);

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

  const newTick = (state?.tick || 0) + 1;
  await fetch(`${SUPABASE_URL}/rest/v1/server_market_state?id=eq.1`, {
    method: 'PATCH',
    headers: { ...h, Prefer: 'return=minimal' },
    body: JSON.stringify({
      tick: newTick, prices: result.prices, news,
      volatility: result.volatility, circuit_breakers: result.breakers,
      updated_at: new Date().toISOString(),
    }),
  });

  for (let i = 0; i < pRows.length; i += 50) {
    const batch = pRows.slice(i, i + 50);
    const filter = batch.map(r => `(user_id.eq.${r.user_id},resource.eq.${r.resource})`).join(',');
    if (filter) { await fetch(`${SUPABASE_URL}/rest/v1/market_player_pressure?or=(${encodeURIComponent(filter)})`, { method: 'DELETE', headers: h }).catch(() => {}); }
  }

  console.log(`[MarketTick] Tick ${newTick}: ${result.events.length} events, ${news.length} headlines`);
  return { tick: newTick, events: result.events.length, headlines: news.length };
}
