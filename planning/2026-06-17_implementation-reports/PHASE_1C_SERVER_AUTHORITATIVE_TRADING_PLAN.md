# Phase 1C: Server-Authoritative Trading — Architecture Plan

**STATUS NOTICE — SUPERSEDED**  
This document has been classified as **SUPERSEDED** in `planning/DOCUMENT_INVENTORY.md` (June 2026 audit).  
Replaced by [PHASE_1C_REVISED_ARCHITECTURE.md](./PHASE_1C_REVISED_ARCHITECTURE.md) (which itself is SUPERSEDED).  
For the canonical project status and trading architecture, see [PROJECT_STATUS_SOURCE_OF_TRUTH.md](./PROJECT_STATUS_SOURCE_OF_TRUTH.md).

**Status**: PLANNING — Awaiting Review  
**Scope**: Migrate Trading Post from client-trusted validation to server-authoritative execution  
**Preceded by**: Phase 1B (Security Hardening) — CLOSED  
**Blocks**: Phase 1D, Phase 2+  

---

## 1. Current Architecture

### Current Trade Flow (As-Is)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                             │
│                                                                     │
│  1. User clicks "Execute Trade"                                     │
│  2. TradingPostPanel.executeTrade() reads LOCAL store:              │
│     - resources (from Zustand)                                      │
│     - market prices (from Zustand, simulated client-side)           │
│     - resourceCapacity (from Zustand)                               │
│  3. Client-side pre-flight check: resources[give] >= giveAmount     │
│  4. Builds gameState object from LOCAL store:                       │
│     { money, gameTick, resources, resourceCapacity, market,         │
│       buildings, completedResearch, researchPoints, prestigeState } │
│  5. Calls validateTradeWithServer(give, giveAmt, receive,           │
│     receiveAmt, gameState)                                          │
│                                                                     │
│     POST /api/game/action                                           │
│     { actionType: "trade", payload: { giveResource, giveAmount,     │
│       receiveResource, receiveAmount },                             │
│       gameState: { resources, market, ... } }   ← ALL FROM CLIENT  │
│                                                                     │
│  10. Receives { valid: true, correctedReceiveAmount: X }            │
│  11. Applies trade to LOCAL Zustand store:                          │
│      resources[give] -= giveAmount                                  │
│      resources[receive] += correctedReceiveAmount                   │
│  12. Local history entry added                                      │
│  13. Next cloud sync pushes new resources to server                 │
└─────────────────────────────────────────────────────────────────────┘

                    │
                    ▼

┌─────────────────────────────────────────────────────────────────────┐
│                        SERVER (API Route)                            │
│                                                                     │
│  /api/game/action (POST)                                            │
│                                                                     │
│  6. Auth check + rate limit                                         │
│  7. handleTradeAction(payload, gameState)                           │
│     → validateTradeAction(give, giveAmt, receive, receiveAmt,       │
│       gameState)   ← USES CLIENT-SUPPLIED gameState                │
│                                                                     │
│     Validates:                                                      │
│     - Both resources in TRADABLE_RESOURCES list    ✅ Server-owned  │
│     - giveAmount is finite and <= 1e9              ✅ Server-owned  │
│     - giveResource !== receiveResource             ✅ Server-owned  │
│     - gameState.resources[give] >= giveAmount      ⚠️ CLIENT-TRUSTED│
│     - Exchange rate from gameState.market           ⚠️ CLIENT-TRUSTED│
│     - Capacity from gameState.resourceCapacity      ⚠️ CLIENT-TRUSTED│
│     - Returns correctedReceiveAmount (server calc)  ⚠️ BASED ON    │
│                                                      CLIENT MARKET  │
│                                                                     │
│  8. If valid: persist to trade_history                              │
│  9. Return validation result                                        │
│                                                                     │
│  NOTE: Server does NOT mutate game state.                           │
│  NOTE: Server does NOT read from server_game_state.                 │
│  NOTE: Server does NOT verify the client applied the trade.         │
└─────────────────────────────────────────────────────────────────────┘
```

### Client Responsibilities

| Responsibility | Current Owner | Trust Level |
|---|---|---|
| Resource state (amounts) | Client (Zustand store) | ⚠️ Self-reported |
| Market prices | Client (simulated each tick) | ⚠️ Self-reported |
| Resource capacities | Client (computed from buildings) | ⚠️ Self-reported |
| Trade execution (mutation) | Client (Zustand setState) | ⚠️ Unverified |
| Trade history display | Client + Server | ✅ Server-verified (history only) |
| Pre-flight validation | Client | ⚠️ Bypassable |

### Server Responsibilities

| Responsibility | Current Owner | Trust Level |
|---|---|---|
| Auth + rate limiting | Server | ✅ Server-authoritative |
| Tradable resources list | Server (hardcoded) | ✅ Server-authoritative |
| Give amount bounds (≤ 1e9) | Server | ✅ Server-authoritative |
| Commission rate (0.15) | Server (hardcoded) | ✅ Server-authoritative |
| Resource availability check | Server (using client data) | ⚠️ NOT authoritative |
| Exchange rate calculation | Server (using client market) | ⚠️ NOT authoritative |
| Capacity check | Server (using client data) | ⚠️ NOT authoritative |
| Trade persistence (audit) | Server | ✅ Server-authoritative |
| State mutation | **NONE** | ❌ Server does not mutate |

### Trust Boundaries (Current)

```
                    TRUST BOUNDARY
                    ─────────────
Client ──────────→ Server
  │                  │
  │  SENDS:          │  USES:
  │  resources ──────┼──→ validates against (trusted!)
  │  market ─────────┼──→ calculates rates from (trusted!)
  │  capacity ───────┼──→ checks overflow against (trusted!)
  │                  │
  │  DOES NOT SEND:  │  DOES NOT HAVE:
  │  (nothing else)  │  server_game_state access
  │                  │  own market data
  │                  │  own capacity data
  │                  │
  │  RECEIVES:       │  SENDS:
  │  valid/invalid ──┼── validation result
  │  correctedAmt ───┼── server-calculated amount
  │                  │
  │  THEN:           │
  │  Mutates local   │  Does NOT verify
  │  store alone     │  Does NOT persist mutation
```

### State Ownership (Current)

| State | Primary Owner | Server Copy | Sync Mechanism |
|---|---|---|---|
| `resources` | Client (Zustand) | `server_game_state.resources` | Cloud sync (periodic POST /api/game/state) |
| `market` | Client (simulated) | **NONE** | Not synced — client re-simulates on load |
| `resourceCapacity` | Client (computed) | **NONE** | Not synced — derived from buildings |
| `money` | Client (Zustand) | `server_game_state.money` | Cloud sync |
| `buildings` | Client (Zustand) | `server_game_state.buildings` | Cloud sync |
| `gameTick` | Client (Zustand) | `server_game_state.game_tick` | Cloud sync |

**Critical observation**: The `market` state (current prices for all resources) is NEVER stored on the server. It exists only in the client's running simulation. The server has no way to know what prices the client sees.

---

## 2. Target Architecture

### Design Principle

```
CLIENT sends INTENT only.
SERVER reads AUTHORITATIVE state.
SERVER calculates RATES.
SERVER MUTATES state.
SERVER returns NEW state.
CLIENT sets store = server result.
```

### Request Flow (Target)

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
│  8. Receives:                                                       │
│     { success: true,                                                │
│       giveResource: "iron", giveAmount: 100,                        │
│       receiveResource: "copper", receiveAmount: 42.5,               │
│       newResources: { iron: 400, copper: 142.5, ... },             │
│       newMoney: 1234.5,                                             │
│       tradeId: "trade_abc123" }                                     │
│                                                                     │
│  9. Client applies: useGameStore.setState({                         │
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
│  4. Auth check + rate limit                                         │
│  5. Read AUTHORITATIVE state from server_game_state:                │
│     - SELECT resources, money, buildings, completed_research,       │
│       game_tick, resource_capacity FROM server_game_state           │
│       WHERE user_id = auth.userId                                   │
│                                                                     │
│  6. Validate and execute:                                           │
│     a. Check giveResource in TRADABLE_RESOURCES     ✅ Server-owned │
│     b. Check resources[give] >= giveAmount          ✅ Server data  │
│     c. Calculate exchange rate:                                      │
│        - Read base prices from game_config_market (Supabase)        │
│        - Apply market phase modifier from server_game_state         │
│        - Calculate: receive = give × givePrice × 0.85 / recvPrice  │
│     d. Check capacity: resources[recv] + receive <= capacity        │
│     e. MUTATE server_game_state:                                     │
│        - resources[give] -= giveAmount                              │
│        - resources[receive] += receiveAmount (capped)               │
│        - Update state_version, last_tick_at                         │
│     f. Insert into trade_history                                     │
│     g. Insert into player_actions (audit)                           │
│                                                                     │
│  7. Return result with new resource state                            │
│                                                                     │
│  NOTE: Server reads from server_game_state. NOT from request body.  │
│  NOTE: Server calculates exchange rate. NOT from client market.     │
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
| `server_game_state.completed_research` | Market bonus calculation | ✅ Authoritative |
| `game_config_market` (Supabase) | Base prices for exchange rate | ✅ Authoritative |
| `server_game_state.market_snapshot` | Current market phase/prices | ✅ Authoritative (NEW) |
| Auth token | User identity | ✅ Authoritative |
| Rate limiter | Abuse prevention | ✅ Authoritative |

### What Server Must Calculate

| Calculation | Source Data | Where |
|---|---|---|
| Exchange rate | base prices from config × market modifier from server state | Server |
| Receive amount | exchange rate × give amount × (1 - commission) | Server |
| Resource capacity | buildings from server state + config building definitions | Server |
| Market modifier | market_snapshot from server state (stored on each cloud sync) | Server |

### Validation Flow (Target)

```
INPUT: giveResource, giveAmount, receiveResource

STEP 1: Input Validation
  ├── giveResource in TRADABLE_RESOURCES?           → REJECT if not
  ├── receiveResource in TRADABLE_RESOURCES?         → REJECT if not
  ├── giveResource !== receiveResource?              → REJECT if same
  ├── giveAmount is finite, positive, <= 1e9?       → REJECT if not
  └── PASS

STEP 2: Fetch Authoritative State
  ├── SELECT * FROM server_game_state WHERE user_id = ?
  ├── If not found → REJECT ("no game state found")
  ├── If is_locked → REJECT ("account locked")
  └── PASS (have: resources, buildings, market_snapshot, completed_research)

STEP 3: Resource Availability
  ├── resources[giveResource] >= giveAmount?        → REJECT if not
  └── PASS

STEP 4: Calculate Exchange Rate (SERVER-AUTHORITATIVE)
  ├── Get givePrice from config or market_snapshot
  ├── Get receivePrice from config or market_snapshot
  ├── receivePrice > 0?                              → REJECT if not
  ├── receiveAmount = giveAmount × givePrice × 0.85 / receivePrice
  └── PASS (have: receiveAmount)

STEP 5: Capacity Check
  ├── Calculate capacity from server buildings + config
  ├── resources[receive] + receiveAmount <= capacity? → CAP if overflow
  └── PASS (may have capped receiveAmount)

STEP 6: Mutate State (ATOMIC)
  ├── UPDATE server_game_state SET
  │     resources = new_resources,
  │     state_version = state_version + 1,
  │     last_tick_at = NOW()
  │   WHERE user_id = ? AND state_version = old_version
  ├── If 0 rows affected → REJECT (concurrent modification)
  └── PASS

STEP 7: Audit & History
  ├── INSERT INTO trade_history (...)
  ├── INSERT INTO player_actions (...)
  └── RETURN result
```

### Response Flow (Target)

```typescript
// Success response
{
  success: true,
  tradeId: "trade_uuid",
  giveResource: "iron",
  giveAmount: 100,
  receiveResource: "copper",
  receiveAmount: 42.5,        // Server-calculated, server-authoritative
  commission: 15.0,            // giveAmount × givePrice × 0.15
  newResources: { ... },       // Full updated resources object
  newMoney: 1234.5,            // Unchanged by trade, but included for sync
  stateVersion: 42,            // New version for optimistic concurrency
}

// Error response
{
  success: false,
  error: "Not enough iron. Have 50, need 100.",
  code: "INSUFFICIENT_RESOURCES",  // Machine-readable for UI
}
```

### Sync Flow (Target)

After a successful trade, the client's local state is already updated (from the response). The next cloud sync will:

1. Client sends its full gameState to `/api/game/state` (unchanged)
2. Server validates as before
3. **But**: the resources in the client's state now match `server_game_state` because the trade was executed server-side
4. No conflict, no drift

**Key insight**: Server-authoritative trading ELIMINATES the resource drift problem. The client's local state is always a subset of the server's truth because the server told the client what its resources are after the trade.

---

## 3. Migration Strategy

### Phase A: Server-Side State Read (Trust Boundary Fix)

**Goal**: Server reads resources and market from `server_game_state` instead of from the request body.

**Changes**:
1. New API route: `/api/game/trade` (dedicated, not shared with `/api/game/action`)
2. Server fetches `server_game_state` for the authenticated user
3. Validates against server-owned resources, not client-supplied
4. Calculates exchange rate from server-owned market data (base prices from config)
5. **Does NOT mutate state yet** — still returns `correctedReceiveAmount`
6. Client still applies the trade locally
7. Client still sends `receiveResource` and `giveAmount` (same as current)

**New trust boundary**:
```
Client → Server: { giveResource, giveAmount, receiveResource }
Server reads: server_game_state.resources (authoritative)
Server calculates: exchange rate from game_config_market (authoritative)
Server returns: { valid, correctedReceiveAmount }
Client applies: trade to local store (still client mutation)
```

**Risk**: Client could still ignore the server result and apply a different amount. But the server now validates against real data, so the client can't fabricate resources or market prices.

**Effort**: ~1 day  
**Rollback**: Revert to `/api/game/action` route. Client returns to sending gameState.

### Phase B: Server-Side State Mutation (Full Authority)

**Goal**: Server executes the trade atomically and returns the new resource state.

**Changes**:
1. Server mutates `server_game_state.resources` directly
2. Uses optimistic concurrency (`state_version` check) to prevent race conditions
3. Returns `newResources` and `newMoney` in the response
4. Client does `setState({ resources: result.newResources })` instead of local arithmetic
4. Client sends only `giveResource`, `giveAmount`, `receiveResource` — no gameState at all
5. Remove `gameState` parameter from the trade API entirely

**New trust boundary**:
```
Client → Server: { giveResource, giveAmount, receiveResource }
Server reads: server_game_state (authoritative)
Server validates: against server data
Server mutates: server_game_state (authoritative)
Server returns: { newResources, newMoney, tradeId }
Client sets: store = result (thin client)
```

**Risk**: If two trades execute simultaneously, the optimistic concurrency check prevents corruption. If the client's local state diverges from server state (e.g., game ticks between trade and response), the server's state is still correct — the client syncs on next cloud save.

**Effort**: ~1.5 days  
**Rollback**: Revert to Phase A (server validates but doesn't mutate).

### Phase C: Market Snapshot Persistence (Price Accuracy)

**Goal**: Server uses current market prices (not just base prices) for exchange rate calculation.

**The Problem**: Currently, market prices are ONLY in the client. The server only has `basePrice` from config. The `currentPrice` is simulated client-side and drifts based on supply/demand, events, and volatility. If we use only base prices, the exchange rate won't match what the player sees in the UI.

**Changes**:
1. On each cloud sync (POST `/api/game/state`), store the client's market array as `market_snapshot` in `server_game_state`
2. Add `market_snapshot` column to `server_game_state` table (JSONB)
3. Server reads `market_snapshot` for current prices during trade validation
4. Falls back to base prices if `market_snapshot` is null (new users, stale data)
5. Staleness check: if `market_snapshot` is older than 5 minutes, log a warning but still use it
6. Server calculates: `givePrice = market_snapshot[giveResource].currentPrice ?? basePrice`

**Why this is acceptable**:
- The market snapshot was saved by the client during its last cloud sync
- It's "last known good" market data — may be slightly stale, but NOT client-fabricated for this specific trade
- An attacker would need to save a fabricated market_snapshot during a legitimate cloud sync, THEN trade against it
- This is much harder than simply fabricating it per-request
- The cloud sync already validates the gameState (cheat detection)

**Why not run the market simulation server-side**:
- The market simulator is ~800 lines of complex code (cycles, correlations, volatility, events, news)
- Running it server-side per-player would be extremely expensive
- The market state depends on player-specific production/consumption rates
- This is a future optimization, not a Phase 1C requirement

**Risk**: Market prices can be up to 5 minutes stale. In a volatile market, this could mean the player gets a slightly different rate than what the UI shows.

**Mitigation**: The UI should show "prices as of last sync" when the snapshot is stale. The trade result always shows the actual rate used.

**Effort**: ~0.5 days  
**Rollback**: Remove `market_snapshot` column read. Fall back to base prices only.

---

## 4. Failure Scenarios

### 4.1 Server Unavailable

```
Current: Trade rejected (C5 fail-closed fix)
Target:  Same — trade rejected, no fallback
```

**Behavior**: 
- Client shows: "Server unreachable — trade rejected for security"
- No local fallback. No optimistic execution.
- Player cannot trade while offline.

**Justification**: Server-authoritative trading REQUIRES the server. A local fallback would reintroduce the client-trust vulnerability.

### 4.2 Client Stale State

```
Scenario: Client thinks it has 1000 iron, server has 500 iron
(last cloud sync was 2 minutes ago, game tick consumed 500 iron)
```

**Detection**: Server reads `server_game_state.resources.iron = 500`. Client pre-flight passes (1000 ≥ 100). Server validation fails (500 < 100).

**Behavior**:
- Server returns: `{ success: false, error: "Not enough iron. Have 500, need 100.", code: "INSUFFICIENT_RESOURCES" }`
- Client shows error: "Not enough iron (server has 500, you tried to trade 100)"
- Client can optionally trigger a cloud sync to refresh local state

**UX improvement**: After a failed trade due to stale state, the client should automatically pull the latest server state:
```
Trade fails → Client calls GET /api/game/state → Updates local store → Shows correct amounts
```

### 4.3 Duplicate Requests

```
Scenario: User double-clicks "Execute Trade", two requests sent
```

**Prevention**:
1. **Client-side**: `isTrading` flag prevents double-submission (already implemented)
2. **Server-side**: Optimistic concurrency via `state_version`
   - First request: UPDATE ... WHERE state_version = 10 → succeeds (1 row)
   - Second request: UPDATE ... WHERE state_version = 10 → fails (0 rows, version is now 11)
3. **Rate limiting**: 1 trade per second per user (current rate limit)

**Behavior**: Second request returns `{ success: false, error: "Concurrent modification. Please retry.", code: "CONCURRENT_MODIFICATION" }`

### 4.4 Race Conditions

```
Scenario: Cloud sync and trade happen simultaneously
```

**Prevention**: Both operations use `state_version` for optimistic concurrency:
- Cloud sync: `UPDATE server_game_state SET ... WHERE state_version = X`
- Trade: `UPDATE server_game_state SET ... WHERE state_version = X`
- Only one can succeed with a given version number
- The loser must retry with the new version

**Behavior**: The first operation to complete wins. The second gets a concurrent modification error and retries.

**Concern**: Cloud sync overwrites `full_state`, which could undo a trade that just executed. 

**Mitigation**: Cloud sync should READ the current resources AFTER validating, and merge trade results. Or: use a lock per user (PostgreSQL `SELECT ... FOR UPDATE`).

**Recommended approach**: Use `SELECT ... FOR UPDATE` on the `server_game_state` row during both trade and cloud sync operations. This serializes per-user writes and prevents any race condition.

### 4.5 Cloud Sync Conflicts After Trade

```
Scenario: Trade executes on server. Then cloud sync overwrites with stale client state.
```

**The Problem**: Cloud sync (POST /api/game/state) upserts the ENTIRE `full_state` from the client. If a trade just executed on the server, the client doesn't know about it yet. Its next cloud sync would overwrite the server's post-trade state with pre-trade state.

**Solution Options**:

**Option 1: Trade-aware cloud sync (Recommended)**
- Cloud sync reads current `state_version` before writing
- If `state_version` changed since the client last read, the sync REJECTS and tells the client to pull fresh state
- Client pulls, merges locally, then syncs again
- This is optimistic concurrency, already part of the architecture

**Option 2: Selective resource merge**
- Cloud sync only updates non-resource fields (buildings, research, etc.)
- Resources are ONLY updated via trade API or full state reconciliation
- This prevents cloud sync from overwriting trade results

**Option 3: Resource versioning**
- Add `resource_version` separate from `state_version`
- Cloud sync checks `resource_version` before updating resources
- Trade API increments `resource_version`

**Recommendation**: Option 1 is simplest and most robust. It uses the existing `state_version` mechanism and requires no schema changes.

### 4.6 Partial Failures

```
Scenario: Trade validates, server_game_state mutates, but trade_history insert fails
```

**Behavior**: The trade is still valid — the mutation happened. The history insert is non-critical (fire-and-forget, like the existing `logActionAsync`).

```
Scenario: Server mutates resources but crashes before responding
```

**Behavior**: The client gets a network error. It doesn't know if the trade executed. On the next trade attempt or cloud sync, it will discover the truth.

**Mitigation**: Include `tradeId` in the response. Client can check trade status: `GET /api/game/trade/{tradeId}`. If the trade exists, it succeeded. If not, it didn't.

---

## 5. Security Review

### 5.1 Resource Fabrication

**Attack**: Attacker sends `giveAmount: 999999999` when they only have 100 iron.

**Current defense**: Server checks `gameState.resources.iron >= giveAmount` — but `gameState` comes from the client. **Exploitable.**

**New defense**: Server reads `server_game_state.resources.iron` from the database. The attacker cannot modify this value directly. **Blocked.**

### 5.2 Market Manipulation

**Attack**: Attacker sends fabricated `market` array with inflated iron price.

**Current defense**: Server calculates rate from `gameState.market` — which comes from the client. **Exploitable.**

**New defense (Phase A)**: Server calculates rate from `game_config_market` base prices. No client market data used. **Blocked** (but less accurate — base prices don't reflect market cycles).

**New defense (Phase C)**: Server calculates rate from `server_game_state.market_snapshot` — saved during the last legitimate cloud sync. **Blocked** for per-request fabrication. Acceptable staleness risk.

### 5.3 Replay Attack

**Attack**: Attacker captures a valid trade request and replays it.

**Current defense**: None. Each request is stateless.

**New defense**: 
1. `state_version` check — after the first trade, the version increments. The replayed request has the old version and fails.
2. Rate limiting — prevents rapid-fire replays.
3. Idempotency key (future enhancement) — client sends a unique key, server stores it for 60 seconds.

**Status**: **Blocked** by state_version. The replay would fail because the resources would already be deducted.

### 5.4 Duplicate Trade

**Attack**: Attacker submits the same trade twice (not replay, just two identical requests).

**Current defense**: Client `isTrading` flag (bypassable).

**New defense**:
1. Server `state_version` — second UPDATE fails because version changed after first.
2. Rate limiting — 1 trade/second cap.
3. Result: Second request returns `CONCURRENT_MODIFICATION`.

**Status**: **Blocked** by optimistic concurrency.

### 5.5 Capacity Bypass

**Attack**: Attacker sends `resourceCapacity.copper = Infinity` to receive unlimited copper.

**Current defense**: Server checks `gameState.resourceCapacity[receive]` — from client. **Exploitable.**

**New defense**: Server calculates capacity from `server_game_state.buildings` and config building definitions. The attacker cannot modify these in the database. **Blocked.**

### 5.6 Modified Client

**Attack**: Attacker uses a modified game client that sends arbitrary trade requests.

**Current defense**: Server validates the request against client-supplied data. **Exploitable** — a modified client can send anything.

**New defense**: Server validates against server-authoritative data. The client's request is treated as untrusted input — only `giveResource`, `giveAmount`, and `receiveResource` are read, and all three are validated. **Blocked** — the modified client can request trades, but the server decides if they're valid and how much the player receives.

**Remaining risk**: A modified client could spam trade requests faster than the rate limit. But each trade would still be validated against real server state.

---

## 6. Data Model Impact

### Existing Tables Affected

| Table | Change | Reason |
|---|---|---|
| `server_game_state` | Add `market_snapshot` JSONB column (Phase C) | Store last-known market prices for exchange rate calculation |
| `server_game_state` | Add `resource_capacity` JSONB column (Phase B) | Pre-computed capacity for faster trade validation |
| `trade_history` | Add `server_state_version` integer column | Track which state version the trade executed against |
| `trade_history` | Add `exchange_rate_used` float column | Audit trail for the exact rate used |

### New Tables Required

**None.** The existing `server_game_state`, `trade_history`, and `player_actions` tables are sufficient.

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
| Market snapshot staleness | `player_actions` | When market_snapshot is >5 min old during trade |

### Schema Migration

```sql
-- Phase B: Add resource_capacity for faster lookups
ALTER TABLE server_game_state
ADD COLUMN IF NOT EXISTS resource_capacity JSONB DEFAULT '{}';

-- Phase C: Add market_snapshot for current prices
ALTER TABLE server_game_state
ADD COLUMN IF NOT EXISTS market_snapshot JSONB DEFAULT NULL;

-- Phase B/C: Add audit columns to trade_history
ALTER TABLE trade_history
ADD COLUMN IF NOT EXISTS server_state_version INTEGER,
ADD COLUMN IF NOT EXISTS exchange_rate_used FLOAT;

-- Populate resource_capacity from existing full_state
UPDATE server_game_state
SET resource_capacity = (full_state->>'resourceCapacity')::jsonb
WHERE resource_capacity = '{}'::jsonb AND full_state IS NOT NULL;
```

---

## 7. Performance Impact

### Database Reads Per Trade

| Operation | Current | Phase A | Phase B | Phase C |
|---|---|---|---|---|
| Read server_game_state | 0 | 1 | 1 | 1 |
| Read game_config_market | 0 | 1 (cached) | 1 (cached) | 1 (cached) |
| **Total reads** | **0** | **2** | **2** | **2** |

Note: `game_config_market` is already cached in the `/api/game/action` route (5-minute TTL). The same cache can be reused.

### Database Writes Per Trade

| Operation | Current | Phase A | Phase B | Phase C |
|---|---|---|---|---|
| Write trade_history | 1 | 1 | 1 | 1 |
| Write player_actions | 1 | 1 | 1 | 1 |
| Update server_game_state | 0 | 0 | 1 | 1 |
| **Total writes** | **2** | **2** | **3** | **3** |

### API Calls Per Trade

| Call | Current | Target |
|---|---|---|
| POST /api/game/action | 1 | — |
| POST /api/game/trade | 0 | 1 |
| GET /api/game/state (stale recovery) | 0 | 0-1 (only on failure) |
| **Total** | **1** | **1-2** |

### Cache Opportunities

| Cache | What | TTL | Benefit |
|---|---|---|---|
| Game config (existing) | Building definitions, market base prices | 5 min | Avoids Supabase query per trade |
| Server game state (per-user) | Resources, buildings, market_snapshot | None (real-time) | N/A — must be fresh |
| Tradable resources list | Static Set of 25 resources | Infinite | Already hardcoded |

### Latency Estimate

| Phase | Read Latency | Write Latency | Total |
|---|---|---|---|
| Current | 0 (no DB reads) | ~20ms (2 async writes) | ~20ms (perceived: 0, fire-and-forget) |
| Phase A | ~30ms (1 Supabase read) | ~20ms (2 async writes) | ~50ms |
| Phase B | ~30ms (1 read) | ~40ms (1 sync update + 2 async) | ~70ms |
| Phase C | ~30ms (1 read) | ~40ms (1 sync update + 2 async) | ~70ms |

**Assessment**: ~70ms total for a server-authoritative trade is acceptable. The current perceived latency is ~100ms (network round-trip + server validation). Adding 20-50ms for the DB read is well within UX tolerance.

### Scalability

- **Per-user**: 1 trade/second rate limit = max 60 trades/minute per user
- **Global**: Each trade = 1 Supabase read + 1 update. Supabase handles thousands of concurrent queries.
- **Cache hit rate**: Game config cache = ~95% hit rate (5-min TTL, shared across all users)
- **No new infrastructure**: Uses existing Supabase instance, existing cache, existing rate limiter

---

## 8. Implementation Plan

### Step 1: New Trade API Route + Server-Side State Read

**What**: Create `/api/game/trade` route that reads from `server_game_state` instead of request body.

**Files modified**:
- `src/app/api/game/trade/route.ts` — NEW
- `src/lib/game/serverEngine.ts` — Update `validateTradeAction` to accept server state
- `src/components/game/TradingPostPanel.tsx` — Update to call `/api/game/trade`

**Implementation details**:
1. New route: `POST /api/game/trade`
   - Auth + rate limit (same as `/api/game/action`)
   - Fetch `server_game_state` for authenticated user
   - Validate against server resources (not client)
   - Calculate exchange rate from game config base prices
   - Return `{ valid, correctedReceiveAmount }` (no mutation yet)
2. Update `TradingPostPanel`:
   - Change `validateTradeWithServer()` to call `/api/game/trade`
   - Remove `gameState` parameter from the request
   - Client still applies the trade locally
3. Keep `/api/game/action` with trade support for backwards compatibility

**Risk**: Low — new route, doesn't change existing behavior  
**Effort**: 1 day  
**Rollback**: Remove `/api/game/trade` route, revert TradingPostPanel to call `/api/game/action`

### Step 2: Server-Side State Mutation

**What**: Server executes the trade atomically and returns new resource state.

**Files modified**:
- `src/app/api/game/trade/route.ts` — Add mutation logic
- `src/components/game/TradingPostPanel.tsx` — Use server response to update store
- `src/lib/game/serverEngine.ts` — New `executeTradeAction` function

**Implementation details**:
1. After validation, mutate `server_game_state`:
   ```sql
   UPDATE server_game_state
   SET resources = new_resources,
       state_version = state_version + 1,
       last_tick_at = NOW()
   WHERE user_id = ? AND state_version = ?
   ```
2. If 0 rows affected → concurrent modification → return error
3. Return new resource state in response
4. Client does `useGameStore.setState({ resources: result.newResources })`
5. Client no longer calculates or applies trades locally

**Risk**: Medium — changes state ownership, requires careful concurrency handling  
**Effort**: 1.5 days  
**Rollback**: Revert to Step 1 (server validates, client applies)

### Step 3: Optimistic Concurrency for Cloud Sync

**What**: Ensure cloud sync doesn't overwrite trade results.

**Files modified**:
- `src/app/api/game/state/route.ts` — Add state_version check to POST handler
- `src/lib/hooks/useCloudSync.ts` — Handle state_version conflicts
- `src/components/game/TradingPostPanel.tsx` — Handle stale-state recovery

**Implementation details**:
1. Cloud sync POST includes `clientStateVersion`
2. Server checks: if `server.state_version > clientStateVersion`, a trade happened since last sync
3. In that case, server returns the current state instead of overwriting
4. Client merges: use server resources (authoritative), keep local non-resource state
5. After merge, client syncs again

**Risk**: Medium — cloud sync is critical path, must not break save/load  
**Effort**: 0.5 days  
**Rollback**: Remove state_version check from cloud sync

### Step 4: Market Snapshot + Capacity Persistence

**What**: Store market prices and resource capacities in server_game_state for accurate rate calculation.

**Files modified**:
- `src/app/api/game/state/route.ts` — Save market_snapshot on cloud sync
- `src/app/api/game/trade/route.ts` — Use market_snapshot for exchange rates
- `src/lib/game/serverEngine.ts` — Update rate calculation
- Database migration (add columns)

**Implementation details**:
1. On cloud sync: extract `market` from client gameState, store as `market_snapshot`
2. On trade: read `market_snapshot` for current prices, fall back to base prices
3. Calculate capacity from `server_game_state.buildings` + config, cache in `resource_capacity` column
4. Add staleness check: if `market_snapshot` is older than 5 minutes, log warning

**Risk**: Low — additive change, doesn't break existing flow  
**Effort**: 0.5 days  
**Rollback**: Stop reading `market_snapshot`, fall back to base prices. Column can remain (no harm).

---

### Implementation Order

```
Step 1 (Day 1)
├── New /api/game/trade route
├── Server reads from server_game_state
├── Client updated to use new route
└── Test: trades validated against server data

Step 2 (Day 2-3)
├── Server mutates server_game_state
├── Optimistic concurrency via state_version
├── Client uses server response for state update
└── Test: trades execute atomically on server

Step 3 (Day 3)
├── Cloud sync respects state_version
├── Conflict resolution on sync
├── Stale-state recovery in UI
└── Test: sync after trade doesn't overwrite

Step 4 (Day 4)
├── market_snapshot column + migration
├── resource_capacity column + migration
├── Rate calculation from market_snapshot
└── Test: exchange rates match UI display
```

### Total Effort: ~4 days

---

## Appendix A: Error Codes

| Code | HTTP | Meaning | Client Action |
|---|---|---|---|
| `INSUFFICIENT_RESOURCES` | 400 | Not enough give resource | Show "Not enough X" message |
| `INVALID_RESOURCE` | 400 | Resource not in tradable list | Should not happen (UI limits choices) |
| `SAME_RESOURCE` | 400 | Give and receive are the same | Should not happen (UI prevents) |
| `INVALID_AMOUNT` | 400 | giveAmount is NaN, negative, or > 1e9 | Should not happen (UI validates) |
| `ACCOUNT_LOCKED` | 403 | Account is locked for cheating | Show CloudSyncBlockBanner |
| `NO_GAME_STATE` | 404 | No server_game_state found | Trigger cloud sync first |
| `CONCURRENT_MODIFICATION` | 409 | state_version mismatch | Auto-retry once, then show error |
| `MARKET_STALE` | 200 | Market snapshot >5 min old (warning) | Show "prices may be slightly different" |
| `SERVER_UNAVAILABLE` | 503 | Server can't process trade | Show "trade unavailable" |

## Appendix B: API Contract

### POST /api/game/trade

**Request**:
```typescript
{
  giveResource: string;      // Required. Must be in TRADABLE_RESOURCES
  giveAmount: number;        // Required. Must be > 0, finite, <= 1e9
  receiveResource: string;   // Required. Must be in TRADABLE_RESOURCES
}
```

**Response (200, success)**:
```typescript
{
  success: true;
  tradeId: string;
  giveResource: string;
  giveAmount: number;
  receiveResource: string;
  receiveAmount: number;       // Server-calculated, authoritative
  commission: number;          // Amount lost to commission
  exchangeRate: number;        // Rate used (givePrice × 0.85 / receivePrice)
  newResources: Record<string, number>;  // Full updated resources
  stateVersion: number;        // New state version
}
```

**Response (400, validation error)**:
```typescript
{
  success: false;
  error: string;               // Human-readable message
  code: string;                // Machine-readable code (see Appendix A)
}
```

**Response (401, not authenticated)**:
```typescript
{
  error: "Authentication required";
  code: "AUTH_REQUIRED";
}
```

**Response (429, rate limited)**:
```typescript
{
  error: "Too many trade requests";
  code: "RATE_LIMITED";
}
```
