# Task ID: 1 - Store Map Integration

## Task: Auto-assign buildings to regions/grid, auto-generate logistics routes, update migration

### Changes Made

#### 1. `autoAssignBuildingToMap` Helper Function (store.ts, lines ~159-263)
- Added `getPreferredRegionOrder(buildingType)` that returns ordered region list based on building category/tier:
  - 5×5 buildings: cosmic → quantum → highlands → industrial → grasslands
  - Extractors: grasslands only
  - T0 power: grasslands only
  - T2 power/factory: industrial → grasslands
  - T3 power/factory: highlands → industrial → grasslands
  - T4 power/factory: quantum → highlands → industrial → grasslands
- Added `autoAssignBuildingToMap(buildingType, buildings, mapRegions, mapGrids)`:
  - Gets building footprint and preferred region order
  - Iterates regions in preference order, checking unlock status, category, and size constraints
  - Builds occupied cell set from existing buildings in the region
  - Scans grid left-to-right, top-to-bottom for first available position
  - Avoids water tiles and occupied cells
  - Returns `{regionId, gridRow, gridCol}` or null

#### 2. Modified `buildBuilding` Action (store.ts, lines ~1847-1894)
- Calls `autoAssignBuildingToMap` before creating building instance
- Sets `regionId`, `gridRow`, `gridCol` on new BuildingInstance
- Updates mapGrids to mark tiles as occupied by the new building
- Notification includes region name when assigned

#### 3. `autoGenerateLogisticsRoutes` Action (store.ts, lines ~3003-3106)
- Added to GameActions interface
- Implementation iterates active buildings with inputs
- For each input resource, finds closest active building that outputs that resource
- Route type based on distance: conveyor (≤3), truck (≤8), train (≤15), drone (>15)
- Cross-region routes use drone type with 0.5 efficiency
- Efficiency: max(0.3, 1 - dist * 0.05)
- Throughput = output rate × efficiency
- Skips duplicate routes

#### 4. V17→V18 Migration (store.ts, lines ~662-842)
- Ensures map system fields exist (mapRegions, mapGrids, logisticsRoutes)
- Auto-assigns existing buildings without regionId using `autoAssignBuildingToMap`
- Updates grid tiles to reflect occupied cells
- Auto-generates logistics routes for all active producer→consumer pairs
- SAVE_VERSION bumped from 17 to 18

### Files Modified
- `/home/z/my-project/src/lib/game/store.ts` - All changes made here

### Verification
- `bun run lint` passes with 0 errors, 0 warnings
- Dev server compiles successfully
