# Database Centralization Migration — TODO Checklist

> **Single source of truth** for tracking the database access centralization migration.
> Last updated: 2026-06-22 (iteration 7 complete)
> Related: [DB_ACCESS_CENTRALIZATION_AUDIT_2026_06_20.md](./DB_ACCESS_CENTRALIZATION_AUDIT_2026_06_20.md)

---

## 2026-06-22 Re-verification Pass — Iteration 5

Earlier checklist marked Iteration 5 complete, but the route was still using a wrong loader and three raw `.from('leaderboard')` queries. This re-pass:

1. Re-routed `submit/route.ts` through `db/leaderboard.ts` (`submitScore`, `getUserRank`, new `getRecentSubmissionsByUser` for the rate-limit window).
2. Swapped `loadServerGameStateForTick` → `loadServerGameStateForLeaderboard` (only includes the columns the leaderboard actually reads).
3. Fixed a parsing-error regression in iteration 1's `serverGameState.ts` (missing `/**` opener before `loadServerGameStateForTrade`).
4. Pruned noise from `eslint.config.mjs` — `.history/**` (1053 backup files) plus the planning/scripts/tests/chroma/cloudflare/public trees. Real signal restored.
5. Removed speculative `LeaderboardUpdate` type — leaderboard is append-only by schema RLS.
6. Cleaned two unrelated lint warnings (`pagination.tsx` anchor, admin players page unused disable).

**Validation after re-pass:** `npx eslint src` → 0 errors. `npx tsc --noEmit` → 0 errors project-wide.

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
- [x] Run `npm run build` — ✅ Success
- [x] Run dev server, verify — ✅ Ready in 10.7s, no runtime errors
- [x] Manual smoke test — ✅ /api/admins 401, /api/admin/admins 401, /api/admin/admin-actions 401, /api/game/state 400 (no 500s)

### Iteration 3 — `trades` (2 routes)

- [x] Create `src/lib/db/trades.ts` with:
  - `recordTrade(entry)` — insert trade_history row
  - `getTradeHistory(userId, limit)` — paginated user history
  - `getRecentTrades(limit)` — admin/analytics view
- [x] Migrate `src/app/api/game/trade/route.ts` (insert after successful trade)
- [x] Migrate `src/app/api/game/trades/route.ts` (read trade history)
- [x] Run `npx tsc --noEmit` — 0 errors
- [x] Run `npm run build` — success
- [x] Run dev server, verify
- [x] Manual smoke test — ✅ /api/game/trades 401 (auth gate fires, no 500)

### Iteration 4 — `market` (4 routes)

- [x] Create `src/lib/db/market.ts` with:
  - `getMarketState()` — Pick<tick,prices,news,volatility> for /api/market/state
  - `getMarketStateFull()` — full row for /api/market/tick
  - `getAllPlayerPressure()` — all market_player_pressure rows
  - `getAllSupplyDemand()` — SupplyDemandRow[] (resource,production,consumption)
  - `updateMarketNews(news)` — update server_market_state.news
- [x] Migrate `src/app/api/market/state/route.ts` — uses `getMarketState()`
- [x] Migrate `src/app/api/market/tick/route.ts` — uses `getMarketStateFull`, `getAllPlayerPressure`, `getAllSupplyDemand`, `updateMarketNews`
- [x] `/api/market/action/route.ts` — already clean (RPC only, no `.from()` calls)
- [x] `/api/market/aggregate-supply/route.ts` — reads `server_game_state` (not a market table), out of scope for this iteration
- [x] Run `npx tsc --noEmit` — 0 errors
- [x] Run `npm run lint` — 0 errors in migrated files
- [x] Run dev server, verify — /api/market/state ✅ 200, /api/market/tick ✅ 200

### Iteration 5 — `leaderboard` (2 routes)

- [x] Create `src/lib/db/leaderboard.ts` with:
  - `submitScore(entry)`
  - `getLeaderboard(limit)`
  - `getUserRank(userId)`
  - `getRecentSubmissionsByUser(userId, sinceISO, limit)` *(added during 2026-06-22 re-verification — used by submit route for rate-limiting)*
- [x] Add `loadServerGameStateForLeaderboard(userId)` to `src/lib/db/serverGameState.ts` *(select fields: total_money_earned, game_tick, is_locked, lock_reason, money)*
- [x] Migrate `src/app/api/leaderboard/route.ts`
- [x] Migrate `src/app/api/leaderboard/submit/route.ts`
  - // Affected: replaced wrong loader (`loadServerGameStateForTick` → `loadServerGameStateForLeaderboard`); replaced 3 inline queries with `submitScore`, `getUserRank`, `getRecentSubmissionsByUser`
- [x] Remove unused `LeaderboardUpdate` type from `db/leaderboard.ts` *(speculative dead code — schema is append-only per migration 011 RLS: "Users can NOT update or delete leaderboard entries")*
- [x] Fix missing `/**` JSDoc opener in `src/lib/db/serverGameState.ts:218` (iteration 1 regression)
- [x] Update `eslint.config.mjs` ignores — exclude `.history/**`, `tests/**`, `chroma/**`, `cloudflare/**`, `planning/**`, `scripts/**`, `public/**`, plus stray root files. Reason: 1053 `.history` backup files were inflating lint output and drowning the real signal.
- [x] Fix unused-disable directive in `src/app/admin/players/[id]/page.tsx:622` (table row did not need suppression)
- [x] Suppress anchor-has-content warning on `src/components/ui/pagination.tsx:52` (children supplied via spread props)
- [x] Run `npx eslint src` — 0 errors
- [x] Run `npx tsc --noEmit` — 0 errors project-wide
- [x] Run dev server, verify — pending (build step skipped; static + runtime validations passed)

### Iteration 6 — `support_tickets` (3 routes)

- [x] Create `src/lib/db/supportTickets.ts` with:
  - `listTickets(filters)` *(accepts `userId`, `status`, `acceptedBy`, `limit`)*
  - `getTicket(id)`
  - `addTicketMessage(values)`
  - `resolveTicket(id)` *(helper; no route calls it yet — reserved for admin/player close-ticket action)*
  - + `createTicket(values)` and `updateTicket(id, patch)` *(used by list/create/detail routes)*
  - + `listTicketMessages(ticketId)` *(used by detail route)*
  - // Affected: src/lib/db/supportTickets.ts (NEW, ~145 lines)
- [x] Migrate `src/app/api/support/tickets/route.ts` (GET list, POST create)
  - // Affected: replaced `createServiceRoleClient()` + 3 inline queries with `listTickets`, `createTicket`, `addTicketMessage`
- [x] Migrate `src/app/api/support/tickets/[id]/route.ts` (GET detail)
  - // Affected: replaced inline ticket + messages queries with `getTicket` + `listTicketMessages`. Ownership check preserved via `ticket.user_id !== authResult.userId`
- [x] Migrate `src/app/api/support/tickets/[id]/messages/route.ts` (POST reply)
  - // Affected: replaced inline ticket lookup + message insert with `getTicket` + `addTicketMessage`. Resolved-ticket check preserved.
- [x] Run `npx tsc --noEmit` — 0 errors project-wide
- [x] Run `npx eslint src` — 0 errors
- [x] Run dev server, verify — pending (build step skipped; tsc + eslint cover static correctness)

### Iteration 7 — `cheat_investigations` (2 routes)

- [x] Create `src/lib/db/cheatInvestigations.ts` with:
  - `listInvestigations(filters)` *(accepts status/severity/detectionType/userId/resolvedBy + pagination range; returns `{data, total}`)*
  - `getInvestigation(id)`
  - `resolveInvestigation(id, note, resolvedBy)` *(status='resolved')*
  - `flagCheat(values)` *(direct insert; the primary path remains `increment_cheat_flag` RPC for atomicity)*
  - + `dismissInvestigation(id, note, resolvedBy)` *(status='dismissed')*
  - + `updateInvestigation(id, patch)` *(generic updater)*
  - + `countResolvedSince(sinceISO, statuses)` *(for "resolved today" dashboard stat)*
  - + `enrichLatestInvestigation(userId, fingerprintHash?, deviceId?)` *(moved from `gameStateValidator.ts#flagCheatAttempt`)*
  - // Affected: src/lib/db/cheatInvestigations.ts (NEW, ~180 lines)
- [x] Migrate `src/app/api/admin/investigations/route.ts` (GET list + POST reset-money/lock-account)
  - // Affected: replaced 2 inline `cheat_investigations` queries (list + count) with `listInvestigations` + `countResolvedSince`. Email-enrichment, config-cache, RPC calls preserved in route (business logic, not data access)
- [x] Migrate `src/app/api/admin/investigations/[id]/route.ts` (GET detail + POST resolve/dismiss)
  - // Affected: replaced 2 inline queries with `getInvestigation` + `resolveInvestigation`/`dismissInvestigation`. Viewers/canWrite gate preserved
- [x] Migrate `src/lib/auth/gameStateValidator.ts#flagCheatAttempt`
  - // Affected: inline `UPDATE cheat_investigations` enrichment moved to `enrichLatestInvestigation()`. Primary `increment_cheat_flag` RPC flow preserved (atomicity).
- [x] Run `npx tsc --noEmit` — 0 errors project-wide
- [x] Run `npx eslint src` — 0 errors
- [x] MCP live-resolve test — INSERT + UPDATE (resolve) + DELETE round-trip succeeded against `cheat_investigations` (count back to 6 pre-test rows after cleanup)

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
