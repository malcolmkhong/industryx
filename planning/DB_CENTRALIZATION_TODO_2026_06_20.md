# Database Centralization Migration — TODO Checklist

> **Single source of truth** for tracking the database access centralization migration.
> Last updated: 2026-06-20
> Related: [DB_ACCESS_CENTRALIZATION_AUDIT_2026_06_20.md](./DB_ACCESS_CENTRALIZATION_AUDIT_2026_06_20.md)

---

## Phase 1: Audit & Analysis

- [x] Inventory all `createServiceRoleClient()` call sites (78 found, 71 files)
- [x] Inventory all `createClient()` call sites in API routes (3 admin files)
- [x] Inventory all `createClient()` call sites in UI (5 components/pages)
- [x] Inventory existing `src/lib/auth/*` abstraction modules
- [x] Inventory duplicated query patterns (8 patterns identified: A-H)
- [x] Inventory duplicated DB types (`src/lib/game/types.ts` has ~870 lines of hand-written types)
- [x] Inventory unused abstraction layers (`src/lib/db/{index,admin,user,types}` all 0 imports)
- [x] Create audit document: `planning/DB_ACCESS_CENTRALIZATION_AUDIT_2026_06_20.md`
- [x] Create this TODO checklist

---

## Phase 2: Architecture Preparation

- [ ] Decide error-handling convention: `null` for not-found, `throw` for unexpected, `false` for ops
- [ ] Decide return-type convention: `Promise<Row | null>` everywhere vs `Promise<Row>` with throws
- [ ] Decide naming convention: `getX` / `listX` / `saveX` / `recordX` / `lockX`
- [ ] Document the pattern in `src/lib/db/README.md` (new file)
- [ ] Add ESLint `no-restricted-imports` rule to ban `@/lib/supabase/server` in `src/app/api/**`
- [ ] Run `npm run lint` baseline — confirm no new errors after rule added

---

## Phase 3: Migration

### Iteration 1 — `server_game_state` (8 routes, highest impact)

- [x] Create `src/lib/db/serverGameState.ts` with:
  - `loadServerGameStateLite(userId)`
  - `loadServerGameStateLiteForOffline(userId)`
  - `loadServerGameStateForTick(userId)`
  - `loadServerGameStateForTrade(userId)`
  - `loadServerGameStateForAction(userId)`
  - `loadServerGameStateForPreview(userId)`
  - `loadServerGameStateForDeltaCheck(userId)`
  - `loadActivePlayersSince(cutoffISO)`
  - `loadLockState(userId)`
  - `loadPlayerProgressGameState(userId)`
  - `saveServerGameState(userId, patch)`
  - `saveServerGameStateOptimistic(userId, expectedVersion, patch)`
  - `upsertServerGameState(values)`
  - `syncPlayerProgressGameState(userId, gameState)`
  - `lockServerGameState(userId, reason)`
  - `unlockServerGameState(userId)`
  - `isServerGameStateAvailable()`
  - // Affected: src/lib/db/serverGameState.ts (NEW, 320 lines)
- [x] Migrate `src/app/api/game/state/route.ts` (3 call sites)
  - // Affected: GET uses loadServerGameStateLite + isServerGameStateAvailable; POST uses loadServerGameStateForDeltaCheck + upsertServerGameState + syncPlayerProgressGameState
- [x] Migrate `src/app/api/game/trade/route.ts` (2 call sites)
  - // Affected: load uses loadServerGameStateForTrade; update uses saveServerGameStateOptimistic
- [x] Migrate `src/app/api/game/offline/route.ts` (3 call sites)
  - // Affected: GET uses loadServerGameStateLiteForOffline + loadPlayerProgressGameState; POST uses loadServerGameStateForTick + saveServerGameStateOptimistic
- [x] Migrate `src/app/api/game/action/route.ts` (2 call sites)
  - // Affected: load uses loadServerGameStateForAction + isServerGameStateAvailable; fire-and-forget update uses saveServerGameStateOptimistic
- [x] Migrate `src/app/api/cron/validate-ticks/route.ts` (1 call site)
  - // Affected: active-players query uses loadActivePlayersSince
- [x] Migrate `src/app/api/auth/claim-guest/route.ts` (1 call site)
  - // Affected: lock check uses loadLockState
- [x] Migrate `src/app/api/auth/link-identity/route.ts` (2 call sites)
  - // Affected: guest + google preview both use loadServerGameStateForPreview
- [x] Run `tsc --noEmit` on migrated files — **zero type errors**
- [x] Run `tsc --noEmit` project-wide — **zero type errors (0 lines)**
- [x] Run dev server — started in 7.1s
- [x] Manual smoke tests on 9 routes — all return correct status codes (401 unauth, 400 bad input, no 500s, no runtime errors)

### Iteration 2 — `admins` + `admin_actions` (5+ routes, auth-cached)

- [x] Create `src/lib/db/admins.ts` with:
  - `isAdminUserDb(userId)` (cache-aware, delegates to auth/admin.ts)
  - `getAdminRole(userId)`
  - `listAdmins()`
  - `countAdmins()`
  - `getAdminById(userId)`
  - `getAdminByEmail(email)`
  - `addAdmin(userId, email, role, addedBy?)`
  - `removeAdmin(userId)`
  - `setAdminRole(userId, newRole)`
  - `getAdminUserIdsFromDb()` (called by auth/admin.ts cache)
  - // Affected: src/lib/db/admins.ts (NEW, ~280 lines)
- [x] Create `src/lib/db/adminActions.ts` with:
  - `logAdminAction(params)` (moved from auth-helpers.ts; signature preserved)
  - `listAdminActions(filters)`
  - // Affected: src/lib/db/adminActions.ts (NEW, ~110 lines)
- [x] Update `src/lib/auth/admin.ts` cache to call `getAdminUserIdsFromDb()` from `db/admins.ts`
  - // Affected: src/lib/auth/admin.ts — replaced 1 inline query, 60s cache preserved exactly
- [x] Update `src/lib/auth/admin-helpers.ts` to use `db/admins.ts` + `db/adminActions.ts`
  - // Affected: src/lib/auth/admin-helpers.ts — `logAdminAction` is now a re-export
- [x] Migrate `src/app/api/admins/route.ts` (3 call sites)
  - // Affected: listAdmins, countAdmins, addAdmin
- [x] Migrate `src/app/api/admins/[id]/route.ts` (2 call sites)
  - // Affected: getAdminById, removeAdmin
- [x] Migrate `src/app/api/admin/admins/route.ts` (3 call sites)
  - // Affected: listAdmins, countAdmins, addAdmin (collapses duplicate insert logic with /api/admins)
- [x] Migrate `src/app/api/admin/admins/[id]/route.ts` (1 call site)
  - // Affected: getAdminById + removeAdmin
- [x] Migrate `src/app/api/admin/admins/[id]/role/route.ts` (1 call site)
  - // Affected: setAdminRole
- [x] Run `npx tsc --noEmit` — 0 errors project-wide AND 0 errors in iteration files
- [x] Run `npx eslint` (migrated files only) — 0 new errors
- [ ] Run `npm run build` — **pending**
- [ ] Run dev server, verify — **pending**
- [ ] Manual test: admin login, list admins, log action — **pending**

### Iteration 3 — `trades` (2 routes)

- [ ] Create `src/lib/db/trades.ts` with:
  - `recordTrade(entry)`
  - `getTradeHistory(userId, limit)`
  - `getRecentTrades(limit)`
- [ ] Migrate `src/app/api/game/trade/route.ts` (2 call sites)
- [ ] Migrate `src/app/api/game/trades/route.ts` (1 call site)
- [ ] Run `npm run lint` — zero new errors
- [ ] Run dev server, verify
- [ ] Manual test: trade + history

### Iteration 4 — `market` (4 routes)

- [ ] Create `src/lib/db/market.ts` with:
  - `getMarketConfig()`
  - `getMarketState()`
  - `recordMarketTick(...)`
  - `aggregateSupply()`
- [ ] Migrate `src/app/api/market/state/route.ts`
- [ ] Migrate `src/app/api/market/action/route.ts`
- [ ] Migrate `src/app/api/market/tick/route.ts`
- [ ] Migrate `src/app/api/market/aggregate-supply/route.ts`
- [ ] Run `npm run lint` — zero new errors
- [ ] Run dev server, verify

### Iteration 5 — `leaderboard` (2 routes)

- [ ] Create `src/lib/db/leaderboard.ts` with:
  - `submitScore(entry)`
  - `getLeaderboard(limit)`
  - `getUserRank(userId)`
- [ ] Migrate `src/app/api/leaderboard/route.ts`
- [ ] Migrate `src/app/api/leaderboard/submit/route.ts`
- [ ] Run `npm run lint` — zero new errors
- [ ] Run dev server, verify

### Iteration 6 — `support_tickets` (3 routes)

- [ ] Create `src/lib/db/supportTickets.ts` with:
  - `listTickets(filters)`
  - `getTicket(id)`
  - `addTicketMessage(...)`
  - `resolveTicket(id)`
- [ ] Migrate `src/app/api/support/tickets/route.ts`
- [ ] Migrate `src/app/api/support/tickets/[id]/route.ts`
- [ ] Migrate `src/app/api/support/tickets/[id]/messages/route.ts`
- [ ] Run `npm run lint` — zero new errors
- [ ] Run dev server, verify

### Iteration 7 — `cheat_investigations` (2 routes)

- [ ] Create `src/lib/db/cheatInvestigations.ts` with:
  - `listInvestigations(filters)`
  - `getInvestigation(id)`
  - `resolveInvestigation(id, note, resolvedBy)`
  - `flagCheat(...)` (moves from `gameStateValidator.ts` if appropriate)
- [ ] Migrate `src/app/api/admin/investigations/route.ts`
- [ ] Migrate `src/app/api/admin/investigations/[id]/route.ts`
- [ ] Run `npm run lint` — zero new errors
- [ ] Run dev server, verify

### Iteration 8 — remaining admin/player routes (~20 routes)

- [ ] Migrate `src/app/api/admin/players/route.ts`
- [ ] Migrate `src/app/api/admin/players/[id]/route.ts`
- [ ] Migrate `src/app/api/admin/players/[id]/lock/route.ts`
- [ ] Migrate `src/app/api/admin/players/bulk/route.ts`
- [ ] Migrate `src/app/api/admin/players/compare/route.ts`
- [ ] Migrate `src/app/api/admin/stats/route.ts`
- [ ] Migrate `src/app/api/admin/economy/route.ts`
- [ ] Migrate `src/app/api/admin/jobs/route.ts`
- [ ] Migrate `src/app/api/admin/market/route.ts`
- [ ] Migrate `src/app/api/admin/market/resources/route.ts`
- [ ] Migrate `src/app/api/admin/market/resources/[id]/route.ts`
- [ ] Migrate `src/app/api/admin/audit/export/route.ts`
- [ ] Migrate `src/app/api/admin/system-status/route.ts`
- [ ] Migrate `src/app/api/admin/monitoring/route.ts`
- [ ] Migrate `src/app/api/admin/actions/route.ts`
- [ ] Migrate `src/app/api/admin/admin-actions/route.ts`
- [ ] Run `npm run lint` — zero new errors
- [ ] Run dev server, verify

### Iteration 9 — remaining auth/config/utility routes (~10 routes)

- [ ] Migrate `src/app/api/auth/initialize-guest/route.ts`
- [ ] Migrate `src/app/api/auth/confirm-link/route.ts`
- [ ] Migrate `src/app/api/auth/claim-guest/route.ts` (already done in Iter 1 — verify)
- [ ] Migrate `src/app/api/auth/link-identity/route.ts` (already done in Iter 1 — verify)
- [ ] Migrate `src/app/api/auth/migrate-guest/route.ts`
- [ ] Migrate `src/app/api/auth/recover-by-device/route.ts`
- [ ] Migrate `src/app/api/auth/update-profile/route.ts`
- [ ] Migrate `src/app/api/auth/me/route.ts` (uses `createClient` not service role)
- [ ] Migrate `src/app/api/config/[table]/route.ts`
- [ ] Migrate `src/app/api/config/[table]/[id]/route.ts`
- [ ] Migrate `src/app/api/waitlist/route.ts`
- [ ] Migrate `src/app/api/tables/route.ts`
- [ ] Migrate `src/app/api/health/route.ts`
- [ ] Migrate `src/app/api/player/route.ts`
- [ ] Migrate `src/app/api/admin/auth/callback/route.ts`
- [ ] Run `npm run lint` — zero new errors
- [ ] Run dev server, verify

### Iteration 10 — game state helpers (engine integration)

- [ ] Migrate `src/lib/auth/gameStateValidator.ts` (queries inside `validateGameState`, `logActionAsync`, `isAccountLocked`)
- [ ] Migrate `src/lib/auth/rateLimiter.ts` (if not using thin re-export)
- [ ] Migrate `src/lib/capacity.ts` (uses `get_capacity_status` RPC)
- [ ] Migrate `src/lib/auth/verifyAuth.ts` (uses `createClient`)
- [ ] Migrate `src/lib/auth/admin-helpers.ts` (already done in Iter 2 — verify)
- [ ] Migrate `src/lib/auth/permissions.ts` (queries `admin_permissions` table)
- [ ] Run `npm run lint` — zero new errors
- [ ] Run dev server, verify

---

## Phase 4: Validation & Testing

- [ ] Run `npm run lint` — zero new errors across the whole project
- [ ] Run dev server — no startup errors
- [ ] Test each migrated route via dev server
- [ ] Verify all auth gates still work: locked account, rate limit, CSRF
- [ ] Verify admin RBAC still works: `verifyAdmin()` + `canWrite()` on all admin routes
- [ ] Verify game state save/load round-trip works end-to-end
- [ ] Verify trade round-trip (most critical): trade → history → market
- [ ] Run grep: zero `createServiceRoleClient` in `src/app/api/**`
- [ ] Run grep: zero `createClient` from `@/lib/supabase/server` in `src/app/api/**`
- [ ] Run grep: zero `.from('server_game_state')` outside `src/lib/db/serverGameState.ts`
- [ ] Run grep: zero `.from('admin_users')` outside `src/lib/db/admins.ts`
- [ ] Run grep: zero `.from('trade_history')` outside `src/lib/db/trades.ts`
- [ ] Run grep: zero `.from('admin_actions')` outside `src/lib/db/adminActions.ts`
- [ ] Run grep: zero `.from('profiles')` outside `src/lib/db/profiles.ts`
- [ ] Run grep: zero `.from('player_progress')` outside `src/lib/db/playerProgress.ts`
- [ ] Verify ESLint `no-restricted-imports` rule is now passing (zero violations)

---

## Phase 5: Cleanup & Documentation

- [ ] Update `AGENTS.md` to require `@/lib/db` for all new code
- [ ] Update `BUGS.md` if any bugs surfaced during migration
- [ ] Move audit doc to `planning/2026-06-20_audit/` subfolder
- [ ] Add `src/lib/db/README.md` documenting the module API
- [ ] Update `src/lib/supabase/server.ts` doc comment to say "internal — do not import directly from API routes"
- [ ] Update `src/lib/supabase/client.ts` doc comment similarly
- [ ] Re-run audit doc verification
- [ ] Verify `knip` reports no unused exports
- [ ] Verify `eslint .` reports zero issues
- [ ] Commit and push

---

## Notes

- **Do not** modify `src/lib/supabase/server.ts` or `src/lib/supabase/client.ts` — they are the real factories
- **Do not** modify `src/lib/db/types.ts` — generated types
- **Do** preserve the 60s admin cache behavior exactly
- **Do** keep auth modules (`auth/*`) in place — they are policy, not data access
- **Do** migrate one route group at a time, test after each
- **Do** add `// Affected: <files>` comment under each completed item

---

## Status legend

- `[ ]` Not started
- `[~]` In progress
- `[x]` Complete
- `[!]` Blocked
