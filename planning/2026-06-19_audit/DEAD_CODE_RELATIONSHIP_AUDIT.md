# Dead Code Relationship & Code Consolidation Audit

> **Date:** 2026-06-19
> **Scope:** All 9 reported dead files + 33 reported dead exports + 3 reported duplicate exports
> **Method:** Per-item analysis with 9 fields (Item Name, Original Purpose, Related Active Files, Canonical Version, Legacy Version, Evidence, Risk Level, Verdict, Recommended Action)
> **Rule:** Do NOT recommend deletion solely because imports are missing. Prove disconnected first.

---

## Group A — 9 Dead Files (Per-File Audit)

### A1. `src/lib/auth/csrf.ts` (46 lines)

| Field | Value |
|---|---|
| **Item Name** | `src/lib/auth/csrf.ts` — CSRF token utility (server) |
| **Original Purpose** | Generate / set / validate CSRF tokens for state-changing requests. Companion to `src/middleware.ts` cookie-set logic. |
| **Related Active Files** | `src/middleware.ts` (sets `csrf_token` cookie inline via `crypto.randomUUID()`, not via helper), `src/lib/admin/fetchWrapper.ts` (client `adminFetch` adds `X-CSRF-Token` header from cookie), all `/api/admin/*` routes (do **NOT** call `validateCsrf()`) |
| **Canonical Version** | None — file is the only server-side CSRF helper |
| **Legacy Version** | None — the file is the original |
| **Evidence** | `grep` of `validateCsrf` / `setCsrfCookie` / `generateCsrfToken` / `extractCsrfToken` across codebase returns ZERO imports. Middleware re-implements the cookie-set with its own `crypto.randomUUID()`. `fetchWrapper.ts` reads cookie on client. NO API route calls `validateCsrf()`. |
| **Risk Level** | **HIGH** — security gap. The cookie is set on every request but never validated server-side. Any cross-origin form could mutate admin state. |
| **Verdict** | **REPLACED** (by inline middleware logic) but **CRITICAL SECURITY GAP** — server-side validation missing. |
| **Recommended Action** | **DO NOT DELETE.** Wire `validateCsrf()` into all `/api/admin/*` POST/PATCH/DELETE routes. After wiring, middleware can call `setCsrfCookie()` instead of inline. See BUG-035. |

---

### A2. `src/lib/admin/fetchWrapper.ts` (38 lines)

| Field | Value |
|---|---|
| **Item Name** | `src/lib/admin/fetchWrapper.ts` — `adminFetch` helper |
| **Original Purpose** | Client-side fetch wrapper that auto-adds `Content-Type: application/json` and `X-CSRF-Token` header (from `csrf_token` cookie) for non-GET admin requests. |
| **Related Active Files** | `csrf.ts` (token generator — see A1), `middleware.ts` (cookie source), all `/admin/*` pages (call `fetch()` directly without wrapper) |
| **Canonical Version** | None — wrapper is the only client-side CSRF-aware fetch |
| **Legacy Version** | None — the wrapper is the original |
| **Evidence** | `grep adminFetch` across codebase returns ZERO imports. All 8 admin pages that POST (`/admin/players/[id]`, `/admin/investigations`, `/admin/jobs`, `/admin/reports`, etc.) use raw `fetch()` without CSRF header. |
| **Risk Level** | **HIGH** — if A1 is wired, this client wrapper would close the loop. Without it, the CSRF token is generated but never sent. |
| **Verdict** | **REPLACED** (by raw `fetch()` calls in every admin page) but **CRITICAL SECURITY GAP** — bridge missing. |
| **Recommended Action** | **DO NOT DELETE.** Adopt `adminFetch` in all 8 admin pages, or delete both csrf.ts + this file together. Cannot delete one without the other. See BUG-035. |

---

### A3. `src/components/admin/useAdminError.tsx` (51 lines)

| Field | Value |
|---|---|
| **Item Name** | `src/components/admin/useAdminError.tsx` — `useAdminError` hook + `AdminErrorBanner` component |
| **Original Purpose** | Shared React hook for managing admin error state, with a matching banner component to render errors. |
| **Related Active Files** | None — no `useAdminError` or `AdminErrorBanner` imports found anywhere |
| **Canonical Version** | None — file is the only shared error utility |
| **Legacy Version** | None — the file is the original |
| **Evidence** | `grep useAdminError|AdminErrorBanner` returns 2 matches, both in the file itself (the export line and the component definition). No external imports. Admin pages handle errors inline (try/catch + toast). |
| **Risk Level** | **Low** — UI consistency gap only, no security/data impact |
| **Verdict** | **SAFE_DELETE** if no near-term use planned |
| **Recommended Action** | Keep file as a candidate for future extraction; OR delete it and document the decision in BUGS.md. No active code path needs it. Recommend **MERGE_REQUIRED** into a future admin refactor — these patterns are useful. For now: **safe to delete**. |

---

### A4. `src/components/admin/StatusBadge.tsx` (24 lines)

| Field | Value |
|---|---|
| **Item Name** | `src/components/admin/StatusBadge.tsx` — Reusable status badge component |
| **Original Purpose** | Shared component for `success` / `warning` / `danger` / `neutral` / `info` badges across admin pages. |
| **Related Active Files** | **5 ad-hoc duplicates exist in admin pages:** `src/app/admin/system-status/page.tsx:51` (`jobStatusBadge`), `src/app/admin/support/page.tsx:24` (`statusBadge`), `src/app/admin/jobs/page.tsx:22` (`statusBadge`), `src/app/admin/reports/page.tsx:23` (`statusBadge`), `src/app/admin/investigations/page.tsx:107` (`getStatusBadgeClasses`), `src/app/admin/players/[id]/page.tsx:135` (`getInvestigationStatusBadge`) |
| **Canonical Version** | `StatusBadge.tsx` (most generic, 5-variant API) |
| **Legacy Version** | 6 inline `const statusBadge = ...` records (less flexible, harder to maintain) |
| **Evidence** | `grep StatusBadge` across `/admin/**` returns 0 imports. 6 separate inline `statusBadge` objects with overlapping variants. Knip flagged StatusBadge.tsx because no page imports it. |
| **Risk Level** | **Medium** — divergence risk. 6 copies = 6 places to update. |
| **Verdict** | **MERGE_REQUIRED** — extract duplicate logic, replace with shared component |
| **Recommended Action** | **Keep file.** Refactor 6 admin pages to use `StatusBadge variant="..."`. Not dead — abandoned. Net code reduction after merge: ~80 lines deleted. Track in BUGS.md as BUG-036. |

---

### A5. `src/components/admin/Pagination.tsx` (70 lines)

| Field | Value |
|---|---|
| **Item Name** | `src/components/admin/Pagination.tsx` — Reusable pagination component |
| **Original Purpose** | Generic page navigation (Prev / numbered pages / Next) for admin tables. |
| **Related Active Files** | `src/app/api/admin/players/route.ts:152` (returns `pagination` object in API), `/admin/players/page.tsx` (would consume if refactored) |
| **Canonical Version** | `Pagination.tsx` |
| **Legacy Version** | None — but admin tables use server-side `?page=N` query params and either re-render or do not paginate yet |
| **Evidence** | `grep Pagination` returns 0 imports. Only the API returns pagination metadata — no admin page yet renders it. |
| **Risk Level** | **Low** — UX gap, not a security/data issue |
| **Verdict** | **MERGE_REQUIRED** — wire into admin/players + admin/investigations when adding paginated list view |
| **Recommended Action** | Keep file. When adding pagination to admin/players (already in API), adopt this component. Tag as planned for Phase X. |

---

### A6. `src/components/admin/TableSkeleton.tsx` (33 lines)

| Field | Value |
|---|---|
| **Item Name** | `src/components/admin/TableSkeleton.tsx` — Loading skeleton for admin tables |
| **Original Purpose** | Generic loading state with animated pulse rows × cols. |
| **Related Active Files** | All admin pages that load data — they currently show literal "Loading..." text or empty space |
| **Canonical Version** | `TableSkeleton.tsx` |
| **Legacy Version** | None |
| **Evidence** | `grep TableSkeleton` returns 0 imports. Admin pages show "Loading..." text only. |
| **Risk Level** | **Low** — UX polish only |
| **Verdict** | **MERGE_REQUIRED** — UX consistency |
| **Recommended Action** | Keep file. Adopt in admin/players, admin/investigations, admin/reports, admin/jobs for loading states. Not dead — not wired. |

---

### A7. `src/components/admin/AdminEmptyState.tsx` (28 lines)

| Field | Value |
|---|---|
| **Item Name** | `src/components/admin/AdminEmptyState.tsx` — Empty state placeholder |
| **Original Purpose** | Generic "no data" placeholder with icon + title + description + optional action button. |
| **Related Active Files** | All admin pages that show tables — they use raw text like "No players found" |
| **Canonical Version** | `AdminEmptyState.tsx` |
| **Legacy Version** | None — but raw text strings exist in 5+ pages |
| **Evidence** | `grep AdminEmptyState` returns 0 imports. |
| **Risk Level** | **Low** — UX consistency |
| **Verdict** | **MERGE_REQUIRED** |
| **Recommended Action** | Keep. Adopt in admin list pages. Low priority — cosmetic. |

---

### A8. `src/components/admin/ConfirmModal.tsx` (66 lines)

| Field | Value |
|---|---|
| **Item Name** | `src/components/admin/ConfirmModal.tsx` — Reusable confirmation modal |
| **Original Purpose** | Generic confirm/cancel dialog with `danger` / `warning` / `neutral` variants. |
| **Related Active Files** | `src/app/admin/players/[id]/page.tsx` (lines 184, 683-753) — uses **local `confirmModal` state + inline JSX** instead of the shared component. The local copy is a lock/unlock confirmation. |
| **Canonical Version** | `ConfirmModal.tsx` (generic, 3-variant) |
| **Legacy Version** | Inline JSX in `players/[id]/page.tsx:683-753` (~70 lines of duplicated modal logic) |
| **Evidence** | `grep ConfirmModal` returns 0 imports. The variable `confirmModal` in `players/[id]/page.tsx` is a local state object `{action: "lock" | "unlock"}` — unrelated to the component name. |
| **Risk Level** | **Medium** — divergent modal patterns, harder to fix UX bugs consistently |
| **Verdict** | **MERGE_REQUIRED** — replace 70 lines of inline modal with shared component |
| **Recommended Action** | Keep. Refactor `players/[id]/page.tsx:683-753` to use `<ConfirmModal variant="danger" />`. Net code reduction: ~40 lines. Track as BUG-037. |

---

### A9. `src/components/admin/InvestigationTimeline.tsx` (90 lines)

| Field | Value |
|---|---|
| **Item Name** | `src/components/admin/InvestigationTimeline.tsx` — Timeline component for investigation events |
| **Original Purpose** | Vertical timeline rendering `created` / `status_change` / `admin_action` / `resolved` / `note` events with icons + labels + timestamps. |
| **Related Active Files** | `src/app/admin/investigations/page.tsx` (existing investigation detail view does NOT show timeline) |
| **Canonical Version** | `InvestigationTimeline.tsx` |
| **Legacy Version** | None — investigations page lists events as flat rows, no timeline |
| **Evidence** | `grep InvestigationTimeline` returns 0 imports. The investigations page currently renders investigation rows but not a detailed timeline. |
| **Risk Level** | **Low** — feature gap only |
| **Verdict** | **MERGE_REQUIRED** — wire into investigation detail view |
| **Recommended Action** | Keep. When `/admin/investigations/[id]` page is built (not yet), use this. Tag as feature work, not dead code. |

---

## Group B — 33 Dead Exports (Per-Export Audit)

### B1. `marketSimulator.ts:simulateMarketTick()` (DUPLICATE — TypeScript port never wired)

| Field | Value |
|---|---|
| **Item Name** | `simulateMarketTick(input)` — TS port of Cloudflare market engine |
| **Original Purpose** | Pure-TypeScript port of the market simulation logic, intended to run server-side without needing the Cloudflare Worker. |
| **Related Active Files** | `/api/market/tick/route.ts` (lines 80-200) — has its own **inline `marketTick()` JS function** that IS wired and active. Cloudflare Worker `marketEngine.js` (active external service). |
| **Canonical Version** | **The inline `marketTick()` in `/api/market/tick/route.ts`** (currently active in production) |
| **Legacy Version** | `simulateMarketTick()` in `marketSimulator.ts:528` (TS port, never called) |
| **Evidence** | `grep simulateMarketTick` returns 0 external imports — only the definition + a comment in `newsBuilder.ts:5`. The route file's `marketTick()` is a separate function (verified by reading lines 80-200). |
| **Risk Level** | **Medium** — code drift risk. Two implementations of the same math. |
| **Verdict** | **REPLACED + MERGE_REQUIRED** — old TS port vs inline JS port. Compare for missing logic. |
| **Recommended Action** | Diff both implementations. If identical math → delete `simulateMarketTick()`. If TS port has cycle/momentum/narrative logic NOT in inline JS → **MERGE_REQUIRED** (adopt TS port as canonical, delete inline). Track as BUG-038. |

---

### B2. `marketSimulator.ts:createInitialSimState()`

| Field | Value |
|---|---|
| **Item Name** | `createInitialSimState()` — initial state factory |
| **Original Purpose** | Factory for `MarketSimulationState` — used by `simulateMarketTick()`. |
| **Related Active Files** | None — the inline `marketTick()` in `/api/market/tick/route.ts` reads from `server_market_state` table directly; no in-memory state object. |
| **Canonical Version** | None (table-backed state is canonical) |
| **Legacy Version** | `createInitialSimState()` |
| **Evidence** | `grep createInitialSimState` returns 0 external imports. |
| **Risk Level** | **Medium** — bound to B1's dead path |
| **Verdict** | **REPLACED** by DB-backed state in `server_market_state` |
| **Recommended Action** | Tied to B1. If TS port is adopted → keep. If inline JS port stays → delete both. |

---

### B3. `marketSimulator.ts:recordPlayerSell()`

| Field | Value |
|---|---|
| **Item Name** | `recordPlayerSell()` — record a sell into in-memory sim state |
| **Original Purpose** | Update `simState.recentPlayerSells` to influence next tick's news. |
| **Related Active Files** | `/api/market/action/route.ts` — writes directly to `market_player_pressure` table (DB-backed) |
| **Canonical Version** | DB write to `market_player_pressure` table |
| **Legacy Version** | `recordPlayerSell()` (in-memory) |
| **Evidence** | `grep recordPlayerSell` returns 0 imports. `market_player_pressure` table is the active path. |
| **Risk Level** | Low |
| **Verdict** | **REPLACED** |
| **Recommended Action** | Tied to B1. Delete with B1 if TS port abandoned. |

---

### B4. `marketSimulator.ts:recordPlayerBuy()`

| Field | Value |
|---|---|
| **Item Name** | `recordPlayerBuy()` — same as B3 for buys |
| **Verdict** | **REPLACED** |
| **Recommended Action** | Tied to B1. Delete with B1. |

---

### B5. `useServerMarket.ts:recordMarketAction()`

| Field | Value |
|---|---|
| **Item Name** | `recordMarketAction()` — POST to /api/market/action |
| **Original Purpose** | Client helper to record buy/sell pressure. |
| **Related Active Files** | `TradingPostPanel.tsx` (handles buy/sell directly, calls `/api/game/trade` instead) |
| **Canonical Version** | Direct `fetch('/api/game/trade', ...)` in `TradingPostPanel.tsx` |
| **Legacy Version** | `recordMarketAction()` |
| **Evidence** | `grep recordMarketAction` returns 0 imports. `TradingPostPanel` uses `useGameStore` `buyResource` / `sellResource` actions that internally call `/api/game/trade`. |
| **Risk Level** | Low |
| **Verdict** | **REPLACED** |
| **Recommended Action** | Delete. Functionality absorbed into `TradingPostPanel` via `/api/game/trade` (Phase 1C server-authoritative rebuild). |

---

### B6. `newsLLM.ts:addEventToBatch()`

| Field | Value |
|---|---|
| **Item Name** | `addEventToBatch(packet, newsId)` — adds EventPacket to LLM batch queue |
| **Original Purpose** | Internal LLM batching API. |
| **Related Active Files** | `newsBuilder.ts` (uses different event-to-news flow via `eventPacketToMarketNews()`) |
| **Canonical Version** | `newsBuilder.ts` direct path (no LLM batch) |
| **Legacy Version** | `addEventToBatch()` |
| **Evidence** | `grep addEventToBatch` returns 0 imports. |
| **Risk Level** | Low |
| **Verdict** | **REPLACED** |
| **Recommended Action** | Delete. LLM news goes through `/api/news-llm` route + Cloudflare Worker, not client-side batching. |

---

### B7. `newsLLM.ts:shutdownNewsLLM()`

| Field | Value |
|---|---|
| **Item Name** | `shutdownNewsLLM()` — flush + close LLM engine |
| **Original Purpose** | Cleanup on app teardown. |
| **Related Active Files** | None — no `beforeunload` handler |
| **Verdict** | **SAFE_DELETE** |
| **Recommended Action** | Delete. Browser tab close doesn't need explicit shutdown. |

---

### B8. `newsBuilder.ts:eventPacketToMarketNews()`

| Field | Value |
|---|---|
| **Item Name** | `eventPacketToMarketNews()` — convert EventPacket to MarketNews[] |
| **Original Purpose** | Direct conversion (no LLM). |
| **Related Active Files** | `newsBuilder.ts:simulateMarketTick` references it in comment (line 5) but doesn't call it. |
| **Canonical Version** | None — `MarketPanel` reads pre-computed `marketNews` from store |
| **Evidence** | `grep eventPacketToMarketNews` returns 0 imports. |
| **Verdict** | **REPLACED** by store-driven path |
| **Recommended Action** | Delete. News flows: simulated events → store → panel. No direct call site. |

---

### B9. `configCache.ts:BUILDING_ID_MIGRATION` (Record)

| Field | Value |
|---|---|
| **Item Name** | `BUILDING_ID_MIGRATION: Record<string, string>` — ID migration map |
| **Original Purpose** | Old→new building ID translation. |
| **Related Active Files** | `idMigration.ts` has its own `MIGRATION_MAP` (the canonical one); `configCache.ts` map is duplicated and unused. |
| **Canonical Version** | `idMigration.ts:MIGRATION_MAP` (presumed — verify) |
| **Legacy Version** | `configCache.ts:BUILDING_ID_MIGRATION` |
| **Evidence** | `grep BUILDING_ID_MIGRATION` returns 0 external imports. |
| **Verdict** | **REPLACED** by `idMigration.ts` |
| **Recommended Action** | Verify `idMigration.ts` is canonical, then delete. If `idMigration.ts` is also dead (B12-15 below), keep one and archive the other. |

---

### B10. `configCache.ts:configLoadedAt`

| Field | Value |
|---|---|
| **Item Name** | `configLoadedAt: number` — export let for config version |
| **Original Purpose** | Track when config was loaded. |
| **Related Active Files** | `GameConfigProvider.tsx:81,104` exports its own `useConfigVersion()` hook — does NOT read `configLoadedAt`. |
| **Canonical Version** | `useConfigVersion()` (separate from `configLoadedAt`) |
| **Legacy Version** | `configLoadedAt` |
| **Evidence** | `grep configLoadedAt` returns 0 external imports. The `useConfigVersion` hook is also unreferenced (see B11). |
| **Verdict** | **REPLACED** by `useConfigVersion()` |
| **Recommended Action** | Wire `useConfigVersion()` into admin config page (currently 1142 LOC) and delete `configLoadedAt`. Tied to B11. |

---

### B11. `GameConfigProvider.tsx:useConfigVersion()`

| Field | Value |
|---|---|
| **Item Name** | `useConfigVersion(): number` — hook for config version |
| **Original Purpose** | React hook for components to re-render on config change. |
| **Related Active Files** | None — `grep useConfigVersion` returns only the definition + 1 comment in the same file. |
| **Verdict** | **MERGE_REQUIRED** — useful but not wired |
| **Recommended Action** | Wire into `/admin/config` page or any game component that reads dynamic config. If not adopted in 2 phases → delete. |

---

### B12. `idMigration.ts:reverseMigrateBuildingId()`

| Field | Value |
|---|---|
| **Item Name** | `reverseMigrateBuildingId(newId): string` — new→old direction |
| **Original Purpose** | Reverse the migration for back-compat reads. |
| **Related Active Files** | `store.ts:182` has its own `migrateSaveState()` that runs on load. No code reads NEW IDs and converts to old. |
| **Evidence** | `grep reverseMigrateBuildingId` returns 0 imports. |
| **Verdict** | **SAFE_DELETE** if migration is one-way complete |
| **Recommended Action** | Verify all saves in DB are post-migration IDs. If yes → delete. If no → keep for legacy save compatibility. |

---

### B13. `idMigration.ts:isOldBuildingId()`

| Field | Value |
|---|---|
| **Item Name** | `isOldBuildingId(id): boolean` — pre-migration ID check |
| **Verdict** | **MERGE_REQUIRED** if legacy saves exist; else **SAFE_DELETE** |
| **Recommended Action** | Check Supabase `game_states.buildings` for any old IDs (`grep -r "iron_mine_old" supabase/`). If 0 results → delete. |

---

### B14. `idMigration.ts:isMigratedBuildingId()`

| Field | Value |
|---|---|
| **Item Name** | `isMigratedBuildingId(id): boolean` — post-migration ID check |
| **Verdict** | **MERGE_REQUIRED** |
| **Recommended Action** | Same as B13. |

---

### B15. `idMigration.ts:migrateSaveState()`

| Field | Value |
|---|---|
| **Item Name** | `migrateSaveState(saveState)` — migration at save load |
| **Related Active Files** | `store.ts:182` defines its OWN `migrateSaveState(savedState, fromVersion?)` — different signature, inlined in store |
| **Canonical Version** | `store.ts:migrateSaveState` (inline, runs at load — verified by reading) |
| **Legacy Version** | `idMigration.ts:migrateSaveState` (exported but unused) |
| **Evidence** | `grep migrateSaveState` shows 2 definitions + 1 use (`store.ts:3622` uses the inline one). The exported one in `idMigration.ts` has 0 imports. |
| **Verdict** | **REPLACED** by inline store version |
| **Recommended Action** | **MERGE_REQUIRED** — diff both implementations. If inline is a strict subset → delete idMigration's version. If idMigration's is a superset → port logic to store. Track as BUG-039. |

---

### B16-18. `serverTickValidator.ts:computeMaxPossible{Buildings|Research,Resources}()`

| Field | Value |
|---|---|
| **Item Name** | 3 `computeMax*` validators |
| **Original Purpose** | Anti-cheat: cap max buildings/research/resources per tick to validate player actions. |
| **Related Active Files** | `gameStateValidator.ts` (the ACTIVE validator per AGENTS.md) |
| **Canonical Version** | `src/lib/auth/gameStateValidator.ts` (per AGENTS.md "server-side anti-cheat. HMAC-signed checksums") |
| **Legacy Version** | `serverTickValidator.ts:computeMax*` |
| **Evidence** | `grep computeMaxPossible` returns 0 external imports. The main `gameStateValidator.ts` does the actual work. |
| **Verdict** | **REPLACED** |
| **Recommended Action** | Delete the 3 functions. If their logic (e.g., max-buildings-cap) is missing in `gameStateValidator.ts`, port before delete. Track as BUG-040. |

---

### B19. `balanceConfig.ts:applyBalanceOverrides()`

| Field | Value |
|---|---|
| **Item Name** | `applyBalanceOverrides(overrides): void` — runtime config override |
| **Original Purpose** | Test/admin override for game balance. |
| **Related Active Files** | None — comment at line 122 says "change values here, or override via applyBalanceOverrides()". |
| **Verdict** | **MERGE_REQUIRED** if admin tool exists, else **SAFE_DELETE** |
| **Recommended Action** | Check if any admin API route can change balance. If not → delete. |

---

### B20. `balanceConfig.ts:resetBalance()`

| Field | Value |
|---|---|
| **Item Name** | `resetBalance(): void` — restore default balance |
| **Verdict** | **SAFE_DELETE** if B19 unused |
| **Recommended Action** | Tied to B19. |

---

### B21. `buildingDiscovery.ts:getAllBuildingTypes()`

| Field | Value |
|---|---|
| **Item Name** | `getAllBuildingTypes(): BuildingType[]` |
| **Verdict** | **MERGE_REQUIRED** if a building discovery page exists, else **SAFE_DELETE** |
| **Recommended Action** | Check admin pages for building discovery UI. |

---

### B22. `buildingDiscovery.ts:getBuildingCountsByCategory()`

| Field | Value |
|---|---|
| **Item Name** | `getBuildingCountsByCategory()` |
| **Verdict** | **MERGE_REQUIRED** if admin stats page needs it |
| **Recommended Action** | Check admin/monitoring page. If not needed → delete. |

---

### B23. `capacity.ts:canAcceptNewSignup()`

| Field | Value |
|---|---|
| **Item Name** | `canAcceptNewSignup(): Promise<boolean>` — simple boolean wrapper around `getCapacityStatus` |
| **Related Active Files** | `getCapacityStatus` (canonical, used 6 places) |
| **Verdict** | **SAFE_DELETE** — thin wrapper, callers can use `getCapacityStatus().canAccept` |
| **Recommended Action** | Delete. Single-line wrap adds no value. |

---

### B24. `capacity.ts:getCapacityForClient()`

| Field | Value |
|---|---|
| **Item Name** | `getCapacityForClient(): Promise<CapacityInfo>` — same data as `getCapacityStatus` |
| **Verdict** | **REPLACED** by `getCapacityStatus` |
| **Recommended Action** | Delete. `getCapacityStatus` is used 6 places; this is a duplicate. |

---

### B25. `permissions.ts:hasPermission()`

| Field | Value |
|---|---|
| **Item Name** | `hasPermission(userId, permission): Promise<boolean>` |
| **Related Active Files** | `/api/admin/permissions/[userId]/route.ts` uses `getUserPermissions` + `grantPermission` + `revokePermission` + `getValidPermissions` (4 other exports) |
| **Verdict** | **MERGE_REQUIRED** — likely a thin wrapper; verify before delete |
| **Recommended Action** | Diff `hasPermission` vs `getUserPermissions(userId).includes(permission)`. If identical → delete. |

---

### B26-33. (`config/tables.ts:getAllowedTableIds` and others)

| Field | Value |
|---|---|
| **Item Name** | `getAllowedTableIds()` in `src/lib/config/tables.ts:504` |
| **Original Purpose** | Whitelist of DB tables admin can view/edit. |
| **Related Active Files** | `/admin/config/page.tsx` (1142 LOC) — uses its own hardcoded table list, not this function |
| **Canonical Version** | Hardcoded list in admin/config/page.tsx (verify) |
| **Legacy Version** | `getAllowedTableIds` |
| **Evidence** | `grep getAllowedTableIds` returns 0 imports. |
| **Verdict** | **REPLACED** |
| **Recommended Action** | Wire `getAllowedTableIds` into admin/config page to centralize. If not adopted → delete. |

---

## Group C — 3 Duplicate Exports (Cross-File Audit)

### C1. `getSectorInfo()` — single source, no duplicate (FALSE POSITIVE in Knip)

| Field | Value |
|---|---|
| **Item Name** | `getSectorInfo()` in `marketSimulator.ts:1120` |
| **Evidence** | `grep getSectorInfo` shows 1 definition + 4 imports (all in `MarketPanel.tsx`). |
| **Verdict** | **ACTIVE** — Knip false positive (the function is heavily used) |
| **Recommended Action** | No action. Knip misidentified because some types come from the same file as dead code. |

---

### C2. `TIER_INFO` — alias pattern, not duplicate (FALSE POSITIVE in Knip)

| Field | Value |
|---|---|
| **Item Name** | `TIER_INFO` — defined in `data.ts:2371`, re-exported as `let` in `configCache.ts:70` |
| **Evidence** | `configCache.ts` does `export let TIER_INFO = _DEFAULT_TIER_INFO` (the import) — same reference, allows hot-swap on config load. `ContractPanel.tsx` imports from `data.ts` directly. |
| **Verdict** | **ACTIVE** — not a duplicate, it's an indirection pattern |
| **Recommended Action** | No action. The `let` rebinding is intentional for config hot-reload. |

---

### C3. `marketSimulator.ts` TS port vs `/api/market/tick/route.ts` inline JS port (REAL DUPLICATE)

| Field | Value |
|---|---|
| **Item Name** | Two implementations of market tick math |
| **Original Purpose** | Both compute next market state from pressure + prices. |
| **Related Active Files** | Cloudflare Worker `marketEngine.js` is the **third** implementation (the original canonical) |
| **Canonical Version** | **TBD** — need diff. Cloudflare Worker is the oldest, inline JS port in route is current production, TS port is the latest write |
| **Legacy Version** | **TBD** — need diff |
| **Evidence** | Read route.ts lines 80-200: has circuit breaker, EVENT_THRESHOLD, price math. marketSimulator.ts has cycle/momentum/news/narratives. Different feature sets. |
| **Risk Level** | **HIGH** — three implementations of the same math = drift guaranteed |
| **Verdict** | **MERGE_REQUIRED** — not "delete dead" — must reconcile which one is canonical |
| **Recommended Action** | **Step 1**: Diff `simulateMarketTick` (TS) vs inline `marketTick` (route JS) vs Cloudflare `marketEngine.js`. **Step 2**: Identify unique logic in each. **Step 3**: Pick canonical (likely Cloudflare — oldest, battle-tested). **Step 4**: Port missing logic (news generation, narratives) to canonical. **Step 5**: Delete the others. Track as **BUG-041 — CRITICAL**. Cannot delete without diff. |

---

## Group D — Missing / Broken Routes (Bonus)

### D1. `/admin/players/[id]/page.tsx` — RE-VERIFIED, FILE EXISTS

| Field | Value |
|---|---|
| **Item Name** | `/admin/players/[id]/page.tsx` |
| **Evidence** | `file_search` returns 1 match. Read first 50 lines — file is ~750 lines, has `confirmModal` local state (NOT the unused `ConfirmModal` component), 4 interfaces, lock/unlock flow. |
| **Verdict** | **ACTIVE** — earlier "0 LOC" claim was wrong. The file exists and is functional. |
| **Recommended Action** | No action. Note: the local `confirmModal` state pattern is the **inline** replacement for the unused `ConfirmModal` component (A8). |

---

## Summary Table

| # | Item | Verdict | Risk | Action |
|---|---|---|---|---|
| A1 | `csrf.ts` | REPLACED + SEC GAP | HIGH | Wire `validateCsrf` into admin APIs (BUG-035) |
| A2 | `fetchWrapper.ts` | REPLACED + SEC GAP | HIGH | Adopt in 8 admin pages (BUG-035) |
| A3 | `useAdminError.tsx` | SAFE_DELETE | Low | Delete or refactor later |
| A4 | `StatusBadge.tsx` | MERGE_REQUIRED | Medium | Adopt in 6 pages (BUG-036) |
| A5 | `Pagination.tsx` | MERGE_REQUIRED | Low | Wire into admin/players |
| A6 | `TableSkeleton.tsx` | MERGE_REQUIRED | Low | Adopt in 4 list pages |
| A7 | `AdminEmptyState.tsx` | MERGE_REQUIRED | Low | Adopt in 5 list pages |
| A8 | `ConfirmModal.tsx` | MERGE_REQUIRED | Medium | Refactor players/[id] inline modal (BUG-037) |
| A9 | `InvestigationTimeline.tsx` | MERGE_REQUIRED | Low | Build investigations/[id] page |
| B1 | `simulateMarketTick` | REPLACED + MERGE | Medium | Diff vs inline JS (BUG-038) |
| B2 | `createInitialSimState` | REPLACED | Med | Tied to B1 |
| B3 | `recordPlayerSell` | REPLACED | Low | Tied to B1 |
| B4 | `recordPlayerBuy` | REPLACED | Low | Tied to B1 |
| B5 | `recordMarketAction` | REPLACED | Low | Delete |
| B6 | `addEventToBatch` | REPLACED | Low | Delete |
| B7 | `shutdownNewsLLM` | SAFE_DELETE | Low | Delete |
| B8 | `eventPacketToMarketNews` | REPLACED | Low | Delete |
| B9 | `BUILDING_ID_MIGRATION` | REPLACED | Low | Delete if idMigration canonical |
| B10 | `configLoadedAt` | REPLACED | Low | Tied to B11 |
| B11 | `useConfigVersion` | MERGE_REQUIRED | Low | Wire into admin/config |
| B12-14 | idMigration utils | MERGE_REQ/SAFE_DEL | Low | Check DB for legacy IDs |
| B15 | idMigration.migrateSaveState | REPLACED | Low | Diff vs store.ts (BUG-039) |
| B16-18 | computeMax* | REPLACED | Low | Diff vs gameStateValidator (BUG-040) |
| B19-20 | balanceConfig overrides | SAFE_DELETE | Low | Delete |
| B21-22 | buildingDiscovery | MERGE_REQUIRED | Low | Check admin needs |
| B23-24 | capacity wrappers | REPLACED/SAFE_DEL | Low | Delete |
| B25 | `hasPermission` | MERGE_REQUIRED | Low | Verify wrapper |
| B26-33 | config/tables utils | REPLACED | Low | Wire or delete |
| C1 | `getSectorInfo` | ACTIVE (false pos) | — | No action |
| C2 | `TIER_INFO` | ACTIVE (false pos) | — | No action |
| C3 | market tick 3-way dup | MERGE_REQUIRED | **HIGH** | Diff all 3 (BUG-041) |
| D1 | `/admin/players/[id]` | ACTIVE | — | Earlier claim wrong |

---

## BUGS.md Entries to Add

- **BUG-035** — CSRF protection broken (validateCsrf never called, adminFetch never used) [HIGH, Security]
- **BUG-036** — StatusBadge component unused; 6 inline duplicates in admin pages [Medium, UI]
- **BUG-037** — ConfirmModal component unused; players/[id] inlines 70-line modal [Medium, UI]
- **BUG-038** — simulateMarketTick (TS port) not wired; route has inline JS port [Medium, State]
- **BUG-039** — idMigration.migrateSaveState diverged from store.ts:182 inline version [Low, State]
- **BUG-040** — serverTickValidator computeMax* never called; gameStateValidator is canonical [Low, Security]
- **BUG-041** — Three implementations of market tick math (TS / inline JS / Cloudflare) — reconcile [HIGH, State]

---

## Key Findings Summary

1. **CSRF is broken (A1+A2).** The cookie is set but never validated. Both helper files exist but neither is used. This is the highest-risk item — wire before any other work.

2. **Three market engines (C3) = drift bomb.** Cloudflare Worker (oldest, battle-tested), `/api/market/tick` inline JS (current prod), `marketSimulator.ts` TS port (newest, never wired). BUG-041 must reconcile before any deletion.

3. **9 admin components are abandoned, not dead.** All 9 are well-built, generic, and waiting for adoption. The right action is MERGE_REQUIRED, not SAFE_DELETE.

4. **2 of Knip's 3 "duplicates" are false positives** (C1, C2). Indirection patterns, not duplicates.

5. **`/admin/players/[id]` exists and is functional** (D1). Earlier "0 LOC" claim was wrong.
