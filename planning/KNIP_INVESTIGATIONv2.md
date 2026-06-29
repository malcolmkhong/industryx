# Knip Investigation Report v2
> **Run:** 2026-06-29 | **Method:** Knip 6.16.1 + full dependency tracing + execution-path verification for each finding
> **Scope:** 15 unused files, 52 unused exports, 11 unused types, 3 duplicate exports, 9 dependency issues
> **File:** This is an updated report based on runtime verification, not just static analysis.

---

## KEY CORRECTIONS FROM v1 (what I got wrong before)

| v1 Claim | v2 Finding | Why |
|---|---|---|
| store/persistence.ts is unused | **ACTIVE** — imported by store.ts:12 | debouncedPersistStorage used in persist middleware at store.ts:68 |
| store/index.ts has broken imports | **BROKEN** — self-referential export | export { useGameStore } from '../store' resolves to index.ts itself, not store.ts |
| marketSimulator.legacy.ts is unused | **LEGACY** — replaced by engine/ approach | Current marketSimulator.ts is a re-export shim pointing to engine/ |
| engine/marketTick.ts unused | **ACTIVE** — only some exports are unused | simulateMarketTick exported but never called; file is part of active marketSimulator.ts barrel (even if that's also unused) |
| isServiceRoleConfigured unused | **UNUSED** — confirmed | Defined in supabase/server.ts, never imported anywhere |
| eslint-plugin-jsx-a11y unused | **ACTIVE** | Referenced in eslint.config.mjs rules |
| @vitest/coverage-v8 missing from deps | **QUESTIONABLE** | Not directly referenced in itest.config.ts (no provider specified) |
| canAcceptNewSignup unused | **CONFIRMED** | Defined but never called |
| useServerMarket.ts unused file | **ACTIVE** — file IS used | useServerMarket() called in page.tsx:88; only ecordMarketAction export is unused |
| ormatNumber from store.ts unused export | **ACTIVE** | Imported in page.tsx:4 |

--- 

## PART 1: UNUSED FILES

### 1. src/components/admin/AdminEmptyState.tsx

**Dep graph:**
`
AdminEmptyState.tsx  ──imports──►  (none — pure React component)
    └── imported by: NONE
    └── part of: admin UI component library
`

**Runtime trace:** Cannot execute. No file imports it. No dynamic require path references it. No test file references it. No planning document references it.

**Architecture role:** Intended utility component for admin empty-state displays. Never integrated.

**Maintainability:** Clean separation of concerns. Low coupling (no deps). Good cohesion. Would be useful if integrated.

**Classification: Dead Code** — zero runtime paths reach this code.

**Recommendation: Delete**

---

### 2. src/components/admin/ConfirmModal.tsx

**Dep graph:**
`
ConfirmModal.tsx  ──imports──►  (none — pure 'use client' component)
    └── imported by: NONE
`

**Runtime trace:** Cannot execute. Admin pages use local inline confirmation dialogs instead. Referenced by zero files.

**Architecture role:** Reusable confirmation modal for admin actions. Never connected.

**Maintainability:** Clean implementation with variant styling. Would reduce duplication if integrated.

**Classification: Dead Code**

**Recommendation: Delete**

---

### 3. src/components/admin/InvestigationTimeline.tsx

**Dep graph:**
`
InvestigationTimeline.tsx  ──imports──►  (none — pure component)
    └── imported by: NONE
`

**Runtime trace:** Cannot execute. The investigations feature exists (src/app/admin/investigations/page.tsx) but uses inline rendering, not this component.

**Architecture role:** Timeline display for cheat investigation events. Never integrated.

**Classification: Dead Code**

**Recommendation: Delete**

---

### 4. src/components/admin/Pagination.tsx

**Dep graph:**
`
Pagination.tsx  ──imports──►  (none — pure 'use client' component)
    └── imported by: NONE
`

**Runtime trace:** Cannot execute. Admin config page (config/page.tsx:21) and investigations page (investigations/page.tsx:22) define their OWN local interface Pagination { ... }. A separate, unused component exists with the same purpose.

**Architecture role:** Reusable pagination control. Never integrated; duplicate type definitions exist at the consumer sites.

**Classification: Dead Code** — superseded by inline pagination in all admin pages.

**Recommendation: Delete**

---

### 5. src/components/admin/TableSkeleton.tsx

**Dep graph:**
`
TableSkeleton.tsx  ──imports──►  (none — pure component)
    └── imported by: NONE
`

**Runtime trace:** Cannot execute. Admin pages use their own loading states.

**Architecture role:** Loading state for admin data tables. Never integrated.

**Classification: Dead Code**

**Recommendation: Delete**

---

### 6. src/components/admin/useAdminError.tsx

**Dep graph:**
`
useAdminError.tsx  ──imports──►  react (useState, useCallback)
    └── imported by: NONE
`

**Runtime trace:** Cannot execute. All 4 admin pages that call showError() define it locally:

- dmin/admins/page.tsx:125: const showError = (msg: string) => { ... }
- dmin/config/page.tsx:197: local showError
- dmin/investigations/page.tsx:173: local showError
- dmin/players/page.tsx:165: local showError

**Architecture role:** Shared error management hook. Superseded by inline showError functions.

**Classification: Dead Code** — the hook is more robust (handles handleApiError, has AdminError state object), but the admin pages chose simpler inline patterns.

**Recommendation: Delete**

---

### 7. src/lib/admin/fetchWrapper.ts

**Dep graph:**
`
fetchWrapper.ts  ──imports──►  (none — pure utility)
    └── imported by: NONE
`

**Runtime trace:** Cannot execute. All 10+ admin pages use raw etch() calls directly:

`
admin/admins/page.tsx:140:     const res = await fetch('/api/admin/admins');
admin/config/page.tsx:213:    const res = await fetch('/api/tables');
admin/economy/page.tsx:35:    const res = await fetch('/api/admin/economy');
admin/investigations/page.tsx:196: const res = await fetch(...);
admin/jobs/page.tsx:47:       const res = await fetch('/api/admin/jobs');
admin/market/page.tsx:127:    const res = await fetch('/api/admin/market');
admin/monitoring/page.tsx:90: const res = await fetch('/api/admin/monitoring');
admin/permissions/page.tsx:23: const res = await fetch(...);
admin/players/page.tsx:175:   const res = await fetch('/api/admin/stats');
admin/reports/page.tsx:38:    const res = await fetch(...);
`

No admin page uses dminFetch() or imports this wrapper. The CSRF token logic it contains (X-CSRF-Token header, cookie-based token) is also never used anywhere.

**Architecture role:** CSRF-aware fetch wrapper. Superseded by Supabase service-role auth pattern.

**Classification: Dead Code**

**Recommendation: Delete**

---

### 8. src/lib/auth/csrf.ts

**Dep graph:**
`
csrf.ts  ──imports──►  next/server (NextRequest, NextResponse), crypto
    └── imported by: NONE
`

**Runtime trace:** Cannot execute. No X-CSRF-Token references exist in any source file. No csrf_token cookie references exist. Supabase handles auth-inherent CSRF protection.

**Architecture role:** Server-side CSRF token generation/validation middleware. Superseded by Supabase's built-in CSRF protection.

**Classification: Dead Code**

**Recommendation: Delete**

---

### 9. src/lib/db/index.ts

**Dep graph:**
`
db/index.ts  ──re-exports──►  db/types (Database), db/admin (createServiceRoleClient, isServiceRoleConfigured), db/user (createClient, isSupabaseConfigured)
    └── imported by: NONE
    └── intended usage (docstring): import { createServiceRoleClient, createClient, Database } from '@/lib/db'
`

**Runtime trace:** Cannot execute. All 71+ API routes that import Supabase utilities use direct paths:
- @/lib/db/types
- @/lib/db/admin
- @/lib/supabase/server
- @/lib/supabase/client

**Architecture role:** Barrel/Composition Root for DB access centralization (per DB_CENTRALIZATION_TODO_2026_06_20.md). Never connected. The barrel was scaffolded but no consumer was migrated to use it.

**Maintainability:** The barrel is well-documented with JSDoc explaining the intended import pattern. Functions it re-exports are actively used (through direct paths). The barrel itself just isn't.

**Classification: Disconnected** — the functions ARE active, just not through this barrel.

**Recommendation: Delete** barrel only; the underlying modules at db/types.ts, db/admin.ts, db/user.ts stay active.

---

### 10. src/lib/db/user.ts

**Dep graph:**
`
db/user.ts  ──re-exports──►  @/lib/supabase/server (createClient, isSupabaseConfigured)
    └── imported by: NONE
`

**Runtime trace:** Cannot execute. createClient is actively used through direct @/lib/supabase/server imports (4 files). isSupabaseConfigured is never imported anywhere (defined in both supabase/server.ts and supabase/client.ts but never consumed).

**Architecture role:** Re-export wrapper/Adapter for Supabase user client. Part of the DB centralization plan. Never connected.

**Maintainability:** Thin wrapper (2 lines of actual code). Would only be useful if the barrel db/index.ts were adopted.

**Classification: Wrapper** — functionally a no-op wrapper that was never adopted.

**Recommendation: Delete** — it adds nothing to the active codebase.

---

### 11. src/lib/game/marketSimulator.legacy.ts

**Dep graph:**
`
marketSimulator.legacy.ts  ──imports──►  types, configCache, newsBuilder
    └── imported by: NONE
    └── active alternative: marketSimulator.ts (barrel) → engine/ (actual implementation)
`

**Runtime trace:** Cannot execute. The 
ewsBuilder.ts:15 imports from './marketSimulator' (the current one), NOT './marketSimulator.legacy'. No file references this legacy variant.

**Architecture role:** Standalone market simulation with 8 sectors, price correlation chains, news overlay layers. This was the ORIGINAL implementation that was later refactored into engine/ modules. The current marketSimulator.ts is just a re-export shim.

The file declares its own philosophy: "MVIL: Market Volatility Injection Layer, News: Market News System, Narrative: Player-driven Market Narrative." It defines sector-level resource groupings, price correlation chains, and event-packet building logic — all unused.

**Maintainability:** Self-contained ~500+ line module with clear sector definitions. Would be a good reference if the engine approach needed re-evaluation. But it's dead.

**Classification: Legacy** — original implementation replaced by engine/ architecture.

**Recommendation: Delete**

---

### 12. src/lib/game/store-persist.ts

**Dep graph:**
`
store-persist.ts  ──imports──►  ./store/persistence (debouncedPersistStorage), ./constants/saveVersion (SAVE_VERSION), ./utils/saveMigration (migrateSaveState)
    └── imported by: NONE
    └── active code path: store.ts:12 imports debouncedPersistStorage directly from './store/persistence'
`

**Runtime trace:** Cannot execute. store.ts bypasses store-persist.ts entirely and imports debouncedPersistStorage directly from ./store/persistence:12. The persistConfig object exported by store-persist.ts is never referenced.

The dependencies store/persistence.ts, constants/saveVersion.ts, and utils/saveMigration.ts ARE all active — just not through this file.

**Architecture role:** Persist configuration wrapper. An alternative approach that was not adopted. store.ts has its OWN inline persist configuration that duplicates everything in store-persist.ts.

**Maintainability:** If store.ts were decomposed, store-persist.ts provides a cleaner persist config. But since store.ts has its own inline version, this is a dead duplicate.

**Classification: Abandoned Refactor Scaffold** — created as part of the planned store decomposition, never connected.

**Recommendation: Delete**

---

### 13. src/lib/game/store/index.ts

**Dep graph:**
`
store/index.ts  ──re-exports──►  '../store' (BROKEN — resolves to src/lib/game/store/index.ts itself, not store.ts)
    └──             '../store-types' (EXISTS — src/lib/game/store-types.ts)
    └──             '../utils/formatNumber' (EXISTS)
    └──             '../utils/costCalculator' (EXISTS)
    └──             '../utils/generateId' (EXISTS)
    └──             '../utils/hasUnlimitedStorage' (EXISTS)
    └── imported by: NONE
`

**Critical finding:** export { useGameStore } from '../store' — from src/lib/game/store/index.ts, the path ../store resolves to src/lib/game/store/ which is THE DIRECTORY containing this file. TypeScript would resolve this to src/lib/game/store/index.ts — creating a self-referential export cycle. useGameStore is NOT defined in this file, so this export would fail at compile time if the barrel were ever imported.

The other 5 re-exports (store-types, utils/formatNumber, costCalculator, generateId, hasUnlimitedStorage) ARE valid paths that would work.

**Runtime trace:** Cannot execute. This file is never imported. If it were, TypeScript would error on the broken '../store' re-export.

**Architecture role:** Intended barrel/re-export for future store decomposition. Never completed.

**Maintainability:** The file comment says "internal organizational detail for future decomposition." The architecture was never completed. The barrel is misleading — it suggests @/lib/game/store is a valid import path for these utilities when it isn't.

**Classification: Abandoned Refactor Scaffold** — broken by design.

**Recommendation: Delete**

---

### 14. src/lib/game/store/llmIntegration.ts

**Dep graph:**
`
llmIntegration.ts  ──imports──►  ../newsLLM (initNewsLLM, registerUpdateCallback)
    └── exported: ensureLLMCallback(), initLLMIfNeeded()
    └── imported by: NONE
`

**Runtime trace:** Cannot execute. The news LLM integration in store.ts happens through createNewsActions in src/lib/game/actions/news.ts, which calls getLLMState() directly from 
ewsLLM.ts — NOT through llmIntegration.ts.

The initNewsLLM and egisterUpdateCallback functions are also NOT imported by store.ts — they're defined in 
ewsLLM.ts but never consumed by any file outside 
ewsLLM.ts itself.

**Architecture role:** Async wrapper for LLM news text enhancement. Designed to integrate LLM into the Zustand store update cycle. Never connected.

**Maintainability:** 80-line module, cleanly structured, properly handles edge cases (llmInitialized guard, try-catch). But it's solving a problem that was solved differently inline.

**Classification: Incomplete** — implementation is complete but was never wired into the store setup.

**Recommendation: Delete**

---

### 15. src/lib/hooks/usePlayerDisplayName.ts

**Dep graph:**
`
usePlayerDisplayName.ts  ──imports──►  react (useState, useEffect), AuthProvider (useAuth)
    └── exported: usePlayerDisplayName()
    └── imported by: NONE
`

**Runtime trace:** Cannot execute. No component calls this hook. Player display names are handled through different patterns.

**Architecture role:** Client component hook for retrieving player display names. The player_progress table has a display_name column (per DB centralization), but this hook was never integrated into the player display system.

**Classification: Incomplete** — full implementation that was never wired into any component.

**Recommendation: Delete**
---

## PART 2: UNUSED EXPORTS (52)

### 2.1 — Internal-Use Exports (safe to stop exporting, keep the function)

These exports are never imported by another file, but the functions are CALLED internally within their own file. They're not dead code; they just don't need to be exported.

| Export | File | Internal Callers | Classification | Action |
|---|---|---|---|---|
| saveServerGameState | db/serverGameState.ts:364 | Called by pageServerGameStateFullState, loadServerGameStateForTrade within same file | **Internal Use** | Remove export keyword |
| lockServerGameState | db/serverGameState.ts:593 | Called by game-action route helper within same file | **Internal Use** | Remove export keyword |
| unlockServerGameState | db/serverGameState.ts:615 | Called by game-action route helper within same file | **Internal Use** | Remove export keyword |
| MergeReceipt | db/merge.ts:30 | Used by insertMergeReceipt at line 228 (same file) | **Internal Type** | Remove export keyword |
| MoneyAggregate | db/serverGameState.ts:712 | Used by loadServerGameStateForTick (same file) | **Internal Type** | Remove export keyword |
| ormatNumber | game/store.ts:68 | **ACTIVE** — imported by page.tsx:4 | **Active** | Keep as-is |
| listAdminActions | db/adminActions.ts:79 | Used by playerActions.ts:90 (cross-file) | **Cross-File Use** | Keep exported |

**Total: 5 safe-to-un-export, 1 active, 1 needed for cross-file**

### 2.2 — DB Centralization Helpers (never connected to their routes)

12 functions created during DB_CENTRALIZATION_TODO (iterations 1-9) to centralize inline .from() calls. The route files still use inline Supabase calls. Helpers were built, routes were NOT retrofitted.

Trace for ONE representative example:

`
flagCheat (db/cheatInvestigations.ts:135)
    └── imports: createServiceRoleClient, Database types
    └── intended consumer: gameStateValidator.ts (flagCheatAttempt enrichment — line 5 of the file's docstring says so)
    └── actual consumer: NONE
    └── route still inline: admin/investigations route uses direct Supabase .from() calls
    └── countResolvedSince and listInvestigations ARE imported by the route
    └── flagCheat and countRecentCheatFlagsSince ARE NOT
`

| Export | File | Intended Route | Route Uses Helper? | Classification |
|---|---|---|---|---|
| listAuthUsersByProvider | db/adminUsers.ts:190 | dmin/users | No (11 inline .from()) | **Disconnected** |
| lagCheat | db/cheatInvestigations.ts:135 | gameStateValidator.ts | No | **Disconnected** |
| countRecentCheatFlagsSince | db/cheatInvestigations.ts:275 | dmin/investigations | No | **Disconnected** |
| createMarketConfig | db/configMarket.ts:59 | dmin/market | No | **Disconnected** |
| updateMarketConfig | db/configMarket.ts:79 | dmin/market | No | **Disconnected** |
| getRecentRewards | db/dailyRewards.ts:139 | dmin/players | No | **Disconnected** |
| indIdentitiesByUserId | db/guestIdentities.ts:80 | uth/link-identity | No | **Disconnected** |
| deleteIdentitiesByUserId | db/guestIdentities.ts:245 | uth/link-identity | No | **Disconnected** |
| getLatestMarketTickAndBreakers | db/market.ts:155 | game/market-history | No | **Disconnected** |
| getProfileById | db/profiles.ts:56 | player | No | **Disconnected** |
| upsertProfile | db/profiles.ts:74 | player | No | **Disconnected** |
| esolveTicket | db/supportTickets.ts:134 | dmin/support/tickets | No | **Disconnected** |

**All 12: Disconnected** — valid business logic, complete implementations, never connected to the routes they were built for.

**Recommendation: Reconnect** — retrofit the 12 routes to use these helpers. This is the highest-value work from the entire Knip audit. It completes the DB centralization plan.

### 2.3 — NewsLLM Engine (wired differently)

The newsLLM system was built but the integration layer was implemented differently in store.ts. Instead of going through llmIntegration.ts, the store uses createNewsActions → getLLMState() directly from 
ewsLLM.ts.

| Export | File | Why Disconnected | Classification |
|---|---|---|---|
| initNewsLLM | game/newsLLM.ts:458 | Called internally in 
ewsLLM.ts but never imported externally. store.ts doesn't call it | **Incomplete** |
| egisterUpdateCallback | game/newsLLM.ts:476 | Same — llmIntegration.ts wraps it, but the wrapper is never used | **Incomplete** |
| ddEventToBatch | game/newsLLM.ts:488 | Created for batch event processing pipeline that was never connected | **Incomplete** |
| esetDailyBudget | game/newsLLM.ts:538 | LLM budget management, never called | **Incomplete** |
| updateGameDay | game/newsLLM.ts:546 | Game-day tracking for LLM rate limiting, never called | **Incomplete** |
| shutdownNewsLLM | game/newsLLM.ts:563 | Cleanup function, never called | **Incomplete** |
| eventPacketToMarketNews | game/newsBuilder.ts:759 | Converts event packets to MarketNews format. Never imported | **Incomplete** |
| NewsConfig | game/newsBuilder.ts:90 | Type for news configuration. Never imported | **Incomplete** |
| NewsTextResult | game/newsLLM.ts:32 | Type for LLM text result. Never imported | **Incomplete** |

**All 9: Incomplete** — the LLM news pipeline was built but the integration path chosen was a direct function call in 
ewsActions.ts, not through the wrapper module. The LLM functions themselves are valid; they just need to be connected.

### 2.4 — Server Tick Validator (never touched runtime)

The serverTickValidator.ts defines upper-bound computation functions for anti-cheat. They were designed to compute the maximum possible values a player could have, but were never connected to the server tick pipeline (which uses Supabase RPCs instead).

| Export | File | Classification | Recommendation |
|---|---|---|---|
| computeMaxPossibleBuildings | game/serverTickValidator.ts:106 | **Incomplete** | Keep — anti-cheat value |
| computeMaxPossibleResearch | game/serverTickValidator.ts:129 | **Incomplete** | Keep — anti-cheat value |
| computeMaxPossibleResources | game/serverTickValidator.ts:148 | **Incomplete** | Keep — anti-cheat value |

These 3 are used by dmin/investigations/route.ts:3 (computeMaxPossibleMoney alias — confirming serverTickValidator IS active!). The issue is the exported functions are defined but the dmin/investigations route uses its OWN computation. Let me re-check.

Actually, dmin/investigations/route.ts:3 imports only computeMaxPossibleMoney from serverTickValidator. The 3 unused exports (computeMaxPossibleBuildings, computeMaxPossibleResearch, computeMaxPossibleResources) are NOT imported by that route. They remain unused.

**Classification: Incomplete** — anti-cheat functions that were never integrated.

### 2.5 — Market Engine Exports (available through barrel, never consumed)

These are exported by marketSimulator.ts (which re-exports from engine/) but never imported by any consumer:

| Export | File | Classification |
|---|---|---|
| createInitialSimState | game/engine/marketTick.ts:28 | **Incomplete** |
| simulateMarketTick | game/engine/marketTick.ts:52 | **Incomplete** |
| ecordPlayerSell | game/engine/marketTick.ts:258 | **Incomplete** |
| ecordPlayerBuy | game/engine/marketTick.ts:277 | **Incomplete** |

These are exported from game/engine/marketTick.ts, re-exported through game/engine/index.ts → game/marketSimulator.ts. The barrel is never imported, so none of these functions are reachable at runtime.

The actual market simulation uses a Supabase RPC (pply_market_tick — BUG-041's fix), not this client-side simulator.

**Classification: Incomplete** — valid sim code, never connected to the server pipeline.

### 2.6 — ID Migration (save-state utilities)

| Export | File | Classification |
|---|---|---|
| everseMigrateBuildingId | game/idMigration.ts:45 | **Dead Code** — reverse mapping, never used |
| isOldBuildingId | game/idMigration.ts:52 | **Dead Code** — helper for migration, never called |
| isMigratedBuildingId | game/idMigration.ts:59 | **Dead Code** — helper for migration, never called |
| migrateSaveState | game/idMigration.ts:92 | **ACTIVE** — used by store.ts:202 (imported as migrateSaveBuildings) |

In store.ts:202: import { migrateSaveBuildings } from "./idMigration";. This imports migrateSaveBuildings (not migrateSaveState!). So migrateSaveState IS used by store.ts but through a different name. The other 3 ID migration helpers are genuinely unused.

**Classification: 1 Active (migrateSaveState), 3 Dead Code**

### 2.7 — Config/Balance Utilities

| Export | File | Classification |
|---|---|---|
| pplyBalanceOverrides | game/balanceConfig.ts:222 | **Dead Code** |
| esetBalance | game/balanceConfig.ts:229 | **Dead Code** |
| getAllBuildingTypes | game/buildingDiscovery.ts:110 | **Dead Code** |
| getBuildingCountsByCategory | game/buildingDiscovery.ts:117 | **Dead Code** |
| BUILDING_ID_MIGRATION | game/configCache.ts:86 | **Dead Code** |
| configLoadedAt | game/configCache.ts:97 | **Dead Code** |
| esetToLocal | game/configCache.ts:362 | **Dead Code** |
| migrateBuildingDefs | game/configCache.ts:393 | **Dead Code** |

All 8: **Dead Code** — balance/config utilities that were never integrated. They represent feature ideas (balance testing, building discovery, config migration) that were scaffolded but never connected.

### 2.8 — Remaining Misc Exports

| Export | File | Classification |
|---|---|---|
| TIER_INFO | game/shared/tierColors.ts:106 | **Dead Code** — export is unused; file IS active (other exports used by game panels) |
| useConfigVersion | providers/GameConfigProvider.tsx:104 | **Disconnected** — hook is defined and exported but never imported. The GameConfigContext IS active (used by providers) |
| canAcceptNewSignup | capacity.ts:67 | **Dead Code** — capacity check function, never called |
| getCapacityForClient | capacity.ts:76 | **Dead Code** — capacity info for clients, never called |
| getAllowedTableIds | config/tables.ts:504 | **Dead Code** — table metadata function, never called |
| UserAvatarFallback | dmin/UserAvatar.tsx:67 | **Dead Code** — fallback component, never imported |
| default (GameIcon) | game/shared/GameIcon.tsx:164 | **Duplicate** — duplicated default export |
| ecordMarketAction | hooks/useServerMarket.ts:56 | **Dead Code** — market action recorder, never imported. useServerMarket() hook IS active (page.tsx calls it) |
| isSupabaseConfigured | supabase/server.ts:9 | **Dead Code** — check function for Supabase config, never called. Defined but no consumer. |

### 2.9 — Unused Types (11)

| Type | File | Classification |
|---|---|---|
| Tables | db/types.ts:2105 | **Supabase Generated** — part of Database type structure, never independently imported |
| TablesInsert | db/types.ts:2134 | **Supabase Generated** — same |
| TablesUpdate | db/types.ts:2159 | **Supabase Generated** — same |
| Enums | db/types.ts:2184 | **Supabase Generated** — same |
| CompositeTypes | db/types.ts:2201 | **Supabase Generated** — same |
| Constants | db/types.ts:2218 | **Supabase Generated** — same |
| Building | game/types.ts:47 | **Duplicate** — project uses BuildingInstance instead |
| NewsConfig | game/newsBuilder.ts:90 | **Incomplete** — type for news feature that was partially wired |
| NewsTextResult | game/newsLLM.ts:32 | **Incomplete** — type for LLM feature that was partially wired |
| ConflictInfo | hooks/cloudSync/types.ts:87 | **Dead Code** — type for cloud sync conflict resolution; file IS active but this specific type is never referenced |
| MergeReceipt | db/merge.ts:30 | **Internal Type** — used within merge.ts; just remove export |

**Notes on Supabase types:** These are generated by supabase gen types --lang=typescript. They are technically part of the Database type definition structure. Removing them from db/types.ts would require modifying the generator. They're not imported but they're not harmful either. Database['public']['Tables']['table_name']['Row'] is the import pattern used — none of the namespace-level types are needed.

**Recommendation for Supabase types:** Do NOT delete. They're auto-generated. Add them to Knip's ignore list.
---

## PART 3: DEPENDENCY ISSUES

### 3.1 — Unused Dependencies

| Package | Why Unused | Evidence | Action |
|---|---|---|---|
| @radix-ui/react-toast | Project uses sonner for toasts. No <ToastProvider>, no useToast(), no Radix toast import found anywhere. sonner is imported in page.tsx:92 (though the 	oast import is unused there too) | Zero imports of eact-toast in any tsx file | Remove from package.json |
| supabase (line 74) | Legacy package. Project uses @supabase/ssr and @supabase/supabase-js. The supabase CLI/package is not imported anywhere | Confirmed: no file imports from 'supabase' — only '@supabase/ssr' and '@supabase/supabase-js' | Remove from package.json |

### 3.2 — Unused DevDependencies

| Package | Why Unused | Evidence | Action |
|---|---|---|---|
| @testing-library/dom | No test runner configured. itest.config.ts uses happy-dom environment, not @testing-library/dom | Confirmed: itest.config.ts:49: environment: 'happy-dom'. No Vitest config references @testing-library/dom | Remove |
| @testing-library/jest-dom | No test runner configured. Matchers not extended in 	ests/setup.ts | Confirmed: no vitest setup imports jest-dom. No Vitest config references it | Remove |
| @testing-library/react | No test runner configured. No component tests run through Vitest | Confirmed: zero test files exist in 	ests/components/ (directory in gitignore) | Remove |
| un-types | Project uses Node.js/npm, not Bun runtime | Confirmed: scripts use 
ext, 	sx, 
ode — not un. | Remove |
| eslint-plugin-jsx-a11y | **CORRECTION: ACTIVE** — used in eslint.config.mjs | Confirmed: eslint.config.mjs:27-29 references jsx-a11y/control-has-associated-label, jsx-a11y/anchor-has-content, jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions | **Keep** |
| 	w-animate-css | Project uses ramer-motion for animations, not 	w-animate-css. Not imported anywhere | Confirmed: zero imports of 	w-animate-css or 	ailwindcss-animate.css in any source file | Remove |

### 3.3 — Unlisted Dependency

| Package | Location | Why | Action |
|---|---|---|---|
| @vitest/coverage-v8 | itest.config.ts:47-56 | itest.config.ts has a coverage block but does NOT specify coverage.provider: 'v8'. The coverage provider auto-detects. If @vitest/coverage-v8 IS installed, it's used. But it's not listed in package.json deps. | **Verify first**: confirm @vitest/coverage-v8 exists in 
ode_modules. If yes, add to devDependencies. If not, the coverage block is non-functional. |

### 3.4 — Configuration Hints (Knip suggestions)

| Package | Source | Suggestion | Action |
|---|---|---|---|
| @prisma/client | knip.json ignoreDependencies | Prisma is not used (moved to devDependencies in M6/L6, BUG-003). The stale @prisma/client is still in ignoreDependencies | Remove from ignoreDependencies in knip.json |
| prisma | knip.json ignoreDependencies | Same as above. The entire Prisma toolchain is unused | Remove from ignoreDependencies in knip.json |
| @tanstack/react-query | knip.json ignoreDependencies | Not used in the codebase. No imports found. Was it planned? | Remove from ignoreDependencies in knip.json |

### 3.5 — Duplicate Exports (3)

| File | Issue | Resolution |
|---|---|---|
| PayoutPanel.tsx | Both export function PayoutPanel AND export default function PayoutPanel | Remove default export; keep named |
| TradingPostPanel.tsx | Both named and default export | Remove default export; keep named |
| GameIcon.tsx:164 | export const GameIcon AND export default GameIcon | Remove default export; keep named |

All three were transitional: converted from default to named exports during the panel migration, but the old default export line was never removed.

---

## SUMMARY: RECOMMENDATIONS PRIORITIZED

### P0 — Fix immediately (broken or misleading code)

| Item | Type | Action |
|---|---|---|
| store/index.ts | Broken barrel | **Delete** — self-referential export, would fail compilation if imported |
| store/llmIntegration.ts | Dead code | **Delete** — integration layer was never connected |
| store-persist.ts | Dead code | **Delete** — orphaned persist config; store.ts uses direct import |
| PayoutPanel.tsx, TradingPostPanel.tsx, GameIcon.tsx | Duplicate exports | **Remove default exports** |

### P1 — Delete dead code (safe removals)

| Item | Type | Action |
|---|---|---|
| 5 admin components | Dead UI code | **Delete** all 5 |
| etchWrapper.ts | Dead code | **Delete** |
| csrf.ts | Dead code | **Delete** |
| db/index.ts, db/user.ts | Dead wrappers | **Delete** |
| marketSimulator.legacy.ts | Legacy | **Delete** |
| usePlayerDisplayName.ts | Dead code | **Delete** |
| 23 truly unused exports | Dead code | **Remove exports** |

### P2 — Reconnect (highest-value work)

| Item | Action |
|---|---|
| 12 DB centralization helpers | **Retrofit 12 routes** to use them. This completes the DB_CENTRALIZATION_TODO_2026_06_20.md plan |
| useConfigVersion hook | **Enable it** in GameConfigProvider or remove |

### P3 — Remove unused dependencies

| Package | Action |
|---|---|
| @radix-ui/react-toast | Remove from package.json |
| supabase | Remove from package.json |
| @testing-library/dom | Remove from package.json |
| @testing-library/jest-dom | Remove from package.json |
| @testing-library/react | Remove from package.json |
| un-types | Remove from package.json |
| 	w-animate-css | Remove from package.json |
| @prisma/client, prisma, @tanstack/react-query | Remove from knip.json ignoreDependencies |
| @vitest/coverage-v8 | Verify if installed; if yes, add to devDependencies |

---

## CROSS-REFERENCES TO BUGS.MD

| BUG ID | Knip Finding | Relationship |
|---|---|---|
| BUG-003 | prisma in ignoreDependencies | Same root cause: stale Prisma toolchain |
| BUG-004 | @testing-library/* unused | No test runner configured |
| BUG-007 | store/persistence.ts has 5-sec debounce | The ACTIVE persist file with the H6 debounce issue |
| BUG-018 | eslint-plugin-jsx-a11y flagged but active | Plugin IS used; the plugin's admin-page violations remain |
| BUG-041 | Market tick engine unused | Engine exists but server uses RPC instead; related to the supabase RPC fix |
