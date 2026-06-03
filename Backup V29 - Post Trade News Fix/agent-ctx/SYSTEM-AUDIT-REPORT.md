# FACTORY DOMINION: COMPLETE SYSTEM AUDIT REPORT

**Audit Date**: 2025 Session  
**Game Version**: SAVE_VERSION 11  
**Auditor**: Senior Game Systems Architect AI

---

# A. OVERALL HEALTH SCORE

| Metric | Score | Assessment |
|---|---|---|
| **System Complexity** | 3/10 (overweight) | 56 resources, 65 buildings, 26 tabs — far beyond MVP |
| **Technical Stability** | 7/10 | Type bugs exist but game runs; defensive coding in place |
| **Economy Stability** | 4/10 | 9 dead-end resources, rareEarth bottleneck, margin imbalances |
| **Scalability** | 5/10 | Store.ts 3000+ lines; single-file architecture limits growth |
| **MVP Readiness** | 3/10 | Core loop works but ~40% of content is dead-end or disconnected |

**Overall: 4.4/10 — Functional but overcomplicated with significant dead weight**

---

# B. CRITICAL PROBLEMS LIST

## CRITICAL (Immediate Fix Required)

### C1: Missing TypeScript Types — `fiberOptics` and `solarCell` Not in Tier2Resource
- **Why Dangerous**: `ResourceType` union is incomplete. `Record<ResourceType, number>` type doesn't include these resources, causing potential runtime errors and type unsafety
- **Impact**: Type system provides false security; iterate-over-ResourceType loops miss 2 resources
- **Fix**: Add `'fiberOptics' | 'solarCell'` to Tier2Resource type

### C2: rareEarth Production Rate Bottleneck
- **Why Dangerous**: Quarry produces rareEarth at only 0.05/tick. T3+ factories consume 3-10/tick. This creates a 60:1 quarry-to-factory ratio
- **Impact**: Players hit a wall at T3 where rareEarth becomes the single bottleneck preventing all advanced production
- **Fix**: Increase quarry rareEarth rate to 0.3/tick, or add a dedicated Rare Earth Extractor building

### C3: 9 Dead-End Resources With Zero Production Chain Value
- **Why Dangerous**: bricks, fertilizer, insecticide, copperIngot, medicalTech, jewellery, weapons, scanDrone, artifactDetector are produced but NEVER consumed by any factory
- **Impact**: Players build factories that don't advance their progression. 9/56 resources (16%) are market-sell-only
- **Fix**: Either connect them to production chains or remove them

## HIGH (Fix Before Launch)

### H1: displayFactory Produces Wrong Resources
- **Why Dangerous**: Named "Display Factory" but outputs fiberOptics(0.5) and solarCell(0.3). No "display" output. Strictly worse than opticsLab + solarCellFactory
- **Impact**: Confusing UI, irrational economic choice
- **Fix**: Repurpose or remove

### H2: hydrogenPlant Produces Wrong Resources
- **Why Dangerous**: Named "Hydrogen Plant" but outputs coolant(0.5) and fossilFuel(0.3). No hydrogen output. Consumes expensive batteries for subpar returns
- **Impact**: Confusing, economically irrational building
- **Fix**: Repurpose or remove

### H3: Economy Margin Imbalance
- **Why Dangerous**: Dead-end resources have wildly varying margins: jewellery +447%, medicalTech +44%
- **Impact**: Optimal strategy is to rush goldsmith and ignore entire T3 chains
- **Fix**: Rebalance or connect dead-end resources to chains

### H4: Building Description Inaccuracies
- **Why Dangerous**: smelter says "combines with carbon for steel" but only makes ironPlate. hydrogenPlant says "hydrogen" but makes coolant/fossilFuel. displayFactory says "display panels" but makes fiberOptics/solarCell
- **Impact**: Player confusion, broken expectations
- **Fix**: Update descriptions to match actual behavior

## MEDIUM (Fix for Quality)

### M1: Redundant Extractors (gravelPit, bauxiteMine, wolframiteMine)
- Each produces a resource consumed by exactly 1 factory. Unnecessary complexity for MVP.
- **Fix**: Merge into simpler chains

### M2: storage Building Category Unused
- BuildingDefinition.category includes 'storage' but no storage buildings exist
- **Fix**: Remove category or add storage buildings

### M3: singularityCore Circular Production (4 producers)
- singularityForge, dysonCollector, quantumTeleporter, timeDistorter all produce singularityCore
- Creates confusing resource economics in endgame
- **Fix**: Make endgame buildings produce passive money/research/CP instead of recycling singularityCore

## LOW (Nice to Have)

### L1: Store.ts File Size (3000+ lines)
- Single monolithic file. Hard to maintain.
- **Fix**: Split into modules (tickLogic, buildingActions, marketActions, etc.)

### L2: 26 Navigation Tabs
- Overwhelming for new players. Many are secondary features.
- **Fix**: Consolidate tabs; hide advanced features behind progression gates

---

# C. MASTER CLEANUP PLAN

## Phase 1: STABILIZATION (Immediate — No Breaking Changes)
**Goal**: Fix type bugs, correct descriptions, fix critical bottlenecks

| Task | Files | Complexity | Risk |
|---|---|---|---|
| 1.1 Add fiberOptics+solarCell to Tier2Resource type | types.ts | Low | Low |
| 1.2 Fix all inaccurate building descriptions | data.ts | Low | Low |
| 1.3 Increase rareEarth production rate in quarry | data.ts | Low | Low |
| 1.4 Increase lithium production rate in quarry | data.ts | Low | Low |
| 1.5 Connect dead-end resources to production chains | data.ts | Medium | Medium |

**Connection Plan for Dead-End Resources** (add them as inputs to existing buildings):
- **bricks** → Add to megaStructureFactory input (makes sense: mega structures need bricks)
- **fertilizer** → Add to insecticideFactory input (fertilizer is a precursor for pest control chemicals)
- **insecticide** → Add to medicalTechLab input (insecticides are chemical precursors)
- **copperIngot** → Add to goldsmith input (copper ingots for jewellery crafting)
- **medicalTech** → Add to droneShipyard input (medical drones)
- **jewellery** → Add to voidCrystallizer input (precious crystals for void research)
- **weapons** → Add to armsFactory... wait, weapons IS the output. Add weapons → droneShipyard (armed drones)
- **scanDrone** → Add to detectorFactory input (scan drones help detect artifacts)
- **artifactDetector** → Add to quantumLab input (artifact detectors help quantum research)

## Phase 2: CORE SYSTEM REPAIR
**Goal**: Fix displayFactory, hydrogenPlant, economy margins

| Task | Files | Complexity | Risk |
|---|---|---|---|
| 2.1 Repurpose displayFactory → produce electronics or unique "display" resource | data.ts | Medium | Medium |
| 2.2 Repurpose hydrogenPlant → actually produce hydrogen or remove | data.ts | Medium | Medium |
| 2.3 Rebalance market prices for dead-end resources | data.ts | Low | Low |
| 2.4 Add dedicated Rare Earth Extractor building | data.ts, types.ts | Medium | Low |

## Phase 3: ECONOMY REBALANCE
**Goal**: Fix progression pacing and currency sinks

| Task | Files | Complexity | Risk |
|---|---|---|---|
| 3.1 Adjust building costs for T3/T4 to be more attainable | data.ts | Medium | Low |
| 3.2 Balance power consumption vs production | data.ts | Medium | Low |
| 3.3 Reduce singularityCore circular production | data.ts | Medium | Medium |
| 3.4 Adjust market price volatility for T4 resources | data.ts | Low | Low |

## Phase 4: MVP SIMPLIFICATION
**Goal**: Remove unnecessary complexity for initial launch

| Task | Files | Complexity | Risk |
|---|---|---|---|
| 4.1 Remove gravelPit, merge gravel into limestoneQuarry output | data.ts, types.ts, store.ts | Medium | Medium |
| 4.2 Remove bauxiteMine, simplify aluminiumFactory input | data.ts, types.ts, store.ts | Medium | Medium |
| 4.3 Remove wolframiteMine, simplify tungstenSmelter input | data.ts, types.ts, store.ts | Medium | Medium |
| 4.4 Consolidate navigation tabs (26 → 16) | page.tsx | Medium | Low |
| 4.5 Remove unused 'storage' building category | types.ts | Low | Low |

## Phase 5: SCALABILITY PREPARATION
**Goal**: Architecture improvements for long-term development

| Task | Files | Complexity | Risk |
|---|---|---|---|
| 5.1 Split store.ts into modules | store.ts | High | High |
| 5.2 Add proper TypeScript discriminated unions for building categories | types.ts | Medium | Medium |
| 5.3 Implement proper data validation schemas | data.ts | Medium | Low |
| 5.4 Add automated balance testing | tests/ | High | Low |

---

# D. FINAL RECOMMENDATIONS

## Systems to REMOVE (for MVP)
1. **gravelPit** — merge output into limestoneQuarry
2. **bauxiteMine** — simplify aluminiumFactory input
3. **wolframiteMine** — simplify tungstenSmelter input
4. **displayFactory** — confusing, underpowered
5. **hydrogenPlant** — confusing, underpowered
6. **brickFactory** — if bricks aren't connected to chains (fixable in Phase 1)
7. **26 tabs** → consolidate to 16 core tabs

## Systems to MERGE
1. **gravel** + limestone → single construction material chain
2. **bauxite** → remove, aluminium from clay+limestone
3. **wolframite** → remove, tungsten from rareEarth+steel
4. **copperIngot** → merge into copperWire chain or remove copperRefinery
5. **displayFactory** output → merge into opticsLab or remove

## Systems to REDESIGN
1. **displayFactory** → produce unique "display" resource or electronics
2. **hydrogenPlant** → actually produce "hydrogen" as a new T2 fuel resource
3. **Endgame buildings** (dysonCollector, quantumTeleporter, etc.) → produce money/research/CP instead of recycling T4 resources
4. **Market pricing** → normalize dead-end resource margins to 100-200% range

## Systems to PRIORITIZE
1. **Core extraction → processing → manufacturing loop** (T0→T1→T2)
2. **AI/Quantum chain** (circuit → aiChip → quantumPart → singularityCore)
3. **Power grid management** (coal → nuclear → fusion → antimatter)
4. **Research tree** (gate progression, create meaningful choices)
5. **Market as a real economy** (supply/demand based on factory production)

---

# APPENDIX: Resource Dependency Tree (Simplified Core Loop)

```
T0 EXTRACT     T1 PROCESS      T2 MANUFACTURE    T3 HIGH-TECH       T4 SINGULARITY
──────────     ──────────      ──────────────    ────────────       ──────────────
iron ────────→ ironPlate ────→ gear ────────→ engine ────────→ robotics ──→ warpDrive
copper ─────→ copperWire ──→ circuit ─────→ aiChip ───────→ quantumPart → singularityCore
coal ───────→ carbon ─────→ battery ─────→ aiChip ───────→ neuralNetwork → chronoPart
oil ────────→ plastic ────→ circuit ─────→ electronics ──→ robotics ──→ warpDrive
sand ───────→ glass ──────→ fiberOptics ─→ neuralNetwork → nanoMaterial → voidCrystal
oil+water ──→ fossilFuel ─→ silicon ────→ circuit ─────→ advancedAlloy → darkMatterCell
             concrete     → coolant ────→ (T4 inputs)                   → plasmaCore
             steel ──────→ advancedAlloy → nanoMaterial → singularityCore → megaStructure
lithium ────────────────→ battery ─────→ aiChip
rareEarth ─────────────→ titanium ────→ (T3 inputs)
water ────────────────→ coolant ──────→ (T4 inputs)
clay ────────────────→ bricks ───────→ megaStructure (after Phase 1 fix)
limestone ────────────→ concrete ────→ megaStructure
```

**9 Resources currently DISCONNECTED from the above tree** (dead-end):
bricks, fertilizer, insecticide, copperIngot, medicalTech, jewellery, weapons, scanDrone, artifactDetector

**After Phase 1 fixes**, ALL resources will be connected to the production tree.
