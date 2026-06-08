# Factory Dominion - Worklog

---
Task ID: 1
Agent: main
Task: Frontend Architecture Restructure - Supabase Integration, Auth, Cloud Sync

Work Log:
- Created Supabase client layer (browser + server) in `src/lib/supabase/`
- Created API routes for game config: `src/app/api/config/route.ts` (fetches all 19 config tables from Supabase)
- Created API routes for player data: `src/app/api/player/route.ts` (save/load cloud game state)
- Created OAuth callback: `src/app/api/auth/callback/route.ts` (Google OAuth code exchange)
- Created comprehensive GameConfig type system and data transformer in `src/lib/game/config.ts`
  - Supabase row types for all 19 tables
  - Transform functions that map Supabase data → existing frontend types
  - `fetchGameConfig()` function that loads all 19 tables in parallel
- Created GameConfigProvider in `src/components/providers/GameConfigProvider.tsx`
  - Loads game config from Supabase on startup
  - Falls back to hardcoded data.ts if Supabase unavailable
  - Merges Supabase data with fallback for missing entries
  - Shows "Live" vs "Local" config source indicator
- Created AuthProvider in `src/components/providers/AuthProvider.tsx`
  - Google OAuth sign-in/sign-out
  - Session management with Supabase Auth
  - User profile (name, avatar, email)
- Created cloud sync hook in `src/lib/hooks/useCloudSync.ts`
  - Save game state to Supabase player_progress table
  - Load game state from cloud
- Updated layout.tsx with provider hierarchy: AuthProvider → GameConfigProvider → IconPreloader
- Updated page.tsx with:
  - Auth UI in header (Sign In button, user profile menu with avatar)
  - Config source indicator badge (Live/Local)
  - Cloud save button (cloud icon with status feedback)
  - User profile tooltip with Save to Cloud, Reload Config, Sign Out actions
  - Rebranded from "FACTORY DOMINION" to "INDUSTRIAX"
  - Mobile header auth UI
- Fixed config API route: added sort_order column allowlist to prevent 500 errors on tables without sort_order

Stage Summary:
- **Supabase Integration**: All 19 config tables accessible via `/api/config?table=<name>` API route
- **Authentication**: Google OAuth fully integrated with Supabase Auth
- **Cloud Save/Load**: Player progress can be saved to/loaded from Supabase
- **Config Source**: UI shows "Live" (Supabase connected) or "Local" (fallback) badge
- **Branding**: Updated to "INDUSTRIAX — Factory Dominion"
- **Verified**: Page loads correctly with all features working in agent-browser

Key Architecture:
```
src/
├── lib/
│   ├── supabase/
│   │   ├── client.ts          ← Browser Supabase client
│   │   └── server.ts          ← Server + service-role clients
│   ├── game/
│   │   ├── config.ts          ← Game config types + Supabase→frontend transformer
│   │   └── ...existing files
│   └── hooks/
│       └── useCloudSync.ts    ← Cloud save/load hook
├── components/
│   └── providers/
│       ├── AuthProvider.tsx    ← Auth context (Google OAuth)
│       └── GameConfigProvider.tsx ← Game config context (Supabase config)
├── app/
│   ├── api/
│   │   ├── config/route.ts    ← Game config API (19 Supabase tables)
│   │   ├── auth/callback/route.ts ← OAuth callback
│   │   └── player/route.ts    ← Player data save/load
│   └── layout.tsx             ← Provider hierarchy
```

Unresolved Issues:
- `game_config_balancing_rules` table returns 500 (likely doesn't exist in Supabase or schema mismatch) — handled gracefully by fallback
- Server process sometimes gets killed by sandbox when idle — need to keep alive with periodic requests
- The store still uses hardcoded BUILDING_DEFS directly — needs future update to use GameConfigProvider data

Priority Next Steps:
1. Migrate store.ts to use game config from provider instead of hardcoded data.ts
2. Add auto-cloud-save (periodic save to Supabase when logged in)
3. Create player_progress table in Supabase if it doesn't exist
4. Add login streak sync with cloud
5. Fix 6 advanced extractors missing from FactoryMap build palette
6. Consider extracting GameHeader component fully for cleaner page.tsx

---
Task ID: 2
Agent: config-cache
Task: Create configCache.ts dynamic config bridge and idMigration.ts

Work Log:
- Created `/src/lib/game/configCache.ts` — the critical bridge between Supabase backend and frontend game code
  - Imports all 18 default exports from `data.ts` as fallback values
  - Re-exports them as mutable `let` bindings (ES module live bindings) so all importers see updates
  - Exports: BUILDING_DEFS, RESOURCE_META, RESEARCH_TREE, TRANSPORT_DEFS, WORKER_DEFS, INITIAL_MARKET, AUTOMATION_UNLOCKS, PRESTIGE_BONUSES, EVENT_TEMPLATES, TIER_INFO, CONTRACT_TEMPLATES, RANK_THRESHOLDS, PRODUCTION_CHAINS, INITIAL_MEGA_PROJECTS, WEEKLY_DAILY_REWARDS, SEASONAL_EVENTS, WEATHER_DEFS, QUEST_DEFS, getStreakMultiplier
  - `BUILDING_ID_MIGRATION` map: old hardcoded ID → new Supabase ID (miningDrill→ironMine, quarry→sandMine, goldsmith→jewelleryForge)
  - Source tracking: `configSource` ('local'|'supabase'), `configLoadedAt`, `configVersion`
  - `updateFromSupabase(config: GameConfig)` — merges Supabase data with defaults, handles partial updates gracefully
  - `resetToLocal()` — reverts all exports to data.ts defaults
  - `migrateBuildingDefs()` — applies ID migration to BUILDING_DEFS in-place
- Created `/src/lib/game/idMigration.ts` — handles building ID migration for existing saves
  - `BUILDING_ID_MAP` — forward migration map (old → new)
  - `REVERSE_BUILDING_ID_MAP` — reverse migration map (new → old)
  - `migrateBuildingId(oldId)` — single ID migration
  - `reverseMigrateBuildingId(newId)` — reverse single ID migration
  - `isOldBuildingId(id)` / `isMigratedBuildingId(id)` — ID classification helpers
  - `migrateSaveBuildings(buildings)` — batch migrate building array
  - `migrateResearchId(oldId)` — future-proof research ID migration
  - `migrateSaveState(saveState)` — full save state migration
- All TypeScript errors in new files resolved (pre-existing marketSimulator.ts errors unchanged)
- Dev server running correctly

Stage Summary:
- **configCache.ts**: Complete dynamic config bridge with 18 mutable exports, Supabase update function, reset function, and building ID migration
- **idMigration.ts**: Complete ID migration system with forward/reverse maps, single/batch migration, and save state migration
- **Backward compatible**: All existing code importing from `data.ts` can switch to `configCache.ts` with minimal changes (just change the import path)
- **Live binding pattern**: Using `let` exports ensures all importers see updates when `updateFromSupabase()` is called — no stale references
- **Graceful degradation**: Game works immediately with data.ts defaults; Supabase data overlays when available

---
Task ID: 1
Agent: backend-engine
Task: Create backend game engine API routes

Work Log:
- Created `/api/game/definitions/route.ts` — PRIMARY config endpoint
  - Fetches ALL 19 config tables from Supabase using service-role client in parallel
  - Transforms Supabase rows into frontend-expected format (same shape as data.ts exports)
  - Includes building ID migration mapping (miningDrill→ironMine, quarry→sandMine, goldsmith→jewelleryForge)
  - Returns single JSON with: buildings, resources, research, market, weather, workers, transport, automation, prestigeBonuses, rankThresholds, quests, dailyRewards, eventTemplates, seasonalEvents, megaProjects, gameConfig, productionChains, idMigrationMap
  - 5-minute in-memory cache (game config doesn't change frequently)
  - Graceful error handling: returns partial data with error info for non-critical tables, 503 for critical table failures
  - Fixed `sort_order` column allowlist (same pattern as `/api/config/route.ts`) to prevent 500 errors
  - Fixed `base_cost` parsing: Supabase stores `base_cost` as `[{resource, amount}]` array, not `{key: value}` object — `parseCostMap()` now handles both formats
- Created `/api/game/action/route.ts` — POST action validation endpoint
  - Validates 6 action types: build, sell, buy, research, upgrade, transport
  - Each action fetches relevant config from Supabase (with 5-min cache) and validates against game rules
  - build: Can afford? Research unlocked? Building exists in config?
  - sell: Have enough resources? Market exists?
  - buy: Can afford at current price?
  - research: Prerequisites met? Can afford? Not already completed/in-progress?
  - upgrade: Building exists? Can afford upgrade cost (baseCost * costMultiplier^level)?
  - transport: Buildings exist? Valid route?
  - Returns: `{ valid: boolean, error?: string, correctedState?: Partial<GameState> }`
  - Anti-cheat layer: all validation uses server-side Supabase config, not client-provided data
- Created `/api/game/compute/route.ts` — POST tick computation endpoint
  - Receives: `{ gameState: GameState, ticks: number }`
  - Runs N ticks of the game engine using serverEngine.ts
  - Returns: `{ newState: GameState, productionSnapshot: ProductionSnapshot }`
  - Used for: offline progress calculation, server-side validation, cloud save integrity checks
  - Maximum 60,000 ticks per request (anti-abuse cap)
  - Loads full config (buildings, recipes, workers, weather, market) from Supabase with cache
- Created `/lib/game/serverEngine.ts` — server-side game engine
  - Mirrors productionCalculator.ts logic but accepts config as parameter instead of reading BUILDING_DEFS
  - `buildMultipliersServer()` — builds MultiplierCache from GameState + GameConfig
  - `computePowerGridServer()` — power grid computation with Supabase building definitions
  - `computeProductionServer()` — per-building production with Supabase building definitions + worker definitions
  - `computeSellMultiplierServer()`, `computePayoutServer()`, `computeEndgameIncomeServer()` — same logic as frontend but config-driven
  - `buildProductionSnapshotServer()` — builds complete ProductionSnapshot from state + config
  - `runServerTicks()` — runs N ticks of the game engine (production, consumption, fuel, weather, endgame income)
  - Validation functions: `validateBuildAction()`, `validateSellAction()`, `validateBuyAction()`, `validateResearchAction()`, `validateUpgradeAction()`, `validateTransportAction()`
- Updated `/lib/game/config.ts` — fixed Supabase type definitions
  - `SupabaseBuilding.base_cost` type: `Record<string, number> | Array<{resource, amount}>`
  - `SupabaseTransport.base_cost` type: `Record<string, number> | Array<{resource, amount}>`
  - `parseCostMap()` updated to handle both array and object cost formats
- All API routes tested and verified:
  - `/api/game/definitions` → 200, returns 96 buildings, 41 research, 82 market entries, 6 weather types, 4 workers, 6 transport, 239 production chains
  - `/api/game/action` (build, not enough money) → `{valid: false, error: "Not enough money. Need $1000, have $500"}`
  - `/api/game/action` (build, enough money) → `{valid: true}`
  - `/api/game/compute` (10 ticks) → 200, gameTick advanced to 10, resources consumed correctly

Stage Summary:
- **3 new API routes** for backend game engine: definitions, action validation, tick computation
- **1 new server engine** module that mirrors frontend productionCalculator but is config-driven
- **All data comes from Supabase** — no imports from data.ts in any API route
- **5-minute in-memory cache** on all Supabase config fetches
- **Anti-cheat layer** — action validation uses server-side Supabase config, not client data
- **Backward compatible** — base_cost parsing handles both array and object formats
- **Fixed config.ts types** — SupabaseBuilding.base_cost and SupabaseTransport.base_cost now accept both formats

---
Task ID: 5+6
Agent: migration
Task: Migrate all imports from data.ts to configCache.ts

Work Log:
- Migrated store.ts imports from './data' → './configCache' + added building ID migration
  - Added `import { migrateSaveBuildings } from './idMigration'`
  - Added building ID migration in `migrateSaveState()` before `state._version = SAVE_VERSION`
  - Migrates old building IDs (miningDrill→ironMine, quarry→sandMine, goldsmith→jewelleryForge) on save load
- Migrated productionCalculator.ts imports from './data' → './configCache'
- Migrated marketSimulator.ts imports from './data' → './configCache'
- Migrated newsBuilder.ts imports from './data' → './configCache'
- Migrated newsLLM.ts imports from './data' → './configCache'
- Migrated page.tsx imports from '@/lib/game/data' → '@/lib/game/configCache'
- Migrated 30 game panel component imports from '@/lib/game/data' → '@/lib/game/configCache':
  - ResearchPanel, GlobalResourceMonitorPanel, ResourceFlowPanel, QuestPanel, MegaProjectPanel
  - BlueprintPanel, ResourcePanel, DashboardPanel, ContractPanel, OnboardingPanel
  - FactoryMapPanel, TransportPanel, AIAdvisorPanel, WorkerPanel, PrestigePanel
  - DailyRewardsPanel, StoragePanel, AutomationPanel, GameSidebar, PayoutPanel
  - GameHeader, LeaderboardPanel, FactoryPanel, EventPanel, PowerPanel
  - ProductionChainPanel, FloatingNumbers, StatisticsPanel, AchievementPanel, MarketPanel
- Verified no remaining imports from '@/lib/game/data' or './data' (except configCache.ts itself, which intentionally imports defaults from data.ts)
- Lint passes (all errors are pre-existing, none introduced by migration)
- Dev server compiling successfully

Stage Summary:
- All 35 files now import from configCache instead of data.ts
- Building ID migration added to store.ts save migration
- Game will now use Supabase data when available, data.ts defaults otherwise
- The only remaining import from './data' is in configCache.ts itself (by design — it loads defaults)

---
Task ID: 7+8
Agent: cloud-save-middleware
Task: Create player_progress table, Fix balancing_rules 500, Add auto-cloud-save, Add session refresh middleware

Work Log:
- **Created player_progress table in Supabase** via Management API SQL
  - Table already existed but was missing columns needed by `/api/player/route.ts`
  - Queried Supabase schema to identify existing vs missing columns
  - Added missing columns: `display_name TEXT DEFAULT 'Commander'`, `game_state JSONB`, `last_saved_at TIMESTAMPTZ DEFAULT NOW()`, `buildings_count INT DEFAULT 0`
  - Enabled Row Level Security on player_progress
  - Created 4 RLS policies: service-role full access, user read/update/insert own data
  - Created migration file at `supabase/migrations/001_player_progress.sql` for documentation
  - Verified: `/api/player?userId=<uuid>` returns `{data: null, isNew: true}` for new users ✅
- **Fixed game_config_balancing_rules returning 500**
  - Root cause: `game_config_balancing_rules` was in `tablesWithSortOrder` list but the table has no `sort_order` column
  - Queried Supabase to confirm which tables actually have `sort_order` column
  - Removed `game_config_balancing_rules` from the sort_order list
  - Added defensive fallback: if sort_order query fails with column error, retry without ordering
  - Converted `tablesWithSortOrder` from array to Set for O(1) lookups
  - Verified: `/api/config?table=game_config_balancing_rules` now returns 200 ✅
- **Added auto-cloud-save to useCloudSync hook**
  - Added `useEffect` with 60-second interval (`AUTO_SAVE_INTERVAL = 60_000`)
  - Only triggers when user is logged in and `isSyncing` is false
  - Tracks `lastSavedGameTick` to avoid unnecessary saves when game state hasn't changed
  - Added `lastAutoSaveAt` state to expose last auto-save timestamp to consumers
  - Fixed reactivity: converted `isSyncing`, `lastSyncAt`, `lastAutoSaveAt` from pure refs to useState-backed refs
  - New hook return value: `lastAutoSaveAt: number | null`
- **Created session refresh middleware** at `src/middleware.ts`
  - Uses `createServerClient` from `@supabase/ssr` with `getAll()`/`setAll()` cookie pattern
  - Calls `supabase.auth.getUser()` to refresh the session on every request
  - Matcher excludes static assets (_next/static, _next/image, favicon.ico, image files)
  - Note: Next.js 16 shows deprecation warning ("middleware" → "proxy") but functionality works correctly

Stage Summary:
- **player_progress table**: Now fully operational in Supabase with all required columns + RLS policies
- **balancing_rules fix**: Config API returns 200 for all 19 tables, no more 500 errors
- **Auto-cloud-save**: Game state automatically saved every 60s when logged in (only if changed)
- **Session refresh**: Middleware keeps Supabase auth sessions fresh across all requests
- **Migration doc**: `supabase/migrations/001_player_progress.sql` documents the schema for future reference

Files Modified:
- `src/app/api/config/route.ts` — Fixed sort_order handling, added fallback for missing columns
- `src/lib/hooks/useCloudSync.ts` — Added auto-save, reactive state, lastAutoSaveAt tracking
- `src/middleware.ts` — NEW: Supabase session refresh middleware
- `supabase/migrations/001_player_progress.sql` — NEW: Migration documentation

---
Task ID: 9
Agent: main
Task: Add missing T2-T5 resources, cloud sync conflict resolution, config caching, T5 UI visibility

Work Log:
- Added 26 missing resources to `initialResources` and `initialCapacity` in store.ts:
  - T0: silver, gold
  - T2: powerCell, reinforcedConcrete, refinedSilver, refinedGold
  - T3: carbonComposite, structuralFrame, fusionCell, solarPanel, creditChip
  - T4: arcologyModule, habitatModule, stellarEnergy, luxuryGoods, tradeContract, teleporterNode
  - T5: researchMatrix, worldCore, shieldMatrix, stellarForge, voidEnergy, marketDominance, corpCapital, dimensionalGate, armadaFleet
- Added V18→V19 save migration for all new resources (resources, capacity, storageUpgradeLevels, stats tracking, market entries)
- Bumped SAVE_VERSION from 18 to 19
- Added 26 missing resources to RESOURCE_META in data.ts with names, icons, tiers, colors
- Added TIER_INFO for Tier 5 (Transcendent) in data.ts: `{ name: 'Transcendent', icon: 'gi:galactic-carrier', color: '#ff1744' }`
- Added 'red' TierColor to tierColors.ts for T5 buildings
- Added T5 tier info to shared tierColors.ts TIER_INFO constant
- Updated FactoryMapPanel.tsx:
  - Added `factory_t5` category style (red theme)
  - Added T5 tier mapping in getCategoryStyle()
  - Updated BUILD_CATEGORIES to use Supabase building IDs (replaced old IDs like miningDrill→ironMine, quarry→sandMine)
  - Added all T2-T4 missing buildings (siliconRefinery, aluminiumFactory, insecticideFactory, copperRefinery, etc.)
  - Added new T5 Transcendent category with all 9 Supabase T5 buildings
- Added cloud sync conflict resolution to useCloudSync.ts:
  - Tick-based comparison: cloud tick ratio < 0.9 → keep local, > 1.1 → use cloud
  - Close matches (within 10%) show conflict dialog for user to choose
  - Added `pendingConflict` state and `resolveConflict()` method
  - Added `_version` to saved game state for save migration tracking
- Added client-side config caching to GameConfigProvider.tsx:
  - localStorage cache with 5-minute TTL (`industriax_game_config` key)
  - Stale-while-revalidate pattern: load from cache instantly, refresh in background
  - Prevents re-fetching on every page load
- Fixed next.config.ts: added '127.0.0.1' to allowedDevOrigins for agent-browser compatibility

Stage Summary:
- **26 missing resources** now visible in frontend (all tiers represented)
- **T5 Transcendent tier** fully supported with color scheme, tier info, and building palette
- **FactoryMapPanel** updated with ALL 96 Supabase building IDs across 7 categories
- **Cloud sync conflict resolution** with tick-based auto-resolution and manual override
- **Client-side config caching** eliminates redundant API fetches (5-min TTL, stale-while-revalidate)
- **Save migration V19** handles all new resources for existing saves
- Lint passes with no new errors in changed files

Files Modified:
- `src/lib/game/store.ts` — V19 save migration, new resources/capacity
- `src/lib/game/data.ts` — 26 new RESOURCE_META entries, T5 TIER_INFO
- `src/components/game/shared/tierColors.ts` — 'red' TierColor, T5 tier info
- `src/components/game/FactoryMapPanel.tsx` — T5 styles, Supabase building IDs, all tiers
- `src/lib/hooks/useCloudSync.ts` — Conflict resolution, resolveConflict(), _version in save
- `src/components/providers/GameConfigProvider.tsx` — Client-side config caching
- `next.config.ts` — allowedDevOrigins for 127.0.0.1

---
Task ID: 1+2+3+4
Agent: data-sync
Task: Update BUILDING_DEFS in data.ts to align with Supabase backend (96 buildings)

Work Log:
- **Replaced combo extractors with specialized ones**:
  - `miningDrill` → `ironMine` (single iron output, aligned with Supabase)
  - `quarry` → `sandMine` (single sand output, sandExtraction research unlock)
- **Added 5 new extractors** after rareEarthExtractor:
  - `copperMine` — extracts copper ore
  - `coalMine` — mines coal
  - `lithiumMine` — mines lithium (lithiumExtraction research unlock)
  - `silverMine` — extracts silver (advancedMetallurgy research unlock)
  - `goldMine` — mines gold (advancedMetallurgy research unlock)
- **Replaced `goldsmith` with `jewelleryForge`** — now takes refinedGold + refinedSilver + rareEarth (3-input recipe aligned with Supabase)
- **Added 4 missing T2 factories** after hydrogenPlant:
  - `reinforcedConcretePlant` — concrete + steel → reinforcedConcrete
  - `powerCellPlant` — battery + fossilFuel → powerCell
  - `silverRefinery` — silver → refinedSilver
  - `goldRefinery` — gold → refinedGold
- **Added 8 missing T3 factories** after neuralLab:
  - `quantumAssembler` — alternative quantum part path (AI chips + rare earth + fiber optics)
  - `opticalComputingLab` — alternative AI chip path (fiber optics + silicon + battery)
  - `carbonCompositePlant` — carbon + advancedAlloy → carbonComposite
  - `structuralFrameFactory` — steel + reinforcedConcrete → structuralFrame
  - `fusionReactor` — lithium + powerCell + coolant → fusionCell (moved from power to factory category, matching Supabase)
  - `solarPanelFactory` — solarCell + circuit + aluminium → solarPanel
  - `creditMint` — jewellery + electronics → creditChip
- **Added 6 missing T4 factories** after voidCrystallizer:
  - `quantumResonanceLab` — alternative quantum part path using plasmaCore
  - `arcologyBuilder` — megaStructure + nanoMaterial + powerCell + habitatModule → arcologyModule
  - `habitatModuleFactory` — carbonComposite + advancedAlloy + glass → habitatModule
  - `luxuryGoodsFactory` — jewellery + carbonComposite + solarPanel → luxuryGoods
  - `tradeHub` — creditChip + luxuryGoods + fiberOptics → tradeContract
  - `teleporterGate` — quantumPart + fiberOptics + powerCell → teleporterNode
- **Added 9 T5 factories** after galacticForge:
  - `omniscienceArray`, `worldEngine`, `planetaryShield`, `starReactor`, `voidEngine`, `quantumExchange`, `megaCorpHQ`, `dimensionalNexus`, `galacticArmada`
- **Removed `fusionReactor` from power section** — it's now a T3 factory that produces fusionCells, not a power plant
- **Updated types.ts** to match:
  - RawResource: added 'silver' | 'gold'
  - Tier2Resource: added 'powerCell' | 'reinforcedConcrete' | 'refinedSilver' | 'refinedGold'
  - Tier3Resource: added 'carbonComposite' | 'structuralFrame' | 'fusionCell' | 'solarPanel' | 'creditChip'
  - Tier4Resource: added 'arcologyModule' | 'habitatModule' | 'stellarEnergy' | 'luxuryGoods' | 'tradeContract' | 'teleporterNode'
  - Added Tier5Resource: 'researchMatrix' | 'worldCore' | 'shieldMatrix' | 'stellarForge' | 'voidEnergy' | 'marketDominance' | 'corpCapital' | 'dimensionalGate' | 'armadaFleet'
  - Updated BuildingType, ExtractorType, FactoryType, PowerPlantType to reflect all new/changed buildings
- **Updated quest references** in data.ts: miningDrill→ironMine, quarry→sandMine, goldsmith→jewelleryForge
- **Updated marketSimulator.ts**: Added all 26 missing resources to RESOURCE_SECTOR and RESOURCE_ELASTICITY; changed Record<ResourceType, number> to Partial<Record<ResourceType, number>> for sparse state fields

Stage Summary:
- **96 buildings total** (15 extractors, 76 factories, 5 power plants) — matches Supabase count
- **No TypeScript errors** in data.ts, types.ts, configCache.ts, idMigration.ts, or marketSimulator.ts
- **All building IDs now match Supabase** (ironMine, sandMine, jewelleryForge, fusionReactor as factory)
- **Complete T2-T5 resource chain** supported with proper sector/elasticity data for market simulation

Files Modified:
- `src/lib/game/data.ts` — BUILDING_DEFS restructured (96 buildings), quest references updated
- `src/lib/game/types.ts` — ResourceType expanded (Tier2-5 additions, Tier5Resource), BuildingType updated
- `src/lib/game/marketSimulator.ts` — RESOURCE_SECTOR, RESOURCE_ELASTICITY expanded, MarketSimulationState types fixed

---
Task ID: 10
Agent: main
Task: Building Audit & Fix — Align frontend data.ts with Supabase backend (96 buildings)

Work Log:
- Audited all 96 Supabase buildings vs 66 frontend buildings — identified 31 missing from frontend
- Found 3 structural ID mismatches: miningDrill→ironMine, quarry→sandMine, goldsmith→jewelleryForge
- Discovered combo extractor problem: miningDrill (iron+copper+coal) → Supabase splits into ironMine/copperMine/coalMine
- Discovered quarry (sand+lithium+rareEarth) → Supabase splits into sandMine/lithiumMine
- Discovered goldsmith uses raw gold/silver but jewelleryForge requires refinedGold+refinedSilver (2 extra processing steps)
- Replaced miningDrill with ironMine in data.ts (single iron output)
- Replaced quarry with sandMine in data.ts (single sand output)
- Replaced goldsmith with jewelleryForge in data.ts (refinedGold+refinedSilver+rarEarth inputs)
- Added 5 new extractors: copperMine, coalMine, lithiumMine, silverMine, goldMine
- Added 4 T2 factories: reinforcedConcretePlant, powerCellPlant, silverRefinery, goldRefinery
- Added 7 T3 factories: quantumAssembler, opticalComputingLab, carbonCompositePlant, structuralFrameFactory, fusionReactor, solarPanelFactory, creditMint
- Added 6 T4 factories: quantumResonanceLab, arcologyBuilder, habitatModuleFactory, luxuryGoodsFactory, tradeHub, teleporterGate
- Added 9 T5 factories: omniscienceArray, worldEngine, planetaryShield, starReactor, voidEngine, quantumExchange, megaCorpHQ, dimensionalNexus, galacticArmada
- Moved fusionReactor from power to factory category (matching Supabase)
- Updated types.ts: BuildingType, ExtractorType, FactoryType, PowerPlantType (fusionReactor removed from power)
- Updated iconMap.ts: Replaced old IDs, added all 31 new building icons
- Updated FactoryMapPanel.tsx BUILD_CATEGORIES: Fixed fusionReactor/antimatterPowerPlant placement, added all new buildings
- Updated FactoryPanel.tsx: Added new buildings to TIER_2/3/4_FACTORIES arrays
- Updated ResourcePanel.tsx: Updated EXTRACTOR_TYPES and BASIC_EXTRACTORS arrays
- Updated PowerPanel.tsx: Removed fusionReactor from POWER_PLANT_TYPES and POWER_PLANT_META
- Updated DashboardPanel.tsx: Changed quickBuildTypes from miningDrill to ironMine
- Updated OnboardingPanel.tsx: Changed checkCompleted from miningDrill to ironMine
- Updated configCache.ts: Updated BUILDING_ID_MIGRATION comments
- Updated idMigration.ts: Updated BUILDING_ID_MAP comments
- Updated definitions route: Fixed ID_MIGRATION_MAP (quarry→sandMine not array)
- Updated config.ts: Made balancingRules optional in GameConfig type
- Verified API returns 96 buildings matching Supabase exactly (15 extractors, 76 factories, 5 power)
- Verified via agent-browser: Extraction panel shows all 15 extractors including new ones

Stage Summary:
- **96 buildings now defined** in both data.ts (fallback) and Supabase backend — fully aligned
- **5 new extractors** added: copperMine, coalMine, lithiumMine, silverMine, goldMine
- **3 combo extractors** replaced with specialized single-resource ones
- **26 missing factories** added across T2-T5 tiers
- **fusionReactor** moved from power to factory category (produces fusionCell)
- **jewelleryForge** now uses refined metals (requires silverRefinery + goldRefinery as upstream)
- **Complete production chains** now possible: silver→refinedSilver→jewellery, gold→refinedGold→jewellery, lithium→battery→powerCell→fusionCell, etc.
- **All T5 content** now has building definitions in frontend fallback
- Save migration already handled (V18: building IDs, V19: missing resources)
