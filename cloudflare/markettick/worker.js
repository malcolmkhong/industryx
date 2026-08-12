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

import { tick, createInitialPrices } from "./shared/marketEngine.js";
import { fetchNowIsoMs } from "./shared/serverTime.js";

// ── Config ──────────────────────────────────────────────
const SUPABASE_URL = "https://wkkzqtseqwcyyyezroqq.supabase.co";
const NEWS_WORKER_URL = "https://newsgenerator.malcolmkhong.workers.dev";

// ── Default market definition (seed prices) ────────────
// This is used ONLY on first tick when the table is empty.
// After that, prices evolve from previous tick.
const DEFAULT_RESOURCES = [
  { resource: "iron", basePrice: 10 },
  { resource: "copper", basePrice: 8 },
  { resource: "coal", basePrice: 6 },
  { resource: "oil", basePrice: 15 },
  { resource: "sand", basePrice: 4 },
  { resource: "lithium", basePrice: 20 },
  { resource: "ironPlate", basePrice: 25 },
  { resource: "copperWire", basePrice: 22 },
  { resource: "plastic", basePrice: 15 },
  { resource: "steel", basePrice: 40 },
  { resource: "circuit", basePrice: 80 },
  { resource: "engine", basePrice: 150 },
  { resource: "battery", basePrice: 70 },
  { resource: "gear", basePrice: 50 },
  { resource: "aiChip", basePrice: 600 },
  { resource: "robotics", basePrice: 2500 },
];

const worker = {
  // ── Cron trigger ─────────────────────────────────
  async scheduled(event, env, ctx) {
    console.log("[MarketTick] Cron fired");
    const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseKey) {
      console.error("[MarketTick] Missing SUPABASE_SERVICE_ROLE_KEY");
      return;
    }

    try {
      await processTick(supabaseKey);
    } catch (err) {
      console.error("[MarketTick] Error:", err?.message || err);
    }
  },

  // ── HTTP handler (for manual trigger / debug) ──────
  async fetch(request, env) {
    if (request.method === "GET") {
      return Response.json({ status: "ok", message: "Market tick worker" });
    }
    if (request.method === "POST") {
      const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
      if (!supabaseKey) {
        return Response.json({ error: "Missing key" }, { status: 500 });
      }
      try {
        const result = await processTick(supabaseKey);
        return Response.json(result);
      } catch (err) {
        return Response.json({ error: err.message }, { status: 500 });
      }
    }
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  },
};

export default worker;

// ── Tick Processor ───────────────────────────────────
//
// Per the architecture rules:
//   - Cloudflare EXECUTES the simulation (marketEngine.tick() is the engine)
//   - Supabase VALIDATES + PERSISTS (via the apply_market_tick RPC, the gate)
//
// This worker no longer writes server_market_state directly. Every market
// tick must go through the apply_market_tick RPC which validates bounds,
// increments the tick atomically, writes history, and clears the pressure
// pool — all in one transaction.

async function fetchState(headers) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/server_market_state?id=eq.1&select=tick,prices,volatility,circuit_breakers`,
    { headers: { ...headers, Accept: "application/json" } },
  );
  const rows = await res.json();
  return rows?.[0] || null;
}

async function fetchPressure(headers) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/market_player_pressure?select=resource,buy_volume,sell_volume`,
    { headers: { ...headers, Accept: "application/json" } },
  );
  const rows = await res.json();
  const pressure = {};
  for (const row of rows || []) {
    if (!pressure[row.resource])
      pressure[row.resource] = { buyVol: 0, sellVol: 0 };
    pressure[row.resource].buyVol += row.buy_volume || 0;
    pressure[row.resource].sellVol += row.sell_volume || 0;
  }
  return pressure;
}

async function callApplyMarketTick(headers, payload) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/apply_market_tick`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const msg = errBody?.message || `HTTP ${res.status}`;
    throw new Error(`apply_market_tick RPC failed: ${msg}`);
  }
  return res.json();
}

async function fetchAINews(events) {
  try {
    const res = await fetch(NEWS_WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events: events.slice(0, 8) }),
    });
    if (res.ok) {
      const data = await res.json();
      return data.headlines || [];
    }
  } catch (err) {
    console.warn("[MarketTick] AI news fetch failed:", err.message);
  }
  // Fallback: template news
  return events.slice(0, 5).map((e) => ({
    title: `${e.resource} Market Update`,
    description: `${e.resource} prices moved ${e.delta} due to ${e.context.cause}.`,
    affectedResources: [e.resource],
  }));
}

async function persistNews(headers, news) {
  if (!news || news.length === 0) return;
  // Phase 6: source `updated_at` from the authoritative Postgres
  // `now_iso` RPC via fetchNowIsoMs rather than from the worker
  // wall clock. The Next.js side reads the same RPC, so the two
  // halves of the system cannot disagree on the timestamp.
  const nowMs = await fetchNowIsoMs(SUPABASE_URL, headers);
  if (!Number.isFinite(nowMs)) {
    console.warn("[MarketTick] persistNews: fetchNowIsoMs failed; skipping");
    return;
  }
  const updatedAt = new Date(nowMs).toISOString();
  await fetch(`${SUPABASE_URL}/rest/v1/server_market_state?id=eq.1`, {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify({ news, updated_at: updatedAt }),
  });
}

async function processTick(supabaseKey) {
  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    "Content-Type": "application/json",
  };

  // 1. Read current state (read-only — direct REST is fine)
  const state = await fetchState(headers);

  // 2. Aggregate player pressure
  const pressure = await fetchPressure(headers);

  // 3. Initialize prices if first tick
  let prices = state?.prices || [];
  if (!Array.isArray(prices) || prices.length === 0) {
    prices = createInitialPrices(DEFAULT_RESOURCES);
  }

  // 4. Run simulation LOCALLY — Cloudflare EXECUTES (per Rule 1)
  const result = tick(
    prices,
    pressure,
    state?.volatility || 0,
    state?.circuit_breakers || {},
  );

  // 5. Persist via Supabase RPC — the validated gate (Rule 1)
  //    The RPC: validates bounds, increments tick, writes history, clears pressure.
  const newTick = (state?.tick || 0) + 1;
  let summary;
  try {
    summary = await callApplyMarketTick(headers, {
      p_tick: newTick,
      p_prices: result.prices,
      p_events: result.events,
      p_volatility: result.volatility,
      p_breakers: result.breakers,
    });
  } catch (err) {
    console.error("[MarketTick] RPC rejected tick", newTick, ":", err.message);
    // Don't retry — next cron tick will compute against fresh state.
    return {
      tick: newTick,
      events: 0,
      headlines: 0,
      volatility: result.volatility,
      error: err.message,
    };
  }

  // 6. Generate AI news (informational, separate from market state)
  const news = result.events.length > 0 ? await fetchAINews(result.events) : [];

  // 7. Persist news (separate from market state — no RPC needed, low-risk)
  await persistNews(headers, news);

  console.log(
    `[MarketTick] tick=${newTick} events=${result.events.length} headlines=${news.length}`,
  );

  return {
    tick: newTick,
    events: result.events.length,
    headlines: news.length,
    volatility: result.volatility,
  };
}
