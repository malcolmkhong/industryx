# Store Decomposition — Target Architecture & Vitest Design

> **Status:** Design document — do not move code yet.
> **Source:** `src/lib/game/store.ts` (3,600+ lines, 53 actions, 11 top-level functions)
> **Target:** Feature-based modular architecture per `AGENTS.md`

---

## Phase 1 — Target Module Structure

### Dependency Graph (extraction order)

```
Phase 1: Utils (zero deps)
  └─ utils/formatNumber.ts
  └─ utils/generateId.ts
  └─ utils/costCalculator.ts (getBuildingCost, getCapacity, isResearchUnlocked, isBuildingUnlocked, hasUnlimitedStorage)
  └─ utils/saveMigration.ts (migrateSaveState, migrateSaveBuildings, SAVE_VERSION)
  └─ constants/initialState.ts (initialResources, initialCapacity, createInitialState)
  └─ constants/gameBalance.ts (SAVE_VERSION, getBalance wrapper)

Phase 2: Services (depend on utils + types)
  └─ services/gameTick.ts        (gameTickAction — the 800-line core loop)
  └─ services/buildingService.ts (buildBuilding, upgradeBuilding, toggleBuilding)
  └─ services/marketService.ts   (sellResource, buyResource, toggleAutoSell)
  └─ services/transportService.ts(buildTransportLine, upgradeTransportLine, toggleTransportLine)
  └─ services/researchService.ts (startResearch)
  └─ services/workerService.ts   (hireWorker, assignWorker, levelUpWorker)
  └─ services/contractService.ts (acceptContract, fulfillContract)
  └─ services/prestigeService.ts (doPrestige, purchasePrestigeBonus)
  └─ services/droneService.ts    (buyDrone, sendDrone, upgradeDrone, generateDroneMissions)
  └─ services/dailyRewardService.ts (checkDailyLogin, claimDailyReward)
  └─ services/questService.ts    (claimQuestReward, updateQuestProgress)
  └─ services/blueprintService.ts(saveBlueprint, loadBlueprint, deleteBlueprint, renameBlueprint, exportBlueprint, importBlueprint)
  └─ services/notificationService.ts (addNotification, markNotificationRead, markAllNotificationsRead, clearNotifications)
  └─ services/megaProjectService.ts (startMegaProject, contributeToMegaProject)
  └─ services/offlineService.ts  (applyServerState)
  └─ services/rankService.ts     (getCurrentRank, getPlayerGameTier, divergesFromExpected)
  └─ services/leaderboardService.ts (addLeaderboardEntry)
  └─ services/payoutService.ts   (collectPayout, toggleAutoCollect)
  └─ services/saveService.ts     (exportSave, importSave, resetGame)
  └─ services/newsService.ts     (getNewsLLMState, refreshNewsFromLLM)

Phase 3: Store (depends on all services)
  └─ store/index.ts              (creates Zustand store, wires actions to services)
  └─ store/actions.ts             (gameActions interface + GameStore type)
  └─ store/selectors.ts           (selector functions if any)
  └─ store/persistence.ts         (debouncedPersistStorage)

Phase 4: Hooks (optional, depends on store)
  └─ hooks/useGameStore.ts        (re-export from store)
```

### Extracted Module Details

---

#### Phase 1a: Utility Functions

| Module | Functions | Dependencies | Exports |
|--------|-----------|-------------|---------|
| `utils/formatNumber.ts` | `formatNumber(n)` | none | `formatNumber` |
| `utils/generateId.ts` | `generateId()` | none | `generateId` |
| `utils/gameMath.ts` | `getGlobalPrice(state, resource)`, `getMegaProjectBonus(megaProjects, bonusType)` | `types` | both |

**Tests needed:**
- `utils/formatNumber.test.ts`
- `utils/generateId.test.ts`
- `utils/gameMath.test.ts`

---

#### Phase 1b: Cost & Validation Utilities

| Module | Functions | Dependencies | Exports |
|--------|-----------|-------------|---------|
| `utils/costCalculator.ts` | `getBuildingCost(type, count, reduction)`, `getCapacity(state, resource, ...)`, `isResearchUnlocked(id, completed)`, `isBuildingUnlocked(type, completed, prestige)` | `types`, `configCache.BUILDING_DEFS`, `configCache.RESEARCH_TREE`, `productionCalculator.buildMultipliers` | all 4 |
| `utils/hasUnlimitedStorage.ts` | `hasUnlimitedStorage(megaProjects)` | `types` | `hasUnlimitedStorage` |

**Tests needed:**
- `utils/costCalculator.test.ts`
- `utils/hasUnlimitedStorage.test.ts`

---

#### Phase 1c: State & Constants

| Module | Responsibilities | Dependencies | Exports |
|--------|-----------------|-------------|---------|
| `constants/initialState.ts` | `initialResources`, `initialCapacity`, `createInitialState()` | `types`, `configCache.*`, `productionCalculator.emptyProductionSnapshot` | all |
| `constants/gameBalance.ts` | `SAVE_VERSION` (20) | none | `SAVE_VERSION` |

**Tests needed:**
- `constants/initialState.test.ts` (validate shape, defaults)

---

#### Phase 1d: Save Migration

| Module | Functions | Dependencies | Exports |
|--------|-----------|-------------|---------|
| `utils/saveMigration.ts` | `migrateSaveState(state, version)`, `migrateSaveBuildings(buildings)` (re-export) | `types`, `configCache.*`, `productionCalculator.emptyProductionSnapshot`, `idMigration.migrateSaveBuildings` | both |

**Tests needed:**
- `utils/saveMigration.test.ts` (all 20 migration versions)

---

#### Phase 2: Services (each is a standalone module)

Each service module exports a factory or a set of pure functions that take `(set, get)` and return action implementations.

**Pattern:**
```typescript
// services/buildingService.ts
import type { StateCreator } from 'zustand';
import type { GameState, GameActions } from '../types';

export function createBuildingActions(): Partial<GameActions> {
  return {
    buildBuilding: async (type) => { /* ... */ },
    upgradeBuilding: (id) => { /* ... */ },
    toggleBuilding: async (id) => { /* ... */ },
    selectBuilding: (id) => set({ selectedBuilding: id }),
  };
}
```

| # | Service Module | Actions | Key Dependencies |
|---|---------------|---------|-----------------|
| S1 | `services/gameTick.ts` | `gameTickAction`, `setGameSpeed`, `togglePause` | `configCache.*`, `productionCalculator.*`, `balanceConfig`, `types` |
| S2 | `services/buildingService.ts` | `buildBuilding`, `upgradeBuilding`, `toggleBuilding`, `selectBuilding` | `costCalculator`, `configCache.BUILDING_DEFS`, `soundEngine` |
| S3 | `services/marketService.ts` | `sellResource`, `buyResource`, `toggleAutoSell` | `configCache`, `productionCalculator`, `soundEngine` |
| S4 | `services/transportService.ts` | `buildTransportLine`, `upgradeTransportLine`, `toggleTransportLine` | `configCache.TRANSPORT_DEFS` |
| S5 | `services/researchService.ts` | `startResearch` | `configCache.RESEARCH_TREE`, `soundEngine` |
| S6 | `services/workerService.ts` | `hireWorker`, `assignWorker`, `levelUpWorker` | `configCache.WORKER_DEFS` |
| S7 | `services/contractService.ts` | `acceptContract`, `fulfillContract` | `soundEngine`, `math` |
| S8 | `services/prestigeService.ts` | `doPrestige`, `purchasePrestigeBonus` | `configCache`, `types` |
| S9 | `services/droneService.ts` | `buyDrone`, `sendDrone`, `upgradeDrone`, `generateDroneMissions` | `configCache.BUILDING_DEFS`, `balanceConfig` |
| S10 | `services/dailyRewardService.ts` | `checkDailyLogin`, `claimDailyReward` | `configCache`, `types` |
| S11 | `services/questService.ts` | `claimQuestReward`, `updateQuestProgress`, `setTrackedQuest` | `soundEngine` |
| S12 | `services/blueprintService.ts` | `saveBlueprint`, `loadBlueprint`, `deleteBlueprint`, `renameBlueprint`, `exportBlueprint`, `importBlueprint` | `formatNumber` |
| S13 | `services/notificationService.ts` | `addNotification`, `markNotificationRead`, `markAllNotificationsRead`, `clearNotifications` | `generateId` |
| S14 | `services/megaProjectService.ts` | `startMegaProject`, `contributeToMegaProject` | `configCache`, `types` |
| S15 | `services/offlineService.ts` | `applyServerState` | none (pure set) |
| S16 | `services/rankService.ts` | `getCurrentRank`, `getPlayerGameTier`, `divergesFromExpected` | `configCache.RANK_THRESHOLDS`, `configCache.BUILDING_DEFS` |
| S17 | `services/leaderboardService.ts` | `addLeaderboardEntry` | none |
| S18 | `services/payoutService.ts` | `collectPayout`, `toggleAutoCollect` | `soundEngine` |
| S19 | `services/saveService.ts` | `exportSave`, `importSave`, `resetGame` | `createInitialState`, `saveMigration`, `types` |
| S20 | `services/newsService.ts` | `getNewsLLMState`, `refreshNewsFromLLM` | `newsLLM` |

---

#### Phase 3: Store Composition

| Module | Responsibilities | Dependencies |
|--------|-----------------|-------------|
| `store/index.ts` | Creates Zustand store, composes all services, wires persistence | `zustand`, `zustand/middleware`, all services, `persistence` |
| `store/actions.ts` | `GameActions` interface + `GameStore` export type | `types` |
| `store/selectors.ts` | Reusable selector functions (e.g., `useBuildingCount`, `useEffectiveSpeed`) | `types` |
| `store/persistence.ts` | `debouncedPersistStorage`, debounce timer, flush, beforeunload handler | none |

---

## Phase 2 — Vitest Test Architecture

### Test File Structure

```
tests/
└── unit/
    ├── store.baseline.test.ts      ← EXISTING (phased out during refactor)
    │
    ├── utils/
    │   ├── formatNumber.test.ts
    │   ├── generateId.test.ts
    │   ├── gameMath.test.ts
    │   ├── costCalculator.test.ts
    │   ├── hasUnlimitedStorage.test.ts
    │   └── saveMigration.test.ts
    │
    ├── constants/
    │   └── initialState.test.ts
    │
    ├── services/
    │   ├── gameTick.test.ts
    │   ├── buildingService.test.ts
    │   ├── marketService.test.ts
    │   ├── transportService.test.ts
    │   ├── researchService.test.ts
    │   ├── workerService.test.ts
    │   ├── contractService.test.ts
    │   ├── prestigeService.test.ts
    │   ├── droneService.test.ts
    │   ├── dailyRewardService.test.ts
    │   ├── questService.test.ts
    │   ├── blueprintService.test.ts
    │   ├── notificationService.test.ts
    │   ├── megaProjectService.test.ts
    │   ├── offlineService.test.ts
    │   ├── rankService.test.ts
    │   ├── leaderboardService.test.ts
    │   ├── payoutService.test.ts
    │   ├── saveService.test.ts
    │   └── newsService.test.ts
    │
    ├── store/
    │   ├── storeComposition.test.ts   (tests that all actions wire correctly)
    │   └── persistence.test.ts        (tests debounced persist layer)
    │
    └── mocks/
        ├── supabase.ts               ← EXISTING
        ├── configCache.ts            (shared mock factory)
        └── productionCalculator.ts   (shared mock factory)
```

### Shared Test Infrastructure

| File | Purpose |
|------|---------|
| `tests/unit/mocks/supabase.ts` | EXISTING — mock Supabase client |
| `tests/unit/mocks/configCache.ts` | Mock `BUILDING_DEFS`, `RESEARCH_TREE`, `RANK_THRESHOLDS`, etc. |
| `tests/unit/mocks/productionCalculator.ts` | Mock `buildMultipliers`, `computePowerGrid`, etc. |
| `tests/unit/setup.ts` (new) | Global mock setup, hoisted data, shared test state factory |

### Per-Service Test Plan

#### S1: `services/gameTick.test.ts`

| Test | What it verifies |
|------|-----------------|
| `does nothing when paused` | `paused=true` → tick not incremented |
| `increments gameTick` | `gameTick += 1` |
| `updates playTime stat` | `stats.playTime += 1` |
| `keeps resources non-negative` | Resource floor at 0 |
| `updates lastOnlineTimestamp` | Timestamp changes |
| `preserves productionSnapshot` | Shape unchanged |
| `processes contracts with timeRemaining` | Contract countdown decrements |
| `handles extractor production` | Adds output resources |
| `handles factory production with inputs` | Consumes inputs, produces outputs |
| `handles factory starvation` | No production when inputs empty |
| `computes power grid each tick` | Power values computed |
| `processes fuel consumption` | Fuel resources decrease |
| `handles power overload` | Efficiency drops when demand > supply |
| `updates weather periodically` | Weather cycles |
| `processes auto-sell` | Auto-sells resources at threshold |
| `processes passive RP income` | Research points accumulate |
| `processes endgame income` | Endgame money/RP/CP income |
| `processes payout ticks` | Pending payout accumulates |
| `completes contracts on fulfillment` | Contract marked completed |
| `fails contracts on timeout` | Contract marked failed |
| `updates quest progress per tick` | Quest counters increment |
| `processes weather effects on production` | Multiplier affects output |
| `handles drone mission completion` | Drone returns to idle |
| `updates mega project progress` | Tick-based contribution |

Mocks needed: `configCache` (BUILDING_DEFS, RANK_THRESHOLDS), `productionCalculator`, `balanceConfig`

#### S2: `services/buildingService.test.ts`

| Test | What it verifies |
|------|-----------------|
| `buildBuilding deducts money and adds building` | Money decreases, building in list |
| `buildBuilding rejects insufficient funds` | Returns early, no building added |
| `buildBuilding rejects locked-by-research` | Research check prevents build |
| `buildBuilding rejects max buildings` | >500 rejected |
| `buildBuilding validates building type exists` | Unknown type rejected |
| `upgradeBuilding increases level` | Level+1 |
| `upgradeBuilding deducts upgrade cost` | Money decreases |
| `upgradeBuilding does nothing for non-existent` | No crash |
| `toggleBuilding toggles active` | Active flips |
| `toggleBuilding handles non-existent` | No crash |
| `selectBuilding sets selection` | `selectedBuilding` set |
| `selectBuilding null clears` | `selectedBuilding` null |
| `addNotification when cannot afford` | Notification created |

Mocks needed: `configCache.BUILDING_DEFS`, `costCalculator.getBuildingCost`, `soundEngine`

#### S3: `services/marketService.test.ts`

| Test | What it verifies |
|------|-----------------|
| `sellResource removes resource and adds money` | Resource decreases, money increases |
| `sellResource rejects more than available` | State unchanged |
| `sellResource rejects negative amount` | State unchanged |
| `sellResource handles non-existent resource` | No crash |
| `buyResource removes money and adds resource` | Money decreases, resource increases |
| `buyResource rejects insufficient money` | State unchanged |
| `buyResource caps at capacity` | Resource never exceeds capacity |
| `toggleAutoSell adds resource` | Resource in autoSellResources |
| `toggleAutoSell removes resource` | Resource not in autoSellResources |
| `toggleAutoSell handles already-present` | Idempotent |

Mocks needed: `configCache`, `productionCalculator.computeSellMultiplier`, `soundEngine`, `costCalculator.getCapacity`

#### S4: `services/saveMigration.test.ts` (20 migration versions)

| Test | What it verifies |
|------|-----------------|
| `V1→V2 adds megaProjects` | Field added with defaults |
| `V1→V2 adds productionHistory` | Empty array |
| `V2→V3 adds storageUpgradeLevels` | All resource keys at 0 |
| `V2→V3 adds lastOnlineTimestamp` | Number |
| `V2→V3 adds autoSellResources` | Empty array |
| `V3→V4 adds leaderboardEntries` | Empty array |
| `V4→V5 adds loginStreak` | Default structure |
| `V5→V6 adds weather` | Default structure |
| `V5→V6 adds quests` | Empty array |
| `V6→V7 adds payoutConfig` | Default structure |
| `V6→V7 adds pendingPayout` | 0 |
| `V6→V7 adds payoutHistory` | Empty array |
| `V7→V8 adds trackedQuest` | null |
| `V8→V9 adds drone system` | Default fleet with 1 drone |
| `V9→V10 adds new T0-T2 resources` | Keys present |
| `V10→V11 adds T4 resources` | Keys present |
| `V12→V13 price rebalance` | Market prices updated |
| `V13→V14 mega project reset` | Structure preserved |
| `V14→V15 productionSnapshot` | emptyProductionSnapshot |
| `V15→V16 sectorTrends` | Empty object |
| `V16→V17 marketNews + narratives` | Empty arrays |
| `V18→V19 adds T2-T5 resources` | Keys present |
| `V19→V20 solarPanel→solarFarm rename` | Building type migrated |
| `preserves existing state through migrations` | Version + data integrity |

Mocks needed: `configCache.*`, `productionCalculator.emptyProductionSnapshot`

#### S5–S20: Other services (smaller modules)

Each follows the same pattern: mock external deps, test every action with valid/invalid inputs, verify state changes and error handling.

---

## Phase 3 — Extraction Order

```
Step 1:  Utils (formatNumber, generateId, gameMath)
         → No deps, pure functions. Safest start.
         → Create: utils/formatNumber.test.ts, utils/generateId.test.ts

Step 2:  Save migration (utils/saveMigration.ts)
         → Depends on types + config. Isolated logic.
         → Create: utils/saveMigration.test.ts

Step 3:  Cost utilities (utils/costCalculator.ts, utils/hasUnlimitedStorage.ts)
         → Depends on configCache. Pure functions.
         → Create: utils/costCalculator.test.ts

Step 4:  Constants (constants/initialState.ts, constants/gameBalance.ts)
         → No logic. Straight data extraction.
         → Update saveMigration to import from new location.

Step 5:  Small services (no store dependency):
         notificationService.ts, offlineService.ts, leaderboardService.ts,
         payoutService.ts, rankService.ts, newsService.ts
         → Pure state mutations, few deps.

Step 6:  Medium services (some business logic):
         transportService.ts, blueprintService.ts, megaProjectService.ts,
         researchService.ts, workerService.ts, contractService.ts,
         droneService.ts, questService.ts

Step 7:  Large services (heavy business logic):
         buildingService.ts, marketService.ts, prestigeService.ts,
         dailyRewardService.ts, saveService.ts

Step 8:  Game tick (services/gameTick.ts)
         → The 800-line core loop. Most complex, highest risk.
         → Leave until last so all other services are already tested.

Step 9:  Store composition + persistence
         → store/index.ts, store/actions.ts, store/persistence.ts
         → Final step: wire all services together, verify exports match.
```

### Extraction Rules

1. **One module per PR/commit.** No batch extractions.
2. **After each extraction:** run full test suite, verify build, verify lint.
3. **Re-export** from `store/index.ts` so that importers of `@/lib/game/store` still work.
4. **Do not change behavior** — only move code and update imports.
5. **The baseline test file** (`store.baseline.test.ts`) is the regression shield. It must pass after every extraction step.

---

## Appendix: The 53 Store Actions Inventory

| # | Action | Group | Lines | Async | API Call | Est. Lines |
|---|--------|-------|-------|-------|----------|-----------|
| 1 | `gameTickAction` | Core | 1048–1846 | No | No | ~800 |
| 2 | `setGameSpeed` | Core | 1852–1869 | Yes | No | ~18 |
| 3 | `togglePause` | Core | 1870 | No | No | 1 |
| 4 | `setActiveTab` | Core | 1871 | No | No | 1 |
| 5 | `buildBuilding` | Building | 1875–1927 | Yes | No | ~53 |
| 6 | `upgradeBuilding` | Building | 1930–1952 | No | No | ~23 |
| 7 | `toggleBuilding` | Building | 1955–1995 | Yes | No | ~41 |
| 8 | `selectBuilding` | Building | 1997 | No | No | 1 |
| 9 | `buildTransportLine` | Transport | 2001–2036 | No | No | ~36 |
| 10 | `upgradeTransportLine` | Transport | 2039–2061 | No | No | ~23 |
| 11 | `toggleTransportLine` | Transport | 2064–2070 | No | No | ~7 |
| 12 | `startResearch` | Research | 2074–2116 | Yes | No | ~43 |
| 13 | `hireWorker` | Worker | 2120–2155 | Yes | No | ~36 |
| 14 | `assignWorker` | Worker | 2158–2174 | Yes | No | ~17 |
| 15 | `levelUpWorker` | Worker | 2177–2178 | No | No | ~2 |
| 16 | `sellResource` | Market | 2182–2219 | Yes | No | ~38 |
| 17 | `buyResource` | Market | 2222–2261 | Yes | No | ~40 |
| 18 | `toggleAutoSell` | Market | 2264–2271 | No | No | ~8 |
| 19 | `acceptContract` | Contract | 2275–2282 | No | No | ~8 |
| 20 | `fulfillContract` | Contract | 2285–2324 | No | No | ~40 |
| 21 | `activateAutomation` | Automation | 2328–2353 | No | No | ~26 |
| 22 | `doPrestige` | Prestige | 2357–2464 | Yes | Yes | ~108 |
| 23 | `purchasePrestigeBonus` | Prestige | 2467–2487 | No | No | ~21 |
| 24 | `addNotification` | Notification | 2491–2495 | No | No | ~5 |
| 25 | `markNotificationRead` | Notification | 2500–2505 | No | No | ~6 |
| 26 | `markAllNotificationsRead` | Notification | 2508–2511 | No | No | ~4 |
| 27 | `clearNotifications` | Notification | 2512 | No | No | 1 |
| 28 | `exportSave` | Save | 2516–2552 | No | No | ~37 |
| 29 | `importSave` | Save | 2558–2677 | No | No | ~120 |
| 30 | `resetGame` | Save | 2679 | No | No | 1 |
| 31 | `divergesFromExpected` | Anti-Cheat | 2687–2691 | No | No | ~5 |
| 32 | `getNewsLLMState` | LLM | 2693 | No | No | 1 |
| 33 | `refreshNewsFromLLM` | LLM | 2696–2705 | No | No | ~10 |
| 34 | `collectPayout` | Payout | 2709–2719 | No | No | ~11 |
| 35 | `toggleAutoCollect` | Payout | 2722–2729 | No | No | ~8 |
| 36 | `buyDrone` | Drone | 2733–2758 | No | No | ~26 |
| 37 | `sendDrone` | Drone | 2761–2804 | Yes | No | ~44 |
| 38 | `upgradeDrone` | Drone | 2807–2840 | No | No | ~34 |
| 39 | `generateDroneMissions` | Drone | 2843–2844 | No | No | ~2 (calls fn) |
| 40 | `addLeaderboardEntry` | Leaderboard | 2848–2854 | No | No | ~7 |
| 41 | `checkDailyLogin` | Daily Reward | 2858–2931 | Yes | Yes | ~74 |
| 42 | `claimDailyReward` | Daily Reward | 2934–3006 | Yes | Yes | ~73 |
| 43 | `claimQuestReward` | Quest | 3010–3037 | Yes | Yes | ~28 |
| 44 | `updateQuestProgress` | Quest | 3040–3139 | No | No | ~100 |
| 45 | `setTrackedQuest` | Quest | 3142–3143 | No | No | ~2 |
| 46 | `upgradeStorage` | Storage | 3147–3172 | No | No | ~26 |
| 47 | `applyServerState` | Offline | 3176–3180 | No | No | ~5 |
| 48 | `getCurrentRank` | Rank | 3184–3215 | No | No | ~32 |
| 49 | `getPlayerGameTier` | Game Tier | 3219–3224 | No | No | ~6 |
| 50 | `startMegaProject` | Mega Project | 3228–3263 | No | No | ~36 |
| 51 | `contributeToMegaProject` | Mega Project | 3266–3288 | No | No | ~23 |
| 52 | `saveBlueprint` | Blueprint | 3292–3326 | No | No | ~35 |
| 53 | `loadBlueprint` | Blueprint | 3329–3382 | No | No | ~54 |
| 54 | `deleteBlueprint` | Blueprint | 3385–3388 | No | No | ~4 |
| 55 | `renameBlueprint` | Blueprint | 3391–3397 | No | No | ~7 |
| 56 | `exportBlueprint` | Blueprint | 3400–3416 | No | No | ~17 |
| 57 | `importBlueprint` | Blueprint | 3421–3499 | No | No | ~79 |

**Also to extract:**
- `generateDroneMissionsFromState(state)` (free function, ~60 lines)
- `createInitialState()` (free function, ~98 lines)
- `migrateSaveState()` (free function, ~510 lines)
- `formatNumber()` (free function, ~15 lines)
- `generateId()` (free function, ~3 lines)
- `getGlobalPrice()` (free function, ~5 lines)
- `getMegaProjectBonus()` (free function, ~3 lines)
- `hasUnlimitedStorage()` (free function, ~3 lines)
- `getBuildingCost()` (free function, ~10 lines)
- `isResearchUnlocked()` (free function, ~8 lines)
- `isBuildingUnlocked()` (free function, ~10 lines)
- `getCapacity()` (free function, ~12 lines)
- `debouncedPersistStorage` (object, ~30 lines)
- `ensureLLMCallback()` (free function, ~25 lines)
- `initLLMIfNeeded()` (free function, ~8 lines)
