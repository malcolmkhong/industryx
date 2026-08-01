# Phase 02 — Server Authority and Sync Alignment

## Status: PENDING
## Predecessor: Phase 01 Security Closure
## References: PHASE_1C_IMPLEMENTATION_REPORT.md, PHASE_1C_REVISED_ARCHITECTURE.md,
##              PHASE_1B_SECURITY_FOLLOWUP_REPORT.md, PHASE_1D_A_IMPLEMENTATION_REPORT.md

---

## Background

Phase 1C claimed to implement full server-authoritative trading. Audit found gaps:

**DONE (verified June 2025):**
- `/api/game/trade/route.ts` created — reads from `server_game_state`, uses `game_config_market`
- `TradingPostPanel.tsx` sends intent-only (giveResource, giveAmount, receiveResource)
- Trade removed from `/api/game/action`

**MISSING (claimed in Phase 1C report, NOT in code):**
- `useCloudSync.ts`: `serverStateVersion` tracking — NOT present
- `useCloudSync.ts`: sends `clientStateVersion` with sync requests — NOT present
- `useCloudSync.ts`: `STATE_VERSION_CONFLICT` handling — NOT present
- `/api/game/state`: accepts `clientStateVersion` parameter — NOT present
- `/api/game/state`: returns `STATE_VERSION_CONFLICT` on version mismatch — NOT present
- `trade_history` columns: `server_state_version`, `exchange_rate_used` — NOT verified

**MISSING from Phase 1D-A (dead code cleanup):**
- `src/lib/game/tradeConstants.ts` — NOT created (COMMISSION_RATE duplicated)
- `validateTradeAction()` in serverEngine.ts — still present (should be removed)
- `src/lib/db.ts` — was supposed to be deleted, not verified

---

## Objective

Complete the server authority model for trading and sync.
Close all Phase 1C gaps. Complete Phase 1D-A dead code items.

---

## Task Breakdown

### 02.1 Verify /api/game/trade End-to-End

File: `src/app/api/game/trade/route.ts`

Verify via browser or Supabase MCP:
1. Authenticated trade succeeds and updates `server_game_state.resources`
2. Insufficient resources returns 400 with clear error
3. Locked account returns 403
4. Concurrent trade (same `state_version`) returns 409 `STATE_VERSION_CONFLICT`
5. `trade_history` row inserted on success
6. Client `store.resources` matches server-returned resources after trade

If any verify step fails — fix before proceeding to 02.2.

### 02.2 Add clientStateVersion to Cloud Sync

File: `src/lib/hooks/useCloudSync.ts`
Reference: PHASE_1C_IMPLEMENTATION_REPORT.md (claimed implemented, not present)

1. Add `serverStateVersion: number | null` state to the hook
2. After successful load from cloud: store `stateVersion` from response
3. After successful save to cloud: store updated `stateVersion` from response
4. When saving: send `clientStateVersion: serverStateVersion` in POST body
5. Handle `STATE_VERSION_CONFLICT` response from `/api/game/state`:
   - Server returns conflict code + current server resources
   - Client merges: apply server resources to local store
   - Client retries sync with updated `clientStateVersion`

### 02.3 Add STATE_VERSION_CONFLICT to /api/game/state

File: `src/app/api/game/state/route.ts`
Reference: PHASE_1C_IMPLEMENTATION_REPORT.md (claimed implemented, not present)

1. Accept `clientStateVersion?: number` in POST body
2. After fetching current DB state, if `clientStateVersion` provided AND
   `db.state_version > clientStateVersion`:
   - Return HTTP 409 with `code: 'STATE_VERSION_CONFLICT'`
   - Return current server resources in response body
   - Do NOT overwrite server state
3. Client handles 409 by merging server resources then retrying
4. Make `clientStateVersion` optional for backwards compatibility

### 02.4 Create tradeConstants.ts Shared Module

File: `src/lib/game/tradeConstants.ts` (NEW)
Reference: PHASE_1D_A_IMPLEMENTATION_REPORT.md item 4 (claimed implemented, not present)

Problem: `TRADE_COMMISSION_RATE` (0.15) and `TRADABLE_RESOURCES` are duplicated:
- In `/api/game/trade/route.ts`
- In `TradingPostPanel.tsx`

Create:
```typescript
export const TRADE_COMMISSION_RATE = 0.15;
export const TRADABLE_RESOURCES: ResourceType[] = [...];
export const TRADABLE_RESOURCES_SET = new Set(TRADABLE_RESOURCES);
```

Then update both files to import from `tradeConstants.ts`.

### 02.5 Dead Code Cleanup (Phase 1D-A Remnants)

Files to clean:
- `src/lib/game/serverEngine.ts`:
  - Remove `validateTradeAction()` function (deprecated in 1C, still present)
  - Remove dead imports: ResourceAmount, CostResourceType
  - Remove `export` keyword from 7 internal-only functions
- `src/lib/db.ts` — if it exists, it is a zero-import orphan. Delete it.
- Remove any REMOVED or deprecated comment blocks from Phase 1C era

### 02.6 Verify trade_history Schema

Phase 1C report claimed two new columns were added:
  `server_state_version` (INTEGER)
  `exchange_rate_used` (DOUBLE PRECISION)

Using Supabase MCP:
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'trade_history'
ORDER BY ordinal_position
```

If columns missing: write `supabase/migrations/012_trade_history_columns.sql` to add them.
Update `/api/game/trade/route.ts` insert to include these columns.

---

## Deliverables

1. Cloud sync state_version conflict flow implemented (`useCloudSync` + `/api/game/state`)
2. `src/lib/game/tradeConstants.ts` created and imported by both server and client
3. `validateTradeAction()` removed from `serverEngine.ts`
4. Dead code cleanup complete
5. `trade_history` schema verified, migration written if needed
6. `planning/PHASE_02_IMPLEMENTATION_REPORT.md` with verification evidence

---

## Dependencies

- Phase 01 security items closed before touching sync behavior
- `/api/game/trade` verified working end-to-end (02.1) before adding sync around it
- Supabase MCP available for schema verification

---

## Validation

```bash
# Verify tradeConstants.ts exists and is imported
grep -r 'tradeConstants' src/          # should find imports in trade route and TradingPostPanel

# Verify validateTradeAction removed
grep -rn 'validateTradeAction' src/   # should return 0 matches

bun run lint  # 0 errors
bun run dev   # GET / returns 200
```

- Concurrent trade test: send two trades with same `state_version` — only one succeeds
- Stale-client sync test: trade via API, then sync with old `clientStateVersion` — gets 409

## Exit Criteria

- `useCloudSync` sends `clientStateVersion` with every sync attempt
- `/api/game/state` returns 409 `STATE_VERSION_CONFLICT` when client is behind
- `tradeConstants.ts` exists and imported by both server and client
- `validateTradeAction()` does not exist in `serverEngine.ts`
- `trade_history` has all required columns in production
