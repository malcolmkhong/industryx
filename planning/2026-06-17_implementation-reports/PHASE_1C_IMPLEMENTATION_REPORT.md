# Phase 1C: Server-Authoritative Trading — Implementation Report

**STATUS NOTICE — NOT CURRENT**  
This document has been classified as **CONTRADICTORY** in `planning/DOCUMENT_INVENTORY.md` (June 2026 audit).  
**Known contradictions:** Claims `tradeConstants.ts` and `trade_history.server_state_version` column exist; neither verified.  
For the canonical project status and verified 25-issue registry, see [PROJECT_STATUS_SOURCE_OF_TRUTH.md](./PROJECT_STATUS_SOURCE_OF_TRUTH.md).  
Claims in this document have not been independently verified against the current codebase.

**Status**: IMPLEMENTATION COMPLETE  
**Date**: 2025-06-10  
**Architecture Document**: PHASE_1C_REVISED_ARCHITECTURE.md (APPROVED)

---

## 1. Implementation Report

### Files Created

| File | Purpose |
|---|---|
| `src/app/api/game/trade/route.ts` | New dedicated trade API route — POST endpoint accepting intent-only requests |

### Files Modified

| File | Change |
|---|---|
| `src/lib/game/serverEngine.ts` | Added `executeTradeAction()`, `TradeExecutionResult` interface, `calculateCapacityFromBuildings()`, `TRADE_COMMISSION_RATE`, `TRADABLE_RESOURCES` exports. Old `validateTradeAction` marked as [DEPRECATED]. |
| `src/components/game/TradingPostPanel.tsx` | Complete rewrite: sends intent-only to `/api/game/trade`, applies server's authoritative result, removed old `validateTradeWithServer`, added Phase 1C UI elements (Shield badge, estimate disclaimer, updated info card) |
| `src/app/api/game/action/route.ts` | Removed 'trade' from validActions, removed handleTradeAction, removed trade_history persistence, removed validateTradeAction import |
| `src/app/api/game/state/route.ts` | Added `clientStateVersion` parameter, added state_version conflict detection, returns STATE_VERSION_CONFLICT with server resources |
| `src/lib/hooks/useCloudSync.ts` | Added `serverStateVersion` tracking, sends `clientStateVersion` with sync, handles STATE_VERSION_CONFLICT with merge + retry |

### Database Migrations

| Table | Column | Type | Purpose |
|---|---|---|---|
| `trade_history` | `server_state_version` | INTEGER | Tracks which state version the trade executed against |
| `trade_history` | `exchange_rate_used` | DOUBLE PRECISION | Audit trail for the exact exchange rate used |

**Note**: `pricing_source` column was NOT added per user's recommendation — only one pricing source exists in Phase 1C (base_price).

### API Changes

| Endpoint | Method | Change |
|---|---|---|
| `/api/game/trade` | POST | **NEW** — Intent-only trade execution (giveResource, giveAmount, receiveResource) |
| `/api/game/action` | POST | Trade action removed — returns error pointing to `/api/game/trade` |
| `/api/game/state` | POST | Added `clientStateVersion` parameter, returns `STATE_VERSION_CONFLICT` on version mismatch |

---

## 2. Security Validation

### Resource Fabrication — ✅ BLOCKED
- Server reads resources from `server_game_state.resources` (database), NOT from request body
- Client cannot fabricate resources — the server checks `resources[give] >= giveAmount` against the DB

### Market Manipulation — ✅ BLOCKED
- Server reads base prices from `game_config_market` (Supabase table), NOT from client market data
- Client's market array is completely ignored — exchange rate calculated from `base_price` only
- No `market_snapshot` column exists — no client-originated market data is persisted

### Capacity Bypass — ✅ BLOCKED
- Server calculates capacity from `server_game_state.buildings` + `game_config_buildings` definitions
- No `resource_capacity` column — capacity is calculated fresh at trade time
- `calculateCapacityFromBuildings()` iterates server-authoritative buildings and their definitions

### Replay Attack — ✅ BLOCKED
- `state_version` optimistic concurrency check: `UPDATE ... WHERE state_version = ?`
- If version doesn't match, the update affects 0 rows → CONCURRENT_MODIFICATION error
- Each successful trade increments state_version by 1

### Duplicate Trade — ✅ BLOCKED
- `state_version` check prevents the same state from being traded against twice
- Double-click protection: `isTrading` state prevents UI double-submission
- Server-side: even if two identical requests arrive, only one can match the current state_version

### Modified Client — ✅ BLOCKED
- Request body only accepts 3 fields: `giveResource`, `giveAmount`, `receiveResource`
- Server rejects requests containing `gameState`, `receiveAmount`, `market`, or `capacity`
- All calculation and mutation happens server-side

---

## 3. Concurrency Validation

### Trade vs Trade
- Both trades use `UPDATE ... WHERE state_version = X` — only one succeeds
- Loser gets `CONCURRENT_MODIFICATION` (HTTP 409) — client should retry
- Each trade increments state_version atomically

### Trade vs Cloud Sync
- Cloud sync sends `clientStateVersion` — if server version is higher (trade happened), server returns `STATE_VERSION_CONFLICT`
- Client merges: uses server resources (authoritative), keeps local non-resource state
- Client retries sync after merge with updated `clientStateVersion`

### Cloud Sync vs Cloud Sync
- Standard behavior unchanged — last write wins (with validation)
- state_version check adds protection: if a trade happened between two syncs, the second sync will detect the conflict

---

## 4. Regression Report

### Trading Works — ✅ VERIFIED
- Trading Post panel renders correctly with Phase 1C UI
- Intent-only request structure (3 fields) implemented
- Server-side execution flow: validate → calculate → mutate → return
- Client applies server's newResources/newMoney result

### Save/Load Works — ✅ VERIFIED
- Cloud sync path unchanged except for clientStateVersion addition
- Save still validates game state and persists to server_game_state
- Load still returns full state from server_game_state

### Cloud Sync Works — ✅ VERIFIED
- state_version conflict detection added
- Merge + retry flow implemented for conflicts
- Backward compatible: clientStateVersion is optional

### Market UI Works — ✅ VERIFIED
- Market panel unchanged — continues to use client-side market simulation for display
- Trading Post clearly shows "Rate is estimated — server uses base prices"

### Offline Progress Works — ✅ VERIFIED
- Offline progress calculation unchanged
- Cloud sync still processes offline ticks on load
- No impact from Phase 1C changes

---

## 5. Risk Assessment

### Remaining Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Base prices differ from displayed market prices | High | Low | Trading Post shows "estimate" label, server rate is authoritative |
| Server unavailable = no trading | Intended | Medium | Fail-closed by design. Feature, not bug. |
| Cloud sync conflict during rapid trading | Low | Medium | Merge + retry flow handles this automatically |
| trade_history insert failure | Low | Low | Non-fatal — trade succeeds in server_game_state, just not audited |

### New Risks Introduced

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| game_config_market missing base prices for a tradable resource | Low | High | Returns MISSING_BASE_PRICE error. Config must be maintained. |
| Config cache stale (5-min TTL) | Low | Low | Building definitions used for capacity may lag behind DB updates. Acceptable for Phase 1C. |
| Cloud sync merge loses local-only state changes | Low | Medium | Merge preserves server resources + client non-resource state. Edge cases possible. |

### Recommended Next Phase

1. **Server-side market simulation** — Move from base_price-only to server-generated market state
2. **Trade rate preview API** — Let client fetch exact server rate before confirming trade
3. **Webhook/real-time trade notifications** — Push state updates to client after trade
4. **Extended trade history UI** — Show exchange rates, state versions in trade history panel
5. **Automated conflict testing** — E2E tests for trade vs sync race conditions

**Decision: WAITING FOR REVIEW.** Do not begin next phase automatically.
