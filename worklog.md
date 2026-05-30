# Factory Dominion - Worklog

## Session: Auto-Assign Building Button Fix

### Project Status
- Game is functional with 66+ buildings, hybrid map system with regions, grid, and logistics routes
- The HybridMapPanel is the active map component (NOT FactoryMapPanel which isn't rendered)

### Issue Reported
- User couldn't find the "Auto-Assign Building" button on the factory map
- After adding the button, buildings were not appearing on the grid after clicking auto-assign

### Root Causes Found & Fixed

1. **Wrong component**: Initially added the button to `FactoryMapPanel.tsx`, but the app renders `HybridMapPanel.tsx` (confirmed in `page.tsx` line 295)
   - Fix: Added button to `HybridMapPanel.tsx` toolbar

2. **Overlapping building placement**: The original `autoAssignAllBuildings` passed the same cleared buildings array to `autoAssignBuildingToMap()` for each building. Since all buildings had `regionId: undefined`, the function's internal occupied-cell tracking was always empty, causing buildings to stack on the same cells.
   - Fix: Rewrote the function with inline placement logic using a shared `occupiedCellsMap` that persists across all assignments

3. **Locked regions blocking placement**: `autoAssignBuildingToMap()` checks `region.unlocked`. If the user's save had regions locked, buildings couldn't be assigned to those regions (especially critical for 3×3+ buildings that don't fit in Grasslands' maxBuildingSize: 2)
   - Fix: Auto-assign now unlocks all regions: `state.mapRegions.map(r => ({ ...r, unlocked: true }))`

4. **maxBuildingSize too restrictive**: Grasslands only allows 2×2 buildings, but many buildings are 3×3, 4×4, or 5×5
   - Fix: Auto-assign skips `maxBuildingSize` check and uses 3-tier fallback (preferred → any matching category → any region)

5. **Fragmentation**: Large buildings placed after small ones couldn't find contiguous space
   - Fix: Sort buildings by footprint size (largest first) before assigning

6. **No view switch after assign**: User stayed on a region with no buildings
   - Fix: After auto-assign, automatically switch to the region with the most buildings using direct `useGameStore.setState()`

### Files Modified
- `src/lib/game/store.ts`: Added `autoAssignAllBuildings` action to GameActions interface and implementation
- `src/components/game/HybridMapPanel.tsx`: Added Auto-Assign button with MapPin icon in toolbar
- `src/components/game/FactoryMapPanel.tsx`: Also added button there (less important since component isn't rendered)

### Verification
- Lint passes cleanly
- Dev server compiles without errors
- Agent-browser test confirmed: 66/66 buildings auto-assigned, 23 visible in Grasslands, toast notification appears
- Buildings render correctly on the grid with emoji icons and proper positioning
