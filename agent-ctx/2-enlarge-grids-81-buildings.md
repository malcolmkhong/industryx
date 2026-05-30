# Task 2: Enlarge Map Grids and Auto-Place All Buildings

## Work Summary
- Updated BUILDING_FOOTPRINTS with new sizing scheme per task spec (1×1 to 5×5)
- Enlarged INITIAL_REGIONS grid sizes (grasslands 30×30, industrial 25×25, highlands 25×25, quantum 20×20, cosmic 25×25)
- Updated quantum maxBuildingSize from 4 to 5 (to allow 5×5 buildings as fallback)
- Set all 5 regions to unlocked: true
- Bumped SAVE_VERSION from 19 to 20
- Added V19→V20 migration that regenerates grids, unlocks all regions, re-assigns buildings, updates grid tiles, regenerates logistics routes
- Initialized all 66 building types in createInitialState with auto-placement on the map
- Active by default: extractors + basic power (coal/solar/wind)
- Inactive by default: all factories (need inputs) + advanced power (nuclear/fusion/antimatter)
- Lint passes clean, compiles successfully
