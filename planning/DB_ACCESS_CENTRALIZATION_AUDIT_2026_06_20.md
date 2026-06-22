# Database Access Centralization — Architecture Audit

**Date:** 2026-06-20
**Status:** Audit complete, no code changes made yet
**Scope:** `src/lib/db/**`, `src/lib/supabase/**`, DB types, API route imports, query-related files
**Auditor:** AI Agent (caveman full mode)

---

## 1. Current State

### 1.1 Files involved (the entire "DB access" surface)

| File | Lines | Purpose | Used by |
|---|---|---|---|
| `src/lib/supabase/server.ts` | 80 | Real Supabase client factories (server) | **71 places** |
| `src/lib/supabase/client.ts` | 30 | Real Supabase client factory (browser) | 5 places |
| `src/lib/db/types.ts` | 2,225 | Generated Supabase types | **0 places** (importable, unused) |
| `src/lib/db/index.ts` | 15 | Barrel re-export | **0 places** |
| `src/lib/db/admin.ts` | 20 | Re-exports `createServiceRoleClient` from server | self + barrel |
| `src/lib/db/user.ts` | 17 | Re-exports `createClient` from server | self + barrel |
| `src/lib/auth/admin.ts` | 220 | Admin check + cache | admin routes |
| `src/lib/auth/admin-helpers.ts` | 90 | `getAdminRole`, `canWrite`, `logAdminAction` | admin routes |
| `src/lib/auth/permissions.ts` | 75 | `getUserPermissions`, `hasPermission`, `grantPermission` | admin routes |
| `src/lib/auth/verifyAuth.ts` | — | Session verification helper | API routes |
| `src/lib/auth/rateLimiter.ts` | — | Supabase-backed rate limit | API routes |
| `src/lib/auth/gameStateValidator.ts` | 448 | Server-side anti-cheat + audit | `/api/game/*` |
| `src/lib/auth/guestCheck.ts` | — | Guest user helpers | auth routes |
| `src/lib/auth/guestMigrationValidator.ts` | — | Guest merge validator | auth routes |
| `src/lib/auth/fingerprint.ts` | — | Device fingerprinting | auth routes |
| `src/lib/auth/csrf.ts` | — | CSRF tokens | auth routes |
| `src/lib/capacity.ts` | — | Capacity check via RPC | routes + UI |
| `src/lib/game/types.ts` | 870 | **Hand-written** DB row types | game engine |
| `src/lib/game/engine/types.ts` | — | Hand-written engine types | engine |
| `src/lib/hooks/cloudSync/types.ts` | — | CloudSync types | hook |

### 1.2 API routes that import `@/lib/supabase/server` directly

**71 routes total**, broken down by area:

| Area | Count | Routes |
|---|---|---|
| **Auth (8)** | 8 | `claim-guest`, `link-identity`, `update-profile`, `initialize-guest`, `confirm-link`, `migrate-guest`, `recover-by-device`, `request-ip-log-helper` |
| **Game (8)** | 8 | `action`, `compute`, `definitions`, `heartbeat`, `market-history`, `offline`, `state`, `trade`, `trades` |
| **Market (4)** | 4 | `action`, `aggregate-supply`, `state`, `tick` |
| **Leaderboard (2)** | 2 | `submit`, `list` |
| **Admin (15)** | 15 | `admin-actions`, `actions`, `admins/*`, `audit/export`, `economy`, `investigations/*`, `jobs`, `market/*`, `monitoring`, `players/*`, `stats`, `support/tickets/*`, `system-status` |
| **Config (2)** | 2 | `[table]`, `[table]/[id]` |
| **Admins (2)** | 2 | `admins`, `admins/[id]` |
| **Support (3)** | 3 | `tickets`, `tickets/[id]`, `tickets/[id]/messages` |
| **Player (1)** | 1 | `player` |
| **Waitlist (1)** | 1 | `waitlist` |
| **Tables (1)** | 1 | `tables` |
| **Health (1)** | 1 | `health` |
| **Cron (1)** | 1 | `validate-ticks` |
| **Admin auth (1)** | 1 | `admin/auth/callback` |
| **Lib (8)** | 8 | `rateLimiter`, `gameStateValidator`, `permissions`, `verifyAuth`, `admin`, `admin-helpers`, `guestCheck`, `capacity` |

### 1.3 Existing abstraction modules

There is already a **partial** db abstraction layer scattered across `src/lib/auth/`:

| Module | What it centralizes | What it doesn't |
|---|---|---|
| `auth/admin.ts` | `isAdminUserDb`, `verifyAdmin`, 1-min cache | Direct `.from('admin_users')` calls still in helpers |
| `auth/admin-helpers.ts` | `getAdminRole`, `logAdminAction` | Direct `.from('admin_users')` and `.from('admin_actions')` |
| `auth/permissions.ts` | `getUserPermissions`, `grantPermission`, `revokePermission` | Repeated 4× `createServiceRoleClient() + if (!supabase) return false` pattern |
| `capacity.ts` | `getCapacityStatus` | Direct `.rpc('get_capacity_status')` call |
| `rateLimiter.ts` | `checkRateLimit` | Direct `.from('rate_limits')` and `.rpc('check_rate_limit')` |
| `verifyAuth.ts` | Session verification | Uses `createClient()` from server, not from `lib/db` |
| `gameStateValidator.ts` | Anti-cheat + audit logging | Massive file, mixed concerns |

### 1.4 Duplicated patterns found

**Pattern A — `createServiceRoleClient() + null check`** (78 call sites, 71 files)
```typescript
const supabase = createServiceRoleClient();
if (!supabase) {
  return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
}
```
Variations: returns `NextResponse`, throws, returns `false`, returns `[]`, returns `FALLBACK`.

**Pattern B — `verifyAuthAndOwnership` + rate limit + lock check + supabase init**
Every `/api/game/*` route opens with the same 30 lines of preamble. See [state/route.ts:1-80](src/app/api/game/state/route.ts).

**Pattern C — Direct `from('admin_users')` queries**
Used in 5+ files:
- `src/lib/auth/admin.ts:50` — `select("user_id")`
- `src/lib/auth/admin-helpers.ts:27` — `select("role").eq("user_id", id)`
- `src/app/api/admins/route.ts:27, 139, 160` — list, count, role updates
- `src/app/api/admins/[id]/route.ts:43, 78` — read + delete

**Pattern D — Direct `from('server_game_state')` queries**
Used in 6 routes:
- `src/app/api/game/state/route.ts:57, 169, 287`
- `src/app/api/game/trade/route.ts:104, 230`
- `src/app/api/game/offline/route.ts:248, 359`
- `src/app/api/game/action/route.ts:442, 553`
- `src/app/api/cron/validate-ticks/route.ts:238`
- `src/app/api/auth/claim-guest/route.ts:135`
- `src/app/api/auth/link-identity/route.ts:123, 129`

**Pattern E — Direct `from('game_config_*')` queries**
Used in `/api/game/offline/route.ts:83-89` — 7 parallel selects for config tables. Same pattern exists in `/api/game/definitions/route.ts:231`.

**Pattern F — Direct `from('profiles')` queries**
Used in `auth/claim-guest`, `auth/link-identity`.

**Pattern G — Direct `from('trade_history')` inserts**
Used in `game/trade/route.ts:249` and `trades/route.ts:38`.

**Pattern H — Direct `from('admin_actions')` inserts**
`auth/admin-helpers.ts:72` — `logAdminAction` does the insert directly.

### 1.5 Duplicated DB types

`src/lib/game/types.ts` (~870 lines) defines hand-written interfaces that overlap with `Database['public']['Tables'][...]`:
- `TradeHistoryEntry` (if it exists) ↔ `trade_history` Row
- `PlayerState` ↔ `server_game_state` Row
- `PlayerProgress` ↔ `player_progress` Row
- `BuildingDefinition` ↔ `game_config_buildings` Row
- `ResourceDefinition` ↔ `game_config_resources` Row
- `ResearchDefinition` ↔ `game_config_research` Row
- `MarketConfig` ↔ `game_config_market` Row
- `LeaderboardEntry` ↔ `leaderboard` Row
- `Profile` ↔ `profiles` Row
- `MarketPrice` ↔ partial match (no DB equivalent, computed view)

Risk: **drift** — hand-written types can disagree with actual DB schema, causing TypeScript to lie.

### 1.6 Unused / partially implemented db abstraction layers

| Layer | State | Problem |
|---|---|---|
| `src/lib/db/admin.ts` | **Exists** but **zero** external imports | Pure re-export wrapper, adds no value |
| `src/lib/db/user.ts` | **Exists** but **zero** external imports | Pure re-export wrapper, adds no value |
| `src/lib/db/index.ts` | **Exists** but **zero** external imports | Barrel pointing at unused wrappers |
| `src/lib/db/types.ts` | **Exists**, real content (2,225 lines) | **Zero** imports — strongest signal of dead code |

---

## 2. Target State

### 2.1 File layout

```
src/lib/db/
├── types.ts                      # Generated Supabase types (done, 2,225 lines)
├── index.ts                      # Barrel re-exports (done)
├── admin.ts                      # Re-exports createServiceRoleClient (done, keep as-is)
├── user.ts                       # Re-exports createClient (done, keep as-is)
├── players.ts                    # NEW: getPlayer, getPlayerState, lockPlayer, etc.
├── playerProgress.ts             # NEW: loadProgress, saveProgress, getPlayerActions
├── profiles.ts                   # NEW: getProfile, updateProfile
├── trades.ts                     # NEW: recordTrade, getTradeHistory, getRecentTrades
├── market.ts                     # NEW: getMarketState, getMarketConfig, recordMarketTick
├── leaderboard.ts                # NEW: submitScore, getLeaderboard, getUserRank
├── admins.ts                     # NEW: listAdmins, getAdminRole, getAdminUserIds
├── adminActions.ts               # NEW: logAdminAction, listAdminActions
├── cheatInvestigations.ts        # NEW: listInvestigations, resolveInvestigation
├── supportTickets.ts             # NEW: listTickets, getTicket, createMessage
├── rateLimit.ts                  # NEW: re-export from rateLimiter (thin wrapper)
├── auth.ts                       # NEW: re-export from verifyAuth (thin wrapper)
└── serverGameState.ts            # NEW: loadState, saveState, lockState
```

### 2.2 Migration pattern (the rule)

**Before** (current, 71 routes):
```typescript
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(req: Request) {
  const supabase = createServiceRoleClient();
  if (!supabase) return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  const { data } = await supabase.from('players').select().eq('id', userId).single();
  // ...
}
```

**After** (target):
```typescript
import { getPlayer } from '@/lib/db/players';

export async function GET(req: Request) {
  const player = await getPlayer(userId);
  if (!player) return NextResponse.json({ error: 'not found' }, { status: 404 });
  // ...
}
```

### 2.3 Module API contracts (what each new file should export)

```typescript
// src/lib/db/serverGameState.ts
export async function loadServerGameState(userId: string): Promise<ServerGameStateRow | null>
export async function saveServerGameState(userId: string, patch: Partial<ServerGameStateRow>): Promise<void>
export async function lockServerGameState(userId: string, reason: string): Promise<void>
export async function unlockServerGameState(userId: string): Promise<void>

// src/lib/db/trades.ts
export async function recordTrade(entry: TradeHistoryInsert): Promise<void>
export async function getTradeHistory(userId: string, limit: number): Promise<TradeHistoryRow[]>
export async function getRecentTrades(limit: number): Promise<TradeHistoryRow[]>

// src/lib/db/admins.ts
export async function listAdmins(): Promise<AdminUserRow[]>
export async function getAdminRole(userId: string): Promise<string | null>
export async function setAdminRole(userId: string, role: string): Promise<void>
export async function removeAdmin(userId: string): Promise<void>
export async function getAdminUserIds(): Promise<Set<string>>  // wraps existing cache in auth/admin.ts

// src/lib/db/adminActions.ts
export async function logAdminAction(params: {...}): Promise<void>  // moves from auth-helpers.ts
export async function listAdminActions(filters: {...}): Promise<AdminActionRow[]>

// src/lib/db/market.ts
export async function getMarketConfig(): Promise<MarketConfigRow[]>
export async function getMarketState(): Promise<ServerMarketStateRow>
export async function recordMarketTick(...): Promise<void>

// src/lib/db/players.ts
export async function getPlayer(id: string): Promise<ProfileRow | null>
export async function getPlayerState(id: string): Promise<ServerGameStateRow | null>
export async function lockPlayer(id: string, reason: string): Promise<void>

// src/lib/db/leaderboard.ts
export async function submitScore(entry: LeaderboardInsert): Promise<void>
export async function getLeaderboard(limit: number): Promise<LeaderboardRow[]>
export async function getUserRank(userId: string): Promise<RankInfo | null>

// src/lib/db/supportTickets.ts
export async function listTickets(filters: {...}): Promise<SupportTicketRow[]>
export async function getTicket(id: string): Promise<SupportTicketRow | null>
export async function addTicketMessage(...): Promise<void>
```

### 2.4 Auth-side modules to keep as-is

These are NOT data-access modules — they are auth/policy modules. Keep them where they are.

| File | Why keep |
|---|---|
| `src/lib/auth/verifyAuth.ts` | Auth flow, not data access |
| `src/lib/auth/csrf.ts` | Crypto, not DB |
| `src/lib/auth/fingerprint.ts` | Crypto, not DB |
| `src/lib/auth/rateLimiter.ts` | Auth policy; can have thin re-export in `db/rateLimit.ts` |
| `src/lib/auth/gameStateValidator.ts` | Validation logic; can call db functions |
| `src/lib/auth/guestCheck.ts` | Auth check |
| `src/lib/auth/guestMigrationValidator.ts` | Auth policy |
| `src/lib/auth/permissions.ts` | Auth policy; can have thin re-export in `db/admins.ts` |

---

## 3. Affected Files

### 3.1 New files to create (10)

- `src/lib/db/players.ts`
- `src/lib/db/serverGameState.ts`
- `src/lib/db/trades.ts`
- `src/lib/db/market.ts`
- `src/lib/db/leaderboard.ts`
- `src/lib/db/admins.ts`
- `src/lib/db/adminActions.ts`
- `src/lib/db/cheatInvestigations.ts`
- `src/lib/db/supportTickets.ts`
- `src/lib/db/profiles.ts`

### 3.2 Files to edit (71 API routes + 8 lib files)

| Category | Count | Examples |
|---|---|---|
| API routes (server-side) | 71 | `src/app/api/**/route.ts` |
| Lib files | 8 | `src/lib/auth/admin-helpers.ts`, `permissions.ts`, `rateLimiter.ts`, `gameStateValidator.ts`, `verifyAuth.ts`, `admin.ts`, `guestCheck.ts`, `capacity.ts` |

### 3.3 Files NOT to touch

| File | Reason |
|---|---|
| `src/lib/supabase/server.ts` | Real Supabase factory — single source of truth |
| `src/lib/supabase/client.ts` | Real Supabase factory for browser — single source of truth |
| `src/lib/db/types.ts` | Generated types — never edit manually |
| `src/lib/db/admin.ts` | Re-export wrapper — already correct, will be used as the import path |
| `src/lib/db/user.ts` | Re-export wrapper — already correct |
| `src/lib/db/index.ts` | Barrel — already correct |
| `src/lib/auth/admin.ts` | Auth policy, not data access |
| UI components, pages, tests | Out of scope |

---

## 4. Migration Tasks

### Phase 1 — Audit & Analysis (done)
- [x] Inventory all `createServiceRoleClient()` call sites
- [x] Inventory all `createClient()` call sites
- [x] Inventory existing `src/lib/auth/*` abstraction modules
- [x] Inventory duplicated query patterns
- [x] Inventory duplicated DB types
- [x] Inventory unused abstraction layers
- [x] Create this audit document

### Phase 2 — Architecture Preparation
- [ ] Define the `db` module API surface (one function per query pattern)
- [ ] Decide on naming convention: `getX`, `listX`, `saveX`, `recordX`
- [ ] Decide on error handling: throw vs return `null` vs return `Result<T>`
- [ ] Decide on return types: `Row` only or `Row | null` everywhere
- [ ] Document the chosen pattern in `src/lib/db/README.md` (new file)
- [ ] Add ESLint rule to **ban** future direct imports of `@/lib/supabase/server` in `src/app/api/**` (force `@/lib/db`)

### Phase 3 — Migration (smallest scope first)

**Iteration 1 — `server_game_state` (highest impact, 6 routes)**
- [ ] Create `src/lib/db/serverGameState.ts` with `loadServerGameState`, `saveServerGameState`, `lockServerGameState`, `unlockServerGameState`
- [ ] Migrate `src/app/api/game/state/route.ts` (3 call sites)
- [ ] Migrate `src/app/api/game/trade/route.ts` (2 call sites)
- [ ] Migrate `src/app/api/game/offline/route.ts` (2 call sites)
- [ ] Migrate `src/app/api/game/action/route.ts` (2 call sites)
- [ ] Migrate `src/app/api/cron/validate-ticks/route.ts` (1 call site)
- [ ] Migrate `src/app/api/auth/claim-guest/route.ts` (1 call site)
- [ ] Migrate `src/app/api/auth/link-identity/route.ts` (2 call sites)
- [ ] Run lint + dev server, verify

**Iteration 2 — `admins` + `admin_actions` (auth-cached, 5+ routes)**
- [ ] Create `src/lib/db/admins.ts` with `listAdmins`, `getAdminRole`, `getAdminUserIds`
- [ ] Create `src/lib/db/adminActions.ts` with `logAdminAction`, `listAdminActions`
- [ ] Update `src/lib/auth/admin.ts` cache to call `getAdminUserIds()` from `db/admins.ts`
- [ ] Update `src/lib/auth/admin-helpers.ts` to use `db/admins.ts` and `db/adminActions.ts`
- [ ] Migrate `src/app/api/admins/route.ts` (3 call sites)
- [ ] Migrate `src/app/api/admins/[id]/route.ts` (2 call sites)
- [ ] Migrate `src/app/api/admin/admins/*` (4 routes)
- [ ] Run lint + dev server, verify

**Iteration 3 — `trades` (2 routes)**
- [ ] Create `src/lib/db/trades.ts` with `recordTrade`, `getTradeHistory`, `getRecentTrades`
- [ ] Migrate `src/app/api/game/trade/route.ts` (2 call sites)
- [ ] Migrate `src/app/api/game/trades/route.ts` (1 call site)
- [ ] Run lint + dev server, verify

**Iteration 4 — `market` (3 routes)**
- [ ] Create `src/lib/db/market.ts` with `getMarketState`, `getMarketConfig`, `recordMarketTick`
- [ ] Migrate `src/app/api/market/state/route.ts`
- [ ] Migrate `src/app/api/market/action/route.ts`
- [ ] Migrate `src/app/api/market/tick/route.ts`
- [ ] Migrate `src/app/api/market/aggregate-supply/route.ts`
- [ ] Run lint + dev server, verify

**Iteration 5 — `leaderboard` (2 routes)**
- [ ] Create `src/lib/db/leaderboard.ts` with `submitScore`, `getLeaderboard`, `getUserRank`
- [ ] Migrate `src/app/api/leaderboard/route.ts`
- [ ] Migrate `src/app/api/leaderboard/submit/route.ts`
- [ ] Run lint + dev server, verify

**Iteration 6 — `support_tickets` (3 routes)**
- [ ] Create `src/lib/db/supportTickets.ts` with `listTickets`, `getTicket`, `addTicketMessage`
- [ ] Migrate `src/app/api/support/tickets/route.ts`
- [ ] Migrate `src/app/api/support/tickets/[id]/route.ts`
- [ ] Migrate `src/app/api/support/tickets/[id]/messages/route.ts`
- [ ] Run lint + dev server, verify

**Iteration 7 — `cheat_investigations` (2 routes)**
- [ ] Create `src/lib/db/cheatInvestigations.ts` with `listInvestigations`, `resolveInvestigation`
- [ ] Migrate `src/app/api/admin/investigations/route.ts`
- [ ] Migrate `src/app/api/admin/investigations/[id]/route.ts`
- [ ] Run lint + dev server, verify

**Iteration 8 — remaining admin/utility routes (~20 routes)**
- [ ] Migrate `src/app/api/admin/players/*` (5 routes)
- [ ] Migrate `src/app/api/admin/players/bulk/route.ts`
- [ ] Migrate `src/app/api/admin/stats/route.ts`
- [ ] Migrate `src/app/api/admin/economy/route.ts`
- [ ] Migrate `src/app/api/admin/jobs/route.ts`
- [ ] Migrate `src/app/api/admin/market/*` (2 routes)
- [ ] Migrate `src/app/api/admin/market/resources/*` (2 routes)
- [ ] Migrate `src/app/api/admin/audit/export/route.ts`
- [ ] Migrate `src/app/api/admin/system-status/route.ts`
- [ ] Migrate `src/app/api/admin/monitoring/route.ts`
- [ ] Migrate `src/app/api/admin/actions/route.ts`
- [ ] Migrate `src/app/api/admin/admin-actions/route.ts`
- [ ] Run lint + dev server, verify

**Iteration 9 — remaining auth/config/utility routes (~10 routes)**
- [ ] Migrate `src/app/api/auth/*` (8 routes)
- [ ] Migrate `src/app/api/config/*` (2 routes)
- [ ] Migrate `src/app/api/waitlist/route.ts`
- [ ] Migrate `src/app/api/tables/route.ts`
- [ ] Migrate `src/app/api/health/route.ts`
- [ ] Migrate `src/app/api/admin/auth/callback/route.ts`
- [ ] Run lint + dev server, verify

### Phase 4 — Validation & Testing
- [ ] Run `npm run lint` — zero new errors
- [ ] Run dev server — no startup errors
- [ ] Test each migrated route manually (or via Playwright)
- [ ] Verify all auth gates still work (locked account, rate limit, CSRF)
- [ ] Verify admin RBAC still works (verifyAdmin + canWrite)
- [ ] Verify game state save/load round-trip works end-to-end
- [ ] Run audit on `/api/game/trade` — most critical (server-authoritative, audit-logged)
- [ ] Confirm no `createServiceRoleClient` calls remain in `src/app/api/**` (grep verification)

### Phase 5 — Cleanup & Documentation
- [ ] Update `AGENTS.md` to require `@/lib/db` for new code
- [ ] Update `BUGS.md` if any bugs surfaced during migration
- [ ] Move audit doc to `planning/2026-06-20_audit/` subfolder
- [ ] Add `src/lib/db/README.md` documenting the module API
- [ ] Remove `src/lib/auth/admin-helpers.ts` if its functions all moved to `db/admins.ts`
- [ ] Re-run audit doc verification

---

## 5. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Breaking working routes** | High | Migrate one route group at a time, test after each batch |
| **Behavior drift in `getAdminUserIds` cache** | High | Existing cache in `auth/admin.ts` is 60s TTL — keep the same cache, just move the function |
| **TypeScript strictness** in generated types | Medium | Generated types use `Json` for many fields — same as before, no new friction |
| **Performance regression** | Low | Same queries, same indexes, just wrapped in a function — no overhead |
| **Inconsistent error handling** | Medium | Decide upfront: `null` for not-found, throw for unexpected errors, return `false` for ops |
| **Test coverage** | Low | No tests exist for routes (per AGENTS.md), so refactor is verified by lint + dev server |
| **Merge conflicts** with active branches | Medium | Coordinate with in-flight work; do not migrate files being edited |
| **Hidden coupling** — some routes may have side effects beyond pure query | Medium | Read each route carefully before extracting; preserve all `.select()`, `.eq()`, `.order()` calls |

---

## 6. Dependencies

| Dependency | Why |
|---|---|
| `src/lib/supabase/server.ts` | Source of `createServiceRoleClient` — never modified |
| `src/lib/supabase/client.ts` | Source of `createClient` (browser) — never modified |
| `src/lib/db/types.ts` | Provides `Database` type for row types |
| `src/lib/auth/admin.ts` cache | Must preserve the 60s TTL behavior |
| `src/lib/auth/rateLimiter.ts` | Used by most routes; keep importing directly, OR add thin `db/rateLimit.ts` re-export |
| `src/lib/auth/verifyAuth.ts` | Used by most routes; keep importing directly |
| `src/lib/auth/gameStateValidator.ts` | Used by `/api/game/*`; keep importing directly |
| ESLint config | Add `no-restricted-imports` rule to ban direct `@/lib/supabase/server` in `src/app/api/**` |

---

## 7. Prioritized TODO Checklist

See companion file: [DB_CENTRALIZATION_TODO_2026_06_20.md](./DB_CENTRALIZATION_TODO_2026_06_20.md)

---

## 8. Effort estimate

| Phase | Tasks | Estimate |
|---|---|---|
| Phase 1 — Audit | Done | ✅ |
| Phase 2 — Architecture | 6 tasks | ~2 hours |
| Phase 3 — Migration (9 iterations) | 71 routes + 10 new files | ~12-16 hours |
| Phase 4 — Validation | 8 tasks | ~2 hours |
| Phase 5 — Cleanup | 6 tasks | ~1 hour |
| **Total** | | **~17-21 hours of focused work** |

This is roughly a 1-2 week phased migration. Should NOT be done in one big commit.

---

## 9. Iteration 1 Results (2026-06-20)

### Files changed
- **NEW:** `src/lib/db/serverGameState.ts` (320 lines, 16 exported functions)
- **EDITED:** `src/app/api/game/state/route.ts` (3 call sites)
- **EDITED:** `src/app/api/game/trade/route.ts` (2 call sites)
- **EDITED:** `src/app/api/game/offline/route.ts` (3 call sites)
- **EDITED:** `src/app/api/game/action/route.ts` (2 call sites)
- **EDITED:** `src/app/api/cron/validate-ticks/route.ts` (1 call site)
- **EDITED:** `src/app/api/auth/claim-guest/route.ts` (1 call site)
- **EDITED:** `src/app/api/auth/link-identity/route.ts` (2 call sites)

### Validation results
- **TypeScript (`tsc --noEmit`):** 0 errors project-wide
- **ESLint (migrated files only):** 0 new errors
- **Dev server:** Ready in 7.1s on port 3000
- **Smoke tests (9 routes):** All return correct status codes — 401 (unauth) for protected routes, 400 (bad input) for claim-guest, no 500s, no runtime errors

### Risks discovered during iteration

| Risk | Severity | Resolution |
|---|---|---|
| **Generated types stricter than hand-written** — `Json \| null` cast broke `as GameState` in offline/route.ts:407 | Medium | Changed to `as unknown as GameState` (the canonical pattern for unknown→concrete cast) |
| **Behavioral regression — DB unavailable vs not-found** — New helper functions returned `null` for both cases; old code returned 503 for unavailable | High | Added `isServerGameStateAvailable()` helper; callers now check explicitly before calling the data function. Matches previous behavior exactly. |
| **Removed now-unused `supabase` variables** in offline/route.ts | Low | Removed and verified via tsc |
| **Type cast loss on JSON fields** — Insert types use `Json` for many columns | Low | Used `as never` cast on these (matches existing pattern in codebase) |
| **`now_iso` RPC still requires direct supabase client** in state/route.ts:POST | Low | Kept the import — too narrow a use case to abstract right now. Will revisit in a future iteration. |

### Behavior preserved
- ✅ State version conflict detection (state/route.ts:201)
- ✅ Optimistic locking on trade (trade/route.ts)
- ✅ Optimistic locking on offline tick update (offline/route.ts)
- ✅ Admin lock bypass logging
- ✅ Account lock check on all read paths
- ✅ 503 responses for DB unavailability
- ✅ `player_progress` fallback when `server_game_state` is empty (offline GET)
- ✅ 401/400 responses on auth/bad input (unchanged)

### Net impact
- 14 direct `.from('server_game_state')` calls removed from API routes
- 1 `.from('player_progress')` call removed (the fallback read)
- All `server_game_state` queries now go through the centralized module
- 16 typed functions added to `serverGameState.ts`
- Type safety improved: all queries now return strongly-typed narrow shapes via `Pick<>` rather than the full row

### Status
**Iteration 1 complete. Awaiting approval to proceed to Iteration 2 (`admins` + `admin_actions`).**

---

## 10. Iteration 2 Results (2026-06-20)

### Files changed
- **NEW:** `src/lib/db/admins.ts` (~280 lines, 9 exported functions)
- **NEW:** `src/lib/db/adminActions.ts` (~110 lines, 2 exported functions)
- **EDITED:** `src/lib/auth/admin.ts` — replaced internal direct query with `getAdminUserIdsFromDb()` from db module; **cache preserved exactly** (60s TTL Set + `cacheLoadedAt` number)
- **EDITED:** `src/lib/auth/admin-helpers.ts` — `logAdminAction` now re-exports from `db/adminActions.ts`
- **EDITED:** `src/app/api/admins/route.ts` (3 call sites: list, count, insert)
- **EDITED:** `src/app/api/admins/[id]/route.ts` (2 call sites: read, delete)
- **EDITED:** `src/app/api/admin/admins/route.ts` (3 call sites: list, count, insert)
- **EDITED:** `src/app/api/admin/admins/[id]/route.ts` (1 call site: read+delete)
- **EDITED:** `src/app/api/admin/admins/[id]/role/route.ts` (1 call site: update role)

### Validation results (preliminary, full suite pending)
- **TypeScript (`tsc --noEmit`):** 0 errors project-wide AND 0 errors in iteration files
- **ESLint (migrated files only):** 0 new errors
- **`npm run build`:** pending
- **Dev server smoke tests:** pending

### Risks discovered during iteration

| Risk | Severity | Resolution |
|---|---|---|
| **Admin cache invalidation timing** — moving `.from('admin_users')` query could subtly change cache behavior | High | Kept the entire `adminCache` Set + `cacheLoadedAt` number + `clearAdminCache()` in `auth/admin.ts`. Only the query body moved to `db/admins.ts`. |
| **Duplicate `addAdmin` logic in 2 routes** (`/api/admins` POST + `/api/admin/admins` POST) | Medium | Created single `addAdmin()` function in `db/admins.ts` with idempotent upsert behavior. |
| **`logAdminAction` was the entry point for callers** — needed to preserve signature | Low | Created same-named function in `db/adminActions.ts`; `auth/admin-helpers.ts` re-exports it for any callers still using the old path. |
| **`addAdmin` had different fallback logic between routes** — one used `ADMIN_UIDS` env var, one didn't | Low | Centralized to single function; ADMIN_UIDS env-var handling stays in `auth/admin.ts` (caller concern, not data concern) |

### Behavior preserved
- ✅ 60s admin cache TTL (unchanged)
- ✅ `isAdminUserId`, `isAdminUserDb`, `verifyAdmin`, `clearAdminCache` public API (unchanged)
- ✅ `getAdminRole` role hierarchy (`viewer` < `admin` < `super_admin`)
- ✅ `canWrite`, `hasRole` helpers (unchanged)
- ✅ `logAdminAction` signature: `void` return, fire-and-forget, console.error on failure
- ✅ `ADMIN_UIDS` env var fallback for super_admin
- ✅ Idempotent admin inserts (upsert on user_id)

### Net impact
- 9 direct `.from('admin_users')` calls removed from API routes
- 1 `.from('admin_actions')` call removed (`logAdminAction` body)
- 11 typed functions added (9 in `admins.ts`, 2 in `adminActions.ts`)
- All admin management queries now centralized
- 2 previously-duplicated insert paths collapsed into one `addAdmin()` function

### Status
**Iteration 2 code complete. Awaiting full validation suite (`npm run lint` + `npm run build` + dev server + smoke tests).**
