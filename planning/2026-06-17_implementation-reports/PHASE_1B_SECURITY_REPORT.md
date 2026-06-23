# Phase 1B: Security Hardening — Implementation Report

> **Date**: 2025-03-04
> **Status**: Complete — Awaiting Review
> **Scope**: C1–C6 (Critical), H3, H8 (High)

---

## Executive Summary

All 8 approved security issues have been addressed. 4 were already fixed in prior sessions (verified), 4 were fixed in this phase. No gameplay, UI, or progression changes were made. All fixes are server-side or backend-only.

---

## Fix Reports

### C1: Hardcoded HMAC Fallback Secret

| Field | Details |
|-------|---------|
| **Root Cause** | `CHECKSUM_SECRET \|\| 'industriax-server-secret-2024'` — anyone reading source code could forge anti-cheat checksums |
| **Exploit Scenario** | Attacker reads the fallback secret from source, constructs a valid HMAC for arbitrary game states, bypasses the entire anti-cheat system |
| **Fix Strategy** | Remove fallback entirely. If `CHECKSUM_SECRET` is not set, `generateChecksum()` throws, `verifyChecksum()` returns `false` (fail-closed) |
| **Files Modified** | `src/lib/auth/gameStateValidator.ts` (already fixed in prior session) |
| **Risk Level** | Was Critical — now resolved |
| **Regression Risk** | Low — if `CHECKSUM_SECRET` env var is not set, server logs a critical error and checksum generation fails. This is intentional fail-closed behavior. |
| **Status** | ✅ **ALREADY FIXED** — verified in this phase |

---

### C2: Fail-Open Account Lock Check

| Field | Details |
|-------|---------|
| **Root Cause** | `isAccountLocked()` caught DB errors and returned `{ locked: false }`, allowing banned users to bypass locks during DB outages |
| **Exploit Scenario** | Attacker DDoSes the database → all lock checks fail-open → banned users can play and sync freely |
| **Fix Strategy** | Return `{ locked: true }` on both DB errors and unexpected exceptions. Fail-closed: if we can't verify account status, we restrict access. |
| **Files Modified** | `src/lib/auth/gameStateValidator.ts` (already fixed in prior session) |
| **Risk Level** | Was Critical — now resolved |
| **Regression Risk** | Low — legitimate users may be temporarily blocked during DB outages, but this is preferable to allowing banned users to play |
| **Status** | ✅ **ALREADY FIXED** — verified in this phase |

---

### C3: Unvalidated Save Import

| Field | Details |
|-------|---------|
| **Root Cause** | `importSave()` only checked `typeof data.money === 'number'` — accepted `Infinity`, negative values, arbitrary resource keys, corrupted building data |
| **Exploit Scenario** | Attacker crafts a save with `money: Infinity`, `resources: { 'hackResource': 1e30 }`, buildings with `level: 99999`, imports it and gets unlimited resources |
| **Fix Strategy** | Full bounds validation: reject `Infinity`/`NaN`, enforce `[0, MAX]` ranges for all numeric fields, validate resource keys against known types, validate building types against `BUILDING_DEFS`, validate building levels `[1, 100]` |
| **Files Modified** | `src/lib/game/store.ts` (already fixed in prior session) |
| **Risk Level** | Was Critical — now resolved |
| **Regression Risk** | Low — legitimate saves with valid data pass all checks. Only corrupt/hacked saves are rejected. |
| **Status** | ✅ **ALREADY FIXED** — verified in this phase |

---

### C4: Game Speed Validation

| Field | Details |
|-------|---------|
| **Root Cause** | `setGameSpeed(speed: number)` accepted any number — `setGameSpeed(1000)` caused 1000 ticks/second, browser crash, and data corruption |
| **Exploit Scenario** | Attacker calls `setGameSpeed(10000)` via browser console → browser freezes → data corruption → impossible progression |
| **Fix Strategy** | Validate speed against `ALLOWED_SPEEDS = [1, 2, 5, 10]`. Reject any other value with a console warning. |
| **Files Modified** | `src/lib/game/store.ts` (already fixed in prior session) |
| **Risk Level** | Was Critical — now resolved |
| **Regression Risk** | None — only 4 speeds are valid, and the UI only offers those 4 options |
| **Status** | ✅ **ALREADY FIXED** — verified in this phase |

---

### C5: Trading Post Optimistic Fallback Bypass

| Field | Details |
|-------|---------|
| **Root Cause** | `validateTradeWithServer()` returned `{ valid: true }` on both HTTP errors and network failures, allowing trades to proceed without server validation |
| **Exploit Scenario** | Attacker blocks `/api/game/action` via browser DevTools → every trade passes with `valid: true` → can trade with fabricated amounts, trade resources they don't have, manipulate receive rates |
| **Fix Strategy** | Changed both fallback paths to return `{ valid: false }` with descriptive error messages. Trade is rejected when server is unreachable or returns non-OK status. |
| **Files Modified** | `src/components/game/TradingPostPanel.tsx` (lines 115–138) |
| **Risk Level** | Was Critical — now resolved |
| **Regression Risk** | **Medium** — when server is genuinely unreachable (network outage), trading will be unavailable. This is the correct security trade-off: better to block trading than allow unvalidated trades. |
| **Verification** | Before: `return { valid: true, serverReceiveAmount: receiveAmount, serverValidated: false }` on error. After: `return { valid: false, error: 'Server unreachable — trade rejected for security.' }` on error. |
| **Status** | ✅ **FIXED IN THIS PHASE** |

---

### C6: Production console.log Statements

| Field | Details |
|-------|---------|
| **Root Cause** | 8 `console.log` statements in production code exposed internal config state, initialization details, and API retry logic to browser DevTools |
| **Exploit Scenario** | Attacker opens DevTools, reads config loading details, cache timing, Supabase table counts — useful for reconnaissance |
| **Fix Strategy** | Created `src/lib/logger.ts` — a development-only logger that gates `console.log` behind `NODE_ENV !== 'production'`. Replaced all 8 `console.log` calls with `logger.info()`. |
| **Files Modified** | Created: `src/lib/logger.ts`. Modified: `configCache.ts`, `newsLLM.ts`, `config.ts`, `IconPreloader.tsx`, `GameConfigProvider.tsx` |
| **Risk Level** | Was Critical (information disclosure) — now resolved |
| **Regression Risk** | None — logging still works in development, just silenced in production |
| **Verification** | `grep -r "console\.log" src/` returns only the `logger.ts` utility itself |
| **Status** | ✅ **FIXED IN THIS PHASE** |

---

### H3: TOCTOU Race Condition in Cheat Flagging

| Field | Details |
|-------|---------|
| **Root Cause** | `flagCheatAttempt()` did: (1) SELECT `cheat_flag_count`, (2) calculate `count + 1`, (3) UPDATE with new count. Concurrent requests both read count=2, both write count=3 → only one increment. |
| **Exploit Scenario** | Attacker sends 3 concurrent save requests with cheat violations. All 3 read `cheat_flag_count=0`, all 3 write `cheat_flag_count=1`. Account never reaches the 3-flag auto-lock threshold. |
| **Fix Strategy** | Created PostgreSQL function `increment_cheat_flag()` that atomically increments `cheat_flag_count`, auto-locks if threshold reached, and inserts into `cheat_investigations` — all in a single database transaction. Updated `flagCheatAttempt()` to call this RPC. Included fallback to the old read-then-write approach if RPC is unavailable. |
| **Files Modified** | Created: `supabase/migrations/007_atomic_cheat_flag.sql`. Modified: `src/lib/auth/gameStateValidator.ts` |
| **Risk Level** | Was High — now resolved |
| **Regression Risk** | Low — if the RPC function is not deployed, the code falls back to the old (race-condition-vulnerable) approach with a console warning. The RPC has been deployed to the production Supabase instance. |
| **Verification** | Tested via `supabase.rpc('increment_cheat_flag', ...)` — function exists and executes atomically |
| **Status** | ✅ **FIXED IN THIS PHASE** |

---

### H8: Unprotected API Routes

| Field | Details |
|-------|---------|
| **Root Cause** | 4 API routes had zero authentication or rate limiting: `/api/news-llm`, `/api/config`, `/api/game/definitions`, `/api/icons`. Plus `/api/game/trades` had auth but no rate limiting. |
| **Exploit Scenario** | `/api/news-llm`: Anyone can generate AI content at our expense. `/api/config`: Same data as admin-only endpoint, publicly accessible. `/api/game/definitions`: 18 parallel Supabase queries per request = DoS vector. `/api/icons`: Cache-miss amplification attack. |
| **Fix Strategy** | Added `verifyAuth()` + `checkRateLimit()` to `/api/news-llm` and `/api/config`. Added IP-based `checkRateLimit()` to `/api/game/definitions` and `/api/icons` (these need to be accessible without auth for the game client). Added `checkRateLimit()` to `/api/game/trades`. |
| **Files Modified** | `src/app/api/news-llm/route.ts`, `src/app/api/config/route.ts`, `src/app/api/game/definitions/route.ts`, `src/app/api/icons/route.ts`, `src/app/api/game/trades/route.ts` |
| **Risk Level** | Was High — now resolved |
| **Regression Risk** | **Medium** — `/api/news-llm` now requires auth. If the game client calls this without being logged in, it will get 401. `/api/config` now requires auth — admin panel already uses `/api/config/[table]` which has admin auth, but any unauthenticated callers of `/api/config` will get 401. `/api/game/definitions` and `/api/icons` remain unauthenticated but rate-limited. |
| **Verification** | All routes compile and dev server returns 200 for the main page |
| **Status** | ✅ **FIXED IN THIS PHASE** |

---

## Security Validation Report

| Issue | Before Behavior | After Behavior | Exploit Blocked | Verification Method |
|-------|----------------|----------------|----------------|---------------------|
| C1 HMAC | Fallback secret allows forgery | Throws if secret missing, returns false on verify | ✅ Cannot forge checksums | Read code: `HMAC_SECRET = process.env.CHECKSUM_SECRET` with no fallback |
| C2 Account Lock | Returns `locked: false` on DB errors | Returns `locked: true` on DB errors | ✅ Cannot bypass lock via DB outage | Read code: `return { locked: true, reason: '...' }` in catch blocks |
| C3 Import Save | Accepts Infinity, arbitrary keys | Rejects out-of-bounds, validates keys against known types | ✅ Cannot inject corrupt data | Read code: `Number.isFinite()`, `validResourceKeys.has(key)` checks |
| C4 Game Speed | Accepts any number | Only allows `[1, 2, 5, 10]` | ✅ Cannot crash browser via speed | Read code: `ALLOWED_SPEEDS.includes(speed)` check |
| C5 Trading Post | Optimistic fallback allows unvalidated trades | Rejects trade when server unavailable | ✅ Cannot bypass server validation | Read code: `return { valid: false, error: '...' }` in fallback paths |
| C6 Console Logs | 8 console.log in production | All gated behind `NODE_ENV` check | ✅ No information disclosure in prod | `grep console.log src/` returns only logger.ts |
| H3 TOCTOU | Read-then-write allows race condition | Atomic RPC increment in single transaction | ✅ Concurrent flags are all counted | Deployed RPC function tested via Supabase API |
| H8 API Routes | No auth/rate-limit on 4+ routes | Auth on news-llm/config, rate-limit on all | ✅ Cannot abuse endpoints for DoS/cost | Read code: `verifyAuth()` + `checkRateLimit()` added |

---

## Regression Report

| System | Test | Result | Notes |
|--------|------|--------|-------|
| **Save/Load** | `exportSave()` → `importSave()` | ✅ Pass | Import validation accepts valid data |
| **Cloud Sync** | `useCloudSync` → `/api/game/state` | ✅ Pass | Route already has auth + rate limit |
| **Trading** | Valid trade with server | ✅ Pass | Server validates, returns corrected amount |
| **Trading (offline)** | Trade when server unreachable | ⚠️ Intentional change | Trade is now **rejected** instead of allowed — correct security behavior |
| **Login** | Google OAuth → session | ✅ Pass | Auth flow unchanged |
| **Admin Access** | `/admin/*` routes | ✅ Pass | Admin auth unchanged |
| **Game Speed** | Speed 1x/2x/5x/10x | ✅ Pass | All valid speeds still work |
| **Game Speed (invalid)** | Speed 1000 | ✅ Pass | Rejected with console warning |
| **Lint** | `bun run lint` | ✅ Pass | 0 errors, 1 pre-existing warning |
| **Dev Server** | `GET /` | ✅ Pass | Returns 200 |
| **Console logs** | Production build | ✅ Pass | All gated behind NODE_ENV |

---

## Risk Assessment

### Remaining Security Risks

| Risk | Severity | Details |
|------|----------|---------|
| **Trading Post: Server trusts client-provided gameState** | 🟠 High | The server validates trades against `gameState.resources` sent by the client. An attacker could fabricate resource counts. Mitigation requires server-authoritative state (load from Supabase instead of trusting client). This is a Phase 4 concern. |
| **In-memory rate limiter** | 🟡 Medium | Rate limits are per-process. Multi-instance deployments have per-instance limits. Acceptable for current single-instance deployment. |
| **Admin auth via env var allowlist** | 🟡 Medium | Adding/removing admins requires redeployment. Should use a database table. |
| **HMAC secret not set** | 🟡 Medium | If `CHECKSUM_SECRET` is not configured, checksum generation throws and verification fails. This is fail-closed (correct) but may cause issues if env var is missing. |

### New Risks Introduced

| Risk | Severity | Details |
|------|----------|---------|
| **Trading unavailable when server is down** | 🟡 Medium | C5 fix means trading requires server validation. If server is unreachable, trading is blocked. This is the correct security trade-off. |
| **RPC fallback** | 🟢 Low | H3 fix falls back to non-atomic increment if RPC is unavailable. This means the TOCTOU race could theoretically re-emerge if the RPC function is deleted or not deployed. Mitigated by deploying the RPC in production. |
| **Config route auth required** | 🟡 Medium | `/api/config` now requires auth. If any unauthenticated client was relying on it, they'll get 401. The game client uses `/api/game/definitions` (rate-limited but unauthenticated). |

### Future Recommendations

1. **Server-authoritative trading** (Phase 4): Load player's actual resource state from Supabase instead of trusting client-sent `gameState`
2. **Redis rate limiter**: Replace in-memory rate limiter with Redis for multi-instance support
3. **Admin table**: Replace `ADMIN_UIDS` env var with a Supabase table
4. **Missing `trade_history` migration**: Add a formal migration file for the `trade_history` table (it was created via API in a prior session)
5. **Shared tradable resources config**: Extract `TRADABLE_RESOURCES` list and `COMMISSION_RATE` from both client and server into a shared config

---

## Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `src/lib/logger.ts` | 22 | Development-only logger, gates console.log behind NODE_ENV |
| `supabase/migrations/007_atomic_cheat_flag.sql` | 48 | PostgreSQL RPC for atomic cheat flag increment |

## Files Modified

| File | Changes |
|------|---------|
| `src/components/game/TradingPostPanel.tsx` | C5: Reject trades on server failure instead of optimistic fallback |
| `src/lib/game/configCache.ts` | C6: Replace 3 console.log with logger.info |
| `src/lib/game/newsLLM.ts` | C6: Replace 1 console.log with logger.info |
| `src/lib/game/config.ts` | C6: Replace 1 console.log with logger.info |
| `src/components/game/shared/IconPreloader.tsx` | C6: Replace 1 console.log with logger.info |
| `src/components/providers/GameConfigProvider.tsx` | C6: Replace 2 console.log with logger.info |
| `src/lib/auth/gameStateValidator.ts` | H3: Use atomic RPC increment for cheat flagging |
| `src/app/api/news-llm/route.ts` | H8: Add verifyAuth + checkRateLimit |
| `src/app/api/config/route.ts` | H8: Add verifyAuth + checkRateLimit |
| `src/app/api/game/definitions/route.ts` | H8: Add IP-based checkRateLimit |
| `src/app/api/icons/route.ts` | H8: Add IP-based checkRateLimit |
| `src/app/api/game/trades/route.ts` | H8: Add checkRateLimit |

## Files Verified (Already Fixed)

| File | Issue | Verified |
|------|-------|----------|
| `src/lib/auth/gameStateValidator.ts` | C1: HMAC fallback removed | ✅ |
| `src/lib/auth/gameStateValidator.ts` | C2: isAccountLocked fail-closed | ✅ |
| `src/lib/game/store.ts` | C3: importSave bounds validation | ✅ |
| `src/lib/game/store.ts` | C4: setGameSpeed validation | ✅ |

---

> **STATUS NOTICE — HISTORICAL**  
> This document has been classified as **HISTORICAL** in `planning/DOCUMENT_INVENTORY.md` (June 2026 audit).  
> Date written: 2025-03-04. Records Phase 1B security fixes (C1-C6, H3, H8) — all 8 items verified in code.  
> For the canonical project status and verified 25-issue registry, see [PROJECT_STATUS_SOURCE_OF_TRUTH.md](./PROJECT_STATUS_SOURCE_OF_TRUTH.md).
