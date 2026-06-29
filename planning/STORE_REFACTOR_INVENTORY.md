# store.ts Refactor Inventory

> **File:** `src/lib/game/store.ts` — **3,637 lines**
> **Purpose:** Single Zustand store containing ALL game state + ALL actions + ALL helper functions.
> **Status:** Pre-refactor inventory — 2026-06-28

---

## 1. Imports (33 modules)

| Import | Source | Category |
|--------|--------|----------|
| `create` | `zustand` | Zustand core |
| `persist` | `zustand/middleware` | Persistence middleware |
| `BuildingType`, `TransportType`, `WorkerType`, `WeatherType`, `ResourceType`, `CostResourceType`, `GameTab`, `MegaProjectType`, `MegaProjectBonusType` | `@/lib/game/types` | Types |
| `GameState`, `BuildingInstance`, `TransportLine`, `Worker`, `Contract`, `MarketPrice`, `AutomationUnlock`, `PrestigeState`, `GameEvent`, `BuildingDefinition`, `ResourceAmount`, `GameNotification`, `MegaProject`, `Blueprint`, `LeaderboardEntry`, `LoginStreak`, `DailyReward`, `ProductionSnapshot`, `PayoutConfig`, `PayoutRecord`, `Drone`, `DroneMission` | `@/lib/game/types` | Types (continued) |
| `initNewsLLM`, `registerUpdateCallback`, `getLLMState` | `./newsLLM` | LLM news engine |
| `buildMultipliers`, `MultiplierCache`, `computeProduction`, `computePowerGrid`, `computePayout`, `computeEndgameIncome`, `computeSellMultiplier` | `./productionCalculator` | Production calculators |
| `BUILDING_DEFS`, `RESOURCE_META`, `WEATHER_DEFS`, `WORKER_DEFS`, `TRANSPORT_DEFS`, `RESEARCH_TREE`, `AUTOMATION_UNLOCKS`, `PRESTIGE_BONUSES`, `RANK_THRESHOLDS`, `INITIAL_MARKET`, `CONTRACT_TEMPLATES`, `INITIAL_MEGA_PROJECTS`, `QUEST_DEFS`, `WEEKLY_DAILY_REWARDS`, `SEASONAL_EVENTS`, `getStreakMultiplier`, `emptyProductionSnapshot` | `./configCache` | Game config |
| `migrateSaveBuildings` | `./idMigration` | Save migration |
| `soundEngine` | `./soundEngine` | Sound |
| `pickRandomArchetype`, `resolveArchetype` | `./eventArchetypes` | Events |
| `GameConfig`, `SupabaseBuilding`, etc. | `./config` | Config types |
| `getBalance` | `./balanceConfig` | Balance config |

---

## 2. Top-Level Functions (11)

| Function | Lines | Exported? | Purpose | Dependencies |
|----------|-------|-----------|---------|--------------|
| `generateId()` | 47-50 | ✅ | `crypto.randomUUID()` | none |
| `getGlobalPrice()` | 51-57 | ❌ | Get price from serverMarket or local market | GameState, ResourceType |
| `getMegaProjectBonus()` | 59-63 | ❌ | Sum mega project bonuses by type | MegaProject array |
| `hasUnlimitedStorage()` | 64-66 | ✅ | Check unlimited storage unlock | MegaProject array |
| `formatNumber()` | 68-80 | ✅ | Format large numbers (1K, 1M, 1B, 1T) | number |
| `getBuildingCost()` | 81-88 | ✅ | Calculate building cost with multiplier | BuildingType, count, reduction |
| `isResearchUnlocked()` | 89-93 | ❌ | Check research prerequisites | researchId, completedResearch[] |
| `isBuildingUnlocked()` | 95-102 | ❌ | Check building unlock requirements | BuildingType, research[], prestige |
| `getCapacity()` | 104-112 | ❌ | Get resource storage capacity | GameState, ResourceType, cache |
| `generateDroneMissionsFromState()` | 114-200 | ❌ | Generate drone mission list | GameState |
| `migrateSaveState()` | 202-635 | ❌ | Migrate save between versions | persistedState, version |

---

## 3. Constants & Initial State

| Symbol | Lines | Type | Purpose |
|--------|-------|------|---------|
| `SAVE_VERSION` | 44 | `const = 20` | Current save format version |
| `initialResources` | 636-690 | `Record<ResourceType, number>` | Default zero-initialized resources (80+ types) |
| `initialCapacity` | 692-748 | `Record<ResourceType, number>` | Default storage capacities per resource |
| `createInitialState()` | 750-838 | function | Produces the complete default `GameState` |

---

## 4. Zustand Store Interface (`GameActions`)

| Action | Signature | Async? | Category |
|--------|-----------|--------|----------|
| `gameTickAction` | `() => void` | ❌ | Core |
| `setGameSpeed` | `(speed: number) => Promise<void>` | ✅ | Core |
| `togglePause` | `() => void` | ❌ | Core |
| `setActiveTab` | `(tab: GameTab) => void` | ❌ | Core |
| `buildBuilding` | `(type: BuildingType) => Promise<void>` | ✅ | Buildings |
| `upgradeBuilding` | `(id: string) => void` | ❌ | Buildings |
| `toggleBuilding` | `(id: string) => Promise<void>` | ✅ | Buildings |
| `selectBuilding` | `(id: string \| null) => void` | ❌ | Buildings |
| `buildTransportLine` | `(type, from, to, resource) => void` | ❌ | Transport |
| `upgradeTransportLine` | `(id: string) => void` | ❌ | Transport |
| `toggleTransportLine` | `(id: string) => void` | ❌ | Transport |
| `startResearch` | `(id: string) => Promise<void>` | ✅ | Research |
| `hireWorker` | `(type: WorkerType) => Promise<void>` | ✅ | Workers |
| `assignWorker` | `(workerId, buildingId) => Promise<void>` | ✅ | Workers |
| `levelUpWorker` | `(workerId) => void` | ❌ | Workers (no-op) |
| `sellResource` | `(resource, amount) => Promise<void>` | ✅ | Market |
| `buyResource` | `(resource, amount) => Promise<void>` | ✅ | Market |
| `toggleAutoSell` | `(resource) => void` | ❌ | Market |
| `acceptContract` | `(contract) => void` | ❌ | Contracts |
| `fulfillContract` | `(id) => void` | ❌ | Contracts |
| `activateAutomation` | `(type) => void` | ❌ | Automation |
| `doPrestige` | `() => Promise<void>` | ✅ | Prestige |
| `purchasePrestigeBonus` | `(id) => void` | ❌ | Prestige |
| `addNotification` | `(type, message) => void` | ❌ | Notifications |
| `markNotificationRead` | `(id) => void` | ❌ | Notifications |
| `markAllNotificationsRead` | `() => void` | ❌ | Notifications |
| `clearNotifications` | `() => void` | ❌ | Notifications |
| `exportSave` | `() => string` | ❌ | Save/Export |
| `importSave` | `(saveString) => boolean` | ❌ | Save/Import |
| `resetGame` | `() => void` | ❌ | Admin |
| `startMegaProject` | `(type) => void` | ❌ | MegaProjects |
| `contributeToMegaProject` | `(type) => void` | ❌ | MegaProjects |
| `saveBlueprint` | `(name) => void` | ❌ | Blueprints |
| `loadBlueprint` | `(id) => void` | ❌ | Blueprints |
| `deleteBlueprint` | `(id) => void` | ❌ | Blueprints |
| `renameBlueprint` | `(id, name) => void` | ❌ | Blueprints |
| `exportBlueprint` | `(id) => string` | ❌ | Blueprints |
| `importBlueprint` | `(code) => boolean` | ❌ | Blueprints |
| `upgradeStorage` | `(resource, levels) => void` | ❌ | Storage |
| `applyServerState` | `(newState) => void` | ❌ | Offline |
| `getCurrentRank` | `() => RankResult` | ❌ | Rank |
| `getPlayerGameTier` | `() => number` | ❌ | Game Tier |
| `addLeaderboardEntry` | `(entry) => void` | ❌ | Leaderboard |
| `checkDailyLogin` | `() => void` | ✅ | Daily Rewards |
| `claimDailyReward` | `(day) => void` | ✅ | Daily Rewards |
| `claimQuestReward` | `(questId) => Promise<void>` | ✅ | Quests |
| `updateQuestProgress` | `(type, amount, targetId?) => void` | ❌ | Quests |
| `setTrackedQuest` | `(id \| null) => void` | ❌ | Quests |
| `divergesFromExpected` | `(serverComputedMax) => boolean` | ❌ | Anti-Cheat |
| `collectPayout` | `() => void` | ❌ | Payouts |
| `toggleAutoCollect` | `() => void` | ❌ | Payouts |
| `buyDrone` | `() => void` | ❌ | Drones |
| `sendDrone` | `(missionId, droneId) => Promise<void>` | ✅ | Drones |
| `upgradeDrone` | `(droneId, type) => void` | ❌ | Drones |
| `generateDroneMissions` | `() => DroneMission[]` | ❌ | Drones |
| `getNewsLLMState` | `() => LLMEngineState` | ❌ | LLM News |
| `refreshNewsFromLLM` | `(updates) => void` | ❌ | LLM News |

---

## 5. Persistence Layer

| Component | Lines | Purpose |
|-----------|-------|---------|
| `debounceTimer` | ~894 | Module-level timer ref |
| `DEBOUNCE_MS = 5000` | ~895 | 5-second debounce window |
| `pendingWrite` | ~898 | Pending write state |
| `flushPendingWrite()` | ~900-909 | Flush to localStorage |
| `debouncedPersistStorage` | ~921-960 | Zustand v5 PersistStorage wrapper |
| `beforeunload` listener | ~963-970 | Force-save on page unload |
| `partialize` | ~3512-3552 | Select which fields to persist |
| `version: SAVE_VERSION` | ~3554 | Migration version |
| `migrate` | ~3555-3557 | State migration on load |
| `onRehydrateStorage` | ~3559-3573 | Error recovery on rehydrate |

---

## 6. Side Effects (fire-and-forget API calls)

| Location | Endpoint | Trigger | Purpose |
|----------|----------|---------|---------|
| `gameTickAction` | `POST /api/market/action` | Event pressure | Record market pressure on events |
| `sellResource` | `POST /api/market/action` | Manual sell | Record sell pressure |
| `buyResource` | `POST /api/market/action` | Manual buy | Record buy pressure |
| `doPrestige` | `POST /api/leaderboard/submit` | Prestige complete | Submit score to leaderboard |

---

## 7. LLM News Integration

| Component | Lines | Purpose |
|-----------|-------|---------|
| `llmInitialized` | ~977 | Module-level init flag |
| `llmCallbackRegistered` | ~980 | Callback registration flag |
| `ensureLLMCallback()` | ~982-997 | Register update callback for LLM results |
| `initLLMIfNeeded()` | ~999-1003 | Lazy init LLM news engine |

---

## 8. Zustand Store Creation

| Component | Lines | Purpose |
|-----------|-------|---------|
| `useGameStore` | 1005-3578 | Zustand store with persist middleware |
| Store body | 1007-3509 | `(set, get) => ({ ...createInitialState(), ...actions })` |
| `persist` config | 3510-3578 | Storage, partialize, version, migrate, onRehydrateStorage |
| Dev export | 3580-3582 | `window.__gameStore` in dev mode |

---

## 9. Exports (at bottom)

```typescript
export { formatNumber, getBuildingCost, isBuildingUnlocked, isResearchUnlocked, generateId };
export { useGameStore }; // default export from create()
```

---

## 10. Dependency Graph

```
store.ts
├── imports: 33 modules (types, calculators, config, sounds, events, idMigration)
├── top-level helpers (11 functions, 2 exported)
├── constants (initialResources, initialCapacity — 80+ resource types)
├── createInitialState() → GameState (50+ fields)
├── Zustand persist middleware
│   ├── debouncedPersistStorage (localStorage, 5s debounce)
│   ├── partialize (which fields to persist)
│   ├── migrate (save version migration)
│   └── onRehydrateStorage (error recovery)
├── LLM news integration (lazy init, callback registration)
└── Store body
    ├── gameTickAction (600+ lines — the largest action)
    │   ├── computePowerGrid → productionCalculator
    │   ├── computeProduction → productionCalculator
    │   ├── computePayout → productionCalculator
    │   ├── computeEndgameIncome → productionCalculator
    │   ├── fetch → /api/market/action (side effect)
    │   └── updateQuestProgress (recursive store call)
    ├── 45+ game actions (build, sell, research, prestige, etc.)
    │   ├── ~10 async (call actionValidator with server)
    │   └── ~35 sync (direct state mutations)
    ├── Leaderboard submission (post-prestige, fire-and-forget)
    └── Daily rewards (fetch → /api/game/daily-reward)
```

---

## 11. Extraction Plan (proposed order)

Extract in this order — each step is independent, testable, and non-breaking:

### Round 1: Pure Functions (zero dependencies)
1. `src/lib/game/store/utils/formatNumber.ts`
2. `src/lib/game/store/utils/generateId.ts`
3. `src/lib/game/store/utils/getGlobalPrice.ts`
4. `src/lib/game/store/utils/getMegaProjectBonus.ts`
5. `src/lib/game/store/utils/hasUnlimitedStorage.ts`
6. `src/lib/game/store/utils/getBuildingCost.ts`
7. `src/lib/game/store/utils/isResearchUnlocked.ts`
8. `src/lib/game/store/utils/isBuildingUnlocked.ts`
9. `src/lib/game/store/utils/getCapacity.ts`

### Round 2: Constants & Initial State
10. `src/lib/game/store/config/initialResources.ts`
11. `src/lib/game/store/config/initialCapacity.ts`
12. `src/lib/game/store/config/createInitialState.ts`
13. `src/lib/game/store/config/saveVersion.ts`

### Round 3: Persistence Layer
14. `src/lib/game/store/persistence/debouncedStorage.ts`

### Round 4: Feature Actions (one file per domain)
15. `src/lib/game/store/actions/gameTick.ts`
16. `src/lib/game/store/actions/buildings.ts`
17. `src/lib/game/store/actions/transport.ts`
18. `src/lib/game/store/actions/research.ts`
19. `src/lib/game/store/actions/workers.ts`
20. `src/lib/game/store/actions/market.ts`
21. `src/lib/game/store/actions/contracts.ts`
22. `src/lib/game/store/actions/automation.ts`
23. `src/lib/game/store/actions/prestige.ts`
24. `src/lib/game/store/actions/notifications.ts`
25. `src/lib/game/store/actions/payouts.ts`
26. `src/lib/game/store/actions/drones.ts`
27. `src/lib/game/store/actions/megaProjects.ts`
28. `src/lib/game/store/actions/blueprints.ts`
29. `src/lib/game/store/actions/storage.ts`
30. `src/lib/game/store/actions/leaderboard.ts`
31. `src/lib/game/store/actions/dailyRewards.ts`
32. `src/lib/game/store/actions/quests.ts`
33. `src/lib/game/store/actions/rank.ts`
34. `src/lib/game/store/actions/gameTier.ts`
35. `src/lib/game/store/actions/saveImport.ts`

### Round 5: Edge Integration
36. `src/lib/game/store/actions/offline.ts` (applyServerState)
37. `src/lib/game/store/actions/antiCheat.ts` (divergesFromExpected)
38. `src/lib/game/store/actions/newsLLM.ts`

### Round 6: Barrel + Store Assembly
39. `src/lib/game/store/index.ts` — re-exports all modules + assembles the Zustand store

---

## 12. Proposed Folder Structure

```
src/lib/game/store/
├── index.ts                    # Barrel file — assembles store from parts
├── types.ts                    # Store-specific types (if any)
├── config/
│   ├── initialResources.ts
│   ├── initialCapacity.ts
│   ├── createInitialState.ts
│   └── saveVersion.ts
├── utils/
│   ├── formatNumber.ts
│   ├── generateId.ts
│   ├── getGlobalPrice.ts
│   ├── getMegaProjectBonus.ts
│   ├── hasUnlimitedStorage.ts
│   ├── getBuildingCost.ts
│   ├── isResearchUnlocked.ts
│   ├── isBuildingUnlocked.ts
│   └── getCapacity.ts
├── persistence/
│   └── debouncedStorage.ts
├── actions/
│   ├── gameTick.ts
│   ├── buildings.ts
│   ├── transport.ts
│   ├── research.ts
│   ├── workers.ts
│   ├── market.ts
│   ├── contracts.ts
│   ├── automation.ts
│   ├── prestige.ts
│   ├── notifications.ts
│   ├── payouts.ts
│   ├── drones.ts
│   ├── megaProjects.ts
│   ├── blueprints.ts
│   ├── storage.ts
│   ├── leaderboard.ts
│   ├── dailyRewards.ts
│   ├── quests.ts
│   ├── rank.ts
│   ├── gameTier.ts
│   ├── saveImport.ts
│   ├── offline.ts
│   ├── antiCheat.ts
│   └── newsLLM.ts
├── save-migration/
│   └── migrateSaveState.ts
└── __tests__/
    └── store.baseline.test.ts
```

---

## 13. Files That Will Need Updating

| File | Reason |
|------|--------|
| `src/app/page.tsx` | Imports `formatNumber` from store.ts — must update import path |
| `src/components/game/**/*.tsx` | Multiple components import `formatNumber`, `useGameStore` |
| `src/lib/game/configCache.ts` | Uses `GameState` type |
| `src/lib/game/types.ts` | Used by all store modules |
| `src/lib/game/actionValidator.ts` | Called by async store actions |
| `tests/api/**/*.test.ts` | Mock store imports |
| `tests/integration/*.test.ts` | Store logic tests |

## 14. Test Coverage Requirements

| Action | Sync/Async | Has side effects? | Priority |
|--------|-----------|-------------------|----------|
| `generateId` | Sync | No | P0 |
| `formatNumber` | Sync | No | P0 |
| `getBuildingCost` | Sync | No | P0 |
| `getCapacity` | Sync | No | P0 |
| `hasUnlimitedStorage` | Sync | No | P0 |
| `isResearchUnlocked` | Sync | No | P0 |
| `isBuildingUnlocked` | Sync | No | P0 |
| `togglePause` | Sync | No | P0 |
| `setActiveTab` | Sync | No | P0 |
| `setGameSpeed` | Async | Yes (server validation) | P1 |
| `buildBuilding` | Async | Yes (server validation + sound) | P1 |
| `upgradeBuilding` | Sync | Yes (sound + notification) | P1 |
| `toggleBuilding` | Async | Yes (server + sound + power calc) | P1 |
| `buildTransportLine` | Sync | Yes (sound + notification) | P1 |
| `upgradeTransportLine` | Sync | No | P1 |
| `toggleTransportLine` | Sync | No | P1 |
| `startResearch` | Async | Yes (server validation) | P1 |
| `hireWorker` | Async | Yes (server validation) | P1 |
| `assignWorker` | Async | Yes (server validation) | P1 |
| `sellResource` | Async | Yes (server + fetch market API) | P1 |
| `buyResource` | Async | Yes (server + fetch market API) | P1 |
| `toggleAutoSell` | Sync | No | P2 |
| `acceptContract` | Sync | Yes (notification) | P2 |
| `fulfillContract` | Sync | Yes (sound + notification) | P1 |
| `activateAutomation` | Sync | Yes (sound + notification) | P2 |
| `doPrestige` | Async | Yes (server + leaderboard + reset) | P1 |
| `purchasePrestigeBonus` | Sync | Yes (sound + notification) | P2 |
| `addNotification` | Sync | No | P1 |
| `markNotificationRead` | Sync | No | P1 |
| `markAllNotificationsRead` | Sync | No | P1 |
| `clearNotifications` | Sync | No | P1 |
| `exportSave` | Sync | No | P1 |
| `importSave` | Sync | No (pure state mutation) | P1 |
| `resetGame` | Sync | No | P1 |
| `collectPayout` | Sync | Yes (sound + notification) | P2 |
| `toggleAutoCollect` | Sync | No | P2 |
| `buyDrone` | Sync | Yes (sound + notification) | P2 |
| `sendDrone` | Async | Yes (server validation) | P2 |
| `upgradeDrone` | Sync | Yes (sound + notification) | P2 |
| `generateDroneMissions` | Sync | No | P2 |
| `addLeaderboardEntry` | Sync | No | P2 |
| `checkDailyLogin` | Async | Yes (fetch API) | P1 |
| `claimDailyReward` | Async | Yes (fetch API) | P1 |
| `claimQuestReward` | Async | Yes (server validation) | P1 |
| `updateQuestProgress` | Sync | No | P2 |
| `setTrackedQuest` | Sync | No | P2 |
| `divergesFromExpected` | Sync | No | P1 |
| `getCurrentRank` | Sync | No | P1 |
| `getPlayerGameTier` | Sync | No | P2 |
| `applyServerState` | Sync | No | P1 |
| `saveBlueprint` | Sync | Yes (notification) | P2 |
| `loadBlueprint` | Sync | Yes (notification) | P2 |
| `deleteBlueprint` | Sync | Yes (notification) | P2 |
| `renameBlueprint` | Sync | No | P2 |
| `exportBlueprint` | Sync | No | P2 |
| `importBlueprint` | Sync | Yes (notification) | P1 |
| `startMegaProject` | Sync | Yes (notification) | P2 |
| `contributeToMegaProject` | Sync | Yes (notification) | P2 |
| `upgradeStorage` | Sync | Yes (sound + notification) | P2 |
| `gameTickAction` | Sync | Yes (heavy — computes full tick) | P1 |
| `migrateSaveState` | Sync | No (pure) | P0 |
| `generateDroneMissionsFromState` | Sync | No | P2 |
| `getNewsLLMState` | Sync | No | P3 |
| `refreshNewsFromLLM` | Sync | No | P3 |

---

## 15. Migration Functions (save version compatibility)

| Version | Changes | Lines |
|---------|---------|-------|
| V1 → V2 | Add megaProjects, productionHistory | ~203-208 |
| V2 → V3 | Add storageUpgradeLevels, lastOnlineTimestamp, autoSellResources | ~209-222 |
| V3 → V4 | Add leaderboardEntries | ~223-228 |
| V4 → V5 | Add loginStreak | ~229-241 |
| V5 → V6 | Add weather, quests | ~242-262 |
| V6 → V7 | Add payoutConfig, pendingPayout, payoutHistory | ~263-279 |
| V7 → V8 | Add trackedQuest | ~280-285 |
| V8 → V9 | Add drones | ~286-306 |
| V9 → V10 | Add ~16 new resources (clay, limestone, etc.) | ~307-370 |
| V10 → V11 | Add T4 resources | ~371-447 |
| V12 → V13 | Phase 3 economy rebalance — market prices | ~448-475 |
| V13 → V14 | Reset mega projects with new definitions | ~476-503 |
| V14 → V15 | Add productionSnapshot | ~504-507 |
| V15 → V16 | Add sectorTrends | ~508-511 |
| V16 → V17 | Add marketNews, marketNarratives | ~512-516 |
| V17 → V18 | Add lastTradeTick; migrate building IDs | ~517-528 |
| V18 → V19 | Add ~27 new T0-T5 resources | ~529-610 |
| V19 → V20 | Rename solarPanel → solarFarm | ~611-620 |

---

## 16. Known Untestable Areas

| Area | Reason |
|------|--------|
| `soundEngine.play()` | Audio engine — test via spy only |
| `initNewsLLM` | External LLM dependency — mock only |
| `fetch()` side effects in gameTickAction | Fire-and-forget API calls |
| `beforeunload` listener | Browser API — test via jsdom |
| `debouncedPersistStorage.setItem` | Timeout-based — test via vi.useFakeTimers |
| `onRehydrateStorage` error handler | Only runs during Zustand persist rehydration |
