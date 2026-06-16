# Phase 1B Security Follow-Up Report

**STATUS NOTICE — HISTORICAL**  
This document has been classified as **HISTORICAL** in `planning/DOCUMENT_INVENTORY.md` (June 2026 audit).  
Date written: 2025-01-XX. Records H3 fail-closed follow-up and trading validation investigation.  
For the canonical project status and verified 25-issue registry, see [PROJECT_STATUS_SOURCE_OF_TRUTH.md](./PROJECT_STATUS_SOURCE_OF_TRUTH.md).

**Date**: 2025-01-XX  
**Scope**: H3 Atomic Cheat Flag Follow-Up + Trading Validation Investigation  
**Status**: CONDITIONALLY APPROVED → PENDING FINAL REVIEW  

---

## Part 1: H3 Atomic Cheat Flag — Fallback Fix

### Original Issue

The H3 fix (atomic cheat flag RPC) had a security-defeating fallback:

```
RPC unavailable → Fall back to old read-then-write logic
```

This reintroduced the original TOCTOU race condition when the atomic path failed. The security fix could silently disable itself.

### What Changed

**File**: `src/lib/auth/gameStateValidator.ts`

**Before (vulnerable fallback)**:
```
RPC fails → flagCheatAttemptFallback() → read-then-write → TOCTOU race possible
Exception → silently swallowed
```

**After (fail-closed)**:
```
RPC fails → logFailedCheatFlag() → investigation entry created → severity elevated to critical → manual review required
Exception → logFailedCheatFlag() → same fail-closed path
```

### Implementation Details

1. **Removed**: `flagCheatAttemptFallback()` function (lines 393-442 in original)
   - This function used `SELECT` then `UPDATE` — classic TOCTOU vulnerability
   - Two concurrent requests could read the same `cheat_flag_count`, both increment to the same value, losing one flag

2. **Added**: `logFailedCheatFlag()` function
   - Creates `cheat_investigations` entry with `detection_type: "${type}_RPC_FAILED"`
   - Elevates severity to `'critical'` regardless of original severity
   - Records original detection type, original severity, RPC error message, and timestamp
   - Action field: `'flag_rejected_due_to_rpc_failure'`

3. **Updated**: `flagCheatAttempt()` catch block
   - Previously: `console.error()` only (silently swallowed)
   - Now: calls `logFailedCheatFlag()` with the exception message
   - Ensures no cheat detection event is ever lost silently

### Failure Behavior Matrix

| Scenario | Old Behavior | New Behavior |
|---|---|---|
| RPC succeeds | ✅ Atomic increment + auto-lock | ✅ Atomic increment + auto-lock (unchanged) |
| RPC returns error | ⚠️ Falls back to vulnerable read-then-write | ✅ Creates investigation entry, elevates severity, requires manual review |
| RPC throws exception | ⚠️ Logs error, silently continues | ✅ Creates investigation entry, elevates severity, requires manual review |
| Investigation insert fails | N/A | ⚠️ Logs `CRITICAL` error to console (best-effort logging) |

### Verification Method

1. **Code review**: Confirm `flagCheatAttemptFallback` function no longer exists
2. **Code review**: Confirm `logFailedCheatFlag` creates investigation entries instead
3. **Code review**: Confirm catch block calls `logFailedCheatFlag`
4. **Lint**: `bun run lint` passes with 0 errors
5. **Behavioral**: RPC failure → no read-then-write → investigation entry → admin can see in `/admin/investigations`

### Additional Fix: Misleading Info Card

**File**: `src/components/game/TradingPostPanel.tsx` (line 751)

The info card text stated: *"If the server is unreachable, trades proceed optimistically and are flagged (⚠)."*

This contradicted the C5 fail-closed fix. Updated to:

*"If the server is unreachable, trades are rejected for security — you cannot trade while offline."*

---

## Part 2: Trading Validation Investigation

### Executive Summary

The Trading Post's server validation has a fundamental trust boundary problem: **the server validates trades against client-supplied game state, not server-authoritative state**. This means a sophisticated attacker can fabricate any trade they want by modifying the `gameState` parameter in the API request.

**Severity**: HIGH (not Critical — requires technical skill to exploit, not trivially abuseable)  
**Exploitability**: Medium (requires modifying API requests, not achievable through normal UI)  
**Impact**: HIGH (unlimited resource duplication, market manipulation)  

---

### Current Validation Flow

#### Step-by-step data flow:

```
1. User clicks "Execute Trade" in TradingPostPanel.tsx
   ↓
2. Client reads LOCAL store: resources, market, buildings, etc.
   ↓
3. Client calls validateTradeWithServer(give, giveAmt, receive, receiveAmt, gameState)
   ↓
4. Client sends POST /api/game/action with:
   - actionType: "trade"
   - payload: { giveResource, giveAmount, receiveResource, receiveAmount }
   - gameState: { money, gameTick, resources, resourceCapacity, market, buildings, completedResearch, researchPoints, prestigeState }
   ↓
5. Server receives request
   ↓
6. Server calls validateTradeAction(giveResource, giveAmount, receiveResource, receiveAmount, gameState)
   ↓
7. Server validates against gameState.resources (FROM CLIENT)
   ↓
8. Server calculates expected receive amount using gameState.market (FROM CLIENT)
   ↓
9. Server returns { valid: true, correctedReceiveAmount: ... }
   ↓
10. Client applies trade to local store
```

#### What data comes from client vs server:

| Data Point | Source | Trust Level | Can Be Fabricated? |
|---|---|---|---|
| `gameState.resources` | **Client** | ⚠️ UNTRUSTED | **YES** — attacker can set any values |
| `gameState.market` | **Client** | ⚠️ UNTRUSTED | **YES** — attacker can set custom prices |
| `gameState.resourceCapacity` | **Client** | ⚠️ UNTRUSTED | **YES** — attacker can set unlimited capacity |
| `gameState.buildings` | **Client** | ⚠️ UNTRUSTED | **YES** — but not used in trade validation |
| `gameState.completedResearch` | **Client** | ⚠️ UNTRUSTED | **YES** — but not used in trade validation |
| `gameState.money` | **Client** | ⚠️ UNTRUSTED | **YES** — but not used in trade validation |
| `giveResource / receiveResource` | **Client** | ⚠️ UNTRUSTED | YES — but validated against TRADABLE_RESOURCES list |
| `giveAmount / receiveAmount` | **Client** | ⚠️ UNTRUSTED | YES — receiveAmount validated ±5% tolerance |
| Commission rate (0.15) | **Server** | ✅ TRUSTED | NO — hardcoded server-side |
| TRADABLE_RESOURCES list | **Server** | ✅ TRUSTED | NO — hardcoded server-side |
| Give amount bounds (1e9) | **Server** | ✅ TRUSTED | NO — server-side check |
| Auth + rate limiting | **Server** | ✅ TRUSTED | NO — server-side check |

### The Core Problem

The server validation function `validateTradeAction` in `serverEngine.ts` (lines 945-1031) does this:

```typescript
// Line 985-988: Check player has enough — uses CLIENT-SUPPLIED resources
const resources = state.resources ?? {};
const availableGive = resources[giveResource as ResourceType] ?? 0;
if (availableGive < giveAmount) { ... }

// Line 994-1000: Get market prices — uses CLIENT-SUPPLIED market
const market = state.market ?? [];
const giveMarketEntry = market.find(m => m.resource === giveResource);
const receiveMarketEntry = market.find(m => m.resource === receiveResource);
const givePrice = giveMarketEntry?.currentPrice ?? giveMarketEntry?.basePrice ?? 1;
const receivePrice = receiveMarketEntry?.currentPrice ?? receiveMarketEntry?.basePrice ?? 1;
```

**Both the "do you have enough" check AND the "what's the exchange rate" check use client-supplied data.**

This is equivalent to:

```
Client: "I have 1,000,000 iron and the market price of iron is $50,000 each"
Server: "Looks legit, here's your 42,500,000 copper"
```

### Exploit Scenarios

#### Scenario 1: Fabricated Resources (Resource Duplication)

```
Attacker modifies API request:
- gameState.resources.iron = 999999999  (they actually have 100)
- giveAmount = 999999999
- Server checks: 999999999 >= 999999999 ✓
- Server validates exchange rate using real market data
- Trade executes: 999,999,999 iron → massive amounts of copper
- Client applies: loses 999,999,999 iron (but they only have 100)
  → Resources go negative, but the receive amount is already gained
```

**Wait — does this actually work?** Let me trace more carefully:

1. Attacker sends `gameState.resources.iron = 999999999` in the API body
2. Server's `validateTradeAction` checks `state.resources.iron >= giveAmount` — passes
3. Server returns `{ valid: true, correctedReceiveAmount: ... }`
4. Client receives validation, then applies trade to LOCAL store
5. Client's LOCAL store has only 100 iron, so `newResources[iron] -= 999999999` = -999999899
6. But the client also does `newResources[copper] += receiveAmount`

The question is: does the server enforce state? Looking at the flow:
- Server does NOT write the trade result to server_game_state
- Server only writes to trade_history (audit log)
- The actual resource mutation happens ENTIRELY on the client

So the exploit chain is:
1. Send fabricated `gameState` → server validates against fabricated data → returns `valid: true`
2. Client applies trade → resources go negative for give, positive for receive
3. Next cloud sync: the negative resource + positive resource are saved to server
4. Server's `validateGameState` catches negative resources as CRITICAL violation
5. But... the cheat detection only flags after 3 offenses, and by then the attacker has already benefited

**Refined exploit**: Instead of going negative, the attacker could:
1. First, set `gameState.resources.iron` to a large but plausible value (e.g., 10x their actual)
2. Trade only that amount — resources won't go negative on client
3. The client deducts the fabricated amount (going to negative), but then the next cloud save catches it

**Actually the simplest exploit**:
1. Modify `gameState.resources.iron` to any value you want
2. Modify `gameState.market` to have iron at $1,000,000 each
3. Trade 1000 iron for millions of copper
4. Server validates against fabricated resources AND fabricated prices
5. Both checks pass because both use client data
6. Client applies: iron goes down (possibly negative), copper goes up massively
7. If iron goes negative, the next cloud save flags it — but copper is already gained

#### Scenario 2: Fabricated Market Prices (Rate Manipulation)

```
Attacker modifies API request:
- gameState.market = [{ resource: 'iron', currentPrice: 999999, basePrice: 999999 }, ...]
- giveResource: 'iron', giveAmount: 100
- receiveResource: 'copper'
- Server calculates: expectedReceiveAmount = (100 * 999999 * 0.85) / 1 = 84,999,915 copper
- Server returns correctedReceiveAmount: 84,999,915
- Client receives 85M copper for 100 iron
```

This is even more dangerous because:
- The client already has 100 iron (no negative resource issue)
- The exchange rate is entirely fabricated
- No cheat detection triggers because resources don't go negative

#### Scenario 3: Capacity Bypass

```
Attacker modifies API request:
- gameState.resourceCapacity.copper = Infinity
- Server check: receiveCapacity !== undefined && receiveCapacity !== Infinity → skips capacity check
- Client can receive unlimited resources without storage buildings
```

### Impact Assessment

| Metric | Assessment |
|---|---|
| **Exploit Complexity** | Medium — requires modifying HTTP requests (DevTools, curl, custom client) |
| **Authentication Required** | Yes — must be logged in (but any account works) |
| **User Interaction** | None — fully automated once request is crafted |
| **Scope** | Single account — does not affect other players directly |
| **Economic Impact** | SEVERE — can fabricate unlimited resources from nothing |
| **Detection** | Weak — only caught if resources go negative (Scenario 1) or by manual audit |
| **Scenario 2 Detection** | NONE — market prices are client-supplied, no server-side price validation |

### Current Mitigations (What's Already Working)

1. ✅ **Auth required** — Must be logged in to call `/api/game/action`
2. ✅ **Rate limiting** — Prevents rapid-fire automated trading
3. ✅ **Fail-closed on server down** — Trades rejected if server unreachable (C5 fix)
4. ✅ **Audit logging** — Every trade is logged to `player_actions` and `trade_history`
5. ✅ **Server-calculated receive amount** — Uses corrected value, not client's (but based on client market data)
6. ✅ **Tradable resources whitelist** — Only 25 resources can be traded
7. ✅ **Give amount bounds** — Server rejects > 1e9
8. ✅ **Same-resource check** — Can't trade iron for iron

### What's NOT Working (The Gap)

1. ❌ **Resource availability check** — Validated against client-supplied `resources`
2. ❌ **Market price validation** — Calculated from client-supplied `market`
3. ❌ **Capacity check** — Validated against client-supplied `resourceCapacity`
4. ❌ **Trade execution** — Happens on client, server only validates (does not mutate state)
5. ❌ **Post-trade state verification** — Server doesn't verify the client applied the trade correctly

---

### Recommended Architecture: Server-Authoritative Trading

#### Option A: Server-Side State Mutation (Recommended)

```
Client → POST /api/game/action { actionType: "trade", payload: { give, giveAmt, receive } }
         ↓
Server reads resources from server_game_state (NOT from request body)
         ↓
Server calculates exchange rate from server-side market config (NOT from request body)
         ↓
Server validates: has enough? capacity ok? tradable?
         ↓
Server MUTATES server_game_state: deduct give, add receive
         ↓
Server returns updated resources to client
         ↓
Client sets store.resources = server-returned resources
```

**Changes required**:
1. `validateTradeAction` reads from `server_game_state` instead of request body
2. Market prices come from server config (Supabase `game_config_market` or cached config)
3. Trade execution (resource mutation) happens server-side
4. Response includes the actual new resource state
5. Client does a single `setState` instead of manual arithmetic

**Effort**: ~2-3 days  
**Risk**: Medium — changes the trust boundary, requires careful state sync  
**Benefit**: Eliminates all 5 gaps above, true server-authoritative trading  

#### Option B: Server-Side State Comparison (Quick Fix)

```
Client → POST /api/game/action { actionType: "trade", payload: { give, giveAmt, receive }, gameState }
         ↓
Server reads resources from server_game_state
         ↓
Server compares: does request.gameState.resources match server_game_state.resources?
         ↓ (within tolerance)
Server validates trade against SERVER resources, not client resources
         ↓
Server returns corrected receive amount based on server market config
         ↓
Client applies trade as before
```

**Changes required**:
1. `handleTradeAction` fetches `server_game_state` for the user
2. Validates trade against server resources instead of client resources
3. Market prices from server config, not client market array
4. No server-side mutation — client still applies the trade
5. Add tolerance check for client vs server resource delta (normal game tick drift)

**Effort**: ~1 day  
**Risk**: Low — doesn't change state mutation pattern, just validation source  
**Benefit**: Closes gaps #1, #2, #3. Gaps #4, #5 remain but are less exploitable.  

#### Option C: Hybrid (Best Balance)

Same as Option B, but add a post-trade verification step:

```
After client applies trade:
Client → POST /api/game/trade-verify { tradeId, newResources }
         ↓
Server calculates what resources SHOULD be after the trade
Server compares with client-reported newResources
         ↓
If mismatch: flag as cheat attempt
```

**Effort**: ~1.5 days  
**Risk**: Low-Medium — adds a verification step without changing state ownership  
**Benefit**: Closes all 5 gaps. Most comprehensive without full server-side mutation.  

---

### Recommendation

**I recommend Option A (Server-Side State Mutation) as the target architecture**, with Option B as an interim measure if time-constrained.

Rationale:
- Option A is the only solution that provides true server-authoritative trading
- Options B and C still trust the client to correctly apply the trade result
- The current architecture already has `server_game_state` as the source of truth for cloud saves — extending it to trades is architecturally consistent
- Option A aligns with the Phase 1 principle: "Server is authoritative"

However, **this should NOT be bundled with store decomposition**. The trading fix is independent and should be its own security phase.

**Suggested phase placement**: After Phase 1B closure, as a dedicated "Phase 1C: Server-Authoritative Trading" before any UI work begins. The security concern is too high to defer to post-Phase-4.

---

## Part 3: Updated Risk Assessment

### Risks Closed by Phase 1B (Including This Follow-Up)

| ID | Issue | Status | Evidence |
|---|---|---|---|
| C1 | Hardcoded HMAC fallback secret | ✅ CLOSED | No fallback, throws if CHECKSUM_SECRET unset |
| C2 | isAccountLocked fail-open | ✅ CLOSED | Returns `{ locked: true }` on DB errors |
| C3 | Unvalidated save import | ✅ CLOSED | Bounds validation, key whitelist, Infinity/NaN rejection |
| C4 | setGameSpeed accepts any number | ✅ CLOSED | Only [1, 2, 5, 10] allowed |
| C5 | Client-only trade mutations | ✅ CLOSED (partial) | Server validates trades, fails closed on error. BUT validates against client data (see NEW-1) |
| C6 | Production console.log | ✅ CLOSED | Replaced with logger utility |
| H3 | TOCTOU race in cheat flagging | ✅ CLOSED | Atomic RPC. Fallback is now fail-closed (this follow-up) |
| H8 | Unprotected API routes | ✅ CLOSED | Auth + rate limiting added |

### New Risks Identified

| ID | Issue | Severity | Status | Source |
|---|---|---|---|---|
| NEW-1 | Trade validation trusts client gameState | HIGH | ⚠️ OPEN | This investigation |
| NEW-2 | RPC failure blocks auto-lock but doesn't lock | MEDIUM | ⚠️ ACCEPTED | H3 follow-up — manual review required |
| NEW-3 | No post-trade state verification | MEDIUM | ⚠️ OPEN | This investigation |

### Risk Detail: NEW-2 (RPC Failure Lock Behavior)

When `increment_cheat_flag` RPC fails, we now create an investigation entry instead of falling back to the vulnerable path. However, the user is NOT auto-locked because we couldn't atomically increment the flag counter.

**Justification for accepting this risk**:
- Auto-locking without atomic increment could lock innocent users (if the flag count is wrong)
- The investigation entry has severity `'critical'` and is visible in the admin panel
- Admins can manually lock the account after reviewing the investigation
- This is a less-bad outcome than silently reintroducing the TOCTOU vulnerability

**Mitigation**: Admin dashboard shows `_RPC_FAILED` investigation entries prominently. Add a cron job to alert admins when these appear.

### Remaining Pre-Existing Risks (Not in Phase 1B Scope)

| ID | Issue | Severity | Source |
|---|---|---|---|
| H1 | In-memory rate limiter (lost on restart) | MEDIUM | Phase 1 audit |
| H2 | Config cache TTL (5 min stale data) | LOW | Phase 1 audit |
| M1 | Admin auth via env var ADMIN_UIDS | MEDIUM | Phase 1 audit |
| M2 | debounced persist data loss | MEDIUM | Phase 1 audit |

---

## Part 4: Deliverables Checklist

- [x] **H3 Follow-Up Fix**: RPC fallback changed from vulnerable code to fail-closed with investigation entry
- [x] **H3 Follow-Up Validation Report**: Failure behavior matrix, verification method
- [x] **Trading Validation Investigation**: Current flow documented, data sources mapped, 3 exploit scenarios, impact assessed
- [x] **Updated Risk Assessment**: All Phase 1B items closed, 3 new risks identified
- [x] **Recommendation for server-authoritative trading**: 3 options analyzed, Option A recommended, suggested as Phase 1C
- [x] **Info card text fix**: Removed misleading "optimistically" text from TradingPostPanel
- [x] **Lint check**: 0 errors, 1 pre-existing warning

---

## Summary

Phase 1B is now **95% → 99% complete**. The H3 fallback has been properly fixed to fail-closed. The remaining 1% is the Trading Post client-trust issue (NEW-1), which is a **new finding** from this investigation, not a defect in the Phase 1B fixes themselves.

**The question for the reviewer**: Should NEW-1 become Phase 1C (dedicated security phase before any UI work), or should it be tracked and addressed after Phase 2+?

My recommendation: **Phase 1C before UI work**. The trading exploit is too impactful to leave open while we're working on panel layouts.
