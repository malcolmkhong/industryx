# Task 3: Building Condition / Damage / Repair System

## Agent: full-stack-developer

## Summary
Implemented a complete building condition/damage/repair system for Factory Dominion.

## Files Modified
1. **src/lib/game/types.ts** - Added `BuildingConditionStatus` type, `getConditionStatus()`, `getConditionColor()`, `getConditionStatusLabel()` helper functions, and `condition`, `lastDamageTick`, `deteriorationRate` fields to `BuildingInstance`
2. **src/lib/game/store.ts** - SAVE_VERSION 20→21, V20→V21 migration, condition deterioration in game tick, condition→efficiency penalty, `repairBuilding()`, `repairAllBuildings()`, self-repair automation, event damage, broken building force-inactive, condition fields on all building creation points
3. **src/components/game/HybridMapPanel.tsx** - Condition indicator bar on BuildingTile, wrench icon overlay, broken pulse animation, condition tooltip, condition section in SelectedBuildingDetail, repair button
4. **src/components/game/DashboardPanel.tsx** - Building Condition card with status breakdown by tier, Repair All button with cost display

## Key Design Decisions
- Deterioration rate: 0.01 per 10-tick cycle (very slow, accumulates over time)
- Age factor: up to 3x deterioration after 100k ticks
- Condition penalty: proportional below 75% (condition/75)
- Broken buildings (0%): forced inactive, cannot be toggled on, must be repaired
- Self-repair: 0.1 condition per cycle, 50% of normal repair cost
- Repair cost formula: `baseRepairCost * (100 - condition) / 100 * level`
- Event damage: earthquakes 5-15 points, storms 3-10 points (outdoor only)
- Save migration ensures existing saves work with condition=100 default
