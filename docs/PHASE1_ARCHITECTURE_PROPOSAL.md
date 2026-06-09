# Phase 1 Modifier Architecture Refactor — Formal Architecture Proposal

---

## 1. Current Architecture Flow (Before Modifier Engine)

```
┌─────────────────────────────────────────────────────────────────────┐
│                      GAME STATE (Zustand Store)                     │
│  completedResearch[], prestigeState, megaProjects[], activeEvents,  │
│  weather, workers, transportLines, buildings                        │
└──────────────┬──────────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    buildMultipliers() [HARDCODED]                     │
│                                                                       │
│  14× researchSet.has('id') ? value : 0                               │
│  4×  prestigeState.bonuses.filter().reduce()                         │
│  7×  megaProjects switch/case                                         │
│  3×  event effects for-loop                                           │
│  3×  WEATHER_DEFS lookup                                              │
│  1×  transport efficiency formula                                     │
│  3×  boolean research flags                                           │
│                                                                       │
│  → Produces: MultiplierCache (30+ fields)                            │
└──────────────┬───────────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    computeProduction()                                │
│  efficiency = building.efficiency                                    │
│    × cache.powerEfficiency                                           │
│    × cache.eventProductionGlobal                                     │
│    × cache.weatherProduction                                         │
│    × cache.transportProductionBonus                                  │
│    × (1 + cache.extractorBonus)   // if extractor                   │
│    × (1 + cache.factoryBonus)     // if factory                     │
│    × (1 + cache.t1FactoryBonus)   // if T1 factory                 │
│    × (1 + cache.specificBuildingBonuses.get(type))                   │
│    × (1 + worker.speed × worker.level)                               │
│    × (1 + cache.productionBonus)                                     │
│                                                                       │
│  → Produces: BuildResult (outputs, inputs, efficiency)               │
└──────────────┬───────────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    store.ts gameTickAction                            │
│  Applies results to state, mutates resources, tracks income rates    │
└──────────────────────────────────────────────────────────────────────┘

DUPLICATION: Same flow exists in serverEngine.ts with identical formulas
             but reading config from Supabase instead of configCache.
```

---

## 2. Proposed Architecture Flow (After Modifier Engine)

```
┌─────────────────────────────────────────────────────────────────────┐
│                      GAME STATE (Zustand Store)                     │
│  completedResearch[], prestigeState, megaProjects[], activeEvents,  │
│  weather, workers, transportLines, buildings                        │
└──────────────┬──────────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                buildModifierRegistry() [DATA-DRIVEN]                  │
│                                                                       │
│  Research: completedResearch ∩ RESEARCH_TREE → researchToModifiers() │
│  Prestige: purchased bonuses → prestigeToModifiers()                 │
│  Mega:     completed projects → megaProjectToModifiers()             │
│  Events:   active events → eventsToModifiers()                       │
│  Weather:  current weather → weatherToModifiers()                    │
│                                                                       │
│  → Produces: ModifierRegistry (all modifiers indexed by target)      │
└──────────────┬───────────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────────┐
│              ModifierEngine.resolve() [UNIFIED RESOLUTION]            │
│                                                                       │
│  engine.resolve('production.extractor', 1) → combined multiplier     │
│  engine.resolve('production.factory', 1)   → combined multiplier     │
│  engine.resolve('production.payout', 1)    → combined multiplier     │
│  engine.resolve('power.production', 1)     → combined multiplier     │
│  engine.resolve('market.sellPrice', 1)     → combined multiplier     │
│  ... etc for all targets                                              │
│                                                                       │
│  Resolution order: add → multiply → max → min → override             │
│  Stacking: additive (1 + sum_of_bonuses)                              │
│                                                                       │
│  → Produces: MultiplierCache (same interface, data-driven values)    │
└──────────────┬───────────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────────┐
│              computeProduction() [UNCHANGED]                          │
│  Same efficiency chain as before, reads from MultiplierCache         │
│  No changes needed — MultiplierCache interface is backward compat    │
└──────────────┬───────────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    store.ts gameTickAction [UNCHANGED]                │
│  Applies results to state, mutates resources, tracks income rates    │
└──────────────────────────────────────────────────────────────────────┘

SERVER SIDE: buildMultipliersServer() now uses same ModifierEngine
             with config from Supabase instead of configCache.
             Same registry, same engine, same resolution logic.
```

---

## 3. Key Design Decisions

### 3.1 ModifierTarget as Union Type (Not String)

Using a TypeScript union type for `ModifierTarget` gives us:
- Compile-time safety: typos in target names are caught immediately
- IDE autocomplete for all available targets
- Exhaustiveness checking in switch statements
- Easy to find all usages of a specific target

### 3.2 Additive Stacking for Same-Target Multipliers

The current game behavior sums all bonuses of the same type before applying:
```
efficiency *= (1 + bonusA + bonusB + bonusC)  // additive stacking
```

The modifier engine preserves this with:
```
resolve('target', 1) = 1 × (1 + sum_of_all_multiply_bonuses)
```

Multiplicative stacking is available as an option but not used by default.

### 3.3 Backward Compatibility via MultiplierCache

The `MultiplierCache` interface is unchanged. All downstream consumers
(`computeProduction`, `computePowerGrid`, `computePayout`, `computeEndgameIncome`,
`store.ts`) read from the same cache fields. The only difference is HOW
those fields are populated — now from the modifier engine instead of
hardcoded if-checks.

### 3.4 Builder Functions per System

Each game system has its own builder function:
- `researchToModifiers()` — converts ResearchEffect[] → Modifier[]
- `prestigeToModifiers()` — converts PrestigeBonus[] → Modifier[]
- `megaProjectToModifiers()` — converts MegaProject[] → Modifier[]
- `eventsToModifiers()` — converts GameEvent[] → Modifier[]
- `weatherToModifiers()` — converts WeatherState → Modifier[]

This keeps system-specific logic isolated while the engine handles
generic resolution.

---

## 4. New Systems Integration (Phase 2+)

Adding a new system (e.g., Achievements) requires:

1. Add new `ModifierSource` type: `'achievement'`
2. Add new `ModifierTarget` types if needed (e.g., `'achievement.productionBonus'`)
3. Create `achievementsToModifiers()` builder function
4. Register in `buildModifierRegistry()`

**No changes to computeProduction, computePowerGrid, or store.ts required.**

---

## 5. Data Flow for Future Systems

```
Achievement System → achievementToModifiers() → ModifierRegistry
Policy System      → policyToModifiers()      → ModifierRegistry
Seasonal System    → seasonalToModifiers()    → ModifierRegistry
Buff System        → buffToModifiers()        → ModifierRegistry
Manager System     → managerToModifiers()     → ModifierRegistry
                       │
                       ▼
              ModifierEngine.resolve()
                       │
                       ▼
              MultiplierCache (populated)
                       │
                       ▼
              computeProduction() [ZERO CHANGES NEEDED]
```

This is the core value proposition: **new systems only add builders, they never modify existing formulas.**
