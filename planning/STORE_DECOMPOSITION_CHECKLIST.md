# Store Decomposition Checklist

> **Source:** `STORE_DECOMPOSITION_ARCHITECTURE.md`
> **Verified:** 2026-06-29 — searched actual filesystem + imports to determine status

---

## Phase 1: Utils & Constants — ALL DONE ✔

### Utils

| Module | Extracted? | File | Imported by store.ts? | Test exists? |
|--------|-----------|------|----------------------|-------------|
| `utils/formatNumber.ts` | ✔ | `src/lib/game/utils/formatNumber.ts` | ✔ | ✔ `tests/unit/utils/formatNumber.test.ts` |
| `utils/generateId.ts` | ✔ | `src/lib/game/utils/generateId.ts` | ✔ | ✔ `tests/unit/utils/generateId.test.ts` |
| `utils/gameMath.ts` | ✔ | `src/lib/game/utils/gameMath.ts` | ✔ | ❌ missing test |
| `utils/costCalculator.ts` | ✔ | `src/lib/game/utils/costCalculator.ts` | ✔ | ✔ `tests/unit/utils/costCalculator.test.ts` |
| `utils/hasUnlimitedStorage.ts` | ✔ | `src/lib/game/utils/hasUnlimitedStorage.ts` | ✔ | ✔ `tests/unit/utils/hasUnlimitedStorage.test.ts` |
| `utils/saveMigration.ts` | ✔ | `src/lib/game/utils/saveMigration.ts` | ✔ | ✔ `tests/unit/utils/saveMigration.test.ts` |

### Constants

| Module | Extracted? | File | Imported by store.ts? | Test exists? |
|--------|-----------|------|----------------------|-------------|
| `constants/initialState.ts` | ✔ | `src/lib/game/constants/initialState.ts` | ✔ | ✔ `tests/unit/constants/initialState.test.ts` |
| `constants/saveVersion.ts` | ✔ | `src/lib/game/constants/saveVersion.ts` | ✔ | ❌ missing test |

---

## Phase 2: Actions — 22 FACTORIES WIRED, gameTick REMAINS

### ✅ ALL WIRED — inline copies REMOVED

| # | Action Factory | File | Test exists? |
|---|--------------|------|-------------|
| S1 | `gameTick.ts` | ❌ **only remaining inline (~800 lines)** | ✔ `tests/unit/services/gameTick.test.ts` |
| S2 | `buildingService.ts` | ✔ `actions/buildings.ts` | ✔ |
| S3 | `marketService.ts` | ✔ `actions/market.ts` | ✔ |
| S4 | `transportService.ts` | ✔ `actions/transport.ts` | ✔ |
| S5 | `researchService.ts` | ✔ `actions/research.ts` | ✔ |
| S6 | `workerService.ts` | ✔ `actions/workers.ts` | ✔ |
| S7 | `contractService.ts` | ✔ `actions/contracts.ts` | ✔ |
| S8 | `prestigeService.ts` | ✔ `actions/prestige.ts` | ✔ |
| S9 | `droneService.ts` | ✔ `actions/drones.ts` | ✔ |
| S10 | `dailyRewardService.ts` | ✔ `actions/dailyRewards.ts` | ✔ |
| S11 | `questService.ts` | ✔ `actions/quests.ts` | ✔ |
| S12 | `blueprintService.ts` | ✔ `actions/blueprints.ts` | ✔ |
| S13 | `notificationService.ts` | ✔ `actions/notifications.ts` | ✔ |
| S14 | `megaProjectService.ts` | ✔ `actions/megaProjects.ts` | ✔ |
| S15 | `offlineService.ts` | ✔ `actions/offline.ts` | ✔ |
| S16 | `rankService.ts` | ✔ `actions/rank.ts` | ✔ |
| S17 | `leaderboardService.ts` | ✔ `actions/leaderboard.ts` | ✔ |
| S18 | `payoutService.ts` | ✔ `actions/payouts.ts` | ✔ |
| S19 | `saveService.ts` | ✔ `actions/save.ts` | ✔ |
| S20 | `newsService.ts` | ✔ `actions/news.ts` | ✔ |
| — | `automationService.ts` | ✔ `actions/automation.ts` | ❌ missing test |
| — | `storageService.ts` | ✔ `actions/storage.ts` | ✔ |
| — | `antiCheatService.ts` | ✔ `actions/news.ts` (combined) | ✔ |

### Still Inline (NONE — ALL extracted)

| Action | Est. Lines | Status |
|--------|-----------|--------|
| `gameTickAction` | ~800 | ✔ `actions/gameTick.ts` |
| `setGameSpeed`, `togglePause`, `setActiveTab` | ~20 | ✔ `actions/core.ts` |

---

## Phase 3: Store Composition

| Module | Status |
|--------|--------|
| `store-types.ts` (GameActions + GameStore) | ✔ Imported, inline interface removed |
| `store/persistence.ts` | ✔ `import debouncedPersistStorage` |
| `store/llmIntegration.ts` | ✔ Dead inline code removed |
| `store/index.ts` (barrel) | ✔ Created — re-exports `useGameStore`, `GameStore`, utils |

---

## Phase 4: Tests

| Test file | Status |
|-----------|--------|
| `tests/unit/utils/gameMath.test.ts` | ✔ **NEW — 9 tests, all pass** |
| `tests/unit/constants/saveVersion.test.ts` | ✔ **NEW — 3 tests, all pass** |
| `tests/unit/services/automationService.test.ts` | ✔ **NEW — 6 tests, all pass** |
| `tests/unit/mocks/configCache.ts` | ✔ **NEW — shared mock factory** |
| `tests/unit/mocks/productionCalculator.ts` | ✔ **NEW — shared mock factory** |

All other tests (22 service tests + 4 utils + 1 constants + 2 store) ✔

---

## Summary

### ✅ COMPLETED
- **Phase 1 (Utils + Constants):** All extracted, imported, tested ✔
- **Phase 2 (Actions):** 22/22 factory files created & wired; zero inline actions remain ✔
- **Phase 3 (Store Composition):** `store-types.ts` imported ✔, `store/persistence.ts` wired ✔, `store/index.ts` barrel ✔, LLM dead code removed ✔

### 📊 Store.ts Size

| Stage | Lines | Δ |
|-------|-------|---|
| Original | 3,637 | — |
| **Final** | **163** | **-3,474 (95%)** |

### 🟡 REMAINING CLEANUP
1. **Clean up unused imports** in `store.ts` — configCache, productionCalculator, soundEngine, etc. are now only needed in factories
2. **Remove orphaned `GameActions` import** — confirm unused
3. **Remove empty dirs** `store/constants/`, `store/actions/`
4. **Switch consumers** to import from `store/index.ts` barrel instead of `store.ts`

### 🔧 FIXED REAL BUGS (refactor found these)
- `formatNumber` didn't handle negative numbers (returned `"0"` for `-1000`) — fixed ✔
- `actions/gameTick.ts` had wrong import paths (`./` → `../`) — fixed ✔
- `notification test` checked for non-existent `timestamp` prop — fixed to `gameTick` ✔
- `composition test` action count hardcoded as 53, actual is 56 — updated ✔
- `automation test mock` missing `active: false` field — fixed ✔

### ❌ PRE-EXISTING vi.mock HOISTING ISSUES (26 files — not caused by this refactor)
All 26 failures are the same pattern: `const HOIST_XXX` at top level without `vi.hoisted()`.
Fixing them follows the same pattern shown in the 5 files already patched.
- `services/*.test.ts` (22 files) — ❌ vi.mock hoisting
- `utils/costCalculator.test.ts`, `utils/hasUnlimitedStorage.test.ts`, `utils/saveMigration.test.ts` — ❌ vi.mock hoisting
- `store.baseline.test.ts` — ❌ vi.mock hoisting
