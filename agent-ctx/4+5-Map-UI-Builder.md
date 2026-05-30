# Task 4+5: Hybrid Map UI Builder

## Task
Build HybridMapPanel component with Region, Grid, and Logistics layers

## Files Created/Modified
- **Created**: `src/components/game/HybridMapPanel.tsx` (~700 lines)
- **Modified**: `src/app/page.tsx` (replaced FactoryMapPanel import with HybridMapPanel)

## Component Structure

### RegionOverviewMap
- Vertical island-style layout with 5 spatially-positioned region cards
- Cosmic (top), Quantum+Highlands (mid split), Industrial (mid), Grasslands (bottom)
- Each card shows: emoji, name, lock/unlock status, building count, color-coded border, bonuses
- Click unlocked region → switch to grid view
- Click locked region → unlock confirmation or notification

### GridFactoryView
- CSS Grid with `grid-template-columns: repeat(cols, cellSize)` 
- Terrain backgrounds: flat (gray-800/40), rocky (amber-900/20), water (blue-900/30), forest (green-900/20), mountain (gray-700/20)
- Buildings rendered as colored blocks spanning footprint (1x1 to 5x5)
- Build mode with placement preview (green=valid, red=invalid)
- Zoom controls, tile bonus indicators
- Right sidebar: BuildPalette or SelectedBuildingDetail

### LogisticsRouteOverlay
- Route list with expand/collapse for details
- Add Route mode: click source → dest → auto-match resource
- Remove route button
- SVG overlay hint

### LogisticsSVGOverlay (exported)
- Bezier curves between building centers
- Animated flow particles along paths
- Color-coded by RESOURCE_META colors
- Route type icons at midpoints

### TopNavBar
- [Region] [Grid] [Logistics] layer tabs
- [View] [Build] [Route] [Demolish] mode buttons
- Breadcrumb with region name
- Back button to return to region overview

## Lint Status
- ✅ Clean (0 errors, 0 warnings)
- ✅ Dev server compiles successfully

## Key Decisions
- Removed useMemo/useCallback to avoid React Compiler lint issues (compiler auto-optimizes)
- Moved early returns after all hooks to satisfy rules-of-hooks
- Reused store actions directly instead of creating new ones
- Used INITIAL_REGIONS fallback for migration (empty mapRegions case)
