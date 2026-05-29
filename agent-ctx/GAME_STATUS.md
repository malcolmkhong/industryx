# Factory Dominion: Automated Empire — Latest Game Status

**Last Updated:** 2025-01-21
**Project:** Next.js 16 + React + TypeScript + Zustand + Tailwind CSS + Framer Motion
**Theme:** Dark Industrial Neon (cyan `#22d3ee` accent, dark `#111827` backgrounds)

---

## 1. Architecture Overview

| Layer | Technology | File(s) |
|-------|-----------|---------|
| Types | TypeScript 5 | `src/lib/game/types.ts` (520 lines) |
| Data | Static game definitions | `src/lib/game/data.ts` (4,313 lines) |
| State | Zustand + persist middleware | `src/lib/game/store.ts` (2,979 lines) |
| UI | React + Framer Motion + shadcn/ui | `src/components/game/*.tsx` (30 components) |
| Page | Single-page app (App Router) | `src/app/page.tsx` |
| Settings | Zustand + persist (separate) | `src/lib/game/settingsStore.ts` |
| Sound | Web Audio API | `src/lib/game/soundEngine.ts` |

**Save System:** localStorage, versioned migration (current SAVE_VERSION=6), export/import as base64 JSON

---

## 2. Resource System (51 Resources, 5 Tiers)

### Raw Resources (Tier 0) — 13 types
iron, copper, coal, oil, sand, lithium, water, rareEarth, clay, limestone, gravel, bauxite, wolframite

### Tier 1 Processed — 10 types
ironPlate, copperWire, plastic, glass, carbon, bricks, concrete, fertilizer, steel, fossilFuel

### Tier 2 Advanced — 12 types
circuit, engine, battery, gear, silicon, aluminium, insecticide, copperIngot, titanium, coolant, fiberOptics, solarCell

### Tier 3 High-Tech — 13 types
aiChip, robotics, quantumPart, advancedAlloy, nanoMaterial, electronics, medicalTech, jewellery, tungsten, weapons, scanDrone, artifactDetector, neuralNetwork

### Tier 4 Singularity — 8 types
singularityCore, darkMatterCell, warpDrive, antimatter, chronoPart, plasmaCore, megaStructure, voidCrystal

---

## 3. Building System (55+ Buildings)

### Extractors (Tier 0) — 9 buildings
| Building | Outputs | Cost | Power |
|----------|---------|------|-------|
| Mining Drill | iron, copper, coal | $500 | 5 MW |
| Oil Pump | oil | $800 | 8 MW |
| Water Extractor | water | $300 | 3 MW |
| Quarry | sand, lithium, rareEarth | $1,200 | 10 MW |
| Clay Pit | clay | $250 | 2 MW |
| Limestone Quarry | limestone | $400 | 4 MW |
| Gravel Pit | gravel | $350 | 3 MW |
| Bauxite Mine | bauxite | $1,500 | 8 MW |
| Wolframite Mine | wolframite | $5,000 | 12 MW |

### Tier 1 Factories — 10 buildings
| Building | Inputs → Outputs | Cost | Power | Research |
|----------|------------------|------|-------|----------|
| Smelter | 2 iron → 1 ironPlate | $1,000 | 10 MW | — |
| Wire Mill | 1.5 copper → 1 copperWire | $800 | 8 MW | — |
| Chemical Plant | 1.5 oil + 1 water → 1 plastic | $1,500 | 12 MW | — |
| Glass Furnace | 2 sand → 1 glass | $900 | 8 MW | — |
| Steel Forge | 3 iron + 2 coal → 1 steel | $1,800 | 14 MW | — |
| Carbon Processor | 3 coal → 1 carbon | $2,000 | 12 MW | — |
| Brick Factory | 3 clay → 2 bricks | $600 | 6 MW | — |
| Concrete Factory | 3 gravel + 2 limestone → 1 concrete | $2,000 | 10 MW | — |
| Fertilizer Factory | 2 limestone + 1 water → 1 fertilizer | $1,500 | 8 MW | — |
| Oil Refinery | 2 oil → 1 fossilFuel | $2,500 | 12 MW | — |

### Tier 2 Factories — 14 buildings
| Building | Inputs → Outputs | Research |
|----------|------------------|----------|
| Gear Factory | 2 ironPlate → 1 gear | basicMachining |
| Circuit Factory | 2 copperWire + 1 plastic + 0.5 silicon → 1 circuit | electronics |
| Engine Factory | 3 gear + 2 steel → 1 engine | mechanicalEngineering |
| Battery Factory | 2 lithium + 1 carbon + 0.5 aluminium → 1 battery | energyStorage |
| Silicon Refinery | 3 sand + 1 clay + 1 fossilFuel → 1 silicon | electronics |
| Aluminium Factory | 3 bauxite → 1 aluminium | basicMachining |
| Insecticide Factory | 1 copper + 2 limestone → 1 insecticide | basicMachining |
| Copper Refinery | 3 copper → 1 copperIngot | electronics |
| Titanium Refinery | 3 rareEarth + 1 fossilFuel → 1 titanium | advancedMetallurgy |
| Coolant Plant | 2 water + 0.5 oil → 1 coolant | — |
| Optics Lab | 2 glass + 1 copperWire → 1 fiberOptics | electronics |
| Solar Cell Factory | 2 glass + 1 silicon → 1 solarCell | energyStorage |
| Display Factory | 1 glass + 2 plastic → 0.5 fiberOptics + 0.3 solarCell | electronics |
| Hydrogen Plant | 3 water + 0.5 battery → 0.5 coolant + 0.3 fossilFuel | energyStorage |

### Tier 3 Factories — 13 buildings
| Building | Inputs → Outputs | Research |
|----------|------------------|----------|
| AI Lab | 3 circuit + 2 battery → 1 aiChip | artificialIntelligence |
| Robotics Bay | 2 aiChip + 1 engine + 1 electronics → 1 robotics | roboticsTech |
| Quantum Lab | 3 aiChip + 5 rareEarth → 1 quantumPart | quantumPhysics |
| Alloy Forge | 3 steel + 2 lithium → 1 advancedAlloy | advancedMetallurgy |
| Nano Lab | 2 advancedAlloy + 1 quantumPart + 0.5 neuralNetwork → 1 nanoMaterial | nanotechnology |
| Electronics Factory | 2 circuit + 1 plastic + 1 silicon → 1 electronics | artificialIntelligence |
| Medical Tech Lab | 2 titanium + 1 plastic + 1 electronics → 1 medicalTech | advancedMetallurgy |
| Goldsmith | 5 rareEarth + 3 copper → 1 jewellery | nanotechnology |
| Tungsten Smelter | 3 wolframite + 1 fossilFuel + 1 limestone → 1 tungsten | advancedMetallurgy |
| Arms Factory | 2 steel + 1 aluminium + 1 battery → 1 weapons | mechanicalEngineering |
| Drone Shipyard | 2 electronics + 1 titanium + 2 battery → 1 scanDrone | roboticsTech |
| Detector Factory | 3 battery + 2 electronics + 1 tungsten → 1 artifactDetector | quantumPhysics |
| Neural Lab | 3 fiberOptics + 2 aiChip → 1 neuralNetwork | artificialIntelligence |

### Tier 4 Factories — 8 buildings
| Building | Inputs → Outputs | Research | Prestige |
|----------|------------------|----------|----------|
| Singularity Forge | 2 quantumPart + 1 nanoMaterial + 3 aiChip → 1 singularityCore | singularityTheory | — |
| Dark Matter Lab | 2 nanoMaterial + 3 advancedAlloy + 5 coolant → 1 darkMatterCell | voidCrystallography | — |
| Warp Drive Factory | 5 engine + 2 robotics + 3 quantumPart → 1 warpDrive | warpTechnology | — |
| Antimatter Reactor | 5 battery + 3 coolant + 8 rareEarth → 1 antimatter | antimatterPhysics | — |
| Chrono Lab | 2 singularityCore + 3 neuralNetwork → 1 chronoPart | chronoEngineering | — |
| Plasma Forge | 5 fossilFuel + 3 coolant + 2 advancedAlloy → 1 plasmaCore | plasmaDynamics | — |
| Mega Structure Factory | 10 concrete + 8 steel + 2 advancedAlloy → 1 megaStructure | megaConstruction | — |
| Void Crystallizer | 10 rareEarth + 2 nanoMaterial + 2 quantumPart → 1 voidCrystal | voidCrystallography | — |

### Tier 4 Endgame Buildings — 5 buildings
| Building | Inputs → Outputs | Research | Prestige |
|----------|------------------|----------|----------|
| Dyson Collector | 10 solarCell + 1 plasmaCore → 0.1 singularityCore (+200 MW) | dimensionalPhysics | 2 |
| Quantum Teleporter | 1 chronoPart + 1 voidCrystal → 0.05 singularityCore | dimensionalPhysics | 2 |
| Dimensional Gateway | 1 singularityCore + 1 warpDrive + 1 voidCrystal → 0.1 darkMatterCell | dimensionalPhysics | 3 |
| Time Distorter | 2 chronoPart + 1 antimatter → 0.02 singularityCore | galacticManufacturing | 3 |
| Galactic Forge | 1 singularityCore + 1 darkMatterCell + 1 warpDrive + 1 voidCrystal → 0.5 megaStructure (+500 MW) | galacticManufacturing | 5 |

### Power Plants — 6 buildings
| Building | Power Output | Fuel | Research |
|----------|-------------|------|----------|
| Coal Generator | 20 MW | coal (0.5/tick) | — |
| Solar Panel | 8 MW | — | — |
| Wind Turbine | 12 MW | — | — |
| Nuclear Reactor | 100 MW | — | nuclearPower |
| Fusion Reactor | 500 MW | — | fusionEnergy |
| Antimatter Power Plant | 1000 MW | — | antimatterPhysics |

---

## 4. Research Tree (26 Nodes, 6 Categories)

### Automation (5 nodes)
| ID | Name | Tier | Cost RP | Time | Prereqs | Effect |
|----|------|------|---------|------|---------|--------|
| basicAutomation | Basic Automation | 1 | 50 | 30 | — | +15% extractor speed |
| advancedAutomation | Advanced Automation | 2 | 200 | 60 | basicAutomation | +25% factory speed |
| basicMachining | Basic Machining | 1 | 100 | 45 | — | Unlock Gear Factory, Aluminium Factory, Insecticide Factory |
| advancedDrilling | Advanced Drilling | 2 | 300 | 80 | basicAutomation | +20% extractor speed |
| efficientSmelting | Efficient Smelting | 2 | 250 | 70 | basicAutomation | +15% T1 factory speed |
| marketAnalysis | Market Analysis | 1 | 100 | 40 | — | +20% sell prices |
| workerTraining | Worker Training | 2 | 300 | 80 | basicAutomation | +25% worker efficiency |
| metabolicEngineering | Metabolic Engineering | 3 | 2000 | 250 | advancedAutomation | +20% T3 factory speed |

### Logistics (4 nodes)
| ID | Name | Tier | Cost RP | Time | Prereqs | Effect |
|----|------|------|---------|------|---------|--------|
| logistics1 | Efficient Transport | 1 | 75 | 40 | — | +20% transport throughput |
| advancedLogistics | Advanced Logistics | 2 | 300 | 80 | logistics1 | +30% throughput, unlock Cargo Train |
| cargoDrones | Cargo Drones | 2 | 400 | 100 | advancedLogistics | +25% throughput, unlock Drone transport |
| storageExpansion | Storage Expansion | 2 | 200 | 60 | logistics1 | +50% storage capacity |
| megaStorage | Mega Storage | 3 | 1500 | 200 | storageExpansion | +100% storage capacity |

### Energy (5 nodes)
| ID | Name | Tier | Cost RP | Time | Prereqs | Effect |
|----|------|------|---------|------|---------|--------|
| energyEfficiency | Energy Efficiency | 1 | 60 | 35 | — | -15% power consumption |
| nuclearPower | Nuclear Power | 2 | 500 | 120 | energyEfficiency | Unlock Nuclear Reactor |
| fusionEnergy | Fusion Energy | 3 | 2000 | 300 | nuclearPower, quantumPhysics | Unlock Fusion Reactor |
| powerOptimization | Power Optimization | 2 | 200 | 60 | energyEfficiency | -10% factory power consumption |
| antimatterPhysics | Antimatter Physics | 4 | 6000 | 600 | fusionEnergy | Unlock Antimatter Reactor + Power Plant |
| plasmaDynamics | Plasma Dynamics | 4 | 5500 | 550 | fusionEnergy, advancedMetallurgy | Unlock Plasma Forge |

### Electronics & AI (5 nodes)
| ID | Name | Tier | Cost RP | Time | Prereqs | Effect |
|----|------|------|---------|------|---------|--------|
| electronics | Electronics | 1 | 150 | 50 | — | Unlock Circuit Factory |
| energyStorage | Energy Storage | 2 | 250 | 70 | electronics | Unlock Battery Factory |
| artificialIntelligence | Artificial Intelligence | 2 | 500 | 100 | electronics, energyStorage | Unlock AI Lab |
| advancedElectronics | Advanced Electronics | 2 | 350 | 90 | electronics | +15% T2 factory speed |
| aiOptimization | AI Optimization | 3 | 1500 | 200 | artificialIntelligence | +20% AI Lab + Neural Lab speed |

### Robotics (4 nodes)
| ID | Name | Tier | Cost RP | Time | Prereqs | Effect |
|----|------|------|---------|------|---------|--------|
| mechanicalEngineering | Mechanical Engineering | 1 | 200 | 60 | basicMachining | Unlock Engine Factory |
| roboticsTech | Robotics Technology | 2 | 800 | 150 | artificialIntelligence, mechanicalEngineering | Unlock Robotics Bay |
| advancedMetallurgy | Advanced Metallurgy | 2 | 600 | 100 | basicMachining | Unlock Alloy Forge |
| advancedRobotics | Advanced Robotics | 3 | 2000 | 250 | roboticsTech | +25% Robotics Bay + Drone Shipyard speed |
| warpTechnology | Warp Technology | 4 | 8000 | 700 | singularityTheory, roboticsTech | Unlock Warp Drive Factory |
| megaConstruction | Mega Construction | 4 | 7000 | 650 | advancedMetallurgy, nanotechnology | Unlock Mega Structure Factory |

### Quantum Tech (5 nodes)
| ID | Name | Tier | Cost RP | Time | Prereqs | Effect |
|----|------|------|---------|------|---------|--------|
| quantumPhysics | Quantum Physics | 3 | 1500 | 200 | artificialIntelligence | Unlock Quantum Lab |
| nanotechnology | Nanotechnology | 3 | 3000 | 400 | quantumPhysics, advancedMetallurgy | Unlock Nano Lab |
| quantumComputing | Quantum Computing | 3 | 2500 | 300 | quantumPhysics | +30% Quantum Lab speed |
| singularityTheory | Singularity Theory | 4 | 5000 | 500 | nanotechnology | Unlock Singularity Forge |
| chronoEngineering | Chrono Engineering | 4 | 10000 | 800 | singularityTheory | Unlock Chrono Lab |
| voidCrystallography | Void Crystallography | 4 | 9000 | 750 | singularityTheory, quantumPhysics | Unlock Void Crystallizer + Dark Matter Lab |
| dimensionalPhysics | Dimensional Physics | 4 | 15000 | 1000 | chronoEngineering, voidCrystallography | Unlock Dyson Collector + Quantum Teleporter + Dimensional Gateway |
| galacticManufacturing | Galactic Manufacturing | 4 | 25000 | 1500 | dimensionalPhysics | Unlock Time Distorter + Galactic Forge |

---

## 5. Quest System (120+ Quests, 5 Tiers)

### Quest Types
build, produce, sell, research, earn, reach, contract, transport, worker, prestige, megaProject

### Quest Categories
tutorial, daily, weekly, challenge, milestone

### Tier Distribution
| Tier | Quest Count | Focus |
|------|------------|-------|
| T0: Startup | ~6 quests | Tutorial: first building, power, sale, extraction expansion |
| T1: Basic Processing | ~18 quests | Build all T1 factories, produce T1 resources, first contracts |
| T2: Advanced Manufacturing | ~30 quests | Build T2 factories, research gating, produce T2 resources, transport, workers |
| T3: High-Tech | ~35 quests | AI/robotics/quantum builds, T3 production milestones, mega projects, efficiency |
| T4: Singularity | ~25 quests | T4 factory builds, endgame buildings (Dyson/Galactic), T4 milestones, prestige |
| Daily | ~7 quests | Recurring daily objectives (build, earn, sell, contract, research, produce, power) |
| Weekly | ~4 quests | Multi-step weekly challenges |

### Current Status: Quests ARE updated to match current game system
- All T1-T4 buildings have corresponding build quests
- All resources have production milestone quests
- Research-gated quests match current research tree
- Endgame quests (Dyson Collector, Quantum Teleporter, Dimensional Gateway, Time Distorter, Galactic Forge) are present
- Daily and weekly quests scale across tiers

---

## 6. Other Game Systems

### Transport (6 types)
conveyorBelt, pipe, truck, cargoTrain, drone, cargoShip

### Workers (4 types)
engineer, mechanic, transportManager, aiSupervisor

### Market (51 resources with dynamic pricing)
- Sparkline charts, auto-sell, price alerts (HOT/LOW), quantity selectors
- Market Summary Bar with Price Index and Sentiment

### Contracts (45+ templates across 5 tiers)
- Types: delivery, supply, construction, military, research
- Difficulty 1-5, gameTier 0-4

### Automation (7 unlocks)
autoRouting, autoBalancing, selfRepair, autoTrading, autoExpansion, smartStorage, aiOptimization

### Prestige System (15 bonuses)
- Production, Power, Speed, Market, Storage, Research boosts (3 tiers each)
- Mega Factory unlock, Offline Production, Time Warp

### Mega Projects (5 projects)
Space Elevator, Dyson Sphere, Quantum Internet, Fusion City, Terraforming Engine
- Multi-stage construction requiring significant resources
- Permanent bonuses on completion

### Weather System (6 types)
clear, sunny, rainy, stormy, foggy, snowy — affects production, solar, wind

### Events (10 types)
oilCrisis, energyShortage, aiRevolution, economicBoom, naturalDisaster, techBreakthrough, tradeWar, greenInitiative, spaceRace, marketCrash

### Rank System (12 ranks)
Apprentice → Foreman → Manager → Director → VP → CEO → Tycoon → Magnate → Industrial Legend → Cosmic Industrialist → Galactic Emperor → Universal Dominion

### Daily Rewards (7-day cycle)
### Drone Delivery System
### Login Streak Tracking
### Production History & Statistics
### Blueprints (save/load/share)
### Save Migration (V1→V6)
### Sound FX (10 Web Audio synthesized sounds)
### Offline Progress (50% rate, 10h cap)

---

## 7. UI Tabs (25 tabs)

| # | Tab ID | Label | Component |
|---|--------|-------|-----------|
| 1 | dashboard | Dashboard | DashboardPanel |
| 2 | factoryMap | Map | FactoryMapPanel |
| 3 | guide | Guide | OnboardingPanel |
| 4 | resources | Extraction | ResourcePanel |
| 5 | factories | Factories | FactoryPanel |
| 6 | transport | Transport | TransportPanel |
| 7 | power | Power | PowerPanel |
| 8 | market | Market | MarketPanel |
| 9 | research | Research | ResearchPanel |
| 10 | workers | Workers | WorkerPanel |
| 11 | contracts | Contracts | ContractPanel |
| 12 | automation | Automation | AutomationPanel |
| 13 | prestige | Expand | PrestigePanel |
| 14 | events | Events | EventPanel |
| 15 | megaprojects | Mega | MegaProjectPanel |
| 16 | statistics | Stats | StatisticsPanel |
| 17 | achievements | Trophies | AchievementPanel |
| 18 | leaderboard | Ranks | LeaderboardPanel |
| 19 | dailyRewards | Daily | DailyRewardsPanel |
| 20 | payouts | Payouts | PayoutPanel |
| 21 | droneDelivery | Drones | DroneDeliveryPanel |
| 22 | quests | Quests | QuestPanel |
| 23 | notifications | Alerts | NotificationCenterPanel |
| 24 | blueprints | Blueprints | BlueprintPanel |
| 25 | settings | Settings | SettingsPanel |

---

## 8. Production Chains (35 chains)

### Tier 0-1 Chains
1. Basic Iron: iron → ironPlate → gear → engine
2. Steel Production: iron + coal → steel → advancedAlloy
3. Brick Making: clay → bricks
4. Concrete Production: gravel + limestone → concrete
5. Fertilizer: limestone + water → fertilizer
6. Oil Refining: oil → fossilFuel
7. Carbon Fiber: coal → carbon → battery
8. Oil Products: oil → plastic → circuit
9. Glass Production: sand → glass → fiberOptics
10. Coolant Production: water + oil → coolant

### Tier 1-2 Chains
11. Electronics: copper → copperWire → circuit → aiChip → electronics
12. Silicon Tech: sand + clay → silicon → circuit
13. Aluminium: bauxite → aluminium → battery
14. Copper Refining: copper → copperIngot
15. Titanium: rareEarth → titanium → medicalTech
16. Solar Energy: sand → glass + silicon → solarCell
17. Insecticide: copper + limestone → insecticide

### Tier 2-3 Chains
18. Advanced Materials: iron → steel → advancedAlloy → nanoMaterial
19. Quantum Tech: rareEarth + aiChip → quantumPart → nanoMaterial
20. Robotics: gear + engine + aiChip + electronics → robotics
21. Tungsten: wolframite → tungsten → artifactDetector
22. Weapons: steel + aluminium + battery → weapons
23. Scan Drones: electronics + titanium + battery → scanDrone
24. Medical Technology: titanium + plastic + electronics → medicalTech
25. Neural Computing: copperWire → fiberOptics + aiChip → neuralNetwork
26. Jewellery: rareEarth + copper → jewellery

### Tier 3-4 Chains (Endgame)
27. Singularity: quantumPart + nanoMaterial + aiChip → singularityCore → chronoPart
28. Dark Matter: nanoMaterial + advancedAlloy + coolant → darkMatterCell
29. Warp Drive: gear → engine + robotics + quantumPart → warpDrive
30. Antimatter: rareEarth + battery + coolant → antimatter
31. Plasma Core: oil → fossilFuel + coolant + advancedAlloy → plasmaCore
32. Mega Structure: gravel + limestone → concrete + steel + advancedAlloy → megaStructure
33. Void Crystal: rareEarth + nanoMaterial + quantumPart → voidCrystal
34. Chrono Tech: singularityCore + neuralNetwork → chronoPart
35. Galactic Production: singularityCore + darkMatterCell + warpDrive + voidCrystal → megaStructure

---

## 9. Known Issues & Disconnected Resources

### Disconnected Resources (produced but underutilized)
- **water**: Used by Chemical Plant (1/tick), Fertilizer Factory (1/tick), Coolant Plant (2/tick), Hydrogen Plant (3/tick) — actually well-connected
- **glass**: Used by Glass Furnace output, Optics Lab (2/tick), Solar Cell Factory (2/tick), Display Factory (1/tick) — well-connected
- **plastic**: Used by Circuit Factory (1/tick), Electronics Factory (1/tick), Display Factory (2/tick), Medical Tech Lab (1/tick) — well-connected
- **gear**: Used by Engine Factory (3/tick) only — limited consumer (but this is intentional as a T2 intermediate)

### Known Issues
- Transport panel has limited routing functionality (no actual building-to-building auto-routing)
- No cloud save sync
- Performance not stress-tested for 100k+ tick sessions
- FactoryPanel layout may not match expected design (reported issue)

---

## 10. Research Panel Status

### Current Implementation: UP TO DATE
The ResearchPanel.tsx correctly reflects the current research tree:
- All 6 categories (Automation, Logistics, Energy, Electronics & AI, Robotics, Quantum Tech) are displayed
- All 26+ research nodes are shown with correct tiers, costs, prerequisites, and effects
- T4 research nodes are included (singularityTheory, antimatterPhysics, warpTechnology, plasmaDynamics, chronoEngineering, voidCrystallography, megaConstruction, dimensionalPhysics, galacticManufacturing)
- Prerequisites show completion status (green=done, red=needed)
- Effect badges correctly display type and value
- Start Research button works with RP cost validation

---

## 11. Quest Panel Status

### Current Implementation: UP TO DATE
The QuestPanel.tsx correctly reflects the current quest system:
- 120+ quests across 5 tiers (T0-T4)
- All building types have corresponding build quests
- All resource types have production milestone quests
- Tier-gated unlocking (quests unlock as player advances)
- Daily and weekly recurring quests
- Quest tracking/pinning system
- Claim all rewards button
- Filter by type and category
- Progress bars for each step

---

## 12. File Sizes & Complexity

| File | Lines | Description |
|------|-------|-------------|
| data.ts | 4,313 | All game data definitions |
| store.ts | 2,979 | Game state & logic |
| types.ts | 520 | TypeScript type definitions |
| page.tsx | ~1,200 | Main page with sidebar, tabs, mobile layout |
| FactoryMapPanel.tsx | ~1,100 | Factory floor visualization |
| DashboardPanel.tsx | ~800 | Factory overview dashboard |
| MarketPanel.tsx | ~700 | Market with sparklines |
| PowerPanel.tsx | ~600 | Power flow diagram |
| QuestPanel.tsx | ~545 | Quest board |
| TransportPanel.tsx | ~800 | Transport + bottleneck detection |
| ResearchPanel.tsx | ~260 | Research tree |
| ContractPanel.tsx | ~400 | Contract system |
| 30 component files total | ~12,000+ | All game UI components |
