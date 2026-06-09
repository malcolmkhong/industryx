# Phase 1 Modifier Architecture Refactor — Remaining Hardcoded Systems & Strategy Reports

---

## D6: Categorized Report of Remaining Hardcoded Systems

### CRITICAL (Game-balance affecting, must be data-driven for scalability)

| ID | System | Values | Location | Phase | Notes |
|----|--------|--------|----------|-------|-------|
| HC-1 | Payout rates | `extractorRate=20, factoryRate=50, powerRate=10` | productionCalculator.ts:564-566, serverEngine.ts:455-457 | Phase 2 | Should be in config/balancing rules |
| HC-2 | Endgame income | 8 hardcoded values (8000/10/1/5000/5/100000/50/5) | productionCalculator.ts:614-629, serverEngine.ts:504-519 | Phase 2 | Should be in building defs or balancing rules |
| HC-3 | Sell multiplier base | `0.9` base + marketBonus | productionCalculator.ts:550, serverEngine.ts:440 | Phase 2 | Should be `sell.baseMultiplier` target |
| HC-4 | Transport bonus formula | `1 + 0.25 * max(0, efficiency - 1)` | productionCalculator.ts:251, serverEngine.ts:170 | Phase 2 | The 0.25 constant should be configurable |
| HC-5 | Power grid constants | min 0.10, epsilon 0.001, worker max 0.5 | productionCalculator.ts:413, serverEngine.ts:301 | Phase 2 | Should be in config |
| HC-6 | Energy efficiency reductions | 0.15, 0.10 | productionCalculator.ts:405-406, serverEngine.ts:294-295 | Phase 2 | NOW resolved via modifier engine (power.consumption target), but computePowerGrid still reads boolean flags and hardcodes the values |
| HC-7 | Market commission rate | `0.15` | serverEngine.ts:959 | Phase 2 | Should be in balancing rules |
| HC-8 | Offline progression | `offlineRate=0.5`, sell `0.7`, min elapsed `5000` | store.ts:3059,3136,3049 | Phase 3 | Entire offline calc bypasses modifier engine |

### HIGH (Quality-of-life, affects maintainability)

| ID | System | Values | Location | Phase | Notes |
|----|--------|--------|----------|-------|-------|
| HC-9 | Solar/wind day cycle | `0.5 + 0.5 * sin(tick * 0.01)` etc. | productionCalculator.ts:384-389, serverEngine.ts:271-278 | Phase 2 | Should be in weather/building defs |
| HC-10 | RP income rates | extractor:0.01, power:0.01, T1-T3: 0.02-0.10 | store.ts:1234-1239 | Phase 2 | Should be modifier target `currency.researchPoints` |
| HC-11 | Building upgrade efficiency | `+0.05` per level | store.ts:1913 | Phase 2 | Should be in building defs |
| HC-12 | Drone fuel cost formula | `1 + (level-1) * 0.15` | store.ts:2784 | Phase 3 | Should be in drone defs |
| HC-13 | Worker XP gain | `0.01 * (1 + efficiencyBonus)` | store.ts:1291 | Phase 3 | Should be in worker defs |

### MEDIUM (Nice-to-have, no immediate scalability concern)

| ID | System | Values | Location | Phase | Notes |
|----|--------|--------|----------|-------|-------|
| HC-14 | Market simulator constants | 50+ values (volatilities, thresholds, decay) | marketSimulator.ts:95-128 | Phase 3+ | Complex subsystem, separate refactor |
| HC-15 | News builder thresholds | Min % change, severity levels | newsBuilder.ts:36-77 | Phase 3+ | Display-only, not game-balance |
| HC-16 | Contract tier multiplier | `1 + contractTier * 0.5` | store.ts:1404 | Phase 3 | Should be in contract defs |
| HC-17 | Storage upgrade formula | `1 + (level-1) * 0.25` | store.ts:1673 | Phase 3 | Should be in storage defs |

### LOW (Cosmetic, no gameplay impact)

| ID | System | Values | Location | Phase | Notes |
|----|--------|--------|----------|-------|-------|
| HC-18 | Sound engine durations | 0.05–0.35 second durations | soundEngine.ts:120-397 | N/A | Audio constants, no refactor needed |
| HC-19 | Config cache defaults | triggerChance 0.001–0.002 | configCache.ts:288 | N/A | Fallbacks for missing Supabase data |

---

## D7: Shared Formula Strategy — productionCalculator.ts vs serverEngine.ts

### Current State

Both files contain **5 identical functions** with the only difference being how building/worker/weather definitions are accessed:

| Function | Client (productionCalculator.ts) | Server (serverEngine.ts) |
|----------|----------------------------------|--------------------------|
| Build multipliers | `BUILDING_DEFS` from configCache | `config.buildings` from Supabase |
| Power grid | `BUILDING_DEFS` from configCache | `buildings` param from config |
| Production | `BUILDING_DEFS` from configCache | `buildings` param from config |
| Payout | `BUILDING_DEFS` from configCache | `buildings` param from config |
| Endgame income | Hardcoded switch/case | Hardcoded switch/case |

### Root Cause

The duplication exists because:
1. Client code uses module-level `BUILDING_DEFS` (imported from configCache)
2. Server code receives config via function parameter from Supabase
3. No abstraction layer exists to normalize building definition access

### Proposed Strategy: Config Adapter Pattern

Create a `GameConfigAdapter` interface that abstracts building/worker/weather definition access:

```typescript
interface GameConfigAdapter {
  getBuildingDef(type: string): BuildingDefinition | null;
  getWorkerDef(type: string): WorkerDefinition | null;
  getWeatherDef(type: string): { productionMultiplier: number; solarMultiplier: number; windMultiplier: number } | null;
}
```

Two implementations:
1. `ClientConfigAdapter` — wraps configCache module imports
2. `ServerConfigAdapter` — wraps GameConfig parameter from Supabase

Then refactor the 5 duplicated functions to take a `GameConfigAdapter` parameter instead of importing `BUILDING_DEFS` directly or passing config.

### Migration Path

1. **Phase 1 (Done)**: Both files now use ModifierEngine for bonus calculations — this is the most impactful deduplication
2. **Phase 2**: Extract `GameConfigAdapter` interface and implementations
3. **Phase 2**: Merge the 5 function pairs into shared implementations that take `GameConfigAdapter`
4. **Phase 2**: `productionCalculator.ts` exports shared functions; `serverEngine.ts` becomes a thin wrapper
5. **Phase 3**: Consider eliminating `serverEngine.ts` entirely if the adapter pattern works well

### Risk Assessment

- **Low risk**: The adapter pattern is well-established and doesn't change any formulas
- **Medium effort**: Need to refactor all 5 function pairs and their callers
- **High impact**: Eliminates ~500 lines of duplicated code, reduces bug surface

---

## D8: Offline Progression Assessment

### Current Implementation

`calculateOfflineProgress()` in `store.ts` (lines 3045-3146):

```typescript
// Simplified offline calculation — DOES NOT use the production calculator
const offlineRate = 0.5;  // hardcoded 50%
const effectiveOfflineRate = offlineRate * (1 + offlinePrestigeBonus + offlineMegaProductionBonus);

// For each building:
if (def.category === 'extractor') {
  produced = output.amount * def.baseProductionRate * b.level * b.efficiency * effectiveOfflineRate * ticksElapsed;
}

if (def.category === 'factory') {
  // Simplified input check, then produce
  produced = output.amount * def.baseProductionRate * b.level * b.efficiency * effectiveOfflineRate * ticksElapsed;
}
```

### Gaps Identified

| Gap | Impact | Severity |
|-----|--------|----------|
| No power grid efficiency applied | Buildings produce at full efficiency even if power-starved | HIGH |
| No weather modifier applied | Ignores weather state entirely | HIGH |
| No event modifier applied | Active events have no offline effect | HIGH |
| No transport bonus applied | Transport efficiency ignored | MEDIUM |
| No research bonuses applied | Only prestige/mega bonuses included | HIGH |
| Simplified factory input check | Doesn't account for upstream building output changes | MEDIUM |
| No RP/CP passive income from endgame buildings | Endgame passive income ignored during offline | HIGH |
| Hardcoded 0.5 base rate | Not configurable, doesn't use `offline.rate` modifier target | MEDIUM |
| No drone delivery simulation | Drones don't progress while offline | LOW |

### Migration Options

#### Option A: Full Server-Side Offline Calculation (Recommended)

Use the existing `/api/game/compute` endpoint with `runServerTicks()`:

1. Client sends last known game state + ticks elapsed
2. Server runs N ticks via `runServerTicks()` (already uses modifier engine)
3. Server returns new state + production snapshot
4. Client applies diff

**Pros**: Uses the full production calculator with all modifiers. Already implemented.
**Cons**: Expensive for large tick counts (cap at 86400 ticks). Server load.

#### Option B: Modifier-Enhanced Client-Side Offline Calc

Refactor `calculateOfflineProgress()` to use the modifier engine:

1. Build `MultiplierCache` via `buildMultipliers(state)`
2. Use `computeProduction()` for each building
3. Apply `offline.rate` modifier target for the base rate
4. Skip power grid simulation (assume current power state persists)

**Pros**: Fast, no server round-trip. Uses modifier engine.
**Cons**: Doesn't simulate weather changes, event expiration, or contract progression.

#### Option C: Hybrid Approach (Best Balance)

1. For short offline periods (< 1 hour): Use Option B (client-side, fast)
2. For long offline periods (≥ 1 hour): Use Option A (server-side, accurate)
3. Cap maximum offline ticks regardless of method

**Pros**: Best of both worlds. Fast for common case, accurate for long offline.
**Cons**: More complex implementation.

### Recommendation

**Phase 3**: Implement Option B first (modifier-enhanced client-side), then Option C if server capacity allows. The immediate priority is making `calculateOfflineProgress()` use the modifier engine for consistency with the online production calculation.

### Specific Changes Needed for Option B

1. Replace `calculateOfflineProgress()` with a new implementation that calls `buildMultipliers(state)` then `computeProduction(building, cache, resources)` for each building
2. Use `cache.powerEfficiency` from current state (don't recompute power grid)
3. Apply `modifierEngine.resolve('offline.rate', 1)` instead of hardcoded `0.5`
4. Include endgame passive income via `computeEndgameIncome(state, cache)`
5. Skip weather/event simulation (assume current state persists)

---

## Summary: Phase 2+ Roadmap

| Phase | Deliverable | Priority | Effort |
|-------|------------|----------|--------|
| Phase 2 | Extract HC-1 through HC-8 into config/balancing rules | Critical | High |
| Phase 2 | GameConfigAdapter pattern (unify productionCalculator + serverEngine) | High | Medium |
| Phase 2 | Modifier-enhanced offline progression (Option B) | High | Medium |
| Phase 2 | HC-9: Solar/wind day cycle into weather/building defs | Medium | Low |
| Phase 2 | HC-10: RP income rates into modifier system | Medium | Low |
| Phase 3 | Market simulator refactor (HC-14) | Medium | High |
| Phase 3 | Drone/contract/storage formula extraction (HC-12/16/17) | Low | Medium |
| Phase 3 | Full server-side offline calculation (Option C) | Low | High |
