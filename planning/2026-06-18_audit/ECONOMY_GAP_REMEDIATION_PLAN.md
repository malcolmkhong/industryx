# Economy Gap Remediation Plan

**Date:** 2026-06-17
**Scope:** 4 gaps identified during economic-system audit
**Source audit:** Trade endpoint + TradingPostPanel + marketSimulator + admin market page
**Estimated effort:** 4–6 days focused engineering
**Target:** Fully server-authoritative, data-driven economic system

---

## Authority & Trust Chain

This plan modifies the **trading + market simulation + admin market pages only**. It does not change:

- The Zustand store contract (`useGameStore`, `useSettingsStore`)
- The Supabase auth flow
- The cloud sync layer
- The save/import system
- Any game balance values currently hardcoded in `data.ts` (separate concern)

All changes preserve existing data shape, RLS policies, and security posture.

---

## Existing State (audit findings 2026-06-17)

| Component | Status |
|---|---|
| `cloudflare/markettick/` worker | ✅ Production, runs every 60s |
| `/api/market/tick` Next.js route | ✅ Mirror of CF worker, also runnable |
| `server_market_state` table | ✅ Migration 029 |
| `market_player_pressure` table | ✅ Migration 029 |
| `game_config_market` table | ✅ Migration 013+030 (resource_id, base_price, is_tradable) |
| `useServerMarket()` hook | ✅ Polls /api/market/state every 10s, writes to `state.serverMarket` |
| Store sync from server market | ✅ `store.ts:1150-1158` updates `state.market` from `state.serverMarket.prices` every 5 ticks |
| Market simulator library | ✅ `marketSimulator.ts` (sectors, elasticity, correlations, circuit breakers) |
| Admin market page | ⚠️ View-only, no add/edit |
| **Trade endpoint** | ⚠️ **Reads `base_price` from `game_config_market` — ignores live `current_price`** |
| **TradingPostPanel** | ⚠️ **Reads `INITIAL_MARKET` static const — ignores live market** |
| **Resource sector/elasticity** | ❌ **Hardcoded in `marketSimulator.ts` — new resources get no sector** |
| **Admin add-resource UI** | ❌ **Missing — only `is_tradable` + `base_price` can be modified** |
| **Production/consumption in sim** | ❌ **Per-player `productionSnapshot` exists in store but isn't aggregated globally** |

---

## Gaps & Fixes

### Gap 1 — Trade endpoint uses static base_price [P0]

**File:** `src/app/api/game/trade/route.ts:162-163`

**Current:**
```ts
const givePrice = Number((giveRow as { base_price?: number } | undefined)?.base_price ?? 0);
const receivePrice = Number((receiveRow as { base_price?: number } | undefined)?.base_price ?? 0);
```

**Fix:**
```ts
// Read live current_price from server_market_state; fall back to base_price only on first tick (when market hasn't initialized)
const { data: marketState } = await supabase
  .from('server_market_state')
  .select('prices')
  .eq('id', 1)
  .single();
const livePrices = (marketState?.prices ?? []) as Array<{ resource: string; currentPrice: number }>;
const givePrice = livePrices.find(p => p.resource === giveResource)?.currentPrice ?? giveRow.base_price;
const receivePrice = livePrices.find(p => p.resource === receiveResource)?.currentPrice ?? receiveRow.base_price;
```

**Add: Slippage for large trades** (proportional impact)
- Trades > 1% of recent volume move the price by `size × elasticity × 0.001` against the trader
- Use existing `RESOURCE_ELASTICITY` from `marketSimulator` (will move to DB in Gap 3)
- Pre-trade price quote includes the slippage estimate

**Validation:** Tests for normal trade, large-trade slippage, missing-market fallback, capacity overflow.

---

### Gap 2 — TradingPostPanel uses static INITIAL_MARKET [P0]

**File:** `src/components/game/TradingPostPanel.tsx:64-78, 449-454, 264`

**Current:** `getBasePrice()` reads from `INITIAL_MARKET` (static const).

**Fix:** Subscribe to `state.market` (which is server-synced). Replace `INITIAL_MARKET` lookup with store selector.
- `getBasePrice` becomes a hook-derived function
- `useMemo` for `quickTradeAmounts` adds `state.market` to deps
- `formatExchangeRate` and `calculateReceiveAmount` use the live market

**Add: Price-change indicator** in the UI:
- Show "↑ 5%" / "↓ 3%" badge if current price differs from previous render
- Show small "(live)" tooltip to inform player the price is dynamic

**UI/UX quality (per user request):**
- Use existing `text-success`/`text-danger` tokens for up/down
- Use `bg-success/10` / `bg-danger/10` for badge background
- Match the existing stat card style in `MarketPanel.tsx:706`

**Validation:** Visual diff before/after. Manual smoke test: open trading post, see live prices change after market tick.

---

### Gap 3 — Move sector + elasticity to database [P1]

**File:** `src/lib/game/marketSimulator.ts:42-150` + new migration

**Migration 035_market_resource_config.sql:**
```sql
ALTER TABLE game_config_market
  ADD COLUMN IF NOT EXISTS sector TEXT NOT NULL DEFAULT 'raw_minerals'
    CHECK (sector IN ('raw_minerals','raw_organic','basic_materials','components','advanced','high_tech','endgame','agriculture')),
  ADD COLUMN IF NOT EXISTS elasticity REAL NOT NULL DEFAULT 0.4
    CHECK (elasticity >= 0 AND elasticity <= 1.5);

-- Backfill from marketSimulator.ts (one-time data migration)
-- (Will be done via SQL UPDATE from a JSON of the current 80+ mappings)
```

**Code changes:**
- `marketSimulator.ts` exports `getResourceSector(resource): MarketSector | 'raw_minerals'` and `getResourceElasticity(resource): number` that read from a config table (DB-backed with in-memory cache)
- Keep `RESOURCE_SECTOR` and `RESOURCE_ELASTICITY` exports as a fallback for offline / SSR
- Add a one-time migration that backfills the DB with the current hardcoded values

**Validation:** Tests for known resource, unknown resource (returns default), DB unavailable (returns fallback).

---

### Gap 4 — Admin UI for new resources [P1]

**File:** `src/app/admin/market/page.tsx` + new API route

**API:** `POST /api/admin/market` (insert/update) with `verifyAdmin()` + `canWrite()`
- Body: `{ resource_id, base_price, sector, elasticity, is_tradable }`
- Validates: positive base_price, valid sector, elasticity in [0, 1.5]
- Logs to `admin_actions` table

**UI:** Add a "Create Resource" form to the admin market page
- Fields: resource_id (text, kebab-case), base_price (number), sector (dropdown), elasticity (slider 0–1.5), is_tradable (checkbox)
- Validate before submit (resource_id must be unique)
- Add an "Edit" button per row in the existing table
- Use existing shadcn/ui components (`Input`, `Button`, `Select`)

**UI/UX quality:**
- Match the existing admin page header style
- Use the same stat-card pattern as the market table
- Add confirmation dialog for create/edit (use existing `ConfirmModal` or shadcn `AlertDialog`)
- Inline validation, error messages
- Loading states, success/error toasts (existing notification system)

**Validation:** Tests for create, edit, duplicate resource_id, invalid sector, missing auth, missing canWrite.

---

### Gap 5 — Production/consumption into market simulation [P2]

**File:** `src/app/api/market/tick/route.ts` + new migration + new hook

**Migration 036_market_supply_demand.sql:**
```sql
CREATE TABLE IF NOT EXISTS market_supply_demand (
  resource     TEXT PRIMARY KEY,
  production   FLOAT NOT NULL DEFAULT 0,  -- global production rate (units/sec)
  consumption  FLOAT NOT NULL DEFAULT 0,  -- global consumption rate
  updated_at   TIMESTAMPTZ DEFAULT now()
);
```

**Hook:** A scheduled job (Cloudflare worker or Vercel cron) that:
1. Reads `productionSnapshot` from all `server_game_state` rows
2. Aggregates `production[r] - consumption[r]` per resource
3. Upserts into `market_supply_demand`

**Tick integration:** `/api/market/tick` reads `market_supply_demand` and adds to pressure:
```ts
const netSupplyDemand = production - consumption;
// Positive = oversupply (price down) — opposite of buy pressure
// Scale: 1 unit of netSupplyDemand ≈ 0.5 units of pressure
pressure[r].sellVol += Math.max(0, netSupplyDemand * 0.5);
pressure[r].buyVol += Math.max(0, -netSupplyDemand * 0.5);
```

**Validation:** Tests for normal case, no production data, all-consumption case.

---

## Out of Scope (Future)

- Population growth tracking
- Government policy/tax tables
- Event multiplier system
- Cross-region trading
- AI-driven market makers
- Time-decay for unsold inventory
- Player-driven futures contracts

These are listed in the spec but require game design decisions outside the audit scope. Each will be a separate plan.

---

## Sequencing

| Phase | Gap | Effort | Risk | Prerequisite |
|---|---|---|---|---|
| 1 | Gap 1 (Trade endpoint → live prices + slippage) | S | Low | None |
| 1 | Gap 2 (TradingPostPanel → live prices UI) | S | Low | Phase 1a |
| 2 | Gap 3 (Sector/elasticity → DB) | M | Med | None |
| 3 | Gap 4 (Admin add/edit resource UI) | M | Med | Gap 3 |
| 4 | Gap 5 (Production/consumption aggregator) | L | High | Gap 1 |

**Phase 1 alone is sufficient to fix BUG-005 / C5 (the underlying "Trading Post bypasses server validation" issue).**

---

## Validation Plan (per phase)

| Phase | Validation |
|---|---|
| Gap 1 | Unit tests for trade endpoint (normal, large-trade slippage, missing market, capacity overflow, rate limit) |
| Gap 2 | Visual smoke test: open `/`, navigate to Trading Post, verify prices change after market tick |
| Gap 3 | Unit tests for getResourceSector/Elasticity, DB integration test, fallback test |
| Gap 4 | Manual: create a new resource via admin UI, verify it appears in `/api/market/state` after tick |
| Gap 5 | Integration test: feed production data, verify pressure changes |

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Trade endpoint latency increase from extra DB call | Med | Med | Use 5-min in-memory cache (same pattern as `getTradableSet`) |
| Slippage calculation feels unfair to players | Med | Med | Start with very small slippage (size × 0.001), tune later |
| Sector/elasticity DB migration breaks offline mode | Low | High | Keep static maps as fallback; only consult DB when available |
| Admin UI XSS via resource_id | Low | High | Sanitize resource_id (kebab-case regex), escape in all renders |
| Production aggregator overloads DB | Med | Med | Aggregate on cron (60s), not per tick; pre-aggregate per-user in `server_game_state` |

## Success Criteria

- [ ] BUG-005 / C5 fully resolved (trades use live prices)
- [ ] TradingPostPanel shows live prices, updates after market tick
- [ ] Admin can add a new resource via UI → it appears in market
- [ ] New resource has working sector + elasticity (no hardcoded list update needed)
- [ ] Production/consumption affects market pressure
- [ ] No regression: existing trades, admin actions, market panel still work
- [ ] Lint, type-check, build all pass
- [ ] Zero new raw hex, zero new console.log (per CI gate)

---

**Status:**
- ✅ Phase 1a (Gap 1): Trade endpoint reads `current_price` from `server_market_state` with slippage for large trades. Also records `market_player_pressure` via RPC.
- ✅ Phase 1b (Gap 2): `TradingPostPanel` reads `state.market` (server-synced every 5 ticks) for live prices. Added `PriceChangeBadge` component showing ▲/▼ % vs base.
- ✅ Side fix: Restored missing `}` in `configCache.ts:358` that was a regression from earlier BUG-026 `console.log` removal.
- ✅ Phase 2 (Gap 3): Migration `035_market_resource_config.sql` adds `sector` + `elasticity` columns to `game_config_market` with CHECK constraints and index. Backfills all 80+ existing resources from the hardcoded `marketSimulator.ts` maps. Trade route now reads per-resource elasticity from DB (replaces flat 0.4 fallback).
- ✅ Phase 3 (Gap 4): New `/api/admin/market/resources` route (POST + PUT) with auth (`verifyAdmin` + `canWrite`), validation (kebab-case resource_id, positive price, valid sector, elasticity in [0, 1.5]), and admin_actions audit logging. New `/api/admin/market/resources/[id]` route (DELETE). Updated `/api/admin/market` GET to return `sector`, `elasticity`, `is_tradable` and surface newly-added resources that haven't been picked up by the market tick yet. Rewrote `/admin/market` page with a "Create Resource" button, Edit/Delete actions per row, validation, loading/success/error states, and confirmation dialog. Uses shadcn Dialog + Select + Switch + Input.
- ✅ Phase 4 (Gap 5): Migration `036_market_supply_demand.sql` creates aggregated `market_supply_demand` table with RPCs `upsert_supply_demand` and `clear_supply_demand`. New `/api/market/aggregate-supply` endpoint (POST + GET) reads all `server_game_state.full_state.productionSnapshot` rows, sums per-resource production + consumption, and writes the aggregate. Tick route now reads `market_supply_demand` and adds `production × 0.1` to sell pressure and `consumption × 0.1` to buy pressure — production now pushes prices down, consumption pushes them up.

**Owner:** Agent
**Last updated:** 2026-06-18

---

## Phase 5 — Market Tick Refactor (Rule 1 Compliance)

The Cloudflare Worker was writing directly to `server_market_state` via REST PATCH, bypassing Supabase validation. This violated Rule 1 (Supabase validates before persisting). Refactored to use a validated RPC.

### ✅ Completed

| # | Action | Status |
|---|---|---|
| 1 | Migration `039_apply_market_tick.sql` — Supabase function that locks `server_market_state`, validates tick increment + bounds, validates price structure, persists state, writes `game_config_market_history`, clears `market_player_pressure`. **Sole writer of market state.** | ✅ Applied to cloud DB |
| 2 | Refactored `cloudflare/markettick/worker.js` — calls `apply_market_tick` RPC instead of direct REST PATCH. Worker EXECUTES the simulation (marketEngine.tick), Supabase VALIDATES + PERSISTS. | ✅ Done |
| 3 | Refactored `src/app/api/market/tick/route.ts` — thin proxy that calls the same `apply_market_tick` RPC. Manual debug trigger now goes through the same gate. | ✅ Done |
| 4 | Deleted `cloudflare/markettick/worker-singlefile.js` (dead code) | ✅ Done |

### Architecture after refactor

```
┌──────────────────┐  EXECUTE  ┌─────────────────┐
│ Cloudflare       │ ────────▶ │ Supabase         │
│ Worker           │  prices    │ apply_market_tick│
│ marketEngine.js  │  events    │   ↓ validate     │
│  (simulation)    │  vol       │   ↓ persist      │
│  (price math)    │  breakers  │   ↓ history      │
│  (circuit break) │            │   ↓ clear press  │
└──────────────────┘            └─────────────────┘
                                          │
                          server_market_state (id=1)
                          game_config_market_history (per event)
                          market_player_pressure (cleared each tick)
```

Cloudflare no longer writes to `server_market_state` directly. The RPC is the gate.

### Note on worker-singlefile.js

This was a bundled copy of `worker.js` (older). The deployment uses `worker.js` (per `wrangler.toml: main = "worker.js"`). Removing it removes confusion about which file is canonical.

---

## Remaining work (not in this plan's scope)

1. **Schedule the aggregator** — Currently `POST /api/market/aggregate-supply` is callable but not scheduled. Options:
   - Vercel Cron in `vercel.json`: `{ "crons": [{ "path": "/api/market/aggregate-supply", "schedule": "*\/1 * * * *" }] }`
   - Call it at the top of `/api/market/tick/route.ts` (extra DB load on every tick — only acceptable if tick is infrequent)
   - Cloudflare Worker cron (if the market tick runs on CF)
2. **Tune `SUPPLY_DEMAND_SCALE`** — Currently 0.1. Watch a few production cycles in production and adjust so prices feel responsive but not chaotic.
3. **Unit tests for slippage math, sector/elasticity lookups, and aggregator** — The test runner is currently broken (`npm test` fails on "Unknown module loader"). Fix the test runner first, then add coverage.
