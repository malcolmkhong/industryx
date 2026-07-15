# IndustryX Building Production Chain — Test Plan & Architecture Audit

> **Audit-only deliverable.** No code changes proposed in this document.
> **Verdict (lead with this):** **PARTIALLY CONNECTED / BROKEN END-TO-END.** Authoritative server-state wiring for `money`, `resources`, `buildings`, `powerGrid`, `gameTick`, `weather`, `last_tick_at` is correct end-to-end via `live-tick` and `offline-progress`. The per-tick `productionSnapshot` (the object every UI panel reads to display rates, fill bars, power surplus, payout per cycle, RP/CP income, factory flow) **is generated on the server but never reaches the client UI in production**. Multiple core engine invariants are silently violated or undocumented. Several user-listed concerns are confirmed true and are testable today; some are partially mitigated but still leaky.

---

## 0. Context

This document is the single source-of-truth audit of the building production chain in `A:\industryx\industryx`. It is grounded entirely in current code (commit `main` + 1 ahead), docs in `BUGS.md`, `docs/`, `planning/`, and the live supabase table dumps (`sb_*.txt`). It contains:

1. A chain-walk from Supabase config → server tick → API → DB → client store → UI.
2. A per-concern verdict on each user-listed implementation worry.
3. A concrete test specification for every required scenario, with file paths, preconditions, steps, expected vs. actual behavior, and priority.
4. A list of confirmed architectural problems (broken links, race conditions, silent failures, hardcoded leaks, orphan endpoints).

**No production code is modified by this audit.** After approval, the same content is written verbatim to the root-level Markdown report file as requested.

---

## 1. Audit Method

5 parallel read-only `explore` subagents mapped the chain end-to-end:

| Agent | Domain | Output |
|---|---|---|
| 1 | Repository & architecture chain | `A.1 Chain Entry/Exit Points`, `A.2 Module Boundary`, `A.3 Documented Bugs` |
| 2 | Building config, recipes, dependencies | `B.1 Building/Recipe/Chain Shape`, `B.2 DB Tables`, `B.3 Loaded-vs-Used Audit` |
| 3 | Production, power, workers, storage, modifiers | `C.1 computeProduction Behavior`, `C.2 Worker/Power/Storage/Modifier Rules` |
| 4 | API, persistence, offline, concurrency | `D.1 Endpoint Behavior`, `D.2 Concurrency`, `D.3 Persistence Boundary` |
| 5 | UI, store, existing tests | `E.1 Store Slices`, `E.2 UI Trust Boundary`, `E.3 Existing Test Coverage` |

All citations are in the format `relative/path:line`. Every claim below was cross-checked against the source file directly.

---

## 2. Chain Walk — End-to-End

### 2.1 Supabase Configuration (Authoritative)

| Table | Key columns | Read in code |
|---|---|---|
| `game_config_buildings` | `id, name, category, tier, base_cost(JSONB), cost_multiplier, base_power_consumption, base_power_production, cycle_time, base_production_rate, fuel, fuel_rate, unlock_research, unlock_prestige` | `src/lib/db/config/serverConfigFetcher.ts:351`, `src/lib/game/actions/server/shared/loadConfig.ts:42`, `src/app/api/game/production/compute/route.ts:103`, `src/app/api/game/state/offline-progress/route.ts:135` |
| `game_config_production_recipes` | `building_id (FK), resource_id (FK), is_input, amount` | `serverConfigFetcher.ts:353`, `loadConfig.ts:45`, `production/compute/route.ts:106`, `offline-progress/route.ts:138` |
| `game_config_production_chains` | `upstream_building (FK), downstream_building (FK), resource_id` | `serverConfigFetcher.ts:356`, `loadConfig.ts:50`, `production/compute/route.ts:111`, `offline-progress/route.ts:143` |
| `game_config_resources` | `id, name, tier, base_capacity` | `serverConfigFetcher.ts:352`, `src/lib/db/infra/initialState.server.ts:103` |
| `game_config_research` | `id, effects(JSONB)` | `serverConfigFetcher.ts:358`, `loadConfig.ts:47` |
| `game_config_workers` | `id, base_hire_cost, effects(JSONB)` | `serverConfigFetcher.ts:361` |
| `game_config_weather` | `id, production_multiplier, solar_multiplier, wind_multiplier` | `serverConfigFetcher.ts:360`, `offline-progress/route.ts:150`, `production/compute/route.ts:117` |
| `game_config_event_templates`, `game_config_balance`, `game_config_game` (tick_interval_ms, max_offline_ticks, starting_money) | … | `serverConfigFetcher.ts:382,395,391` |

DDL lives in `supabase/migrations/20260622141113_009_game_config_tables.sql`. **No RPC functions for production.** Only `apply_market_tick` exists (out of scope).

### 2.2 Runtime Wiring (DB → Engine)

```
DB row
  → src/lib/db/config/serverConfigFetcher.ts:fetchConfigTables()       :L347-405
  → src/lib/game/config/transformers/buildings.ts:transformBuildings() :L26-32  (joins recipes by building_id, splits inputs vs outputs)
  → src/lib/game/config/runtimeCache.ts:updateFromSupabase()           :L164    (mutates BUILDING_DEFS)
  → src/lib/game/production/definitions.ts:getBuildingDef()            :L18-21  (resolves typed BuildingDefinition)
  → src/lib/game/production/engine/math/multipliers.server.ts          :L21-243 (builds MultiplierCache)
  → src/lib/game/production/engine/math/production.server.ts           :L11-21  (computeProductionServer)
  → src/lib/game/production/engine/math/power.server.ts                :L12-24  (computePowerGridServer)
  → src/lib/game/production/engine/tick/runServerTicks.ts              :L33-124 (the simplified game loop)
  → src/lib/game/production/engine/tick/productionSnapshot.ts          :buildProductionSnapshotServer (final snapshot)
```

### 2.3 Server-Authoritative Tick Settlement

```
HTTP POST /api/game/state/live-tick      src/app/api/game/state/live-tick/route.ts:L18-87
  verifyAuth → RATE_LIMITS.serverTick → applyElapsedServerTime()
    src/lib/auth/applyElapsedTicks.ts:L61-130 (server time via rpc("now_iso"), cap maxTickRatePerSecond=50)
    runServerTicks() → buildProductionSnapshotServer()
    src/lib/game/actions/server/shared/elapsedTickPersistence.ts:L151-165
      saveServerGameStateOptimistic(userId, expectedVersion, {full_state, denormalized, state_version+1, last_tick_at, last_saved_at})
  returns {newState, ticksApplied, gameTick}                  :L82-86 — NO productionSnapshot
```

```
HTTP POST /api/game/state/offline-progress  src/app/api/game/state/offline-progress/route.ts:L368-645
  verifyAuth → RATE_LIMITS.serverTick → loadFullConfig (503) → loadServerGameStateForTick (404) → is_locked (403) → rpc("now_iso") (503)
  cap ticks at game_config_game.max_offline_ticks            :L507
  runServerTicks(state, elapsedTicks, config)                :L537-545
  saveServerGameStateOptimistic(userId, currentVersion+1, …) :L597-608 — STATE_VERSION CAS GUARD
  409 STATE_VERSION_CONFLICT on CAS miss                     :L609-616
  logActionAsync (fire-and-forget audit)                     :L620-631
  returns {newState, productionSnapshot, ticksApplied, elapsedSeconds}   :L635-640
```

```
HTTP POST /api/game/production/compute  src/app/api/game/production/compute/route.ts:L267-370
  verifyAuth → RATE_LIMITS.serverTick → parse {userId, ticks} (400) → ownership (403) → cap MAX_TICKS=60000 → loadFullConfig (503)
  load server_game_state via service-role client             :L334-351
  runServerTicks(state, cappedTicks, config)                 :L356-358
  returns {newState, productionSnapshot}                     :L359-363
  *** NO DB WRITE — endpoint is a pure oracle ***
```

### 2.4 Persistence Boundary

| Writer | Function | File:Line |
|---|---|---|
| Offline tick settlement | `saveServerGameStateOptimistic` | `src/app/api/game/state/offline-progress/route.ts:597-608` |
| Live tick settlement | `saveServerGameStateOptimistic` | `src/lib/game/actions/server/shared/elapsedTickPersistence.ts:151-161` |
| Action correction | `saveServerGameStateOptimistic` | `src/lib/game/actions/server/shared/correctedStatePersistence.ts:81-84` |
| Cloud-sync POST | `saveServerGameStateOptimistic` | `src/app/api/game/state/sync/route.ts:359-378` |
| Underlying CAS primitive | `.update(patch).eq("user_id", userId).eq("state_version", expectedStateVersion)` | `src/lib/db/game/serverGameState.ts:792-798` |

CAS primitive fields written: caller-supplied `patch` keys (`full_state`, `money`, `buildings`, `buildings_count`, `completed_research`, `game_tick`, `last_saved_at`, `last_tick_at`, `state_version`, `state_hash`, `research_points`, `resources`, `workers`, `total_money_earned`, `game_speed`).

### 2.5 Client Store Boundary

```
useGameStore (Zustand, src/lib/game/state/store.ts)
  ├── SERVER_FIELDS (L47-90): 35 server-authoritative keys
  ├── applyServerState(data) (L124-144): only applies SERVER_FIELDS keys present in `data`
  │   └── preserves prev.{hydrated, activeTab, selectedBuilding, notifications, productionSnapshot} (L141-144)
  ├── hydrateInitialState() (L157-172): GET /api/game/state/initial → mergeCanonicalWithUI
  │   └── preserves prev.productionSnapshot (L168)
  └── Stub state: createStubUISessionState() (src/lib/game/state/initialClientState.ts:147-150,156)
        └── productionSnapshot: emptyProductionSnapshot() (src/lib/game/production/snapshot/emptyProductionSnapshot.ts:7-37)
              fields all zero → every UI panel renders 0 rates permanently
```

**Critical:** `productionSnapshot` is intentionally excluded from `SERVER_FIELDS` (store.ts:47-90 list) AND from `SERVER_STATE_UI_FIELDS` strip list (`src/lib/db/game/serverGameStatePayload.ts:24-31`). So even if a server endpoint returned the snapshot, `applyServerState` would not write it, and `stripUIFields` would strip it from any future attempt to embed it in `full_state`.

### 2.6 UI Trust Boundary (Verified)

UI panels read **only** server-shaped values:

| Component | File:Line | Snapshot field read |
|---|---|---|
| `FactoryPanel.tsx` | `:77,107-168,819,891` | `productionSnapshot.production/actualConsumption/buildings` |
| `ResourcePanel.tsx` | `:61,99-170,868-925` | rates, fill, upgradeStorage |
| `PowerPanel.tsx` | `:131,167-169` | `powerProduction/powerConsumption/powerEfficiency/powerOverload` |
| `StoragePanel.tsx` | `:100,188-220,237-285,512-535,830-845` | rates, alerts, fill |
| `WorkerPanel.tsx` | `:120-154` | workers + per-type bonus (display-only) |
| `DashboardPanel.tsx` | `:95,141,181,1476,1504` | `payoutPerCycle, rpIncomeRate` |
| `GlobalResourceMonitorPanel.tsx` | `:322-335,702-723` | `production/consumption/moneyIncomeRate/rp/cp` |
| `ProductionChainsPanel.tsx` | `:68-69` | `production/actualConsumption` |
| `ResourceFlowDiagram.tsx` | `:99-101,203,561-573` | same |
| `AIAdvisorPanel.tsx` | `:482-528,654-706` | same |
| `TransportPanel.tsx` | `:1882,1955,2019,2108,2132,2156` | per-building |

No UI panel ever calls `runServerTicks` or recomputes locally. UI is purely a display surface for `productionSnapshot`. **But `productionSnapshot` is permanently zero.** The server-built snapshot is generated, returned in the offline-progress JSON, but never persisted to client state.

### 2.7 Verified Test Coverage Today

| Test file | Lines | Covers |
|---|---|---|
| `tests/unit/serverTickArchitecture.test.ts` | 9-10 | static route-text guard: `last_tick_at` only owned by tick-settlement paths |
| `tests/unit/liveServerTickArchitecture.test.ts` | 11-44 | route polls `/live-tick`; route does NOT call `runServerTicks` |
| `tests/unit/serverGameStateHydration.test.ts` | 29-58 | `buildCompleteFullStateForServerRow` shape + numeric guard |
| `tests/unit/initialState.server.test.ts` | 111-266 | 16 tests on canonical initial state |
| `tests/unit/serverGameDataShape.test.ts` | 56-221 | 14 tests enforcing Phase 13 server/UI split |
| `tests/unit/store/composition.test.ts` | 100-151 | 3 tests: action presence, state fields incl. `productionSnapshot` at L144 |
| `tests/unit/applyElapsedTicks.test.ts` | 186-258 | 8 tests on `applyElapsedTicks` |
| `tests/unit/elapsedTickPersistence.test.ts` | 50-55 | 1 test: cursor init branch |
| `tests/unit/gameTick.inputFloor.test.ts` | 79-200 | 3 tests on C2 input floor (factory race condition) |
| `tests/unit/serverAuthoritativeBuild.test.ts` | 60-200 | 6 tests on `validateBuildAction` |
| `tests/unit/serverAuthoritativeToggleBuilding.test.ts` | 40-129 | 8 tests on `validateToggleBuildingAction` |
| `tests/unit/serverAuthoritativeUpgrade.test.ts` | 91-236 | 10 tests on `validateUpgradeAction` |
| `tests/unit/serverAuthoritativeStorage.test.ts` | 38-180 | 11 tests on `validateUpgradeStorageAction` |
| `tests/unit/serverAuthoritativeWorker.test.ts` | 80-283 | 16 tests on `validateHireWorkerAction` + `validateAssignWorkerAction` |
| `tests/api/game/initial-state.test.ts` | 47-127 | 4 tests on GET `/state/initial` |
| `tests/api/game/live-tick.test.ts` | 48-168 | 4 tests on POST `/state/live-tick` (auth + settlement) |
| `tests/api/game/offline.test.ts` | 29-65 | 2 tests on POST `/state/offline-progress` (auth + rate limit) |
| `tests/api/game/compute.test.ts` | 27-65 | 3 tests on POST `/production/compute` (auth + ownership + ticks) |
| `tests/integration/game-state-validation.test.ts` | — | auth/route validation only |

**Total existing: 100+ tests, mostly action-validator unit tests. ZERO behavior tests for `computeProduction`, `computePowerGrid`, `runServerTicks`, `buildProductionSnapshotServer`, or any end-to-end client→server→store snapshot round-trip.**

---

## 3. Verdict on User-Listed Implementation Concerns

| # | Concern | Verdict | Evidence |
|---|---|---|---|
| 1 | Workers provide bonuses rather than being required | **CONFIRMED TRUE.** Worker=0 = no bonus, no power savings, but factory still produces if inputs available. `math/production.ts:60-72`. |
| 2 | Storage caps output rather than blocks production | **CONFIRMED TRUE (silent discard).** `runServerTicks.ts:102-109` does `Math.min(capacity, current + output.amount)`. Excess discarded, no log. `?? Infinity` fallback means missing capacity entry → unlimited. `hasUnlimitedStorage()` exists (`shared/utils/hasUnlimitedStorage.ts:11-17`) but **NOT** checked in tick runner — only in `costCalculator.ts:59` (client). Server `runServerTicks` and client `getCapacity` can disagree when Terraforming Engine mega project is completed. |
| 3 | `computeProduction()` provides `canProduce` but no blocked reason | **CONFIRMED TRUE.** Returned `BuildResult` (`math/production.ts:8-17`) has only `canProduce: boolean`. No enum/string. Caller must deduce from `inputs.length`, `actualInputs.length`, `efficiency`. |
| 4 | Missing building definitions and inactive buildings may return the same result | **CONFIRMED TRUE.** `math/production.ts:26-34`: single `if (!def || !building.active)` returns identical shape. `computePowerGrid` silently skips via `if (!def) continue;` (`power.server.ts:45,99`). `computePayout` silently skips via truthy chain (`payout.ts:22-30`). **No log, no diagnostic, no error code.** |
| 5 | Power shortage reduces global efficiency instead of fully stopping individual buildings | **CONFIRMED TRUE.** `computePowerGrid` computes `efficiency = max(minEfficiency, min(1, totalProduction / max(0.001, totalConsumption)))` (`power.ts:117-120`). `computeProduction` multiplies per-building output by `cache.powerEfficiency` (`production.ts:40`). Building runs at reduced rate, never stops. |
| 6 | Power plants with insufficient fuel may still generate reduced power | **CONFIRMED TRUE.** `power.ts:52-63`: fuel-starved branch emits `production *= getBalance().power.fuelStarvedOutputRatio` and drains only `resources[def.fuel] || 0`. Comment L62: "Do NOT drain remaining fuel — store leaves it untouched when supply is insufficient." |
| 7 | Production compute API may return new state without persisting it | **CONFIRMED TRUE.** `src/app/api/game/production/compute/route.ts:357-363`: `runServerTicks()` → `NextResponse.json(response)`. No `saveServerGameStateOptimistic` call. No `.update` / `.upsert`. Comment L329-331 acknowledges server state is the truth (over client-sent gameState) but endpoint is a pure oracle. **No client caller exists** (grep confirms 0 matches for `/api/game/production/compute` in `src/lib src/components src/app`). |
| 8 | `runServerTicks()` documented as simplified game loop | **CONFIRMED TRUE.** `engine/tick/runServerTicks.ts:1-9` comment: "Runs N ticks of the simplified engine used for offline progress, server-side validation, and cloud-save integrity checks." Per-tick loop processes: weather (L119), multipliers (L45), power grid (L48-L55), fuel consume (L70-L76), per-building production (L78-L110), endgame income (L112-L116), resource cap (L102-L109). **Does NOT process:** events (no mutation in loop), contracts (no `.contracts[]` mutation), market price drift, drones. |
| 9 | Building definitions, recipes, and production chains may be loaded but not all used by production engine | **PARTIALLY CONFIRMED.** Buildings + recipes ARE used (flattened into `BuildingDefinition.inputs/outputs` at `transformBuildings.ts:27-32`, consumed by `computeProduction` at `production.ts:89-127`). **Production chains are loaded but never read by the production math.** `GameConfig.productionChains` is fetched (`serverConfigFetcher.ts:540-543`) but `deriveProductionChains` at `runtimeCache.ts:413-484` is the only consumer (UI display chain only). Engine never reads `state.productionChains`. |

**Additional concerns discovered:**

| # | Concern | Verdict | Evidence |
|---|---|---|---|
| 10 | Hardcoded money/RP/CP payout rates in `payout.ts` | **CONFIRMED.** `math/payout.ts:31-33` `extractorRate=20, factoryRate=50, powerRate=10` (HARDCODED — not from `getBalance()`). | `math/payout.ts:31-33` |
| 11 | Hardcoded endgame switch table | **CONFIRMED.** `math/endgame.ts:55-110` switch on 14 building types with hardcoded rates (`dysonCollector: 8000`, `galacticForge: 100000+50 RP+5 CP`, etc.) — bypasses `BuildingDefinition.outputs`. | `math/endgame.ts:55-110` |
| 12 | Events computed twice (cache fields + registered modifiers) | **CONFIRMED.** `multipliers.server.ts:92-110` builds `eventProductionGlobal/eventProductionTargeted` cache fields manually. `registry` also registers event modifiers via `eventsToModifiers`. Only the cache version is read by `computeProduction`. Same numeric value, two code paths. | `multipliers.server.ts:92-110` + `registry.ts` |
| 13 | `production.payout` modifier applied in two scopes | **CONFIRMED.** Single cache field `productionBonus` (= `production.payout` - 1) is applied in BOTH `computeProduction` (`production.ts:84` — per-building efficiency) AND `computePayout` (`payout.ts:57` — payout cycle money). Two scopes, one field. | `production.ts:84`, `payout.ts:57` |
| 14 | `productionSnapshot` generated server-side but never reaches client UI | **CONFIRMED.** Endpoint returns snapshot (`route.ts:360`, `offline-progress/route.ts:637`), but `SERVER_FIELDS` excludes it (`store.ts:47-90`), `SERVER_STATE_UI_FIELDS` strips it (`serverGameStatePayload.ts:24-31`), `applyServerState` explicitly preserves `prev.productionSnapshot` (`store.ts:143`). Result: stub values ship to every UI panel. | see cited lines |
| 15 | `/api/game/production/compute` endpoint is orphan | **CONFIRMED.** Zero callers in `src/lib src/components src/app`. Auth + rate limit + load state + run engine + return only. No persistence. No idempotency key. No client wiring. | grep |
| 16 | DB has `solarPanel` row but no BuildingType union entry, no catalog entry | **CONFIRMED.** `sb_buildings.txt` lists `solarPanel`; absent from `src/lib/game/shared/types/buildings.ts:19-128` and `src/lib/game/catalog/ui/buildings.ts:19-826`. Dead row. | `sb_buildings.txt`, `buildings.ts`, `catalog/ui/buildings.ts` |
| 17 | `BUILDING_ID_MIGRATION` map duplicated in two locations | **CONFIRMED.** `runtimeCache.ts:112-116` and `serverConfigFetcher.ts:113` both define the 3-entry migration map (`miningDrill→ironMine`, `quarry→sandMine`, `goldsmith→jewelleryForge`). | both files |
| 18 | No PG row locks anywhere | **CONFIRMED.** grep for `select ... for update` / `pg_advisory_xact_lock` → 0 matches in production/tick/sync paths. Concurrency protection is purely state_version CAS at `serverGameState.ts:792-798`. TOCTOU window between load and save exists but is acceptable given the version check. | grep |
| 19 | `runServerTicks` uses `structuredClone(initialState)` — safe but expensive | **CONFIRMED.** `runServerTicks.ts:38`. Each tick of `runServerTicks(N)` clones the entire `ServerGameData` once. For 60000 tick cap (`compute/route.ts:316`) this is acceptable but flagged for review. | `runServerTicks.ts:38` |
| 20 | `last-resort fallback` for IDs uses `Math.random` | **DOCUMENTED AS FALLBACK.** `engine/util/serverRandom.ts:33-34` and `engine/ids.ts:35-43`. Both labelled "Should never execute on supported runtimes." Compliance: comment present, fail-closed not enforced (would `throw` instead). | cited lines |

---

## 4. Required Test Scenarios — Full Specifications

Each test below is grounded in current code and uses existing helpers. **No new test infrastructure needed beyond what's already in `vitest.config.ts` and `tests/setup.ts`.**

### Conventions

- **Type:** unit (pure), integration (multi-module), system (server route + DB), e2e (browser).
- **Priority:** critical (blocks production / loses data), high (breaks UI correctness), medium (silent corruption), low (cosmetic).
- **Helpers to reuse:**
  - `tests/setup.ts` — global mock for supabase, balance, config.
  - `src/lib/game/production/definitions.ts:getBuildingDef` — building lookup.
  - `src/lib/game/production/math/production.ts:computeProduction` — pure function.
  - `src/lib/game/production/engine/math/power.server.ts:computePowerGridServer` — pure function.
  - `src/lib/game/production/engine/math/multipliers.server.ts:buildMultipliersServer` — pure function.
  - `src/lib/game/production/engine/tick/runServerTicks.ts:runServerTicks` — pure function.
  - `src/lib/db/game/serverGameState.ts:saveServerGameStateOptimistic` — DB CAS helper.
  - `tests/unit/mocks/productionCalculator.ts` — production snapshot mock.

### Scenario Tests

#### TST-001 — Inactive building produces nothing
- **Type:** unit
- **Files / functions:** `src/lib/game/production/math/production.ts:computeProduction` (L26-34); `src/lib/game/production/engine/tick/runServerTicks.ts` (L78-110)
- **Preconditions:** Building instance with `active: false`, valid `BuildingDefinition`, non-zero `state.resources`.
- **Steps:** Call `computeProduction(b, cache, resources)`; call `runServerTicks(state, 1, config)` with `active=false`.
- **Expected:** `{outputs:[], inputs:[], actualInputs:[], efficiency:0, canProduce:false, workerPowerSavings:0}` — exactly. No resource mutation in tick.
- **Actual:** Returns identical shape to `!def` case. Tick runner skips via `if (!result.canProduce) continue;`.
- **Symptoms:** If mutated, UI shows nonzero rates for inactive building.
- **Priority:** critical
- **Verify with:** `npm run test:vitest tests/unit/buildings/inactive.test.ts`

#### TST-002 — Unknown building definition produces nothing and reports a diagnosable failure
- **Type:** unit + integration
- **Files / functions:** `src/lib/game/production/math/production.ts:computeProduction` (L26-34); `src/lib/game/production/engine/math/power.server.ts:computePowerGridServer` (L45,99)
- **Preconditions:** Building instance with `type: "ghost_building"` not in `BuildingType` union; `BUILDING_DEFS` static fallback has no entry.
- **Steps:** Call `computeProduction(b, cache, resources)`; `computePowerGridServer(state, cache, resources, tick, defs, workerDefs)`; `runServerTicks(state, 1, config)`.
- **Expected (intended design):** Return `canProduce: false` AND a diagnosable signal — e.g., a separate field `diagnostic?: "unknown_definition"`, or a console.warn with the unknown type, or an aggregator `state.warnings[]` entry.
- **Actual:** Returns identical shape to inactive case. No log. No warning. `computePowerGridServer` silently skips via `if (!def) continue;`.
- **Symptoms:** Building with typo in DB silently produces 0; admin cannot detect missing config from server logs.
- **Priority:** critical (silent failure)
- **Verify with:** `tests/unit/production/unknownBuilding.test.ts`

#### TST-003 — Extractor produces its configured output
- **Type:** unit
- **Files / functions:** `src/lib/game/production/math/production.ts:computeProduction` (L88-104)
- **Preconditions:** `coalMine` (extractor, `outputs:[{resource:"coal", amount:1, baseProductionRate:1}]`, level=1, efficiency=1). Empty `state.resources`. All modifiers = 1.
- **Steps:** Construct cache with `powerEfficiency=1, eventProductionGlobal=1, weatherProduction=1, transportProductionBonus=1, extractorBonus=0`. Call `computeProduction(coalMine, cache, {})`.
- **Expected:** `outputs=[{resource:"coal", amount:1 * 1 * 1 * 1}]`, `canProduce: true`, `efficiency: 1`.
- **Actual:** Matches expected. Note: extractor branch ignores input resources entirely (no factory gating).
- **Symptoms:** If `baseProductionRate=0` (misconfigured), extractor outputs 0 silently.
- **Priority:** high
- **Verify with:** `tests/unit/production/extractor.test.ts`

#### TST-004 — Factory produces only when all required inputs are available
- **Type:** unit
- **Files / functions:** `src/lib/game/production/math/production.ts:computeProduction` (L106-138)
- **Preconditions:** `smelter` (factory, `inputs:[{iron:2, coal:1}]`, `outputs:[{steel:1}]`, level=1). State has `iron=2, coal=0`.
- **Steps:** Call `computeProduction(smelter, cache, resources)` with `iron=2, coal=0`.
- **Expected:** `canProduce: false`, `inputs=[{iron:2}, {coal:1}]`, `actualInputs=[]`, `outputs` still populated (for downstream cap).
- **Actual:** Matches expected. **But caller must check `canProduce` to skip applying outputs.** Tick runner at `runServerTicks.ts:88` does this correctly. A naive caller would silently double-credit.
- **Symptoms:** Outputs are populated even when inputs are missing — easy footgun for any direct caller.
- **Priority:** critical (output-shape footgun)
- **Verify with:** `tests/unit/production/factory.test.ts` — covers both branches.

#### TST-005 — Factory consumes the exact required inputs
- **Type:** unit + integration
- **Files / functions:** `math/production.ts:computeProduction` (L108-117); `runServerTicks.ts:78-97`
- **Preconditions:** Same as TST-004 but `iron=2, coal=1`.
- **Steps:** Run `runServerTicks(state, 1, config)`. Check `state.resources` after.
- **Expected:** `iron -= 2*level*efficiency`, `coal -= 1*level*efficiency`. No more, no less.
- **Actual:** Matches expected.
- **Symptoms:** If `def.amount * level * efficiency` not honored (e.g. rounding), factory cheats resources.
- **Priority:** critical
- **Verify with:** `tests/unit/production/factoryInputConsumption.test.ts`

#### TST-006 — Multiple factories cannot consume the same resource amount twice
- **Type:** unit (race)
- **Files / functions:** `math/production.ts:computeProduction` (L106-138); `runServerTicks.ts:78-110`
- **Preconditions:** Two `smelter` instances (id=`a` and id=`b`), both need `iron=2`. Stockpile `iron=3`.
- **Steps:** Run `runServerTicks(state, 1, config)`.
- **Expected:** Exactly one factory produces. The other gets `canProduce: false` because `iron=3 < iron=2+iron=2` (after first factory consumes 2, only 1 left).
- **Actual:** Matches expected. Confirmed by `tests/unit/gameTick.inputFloor.test.ts:79-200`. The factory loop processes buildings sequentially; later iteration sees the depleted resource.
- **Symptoms:** If two factories ran in parallel (or if `actualInputs` was computed from the original snapshot instead of the post-debit snapshot), both would consume. Current implementation is safe but only because of sequential ordering.
- **Priority:** critical
- **Verify with:** extend `tests/unit/gameTick.inputFloor.test.ts`

#### TST-007 — Coal mine produces coal
- **Type:** unit
- **Files / functions:** `math/production.ts:computeProduction`; `runtimeCache.ts:updateFromSupabase` for `coalMine` definition; `serverConfigFetcher.ts` for the row.
- **Preconditions:** Config has `coalMine` (id, category=extractor, outputs=[{resource:"coal", amount:1}], baseProductionRate=0.5). Player has 1 `coalMine` building at level 1.
- **Steps:** Run `runServerTicks(state, 1, config)`. Assert `state.resources.coal >= 0.5`.
- **Expected:** Coal increments by `1 * 0.5 * 1 * efficiency * modifiers`.
- **Actual:** Matches expected IF DB row is present. If absent, `coalMine` will fail as TST-002 (silent skip).
- **Symptoms:** UI shows 0 coal with no error if DB row missing.
- **Priority:** high
- **Verify with:** `tests/integration/buildings/coalMine.test.ts`

#### TST-008 — Coal power plant consumes coal
- **Type:** unit
- **Files / functions:** `engine/math/power.server.ts:computePowerGridServer` (L46-65); `runServerTicks.ts:70-76` for fuel deduction
- **Preconditions:** `coalGenerator` (power, fuel=coal, fuelRate=0.5, basePowerProduction=20). State `coal=10`. 1 plant at level 1.
- **Steps:** Run `runServerTicks(state, 1, config)`.
- **Expected:** `state.resources.coal -= 0.5 * 1 * 1` per tick.
- **Actual:** Matches expected.
- **Symptoms:** If fuel consumption skipped, infinite power.
- **Priority:** critical
- **Verify with:** `tests/unit/power/coalFuelConsumption.test.ts`

#### TST-009 — Coal power plant generates power
- **Type:** unit
- **Files / functions:** `engine/math/power.server.ts:computePowerGridServer` (L46-50)
- **Preconditions:** As TST-008.
- **Steps:** Run `runServerTicks(state, 1, config)`. Read `state.powerGrid.totalProduction`.
- **Expected:** `totalProduction += 20 * 1 * 1 = 20`.
- **Actual:** Matches expected.
- **Symptoms:** If misconfigured (basePowerProduction=0), grid has 0 production → all consumers efficiency=0 → no production.
- **Priority:** critical
- **Verify with:** same file as TST-008

#### TST-010 — Insufficient coal follows the intended reduced-power behaviour
- **Type:** unit
- **Files / functions:** `engine/math/power.server.ts:computePowerGridServer` (L52-63)
- **Preconditions:** `coalGenerator`, fuelRate=0.5, basePowerProduction=20. State `coal=0.2`.
- **Steps:** Run `computePowerGridServer(...)` with `coal=0.2`. Read `powerResult.totalProduction` and `fuelConsumption`.
- **Expected:** `production *= bal.power.fuelStarvedOutputRatio` (default from `balanceConfig.ts`). `fuelConsumption[0].actualAmount = 0.2` (drains what it has, leaves the rest). Comment L62 documents this.
- **Actual:** Matches expected. `bal.power.fuelStarvedOutputRatio` is sourced from `game_config_balance` (`serverConfigFetcher.ts:395`).
- **Symptoms:** If the ratio is misconfigured (e.g., 1.0 instead of 0.3), plant produces full power without fuel — economy exploit.
- **Priority:** critical
- **Verify with:** `tests/unit/power/fuelStarved.test.ts`

#### TST-011 — Power shortage applies the correct efficiency reduction
- **Type:** unit
- **Files / functions:** `engine/math/power.server.ts:computePowerGridServer` (L110-120); `math/production.ts:computeProduction` (L40)
- **Preconditions:** 2 extractors each needing 50 MW; 1 coalGenerator producing 50 MW total. Modifiers all 1.
- **Steps:** Run `runServerTicks(state, 1, config)`. Read `state.powerGrid.efficiency` and `state.resources[output]`.
- **Expected:** `efficiency = min(1, 50/100) = 0.5`. Each extractor produces at `0.5x`.
- **Actual:** Matches expected.
- **Symptoms:** If `minEfficiency` floor misconfigured, grid can drop to 0 or to negative.
- **Priority:** critical
- **Verify with:** `tests/unit/power/shortage.test.ts`

#### TST-012 — Worker assignment applies the correct bonus
- **Type:** unit
- **Files / functions:** `math/production.ts:computeProduction` (L60-72)
- **Preconditions:** 1 `smelter` factory, 1 worker (level 1, efficiency=0.05, speed=0.05). All multipliers 1.
- **Steps:** Call `computeProduction(smelter, cache, resources)` with workers assigned.
- **Expected:** `efficiency *= 1 + 0.05 * 1 * (1 + workerEfficiencyTotal)` twice (speed + efficiency). Worker=0 case: no `*=` lines.
- **Actual:** Matches expected.
- **Symptoms:** If worker effect types double-counted or skipped, bonuses inconsistent.
- **Priority:** high
- **Verify with:** `tests/unit/workers/bonus.test.ts`

#### TST-013 — No-worker building still follows the intended base-production behaviour
- **Type:** unit
- **Files / functions:** `math/production.ts:computeProduction` (L60-72)
- **Preconditions:** 1 `coalMine`, no workers assigned.
- **Steps:** Call `computeProduction(coalMine, cache, resources)`.
- **Expected:** Worker loop skipped. `efficiency` unchanged by worker contribution. `workerPowerSavings=0`.
- **Actual:** Matches expected. **`canProduce: true`.** Extractor produces regardless of workers.
- **Symptoms:** If worker loop skipped incorrectly (e.g., wrong null check), `workerMaintenanceReduction=NaN`.
- **Priority:** high
- **Verify with:** `tests/unit/workers/noWorker.test.ts`

#### TST-014 — Weather and event modifiers are applied once only
- **Type:** unit
- **Files / functions:** `engine/math/multipliers.server.ts:buildMultipliersServer` (L92-110 for events, L115-117 for weather)
- **Preconditions:** State has `activeEvents: [{effects: [{type:"productionMultiplier", value:1.5}]}]`. Weather="sunny" (productionMultiplier=1.1).
- **Steps:** Build multiplier cache. Inspect `eventProductionGlobal`, `weatherProduction`.
- **Expected:** `eventProductionGlobal=1.5`, `weatherProduction=1.1`. NOT multiplied together twice in the same field.
- **Actual:** Both stored in separate cache fields, multiplied once each in `computeProduction:40-42`. **But:** events are ALSO registered as modifiers via `eventsToModifiers` in `modifiers/registry.ts` — same event effectively applied twice if `eventsToModifiers` is ever wired into `computeProduction`. Currently only the cache version is read, so single application — but the redundancy is undocumented and fragile.
- **Symptoms:** Future refactor that consumes the registry version would double-apply.
- **Priority:** high
- **Verify with:** `tests/unit/modifiers/eventAppliedOnce.test.ts`

#### TST-015 — Research and prestige modifiers are applied once only
- **Type:** unit
- **Files / functions:** `engine/math/multipliers.server.ts:buildMultipliersServer` (L119-135 for research, L127 for prestige)
- **Preconditions:** Research tree has `energyEfficiency` (power.consumption -10%). Prestige state has 5 levels (production.payout +10%).
- **Steps:** Build cache. Inspect `powerBonus`, `productionBonus`, `workerEfficiencyTotal`.
- **Expected:** Each modifier appears exactly once in its target's resolved value.
- **Actual:** Confirmed once. **Caveat:** `productionBonus` (production.payout modifier) is applied in BOTH `computeProduction` (per-building efficiency, `production.ts:84`) AND `computePayout` (payout cycle, `payout.ts:57`). Same target name, two scopes — by design but undocumented and easy to miscount.
- **Symptoms:** If anyone refactors `computePayout` to also read `productionBonus`, the effect doubles.
- **Priority:** high
- **Verify with:** `tests/unit/modifiers/researchAppliedOnce.test.ts`

#### TST-016 — Storage capacity never exceeds its maximum
- **Type:** integration (tick)
- **Files / functions:** `engine/tick/runServerTicks.ts:102-109`
- **Preconditions:** `resourceCapacity.iron = 100`. `state.resources.iron = 99`. Factory produces +5 iron/tick.
- **Steps:** Run `runServerTicks(state, 1, config)`. Read `state.resources.iron`.
- **Expected:** `state.resources.iron = 100`. Excess 4 silently discarded.
- **Actual:** Matches expected. **`?? Infinity` fallback: missing capacity entry → unlimited (potential exploit if DB row missing).**
- **Symptoms:** If `Math.min` swapped to `+`, capacity overflows.
- **Priority:** critical
- **Verify with:** `tests/unit/storage/cap.test.ts`

#### TST-017 — Full storage behaviour is explicit and does not silently destroy production unless intentionally designed
- **Type:** integration (tick) + behaviour document
- **Files / functions:** `engine/tick/runServerTicks.ts:102-109`; `src/lib/capacity.ts`
- **Preconditions:** `resourceCapacity.iron = 100`. `state.resources.iron = 100`. Factory produces +5 iron/tick.
- **Steps:** Run `runServerTicks(state, 1, config)`. Read `state.resources.iron`.
- **Expected (intended design question):** Either (a) factory still consumes inputs but outputs cap-discarded (current behavior — silently loses production), or (b) factory stops consuming inputs when output would overflow (blocks).
- **Actual:** (a). The doc explicitly says "silently discarded, no log, no return signal to caller."
- **Symptoms:** UI shows factory "producing" while resources are pinned at cap. No telemetry to surface waste.
- **Priority:** medium (silent waste, no data loss)
- **Verify with:** `tests/unit/storage/fullCap.test.ts` — pins down the current behaviour and documents the design choice.

#### TST-018 — Multiple ticks produce deterministic totals
- **Type:** integration
- **Files / functions:** `engine/tick/runServerTicks.ts:runServerTicks`
- **Preconditions:** Same initial state for both runs.
- **Steps:** Run `runServerTicks(state, 100, config)` twice. Compare `state.resources` and `state.money`.
- **Expected:** Identical totals (modulo floating-point bit equality).
- **Actual:** Confirmed deterministic. No `Math.random` in production math (verified by grep). Weather uses `serverRandom` (`secureRandomInt`) for selection, but per-tick weather values are deterministic given the selected weather. `productionSnapshot` may differ slightly if weather rotates differently across runs because of random initial weather selection — but for fixed state.weather, deterministic.
- **Symptoms:** If `Date.now` leaks into `computeProduction`, totals drift.
- **Priority:** high
- **Verify with:** `tests/unit/tick/determinism.test.ts`

#### TST-019 — Two simultaneous compute requests cannot duplicate production
- **Type:** system (route + DB)
- **Files / functions:** `src/app/api/game/production/compute/route.ts:267-370`
- **Preconditions:** Two parallel POSTs with identical `userId, ticks` from same authenticated user. Server has `server_game_state` for user.
- **Steps:** Use Promise.all to send two requests simultaneously.
- **Expected:** Each returns the same `newState` and `productionSnapshot` because endpoint does NOT persist. No DB write occurs.
- **Actual:** Matches expected for the current (orphan) endpoint. **BUT:** if endpoint were ever extended to persist, it would need CAS — currently has none. This is a latent risk.
- **Symptoms:** Once wired into the live flow, double-write on race.
- **Priority:** critical (latent — not triggered today but high-risk once endpoint is wired)
- **Verify with:** `tests/api/game/compute.race.test.ts` — assert no double-apply (both succeed, identical result).

#### TST-020 — Returned production state is persisted
- **Type:** system (route + DB)
- **Files / functions:** `src/app/api/game/production/compute/route.ts:357-363`
- **Preconditions:** User with valid `server_game_state`. Send POST with `ticks=1`.
- **Steps:** Call endpoint. Query `server_game_state` for the user.
- **Expected (intended design):** `state.gameTick += 1`, `state.resources`, `state.money` updated, `state_version` incremented, `last_tick_at` advanced.
- **Actual:** Endpoint does NOT persist. `server_game_state` is unchanged.
- **Symptoms:** Caller that hits `/compute` expects persistence — gets ephemeral oracle.
- **Priority:** critical (if endpoint is ever wired) / currently low (orphan)
- **Verify with:** `tests/api/game/compute.persistence.test.ts`

#### TST-021 — Reloading the player state returns the persisted production result
- **Type:** system + integration (client→server round-trip)
- **Files / functions:** `src/app/api/game/state/sync/route.ts:99-127`; `src/lib/hooks/cloudSync/CloudSyncService.ts:139-189`
- **Preconditions:** User has live state with resources `iron=50, money=10000` after several ticks. Reload the page.
- **Steps:** Trigger CloudSyncService.load() → GET `/state/sync`. Apply `applyServerState`. Assert `useGameStore.getState().resources.iron === 50` and `state.money === 10000`.
- **Expected:** Server-authoritative state hydrates into the client store.
- **Actual:** Matches expected for `money/resources/buildings/etc.` (all in `SERVER_FIELDS`). **`productionSnapshot` is preserved as empty stub** because it is not in `SERVER_FIELDS` (L47-90).
- **Symptoms:** Resource inventory correct. Production/consumption rates display 0.
- **Priority:** critical (UI broken until snapshot wiring fixed)
- **Verify with:** `tests/integration/state/sync.roundtrip.test.ts`

#### TST-022 — UI status matches the authoritative server calculation
- **Type:** integration (UI trust)
- **Files / functions:** `src/components/game/FactoryPanel.tsx:77,107-168`; `src/components/game/PowerPanel.tsx:131,167-169`; `src/components/game/ResourcePanel.tsx:99-170`
- **Preconditions:** After several live-tick POSTs that should produce resources.
- **Steps:** Render `<FactoryPanel/>` in a Vitest browser test (happy-dom env). Inspect rendered production rate.
- **Expected:** Rate matches `serverState.productionSnapshot.production[buildingId]`.
- **Actual:** Rate displays 0 because `productionSnapshot` is the empty stub.
- **Symptoms:** UI shows 0 rate while server says resources are being produced. Player sees no progress.
- **Priority:** critical
- **Verify with:** `tests/components/factoryPanel.test.tsx`

#### TST-023 — Offline production uses the same building rules as live production
- **Type:** integration (server)
- **Files / functions:** `src/app/api/game/state/offline-progress/route.ts:537-545`; `src/app/api/game/state/live-tick/route.ts:70`
- **Preconditions:** User has 2h elapsed since last `last_tick_at`. 1 `coalMine` at level 1.
- **Steps:** POST `/state/offline-progress` with valid auth + device. Assert `state.resources.coal` increment equals `liveTickResult * tickCount`.
- **Expected:** Same per-tick production math, same power rules, same modifier set, same storage caps.
- **Actual:** Matches expected for the mutation side. **Difference:** `/live-tick` returns `{newState, ticksApplied, gameTick}` (no snapshot), `/offline-progress` returns `{newState, productionSnapshot, ticksApplied, elapsedSeconds}`. The snapshot is generated identically (both go through `runServerTicks` → `buildProductionSnapshotServer`), but only the offline route exposes it.
- **Symptoms:** If a future change adds a per-tick optimizer to one path but not the other, results diverge.
- **Priority:** high
- **Verify with:** `tests/integration/tick/offlineLive.test.ts`

---

## 5. Architectural Concerns (Beyond Tests)

### 5.1 Missing Architecture

- **No client-side trigger for `productionSnapshot` refresh.** Server generates snapshot every tick; client never receives it (because `SERVER_FIELDS` excludes it; because live-tick route omits it from response).
- **No `productionSnapshot` setter in any client store action.** Every other server-authoritative field has at least one mutation path. The snapshot has none.
- **No idempotency mechanism on `/production/compute`.** Acceptable today (no DB write) but unsafe if endpoint is ever wired.
- **No diagnostic signal for unknown/inactive buildings.** Server-side state can degrade silently.

### 5.2 Broken / Disconnected Chain Links

| Link | Status |
|---|---|
| DB `game_config_buildings` → `BUILDING_DEFS` | ✅ WIRED via `transformBuildings` + `runtimeCache.updateFromSupabase` |
| DB `game_config_production_recipes` → `BuildingDefinition.inputs/outputs` | ✅ WIRED via same path |
| DB `game_config_production_chains` → production math | ❌ **NOT CONSUMED.** UI display only. |
| DB `game_config_research` → `buildModifierRegistry` → cache | ✅ WIRED via `multipliers.server.ts:62-71` |
| DB `game_config_weather` → cache + math | ✅ WIRED |
| DB `game_config_event_templates` → math | ⚠️ **PARTIAL.** Templates populate `EVENT_TEMPLATES` constant but math reads `state.activeEvents` (manually authored), not templates. Config table for events is loaded but unused by production math. |
| Server `runServerTicks` → `server_game_state` | ✅ WIRED via `saveServerGameStateOptimistic` (live + offline + sync) |
| Server `runServerTicks` → `productionSnapshot` → response | ✅ WIRED (returned in offline response) |
| Server response → client Zustand `productionSnapshot` | ❌ **BROKEN.** Excluded from `SERVER_FIELDS`, no setter, no overwrite path. |
| Zustand `productionSnapshot` → UI panels | ✅ WIRED (panels read the field) — but field is permanently stub |

### 5.3 Configuration Tables Loaded But Unused by Production Math

- `game_config_production_chains` — UI display only.
- `game_config_event_templates` — UI display only.
- `game_config_seasonal_events` — loaded; not read by production math (`serverConfigFetcher.ts:386`).
- `game_config_automation` — loaded; not read by production math.

### 5.4 Duplicate Client/Server Production Logic

- **Power grid:** Client `useGameStore` has `powerGrid` slice updated locally on toggle via `productionCalculator.computePowerGrid` (`buildingsActions.ts:212-225`). Server `runServerTicks` recomputes from authoritative state. Both use the same math modules — no logic duplication, but two compute paths.
- **`powerEfficiency`:** Client uses it for UI heuristics; server uses it for tick settlement. Same value, two sources.

### 5.5 Hardcoded Fallback Values

| Location | Value | Notes |
|---|---|---|
| `math/payout.ts:31-33` | `extractorRate=20, factoryRate=50, powerRate=10` | Should be `getBalance().payout.*` |
| `math/endgame.ts:55-110` | 14 endgame switch cases with money/RP/CP rates | Should be per-building `BuildingDefinition.endgameIncome` or `game_config_buildings` columns |
| `engine/validators/storage.ts:30` | `MAX_STORAGE_UPGRADE = 100` | Admin cap; arguably should be config |
| `math/power.ts:46` | `def.basePowerProduction * b.level * b.efficiency` | Sourced from DB ✓ |
| `math/power.ts:48` | `def.fuelRate * b.level` | Sourced from DB ✓ |
| `multipliers.server.ts:40-44` | `efficiency: 0.05, speed: 0.05, maintenance: 0.02` | Fallback when DB worker row missing |
| `engine/util/serverRandom.ts:33-34` | `Math.floor(Math.random() * 0xffffffff)` | Documented last-resort fallback |

### 5.6 Silent Failure States

1. Unknown building definition (TST-002): silently returns 0 production, no log.
2. Inactive building: same as above, indistinguishable.
3. Storage overflow: silently caps, no telemetry.
4. Fuel-starved plant: silently produces reduced power (intended but undocumented).
5. `production.payout` modifier double-application risk: same field name in two scopes, easy to miscount.
6. Event modifiers registered twice (cache + registry): currently only one path consumed, but documented nowhere.

### 5.7 Race Conditions / Double-Production Risks

- **No Postgres row locks.** Concurrency relies entirely on `state_version` CAS at `serverGameState.ts:792-798`.
- **`/production/compute` has no CAS** — latent risk if endpoint is wired.
- **`gameTick.inputFloor.test.ts` confirms factory race is mitigated** by sequential tick processing. Any future parallelization would re-introduce the bug.

### 5.8 Resource-Loss Risks

- **Storage overflow silently discards** (`runServerTicks.ts:102-109`).
- **`hasUnlimitedStorage()` not honored** in server tick path — Terraforming Engine mega-project gives unlimited storage on client but not server.
- **`?? Infinity` fallback** for missing capacity entry: if a resource has no `resourceCapacity` row, it's unbounded — DB integrity risk.

### 5.9 Buildings That Can Never Produce

- **Any building with `baseProductionRate = 0`** in DB: outputs compute to 0 silently.
- **Any building with missing recipe rows**: `def.inputs/outputs` empty → factory branch returns `canProduce: true, outputs:[]` (`production.ts:139-147` fallback). UI shows nothing.
- **Tier-5 buildings** use the hardcoded endgame switch (`endgame.ts:55-110`) — bypass `BuildingDefinition.outputs`. If a new tier-5 building is added without updating this switch, it earns 0 money/RP/CP.
- **`solarPanel` in DB** (`sb_buildings.txt`) but absent from `BuildingType` union and catalog: dead row, cannot be built but pollutes admin views.

---

## 6. Critical Files Reference

| File | Role |
|---|---|
| `src/lib/game/production/engine/tick/runServerTicks.ts` | The simplified game loop |
| `src/lib/game/production/engine/math/production.server.ts` | Per-building production (thin wrapper) |
| `src/lib/game/production/math/production.ts` | Per-building production math |
| `src/lib/game/production/engine/math/power.server.ts` | Power grid (thin wrapper) |
| `src/lib/game/production/math/power.ts` | Power grid math |
| `src/lib/game/production/engine/math/multipliers.server.ts` | Modifier cache builder |
| `src/lib/game/production/math/multipliers.ts` | Cache consumer + typed contract |
| `src/lib/game/production/math/endgame.ts` | Endgame income switch |
| `src/lib/game/production/engine/tick/productionSnapshot.ts` | Final snapshot builder |
| `src/lib/game/production/snapshot/emptyProductionSnapshot.ts` | Empty stub (shipped to UI) |
| `src/lib/game/production/definitions.ts` | Building/worker lookup |
| `src/lib/game/production/engine/util/serverRandom.ts` | Secure RNG (crypto-first, Math.random last-resort) |
| `src/app/api/game/production/compute/route.ts` | Orphan oracle endpoint |
| `src/app/api/game/state/offline-progress/route.ts` | Offline tick + persist |
| `src/app/api/game/state/live-tick/route.ts` | Live tick + persist (no snapshot response) |
| `src/app/api/game/state/sync/route.ts` | Cloud load/save |
| `src/lib/game/actions/server/shared/elapsedTickPersistence.ts` | Live-tick persistence |
| `src/lib/game/actions/server/shared/correctedStatePersistence.ts` | Action-correction persistence |
| `src/lib/db/game/serverGameState.ts:783-798` | CAS primitive |
| `src/lib/game/state/store.ts:47-90` | SERVER_FIELDS (excludes productionSnapshot) |
| `src/lib/game/state/store.ts:124-144` | applyServerState |
| `src/lib/game/state/initialClientState.ts:147-187` | Stub UI state |
| `src/lib/db/game/serverGameStatePayload.ts:24-31` | SERVER_STATE_UI_FIELDS strip list |
| `src/lib/hooks/page/useLiveServerTick.ts` | Client live-tick poller |
| `src/lib/hooks/page/useOfflineProgressCheck.ts` | Client offline-tick trigger |
| `src/lib/hooks/cloudSync/CloudSyncService.ts` | Client cloud load/save |
| `src/lib/auth/applyElapsedTicks.ts:61-130` | Elapsed-tick calculator |
| `src/lib/auth/rateLimiter.ts:37` | `serverTick` profile (12/min, fail-closed) |
| `src/lib/game/config/runtimeCache.ts:112-116` | `BUILDING_ID_MIGRATION` (duplicated) |
| `src/lib/db/config/serverConfigFetcher.ts:113` | Duplicate `ID_MIGRATION_MAP` |
| `src/lib/db/config/serverConfigFetcher.ts:347-405` | Config fetch |
| `src/lib/game/config/transformers/buildings.ts:26-32` | Recipe flattening into BuildingDef |
| `supabase/migrations/20260622141113_009_game_config_tables.sql` | DDL for all config tables |
| `BUGS.md` | Resolved bug registry (BUG-043, BUG-046, BUG-048, BUG-052, BUG-066, BUG-067, BUG-068, BUG-069 relevant) |
| `docs/ECONOMY_AUDIT.md:62-66` | Building chain + recipe chain invariants |
| `docs/SERVER_TICK_CHAIN_PLAN.md:7-48` | Tick ownership + cursor invariants |

---

## 7. Test Files to Create (Caveman List)

```
tests/unit/buildings/inactive.test.ts                      → TST-001
tests/unit/production/unknownBuilding.test.ts               → TST-002
tests/unit/production/extractor.test.ts                    → TST-003
tests/unit/production/factory.test.ts                       → TST-004, TST-005
tests/unit/production/factoryInputConsumption.test.ts       → TST-005
tests/unit/production/factoryRace.test.ts                  → TST-006 (extend gameTick.inputFloor.test.ts)
tests/integration/buildings/coalMine.test.ts                → TST-007
tests/unit/power/coalFuelConsumption.test.ts               → TST-008, TST-009
tests/unit/power/fuelStarved.test.ts                        → TST-010
tests/unit/power/shortage.test.ts                           → TST-011
tests/unit/workers/bonus.test.ts                            → TST-012
tests/unit/workers/noWorker.test.ts                         → TST-013
tests/unit/modifiers/eventAppliedOnce.test.ts               → TST-014
tests/unit/modifiers/researchAppliedOnce.test.ts            → TST-015
tests/unit/storage/cap.test.ts                              → TST-016
tests/unit/storage/fullCap.test.ts                          → TST-017
tests/unit/tick/determinism.test.ts                         → TST-018
tests/api/game/compute.race.test.ts                         → TST-019
tests/api/game/compute.persistence.test.ts                  → TST-020
tests/integration/state/sync.roundtrip.test.ts              → TST-021
tests/components/factoryPanel.test.tsx                     → TST-022
tests/integration/tick/offlineLive.test.ts                  → TST-023
```

**Verification gate after each batch (every 5 tests added):**

```bash
npm run typecheck                       # tsc --noEmit
npm run test:vitest -- --run           # vitest run
npm run lint                            # eslint
```

**Full validation before commit:**
```bash
npm run test:vitest
npm run test                            # tsx integration + security
npm run lint
bunx tsc --noEmit
```

---

## 8. Final Verdict

**PARTIALLY CONNECTED — with one critical end-to-end break.**

| Layer | Status |
|---|---|
| Config schema (DB → BuildingDef) | ✅ Wired |
| Recipe flattening | ✅ Wired |
| Production math (computeProduction) | ✅ Wired, but no diagnostic on `!def` |
| Power math (computePowerGrid) | ✅ Wired |
| Modifier pipeline (research/weather/prestige/mega) | ✅ Wired with documented double-application risks |
| Storage cap | ✅ Wired but silent, hasUnlimitedStorage not honored server-side |
| runServerTicks | ✅ Wired, labeled "simplified" — events/contracts/drones not in loop |
| Offline-progress persistence (CAS) | ✅ Wired |
| Live-tick persistence (CAS) | ✅ Wired |
| Sync persistence (CAS) | ✅ Wired |
| Production compute endpoint | ❌ **Orphan oracle** — no client caller, no DB write |
| Cloud sync round-trip for gameplay state | ✅ Wired |
| Cloud sync round-trip for productionSnapshot | ❌ **BROKEN** — not in SERVER_FIELDS, no setter, UI permanently reads empty stub |
| UI display from server snapshot | ✅ Wired (panels read the field) |
| UI trust boundary (no local recompute) | ✅ Held |
| Concurrency protection (state_version CAS) | ✅ Wired for offline/live/sync; ❌ missing on `/compute` |

**The single highest-priority defect:** `productionSnapshot` is generated on the server every tick, returned in the offline-progress JSON body, but **never installed in the client Zustand store**. As a result, every rate display in `FactoryPanel`, `ResourcePanel`, `PowerPanel`, `StoragePanel`, `GlobalResourceMonitorPanel`, `ProductionChainsPanel`, `ResourceFlowDiagram`, `AIAdvisorPanel`, `TransportPanel`, `DashboardPanel` renders as zero. Resource inventory and money updates correctly (they are server-authoritative fields), but the player sees no production rate, no fill bar progress, no power surplus, no RP/CP income — even while the server is happily minting resources in the background.

**Secondary defects:**

1. `/api/game/production/compute` is an orphan oracle with no caller and no persistence — high-risk if ever wired without CAS + idempotency.
2. `computeProduction` returns identical shape for inactive and unknown-definition cases — no diagnostic, no log, no error code.
3. Storage overflow silently discards production with no telemetry.
4. `hasUnlimitedStorage()` not honored server-side after Terraforming Engine — client/server divergence.
5. `production.payout` modifier applied in two scopes under one field name — undocumented, fragile to refactor.
6. Event modifiers registered twice (cache + registry), only one consumed — fragile.
7. Endgame money/RP/CP rates hardcoded in `endgame.ts:55-110` switch — bypasses config SSOT.
8. Payout rates hardcoded in `payout.ts:31-33` — bypasses config SSOT.
9. `BUILDING_ID_MIGRATION` duplicated in `runtimeCache.ts:112-116` and `serverConfigFetcher.ts:113`.
10. `solarPanel` DB row has no `BuildingType` union entry or catalog entry — dead row.

This audit is grounded in current code only. No architectural assumption is asserted that isn't verified by file:line.

---

## 9. Full End-to-End Validation — 2026-07-15

### 9.1 Validation scope and evidence standard

This section is the second-pass validation of Sections 1–8. It does not accept the original audit as authority. Claims were re-traced through the current working tree across:

- Supabase migrations and config loaders.
- Building/recipe transforms and runtime caches.
- Server tick math, power, fuel, workers, modifiers, storage, payout, and endgame income.
- Live tick, offline progress, action dispatch, compute API, persistence, CAS, and cron/admin callers.
- Zustand hydration, cloud sync, offline hook, live poller, and UI consumers.
- Existing architecture, API, unit, and integration tests.
- Import/call relationships. A local AST graph covered 5,714 nodes, 14,165 edges, and 260 communities. Graphify MCP queries were unavailable, so source reads and import searches remain the authority.

The repository was not clean during this validation: source, tests, migrations, `.rules`, and planning files have uncommitted changes. Findings therefore describe the current working tree on 2026-07-15, not an immutable commit. No production source code was modified for this validation; only this report was updated.

**Verdict vocabulary:** `confirmed` means the behavior is directly reachable in current code; `partially confirmed` means the reported symptom is real but its scope or cause was overstated; `outdated` means the cited path/behavior changed; `rejected` means the claim is not supported by current code.

### 9.2 Executive verdict

**Final verdict: PARTIALLY CONNECTED, UI-BROKEN END-TO-END, AND OVERENGINEERED AT THE BOUNDARIES.**

The authoritative economy path is not wholly broken. Supabase building and recipe rows reach `GameConfig`, `runServerTicks()` mutates a cloned server state, live/offline settlement persists gameplay fields through `state_version` CAS, and ordinary resources/money/buildings/game time survive reload. The production-status path is broken: the server builds a nonzero `productionSnapshot`, but the live route does not return it, the offline hook discards it, `applyServerState()` preserves the old client snapshot, and cloud persistence deliberately strips it. Fourteen UI consumers therefore remain on the zero stub.

The system is also overengineered in a narrower sense: several compatibility barrels, one-to-one server wrappers, duplicated transforms, duplicated ID maps, parallel client/server calculations, and static tests aimed at deleted paths increase maintenance and failure surface. This does **not** prove that every wrapper is safe to delete immediately. Removal is safe only after caller migration and targeted validation.

| Area | Validated state | Confidence |
|---|---|---:|
| Server resource/money settlement | Connected through live/offline/action elapsed-tick paths | High |
| `productionSnapshot` response → store → UI | Broken | High |
| Compute API | Authenticated, rate-limited, authoritative read; orphan and non-persisting | High |
| Config → recipe production | Connected for buildings/recipes; chains not consumed by engine | High |
| Power/fuel/storage invariants | Connected but contain silent loss, fallback, and client/server divergence | High |
| Concurrency | CAS prevents two commits from both winning; no row lock, extra work can be duplicated | High |
| Test trustworthiness | Materially insufficient; Phase 13 shape test is stale and currently fails | High |
| Architecture | Partially connected and over-layered | High |
| Global market aggregate `/api/market/supply/aggregate` | **Silently broken (V-032): cron reads stripped field, supply always 0** | High |
| `*ExpenseRate` snapshot fields | **Always 0 (V-035): UI advisors cannot break even** | High |
| Phase 13 strip symmetry | Incomplete: 2 of 3 writer families call `stripUIFields`; elapsed-tick and live-tick response miss it | High |

### 9.3 Original nine concerns — validated matrix

| # | Original report claim | Validation verdict | Corrected evidence |
|---:|---|---|---|
| 1 | Workers add bonuses rather than being required | **Confirmed** | `src/lib/game/production/math/production.ts:60-72` skips worker effects when no workers exist; extractors/factories can still produce when other conditions pass. |
| 2 | Storage caps output and silently discards overflow | **Confirmed, citation corrected** | `src/lib/game/production/engine/tick/runServerTicks.ts:100-109` caps with `Math.min`; storage source is `src/lib/game/shared/utils/costCalculator.ts:52-65`, not `src/lib/capacity.ts`. |
| 3 | `canProduce` has no blocked reason | **Confirmed** | `BuildResult` in `src/lib/game/production/math/production.ts:8-17` has only boolean `canProduce`; no reason enum/code. |
| 4 | Unknown and inactive buildings return the same shape | **Confirmed** | `production.ts:26-36` uses one `!def || !building.active` branch; power and payout paths also skip missing definitions without diagnostics. |
| 5 | Power shortage reduces global efficiency instead of hard-stopping buildings | **Confirmed** | `src/lib/game/production/math/power.ts:110-120` computes a global ratio with a configured minimum floor; `production.ts:40-42` applies it to each building. |
| 6 | Fuel-starved plants can generate reduced power | **Confirmed, with runner nuance** | `power.ts:52-63` applies `fuelStarvedOutputRatio`; `runServerTicks.ts:70-76` then subtracts `actualAmount`. The pure math function alone does not mutate the resource; the tick runner does. |
| 7 | `/api/game/production/compute` returns state without persisting | **Confirmed** | `src/app/api/game/production/compute/route.ts:350-363` runs the authoritative engine and returns JSON without `saveServerGameStateOptimistic`; no production caller exists. |
| 8 | `runServerTicks()` is documented as simplified | **Confirmed** | `src/lib/game/production/engine/tick/runServerTicks.ts:1-9` explicitly says simplified and omits contracts, market drift, drones, and event mutation from the tick loop. |
| 9 | Production chains are loaded but unused by production | **Partially confirmed** | The engine does not read `config.productionChains` for gating or math, but chains are consumed by runtime derived display/event paths (`runtimeCache.ts:379-387`, `src/lib/game/events/eventRandom.ts:19-29`, `src/lib/game/events/archetypeDefinitions.ts:74,89,100`). “UI only” was too broad. |

### 9.4 End-to-end execution-chain diagrams

#### Authoritative config and tick settlement

```text
Supabase game_config_buildings / production_recipes / workers / weather / research
  → fetchGameConfigFromSupabase()
    src/lib/db/config/serverConfigFetcher.ts:347-405, 430-480
  → transformBuildings() joins recipes into BuildingDefinition.inputs/outputs
    src/lib/game/config/transformers/buildings.ts:22-61
  → buildMultipliersServer()
    src/lib/game/production/engine/math/multipliers.server.ts:52-243
  → runServerTicks()
    build cache → computePowerGridServer → mutate fuel → computeProductionServer
    → cap outputs → computeEndgameIncomeServer → advanceWeatherTick
    src/lib/game/production/engine/tick/runServerTicks.ts:33-124
  → saveServerGameStateOptimistic() with state_version CAS
    src/lib/game/actions/server/shared/elapsedTickPersistence.ts:130-165
    src/app/api/game/state/offline-progress/route.ts:590-608
  → server_game_state.full_state + denormalized fields
```

#### Live browser settlement

```text
useLiveServerTick() [10s base, exponential backoff]
  → POST /api/game/state/live-tick
    verifyAuth/guest identity → rate limit → load server row
    → applyElapsedServerTime()
      → applyElapsedTicks() → runServerTicks()
      → CAS persist
  → { newState, ticksApplied, gameTick }       [NO productionSnapshot]
  → applyServerState(newState)
  → SERVER_FIELDS applied; productionSnapshot preserved from previous store
  → 14 UI consumers render emptyProductionSnapshot()
```

Evidence: `src/lib/hooks/page/useLiveServerTick.ts:77-94`, `src/app/api/game/state/live-tick/route.ts:45-87`, `src/lib/game/state/store.ts:47-144`.

#### Offline settlement

```text
useOfflineProgressCheck()
  → POST /api/game/state/offline-progress
  → server time / config / cursor / lock validation
  → runServerTicks(baseState, elapsedTicks, config)
  → CAS persist full_state + denormalized fields
  → { newState, productionSnapshot, ticksApplied, elapsedSeconds }
  → hook parses only newState/ticksApplied/elapsedSeconds
  → applyServerState(newState)
  → returned productionSnapshot is discarded
```

Evidence: `src/app/api/game/state/offline-progress/route.ts:430-640`, `src/lib/hooks/page/useOfflineProgressCheck.ts:65-105`.

#### Action settlement — broader than the original report stated

```text
any of 19 dispatched actions
  → runActionCommand()                         commandDispatcher.ts:22-75
  → loadActionContext()
  → applyElapsedServerTime()                   commandDispatcher.ts:32
  → applyElapsedTicks() → runServerTicks()
  → persist elapsed state by CAS
  → dispatch action validator/mutator
  → persist corrected action state by CAS
  → response
```

This means production settlement is transitively coupled to every action, not only the three explicitly listed tick routes. `set_game_speed` is an exception to corrected-state persistence but performs its own write; see V-020.

#### Orphan compute path

```text
POST /api/game/production/compute
  → auth → rate limit → ownership → tick cap → load config
  → read server_game_state.full_state
  → runServerTicks()
  → return { newState, productionSnapshot }
  → no DB write, no client caller, no CAS, no idempotency key
```

### 9.5 Validated issue dossiers

Each dossier records title, severity, confidence, original claim, verdict, complete flow, expected/actual behavior, root cause, impact, evidence, tests, minimal repair, removable/required code, change risk, and regression tests. Findings are deduplicated where multiple symptoms share one execution break.

#### V-001 — Production snapshot is generated but cannot reach the UI

- **Severity:** Critical. **Confidence:** High. **Audit claim:** original concern 14; broken snapshot pipeline.
- **Validation verdict:** **Confirmed.**
- **Files/functions and flow:** `runServerTicks()` → `buildProductionSnapshotServer()` (`runServerTicks.ts:33-124`) → offline response (`offline-progress/route.ts:635-640`) or live elapsed settlement (`live-tick/route.ts:70-87`) → `useLiveServerTick()` / `useOfflineProgressCheck()` → `applyServerState()` (`state/store.ts:124-144`) → UI panels.
- **Expected:** The authoritative snapshot produced for the settled state is installed in the client UI session after live and offline settlement, without putting presentation state into `server_game_state.full_state`.
- **Actual:** Live response omits the snapshot. Offline response includes it, but the hook’s response type and logic consume only `newState`; `applyServerState()` applies only `SERVER_FIELDS` and explicitly preserves `prev.productionSnapshot`. `SERVER_STATE_UI_FIELDS` also strips the field from persistence.
- **Root cause:** The Phase 13 server/UI split removed the only write path for a value that UI consumers still require; response contracts were not updated together.
- **Impact:** Fourteen consumers display zero/stale rates, power surplus, payout, storage-flow, RP/CP, and advisor data while server resources and money advance correctly. Direct economy persistence is not lost, but player observability and perceived progress are broken.
- **Evidence:** `src/lib/game/state/store.ts:47-90,124-144`; `src/lib/db/game/serverGameStatePayload.ts:24-50`; `src/lib/hooks/page/useLiveServerTick.ts:9-10,77-94`; `src/lib/hooks/page/useOfflineProgressCheck.ts:65-105`; `src/lib/hooks/cloudSync/serializeGameState.ts:53-57` (serializes it, server strip removes it).
- **Existing tests:** API tests cover auth/settlement shape only; store composition checks field presence. No live/offline snapshot-to-store test. The Phase 13 static test currently flags response snapshots as violations and is not a valid replacement.
- **Missing tests:** live response snapshot application; offline hook snapshot application; non-persistence of snapshot in `full_state`; UI rate render after a settled tick.
- **Minimal repair:** Keep snapshot client-only and non-persisted. Add one explicit snapshot application path to the store, propagate the snapshot through live elapsed settlement, and make the offline hook apply the returned snapshot. Do not add it to `SERVER_FIELDS` or `full_state` unless the architecture intentionally changes.
- **Remove / keep:** Remove no math. After migration, remove any temporary response-shape adapters. Keep `buildProductionSnapshotServer()`, `emptyProductionSnapshot()` as cold-start state, and `stripUIFields()`.
- **Risk:** Medium. Incorrect propagation can show a snapshot for the wrong state version; tests must assert snapshot and `newState` come from the same settlement.
- **Required regression tests:** `tests/api/game/live-tick.test.ts` snapshot contract; `tests/api/game/offline.test.ts` snapshot contract; `tests/integration/state/snapshot.roundtrip.test.ts`; `tests/components/productionSnapshotConsumers.test.tsx`.

#### V-002 — Workers are optional bonuses, not a production prerequisite

- **Severity:** High if workers are intended as a hard requirement; Medium if bonus-only design is intentional. **Confidence:** High. **Audit claim:** concern 1.
- **Validation verdict:** **Confirmed behavior; design intent unresolved.**
- **Flow:** `computeProduction()` resolves assigned workers and applies speed/efficiency/maintenance only inside `for (assignedWorkers)` (`production.ts:60-72`) → extractor/factory branch returns `canProduce: true` when definitions and inputs permit → tick runner consumes/credits.
- **Expected:** If the product rule requires staffing, zero workers should block production and return a reason. If workers are bonuses, current behavior is correct but must be documented and tested.
- **Actual:** Zero workers yields no worker bonus and `workerPowerSavings=0`; extractors and factories still run.
- **Root cause:** Worker assignment is modeled as a multiplier, not a validator/precondition.
- **Impact:** Possible balance exploit or expected idle-production behavior; no direct security issue.
- **Evidence/tests:** `production.ts:60-72,89-138`; existing worker validator tests cover hire/assign, not zero-worker production semantics.
- **Minimal repair:** Product decision first. For bonus-only design, retain code and add invariant documentation/tests. For mandatory staffing, add a single server-side precondition before output/input application; do not duplicate worker logic in UI.
- **Remove / keep:** Remove no worker math. Keep server worker validation and `workersByBuilding` cache.
- **Risk/tests:** High balance risk if changed. Add zero-worker extractor/factory and one-worker multiplier tests (`TST-012`, `TST-013`) plus end-to-end tick assertions.

#### V-003 — Storage overflow silently destroys output

- **Severity:** High. **Confidence:** High. **Audit claim:** concern 2 and TST-016/017.
- **Validation verdict:** **Confirmed.**
- **Flow:** production result outputs → `runServerTicks.ts:100-109` → `Math.min(capacity, current + output.amount)`.
- **Expected:** Product must explicitly choose one policy: block/slow production before input debit, or permit production and expose waste. Either policy must be observable.
- **Actual:** Inputs are debited when `canProduce` is true; output above capacity is discarded without a waste field, log, metric, or UI signal.
- **Root cause:** Storage is applied after production and has no output-acceptance result.
- **Impact:** Resource production is lost; player sees a running factory pinned at capacity. Economy state remains bounded, but economic value disappears silently.
- **Evidence/tests:** `runServerTicks.ts:88-109`; no behavior test covers full-cap policy. Existing storage validator tests cover upgrades, not tick overflow.
- **Minimal repair:** Preserve one authoritative server policy. Prefer returning accepted/wasted output in the snapshot or blocking only the affected output/input transaction if design requires no waste. Do not move cap logic into React.
- **Remove / keep:** Keep cap enforcement. Remove no code until design and snapshot schema are fixed.
- **Risk/tests:** High economy risk. Add `TST-016` cap, `TST-017` full-cap policy, multi-output partial acceptance, and offline/live parity tests.

#### V-004 — Capacity defaults and unlimited-storage state diverge between client and server

- **Severity:** High. **Confidence:** High. **Audit claim:** storage fallback and Terraforming Engine caveat.
- **Validation verdict:** **Confirmed, with corrected path.**
- **Flow:** client `getCapacity()` → `costCalculator.ts:52-65` checks `hasUnlimitedStorage()` then defaults missing capacity to `50`; server tick output path → `runServerTicks.ts:103-104` defaults missing capacity to `Infinity` and never checks `hasUnlimitedStorage()`.
- **Expected:** One server-controlled capacity rule, with mega-project and missing-config behavior identical across all consumers.
- **Actual:** Completed unlimited-storage project is honored by client utility but not in the server tick path; missing capacity is finite client-side and infinite server-side.
- **Root cause:** Capacity policy is split between client utility and tick mutation; server does not use the shared project/config rule.
- **Impact:** Client previews and server settlement disagree; missing DB rows can create unbounded production on server, while client shows a 50 cap. Data-integrity/economy risk.
- **Evidence/tests:** `src/lib/game/shared/utils/costCalculator.ts:52-65`; `src/lib/game/shared/utils/hasUnlimitedStorage.ts:11-17`; `runServerTicks.ts:100-109`.
- **Minimal repair:** Move capacity resolution to one server-authoritative helper with explicit fail-closed behavior for missing required capacity; have client consume returned authoritative capacity/state.
- **Remove / keep:** Remove duplicate client fallback only after callers migrate. Keep `hasUnlimitedStorage()` as a presentation/helper API only if it delegates to the same rule.
- **Risk/tests:** High. Add missing-capacity, completed-mega-project, normal-cap, and live/offline parity tests.

#### V-005 — Unknown definitions and inactive buildings are indistinguishable and silent

- **Severity:** High. **Confidence:** High. **Audit claim:** concerns 3 and 4.
- **Validation verdict:** **Confirmed.**
- **Flow:** `computeProduction()` lookup → one `!def || !building.active` early return (`production.ts:26-36`) → tick runner skips false result; power and payout use `continue`/truthy category filters (`power.ts:40-45,90-99`, `payout.ts:20-30`).
- **Expected:** Inactive is a valid deliberate state; unknown definition is configuration/data corruption and must be diagnosable. `canProduce=false` should carry a stable reason when callers need to explain it.
- **Actual:** Both return empty outputs/inputs/actualInputs, efficiency 0, false, and no reason/log/metric. A factory with missing recipes reaches the final `canProduce: true` empty-output fallback (`production.ts:140-148`).
- **Root cause:** Result type carries outcome but not failure classification; config validation is not enforced at engine boundary.
- **Impact:** Buildings can silently never produce; operators cannot distinguish player choice from broken config. Security impact is indirect: invalid config can hide economy failures.
- **Evidence/tests:** `production.ts:8-17,26-36,140-148`; `power.ts:40-45`; `payout.ts:20-30`. No unknown-definition behavior test exists.
- **Minimal repair:** Add a non-economy diagnostic reason (`inactive`, `unknown_definition`, `missing_recipe`, `missing_input`) or a separate validated diagnostic channel; do not make inactive an error.
- **Remove / keep:** Keep the short-circuit. Remove no branch until all callers handle diagnostics.
- **Risk/tests:** Low math risk, medium API-shape risk. Add `TST-001`, `TST-002`, missing-recipe, and server log/diagnostic assertions.

#### V-006 — Power shortage applies a global minimum-efficiency floor

- **Severity:** High balance risk. **Confidence:** High. **Audit claim:** concern 5.
- **Validation verdict:** **Confirmed behavior; intended policy not proven.**
- **Flow:** `computePowerGrid()` totals active production/consumption → ratio with `minEfficiency` floor (`power.ts:110-120`) → runner writes `cache.powerEfficiency` (`runServerTicks.ts:56`) → every building multiplies efficiency (`production.ts:40`).
- **Expected:** Either global throttling or per-building hard stop must be a documented game rule.
- **Actual:** Shortage throttles all eligible production; no individual building is stopped solely because its own power demand cannot be met. A configured floor can preserve nonzero production during severe shortage.
- **Root cause:** One scalar power efficiency is used as the production gate.
- **Impact:** Balance and player expectations; potential production during severe overload. No direct unauthorized mutation.
- **Minimal repair:** Product decision first. If global throttling is intended, document and test it. If hard stop is intended, add server-only allocation policy; do not approximate it in UI.
- **Tests:** `TST-011`, shortage floor, zero-production, and deterministic multi-building allocation tests.

#### V-007 — Fuel-starved plants produce reduced power and retain no unconsumed fuel debit in pure math

- **Severity:** Medium/High balance risk. **Confidence:** High. **Audit claim:** concern 6.
- **Validation verdict:** **Confirmed, with execution-chain clarification.**
- **Flow:** `computePowerGrid()` detects insufficient fuel → applies `getBalance().power.fuelStarvedOutputRatio`, reports `actualAmount` (`power.ts:52-63`) → `runServerTicks()` subtracts actual amount (`runServerTicks.ts:70-76`).
- **Expected:** Balance policy must specify whether partial fuel yields partial power and whether all remaining fuel is consumed.
- **Actual:** Partial fuel yields reduced power; the tick runner consumes the available amount, while the pure function leaves resource mutation to its caller.
- **Root cause:** Fuel calculation and resource mutation are separate APIs with comments that can be misread.
- **Impact:** Intended or unintended power generation without full fuel; possible balance exploit if ratio/config wrong.
- **Minimal repair:** Keep one server policy, document partial-fuel semantics, validate finite ratio from balance config, and expose fuel-starved status in snapshot.
- **Tests:** `TST-008`–`TST-010`, insufficient fuel and exact debit tests.

#### V-008 — Production chains are display/event data, not engine dependencies

- **Severity:** Medium. **Confidence:** High. **Audit claim:** concern 9.
- **Validation verdict:** **Partially confirmed.**
- **Flow:** DB chains → `fetchGameConfigFromSupabase()` → `runtimeCache.updateFromSupabase()` derives `PRODUCTION_CHAINS` → UI and event/archetype consumers. `runServerTicks()` and `computeProduction()` use flattened `def.inputs/outputs`, not chain edges.
- **Expected:** If chains define dependency gating, engine must consume them; otherwise docs/schema should call them derived display/event metadata.
- **Actual:** Recipes drive production. Chains do not gate upstream/downstream production. They are not wholly unused because `eventRandom.ts` and `archetypeDefinitions.ts` read derived chains.
- **Root cause:** The schema name suggests runtime dependency semantics, while code treats it as a derived graph for presentation/events.
- **Impact:** Adding/editing a chain does not change production math; operators can expect a dependency that does not exist.
- **Minimal repair:** Document display/event-only ownership or implement explicit server dependency rules. Do not remove chains until all event/UI consumers are migrated.
- **Tests:** config transform, event chain consumer, and “chain change does/does not alter production” contract tests.

#### V-009 — `/api/game/production/compute` is an orphan, non-persisting oracle

- **Severity:** Medium today; Critical if wired as a mutation. **Confidence:** High. **Audit claim:** concern 7 and TST-019/020.
- **Validation verdict:** **Confirmed.**
- **Flow:** POST route auth/rate limit/ownership/tick cap/config/state load → `runServerTicks()` → JSON response; grep found no caller in `src/lib`, `src/components`, or `src/app` and route has no CAS write.
- **Expected:** An endpoint named compute must either be explicitly documented as a read-only preview or be the authoritative mutation endpoint with CAS/idempotency.
- **Actual:** It returns a hypothetical new state but does not persist it. The client does not call it.
- **Root cause:** A legacy oracle remains beside live/offline settlement APIs.
- **Impact:** Misleading API contract and future double-apply risk; currently no live user impact because no caller.
- **Minimal repair:** Prefer remove route and tests if no approved caller exists; otherwise rename/document as preview and never use response as persisted truth. If mutation is required, reuse CAS settlement rather than adding a second writer.
- **Remove / keep:** Candidate for removal: route, orphan response type/tests, after repository-wide caller check. Keep `runServerTicks()`.
- **Risk/tests:** Medium. Add an explicit “preview is non-mutating” test or mutation CAS race test before removal/wiring.

#### V-010 — The simplified tick engine does not settle every game subsystem

- **Severity:** High if omitted systems are expected to progress offline/live. **Confidence:** High. **Audit claim:** concern 8.
- **Validation verdict:** **Confirmed.**
- **Flow:** `runServerTicks()` processes weather, power/fuel, production, caps, endgame income; no contract array mutation, market drift, drone mission progression, or event-state mutation appears in its loop (`runServerTicks.ts:33-124`).
- **Expected:** Every subsystem advertised as time-based must have a named owner and parity between live/offline/action elapsed paths.
- **Actual:** All elapsed action paths transitively use the same simplified runner, so omitted subsystems are consistently omitted, not divergent.
- **Root cause:** “Server tick” is a partial production/economy engine, while other time systems have separate or absent owners.
- **Impact:** Offline/live progression gaps for omitted systems; not a production double-apply by itself.
- **Minimal repair:** Maintain a subsystem ownership matrix. Add only required systems to the authoritative runner; do not silently expand the loop with client logic.
- **Tests:** offline/live parity per subsystem; contract, drone, market, event time progression tests.

#### V-011 — Payout rates bypass config and `production.payout` has three application sites

- **Severity:** High balance/config integrity. **Confidence:** High. **Audit claim:** original payout hardcodes and modifier scope.
- **Validation verdict:** **Confirmed; original count corrected.**
- **Flow:** `computePayout()` uses literals 20/50/10 (`payout.ts:30-45`) → applies `productionBonus` (`payout.ts:58`) while `computeProduction()` applies the same cache field (`production.ts:87`) and `computeEndgameIncome()` applies it (`endgame.ts:49-53`).
- **Expected:** Balance values come from DB/runtime config and target scopes are explicitly distinct.
- **Actual:** Payout category rates are hardcoded; one field named `productionBonus` affects ordinary production, payout, and endgame income.
- **Root cause:** Static balance logic survived the config migration and a shared modifier name hides three scopes.
- **Impact:** DB tuning does not affect payout rates; future refactors can double-apply or remove a scope.
- **Minimal repair:** Load named payout/endgame rates from validated balance/building config; split modifier fields or document exact scopes and add one-scope tests.
- **Remove / keep:** Remove literals and dead scope adapters after config contract is live. Keep `computePayout()` and endgame owner separation.
- **Tests:** `TST-015`, payout config fixture, endgame modifier scope, and “one modifier value, three intended scopes” tests.

#### V-012 — Endgame income is a hardcoded type switch

- **Severity:** High. **Confidence:** High. **Audit claim:** additional hardcoded endgame concern.
- **Validation verdict:** **Confirmed.**
- **Flow:** active hardcoded type list → `switch (b.type)` rates 8000/100000/etc. (`src/lib/game/production/math/endgame.ts:25-110`) → money/RP/CP added by `runServerTicks()`.
- **Expected:** A new configured endgame building should produce according to a validated config record, or fail visibly at config validation.
- **Actual:** New type not added to the switch earns no endgame income; DB definition outputs are bypassed.
- **Root cause:** Endgame rates are encoded in code rather than one config/catalog source.
- **Impact:** Never-producing/never-paying endgame buildings and silent balance drift.
- **Minimal repair:** Move rates to validated config keyed by building ID; retain a fail-closed unknown-type diagnostic rather than a zero-success path.
- **Tests:** all existing 14 types, unknown tier-5 type, config rate override, endgame offline/live parity.

#### V-013 — Event modifiers have parallel cache and registry paths

- **Severity:** Medium. **Confidence:** High. **Audit claim:** duplicate event application risk.
- **Validation verdict:** **Confirmed redundancy; current double-application not proven.**
- **Flow:** `buildMultipliersServer()` manually folds `state.activeEvents` into event fields (`multipliers.server.ts:91-110`) while `buildModifierRegistry()` registers event modifiers (`src/lib/game/modifiers/registry.ts:136`); current production math reads manual cache fields.
- **Expected:** One authoritative event-to-multiplier path.
- **Actual:** Two representations exist; `eventResearch` is built but never consumed by production math, while registry event modifiers are not the path used for those cache fields.
- **Root cause:** Backward-compatibility fields were retained after modifier-engine introduction.
- **Impact:** Current output is not proven double-applied, but future consumers can apply events twice or ignore them.
- **Minimal repair:** Choose registry as source, expose only required resolved fields, delete unused manual/event fields after caller migration.
- **Remove / keep:** Candidate removal: `eventResearch` and duplicate event fold if no caller remains. Keep one event registry path.
- **Tests:** event global/targeted/power/research each exactly once; registry/cache equivalence.

#### V-014 — Server transport coefficient diverges from client balance source

- **Severity:** Medium. **Confidence:** High. **Audit claim:** newly discovered hardcoded multiplier.
- **Validation verdict:** **Newly discovered, confirmed.**
- **Flow:** server `multipliers.server.ts:154-164` calculates `transportProductionBonus` with literal `0.25`; client `multipliers.ts:141-150` uses `getBalance().transport.productionBonusCoeff`.
- **Expected:** Same validated coefficient and source on both sides, with server authoritative.
- **Actual:** Coefficient can differ when DB balance changes; server and client snapshots/previews diverge.
- **Root cause:** Server-side hardcode bypasses balance config.
- **Impact:** Balance inconsistency and misleading client projections; server economy remains authoritative.
- **Minimal repair:** Use validated server balance in server cache; have client consume server snapshot rather than recomputing economy values.
- **Tests:** coefficient override fixture and server/client multiplier parity test.

#### V-015 — Seasonal-event DB fields are discarded during runtime-cache transform

- **Severity:** Medium. **Confidence:** High. **Audit claim:** newly discovered config loss.
- **Validation verdict:** **Newly discovered, confirmed.**
- **Flow:** `fetchGameConfigFromSupabase()` loads `game_config_seasonal_events` (`serverConfigFetcher.ts:378-386`) → `runtimeCache.ts:330-341` maps every event to `duration: 500`, `color: '#a855f7'`, `triggerChance: 0.001`, omitting DB `start_date`, `end_date`, and `is_active`.
- **Expected:** DB schedule/status/effect metadata reaches the owner that selects seasonal events.
- **Actual:** Database columns are ignored and hardcoded values replace them.
- **Root cause:** Transform was shaped for an older local model and never updated with schema fields.
- **Impact:** Seasonal events can trigger/expire incorrectly; configuration changes appear ineffective.
- **Minimal repair:** Map and validate the actual columns or explicitly remove unused columns/table if not product-owned. No silent defaults for required schedule fields.
- **Tests:** DB-row-to-cache field preservation, inactive/scheduled event exclusion, duration/trigger config override.

#### V-016 — Building transforms and ID migration maps are duplicated three ways

- **Severity:** Medium. **Confidence:** High. **Audit claim:** duplicated transform/map.
- **Validation verdict:** **Confirmed; original count corrected.**
- **Flow:** `src/lib/game/config/transformers/buildings.ts:1-61` and `src/lib/db/config/serverConfigFetcher.ts:117-181` both implement `parseCostMap()`/`transformBuildings()`; ID maps exist in `runtimeCache.ts:112-116`, `serverConfigFetcher.ts:111-115`, and `src/lib/game/migration/idMigration.ts:20-31`.
- **Expected:** One transform owner and one migration map, with compatibility wrappers only at boundaries.
- **Actual:** Changes can update one path but not another; the third map adds reverse compatibility semantics.
- **Root cause:** Path migration copied implementation instead of centralizing ownership.
- **Impact:** Config/save IDs and cost transforms can diverge; maintenance risk.
- **Minimal repair:** Select `transformers/buildings.ts` and `migration/idMigration.ts` as owners; import them from server fetcher/runtime cache, retaining reverse map only where proven needed.
- **Remove / keep:** Remove duplicate local implementations after import migration. Keep one explicit compatibility map and tests for all three IDs.
- **Tests:** transform equivalence, migration round-trip, null cost behavior, server/client config parity.

#### V-017 — Compatibility barrels and one-to-one server wrappers add indirection without behavior

- **Severity:** Low/Medium maintainability. **Confidence:** High. **Audit claim:** redundant code.
- **Validation verdict:** **Newly discovered, confirmed by call graph.**
- **Candidates:** `src/lib/game/production/engine/math/index.server.ts`; `production.server.ts`; `power.server.ts`; `payout.server.ts`; `endgame.server.ts`; `sell.server.ts`; `src/lib/game/config/server/configLoader.server.ts`; `src/lib/game/state/store-bootstrap.ts`; `src/lib/game/state/stubProductionSnapshot.ts`; `src/lib/game/config/cacheUpdate.ts`; `src/lib/game/config/buildingIdMigration.ts`.
- **Flow:** caller → compatibility barrel/wrapper → pure math/owner; wrappers mostly pass arguments through, with production/power/payout only packaging `GameDefs`.
- **Expected:** One discoverable owner per responsibility and compatibility files marked temporary with active importers.
- **Actual:** Direct owner modules and old barrels coexist; several have zero or one meaningful importer. The wrappers do not add validation, persistence, authorization, or behavior.
- **Root cause:** Refactor path migration stopped before caller migration.
- **Impact:** Import confusion, stale tests, larger blast radius; not a current economy defect by itself.
- **Minimal repair:** Migrate callers in small batches, run targeted tests after each, then delete only zero-importer wrappers. Keep `serverEngine.ts` until its many callers migrate; do not delete broad compatibility entry points prematurely.
- **Remove / keep:** Remove candidates listed above after graph/test proof. Keep real owners: `math/*.ts`, `engine/tick/runServerTicks.ts`, `state/initial*`, and any compatibility barrel with live external callers.
- **Tests:** import-graph architecture test, wrapper equivalence tests during migration, typecheck/build.

#### V-018 — Client power calculations duplicate and can diverge from server authority

- **Severity:** Medium. **Confidence:** High. **Audit claim:** newly discovered client/server duplication.
- **Validation verdict:** **Newly discovered, confirmed.**
- **Flow:** toggle action calls client `computePowerGrid()` and writes `powerGrid` (`src/lib/game/state/store-actions/buildings/buildingsActions.ts:194-227`); `PowerPanel.tsx:124-160` recomputes per-type output with hardcoded fuel/weather factors; server later recomputes with `computePowerGridServer()` and DB balance.
- **Expected:** UI may optimistically render, but one server snapshot should be the only economy status source.
- **Actual:** Client uses static `BUILDING_DEFS`, hardcoded `0.1`, `0.5`, `0.007`, etc.; server uses runtime balance and server definitions. `PowerPanel` then scales raw client values to a snapshot that is itself currently zero.
- **Root cause:** local responsiveness and legacy UI heuristics were retained after server-authoritative migration.
- **Impact:** stale/incorrect power status between action and next settlement; hidden divergence when balance/weather changes.
- **Minimal repair:** Keep only presentation-level optimistic feedback if necessary; replace numeric power display with the authoritative snapshot after settlement. Remove raw recalculation once no caller needs it.
- **Tests:** toggle response → server power snapshot; fuel/weather coefficient override; no client-only economy mutation.

#### V-019 — Action dispatch settles elapsed production for every action

- **Severity:** High complexity/concurrency. **Confidence:** High. **Audit claim:** original report understated tick-path count.
- **Validation verdict:** **Newly discovered, confirmed.**
- **Flow:** `runActionCommand()` (`src/lib/game/actions/server/commandDispatcher.ts:22-75`) always calls `applyElapsedServerTime()` at line 32 before dispatching any of 19 action cases; elapsed settlement writes CAS, then action correction writes CAS again.
- **Expected:** One clearly documented elapsed-tick owner with bounded work and a single conflict/retry contract.
- **Actual:** Build, research, market, worker, transport, reward, prestige, and other actions all transitively run production ticks. A single user gesture can trigger two sequential state-version writes.
- **Root cause:** time settlement is injected into the universal command dispatcher.
- **Impact:** extra latency/DB writes; more CAS conflicts and duplicate computation under concurrent requests. The CAS protects final state but not repeated work.
- **Minimal repair:** Keep one elapsed owner but document/measure it; consider a shared transaction/RPC or explicit route policy before changing architecture. Do not add a second tick path.
- **Tests:** all action types with zero/positive elapsed time, two concurrent actions, state-version increments, no double resource commit.

#### V-020 — `set_game_speed` bypasses corrected persistence and writes fire-and-forget

- **Severity:** High data-integrity. **Confidence:** High. **Audit claim:** newly discovered persistence bypass.
- **Validation verdict:** **Newly discovered, confirmed.**
- **Flow:** dispatcher invokes `handleSetGameSpeed()` → `speed.ts:31-37` calls `saveServerGameStateOptimistic()` without `await` → immediately returns `{valid:true}`; `persistCorrectedActionState()` intentionally skips this action (`correctedStatePersistence.ts:35-40`).
- **Expected:** Success response only after the authoritative speed write wins CAS; failure must be surfaced.
- **Actual:** Route can report success before persistence; a rejected/conflicting/failed write is only logged in a detached promise. Another action can race the same version.
- **Root cause:** special-case handler owns an asynchronous DB mutation outside the command persistence contract.
- **Impact:** stale speed after reload, lost update, false success; possible tick-rate mismatch until next load.
- **Minimal repair:** Make speed handler return a corrected state or a persistence result and await one CAS write through the common persistence path. Preserve allowed-speed validation.
- **Remove / keep:** Remove direct fire-and-forget write. Keep speed allowlist and server state version validation.
- **Tests:** persistence failure response, CAS conflict, response-after-write, concurrent speed/action request.

#### V-021 — No row lock exists, but CAS prevents two committed tick results from both winning

- **Severity:** Medium. **Confidence:** High. **Audit claim:** concern 18/no PG row locks.
- **Validation verdict:** **Partially confirmed.**
- **Flow:** routes load `server_game_state` → compute in memory → `saveServerGameStateOptimistic()` updates by `user_id` and expected `state_version` (`serverGameState.ts:784-798`).
- **Expected:** Concurrent mutations must not both commit from the same base version.
- **Actual:** No `FOR UPDATE`/advisory lock was found. Concurrent requests can both compute, but only one CAS update should match; the loser returns conflict/failure. This is not evidence of current double production, but it is duplicate work and retry pressure.
- **Root cause:** optimistic concurrency chosen without a transaction-level row lock.
- **Impact:** CPU/DB waste and 409s; correctness depends on every writer using CAS. Any bypass writer is dangerous.
- **Minimal repair:** Keep CAS as the common contract; audit every writer and fix bypasses before adding locks. Add row-lock/RPC only if measured contention requires it.
- **Tests:** parallel live/offline/action CAS race, exactly one version advance, retry semantics, no unconditional upsert.

#### V-022 — `structuredClone()` scales with the 60,000-tick compute cap

- **Severity:** Medium performance. **Confidence:** High. **Audit claim:** concern 19.
- **Validation verdict:** **Confirmed implementation; impact requires measurement.**
- **Flow:** `runServerTicks()` clones complete `ServerGameData` once per call (`runServerTicks.ts:38`) then loops up to caller-supplied ticks; `/compute` caps at 60,000 (`compute/route.ts:310-316`).
- **Expected:** API cap and CPU/memory budget should be tied to measured worst-case state size.
- **Actual:** One full clone plus per-tick scans of buildings/resources; no benchmark or timeout budget in the route.
- **Root cause:** safe mutation isolation prioritizes simplicity over bounded work.
- **Impact:** expensive orphan endpoint and offline/action settlement under large tick gaps; possible latency exhaustion.
- **Minimal repair:** Keep clone safety; lower/validate caps or benchmark and optimize only after profiling. Do not mutate caller state as a shortcut.
- **Tests:** 1/100/maximum tick benchmark, memory bound, timeout/error behavior.

#### V-023 — Last-resort `Math.random()` fallback is fail-open for security-sensitive IDs

- **Severity:** Medium. **Confidence:** High. **Audit claim:** concern 20.
- **Validation verdict:** **Confirmed as latent fallback, not proven on supported runtime.**
- **Flow:** `src/lib/game/production/engine/util/serverRandom.ts:33-34` and `src/lib/game/production/engine/ids.ts:35-43` use `Math.random()` only after secure path failure and comments say it should never run.
- **Expected:** Security-sensitive ID failure must throw/fail closed.
- **Actual:** A documented fallback still produces a weak value instead of refusing the operation.
- **Root cause:** availability fallback retained in security-sensitive helper.
- **Impact:** If runtime crypto support fails, predictable IDs may enable collisions/replay risks.
- **Minimal repair:** Throw on secure RNG failure for security IDs; reserve nonsecure fallback only for explicitly nonsecurity visual IDs.
- **Tests:** mock crypto failure and assert fail-closed; uniqueness/format tests.

#### V-024 — `powerGrid.plants` includes inactive plants in server tick state

- **Severity:** Low/Medium. **Confidence:** High. **Audit claim:** newly discovered active-filter omission.
- **Validation verdict:** **Newly discovered, confirmed.**
- **Flow:** `runServerTicks.ts:64-67` filters only `def?.category === 'power'`; `computePowerGrid()` itself filters active plants at `power.ts:36-38`.
- **Expected:** `powerGrid.plants` should match the active power set or be clearly defined as all configured plants.
- **Actual:** State field includes inactive power buildings while totals exclude them. Client local toggle path filters active plants (`buildingsActions.ts:218-223`).
- **Root cause:** snapshot/state list and math filter were implemented separately.
- **Impact:** stale/inconsistent UI or downstream consumers that trust `powerGrid.plants`.
- **Minimal repair:** Define field semantics and use one shared active filter; preferably derive display list from snapshot/server state.
- **Tests:** inactive plant list/totals consistency and toggle round-trip.

#### V-025 — Cron/admin money validator bypasses server wrapper and uses a separate theoretical path

- **Severity:** Medium. **Confidence:** High. **Audit claim:** newly discovered third caller.
- **Validation verdict:** **Newly discovered, confirmed.**
- **Flow:** cron validate-ticks and admin investigation actions call `computeMaxPossibleMoney()` (`src/lib/game/server-time/serverTickValidator.ts:35-85`) → direct `computeProduction`, `computePayout`, `computeEndgameIncome` imports from `productionCalculator`; it does not use `computeProductionServer` wrappers or `runServerTicks()`.
- **Expected:** Anti-cheat theoretical limits must share or intentionally declare the same definitions and modifier semantics as settlement.
- **Actual:** It builds a server cache but computes an optimistic infinite-resource theoretical value with a separate loop; wrapper migration is bypassed. It is not a second settlement writer, but it is a second economy model.
- **Root cause:** validation and settlement were never unified after the engine split.
- **Impact:** false positives/false negatives in cheat detection, especially around payout/endgame/worker/config changes.
- **Minimal repair:** Keep conservative validator semantics if required, but explicitly version and test it against the authoritative engine; reuse shared pure calculators with a clearly named “maximum” policy.
- **Tests:** validator vs tick engine fixtures; config/worker/modifier changes; cron/admin route authorization.

#### V-026 — Existing Phase 13 architecture test is stale and currently fails; it is not evidence of compliance

- **Severity:** High test integrity. **Confidence:** High. **Audit claim:** original report called it a silent false-positive.
- **Validation verdict:** **Outdated claim corrected to broken test.**
- **Flow:** `tests/unit/serverGameDataShape.test.ts` scans deleted/relocated paths (`:26-27,102-150,180-216`) and scans all API route text for `.productionSnapshot` (`:70-91`).
- **Expected:** Test should inspect current owners and distinguish a server response DTO from persisted `ServerGameData`.
- **Actual:** Targeted run failed: 13 tests failed, 1 passed. Failures include ENOENT for `src/lib/game/types.ts`, `src/lib/db/initialState.server.ts`, `src/lib/game/store-bootstrap.ts`, `src/lib/db/serverGameStatePayload.ts`, and `src/app/api/game/initial-state/route.ts`; the scan also flags valid response fields in compute/offline routes.
- **Root cause:** Phase 13 path migration changed files without updating static test paths and invariant scope.
- **Impact:** CI signal is invalid; either a real regression can be hidden behind disabled/stale tests or a correct implementation is rejected.
- **Minimal repair:** Update test paths to `src/lib/game/shared/types/state.ts`, `shared/types/server.ts`, `state/store.ts`, `db/game/serverGameStatePayload.ts`, and current route paths; split persisted-state purity from response-contract tests.
- **Remove / keep:** Remove stale path literals; keep the architectural invariant in a current form.
- **Required tests:** run the corrected test, add response DTO assertions, and add a static check that `productionSnapshot` is excluded from `full_state` but allowed in a response.

#### V-027 — `gameTick.inputFloor.test.ts` only partially represents current race protection

- **Severity:** Medium test integrity. **Confidence:** High. **Audit claim:** original TST-006 evidence.
- **Validation verdict:** **Partially confirmed/outdated test assumption.**
- **Flow:** current `runServerTicks()` mutates `state.resources` directly after each building (`runServerTicks.ts:78-109`); the test describes/asserts a shadow input-floor array from an older implementation.
- **Expected:** Test should prove sequential post-debit resources prevent two factories from consuming the same stock.
- **Actual:** Current engine may still be safe because each later building reads the mutated state, but the existing test does not fully prove the current code path.
- **Minimal repair:** Rewrite the test around actual `runServerTicks()` state mutations, two factories, one shared resource, and exact remaining stock.
- **Tests:** replacement for `TST-006`; no production change inferred from this test discrepancy.

#### V-028 — Snapshot consumer inventory was undercounted; WorkerPanel was misclassified

- **Severity:** Medium audit accuracy/UI impact. **Confidence:** High. **Audit claim:** original report listed 11 consumers and included WorkerPanel.
- **Validation verdict:** **Outdated count corrected.**
- **Actual consumers:** `FactoryPanel`, `ResourcePanel`, `PowerPanel`, `StoragePanel`, `DashboardPanel`, `GlobalResourceMonitorPanel`, `ProductionChainsPanel`, `ResourceFlowDiagram`, `AIAdvisorPanel`, `TransportPanel`, `MobileHeader`, `DesktopHeader`, `PrestigePanel`, and `MarketPanel` — 14 components/files. `WorkerPanel.tsx` reads worker state/bonuses and does not read `productionSnapshot`.
- **Impact:** Original UI blast-radius estimate was low; snapshot fix affects more surfaces.
- **Minimal repair/tests:** Update inventory and add one consumer smoke test per category. Do not add snapshot reads to WorkerPanel without a product requirement.

#### V-029 — Dead parameters and dead wrapper inputs obscure ownership

- **Severity:** Low. **Confidence:** High. **Audit claim:** newly discovered redundancy.
- **Validation verdict:** **Newly discovered, confirmed.**
- **Evidence:** `src/lib/game/production/math/sell.ts:8-12` accepts `_state` but does not read it; `src/lib/game/production/engine/math/payout.server.ts:14-16` creates `workerDefs` and passes it, but `computePayout()` only reads `defs.buildings` (`payout.ts:20-30`).
- **Impact:** False impression that sell/payout depend on state/workers; future changes may update the wrong layer.
- **Minimal repair:** Remove unused parameter/struct field only after call-site/typecheck audit; keep public wrapper if still needed for server boundary until migration.
- **Tests:** compile and wrapper-equivalence tests; no behavior change expected.

#### V-030 — Missing building cost silently becomes 100 money

- **Severity:** High config integrity. **Confidence:** High. **Audit claim:** newly discovered fallback from transform audit.
- **Validation verdict:** **Newly discovered, confirmed.**
- **Flow:** `parseCostMap(null)` in `src/lib/game/config/transformers/buildings.ts:4-17` and duplicated server fetch transform `serverConfigFetcher.ts:117-132` returns `{money:100}` → building definition accepted.
- **Expected:** Required cost config missing should fail closed or be rejected during config validation.
- **Actual:** A missing DB `base_cost` silently assigns a gameplay price.
- **Root cause:** migration fallback retained as production behavior.
- **Impact:** Mispriced buildings and possible economy exploit after partial config failure.
- **Minimal repair:** Validate `base_cost` at trust boundary and reject invalid/missing required rows; keep fallback only in explicit legacy migration code, not runtime config.
- **Tests:** null/empty/invalid cost config must fail; valid array/object transforms must remain.

#### V-031 — `applyElapsedTicks()` contains a latent permissive game-speed fallback

- **Severity:** Low today; Medium if called directly. **Confidence:** High. **Audit claim:** newly discovered fail-closed gap.
- **Validation verdict:** **Newly discovered, latent.**
- **Flow:** `applyElapsedServerTime()` validates allowed speeds (`elapsedTickPersistence.ts:24-40`) before calling `applyElapsedTicks()`; inside `applyElapsedTicks.ts:115-120`, invalid speed is replaced with `1`.
- **Expected:** Required invalid server state fails closed at every callable boundary.
- **Actual:** Current production caller validates first, but direct future callers/tests can silently run at speed 1.
- **Minimal repair:** Remove fallback and return/throw invalid speed; preserve outer validation. Add direct helper test.
- **Risk/tests:** Low current behavior risk because caller validates; high regression value for fail-closed rule.

### 9.6 Rejected, outdated, and partially rejected findings

| ID | Report claim | Verdict | Evidence and correction |
|---|---|---|---|
| R-001 | “Phase 13 test silently passes and creates a false-positive compliance signal.” | **Rejected as phrased; outdated** | The test does not silently pass. Direct execution on 2026-07-15 produced 13 failures/1 pass, including ENOENT and false route-text matches. The underlying stale-test defect is confirmed as V-026. |
| R-002 | WorkerPanel is one of the snapshot UI consumers. | **Rejected** | Current `src/components/game/WorkerPanel.tsx` does not read `productionSnapshot`; it reads worker assignments/effects. Consumer count is 14 after correction. |
| R-003 | Production chains are only UI display data. | **Partially rejected** | They are not read by production math, but runtime/event/archetype consumers read derived chain data. See V-008. |
| R-004 | No row locks means concurrent requests currently double-apply production. | **Rejected as a current outcome; partially confirmed as a design gap** | CAS at `serverGameState.ts:784-798` should allow one matching version to commit. Missing locks cause duplicate computation/409s, not proven double commit. Bypass writers remain a separate risk. |
| R-005 | `src/lib/capacity.ts` is the resource-cap owner. | **Outdated citation** | Current resource capacity code is `src/lib/game/shared/utils/costCalculator.ts:52-65`; `src/lib/capacity.ts` concerns a different domain. Storage finding itself remains confirmed. |
| R-006 | The original 11-panel inventory is complete. | **Outdated** | Four panels were missed; WorkerPanel was incorrectly included. See V-028. |
| R-007 | Event cache and modifier registry already double-apply production today. | **Rejected as proven runtime behavior** | Two pipelines exist, but current production consumers read manual cache fields. This is a confirmed redundancy/future-risk, not a demonstrated current numeric double count. |

### 9.7 Newly discovered findings index

The following were not in the original report as distinct findings: V-014 (transport coefficient hardcode), V-015 (seasonal field loss), V-017 (dead wrappers/barrels), V-018 (client power duplication), V-019 (all-action tick injection), V-020 (speed fire-and-forget write), V-024 (inactive plants list), V-025 (validator bypass), V-029 (dead parameters), V-030 (cost fallback), and V-031 (latent speed fallback). V-016, V-026, V-027, and V-028 correct scope/count/path claims from the original report.

### 9.7.1 Cross-check additions — issues the second-pass review surfaced that the dossier still missed

| ID | Title | Severity | Files | Verdict |
|---|---|---|---|---|
| V-032 | `/api/market/supply/aggregate` cron reads stripped `productionSnapshot` → global market supply/demand is always 0 | **Critical** | `src/app/api/market/supply/aggregate/route.ts:108-109`; `src/lib/db/game/serverGameStatePayload.ts:24-31` | **Newly discovered** |
| V-033 | `applyElapsedServerTime` persistence path does NOT call `stripUIFields` | High | `src/lib/game/actions/server/shared/elapsedTickPersistence.ts:101-109,154-164` | **Newly discovered** |
| V-034 | `live-tick` route returns `full_state` to client without `stripUIFields` defense-in-depth | Medium | `src/app/api/game/state/live-tick/route.ts:79-85` | **Newly discovered** |
| V-035 | `buildProductionSnapshotServer` only sets `*IncomeRate`; `moneyExpenseRate`/`rpExpenseRate`/`cpExpenseRate` left at 0 → UI receives 0 expenses | High | `src/lib/game/production/engine/tick/productionSnapshot.ts:88-92`; consumers include `AIAdvisorPanel.tsx:528-529` | **Newly discovered** |
| V-036 | Correction: `solarPanelFactory` IS in the `BuildingType` union and catalog (live wired); the audit missed this when labeling `solarPanel` DB row dead | Low | `src/lib/game/shared/types/buildings.ts:83,189`; `src/lib/game/catalog/ui/buildings.ts:507` | **Correction** |

**V-032 — `/api/market/supply/aggregate` silently no-ops for every player**

| Field | Value |
|---|---|
| Severity | Critical |
| Confidence | High (three independent paths agree) |
| Audit-report claim | Not present |
| Validation verdict | Newly discovered |
| Files | `src/app/api/market/supply/aggregate/route.ts` (consumer); `src/lib/db/game/serverGameStatePayload.ts` (strip site); `src/app/api/game/sync/route.ts` (writer) |
| Flow | `runServerTicks` builds snapshot → store client sends via `serializeGameState` to `sync/route.ts:326-329` → `stripUIFields(gameState)` + `asFullState(sanitizedFullState)` → `productionSnapshot` is dropped before insert → cron `aggregate/route.ts:108` reads `fullState.productionSnapshot` → field is `undefined` → `if (!snapshot) continue;` at L109 skips every player |
| Expected | Each tick should aggregate supply/demand across active players to drive global market. |
| Actual | Aggregate is always empty; the global market never receives per-player supply contribution. |
| Root cause | Read/write asymmetry: `stripUIFields` is a defense-in-depth filter for server purity, but the same logic destroyed the only persisted field the aggregate cron needs. |
| User-visible impact | Global market supply curve flat at 0 → dynamic pricing, sell/buy pressure, and any aggregate-driven UI is meaningless. |
| Data-integrity impact | None directly (no double writes); analytics and market mechanics are degraded. |
| Evidence | `serverGameStatePayload.ts:24-31` `SERVER_STATE_UI_FIELDS` lists `productionSnapshot`; `sync/route.ts:326-329` strips it; `aggregate/route.ts:108-109` reads it. |
| Existing tests | None. |
| Missing tests | NEW-TEST-031 |
| Minimal fix | Persist a server-only aggregate snapshot (e.g., add `marketAggregate` to a separate JSONB column or compute per-player on demand in the cron). Do not remove `stripUIFields`. |
| Risk | Low if a separate persisted aggregate is introduced; medium if trying to "just un-strip" — that re-introduces UI field leakage. |
| Must remain | `stripUIFields` filter at every persistence boundary. |
| Required regression | Aggregate cron produces nonzero numbers for at least one active factory building. |

**V-033 — `applyElapsedServerTime` does NOT call `stripUIFields`**

| Field | Value |
|---|---|
| Severity | High |
| Confidence | High |
| Audit-report claim | Phase 13 defense-in-depth "every persistence boundary strips UI fields". |
| Validation verdict | Partially confirmed; this path is missing. |
| Files | `src/lib/game/actions/server/shared/elapsedTickPersistence.ts:101-109,154-164` |
| Flow | Most action handlers → `applyElapsedServerTime()` → `saveServerGameStateOptimistic({ patch, expectedStateVersion })` → writes `full_state: asFullState(elapsed.state)` directly. No `stripUIFields` call. |
| Expected | Symmetric strip across all writers. |
| Actual | Only `sync/route.ts` and `migrate-guest` strip UI fields. CAS-elapsed writers do not. |
| Root cause | Refactor moved strip into a subset of writers; `elapsedTickPersistence.ts` was missed. |
| User-visible impact | If `elapsed.state` ever grows a stray UI field (e.g., a future `activeTab` accidentally added), it would persist and could leak across hydrate. |
| Data-integrity impact | Latent — no current field leak, but Phase 13 invariant broken. |
| Evidence | `elapsedTickPersistence.ts:101-109,154-164`; contrast with `sync/route.ts:326-329` that does call `stripUIFields`. |
| Existing tests | Phase 13 architecture test purports to enforce this (was failing in V-026). |
| Missing tests | NEW-TEST-032 (covers all writers, not just sync/migrate-guest). |
| Minimal fix | Add `stripUIFields(asFullState(elapsed.state))` (or equivalent) immediately before each `saveServerGameStateOptimistic` call in `elapsedTickPersistence.ts`. |
| Risk | Trivial. |
| Required regression | NEW-TEST-032 plus existing Phase 13 test passes when rewritten against current paths. |

**V-034 — `live-tick` returns `newState` without `stripUIFields` defense-in-depth**

| Field | Value |
|---|---|
| Severity | Medium |
| Confidence | High |
| Audit-report claim | Phase 13 server purity. |
| Validation verdict | Partially confirmed; this path leaks UI keys to the wire payload. |
| Files | `src/app/api/game/state/live-tick/route.ts:79-85` |
| Flow | live-tick → `activeServerState.full_state` returned as `newState` in JSON → client `useLiveServerTick` applies only `SERVER_FIELDS` to the store. UI keys are dropped on apply but ship over the wire. |
| Expected | Optional: server pre-strips to reduce payload and prevent accidental spread merges. |
| Actual | Wire payload may contain UI keys if any drift into `full_state`. |
| Root cause | Inconsistent strip policy across writers and readers. |
| User-visible impact | Slightly larger payload; potential merge-leak if any client mutates `data.newState` directly. |
| Data-integrity impact | None stored; only transport. |
| Evidence | `live-tick/route.ts:79-85`; client `store.ts:124-144` `applyServerState` only iterates `SERVER_FIELDS`. |
| Existing tests | None. |
| Missing tests | NEW-TEST-033 |
| Minimal fix | `newState = stripUIFields(activeServerState.full_state)` in route handler (optional but recommended). |
| Risk | Trivial. |
| Required regression | Live-tick JSON does not contain `productionSnapshot`, `activeTab`, or any UI key. |

**V-035 — Expense rate fields are never populated → AIAdvisorPanel and similar show 0**

| Field | Value |
|---|---|
| Severity | High |
| Confidence | High |
| Audit-report claim | V-007 (UI sees zeros) and V-022 (income not pushed). |
| Validation verdict | Newly discovered sub-cause. |
| Files | `src/lib/game/production/engine/tick/productionSnapshot.ts:88-92`; consumers: `AIAdvisorPanel.tsx:528-529`. |
| Flow | snapshot builder writes only `moneyIncomeRate`, `rpIncomeRate`, `cpIncomeRate`. `moneyExpenseRate`, `rpExpenseRate`, `cpExpenseRate` default 0 from `emptyProductionSnapshot`. Advisor UI reads both but only income was computed. |
| Expected | `*ExpenseRate` should mirror the negative direction (factory inputs, power fuel, transport cost). |
| Actual | UI receives 0 for all expense rates regardless of activity. |
| Root cause | Production math computes a `net` income in payout but does not surface a separate expense aggregate. |
| User-visible impact | AIAdvisorPanel cannot compute margin or break-even; always reports infinite profitability. |
| Data-integrity impact | None. |
| Evidence | `productionSnapshot.ts:88-92`; `productionCalculator.ts:1-21` (`buildProductionSnapshotServer` NOT exported); consumers grep'd across `src/components`. |
| Existing tests | None. |
| Missing tests | NEW-TEST-034 |
| Minimal fix | In `productionSnapshot.ts`, sum negative-direction changes per currency and write into `*ExpenseRate`. Use the same loop that already produces inputs. |
| Risk | Low — adds derived fields already supported by type. |
| Required regression | NEW-TEST-034, advisory panel render with at least one active factory shows nonzero expense. |

**V-036 — Correction: `solarPanelFactory` IS wired**

| Field | Value |
|---|---|
| Severity | Low |
| Confidence | High |
| Audit-report claim | "`solarPanel` DB row absent from `BuildingType` union and catalog — dead row". |
| Validation verdict | Correction: claim true for `solarPanel`, but `solarPanelFactory` exists in both union and catalog. |
| Files | `src/lib/game/shared/types/buildings.ts:83,189`; `src/lib/game/catalog/ui/buildings.ts:507`; `sb_buildings.txt:83` |
| Evidence | `solarPanelFactory` is listed in both the type union and the catalog UI; `solarPanel` is dead. |
| Required update | This finding does NOT add a fix — the dead `solarPanel` row remains a dead-row concern. |
| Regression | None new. |

### 9.7.2 Second cross-check additions — defense-in-depth and dead-code patterns the first review pass under-covered

| ID | Title | Severity | Files | Verdict |
|---|---|---|---|---|
| V-037 | `bulk_build` / `bulk_sell` action types declared in union & corrected-state response but never wired (no endpoint, no handler, not in `VALID_ACTIONS`) | Medium | `src/lib/game/actions/client/validationTypes.ts:22-23,65-66`; `src/lib/game/actions/server/correctedStateResponse.ts:73-74`; `src/lib/game/actions/server/commandDispatcher.ts` | **Newly discovered** |
| V-038 | `src/lib/game/store.ts` (top-level 14-LOC re-export) has zero importers and is functionally dead | Low | `src/lib/game/store.ts:1-14`; `knip.json:4` | **Confirmed (already partially in V-017; this entry pins the precise path and line range)** |
| V-039 | `Math.random()` reaches into persisted state via `newsIds.ts:7` and `prestigeActions.ts:98` — non-secure RNG for IDs that round-trip through `full_state` | Medium | `src/lib/game/market/news/newsIds.ts:7`; `src/lib/game/state/store-actions/prestige/prestigeActions.ts:98`; `src/lib/game/events/eventRandom.ts`; `src/lib/game/shared/utils/saveMigration/saveMigrations.ts:94` | **Newly discovered** |
| V-040 | `buildDenormalizedStatePatchFields` has zero unit tests across 3 persistence writers | Medium | `src/lib/game/actions/server/shared/elapsedTickPersistence.ts:91,147`; `src/lib/game/actions/server/shared/correctedStatePersistence.ts:76`; `src/app/api/game/state/offline-progress/route.ts:591` | **Newly discovered** |
| V-041 | Original audit's "25 `select('*')` occurrences" is outdated — current production-tree count is 12; some entries were refactored to explicit column lists | Low | `src/lib/db/*`, `src/app/api/**`; contrast with BUGS.md | **Correction** |
| V-042 | No mutation tests / property-based tests for `runServerTicks` invariants (state.gameTick monotonicity, fuel-stock non-negativity, weather-cycle bounds, factory-input debits) | Medium | `tests/unit/gameTick.inputFloor.test.ts` is the only one; no fuzz/property suite exists | **Newly discovered** |
| V-043 | Thin `*.server.ts` math wrappers for `endgame`, `sell`, `production`, `power` are 1-call delegators with no behavior addition; only `multipliers.server.ts` does server-specific work | Low | `src/lib/game/production/engine/math/{endgame,sell,production,power}.server.ts` | **Confirmed (already partially in V-017; this entry separates pure delegators from `multipliers.server.ts`)** |

**V-037 — `bulk_build` / `bulk_sell` action types are schema-only, never wired**

| Field | Value |
|---|---|
| Severity | Medium |
| Confidence | High |
| Audit-report claim | Not present |
| Validation verdict | Newly discovered |
| Files | `src/lib/game/actions/client/validationTypes.ts:22-23,65-66`; `src/lib/game/actions/server/correctedStateResponse.ts:73-74`; not in `src/lib/game/actions/server/commandDispatcher.ts` `VALID_ACTIONS`; not in `endpoints.ts:1-30`. |
| Flow | Type system advertises `bulk_build` / `bulk_sell` to validators and corrected-state responses; no endpoint maps to them; no handler implements them. |
| Expected | Either implement or remove from unions. |
| Actual | Dead union members; client requests using them would be validated client-side but rejected at the dispatcher. |
| Root cause | Refactor leftover. |
| User-visible impact | None directly; surface area only. |
| Data-integrity impact | None. |
| Existing tests | None. |
| Missing tests | NEW-TEST-035 |
| Minimal fix | Either (a) remove from unions + corrected-state response, or (b) implement endpoint + handler + dispatcher entry. Pick one before merge of any related PR. |
| Risk | Low. |
| Required regression | Action-type union equals endpoint mapping equals dispatcher valid actions equals corrected-state response union. |

**V-038 — `src/lib/game/store.ts` is a 14-LOC dead re-export**

| Field | Value |
|---|---|
| Severity | Low |
| Confidence | High |
| Audit-report claim | V-017 already lists candidate dead wrappers. |
| Validation verdict | Confirmed; precise path added. |
| Files | `src/lib/game/store.ts:1-14` |
| Flow | Re-exports from `./state/store` + `state-types`. `grep "@/lib/game/store['\"]"` across `src/` and `tests/` returns 0 hits. |
| Existing tests | None. |
| Missing tests | NEW-TEST-030 already covers caller-migration gates for this category. |
| Minimal fix | Delete after confirming zero callers via `grep` and `tsc --noEmit`. Knip config also references it; remove from `knip.json` after file deletion. |
| Risk | Trivial if no callers; medium if a sibling PR re-imports through the old path. |
| Required regression | `tsc --noEmit` clean; knip report clean. |

**V-039 — `Math.random()` reaches persisted state for IDs**

| Field | Value |
|---|---|
| Severity | Medium |
| Confidence | High |
| Audit-report claim | Not directly present; BUG-068/071 audit intentionally left these untouched. |
| Validation verdict | Newly discovered scope extension — non-secure RNG flows into persisted IDs. |
| Files | `src/lib/game/market/news/newsIds.ts:7`; `src/lib/game/state/store-actions/prestige/prestigeActions.ts:98`; `src/lib/game/events/eventRandom.ts`; `src/lib/game/shared/utils/saveMigration/saveMigrations.ts:94` |
| Flow | `Math.random()` IDs are computed client-side, persisted via `serializeGameState` and synced to `server_game_state`. CAS compares state_version not ID; replay of the same game_seed produces different IDs. |
| Expected | Either secure RNG with deterministic seed, or accept that IDs are non-replayable. |
| Actual | Persisted IDs are non-deterministic; migration, replay, and A/B parity are weakened. |
| Root cause | Out of scope for authoritative settlement fix. |
| Existing tests | None. |
| Missing tests | NEW-TEST-036 |
| Minimal fix | If deterministic replay is required, route these paths through `serverRandom.ts`. Otherwise document the non-determinism in product docs and accept it. |
| Risk | Low — these IDs do not affect economy. |
| Required regression | Migration tests pass consistently between first- and second-run states. |

**V-040 — `buildDenormalizedStatePatchFields` has zero tests across 3 writers**

| Field | Value |
|---|---|
| Severity | Medium |
| Confidence | High |
| Audit-report claim | Not present |
| Validation verdict | Newly discovered |
| Files | `src/lib/game/actions/server/shared/elapsedTickPersistence.ts:91,147`; `src/lib/game/actions/server/shared/correctedStatePersistence.ts:76`; `src/app/api/game/state/offline-progress/route.ts:591` |
| Flow | Three writers call the helper to denormalize state for CAS updates. No isolated unit test exists; if the helper produces wrong denormalized columns, persistence silently corrupts the row. |
| Existing tests | None. |
| Missing tests | NEW-TEST-037 |
| Minimal fix | Add isolated unit test verifying denorm columns match `state.*` mirrors, plus covered writers still pass CAS. |
| Risk | Trivial. |
| Required regression | NEW-TEST-037 plus existing CAS tests. |

**V-041 — `select('*')` count correction**

| Field | Value |
|---|---|
| Severity | Low |
| Confidence | High |
| Audit-report claim | "25 `select('*')` occurrences" in production. |
| Validation verdict | Correction: 12 in production; many entries were refactored to explicit columns per BUG-058. `tests/` adds more. |
| Files | `src/lib/db/*` production tree. |
| Required update | The original audit's "25" should be read as "12" with `tests/` excluded, and BUG-058 is the authoritative list. |
| Regression | None new. |

**V-042 — No mutation/property tests for tick invariants**

| Field | Value |
|---|---|
| Severity | Medium |
| Confidence | High |
| Audit-report claim | V-026 mentions "stale Phase 13 test" but does not enumerate missing property tests. |
| Validation verdict | Newly discovered; no fuzz/property suite exists for `runServerTicks`. |
| Files | `tests/unit/gameTick.inputFloor.test.ts` is the only behavioral tick test. |
| Required tests | TST-018 (determinism), NEW-TEST-038 (property: state.gameTick only increases), NEW-TEST-039 (property: fuel stock never goes negative when starting non-negative), NEW-TEST-040 (property: factory input debit ≤ available). |
| Risk | Low; additive coverage. |

**V-043 — Thin `*.server.ts` math delegators**

| Field | Value |
|---|---|
| Severity | Low |
| Confidence | High |
| Audit-report claim | V-017 lumps wrappers together. |
| Validation verdict | Correction: separate the **pure delegators** (4 files: `endgame.server.ts`, `sell.server.ts`, `production.server.ts`, `power.server.ts`) from the **server-specific** `multipliers.server.ts`. Deletion order matters — multipliers must remain or `runServerTicks` loses worker/transform logic. |
| Files | `src/lib/game/production/engine/math/{endgame,sell,production,power,multipliers}.server.ts` |
| Required update | Plan: delete 4 delegators first after caller-migration audit; keep `multipliers.server.ts` last and validate via TST-014 + integration. |

### 9.8 Redundant-code and necessity analysis

The target production chain should be:

```text
A: validated Supabase config
  → B: one server config/definition transform
  → C: one authoritative tick engine
  → D: one CAS persistence boundary
  → E: one client response/store adapter
  → F: UI selectors
```

Current implementation adds these extra edges:

```text
A → A1 duplicated transform → B
A → A2/A3 duplicated ID maps → B
B → wrapper barrel → wrapper math → C
C → local client power calculator → UI, while C also returns server power
C → snapshot → offline response (dropped) / live response (omitted)
D → action-specific speed writer outside common persistence
```

| Code | Necessary? | Proof | Safe disposition |
|---|---|---|---|
| `runServerTicks.ts` | Yes | All live/offline/action settlement paths use it transitively. | Keep; improve contract/tests only. |
| Pure math in `production/math/*.ts` | Yes | Directly used by server wrappers/validator and defines business rules. | Keep as one owner. |
| `engine/math/*.server.ts` wrappers | Mostly no behavior | Pure delegation; production/power/payout only package defs. | Migrate callers, then remove or keep a clearly named server boundary. |
| `engine/math/index.server.ts` | Transitional | Barrel only; no business logic. | Remove after import graph proves no caller. |
| `config/server/configLoader.server.ts` | Transitional barrel | Re-exports split loader modules; current callers often import split owners. | Remove only after all imports/tests migrate. |
| `state/store-bootstrap.ts` | Transitional | Re-exports initial-state modules; `state/store.ts` is its meaningful caller. | Inline or migrate, then remove. |
| `state/stubProductionSnapshot.ts` | Transitional | Re-export around empty snapshot used by initial client state. | Replace import with real owner, then remove. |
| `config/cacheUpdate.ts`, `config/buildingIdMigration.ts` | Candidate dead code | Import search shows no meaningful production callers in current tree. | Delete only after a fresh graph/import/typecheck check. |
| `serverEngine.ts` | Still required boundary | Many handlers/routes import it. | Keep until callers move; do not remove as “dead.” |
| Client `computePowerGrid` in toggle action | Partially necessary for immediate feedback only | Server recomputes authoritative result; client formula can diverge. | Remove numeric authority; retain only explicit optimistic presentation if needed. |
| `PowerPanel` raw per-type power math | Not necessary for authority | Snapshot already contains total server power; raw factors use literals. | Replace with snapshot-derived display after snapshot repair. |
| `FactoryPanel` total power summary | Presentation-only | Recomputes base power from local defs at `FactoryPanel.tsx:170-178`. | Keep only if explicitly labeled as local estimate; otherwise use snapshot. |
| `AIAdvisorPanel` health-score formulas | Not server authority | Heuristic reads snapshot/resources and intentionally scores UI state. | Keep as UI heuristic, but never use for economy decisions; add zero-snapshot handling. |
| `productionSnapshot` in `full_state` | Not necessary under Phase 13 | It is a derived UI cache and explicitly stripped. | Keep out of DB; repair response/store adapter instead. |

No removal is recommended solely because code looks complex. Each candidate above is backed by import/call evidence and must be removed only after caller migration, typecheck, targeted tests, and a second graph check.

### 9.9 Minimal production-ready repair plan

#### P0 — Repair the broken observable contract

1. Define `ProductionSnapshot` as a response/UI-session value, not persisted server data.
2. Propagate the snapshot from the same `runServerTicks()` result that produced `newState` through live elapsed settlement.
3. Add one store action/adapter that applies a validated snapshot; use it from live and offline response handlers.
4. Keep `productionSnapshot` out of `SERVER_FIELDS` and `SERVER_STATE_UI_FIELDS`; do not persist it in `full_state`.
5. Update the 14 consumers only if they need null/initial-state handling; do not add client production math.
6. **V-032 critical:** Repair `/api/market/supply/aggregate`. Persist a separate server-only per-player aggregate (e.g., `market_supply_state` JSONB column written by `runServerTicks` or computed in-cron via recompute); do not un-strip `productionSnapshot`. Add NEW-TEST-031.
7. **V-035 high:** In `buildProductionSnapshotServer`, populate `moneyExpenseRate`, `rpExpenseRate`, `cpExpenseRate` from negative-direction debits so advisor UI breaks even correctly. Add NEW-TEST-034.

#### P1 — Close correctness and persistence gaps

1. Replace missing-capacity `Infinity` with validated server capacity policy and honor unlimited-storage semantics server-side.
2. Decide and expose storage overflow policy; never silently lose output without an observable result.
3. Add diagnostic reasons for unknown definition/missing recipe/inactive state without changing inactive semantics.
4. Move payout/endgame/transport coefficients to validated balance/config owners.
5. Make `set_game_speed` await the common CAS persistence path and fail closed on write errors.
6. Remove permissive missing-cost and latent invalid-speed fallbacks at trust boundaries.
7. **V-033 high:** Add `stripUIFields(...)` to every `saveServerGameStateOptimistic` call site in `elapsedTickPersistence.ts`. Add NEW-TEST-032 covering all writers.
8. **V-034 medium:** Pre-strip `full_state` in `live-tick/route.ts` before returning, matching the symmetry other writers established. Add NEW-TEST-033.

#### P2 — Reduce duplicate architecture after behavior is covered

1. Centralize `transformBuildings()` and ID migration maps.
2. Migrate callers from one-to-one wrappers/barrels, then delete zero-importer compatibility files.
3. Remove client numeric power recomputation from authoritative display paths.
4. Unify or explicitly separate the anti-cheat maximum model from settlement math.
5. Rewrite the Phase 13 static test against current paths and response-vs-persistence boundaries.

### 9.10 Exact regression-test plan

Existing tests are not sufficient evidence for the full runtime chain. Keep the original TST-001–TST-023 plan, with these corrections and additions:

| Test | Exact target | Required assertion |
|---|---|---|
| TST-001 | `computeProduction`, inactive tick | Inactive returns no mutation; reason is `inactive` if diagnostic added. |
| TST-002 | Unknown definition/power/payout | Unknown config is diagnosable; no silent success. |
| TST-003 | Extractor | Configured output and modifier application. |
| TST-004/005 | Factory input gate/debit | Missing input yields no debit/output; exact input debit when available. |
| TST-006 | `runServerTicks` sequential resource race | Two factories cannot consume the same stock; test actual state mutation, not old shadow-array assumptions. |
| TST-007 | DB/config coal mine fixture | Config row reaches output and tick settlement. |
| TST-008/009/010 | Power fuel | Full fuel, exact debit, partial fuel ratio, no negative resources. |
| TST-011 | Power shortage | Global floor behavior is explicit and deterministic. |
| TST-012/013 | Workers | Bonus-only vs required-worker product decision is pinned down. |
| TST-014 | Events | Manual cache/registry paths resolve one event exactly once. |
| TST-015 | Payout/endgame modifier scope | `production.payout` applies at intended three scopes exactly once each. |
| TST-016/017 | Storage | Cap, full-cap policy, waste/blocked output, missing capacity, unlimited storage. |
| TST-018 | Determinism | Same fixed weather/config/state produces same multi-tick result. |
| TST-019 | Compute race | Either assert explicit non-mutating preview semantics or CAS mutation semantics; no ambiguous contract. |
| TST-020 | Compute persistence | Must remain unchanged if endpoint stays preview; otherwise require CAS/version update. |
| TST-021 | Cloud sync | Gameplay fields round-trip; snapshot remains client-session only and is refreshed via response. |
| TST-022 | UI | Render at least Factory, Resource, Power, Storage, Dashboard, header, Market, and Advisor from a nonzero applied snapshot. |
| TST-023 | Live/offline parity | Same base state/config yields same authoritative state and snapshot for equivalent ticks. |
| NEW-TEST-024 | Live response/store | `live-tick` returns snapshot and store applies it only with matching settlement. |
| NEW-TEST-025 | Offline hook/store | Offline snapshot is not discarded; zero-tick response leaves snapshot unchanged. |
| NEW-TEST-026 | CAS writers | Parallel live/offline/action/speed writes produce one winning version and no false success. |
| NEW-TEST-027 | Config transform | Null cost fails; seasonal dates/status survive; one transform and one ID map are used. |
| NEW-TEST-028 | Phase 13 architecture | Current paths; response DTO may contain snapshot, persisted full state may not. |
| NEW-TEST-029 | Client/server power parity | Balance coefficient, fuel-starved ratio, weather, and active-plant set match server snapshot. |
| NEW-TEST-030 | Dead-code gate | Import graph and typecheck prove candidate wrappers have no callers before deletion. |
| NEW-TEST-031 | Market aggregate | At least one active factory yields nonzero aggregate supply contribution after at least one tick. |
| NEW-TEST-032 | Strip symmetry | Every `saveServerGameStateOptimistic` call site has a paired `stripUIFields` on the `full_state` payload. |
| NEW-TEST-033 | Live-tick wire purity | `live-tick` JSON response contains no UI keys (`productionSnapshot`, `activeTab`, `selectedBuilding`, `notifications`, `weather`, `upgrades`, `version`, `solarPanel` field, etc.) even when those exist on the canonical store. |
| NEW-TEST-034 | Snapshot expense rates | `buildProductionSnapshotServer` sets `moneyExpenseRate`, `rpExpenseRate`, `cpExpenseRate` to the sum of negative-direction debits for at least one tick; `AIAdvisorPanel` sees a nonzero value if any input/fuel is consumed. |
| NEW-TEST-035 | Action-type union parity | Set of action types in `validationTypes.ts` ∪ `correctedStateResponse.ts` ⊆ `VALID_ACTIONS` in dispatcher ∪ endpoint mapping. |
| NEW-TEST-036 | Persisted-ID determinism | Two clients at the same gameSeed produce identical persisted IDs after migration at least for paths that emit IDs to `full_state`. |
| NEW-TEST-037 | Denorm-patch fidelity | `buildDenormalizedStatePatchFields(state)` produces denormalized columns matching `state.*` mirrors; covered writers still pass CAS. |
| NEW-TEST-038 | Tick monotonicity (property) | Across 100 randomized state ticks, `state.gameTick` only ever increases. |
| NEW-TEST-039 | Fuel stock non-negativity (property) | If starting fuel ≥ 0, fuel never goes negative after N ticks. |
| NEW-TEST-040 | Factory input debit ≤ available (property) | For every factory input, debit never exceeds available input at the moment of debit. |

Run targeted tests first, then `npm run typecheck`, `npm run lint`, Vitest, integration/security tests, and production build at the validation checkpoint. Do not treat the current stale Phase 13 test as green evidence; it was run directly and failed 13 of 14 assertions.

### 9.11 Final production-readiness decision

**Not complete. Not wholly broken. Partially connected and overengineered — and now confirmed to silently break global market aggregation.**

- **Can the server economy advance?** Yes, through the authoritative live/offline/action settlement paths, subject to the confirmed storage, config, balance, and omitted-subsystem risks.
- **Can the player reliably see the authoritative production state?** No. The snapshot contract is broken across response, hook, store, and UI.
- **Does the global market work?** No. `/api/market/supply/aggregate` reads a stripped field — global supply/demand curve is always flat at zero. This is a critical regression V-032 surfaced by the cross-check pass and was not in the original audit.
- **Can advisor/UI compute break-even?** No. `*ExpenseRate` fields are never populated in `productionSnapshot` (V-035). Advisors always report infinite profit.
- **Is persistence concurrency safe?** Mostly for CAS-compliant writers; not every writer follows the same awaited/common path, no row lock bounds duplicate work, and the strip-defense-in-depth policy is asymmetric (V-033, V-034).
- **Is config the single source of truth?** No. Payout/endgame/transport literals, duplicate transforms/maps, and discarded seasonal fields prove partial migration.
- **Is the architecture unnecessarily layered?** Yes, at compatibility boundaries; removals require graph-backed caller migration.
- **Are tests proving runtime behavior?** No. Existing coverage is weighted toward validators and route guards; core tick math, snapshot installation, storage overflow, market aggregate, expense rates, live/offline parity, and current state-shape boundaries lack trustworthy end-to-end tests.

The minimum acceptable production bar is P0 snapshot repair **plus market-aggregate repair plus expense-rate population** plus regression coverage, P1 fail-closed/storage/persistence/strip-symmetry repairs, and a corrected architecture test. Until then, the building production system should be treated as **not release-complete** even though its core server settlement loop is operational.
