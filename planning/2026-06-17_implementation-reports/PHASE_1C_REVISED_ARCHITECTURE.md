# Phase 1C: Server-Authoritative Trading — Revised Architecture

**STATUS NOTICE — SUPERSEDED**  
This document has been classified as **SUPERSEDED** in `planning/DOCUMENT_INVENTORY.md` (June 2026 audit).  
Revised trading plan whose implementation (per [PHASE_1C_IMPLEMENTATION_REPORT.md](./PHASE_1C_IMPLEMENTATION_REPORT.md)) is itself CONTRADICTORY.  
For the canonical project status and trading architecture, see [PROJECT_STATUS_SOURCE_OF_TRUTH.md](./PROJECT_STATUS_SOURCE_OF_TRUTH.md).

**Status**: REVISED — Awaiting Review  
**Scope**: Migrate Trading Post from client-trusted validation to server-authoritative execution  
**Preceded by**: Phase 1B (Security Hardening) — CLOSED  
**Blocks**: Phase 1D, Phase 2+  
**Revises**: PHASE_1C_SERVER_AUTHORITATIVE_TRADING_PLAN.md  

---

## Revision Changelog

| # | Change | Rationale |
|---|---|---|
| 1 | Removed `market_snapshot` as authoritative pricing source. Exchange rates use `game_config_market.basePrice` ONLY. | market_snapshot is client-originated data. An attacker can modify market → force cloud sync → persist fake market_snapshot → trade against it. 100% server-owned data is the only acceptable source. |
| 2 | Removed `resource_capacity` column from `server_game_state`. | Capacity is derived data — always calculable from buildings + config. Three sources of truth (buildings, resource_capacity, full_state.resourceCapacity) creates drift risk. |
| 3 | Collapsed Phase A + Phase B into a single implementation phase. No intermediate "server validates, client mutates" architecture. | The intermediate state creates temporary mixed authority: effort building it is immediately discarded in Phase B. One migration path, less code, less testing, less risk. |

---

## 1. Revised Architecture

### Design Principle

```
CLIENT sends INTENT only.
SERVER reads AUTHORITATIVE state.
SERVER calculates RATES from server-owned data ONLY.
SERVER MUTATES state.
SERVER returns NEW state.
CLIENT sets store = server result.
```

### Request Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                             │
│                                                                     │
│  1. User clicks "Execute Trade"                                     │
│  2. Client-side pre-flight (UX only, NOT security):                 │
│     - resources[give] >= giveAmount (fast feedback)                 │
│  3. Sends TRADE INTENT only:                                        │
│                                                                     │
│     POST /api/game/trade                                            │
│     { giveResource: "iron",                                         │
│       giveAmount: 100,                                              │
│       receiveResource: "copper" }                                   │
│                                                                     │
│     NOTE: No gameState. No receiveAmount. No market. No capacity.   │
│     NOTE: Client sends WHAT it wants, not WHY it thinks it can.     │
│                                                                     │
│  4. Receives:                                                       │
│     { success: true,                                                │
│       giveResource: "iron", giveAmount: 100,                        │
│       receiveResource: "copper", receiveAmount: 42.5,               │
│       newResources: { iron: 400, copper: 142.5, ... },             │
│       newMoney: 1234.5,                                             │
│       stateVersion: 42,                                             │
│       tradeId: "trade_abc123" }                                     │
│                                                                     │
│  5. Client applies: useGameStore.setState({                         │
│       resources: result.newResources,                               │
│       money: result.newMoney                                        │
│     })                                                              │
│                                                                     │
│  NOTE: Client does NOT calculate. Client does NOT mutate.           │
│  NOTE: Client is a THIN LAYER — sends intent, receives state.       │
└─────────────────────────────────────────────────────────────────────┘

                    │
                    ▼

┌─────────────────────────────────────────────────────────────────────┐
│                        SERVER (API Route)                            │
│                                                                     │
│  /api/game/trade (POST)                                             │
│                                                                     │
│  6. Auth check + rate limit                                         │
│  7. Read AUTHORITATIVE state from server_game_state:                │
│     - SELECT resources, money, buildings, completed_research,       │
│       game_tick FROM server_game_state                              │
│       WHERE user_id = auth.userId                                   │
│                                                                     │
│  8. Validate and execute:                                           │
│     a. Check giveResource in TRADABLE_RESOURCES     ✅ Server-owned │
│     b. Check resources[give] >= giveAmount          ✅ Server data  │
│     c. Calculate exchange rate:                                      │
│        - Read base prices from game_config_market (Supabase)        │
│        - Calculate: receive = give × giveBasePrice × 0.85           │
│                            / receiveBasePrice                        │
│        - ONLY base prices. NO market modifiers. NO client data.     │
│     d. Check capacity:                                               │
│        - Calculate from server_game_state.buildings + config        │
│        - resources[recv] + receive <= capacity                      │
│     e. MUTATE server_game_state:                                     │
│        - resources[give] -= giveAmount                              │
│        - resources[receive] += receiveAmount (capped)               │
│        - Update state_version, last_tick_at                         │
│     f. Insert into trade_history                                     │
│     g. Insert into player_actions (audit)                           │
│                                                                     │
│  9. Return result with new resource state                            │
│                                                                     │
│  NOTE: Server reads from server_game_state. NOT from request body.  │
│  NOTE: Server calculates exchange rate from base prices ONLY.        │
│  NOTE: Server calculates capacity from buildings + config.           │
│  NOTE: Server MUTATES state atomically.                             │
└─────────────────────────────────────────────────────────────────────┘
```

### What Client May Send

| Field | Type | Purpose | Server Trust |
|---|---|---|---|
| `giveResource` | string | Which resource to give | ✅ Validated against whitelist |
| `giveAmount` | number | How much to give | ✅ Validated (bounds, finite, positive) |
| `receiveResource` | string | Which resource to receive | ✅ Validated against whitelist |

**That's it.** Three fields. No gameState. No market. No capacity. No receiveAmount.

### What Server May Trust

| Data Source | What Server Uses It For | Trust Level |
|---|---|---|
| `server_game_state.resources` | Resource availability check | ✅ Authoritative |
| `server_game_state.buildings` | Capacity derivation | ✅ Authoritative |
| `server_game_state.completed_research` | Future market bonus calculation | ✅ Authoritative |
| `game_config_market.base_price` (Supabase) | Base prices for exchange rate | ✅ Authoritative — 100% server-owned |
| Auth token | User identity | ✅ Authoritative |
| Rate limiter | Abuse prevention | ✅ Authoritative |

**What changed from v1**: `market_snapshot` is REMOVED from this table. The server no longer trusts any client-originated market data. Exchange rates use `game_config_market.base_price` exclusively.

### What Server Must Calculate

| Calculation | Source Data | Where |
|---|---|---|
| Exchange rate | base prices from game_config_market ONLY | Server |
| Receive amount | exchange rate × give amount × (1 - commission) | Server |
| Resource capacity | buildings from server_game_state + building definitions from game_config_buildings | Server |

**What changed from v1**: `market_snapshot` modifier is removed. Capacity is calculated at trade time from buildings + config, not read from a `resource_capacity` column.

### Pricing Tradeoff: Base Price vs Market Price

**Base Price (current approach)**:
- ✅ 100% server-owned — no client manipulation possible
- ✅ Simple, deterministic, no staleness concern
- ❌ Does not reflect market cycles, supply/demand fluctuations, events
- ❌ Exchange rates shown in UI may differ from actual trade rates

**Market Price (future approach — OUT OF SCOPE for Phase 1C)**:
- Would require server-side market simulation (~800 lines of complex code)
- Or a trustable server-originated market snapshot (needs careful design)
- This is a dedicated market-authority project, not Phase 1C
- Security has priority over economic realism

**UX Mitigation**: The trade confirmation dialog should show the exact exchange rate the server will use (base price based), so the player knows what they'll get before confirming. The UI already shows "Rate: 1 Iron = X.XX Copper" — this will now accurately reflect the server's calculation.

---

## 2. Revised Schema Impact

### Existing Tables Affected

| Table | Change | Reason |
|---|---|---|
| `trade_history` | Add `server_state_version` integer column | Track which state version the trade executed against |
| `trade_history` | Add `exchange_rate_used` float column | Audit trail for the exact rate used |
| `trade_history` | Add `pricing_source` text column DEFAULT 'base_price' | Record which pricing source was used (future-proofing) |

### New Tables Required

**None.** The existing `server_game_state`, `trade_history`, and `player_actions` tables are sufficient.

**What changed from v1**: 
- ~~`market_snapshot` JSONB column~~ — REMOVED. No new columns on `server_game_state`.
- ~~`resource_capacity` JSONB column~~ — REMOVED. Capacity calculated at trade time.

### New Indexes Required

| Index | Table | Columns | Reason |
|---|---|---|---|
| None new needed | | | `server_game_state` already indexed on `user_id` (primary key) |

### New Audit Logs Required

| Log Entry | Table | When |
|---|---|---|
| Trade executed | `trade_history` | On successful trade (already exists) |
| Trade rejected | `player_actions` | On failed trade (actionType: 'trade', isValid: false) |
| Concurrent modification | `player_actions` | On state_version mismatch |

**What changed from v1**: ~~Market snapshot staleness warning~~ — REMOVED. No market_snapshot means no staleness concern.

### Schema Migration

```sql
-- Phase 1C: Add audit columns to trade_history
ALTER TABLE trade_history
ADD COLUMN IF NOT EXISTS server_state_version INTEGER,
ADD COLUMN IF NOT EXISTS exchange_rate_used FLOAT,
ADD COLUMN IF NOT EXISTS pricing_source TEXT DEFAULT 'base_price';

-- No changes to server_game_state needed.
-- Capacity is calculated at trade time from buildings + config.
-- Exchange rates use game_config_market.base_price only.
```

**What changed from v1**: 
- Removed `ALTER TABLE server_game_state ADD COLUMN resource_capacity JSONB`
- Removed `ALTER TABLE server_game_state ADD COLUMN market_snapshot JSONB`
- Removed the `UPDATE server_game_state SET resource_capacity = ...` backfill
- Added `pricing_source` column for future-proofing

---

## 3. Revised Implementation Plan

### Single-Phase Implementation (Collapsed A+B+C)

The implementation is now one continuous phase with 5 steps. No intermediate "server validates, client mutates" architecture.

---

### Step 1: New Trade API Route

**What**: Create `/api/game/trade` route that reads from `server_game_state` and uses base prices from `game_config_market`.

**Files created**:
- `src/app/api/game/trade/route.ts` — NEW dedicated trade route

**Files modified**:
- `src/lib/game/serverEngine.ts` — New `executeTradeAction` function (reads from DB, validates, mutates, returns new state)

**Implementation details**:
1. New route: `POST /api/game/trade`
   - Auth + rate limit (same as `/api/game/action`)
   - Accept only: `{ giveResource, giveAmount, receiveResource }`
   - Reject any request containing `gameState`, `receiveAmount`, or `market`
2. Fetch `server_game_state` for authenticated user:
   ```sql
   SELECT resources, money, buildings, completed_research, game_tick, state_version
   FROM server_game_state WHERE user_id = ?
   ```
3. Fetch base prices from `game_config_market` (with existing 5-min cache):
   ```sql
   SELECT resource_id, base_price FROM game_config_market
   WHERE resource_id IN (giveResource, receiveResource)
   ```
4. Validate:
   - Both resources in TRADABLE_RESOURCES set
   - `resources[give] >= giveAmount`
   - `giveAmount` is finite, positive, ≤ 1e9
   - Both resources have base prices in config
5. Calculate exchange rate:
   ```typescript
   const giveBasePrice = configMarket[giveResource].base_price;
   const receiveBasePrice = configMarket[receiveResource].base_price;
   const receiveAmount = (giveAmount * giveBasePrice * 0.85) / receiveBasePrice;
   ```
6. **NOT YET MUTATING** — this step just builds the validation + calculation logic. Step 2 adds mutation.

**Risk**: Low — new route, doesn't change existing behavior  
**Effort**: 1 day  
**Rollback**: Remove `/api/game/trade` route. Revert serverEngine changes.

---

### Step 2: Server-Side State Mutation

**What**: Server executes the trade atomically and returns new resource state.

**Files modified**:
- `src/app/api/game/trade/route.ts` — Add mutation logic after validation
- `src/lib/game/serverEngine.ts` — Complete `executeTradeAction` with DB mutation
- `src/components/game/TradingPostPanel.tsx` — Use new `/api/game/trade` endpoint

**Implementation details**:
1. Calculate capacity from server buildings + config:
   ```typescript
   // Read building definitions from cached game config
   // For each warehouse/storage building in server_game_state.buildings:
   //   Sum capacity bonuses from building definition
   // This is the same calculation the client does, but server-authoritative
   const capacity = calculateCapacityFromBuildings(
     serverState.buildings, 
     gameConfig.buildings
   );
   ```
2. Cap receive amount if it would exceed capacity:
   ```typescript
   const cappedReceive = Math.min(
     receiveAmount,
     Math.max(0, capacity[receiveResource] - (resources[receiveResource] ?? 0))
   );
   ```
3. Mutate `server_game_state` with optimistic concurrency:
   ```sql
   UPDATE server_game_state
   SET resources = new_resources,
       money = money,  -- unchanged by trade but included for consistency
       state_version = state_version + 1,
       last_tick_at = NOW()
   WHERE user_id = ? AND state_version = ?
   ```
4. If 0 rows affected → concurrent modification → return `{ success: false, code: "CONCURRENT_MODIFICATION" }`
5. Insert into `trade_history` with `server_state_version`, `exchange_rate_used`, `pricing_source = 'base_price'`
6. Insert into `player_actions` (audit)
7. Return result:
   ```typescript
   {
     success: true,
     tradeId: "trade_uuid",
     giveResource, giveAmount,
     receiveResource, receiveAmount: cappedReceive,
     commission: giveAmount * giveBasePrice * 0.15,
     newResources: { ...updatedResources },
     newMoney: serverState.money,
     stateVersion: newStateVersion,
   }
   ```
8. Update `TradingPostPanel`:
   - `validateTradeWithServer()` → `executeTradeWithServer()`
   - Sends only `{ giveResource, giveAmount, receiveResource }` — no `gameState`
   - On success: `useGameStore.setState({ resources: result.newResources, money: result.newMoney })`
   - On failure: show error, optionally trigger cloud sync to refresh state
9. Remove old trade handler from `/api/game/action` route (or mark as deprecated)

**Risk**: Medium — changes state ownership, requires careful concurrency handling  
**Effort**: 1.5 days  
**Rollback**: Revert TradingPostPanel to call `/api/game/action` with gameState. Remove `/api/game/trade`.

---

### Step 3: state_version Concurrency Protection

**What**: Ensure both trade and cloud sync respect `state_version` to prevent race conditions.

**Files modified**:
- `src/app/api/game/state/route.ts` — Add state_version check to POST handler
- `src/lib/hooks/useCloudSync.ts` — Handle state_version conflicts
- `src/components/game/TradingPostPanel.tsx` — Handle stale-state recovery

**Implementation details**:
1. Cloud sync POST includes `clientStateVersion`:
   - Client reads `stateVersion` from server response (stored after trade or sync)
   - Sends `clientStateVersion` alongside `full_state`
2. Server checks:
   ```sql
   -- Before updating, check version
   SELECT state_version FROM server_game_state WHERE user_id = ?
   -- If server.state_version > clientStateVersion:
   --   A trade happened since last sync. Reject the sync.
   --   Return current server state so client can merge.
   ```
3. If sync is rejected:
   - Server returns `{ conflict: true, serverResources: ..., serverMoney: ..., serverVersion: ... }`
   - Client merges: use server resources (authoritative), keep local non-resource state
   - Client retries sync after merge
4. After a failed trade (INSUFFICIENT_RESOURCES):
   - Client should automatically fetch fresh server state:
     ```typescript
     // Pull latest state to correct drift
     const freshState = await fetch('/api/game/state?XTransformPort=...');
     useGameStore.setState({ resources: freshState.resources, ... });
     ```
5. Trade API also uses `state_version` for optimistic concurrency (already in Step 2)

**Risk**: Medium — cloud sync is critical path, must not break save/load  
**Effort**: 0.5 days  
**Rollback**: Remove state_version check from cloud sync. Trade API keeps its own check (independent).

---

### Step 4: Cloud Sync Conflict Resolution

**What**: Ensure cloud sync cannot overwrite trade results.

**Files modified**:
- `src/app/api/game/state/route.ts` — Conflict detection + resolution
- `src/lib/hooks/useCloudSync.ts` — Conflict recovery flow

**Implementation details**:
1. When cloud sync detects `state_version` conflict (server version > client version):
   - Server returns the current server state instead of overwriting
   - Server includes both: server resources (authoritative) and client non-resource state
   - Client merges: resources from server, buildings/research/etc from client local state
2. After merge, client re-syncs with the merged state
3. Edge case: multiple trades happen between syncs
   - Each trade increments `state_version` by 1
   - Client's version will be N steps behind server
   - Server returns current state; client applies it
4. Edge case: trade and sync happen simultaneously
   - Both use `WHERE state_version = X` — only one succeeds
   - Loser gets `CONCURRENT_MODIFICATION` or conflict response
   - Both retry with new version

**Risk**: Low-Medium — additive safety layer  
**Effort**: 0.5 days  
**Rollback**: Remove conflict detection from cloud sync. Accept rare overwrite risk (same as current behavior).

---

### Step 5: Deprecation of Old Trade Path

**What**: Remove trade support from `/api/game/action` and clean up client-side trade code.

**Files modified**:
- `src/app/api/game/action/route.ts` — Remove `trade` from valid actions, remove `handleTradeAction`
- `src/lib/game/serverEngine.ts` — Remove old `validateTradeAction` function (replaced by `executeTradeAction`)
- `src/components/game/TradingPostPanel.tsx` — Remove old `validateTradeWithServer` function, clean up unused gameState construction

**Implementation details**:
1. Remove `'trade'` from `validActions` array in `/api/game/action`
2. Remove `handleTradeAction` function
3. Remove `validateTradeAction` export from `serverEngine.ts`
4. Remove old `validateTradeWithServer` function from `TradingPostPanel.tsx`
5. Verify all trade flows use `/api/game/trade`
6. Test: trade still works, old route returns error for trade actions

**Risk**: Low — cleanup only  
**Effort**: 0.5 days  
**Rollback**: Re-add trade support to `/api/game/action`

---

### Implementation Order

```
Step 1 (Day 1)
├── New /api/game/trade route
├── Server reads from server_game_state
├── Base prices from game_config_market
└── Test: trade validated against server data with base prices

Step 2 (Day 2-3)
├── Server mutates server_game_state
├── Optimistic concurrency via state_version
├── Capacity calculated from buildings + config (no resource_capacity column)
├── Client uses server response for state update
├── Client sends intent only (3 fields)
└── Test: trades execute atomically on server

Step 3 (Day 3)
├── Cloud sync respects state_version
├── Conflict resolution on sync
├── Stale-state recovery in UI
└── Test: sync after trade doesn't overwrite

Step 4 (Day 4)
├── Full conflict resolution flow
├── Edge case handling (multiple trades, simultaneous ops)
├── Client merge logic
└── Test: all race conditions handled

Step 5 (Day 4)
├── Remove old trade path from /api/game/action
├── Remove old validateTradeAction from serverEngine
├── Clean up TradingPostPanel
└── Test: no regressions
```

---

## 4. Revised Effort Estimate

| Step | Description | Effort | Risk |
|---|---|---|---|
| Step 1 | New Trade API + server-side state read | 1 day | Low |
| Step 2 | Server-side state mutation + client update | 1.5 days | Medium |
| Step 3 | state_version concurrency protection | 0.5 days | Medium |
| Step 4 | Cloud sync conflict resolution | 0.5 days | Low-Medium |
| Step 5 | Deprecation of old trade path | 0.5 days | Low |
| **Total** | | **4 days** | |

**Comparison with v1**: v1 was also 4 days but had 3 phases with temporary mixed-authority architecture. This revised plan eliminates the throwaway work and delivers the final architecture directly.

---

## 5. Revised Risk Assessment

### Security Risks

| Attack | Current Status | Revised Defense | Risk After Fix |
|---|---|---|---|
| Resource fabrication | ⚠️ Exploitable (client-trusted) | Server reads from `server_game_state.resources` | ✅ Blocked |
| Market manipulation | ⚠️ Exploitable (client-trusted market) | Server uses `game_config_market.base_price` ONLY | ✅ Blocked — no client market data accepted |
| Capacity bypass | ⚠️ Exploitable (client-trusted capacity) | Server calculates from `buildings` + config | ✅ Blocked |
| Replay attack | ⚠️ No defense | `state_version` check rejects stale requests | ✅ Blocked |
| Duplicate trade | ⚠️ Client-only defense | `state_version` optimistic concurrency | ✅ Blocked |
| Modified client | ⚠️ Exploitable | Client sends intent only; server validates everything | ✅ Blocked |

### Architectural Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Base prices make trades feel "wrong" vs UI | Medium | Low | Show exact server rate in trade confirmation. Players learn the real rate. |
| Cloud sync overwrites trade result | Medium | High | state_version conflict detection (Steps 3-4) |
| Race between trade and sync | Low | Medium | Optimistic concurrency + retry logic |
| Capacity calculation mismatch (server vs client) | Low | Low | Use same building definitions from cached config |
| Server unavailable = no trading | Intended | Medium | Fail-closed by design. Feature, not bug. |

### What Changed from v1

| Risk in v1 | Status in v2 | Reason |
|---|---|---|
| market_snapshot fabrication via cloud sync | ✅ Eliminated | No market_snapshot column exists |
| resource_capacity drift across 3 sources | ✅ Eliminated | No resource_capacity column; calculated at trade time |
| Mixed authority during Phase A→B transition | ✅ Eliminated | No Phase A/B split; server validates AND mutates from day 1 |

---

## Appendix A: Error Codes

| Code | HTTP | Meaning | Client Action |
|---|---|---|---|
| `INSUFFICIENT_RESOURCES` | 400 | Not enough give resource | Show "Not enough X" message, auto-refresh server state |
| `INVALID_RESOURCE` | 400 | Resource not in tradable list | Should not happen (UI limits choices) |
| `SAME_RESOURCE` | 400 | Give and receive are the same | Should not happen (UI prevents) |
| `INVALID_AMOUNT` | 400 | giveAmount is NaN, negative, or > 1e9 | Should not happen (UI validates) |
| `ACCOUNT_LOCKED` | 403 | Account is locked for cheating | Show CloudSyncBlockBanner |
| `NO_GAME_STATE` | 404 | No server_game_state found | Trigger cloud sync first |
| `CONCURRENT_MODIFICATION` | 409 | state_version mismatch | Auto-retry once, then show error |
| `MISSING_BASE_PRICE` | 422 | Resource has no base_price in game_config_market | Server config error — should not happen |
| `SERVER_UNAVAILABLE` | 503 | Server can't process trade | Show "trade unavailable" |

## Appendix B: Capacity Calculation (Server-Side)

The server must calculate resource capacity the same way the client does, but using server-authoritative data:

```typescript
function calculateCapacityFromBuildings(
  buildings: BuildingInstance[],
  buildingDefs: Record<string, BuildingDefinition>,
): Record<string, number> {
  const capacity: Record<string, number> = {};
  
  for (const building of buildings) {
    const def = buildingDefs[building.type];
    if (!def) continue;
    
    // Warehouse/storage buildings define storage in their outputs
    // Each building contributes its output amount as capacity for that resource
    if (def.outputs) {
      for (const output of def.outputs) {
        capacity[output.resource] = (capacity[output.resource] ?? 0) + output.amount * building.count;
      }
    }
  }
  
  return capacity;
}
```

This calculation:
- Uses `server_game_state.buildings` (authoritative)
- Uses `game_config_buildings` (authoritative, cached)
- Produces the same result as the client's calculation
- No need for a `resource_capacity` column — calculated fresh each trade

## Appendix C: Future Market Authority (Out of Scope)

Phase 1C uses base prices only. A future project can add market-realistic pricing through one of these approaches:

**Option A: Server-Side Market Simulation**
- Run the market simulator on the server per-player
- ~800 lines of code to port
- Most accurate but most expensive (CPU + memory per player)

**Option B: Server-Originated Market State**
- Server generates market state at defined intervals (e.g., every game tick on cloud sync)
- Client receives market state FROM server, never sends it
- Compromise: accurate but delayed

**Option C: Verified Market Snapshot**
- Client submits market state with cryptographic proof (HMAC)
- Server verifies the snapshot matches a previously issued state
- Complex but allows client-side simulation with server verification

None of these are Phase 1C. Security first. Economic realism later.
