# Task 10a+10c: Bulk Build Mode & Factory Efficiency Breakdown

## Summary
Implemented two major features for the Factory Dominion game:

### Feature A: Bulk Build Mode
- **Store changes** (`src/lib/game/store.ts`):
  - Added `buildBuildingBulk(type: BuildingType, count: number)` action to GameActions interface
  - Implementation calculates total cost for K buildings using cost multiplier: `baseCost * costMultiplier^(currentCount + i)` for i = 0..K-1
  - Partial fulfillment: if can't afford all, builds as many as affordable
  - Toast notification: "Built 5 Smelters!" or "Built 3/10 Smelters" for partial
  - Added `getBulkBuildCost(type, currentCount, count)` helper function
  - Added `getMaxAffordableBuilds(type, currentCount, money)` helper function (capped at 100)
  - Both helpers exported from store.ts

- **FactoryPanel.tsx Build tab changes**:
  - Added `buildQuantity` state (1 | 5 | 10 | 'max') for global quantity selector
  - Added quantity selector buttons (x1, x5, x10, MAX) on each factory build card
  - x1 is default (preserves existing behavior)
  - x5 shows cost for 5 buildings with cost multiplier applied
  - x10 shows cost for 10 buildings  
  - MAX calculates and shows how many the player can afford with count display
  - Cost display updates dynamically based on selected quantity
  - Build button text changes: "Build" (x1) or "Build x5" (bulk)
  - Tooltip shows both single and bulk costs when quantity > 1
  - Disabled buttons for quantities player can't afford

### Feature B: Factory Efficiency Breakdown
- **Active tab changes** (`src/components/game/FactoryPanel.tsx`):
  - Added expandable "Efficiency Breakdown" section at bottom of each factory card
  - Calculates four efficiency factors per building:
    1. **Power Efficiency**: `powerGrid.efficiency` (drops when overloaded)
    2. **Transport Efficiency**: Active lines → 90-100%, inactive lines → 70%, no lines → 100%
    3. **Worker Bonus**: Cumulative speed bonus from assigned workers; baseline if none
    4. **Input Supply**: % of inputs with stock >= required amount
  - All values match the actual game tick calculations

- **EfficiencyFactor sub-component**:
  - Shows icon, label, percentage, detail text, and small progress bar
  - Color coding: green (>=80%), yellow (>=50%), red (<50%)
  - Worker bonus: cyan (>100%), green (baseline 100%)
  - Compact layout with 7-8px text
  - Detail text explains WHY (e.g., "2/3 inputs available", "Grid overloaded")

- **UX**:
  - Toggle button with chevron rotation animation
  - AnimatePresence for smooth expand/collapse
  - `expandedEfficiency` Set tracks which cards are expanded

## Files Modified
1. `src/lib/game/store.ts` - buildBuildingBulk action, getBulkBuildCost, getMaxAffordableBuilds
2. `src/components/game/FactoryPanel.tsx` - Bulk build UI, efficiency breakdown UI, EfficiencyFactor component

## Verification
- ESLint: 0 errors
- Dev server: compiles successfully
