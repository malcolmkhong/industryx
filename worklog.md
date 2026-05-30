# Factory Dominion - Worklog

---
Task ID: 4
Agent: main
Task: Building Management Page - Verification and refinement

Work Log:
- Verified lint passes cleanly (no errors, no warnings)
- Verified dev server compiles without errors
- Used agent-browser for visual verification across all 5 sub-tabs
- Confirmed all features working: Overview table, Health Dashboard, Maintenance Center, Analytics, Log, Alerts
- Confirmed building detail sheet opens correctly with full information
- Confirmed search/filter/sort functionality works
- Confirmed responsive design works on mobile and desktop
- No critical bugs found

Stage Summary:
- Building Management page is fully functional and verified
- All 5 sub-tabs render correctly with real data
- Building detail sheet shows condition, efficiency impact, deterioration factors, repair cost
- Search, filter, sort, and pagination all work
- Maintenance log system records events automatically
- Minor: Radix dialog accessibility warning (cosmetic, low priority)

---
Task ID: 3
Agent: full-stack-developer
Task: Implement building condition/damage/repair system

Work Log:
- Added `BuildingConditionStatus` type and helper functions (`getConditionStatus`, `getConditionColor`, `getConditionStatusLabel`) to types.ts
- Added `condition`, `lastDamageTick`, `deteriorationRate` fields to `BuildingInstance` interface
- Updated `SAVE_VERSION` from 20 to 21 in store.ts
- Added V20→V21 migration that adds condition=100, lastDamageTick=0, deteriorationRate=0.01 to all existing buildings
- Added condition fields to all building creation points: `buildBuilding`, `initialBuildings`, `loadBlueprint`
- Implemented building deterioration in game tick (every 10 ticks): base rate 0.01, affected by age/weather/power overload/workers
- Implemented condition→efficiency penalty: `conditionEfficiency = condition >= 75 ? 1.0 : condition / 75`
- Added `repairBuilding(id)` store action with cost formula: `baseRepairCost * (100 - condition) / 100 * level`
- Added `repairAllBuildings()` store action that repairs all damaged buildings at once
- Implemented self-repair automation: 0.1 condition per tick cycle, 50% of normal cost, auto-deducted
- Added event damage: naturalDisaster damages all buildings 5-15 points every 50 ticks, stormy weather damages outdoor buildings 3-10 points
- Added notifications for critical (<25%) and broken (0%) buildings
- Force broken buildings inactive (condition=0 → forced inactive, can't toggle on)
- Updated `updatedBuildings` to use condition-aware buildings in game tick output
- Added condition indicator bar to BuildingTile component (below efficiency bar, thinner, color-coded)
- Added wrench icon overlay for buildings below 50% condition, broken pulse animation for 0%
- Added condition tooltip info showing condition percentage alongside efficiency
- Added full Condition section in SelectedBuildingDetail with bar, status text, deterioration rate
- Added repair button (🔧 $cost) next to upgrade/toggle buttons, disabled when at 100% or can't afford
- Toggle button disabled for broken buildings (must repair first)
- Added Building Condition card to DashboardPanel with status breakdown by condition tier
- Added Repair All button and total repair cost display in dashboard

Stage Summary:
- Complete building condition/damage/repair system implemented across 4 files
- Buildings now deteriorate over time based on age, weather, power overload, and worker maintenance
- Condition affects production efficiency below 75%
- Broken buildings (0%) are forced inactive and require repair
- Self-repair automation works when unlocked
- Natural disaster events and stormy weather cause periodic building damage
- UI shows condition bars, status indicators, repair costs, and Repair All functionality
- Save migration V20→V21 ensures existing saves load correctly with condition=100
- UX refinements: Changed "damaged" label to "need maintenance", repair button only shows at <95% condition, condition bar made 3px (more visible)

## Session: Logistics Route Rendering Fix (Zoom-Synchronized Coordinate System)

### Project Status
- Game is functional with 66+ buildings, hybrid map system with 5 regions
- The HybridMapPanel is the active map component
- Logistics routes are now properly synchronized with building positions at all zoom levels

### Root Cause Analysis
The logistics route rendering had a **coordinate space desync** during zoom operations caused by:
1. **CSS Transition Desync**: Grid cells used `transition: 'grid-template-columns 0.15s ease'` which animated cell sizes smoothly, but the SVG overlay dimensions/coordinates updated instantly via React state — creating a 150ms gap where routes were misaligned.
2. **Rounding Drift**: `cellSize = Math.round(baseCellSize * zoomPct / 100)` caused sub-pixel rounding differences between the CSS grid (which rounds differently) and the SVG coordinate calculations.
3. **SVG Position Misalignment**: The SVG overlay was positioned as a sibling of the grid+headers structure, but headers took up space that offset the SVG from the grid cells.

### Changes Made

#### 1. Transform-Based Coordinate System (CRITICAL FIX)
**File: `src/components/game/HybridMapPanel.tsx` - GridFactoryView**

- **Architecture Change**: Instead of recalculating all coordinates at each zoom level, the entire grid content (cells + SVG overlay) now renders at a fixed `BASE_CELL_SIZE = 32px` and scales uniformly via CSS `transform: scale(zoomScale)`.
- **Benefits**: 
  - Guarantees pixel-perfect alignment between grid and logistics SVG at ALL zoom levels
  - Browser handles all scaling — no coordinate recalculation needed
  - No rounding drift because both grid and SVG use the same base coordinates
  - Instant zoom changes (no transition desync)
- **Implementation**:
  - `cellSize` is now always `BASE_CELL_SIZE = 32` (never changes with zoom)
  - `zoomScale = zoomPct / 100` is the CSS transform scale factor
  - Grid content wrapper uses `transform: scale(zoomScale)` with `transform-origin: top left`
  - Outer spacer div defines the scrollable area at `(baseSize * zoomScale)`
  - `will-change: transform` for smooth GPU-accelerated rendering

#### 2. Removed CSS Transitions on Grid Template
- Removed `transition: 'grid-template-columns 0.15s ease, grid-template-rows 0.15s ease'` from the CSS grid
- Removed `transition: 'width 0.15s ease'` from column/row headers
- Removed `transition: 'padding-left 0.15s ease'` from column header container
- These transitions caused visual desync during zoom — now zoom is instant and synchronized

#### 3. SVG Overlay Positioning Fix
- SVG overlay is now inside a `relative` wrapper that directly wraps the CSS grid
- This ensures `position: absolute; top: 0; left: 0` on the SVG aligns exactly with the grid cells
- Previously the SVG was a sibling of the grid+headers structure, causing offset

#### 4. Per-Building Connection Distribution
**File: `src/components/game/HybridMapPanel.tsx` - LogisticsSVGOverlay**

- **Anchor Distribution**: When multiple routes connect to the same building, they are now distributed along the building's edge instead of all converging on the same point.
- **`buildingRouteSlots`**: Tracks per-building route count and assigns each route a slot index for even spacing along the edge.
- **Edge-aware distribution**: Routes on left/right edges are distributed vertically; routes on top/bottom edges are distributed horizontally.

#### 5. Junction Indicators at Route Intersections
- **`intersectionPoints`**: Detects where routes between different building pairs cross each other.
- **Visual indicators**: Diamond-shaped junction markers with glow effect at intersection points.
- Uses line-segment intersection math with bounds checking (only mid-segment crossings shown).

#### 6. Enhanced Visual Elements
- **Always-visible anchor dots**: Small dots at route endpoints on building edges (opacity 0.4), larger when highlighted (opacity 0.9 with white stroke)
- **Highlight arrow marker**: Separate `route-arrow-highlight` marker for selected routes
- **Bold throughput labels**: Font weight bold for better readability
- **Consistent scale factor**: `sf` variable for scale-independent sizing (always 1.0 at base, scales via CSS transform)

### Files Modified
- `src/components/game/HybridMapPanel.tsx`: 
  - GridFactoryView: Transform-based zoom, removed CSS transitions, restructured HTML nesting
  - LogisticsSVGOverlay: Per-building anchor distribution, junction indicators, enhanced visuals

### Verification
- Lint passes cleanly (no errors, no warnings)
- Dev server compiles without errors
- VLM visual analysis confirmed: routes properly attach to building edges at 100%, 110%, 140% zoom
- SVG and grid bounding rects match exactly (dx=0, dy=0) at all zoom levels
- Auto-Layout generates routes correctly in all regions

### Known Limitations
- Zoom out below 70% may make routes too small to see clearly (inherent to scaling approach)
- Junction indicators only detect straight-line intersections, not curved path intersections

---

## Session: Map System Redesign (Free Drag + Grid Snap + Logistics Fix)

### Project Status
- Game is functional with 66+ buildings, hybrid map system with 5 regions
- The HybridMapPanel is the active map component
- All regions are unlocked by auto-assign for building placement

### Changes Made

#### 1. Logistics Route System Fix (CRITICAL)
**File: `src/components/game/HybridMapPanel.tsx` - LogisticsSVGOverlay**

- **Anchor-based connection system**: Routes now connect to building EDGES (not just centers). The `getAnchor()` function calculates the intersection point of the direction vector with the building's bounding box, so routes always start/end at the nearest edge.
- **Proper SVG sizing**: SVG overlay now uses exact `gridWidth` and `gridHeight` props (`cols * cellSize`, `rows * cellSize`) instead of `width: 100% / height: 100%`, ensuring pixel-perfect alignment with the CSS grid.
- **Removed CSS grid gap-px**: Changed from `gap-px` to `gap-0` (class `grid` without gap), so SVG coordinates align exactly with grid cell positions. Cell borders are already provided by `border border-gray-800/50` on each cell.
- **Cross-route handling**: Added `routeOffsetMap` that tracks overlapping routes between the same building pairs and applies perpendicular offsets, preventing visual clutter.
- **Scale-independent rendering**: Stroke widths, font sizes, and particle radii now scale with `cellSize / 32` factor, staying visually consistent across zoom levels.
- **Arrow markers**: Added SVG `<marker>` for direction indication on active routes.
- **Anchor dots**: When a route is highlighted, connection anchor points are shown as colored dots on building edges.
- **Memoized route filtering**: `regionRoutes` now uses `useMemo` for better performance.

#### 2. Camera System (Free Movement)
**File: `src/components/game/HybridMapPanel.tsx` - GridFactoryView**

- **Free drag panning**: Left-click drag now works in View and Route modes (no need for Alt/Space). Middle mouse, Alt+click, and Space+click still work in all modes.
- **Scroll wheel zoom**: Normal scroll wheel now zooms (no Ctrl needed). Ctrl+scroll allows normal vertical scrolling for accessibility.
- **Non-passive wheel listener**: Added native `addEventListener('wheel', handler, { passive: false })` to properly prevent default scroll behavior during zoom.
- **Grab cursor**: Shows grab/grabbing cursor in View and Route modes for visual feedback.
- **Smooth zoom**: Zoom center maintains scroll ratio so the point under cursor stays in place.

#### 3. Grid Placement System (Strict Rules)
- Buildings remain locked to grid positions (1×1 to 5×5)
- `autoAssignAllBuildings` sorts by footprint size (largest first) to prevent fragmentation
- Three-tier fallback: preferred region → any matching category → any region
- All regions unlocked during auto-assign
- Grid cells use border for visual separation (no gap needed)

#### 4. Auto-Assign Button Fix
- Added to correct component (`HybridMapPanel.tsx`, not `FactoryMapPanel.tsx`)
- After assigning, auto-switches to region with most buildings
- Uses `useGameStore.getState()` for immediate state access

### Files Modified
- `src/components/game/HybridMapPanel.tsx`: Major changes to LogisticsSVGOverlay, camera system, grid rendering
- `src/lib/game/store.ts`: `autoAssignAllBuildings` action with proper placement logic

### Verification
- Lint passes cleanly (no errors, no warnings)
- Dev server compiles without errors
- Auto-assign tested: 66/66 buildings assigned successfully

---

Task ID: 3
Agent: full-stack-developer
Task: Create Building Management page

Work Log:
- Read existing codebase: types.ts, store.ts, GameSidebar.tsx, page.tsx to understand architecture
- Added MaintenanceLogEntry interface to types.ts with 9 event types (storm_damage, earthquake_damage, power_overload_damage, deterioration, condition_warning, critical_warning, broken, repair, self_repair)
- Added buildingManagement to GameTab type union
- Added maintenanceLog: MaintenanceLogEntry[] to GameState interface
- Updated store.ts SAVE_VERSION from 21 to 22
- Added V21→V22 save migration adding maintenanceLog: [] to existing saves
- Added maintenanceLog: [] to createInitialState()
- Added addMaintenanceLog action to GameActions (keeps last 200 entries, prepends new)
- Added maintenance log entries during game tick: self-repair, critical warnings, broken events, condition warnings, deterioration, earthquake damage, storm damage
- Added maintenance log entries to repairBuilding and repairAllBuildings actions
- Added Building Mgmt tab to GameSidebar Production group (after Workers, using Wrench icon)
- Added BuildingManagementPanel import and case in page.tsx renderPanel()
- Created comprehensive BuildingManagementPanel.tsx with 5 sub-tabs:
  - Overview: 8 summary cards (Total, Healthy, Need Maintenance, Critical, Broken, Avg Condition, Total Repair Cost, Auto-Repair) + Sortable/Filterable building table
  - Maintenance: Repair All button, auto-repair status/toggle, damaged buildings quick-repair list
  - Analytics: Condition Distribution bars, Average Condition SVG gauge, Most Damaged top 5, Highest Deterioration Rate top 5, Breakdown by Type/Region
  - Log: Filterable Damage & Maintenance Log table with event type badges and color-coded rows
  - Alerts: 5 alert groups (Broken, Critical, Damaged, Worn, High Det Rate) with repair and go-to-map quick actions
- Building Detail Sheet (right side panel): condition bar, status badge, operational status, efficiency impact, deterioration factors breakdown, repair cost calculation, location, maintenance status, action buttons

Stage Summary:
- Complete Building Management page with 5 sub-sections and building detail panel
- Maintenance log system automatically records damage/repair events during game tick
- Save migration V21→V22 ensures backward compatibility
- Lint passes, dev server compiles successfully, page loads with BuildingManagementPanel chunk
- Files modified: types.ts, store.ts, GameSidebar.tsx, page.tsx
- Files created: BuildingManagementPanel.tsx (61751 bytes)
