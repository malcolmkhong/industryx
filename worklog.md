# Factory Dominion - Worklog

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
