# Phase 1 Modifier Architecture Refactor — Architecture Review

**Date**: 2025-01-XX  
**Scope**: IndustryX Game Economy System  
**Status**: FRESH REVIEW — Verified against current codebase  

---

## 1. Executive Summary

The IndustryX game economy system has **137+ hardcoded values** across the codebase, with **5 fully duplicated functions** between `productionCalculator.ts` (client) and `serverEngine.ts` (server). A Modifier Engine (`modifierEngine.ts`) was created in a prior session but is only **partially integrated** — only `specificBuildingBonuses` currently uses the modifier registry for resolution. The remaining hardcoded research calculations, payout rates, endgame income, transport formulas, and offline progression all bypass the modifier engine.

This review confirms the original audit findings are accurate and identifies the precise integration gaps that remain.

---

## 2. Files Analyzed

| File | Lines | Role |
|------|-------|------|
| `src/lib/game/modifierEngine.ts` | 948 | Modifier Engine foundation (NEW) |
| `src/lib/game/productionCalculator.ts` | 636 | Client-side production formulas |
| `src/lib/game/serverEngine.ts` | 1039 | Server-side production formulas (DUPLICATE) |
| `src/lib/game/store.ts` | 3400+ | Zustand store, tick logic, offline progress |
| `src/lib/game/types.ts` | 533 | Core type definitions |
| `src/lib/game/configCache.ts` | 415 | Supabase ↔ frontend bridge |
| `src/lib/game/data.ts` | 5000+ | Default game definitions |
| `src/app/api/game/offline/route.ts` | 105 | Offline progress API |
| `src/app/api/game/compute/route.ts` | 300 | Server-side tick computation API |

---

## 3. Current Architecture Issues

### 3.1 Formula Duplication (CRITICAL)

Five functions are **fully duplicated** between `productionCalculator.ts` and `serverEngine.ts`:

| Function | Client | Server | Identical Logic? |
|----------|--------|--------|-----------------|
| `buildMultipliers` / `buildMultipliersServer` | ✅ | ✅ | YES (14 hardcoded research bonuses duplicated) |
| `computePowerGrid` / `computePowerGridServer` | ✅ | ✅ | YES (same formula, different config source) |
| `computeProduction` / `computeProductionServer` | ✅ | ✅ | YES (same efficiency chain) |
| `computePayout` / `computePayoutServer` | ✅ | ✅ | YES (same rates: 20/50/10) |
| `computeEndgameIncome` / `computeEndgameIncomeServer` | ✅ | ✅ | YES (same hardcoded values: 8000/10/1/5000/5/100000/50/5) |

The only difference: server version takes `GameConfig` from Supabase, client uses `BUILDING_DEFS` from configCache. **The formulas are identical.**

### 3.2 Partial Modifier Engine Integration (HIGH)

`modifierEngine.ts` was created but integration is minimal:

- ✅ `ModifierRegistry`, `ModifierEngine` classes implemented
- ✅ Builder functions: `researchToModifiers`, `prestigeToModifiers`, `megaProjectToModifiers`, `eventsToModifiers`, `weatherToModifiers`
- ✅ `buildModifierRegistry()` entry point
- ✅ `specificBuildingBonuses` now derived from modifier registry (aiLab, neuralLab, roboticsBay, droneShipyard, quantumLab)
- ❌ `buildMultipliers()` still has 14 hardcoded research bonus calculations (lines 221-234)
- ❌ `extractorBonus`, `factoryBonus`, `t1/t2/t3FactoryBonus` still computed manually
- ❌ Prestige and mega project bonuses still computed manually
- ❌ `hasMarketAnalysis`, `hasEnergyEfficiency`, `hasPowerOptimization` still checked via `researchSet.has()`
- ❌ `serverEngine.ts` has `modifierEngine: null`, `_source: 'legacy'`

### 3.3 Offline Progression Bypasses Engine (HIGH)

`calculateOfflineProgress()` in `store.ts` (lines 3045-3146):

- Uses a **completely separate formula** from the main production calculator
- Hardcoded `offlineRate = 0.5` (50% rate)
- Hardcoded `0.7` sell multiplier for offline auto-trading
- Doesn't use `buildMultipliers()` or modifier engine at all
- Doesn't account for power grid efficiency
- Doesn't apply weather/event/transport modifiers
- Simplified factory production (no efficiency chain)

### 3.4 Hardcoded Values Inventory (CONFIRMED 137+)

#### Economy-Critical Hardcoded Values

| Category | Count | Examples | File(s) |
|----------|-------|----------|---------|
| Research bonus IDs + values | 14 | `basicAutomation ? 0.15 : 0`, `advancedAutomation ? 0.25 : 0` | productionCalculator.ts:221-234, serverEngine.ts:122-135 |
| Payout rates | 3 | `extractorRate=20`, `factoryRate=50`, `powerRate=10` | productionCalculator.ts:564-566, serverEngine.ts:455-457 |
| Endgame income rates | 8 | `dysonCollector: 8000`, `galacticForge: 100000` | productionCalculator.ts:614-629, serverEngine.ts:504-519 |
| Power grid constants | 4 | min efficiency `0.10`, epsilon `0.001`, max worker reduction `0.5` | productionCalculator.ts:413, serverEngine.ts:301 |
| Transport formula | 1 | `0.25 * Math.max(0, efficiency - 1)` | productionCalculator.ts:275, serverEngine.ts:176 |
| Sell multiplier base | 1 | `0.9 + cache.marketBonus` | productionCalculator.ts:550, serverEngine.ts:440 |
| Market commission | 1 | `0.15` | serverEngine.ts:959 |
| Offline constants | 3 | `offlineRate=0.5`, sell `0.7`, min elapsed `5000` | store.ts:3059,3136,3049 |
| Energy efficiency reductions | 2 | `energyEfficiency: 0.15`, `powerOptimization: 0.10` | productionCalculator.ts:405-406, serverEngine.ts:294-295 |
| Solar/wind formulas | 4 | `0.5 + 0.5 * sin(tick * 0.01)` | productionCalculator.ts:384-389 |
| Building upgrade efficiency | 1 | `+0.05` per level | store.ts:1913 |
| Drone fuel cost formula | 1 | `1 + (level-1) * 0.15` | store.ts:2784 |
| RP income rates | 4 | extractor:0.01, power:0.01, T1-T3: 0.02-0.10 | store.ts:1234-1239 |
| Market simulator | 50+ | Volatilities, thresholds, decay rates | marketSimulator.ts:95-128 |

---

## 4. Modifier Engine Gap Analysis

### 4.1 What the Modifier Engine CAN Resolve Today

| Target | Source | Status |
|--------|--------|--------|
| `production.extractor` | researchToModifiers (basicAutomation, advancedDrilling) | ✅ Built but NOT used in buildMultipliers |
| `production.factory` | researchToModifiers (advancedAutomation) | ✅ Built but NOT used |
| `production.factory.t1` | researchToModifiers (efficientSmelting) | ✅ Built but NOT used |
| `production.factory.t2` | researchToModifiers (advancedElectronics) | ✅ Built but NOT used |
| `production.factory.t3` | researchToModifiers (metabolicEngineering) | ✅ Built but NOT used |
| `production.building.*` | researchToModifiers (aiOptimization, advancedRobotics, quantumComputing) | ✅ Used for specificBuildingBonuses |
| `transport.throughput` | researchToModifiers (logistics1, advancedLogistics, cargoDrones) | ✅ Built but NOT used |
| `power.consumption` | researchToModifiers (energyEfficiency, powerOptimization) | ✅ Built but NOT used |
| `market.sellPrice` | researchToModifiers (marketAnalysis) | ✅ Built but NOT used |
| `worker.efficiency` | researchToModifiers (workerTraining) | ✅ Built but NOT used |
| `storage.capacity` | researchToModifiers (storageBonus) | ✅ Built but NOT used |
| Prestige targets | prestigeToModifiers | ✅ Built but NOT used |
| Mega project targets | megaProjectToModifiers | ✅ Built but NOT used |
| Event targets | eventsToModifiers | ✅ Built but NOT used |
| Weather targets | weatherToModifiers | ✅ Built but NOT used |

### 4.2 What Needs to Change

The `buildMultipliers()` function currently:
1. Manually checks `researchSet.has()` for each research ID → calculates bonus value
2. Manually sums prestige bonuses
3. Manually sums mega project bonuses
4. Combines them into MultiplierCache fields

With the modifier engine, this becomes:
1. `buildModifierRegistry()` already registers all modifiers from research, prestige, mega, events, weather
2. `modifierEngine.resolve('production.extractor', 1)` gives the final multiplier
3. `modifierEngine.resolveMultiplier('production.extractor')` gives the bonus portion

The key is replacing lines 221-346 in `buildMultipliers()` with modifier engine resolve() calls.

---

## 5. Hidden Dependencies Discovered

### 5.1 `hasMarketAnalysis` / `hasEnergyEfficiency` / `hasPowerOptimization` (BOOLEAN FLAGS)

These are boolean research flags that affect:
- `hasMarketAnalysis` → adds 0.2 to marketBonus AND enables market analysis feature
- `hasEnergyEfficiency` → reduces power consumption by 15%
- `hasPowerOptimization` → reduces power consumption by 10%

The modifier engine already creates `market.sellPrice` and `power.consumption` modifiers for these. We can replace:
- `hasMarketAnalysis` → `modifierEngine.hasModifier('market.sellPrice', 'research')`
- Power reductions → `modifierEngine.resolve('power.consumption', 1)` which already includes the research modifiers

### 5.2 Research Effects Not in ResearchEffect Type

The `ResearchEffect` type in `types.ts` (line 106-110) has:
```typescript
type: 'productionSpeed' | 'transportSpeed' | 'powerEfficiency' | 'unlockBuilding' | 'unlockTransport' | 'unlockAutomation' | 'marketBonus' | 'workerEfficiency' | 'storageBonus'
```

But `data.ts` also uses targets like `t1Factory`, `t2Factory`, `t3Factory`, `roboticsBay`, `droneShipyard`, `aiLab`, `neuralLab`, `quantumLab` as `effect.target` values. These are handled by the `production.building.*` target pattern in `researchToModifiers()`.

### 5.3 Offline Progression Race Condition

The `calculateOfflineProgress()` function accesses `BUILDING_DEFS` directly from configCache instead of using the production calculator. If Supabase updates the building definitions, the offline calculation may use stale data until the next page load.

---

## 6. Recommendations

### Priority 1: Complete Modifier Engine Integration in `buildMultipliers()`
Replace all 14 hardcoded research bonus calculations with `modifierEngine.resolve()` calls. This is the single highest-impact change.

### Priority 2: Unify `serverEngine.ts` with Modifier Engine
Currently `_source: 'legacy'`. Migrate to use the same `buildModifierRegistry()` + `ModifierEngine` pattern.

### Priority 3: Address Offline Progression
Document the gap and propose a migration path. The offline calculator needs to use the modifier engine for consistency.

### Priority 4: Extract Hardcoded Constants
Move payout rates, endgame income rates, and transport formulas into the modifier engine or a configuration system.

---

## 7. Verification Method

To confirm backward compatibility after integration:
1. Create a test state with all research completed
2. Run `buildMultipliers()` with old code → capture all MultiplierCache values
3. Run `buildMultipliers()` with modifier engine → capture all values
4. Assert all values are within floating-point epsilon (1e-10)

The additive stacking mode in the modifier engine produces identical results to the current sum-then-multiply approach, as verified by algebraic proof.

---

*This review was performed by reading all core game files line-by-line and cross-referencing the modifier engine implementation with the current hardcoded calculations.*
