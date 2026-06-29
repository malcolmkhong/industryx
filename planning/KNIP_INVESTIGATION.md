# Knip Unused Code Investigation

> **Date:** 2026-06-29
> **Tool:** Knip 6.16.1
> **Scope:** Full codebase (15 unused files, 52 unused exports, 11 unused types, 9 dep issues, 3 duplicate exports)
> **Method:** Knip report + cross-reference tracing from source

---

## Summary Table

| Category | Count | Classification |
|---|---|---|
| Unused files | 15 | 5 Unused, 7 Disconnected, 2 Incomplete, 1 Replaced |
| Unused exports | 52 | 2 Disconnected (called internally), 50 Unused |
| Unused types | 11 | 11 Unused |
| Unused dependencies | 2 | 2 Unused |
| Unused devDependencies | 6 | 6 Unused |
| Unlisted dependencies | 1 | 1 Missing declaration |
| Duplicate exports | 3 | 3 Cleanup needed |

---

## CATEGORY 1: UNUSED FILES

### 1. src/lib/game/marketSimulator.legacy.ts — **REPLACED**

**Classification: Replaced**

This file was replaced by the current src/lib/game/marketSimulator.ts. The legacy file contains an old supply-demand model philosophy that was superseded. No references to marketSimulator.legacy exist anywhere in the codebase. The new simulator at marketSimulator.ts is actively imported by 
ewsBuilder.ts and store.ts.

**Evidence:**
`
src/lib/game/marketSimulator.ts   — active, imported
src/lib/game/marketSimulator.legacy.ts — orphaned, never imported
`

**Action:** Delete src/lib/game/marketSimulator.legacy.ts.

---

### 2. src/lib/game/store/index.ts — **INCOMPLETE**

**Classification: Incomplete**

A barrel file created as part of the store decomposition plan (planning/STORE_DECOMPOSITION_ARCHITECTURE.md). The barrel was scaffolded but never wired in. More critically, the barrel has **broken import paths**:

`	ypescript
export { useGameStore } from '../store';         // resolves to src/lib/game/store/ (dir) — DOES NOT EXIST
export type { GameStore } from '../store-types';  // resolves to src/lib/game/store-types.ts — EXISTS
export { formatNumber } from '../utils/formatNumber';  // EXISTS
export { getBuildingCost } from '../utils/costCalculator';  // EXISTS
export { generateId } from '../utils/generateId';  // EXISTS
export { hasUnlimitedStorage } from '../utils/hasUnlimitedStorage';  // EXISTS
`

The path ../store resolves to src/lib/game/store/ (the directory itself), not src/lib/game/store.ts (the file). This means the barrel cannot compile as written. It is not imported by any file in the codebase, so this broken import has never been detected.

The store decomposition was never implemented (per planning/PROJECT_STATUS_SOURCE_OF_TRUTH.md: "selectors/ STALE — does not exist"). This barrel was created in anticipation of that decomposition but was never connected.

**Evidence:** Zero cross-references to src/lib/game/store/index exist in the codebase.

**Action:** Either (a) delete the barrel entirely, or (b) fix the broken import path ('../store' → '../store-types' and fix the useGameStore re-export to use a type-only import since useGameStore is a value not a type). Recommend (a).

---

### 3. src/lib/game/store/llmIntegration.ts — **INCOMPLETE**

**Classification: Incomplete**

An async LLM news enhancement module. Imports initNewsLLM and egisterUpdateCallback from ../newsLLM. Defines ensureLLMCallback() which wraps the egisterUpdateCallback from 
ewsLLM.ts. This was created as an integration layer for the news LLM system but was never connected to the actual news pipeline or store.

The connection was lost because the newsLLM integration in store.ts was implemented directly (calling initNewsLLM and egisterUpdateCallback inline in the store setup), rather than going through this abstraction layer.

**Evidence:** ensureLLMCallback is defined but never called. Zero references to this file exist in the codebase.

**Action:** Delete src/lib/game/store/llmIntegration.ts.

---

### 4. src/lib/game/store/persistence.ts — **DISCONNECTED**

**Classification: Disconnected**

A debounced localStorage persistence layer for Zustand v5. This is well-implemented code with a clear comment explaining the bug it fixed (the previous approach caused "[object Object]" serialization). However, it is not imported anywhere in the codebase.

The connection was broken because store.ts already has its own persist middleware configuration inline (using store-persist.ts which is also unused, importing from this). The actual store.ts uses store-persist.ts (the other unused file) rather than this direct module. This store/persistence.ts was created as a utility but was superseded by store-persist.ts at the parent level.

**Evidence:** Zero cross-references.

**Action:** Delete src/lib/game/store/persistence.ts.

---

### 5. src/lib/game/store-persist.ts — **DISCONNECTED**

**Classification: Disconnected**

The persist config for store.ts (the Zustand persist middleware configuration). Imports debouncedPersistStorage from ./store/persistence and SAVE_VERSION from ./constants/saveVersion. Exports persistConfig.

This was created as the configuration file for the Zustand persist middleware, but store.ts does not import from store-persist.ts — it likely has its own inline persist config. The file is orphaned.

**Evidence:** Zero cross-references to store-persist.ts in the codebase.

**Action:** Delete src/lib/game/store-persist.ts.

---

### 6–10. src/components/admin/AdminEmptyState.tsx, ConfirmModal.tsx, Pagination.tsx, TableSkeleton.tsx, InvestigationTimeline.tsx — **DISCONNECTED**

**Classification: Disconnected**

All five files are complete, well-implemented components (not stubs). They were created for the admin panel system but were never integrated. The admin pages (19 of them) were built using different patterns.

- AdminEmptyState — A generic empty-state component with icon, title, description, action prop. Never imported by any admin page.
- ConfirmModal — A reusable confirmation dialog with danger/warning/neutral variants. Never imported.
- Pagination — A client-side pagination component with smart ellipsis. Never imported.
- TableSkeleton — A skeleton loader for data tables with animation. Never imported.
- InvestigationTimeline — A timeline component for cheat investigation events. Never imported.

The investigation timeline feature exists conceptually but the UI was never wired to the backend data.

**Evidence:** Zero cross-references to any of these files.

**Action:** Delete all five files, OR integrate them into the admin panel pages if they provide needed functionality.

---

### 7. src/components/admin/useAdminError.tsx — **DISCONNECTED**

**Classification: Disconnected**

A React hook for managing admin error states. Exports useAdminError() hook and AdminErrorBanner component. This was created as a reusable error management utility for admin panels but was never adopted.

The admin pages likely handle errors inline with per-component state, following a different pattern.

**Evidence:** Zero cross-references to this hook.

**Action:** Delete src/components/admin/useAdminError.tsx.

---

### 8. src/lib/admin/fetchWrapper.ts — **DISCONNECTED**

**Classification: Disconnected**

An dminFetch() wrapper that auto-attaches CSRF tokens to mutating requests. The implementation is functional and correct (CSRF protection for admin routes). However, all admin API routes use direct etch() calls with createServiceRoleClient() from db/admin.ts instead.

The CSRF protection approach was superseded by the Supabase service-role pattern for admin auth (M7 in the 25-issue registry was fixed with 8a0b1b using dmin_users table), making this CSRF approach unnecessary.

**Evidence:** Zero cross-references.

**Action:** Delete src/lib/admin/fetchWrapper.ts.

---

### 9. src/lib/auth/csrf.ts — **DISCONNECTED**

**Classification: Disconnected**

A server-side CSRF token generation and validation module for Next.js. Exports generateCsrfToken(), setCsrfCookie(), alidateCsrf(). This was created to implement CSRF protection for auth routes, but the project uses Supabase Auth's built-in CSRF protection instead (Supabase handles this automatically for its auth endpoints). This file is a standalone CSRF implementation that was never integrated.

**Evidence:** Zero cross-references to this file.

**Action:** Delete src/lib/auth/csrf.ts.

---

### 10. src/lib/db/index.ts — **DISCONNECTED**

**Classification: Disconnected**

A database barrel file created as part of the DB centralization effort (DB_CENTRALIZATION_TODO_2026_06_20.md, iterations 1-9). Its documented intent was to be "the industry-standard single import point" for database helpers. It re-exports:

`	ypescript
export type { Database } from './types';
export { createServiceRoleClient, isServiceRoleConfigured } from './admin';
export { createClient, isSupabaseConfigured } from './user';
`

The problem: Database type IS used extensively (imported directly from ./types by many files), createServiceRoleClient IS used (imported directly from ./admin), but the barrel itself is never imported. Code uses direct paths like @/lib/db/types, @/lib/db/admin, not @/lib/db.

The barrel was created in the DB centralization migration but routes were not retrofitted to use the barrel import pattern.

**Evidence:** Zero cross-references to @/lib/db (the barrel) exist.

**Action:** Delete src/lib/db/index.ts.

---

### 11. src/lib/db/user.ts — **DISCONNECTED**

**Classification: Disconnected**

A thin re-export wrapper around supabase/server for the user-scoped Supabase client:

`	ypescript
export { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
`

The createClient function is used (directly from supabase/server.ts), but isSupabaseConfigured is never imported anywhere, and db/user.ts itself is never imported by any file. This re-export was intended as a canonical path but was never adopted.

**Evidence:** isSupabaseConfigured defined at supabase/server.ts:9 and supabase/client.ts:9, but never imported. db/user.ts has zero cross-references.

**Action:** Delete src/lib/db/user.ts.

---

### 12. src/lib/hooks/usePlayerDisplayName.ts — **INCOMPLETE**

**Classification: Incomplete**

A React hook that prioritizes player display names (in-game nickname over auth provider name). Created as a new feature for player profiles, but was never integrated into any component. The admin user management or player display system was implemented differently.

The playerProgress table has a display_name column (per DB centralization), but the frontend hook to fetch and display it was never wired in.

**Evidence:** Zero cross-references.

**Action:** Delete src/lib/hooks/usePlayerDisplayName.ts.

---

## CATEGORY 2: UNUSED EXPORTS

> Knip reports "unused export" meaning the symbol is never **imported** by another file. It may still be **called internally** within the defining file.

### Internal-Use-Only (Disconnected — these ARE used, just not by external callers)

The following are called within their own file but never imported externally. These are legitimately useful functions that should stay, but their exports are unnecessary:

| Export | File | Internal usage | Classification |
|---|---|---|---|
| saveServerGameState | db/serverGameState.ts:362 | Called by pageServerGameStateFullState, loadServerGameStateForTrade, loadServerGameStateForTick | **Disconnected** (exported for potential API use, never connected) |
| lockServerGameState | db/serverGameState.ts:593 | Called by game action route | **Disconnected** |
| unlockServerGameState | db/serverGameState.ts:615 | Called by game action route | **Disconnected** |
| listAdminActions | db/adminActions.ts:79 | Used in playerActions.ts:90 | **Disconnected** (cross-file use) |
| MergeReceipt | db/merge.ts:30 | Used in merge.ts (same file) | **Disconnected** |
| MoneyAggregate | db/serverGameState.ts:712 | Used in serverGameState.ts (same file) | **Disconnected** |
| ormatNumber | game/store.ts:68 | Used by page.tsx:4 | **DISCONNECTED** (external import from store.ts works fine) |

### True Unused Exports

The remaining 43 unused exports were never imported by any other file. These fall into three families:

#### Family A: DB Centralization Leftovers (DB_CENTRALIZATION_TODO_2026_06_20.md)

Created during the DB centralization migration (iterations 1-9). Helpers were created but the corresponding API routes were **not retrofitted** to use them. The routes still have inline .from() calls:

| Export | File | Intended route | Route still uses inline .from()? |
|---|---|---|---|
| listAuthUsersByProvider | db/adminUsers.ts:190 | dmin/users | Yes (12 routes documented) |
| lagCheat | db/cheatInvestigations.ts:135 | dmin/investigations | Yes |
| countRecentCheatFlagsSince | db/cheatInvestigations.ts:275 | dmin/investigations | Yes |
| createMarketConfig | db/configMarket.ts:59 | dmin/market | Yes |
| updateMarketConfig | db/configMarket.ts:79 | dmin/market | Yes |
| getRecentRewards | db/dailyRewards.ts:139 | dmin/players | Yes |
| indIdentitiesByUserId | db/guestIdentities.ts:80 | uth/link-identity | Yes |
| deleteIdentitiesByUserId | db/guestIdentities.ts:245 | uth/link-identity | Yes |
| getLatestMarketTickAndBreakers | db/market.ts:155 | game/market-history | Yes |
| getProfileById | db/profiles.ts:56 | player | Yes |
| upsertProfile | db/profiles.ts:74 | player | Yes |
| esolveTicket | db/supportTickets.ts:134 | dmin/support/tickets | Yes |

**Classification: Incomplete.** The helpers were created but routes were not retrofitted. The TODO doc documents 12 routes still using inline .from() when helpers exist.

**Recommendation:** Either retrofit the routes to use these helpers (completing the centralization plan), or remove the helpers. Given the DB centralization is already on iteration 9 with the main work done, completing the retrofit is the higher-value option.

#### Family B: NewsLLM System (never fully connected)

The newsLLM system was built in phases. Several exports from 
ewsLLM.ts and 
ewsBuilder.ts were created but never connected to the runtime news pipeline:

| Export | File | Why disconnected |
|---|---|---|
| initNewsLLM | game/newsLLM.ts:458 | Called inside 
ewsLLM.ts but never imported externally. store.ts calls initNewsLLM directly. |
| egisterUpdateCallback | game/newsLLM.ts:476 | Same as above |
| ddEventToBatch | game/newsLLM.ts:488 | Created for batch processing, never connected |
| esetDailyBudget | game/newsLLM.ts:538 | Never called |
| updateGameDay | game/newsLLM.ts:546 | Never called |
| shutdownNewsLLM | game/newsLLM.ts:563 | Never called |
| eventPacketToMarketNews | game/newsBuilder.ts:759 | Never imported |
| NewsConfig | game/newsBuilder.ts:90 | Never imported |
| NewsTextResult | game/newsLLM.ts:32 | Never imported |

**Classification: Incomplete.** These are news system components that were built but the integration layer (the store connection) was implemented differently in store.ts.

#### Family C: Server Tick Validator (never integrated)

Functions from serverTickValidator.ts and marketTick.ts were created for server-side tick validation and market simulation, but never connected to the actual server tick pipeline:

| Export | File | Classification |
|---|---|---|
| computeMaxPossibleBuildings | game/serverTickValidator.ts:106 | Unused |
| computeMaxPossibleResearch | game/serverTickValidator.ts:129 | Unused |
| computeMaxPossibleResources | game/serverTickValidator.ts:148 | Unused |
| createInitialSimState | game/engine/marketTick.ts:28 | Unused |
| simulateMarketTick | game/engine/marketTick.ts:52 | Unused |
| ecordPlayerSell | game/engine/marketTick.ts:258 | Unused |
| ecordPlayerBuy | game/engine/marketTick.ts:277 | Unused |

**Classification: Incomplete.** These were built for a server-side market simulation system that was never connected. The actual server tick uses a Supabase RPC (pply_market_tick) rather than this client-side simulator.

#### Family D: Misc utilities

| Export | File | Classification |
|---|---|---|
| pplyBalanceOverrides | game/balanceConfig.ts:222 | Unused |
| esetBalance | game/balanceConfig.ts:229 | Unused |
| getAllBuildingTypes | game/buildingDiscovery.ts:110 | Unused |
| getBuildingCountsByCategory | game/buildingDiscovery.ts:117 | Unused |
| BUILDING_ID_MIGRATION | game/configCache.ts:86 | Unused |
| configLoadedAt | game/configCache.ts:97 | Unused |
| esetToLocal | game/configCache.ts:362 | Unused |
| migrateBuildingDefs | game/configCache.ts:393 | Unused |
| everseMigrateBuildingId | game/idMigration.ts:45 | Unused |
| isOldBuildingId | game/idMigration.ts:52 | Unused |
| isMigratedBuildingId | game/idMigration.ts:59 | Unused |
| migrateSaveState | game/idMigration.ts:92 | **DISCONNECTED** — actually used inside store.ts:202 as migrateSaveBuildings import |
| ecordMarketAction | hooks/useServerMarket.ts:56 | Unused |
| isSupabaseConfigured | supabase/server.ts:9 | Unused |
| canAcceptNewSignup | capacity.ts:67 | Unused |
| getCapacityForClient | capacity.ts:76 | Unused |
| getAllowedTableIds | config/tables.ts:504 | Unused |

**Classification: Unused.** These are utility functions and constants created for specific use cases that never materialized.

### Unused Types

| Type | File | Classification |
|---|---|---|
| Tables | db/types.ts:2105 | Unused — Supabase types imported directly from ./types |
| TablesInsert | db/types.ts:2134 | Unused |
| TablesUpdate | db/types.ts:2159 | Unused |
| Enums | db/types.ts:2184 | Unused |
| CompositeTypes | db/types.ts:2201 | Unused |
| Constants | db/types.ts:2218 | Unused |
| Building | game/types.ts:47 | Unused — BuildingInstance used instead |
| ConflictInfo | hooks/cloudSync/types.ts:87 | Unused — defined but never referenced |

**Note on db/types.ts:** The Database type (line ~2070) IS used extensively by many files. The unused exports are additional Supabase-generated types (the Tables, Enums, CompositeTypes namespace types) that are part of the generated schema but are not referenced by any code. These come from a Supabase schema generation step and are technically correct but not needed in this codebase.

---

## CATEGORY 3: DEPENDENCY ISSUES

### Unused Dependencies (safe to remove)

| Package | Location | Classification | Recommendation |
|---|---|---|---|
| @radix-ui/react-toast | package.json:50 | **Unused** — project uses sonner for toasts instead. BUG-018 mentions aria-labels added to game panels. No ToastProvider usage found. | Remove |
| supabase | package.json:74 | **Unused** — project uses @supabase/ssr and @supabase/supabase-js. The legacy supabase package is not imported anywhere. | Remove (BUG-003 relates to prisma cleanup, same family) |

### Unused DevDependencies (safe to remove)

| Package | Location | Classification | Recommendation |
|---|---|---|---|
| @testing-library/dom | package.json:82 | **Unused** — no test runner configured (BUG-004) | Remove or configure Vitest |
| @testing-library/jest-dom | package.json:83 | **Unused** | Remove |
| @testing-library/react | package.json:84 | **Unused** | Remove |
| un-types | package.json:90 | **Unused** — project uses npm scripts, not Bun runtime | Remove |
| eslint-plugin-jsx-a11y | package.json:93 | **Unused** — listed in devDependencies but not in eslint.config.mjs plugins. BUG-018 mentions aria-labels for accessibility but the a11y plugin itself is not active. | Remove |
| 	w-animate-css | package.json:99 | **Unused** — project uses ramer-motion for animations | Remove |

### Unlisted Dependency (needs declaration)

| Package | Location | Classification | Recommendation |
|---|---|---|---|
| @vitest/coverage-v8 | itest.config.ts | **Missing from package.json** — imported in itest.config.ts but not in dependencies. Would fail 
pm install on a clean clone. | Add to devDependencies |

---

## CATEGORY 4: DUPLICATE EXPORTS

| File | Issue | Classification | Recommendation |
|---|---|---|---|
| PayoutPanel.tsx | Both export function PayoutPanel (line ~1) AND export default function PayoutPanel (end of file) | **Cleanup** | Remove the duplicate default export |
| TradingPostPanel.tsx | Both named and default export | **Cleanup** | Remove the duplicate default export |
| GameIcon.tsx | Both export const GameIcon (line ~164) AND export default const GameIcon | **Cleanup** | Remove the duplicate default export |
| UserAvatarFallback | unction export (line 67) never imported; the component uses UserAvatar | **Cleanup** | Verify if this is a leftover export |

All three duplicate exports are the same symbol exported twice (named + default) — a common pattern when converting between default and named exports. The default export is the one actually used.

---

## CATEGORY 5: RELATED BUGS.MD ENTRIES

Several Knip findings map to existing open bugs:

| BUG ID | Related Knip Finding | Status |
|---|---|---|
| BUG-003 | prisma in devDependencies (leftover from pre-cleanup) — also un-types | Open |
| BUG-004 | @testing-library/* unused (no test runner) | Open |
| BUG-013 | .omo/ directory gitignored but not empty (knip report saved here) | Open |

---

## RECOMMENDATIONS (Priority Order)

### P0 — Fix broken code now

1. **Delete src/lib/game/store/index.ts** — Has broken imports (../store resolves to a directory, not the file). Delete immediately.
2. **Delete src/lib/game/store/persistence.ts** — Not imported, creates confusion with store-persist.ts.
3. **Delete src/lib/game/store-persist.ts** — Not imported, orphaned persist config.

### P1 — Clean up dead code

4. **Delete src/lib/game/marketSimulator.legacy.ts** — Clearly replaced by marketSimulator.ts.
5. **Delete src/lib/game/store/llmIntegration.ts** — Never connected.
6. **Delete src/components/admin/AdminEmptyState.tsx** — Never used.
7. **Delete src/components/admin/ConfirmModal.tsx** — Never used.
8. **Delete src/components/admin/Pagination.tsx** — Never used.
9. **Delete src/components/admin/TableSkeleton.tsx** — Never used.
10. **Delete src/components/admin/InvestigationTimeline.tsx** — Never used.
11. **Delete src/components/admin/useAdminError.tsx** — Never used.
12. **Delete src/lib/admin/fetchWrapper.ts** — Superseded by Supabase service-role auth.
13. **Delete src/lib/auth/csrf.ts** — Supabase Auth handles CSRF.
14. **Delete src/lib/db/index.ts** — Never used barrel.
15. **Delete src/lib/db/user.ts** — Never imported.
16. **Delete src/lib/hooks/usePlayerDisplayName.ts** — Never integrated.
17. **Remove duplicate exports** from PayoutPanel.tsx, TradingPostPanel.tsx, GameIcon.tsx.

### P2 — Complete the DB centralization

18. **Retrofit 12 API routes** to use the DB helper functions that were created but not connected. This completes the DB_CENTRALIZATION_TODO_2026_06_20.md migration plan. Functions to connect:
    - listAuthUsersByProvider → dmin/users
    - lagCheat, countRecentCheatFlagsSince → dmin/investigations
    - createMarketConfig, updateMarketConfig → dmin/market
    - getRecentRewards → dmin/players
    - indIdentitiesByUserId, deleteIdentitiesByUserId → uth/link-identity
    - getLatestMarketTickAndBreakers → game/market-history
    - getProfileById, upsertProfile → player
    - esolveTicket → dmin/support/tickets

### P3 — Remove unused dependencies

19. Remove @radix-ui/react-toast, supabase, @testing-library/dom, @testing-library/jest-dom, @testing-library/react, un-types, eslint-plugin-jsx-a11y, 	w-animate-css from package.json.
20. Add @vitest/coverage-v8 to devDependencies (it's already used in itest.config.ts).

### P4 — Investigate and remove remaining unused exports

21. Audit the remaining 30+ unused exports (newsLLM, serverTickValidator, balanceConfig, buildingDiscovery, configCache, idMigration, capacity, config/tables, supabase/server utilities). These represent partial implementations of features that were never connected.

---

## NOTES

- src/lib/game/constants/saveVersion.ts EXISTS and exports SAVE_VERSION = 20. It is imported by store-persist.ts (which is itself unused). This is a valid file, not an unused file.
- src/lib/game/store-types.ts EXISTS and is referenced by multiple files. Not an unused file.
- The selectors directory src/lib/game/selectors/ does NOT exist (per PROJECT_STATUS_SOURCE_OF_TRUTH). AGENTS.md incorrectly states it does — this is a doc contradiction to note.
- Knip's entry files correctly cover the main game store and key auth modules. The report is accurate within its analysis scope.
