# Store Decomposition Map (04.4)

> **Date:** 2026-06-12
> **Issue:** store.ts is 3,196 lines (planning said 3,506) — god file with all 42 actions, gameTickAction (~1,000 lines), 19 save migrations, persist config, and utilities mixed together
> **Status:** Planning only (no implementation in this phase)
> **Reference:** `src/lib/game/store.ts`, `PHASE_04_ARCHITECTURE_DECOMPOSITION.md` §04.4, `PHASE_1D_TECHNICAL_DEBT_PLAN.md`

---

## Problem

`src/lib/game/store.ts` is the single biggest file in the codebase. It contains:

| Concern | Approx lines | Risk |
|---------|--------------|------|
| 42 action functions | ~1,800 | Medium — many actions read/write many state slices |
| `gameTickAction` | ~1,000 | **HIGH** — called every tick, perf-critical, touches everything |
| 19 save migrations (`migrateSaveState`) | ~440 | High — migration order matters, must remain stable |
| Persist config + rehydration helpers | ~80 | Low |
| Utility functions (`generateId`, `formatNumber`, `getBuildingCost`, `isResearchUnlocked`, `isBuildingUnlocked`, `getCapacity`, `generateDroneMissionsFromState`, `getMegaProjectBonus`) | ~130 | Low — pure functions, easy to extract |
| Default state (initial resources, buildings, prestige, etc.) | ~150 | Low |
| `formatNumber` (also in store) | ~15 | Low — already exported, used externally |
| Type definitions (GameState, etc.) | (in types.ts, not store) | N/A |

**Problems:**
1. Single 3,196-line file makes navigation, code review, and refactoring painful
2. `gameTickAction` being monolithic blocks targeted optimization
3. All 42 actions in one file means every action's deps are entangled — hard to test, hard to split
4. 19 save migrations interleaved with action logic means migration changes risk breaking unrelated code
5. No clear dependency graph — new contributors can't understand the data flow

## Goal

Decompose `store.ts` into 7 bounded, independently testable slices **WITHOUT** changing any external behavior or API surface. The exported `useGameStore` hook MUST remain backwards-compatible — all existing `useGameStore(s => s.X)` selectors and `useGameStore.getState().Y()` action calls must continue to work with zero changes.

## Current State (Verified)

```
src/lib/game/store.ts: 3,196 lines
- ~80 utility/persist lines
- ~150 default state lines
- ~1,800 action lines (42 actions)
- ~1,000 gameTickAction lines
- ~440 migrateSaveState lines (19 migrations)
```

Top-level functions (from scan, lines approximate):
- `generateId` (L48)
- `getMegaProjectBonus` (L53)
- `formatNumber` (L62)
- `getBuildingCost` (L75)
- `isResearchUnlocked` (L83)
- `isBuildingUnlocked` (L89)
- `getCapacity` (L98)
- `generateDroneMissionsFromState` (L110)
- `migrateSaveState` (L176)
- (default state initializers, L600+)
- (create() with persist middleware, ~L2700+)
- (gameTickAction, ~L1000 lines)
- (other 41 actions scattered)

## Proposed Slice Boundaries

| Slice | Contents | Approx lines | State keys (subset) |
|-------|----------|--------------|---------------------|
| **economy** | money, transactions, payouts, payoutConfig, prestigePoints, totalMoneyEarned, market orders, trade history references | ~400 | `money`, `payoutConfig`, `pendingPayout`, `prestigeState`, `totalMoneyEarned` |
| **buildings** | buildings, powerGrid, transportLines, droneMissions, blueprints, construction queue | ~700 | `buildings`, `powerGrid`, `transportLines`, `blueprints` |
| **research** | researchPoints, completedResearch, activeResearch, research unlocks | ~150 | `researchPoints`, `completedResearch` |
| **market** | market prices, tradeHistory, marketConfig, lastTradeTimestamps | ~200 | `marketPrices`, `tradeHistory`, `cooldowns` |
| **workers** | workers, worker assignments, contracts, automation rules | ~300 | `workers`, `contracts`, `automation` |
| **progression** | prestige, achievements, quests, megaProjects, leaderboard scores, daily login, notifications | ~500 | `prestigeState`, `achievements`, `quests`, `megaProjects`, `notifications`, `activeEvents` |
| **ui** | activeTab, selectedBuilding, weather, settingsStore-related (visualization-only) | ~100 | `activeTab`, `selectedBuilding`, `weather` |

**Cross-slice state** (lives in store but read by multiple slices):
- `gameTick` (counter)
- `paused` / `gameSpeed` (clock control)
- `productionSnapshot` (derived, computed by gameTickAction)
- `notifications` (progression writes, ui reads)
- `resources` (the 70+ resource keys) — read by all slices, written by buildings + market

**Utility functions** (extracted first, pure):
- `generateId`, `formatNumber` → `src/lib/game/storeUtils.ts`
- `getBuildingCost`, `isResearchUnlocked`, `isBuildingUnlocked`, `getCapacity` → `src/lib/game/calc.ts`
- `getMegaProjectBonus` → `src/lib/game/progression/calc.ts`
- `generateDroneMissionsFromState` → `src/lib/game/buildings/drones.ts`

## Dependencies Between Slices

```
economy ◄── buildings (resources → buildings consume + produce)
   ▲             │
   │             ▼
progression ◄── research (unlocks buildings)
   ▲             │
   │             ▼
  ui       ◄── market (market reads buildings, writes money)
   ▲             │
   │             ▼
         workers (workers produce for buildings, get paid from economy)
```

**Critical dependency:** `gameTickAction` (in buildings slice) calls into economy, market, workers, and progression every tick. This is the single biggest coupling point.

**No circular deps** at the slice level — the dependency graph is a DAG:
- `ui` depends on everything (for display)
- `progression` depends on `economy` (for prestige costs)
- `market` depends on `economy` and `buildings` (for resources + money)
- `workers` depends on `buildings` and `economy` (for assignments + wages)
- `buildings` depends on `research` and `economy` (for unlocks + costs)
- `research` depends on `economy` (for costs)

## gameTickAction Decomposition Estimate

`gameTickAction` is ~1,000 lines and is called every tick. Breaking it up is the highest-risk part of this decomposition. Proposed approach:

**Strategy:** Extract the per-tick steps into named functions, then `gameTickAction` becomes a thin orchestrator:

```typescript
gameTickAction: () => set((state) => {
  const updates = applyTickSteps(state, effectiveSpeed);
  return updates;
});

// In src/lib/game/buildings/tickPipeline.ts:
function applyTickSteps(state: GameState, effectiveSpeed: number): Partial<GameState> {
  return {
    ...tickResources(state, effectiveSpeed),
    ...tickBuildings(state, effectiveSpeed),
    ...tickPowerGrid(state),
    ...tickTransport(state),
    ...tickWorkers(state, effectiveSpeed),
    ...tickMarket(state, effectiveSpeed),
    ...tickPayouts(state, effectiveSpeed),
    ...tickProgression(state, effectiveSpeed),
    ...tickEvents(state),
    ...tickWeather(state),
  };
}
```

**Estimate:**
- Phase A: Extract 10 tick step functions (1 step per day, ~100 lines each) = 1,000 lines moved, gameTickAction becomes 30-line orchestrator
- Phase B: Inline optimization (compute multiple steps in single pass where deps allow) = potential 20% tick perf gain
- **Effort:** Phase A = 3-4 days, Phase B = 2-3 days
- **Risk:** Phase A is low (pure refactor, no behavior change); Phase B is medium (must benchmark before/after to confirm gain)

## Save Migrations Map

19 migrations in `migrateSaveState` (L176, ~440 lines). Each migration is a `if (fromVersion === N) { ... }` block. **Order matters** — each migration transforms version N → N+1.

Proposed extraction: `src/lib/game/storeMigrations.ts` — single file containing all 19 migrations, called from the persist middleware's `migrate` callback. This is a **pure refactor** (move only, no logic change) and should be the **first** step in the implementation (lowest risk, biggest LOC reduction).

**Effort:** 1 day (move + verify with old save data in dev environment)
**Risk:** LOW — migrations are pure functions of the saved state

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Action deps are too tangled to cleanly extract | MEDIUM | HIGH | Extract by data access pattern, not by name; use dependency injection (pass state slices as args) |
| gameTickAction perf regression from orchestration overhead | MEDIUM | MEDIUM | Benchmark before/after; inline hot steps; use partial state updates |
| Save migration order broken during extraction | LOW | HIGH | Add integration test that loads saves from versions 1-19 and verifies upgrade path |
| Public API of `useGameStore` accidentally changes | MEDIUM | HIGH | **No code outside store.ts may need to change** — this is the success criterion. Enforce with grep-based check: `grep -r 'useGameStore' src/ \| grep -v store.ts` should show zero changes |
| Slice boundaries don't match actual usage patterns | MEDIUM | MEDIUM | Survey all `useGameStore(s => s.X)` call sites before deciding boundaries; group by access pattern |
| Circular dependency introduced between slices | LOW | HIGH | Use TypeScript's `import type` for type-only imports between slices; runtime imports only flow downward (ui → everything, economy → none) |
| gameTickAction re-entrancy during extraction | LOW | HIGH | gameTickAction is called from useGameTickLoop hook (already debounced via setInterval); add re-entrancy guard during refactor |

## Implementation Phases

This decomposition is **not part of Phase 04 itself** — it's planning only. When implemented (likely Phase 07+), follow this order:

**Phase A: Low-risk extractions (1-2 weeks)**
1. Extract utility functions to `src/lib/game/calc.ts` and `storeUtils.ts`
2. Extract 19 save migrations to `src/lib/game/storeMigrations.ts`
3. Extract default state initializer to `src/lib/game/defaultState.ts`
4. **Validation:** All 42 actions still in store.ts but file should drop to ~1,500 lines; types unchanged

**Phase B: Slice extraction (2-3 weeks)**
1. Create `src/lib/game/slices/economy.ts` with economy actions + state shape
2. Create `src/lib/game/slices/buildings.ts` (includes gameTickAction for now)
3. Create `src/lib/game/slices/research.ts`, `market.ts`, `workers.ts`, `progression.ts`, `ui.ts`
4. Compose slices via `create<FullState>()(persist(...))` pattern
5. **Validation:** `useGameStore` external API identical; all existing call sites work; type-check passes

**Phase C: gameTickAction decomposition (1-2 weeks)**
1. Extract 10 tick step functions to `src/lib/game/buildings/tickPipeline.ts`
2. Replace 1,000-line function with 30-line orchestrator
3. Benchmark: capture tick duration before/after with realistic state
4. **Validation:** Tick duration within 5% of pre-refactor; behavior identical (golden-state test)

## Validation Criteria

- [ ] `src/lib/game/store.ts` is < 500 lines (orchestrator + re-exports)
- [ ] All 7 slice files exist and are < 800 lines each
- [ ] `useGameStore` external API unchanged (zero call site changes outside store)
- [ ] Tick performance within 5% of pre-refactor
- [ ] Save migration tests pass for all 19 version transitions
- [ ] TypeScript strict mode passes (`tsc --noEmit` clean)
- [ ] `npm run build` succeeds
- [ ] All 6 panel smoke tests pass (play through 100 ticks in dashboard)

## Out of Scope

- **Actual implementation** — this is planning only
- **Per-slice selectors library** (Phase 03.5) — separate work
- **useCloudSync decomposition** (Phase 04.1) — separate work
- **UI component decomposition** (Phase 05) — separate work
- **Performance optimization beyond tick decomposition** — measure first

## Open Questions

1. Should slices be Zustand stores composed at the React level (multiple `useStore` calls) or a single store with logical slice grouping (one `useGameStore` call, internal slice files)? **Recommendation:** single store with slice files (preserves existing `useGameStore(s => s.X)` API).

2. How to handle cross-slice reads inside actions? Option A: pass whole state and destructure (simple). Option B: inject per-slice state getters (testable). **Recommendation:** Option A for Phase B (minimize churn), Option B for Phase C (gameTickAction refactor).

3. Should utility functions (`formatNumber`, `getBuildingCost`) move to slices or stay in `src/lib/game/` root? **Recommendation:** stay in root (already exported, used by UI components and other modules).

## Success Definition

When this decomposition is complete:
- A new contributor can understand the entire game state in 7 files instead of 1
- Tick performance is measurable and optimizable per-step
- Adding a new feature (e.g., "achievements") is a single-file change in the `progression` slice
- Save migration code is reviewable in isolation
- The codebase has a clear dependency graph that's enforceable with `madge` or `dependency-cruiser`

---

**Status:** PLANNING COMPLETE. Implementation deferred to Phase 07+ (estimated 4-7 weeks total).
**Priority:** Medium — biggest single-file risk in the codebase, but current `gameTickAction` works and is monitored.
**Effort estimate:** Phase A (1-2 weeks) + Phase B (2-3 weeks) + Phase C (1-2 weeks) = 4-7 weeks
**Blocking dependencies:** None
