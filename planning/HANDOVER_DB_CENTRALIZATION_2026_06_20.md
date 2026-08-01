# Handover — DB Centralization Project

**Date:** 2026-06-20
**Author:** AI Agent (caveman full mode)
**Project:** IndustriaX — Factory Dominion: Automated Empire
**Project ref:** Supabase `wkkzqtseqwcyyyezroqq`, Next.js 16 + React 19 + Zustand 5

This document is the single handoff point for any engineer or AI agent continuing the Database Centralization migration. Read this **before touching any code** in this project area.

---

## Project Overview

### Objective

Centralize all database access in the codebase into a single, typed module layer at `src/lib/db/`. Today, every API route and library file imports the Supabase client directly from `@/lib/supabase/server` and writes its own `.from('table_name')` queries. This causes:

- **Duplication** — the same query logic rewritten across 70+ files
- **Drift risk** — hand-written interfaces in `src/lib/game/types.ts` can disagree with the real DB schema
- **No type safety boundary** — every consumer gets the full row shape, even when it only needs 2 columns
- **Difficult refactors** — schema changes require touching every consumer

The target is a **repository pattern** where every query lives in one place per table.

### Current Architecture (Pre-Migration)

```
API route → createServiceRoleClient() → supabase.from('table_name') → raw row
                                              ↑
                                       Schema knowledge spread
                                       across 70+ files
```

### Target Architecture

```
API route → @/lib/db/<table>.<function>() → typed Pick<> shape
                       ↑
                Centralized schema knowledge
                Strongly-typed return values
                Single place to update on schema change
```

### Progress Status

| Metric | Value |
|---|---|
| Iterations planned | 10 |
| Iterations complete | **1 of 10** (server_game_state) |
| Iterations in progress | **1 partial** (admins + admin_actions — code complete, validation pending) |
| Routes migrated | **8** (out of 71) |
| New `src/lib/db/` modules | **3** (serverGameState, admins, adminActions) |
| Net `.from('server_game_state')` calls removed from API routes | **14** |
| Net `.from('admin_users')` calls removed from admin management routes | **9** |
| Net `.from('admin_actions')` calls removed | **1** (`logAdminAction` in auth-helpers) |
| Project-wide `tsc --noEmit` errors | **0** |
| Project-wide lint errors in migrated files | **0** |
| Completion percentage (by route count) | **~11%** (8 of 71) |
| Completion percentage (by table count) | **~10%** (3 of 31 tables) |

---

## Completed Iterations

### Iteration 1 — `server_game_state` ✅ COMPLETE

**Date:** 2026-06-20
**Scope:** Centralize all queries against `server_game_state` and the `player_progress` fallback table.
**Routes migrated:** 8
**Status:** Merged-ready, all validation passing

#### Files Created
- `src/lib/db/serverGameState.ts` (320 lines, 16 exported functions)

#### Files Modified
- `src/app/api/game/state/route.ts` (3 call sites)
- `src/app/api/game/trade/route.ts` (2 call sites)
- `src/app/api/game/offline/route.ts` (3 call sites)
- `src/app/api/game/action/route.ts` (2 call sites)
- `src/app/api/cron/validate-ticks/route.ts` (1 call site)
- `src/app/api/auth/claim-guest/route.ts` (1 call site)
- `src/app/api/auth/link-identity/route.ts` (2 call sites)

#### New API Surface

```typescript
// Light-weight loaders — return Pick<ServerGameStateRow, ...>
loadServerGameStateLite(userId)              // 16 cols — used by /api/game/state GET
loadServerGameStateLiteForOffline(userId)    // 4 cols — used by /api/game/offline GET
loadServerGameStateForTick(userId)           // 8 cols — used by /api/game/offline POST
loadServerGameStateForTrade(userId)          // 5 cols — used by /api/game/trade
loadServerGameStateForAction(userId)         // 4 cols — used by /api/game/action
loadServerGameStateForPreview(userId)        // 5 cols — used by /api/auth/link-identity
loadServerGameStateForDeltaCheck(userId)     // 9 cols — used by /api/game/state POST
loadLockState(userId)                        // bool — used by /api/auth/claim-guest
loadActivePlayersSince(cutoffISO)            // array — used by /api/cron/validate-ticks
loadPlayerProgressGameState(userId)          // Record — used by /api/game/offline GET (fallback)

// Writers
saveServerGameState(userId, patch)
saveServerGameStateOptimistic(userId, expectedVersion, patch)  // CAS update
upsertServerGameState(values)                                  // onConflict: 'user_id'
syncPlayerProgressGameState(userId, gameState)                 // backwards-compat
lockServerGameState(userId, reason)
unlockServerGameState(userId)

// Utility
isServerGameStateAvailable()  // bool — for explicit 503 handling
```

#### Validation Results

| Test | Result |
|---|---|
| `tsc --noEmit` (migrated files) | 0 errors |
| `tsc --noEmit` (project-wide) | 0 errors |
| ESLint (migrated files) | 0 new errors |
| Dev server boot | Ready in 7.1s |
| Smoke test 9 routes | All correct status codes (401/400, no 500s) |

#### Cast Inventory (Iteration 1)

- 1 `as unknown as` (offline/route.ts:408) — at trusted boundary, runtime-validated data
- 9 `as never` (5 in state/route.ts, 2 in trade/route.ts, 1 in offline/route.ts, 1 in action/route.ts) — standard `Json` workaround for Supabase-generated column types
- 0 unsafe casts inside `src/lib/db/serverGameState.ts`

---

### Iteration 2 — `admins` + `admin_actions` 🟡 CODE COMPLETE, VALIDATION PENDING

**Date:** 2026-06-20
**Scope:** Centralize admin user management (`admin_users` table) and the `logAdminAction` insert (`admin_actions` table).
**Routes migrated:** 5
**Status:** Code complete, awaiting full validation suite

#### Files Created
- `src/lib/db/admins.ts` (~280 lines, 9 exported functions)
- `src/lib/db/adminActions.ts` (~110 lines, 2 exported functions)

#### Files Modified
- `src/lib/auth/admin.ts` — replaced direct `.from('admin_users')` with `getAdminUserIds()` (cache preserved exactly)
- `src/lib/auth/admin-helpers.ts` — replaced `logAdminAction` body with re-export from db module
- `src/app/api/admins/route.ts` — list/count/insert
- `src/app/api/admins/[id]/route.ts` — read/delete
- `src/app/api/admin/admins/route.ts` — list/count/insert
- `src/app/api/admin/admins/[id]/route.ts` — read/delete
- `src/app/api/admin/admins/[id]/role/route.ts` — update role

#### New API Surface

```typescript
// admins.ts
isAdminUserDb(userId)            // bool (cache-aware, calls auth/admin.ts internally)
getAdminRole(userId)             // string | null — 'viewer' | 'admin' | 'super_admin'
listAdmins()                     // AdminUserRow[] — for admin panel
countAdmins()                    // number — for stats endpoints
getAdminById(userId)             // AdminUserRow | null
getAdminByEmail(email)           // AdminUserRow | null
addAdmin(userId, email, role, addedBy?)  // boolean — idempotent upsert
removeAdmin(userId)              // boolean
setAdminRole(userId, newRole)    // boolean

// adminActions.ts
logAdminAction({ adminId, actionType, targetUserId?, details? })  // void — fire-and-forget
listAdminActions(filters)         // AdminActionRow[] — for /api/admin/admin-actions
```

#### Critical Preservation: 60s Admin Cache

The existing `auth/admin.ts` has a 60-second in-memory cache of admin user IDs (`CACHE_TTL_MS = 60_000`) that is critical for performance and to avoid hammering Supabase on every API request.

**Decision:** Keep the cache in `auth/admin.ts` (where it is today), have `db/admins.ts` expose a pure DB query function `getAdminUserIdsFromDb()`, and have `auth/admin.ts` orchestrate the cache wrapping. This preserves the cache semantics exactly while making the actual DB query live in `db/admins.ts`.

**Result:** `auth/admin.ts` still exposes `isAdminUserDb(userId)` and `verifyAdmin()` with identical behavior. The internal implementation now calls `db/admins.ts.getAdminUserIdsFromDb()` instead of building its own query.

---

## Remaining Iterations

| # | Iteration | Routes | New Module | Est. Effort |
|---|---|---|---|---|
| 3 | `trades` | 2 | `src/lib/db/trades.ts` | ~1 hour |
| 4 | `market` | 4 | `src/lib/db/market.ts` | ~2 hours |
| 5 | `leaderboard` | 2 | `src/lib/db/leaderboard.ts` | ~1 hour |
| 6 | `support_tickets` | 3 | `src/lib/db/supportTickets.ts` | ~1 hour |
| 7 | `cheat_investigations` | 2 | `src/lib/db/cheatInvestigations.ts` | ~1 hour |
| 8 | remaining admin/player | ~20 | `src/lib/db/players.ts`, others | ~6 hours |
| 9 | auth/config/utility | ~10 | `src/lib/db/profiles.ts`, others | ~3 hours |
| 10 | engine/lib helpers | 8 | (refactor existing `auth/*` modules) | ~3 hours |

**Estimated remaining effort:** ~17 hours.

---

## Current State of the Codebase

### What Has Been Migrated

- ✅ All `.from('server_game_state')` calls in 8 routes (14 query sites)
- ✅ `.from('player_progress')` fallback read in `/api/game/offline` GET
- ✅ All `.from('admin_users')` calls in 5 admin management routes (9 query sites)
- ✅ `logAdminAction` insert in `src/lib/auth/admin-helpers.ts`

### What Has NOT Been Migrated (Future Iterations)

The following direct `.from('table_name')` calls remain and are tracked in the TODO checklist:

| Table | Routes/Locations | Iteration |
|---|---|---|
| `trade_history` | `/api/game/trade` (insert), `/api/game/trades` (read) | Iter 3 |
| `server_market_state` | `/api/game/trade`, `/api/market/state`, `/api/market/tick` | Iter 4 |
| `game_config_market` | `/api/game/trade`, `/api/game/offline`, `/api/admin/market/resources/*` | Iter 4 |
| `game_config_buildings` | `/api/game/action`, `/api/game/offline`, `/api/game/definitions` | Iter 4 |
| `game_config_production_recipes` | same as above | Iter 4 |
| `game_config_production_chains` | same as above | Iter 4 |
| `game_config_research` | same as above | Iter 4 |
| `game_config_workers` | `/api/game/offline` | Iter 4 |
| `game_config_weather` | `/api/game/offline` | Iter 4 |
| `leaderboard` | `/api/leaderboard`, `/api/leaderboard/submit` | Iter 5 |
| `support_tickets` | `/api/support/tickets/*`, `/api/admin/support/tickets/*` | Iter 6 |
| `support_messages` | `/api/support/tickets/[id]/messages/*` | Iter 6 |
| `cheat_investigations` | `/api/admin/investigations/*` | Iter 7 |
| `players` | `/api/admin/players/*`, `/api/player`, `/api/admin/stats` | Iter 8 |
| `player_progress` | `/api/admin/players/*`, `/api/player`, `/api/auth/migrate-guest` | Iter 8 |
| `profiles` | `/api/auth/*`, `/api/auth/migrate-guest`, `/api/auth/link-identity` | Iter 9 |
| `pending_link_operations`, `merge_receipts`, `merge_audit_log` | `/api/auth/migrate-guest`, `/api/auth/link-identity`, `/api/auth/confirm-link` | Iter 9 |
| `app_config`, `waitlist_entries` | `/api/waitlist`, `/api/config/[table]` | Iter 9 |

### Existing Technical Debt Remaining

1. **No ESLint rule to enforce `@/lib/db` imports** — currently no rule prevents new code from importing `@/lib/supabase/server`. Deferred to Phase 5 per user instruction.
2. **3 pre-existing `as unknown as Record<string, unknown>[]` casts** in `src/app/api/cron/validate-ticks/route.ts` lines 80, 149, 187 — out of scope, will be addressed when game_config_* tables are centralized in Iteration 4.
3. **`as never` cast workaround for `Json` columns** — appears 9 times in Iteration 1. The canonical fix is a `toJson/fromJson` validator layer, which is a separate refactor touching `src/lib/game/types.ts` and the entire game-engine boundary.
4. **`src/lib/auth/admin-helpers.ts` is now mostly re-exports** — could be deleted in Phase 5 after confirming all callers migrated (most already use `db/adminActions.ts` directly).

### Known Pre-existing Issues (Out of Scope)

These were discovered during the audit but are NOT Iteration 1 or 2 work. Document them but do NOT fix unless explicitly authorized.

1. **`src/lib/auth/permissions.ts` queries `admin_permissions` table** that doesn't exist in the generated types (only 31 tables; `admin_permissions` not among them). The table was likely renamed or never created. Iteration 2 chose NOT to migrate this since the schema isn't in the generated types.
2. **`now_iso` RPC in `/api/game/state` POST** still uses `createServiceRoleClient()` directly. Too narrow to abstract right now. Will revisit when more RPC callers exist.
3. **Tests directory has hardcoded Supabase anon key** (per `BUGS.md` BUG-011) — pre-existing security issue, unrelated to centralization.

---

## Important Rules

> These rules MUST be followed by anyone continuing this project. Violations defeat the purpose of the migration.

### Follow TODO Checklist Sequentially

The TODO file at `planning/DB_CENTRALIZATION_TODO_2026_06_20.md` is the single source of truth for what's done and what's next. **Do not skip ahead**, even if a route "looks easy" — later iterations may depend on conventions established earlier.

### One Iteration at a Time

Each iteration is a self-contained unit of work with its own validation. Do not bundle multiple iterations into one commit.

### Validate After Every Iteration

After every iteration, the validation process (see below) MUST pass with zero new errors before proceeding to the next iteration.

### Preserve Existing Functionality

Every iteration must preserve:
- ✅ Auth gates (401 responses, ownership checks)
- ✅ Authorization (admin RBAC, role checks, `verifyAdmin()` + `canWrite()`)
- ✅ Rate limiting (`checkRateLimit`, `RATE_LIMITS`)
- ✅ Optimistic locking (state_version conflict detection)
- ✅ Account lock checks
- ✅ Audit logging (`logActionAsync`, `logAdminAction`)
- ✅ 503 responses for DB unavailability
- ✅ 400/422 responses for bad input
- ✅ Existing error codes (`ACCOUNT_LOCKED`, `STATE_VERSION_CONFLICT`, etc.)

### Do Not Perform Bulk Migrations

Resist the temptation to migrate everything in one PR. Each iteration is ~1-3 hours of focused work. Smaller changes are easier to review, test, and revert if needed.

### Reuse Existing Implementations

Before writing a new query, **search the codebase** for an existing one. The centralized modules are the canonical place; old direct queries should be replaced, not duplicated.

### Do Not Create Duplicate Logic

If two routes do the same query, extract it once into the db module. Don't create two slightly-different helper functions.

### Do Not Modify `src/lib/supabase/server.ts` or `src/lib/supabase/client.ts`

These are the real Supabase factories. The entire point of the centralization is to make them internal. Do not change their behavior, just their consumers.

### Do Not Modify `src/lib/db/types.ts`

This is the generated Supabase types file. Regenerate with `npx supabase gen types typescript --project-id wkkzqtseqwcyyyezroqq` if needed. Never hand-edit.

---

## Known Risks and Watch Items

### Areas Requiring Extra Caution

| Area | Risk | Mitigation |
|---|---|---|
| **Auth** | Subtle differences in session handling | Always use `verifyAuthAndOwnership` / `verifyAuth` from `auth/verifyAuth.ts`; never inline `supabase.auth.getUser()` |
| **Authorization** | Missing `verifyAdmin()` or `canWrite()` allows privilege escalation | Audit every admin route; the centralization must NOT remove these checks |
| **Caching** | `auth/admin.ts` has a 60s cache | Preserve exactly — wrap, do not remove. The cache is at `src/lib/auth/admin.ts:8-12` |
| **Optimistic locking** | State version conflict detection (409) is critical for trade | `saveServerGameStateOptimistic` MUST return null on version mismatch; do not change to throw |
| **State version conflict handling** | `/api/game/state` POST has complex version-conflict logic | Preserve the full payload in the 409 response — clients use it to merge |
| **Supabase generated type limitations** | All JSON-shaped columns are typed as `Json` union | Use the `as never` pattern; do NOT try to "fix" the generated types |
| **Json ↔ GameState type boundaries** | Cast between DB `Json` and app `GameState` is unsafe at runtime | The boundary IS safe in practice because `validateGameState` runs at write time. Document this assumption in any new module that does the cast. |

### Pattern Reference: How to Do a Write Cast Safely

```typescript
// ✅ SAFE PATTERN (established in Iteration 1)
const updated = await saveServerGameStateOptimistic(
  userId,
  expectedVersion,
  {
    full_state: result.newState as never,  // GameState → Json (write boundary)
    resources: newResources as never,      // Record<string, number> → Json (write boundary)
    state_version: nextVersion,
  }
);
```

```typescript
// ✅ SAFE PATTERN: Read cast at trusted boundary
// (server-validated data, scoped to one local variable)
const baseGameState = serverState.full_state as unknown as GameState;
const result = runServerTicks(baseGameState, elapsedTicks, config);
```

```typescript
// ❌ NEVER DO — would bypass type safety
const state = (serverState.full_state as any).resources;  // no type info
```

### Iteration-Specific Watch Items

**Iteration 2 (admins):**
- DO NOT change the public API of `auth/admin.ts` — callers depend on `isAdminUserDb`, `verifyAdmin`, `isAdminUserId`
- DO NOT remove the 60s cache — it's at `auth/admin.ts:8-12`, with `adminCache` Set and `cacheLoadedAt` number
- The migration of `logAdminAction` is a re-export only — its signature and behavior are unchanged
- Two consumers of `logAdminAction` exist: `auth/admin-helpers.ts` (re-exports) and `auth/admin-helpers.ts` is the entry point for callers. After Iter 2, callers can use either `auth/admin-helpers.ts.logAdminAction` or `db/adminActions.ts.logAdminAction` directly.

---

## Validation Process

After every iteration, run this checklist. **All items must pass before marking the iteration complete.**

### 1. Lint

```bash
npm run lint
# Filter to migrated files only to see new errors:
npx eslint <list of migrated files>
```

Acceptable: 0 new errors in migrated files. Pre-existing errors (e.g., `.history/` backup files) are not blockers.

### 2. TypeScript

```bash
npx tsc --noEmit
```

Acceptable: 0 errors project-wide.

### 3. Build

```bash
npm run build
```

Acceptable: build succeeds. Warnings are tolerable; errors are blockers.

### 4. Dev Server Smoke Test

```bash
npm run dev
# (in another terminal)
Invoke-WebRequest http://localhost:3000/api/<migrated-route> -UseBasicParsing
```

For each migrated route, verify:
- Status code matches expected (401 unauth, 400 bad input, 503 DB unavailable)
- No 500s
- No runtime errors in dev server log

### 5. Supabase Connectivity

Verify that:
- `process.env.NEXT_PUBLIC_SUPABASE_URL` is set
- `process.env.SUPABASE_SERVICE_ROLE_KEY` is set
- The migration didn't introduce a new query that fails against the real DB

To test without auth: curl each route and confirm it returns 401 (auth gate) rather than 500 (DB error). A 500 here would mean the query itself is broken.

### 6. Behavior Preservation

For each migrated route, verify:
- ✅ Returns same status codes for same inputs
- ✅ Returns same response shape
- ✅ Same auth gates fire
- ✅ Same rate limits apply
- ✅ Same optimistic locking behavior
- ✅ Same audit logging

If ANY of these change, the migration has regressed. Revert and investigate.

### 7. No New Runtime Errors

Watch dev server log for:
- TypeError (any)
- ReferenceError (any)
- Unhandled promise rejection
- "Cannot read property of undefined"

These are blockers.

### 8. No Existing Functionality Broken

Spot-check at least one route from each of these areas:
- Auth flow (login, register, link-identity)
- Game flow (load state, save state, action, trade)
- Admin flow (verify admin works, list admins, role change)
- Market flow (prices load, trade executes)

---

## Next Iteration

### Iteration 2 — `admins` + `admin_actions` (IN PROGRESS)

**Scope:** Already implemented. Awaiting full validation suite.

**Routes/modules affected:**
- NEW: `src/lib/db/admins.ts`
- NEW: `src/lib/db/adminActions.ts`
- EDITED: `src/lib/auth/admin.ts` (cache preserved)
- EDITED: `src/lib/auth/admin-helpers.ts` (re-exports)
- EDITED: 5 admin management routes (list, read, update, delete)

**Expected risks:**
- ⚠️ Cache invalidation timing — must preserve 60s TTL exactly
- ⚠️ RLS policy assumptions — `admin_users` table has special RLS that may differ from other tables
- ⚠️ The `isAdminUserDb` function is called from `verifyAdmin()` which is called on every admin route — perf regression here would impact all admin endpoints

**Validation requirements:**
- Run `npm run lint` — expect 0 new errors
- Run `npm run build` — expect success
- Start dev server — expect boot in <10s
- Smoke test 5 admin management routes — all should return correct status codes
- Spot-check the 60s cache: log in as admin, hit an admin route twice within 60s, verify only 1 DB query (check dev log)
- Manual test if possible: log in as admin, list other admins, change a role, delete an admin, verify each works end-to-end

---

## Next Iteration After That

### Iteration 3 — `trades` (PLANNED)

**Scope:** Centralize queries against `trade_history` table.

**Routes affected:**
- `/api/game/trade` — `insert(trade_history)` after successful trade
- `/api/game/trades` — read trade history

**New module:** `src/lib/db/trades.ts`

**Expected functions:**
- `recordTrade(entry)` — insert trade history row
- `getTradeHistory(userId, limit)` — paginated read for user
- `getRecentTrades(limit)` — admin/analytics view

**Expected risks:**
- The `trade_history` insert is part of the critical-path trade flow — a regression here would corrupt player data
- `server_validated: true` flag must always be set in trade_history inserts
- The `game_tick` field in trade_history comes from the server state, not the client

**Estimated effort:** ~1 hour.

---

## Out-of-Scope Issues Documented

These were discovered during the audit and Iteration 1/2 but are NOT centralization work:

1. **`src/lib/auth/permissions.ts` references `admin_permissions` table not in generated types** — table may have been renamed. Pre-existing. Not Iteration 1/2 scope.
2. **`now_iso` RPC in `/api/game/state` POST** uses direct supabase client — too narrow to abstract right now. Defer to a future "RPC centralization" iteration.
3. **`src/lib/game/types.ts` (~870 lines)** has hand-written interfaces that overlap with generated types. Migration to use generated types is a separate refactor — touches the game engine, not db access. Out of scope for this project.
4. **3 pre-existing `as unknown as Record<string, unknown>[]` casts** in `src/app/api/cron/validate-ticks/route.ts` — they touch `game_config_*` tables which are Iteration 4 scope.
5. **47 pre-existing lint errors** in `.history/` backup files, `cloudflare-worker.js`, `pagination.tsx` — unrelated to db access centralization.

---

## Decisions and Assumptions

### Decision 1: Keep `src/lib/supabase/server.ts` unchanged

**Rationale:** It IS the real Supabase factory. Centralizing consumers (not the factory itself) is the goal. If we replaced the factory, we'd need to wrap every Supabase API call — too invasive.

**Alternative considered:** Re-export from `@/lib/db/admin.ts` and `@/lib/db/user.ts`. Rejected because the factories already exist as separate files; just need consumers to import from the canonical path.

### Decision 2: Use `Pick<>` types in module return values

**Rationale:** Every loader returns a narrow `Pick<ServerGameStateRow, ...>` instead of the full row. This:
- Documents intent (which columns the caller actually needs)
- Allows schema changes to non-selected columns to not break callers
- Reduces payload size for documentation purposes

**Alternative considered:** Always return full `ServerGameStateRow`. Rejected because it defeats the purpose of strong typing — callers don't know what they need.

### Decision 3: Return `null` for not-found, throw for unexpected

**Rationale:** Matches the pre-existing pattern across the codebase (e.g., `verifyAuth` returns null on failure). Allows callers to handle "not found" with a clean 404, and "unexpected" errors with a 500.

**Alternative considered:** Throw for everything. Rejected because it forces every caller to wrap in try-catch.

### Decision 4: Cache stays in `auth/admin.ts`, not in `db/admins.ts`

**Rationale:** Caching is a policy concern, not a data-access concern. Keeping it in `auth/admin.ts` matches the separation: db is data, auth is policy.

**Alternative considered:** Move the cache into `db/admins.ts`. Rejected because it would couple the data layer to a specific caching strategy (60s TTL Set). Future iterations might want different caching per call site.

### Decision 5: Preserve `logAdminAction` signature exactly

**Rationale:** Multiple callers depend on the fire-and-forget void return, the same param shape, and the same console.error on failure. Changing the signature would be a breaking change to internal callers.

**Implementation:** The new module exports `logAdminAction` with the same signature. `auth/admin-helpers.ts` now just re-exports it for backwards compatibility with any remaining callers.

### Assumption 1: Generated types are the single source of truth

**Rationale:** The Supabase-generated types in `src/lib/db/types.ts` are derived directly from the production DB schema. They are always up-to-date if regenerated before each migration iteration.

**Risk:** If the DB schema is changed in Supabase without regenerating types, the types drift. Mitigation: regenerate types with `npx supabase gen types typescript --project-id wkkzqtseqwcyyyezroqq` at the start of each iteration.

### Assumption 2: `validateGameState` runs at write time

**Rationale:** All writes to `server_game_state.full_state` go through `validateGameState` first. Therefore, the data is structurally valid when read back.

**Risk:** If `validateGameState` is bypassed (e.g., direct DB write via Supabase SQL editor), the read cast (`as unknown as GameState`) becomes unsafe. Mitigation: `validateGameState` is enforced at the application layer; direct SQL writes are admin-only and rare.

---

## Lessons Learned

1. **The cast `as never` is the standard Supabase workaround for `Json` columns** — don't try to "fix" it, just document it.
2. **Use `as unknown as ConcreteType` instead of `as ConcreteType`** when going from a wide type like `Json` to a narrow type like `GameState`. The double cast is canonical, the single cast only works by accident due to type inference.
3. **Optimistic locking is critical** — every write to `server_game_state` that depends on the current state MUST use `saveServerGameStateOptimistic` with a `state_version` check, not a blind update.
4. **Cache preservation matters** — the 60s admin cache is performance-critical. When migrating cache-wrapped functions, keep the cache in the policy layer (auth/) and have the data layer (db/) be cache-agnostic.
5. **Test the edge cases** — the `isServerGameStateAvailable()` helper exists because the difference between "DB unavailable" (503) and "row not found" (200/empty) matters. Don't collapse them.
6. **Regenerate types before starting** — the 2,225-line `src/lib/db/types.ts` file is the foundation. If it's stale, the migration produces casts that don't match reality.

---

## Reference

| Document | Purpose |
|---|---|
| `planning/DB_ACCESS_CENTRALIZATION_AUDIT_2026_06_20.md` | Full audit (current state, target state, affected files, risks) |
| `planning/DB_CENTRALIZATION_TODO_2026_06_20.md` | Iteration-by-iteration TODO checklist |
| `planning/HANDOVER_DB_CENTRALIZATION_2026_06_20.md` | This document |
| `src/lib/db/serverGameState.ts` | Iteration 1 module |
| `src/lib/db/admins.ts` | Iteration 2 module |
| `src/lib/db/adminActions.ts` | Iteration 2 module |
| `src/lib/db/types.ts` | Generated Supabase types (foundation) |

---

## Summary for the Next Engineer

> If you read nothing else, read this.

You are continuing a phased migration to centralize database access. The project replaces 71 routes importing `@/lib/supabase/server` directly with a typed repository layer at `@/lib/db/*`. **Iteration 1 (`server_game_state`) is complete. Iteration 2 (`admins` + `admin_actions`) is code-complete and awaiting validation.**

The pattern is: create a new file in `src/lib/db/` per table, export typed query functions, update routes to import from `@/lib/db/*` instead of `@/lib/supabase/server`, preserve all existing behavior exactly. **Do not break auth, authorization, caching, optimistic locking, or audit logging.** Validate after every iteration with `tsc`, lint, build, and dev-server smoke tests. Update the TODO checklist as you go. The migration is roughly 17 hours of focused work across 10 iterations.

**Start by running the validation suite on Iteration 2.** If it passes, mark Iteration 2 complete in the TODO and proceed to Iteration 3 (`trades`). If it fails, fix blockers and re-validate.

Welcome to the team. May your `tsc` always be green.