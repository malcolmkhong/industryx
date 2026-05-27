# Task 1+2: Save Migration & Stats Developer

## Task A: Save Version Migration System
- Added `SAVE_VERSION = 2` constant at top of `/src/lib/game/store.ts`
- Added `migrateSaveState()` function that:
  - Checks `savedState._version` (defaults to 1 if missing)
  - V1→V2: Adds `megaProjects` (from INITIAL_MEGA_PROJECTS) and `productionHistory` (empty array)
  - Updates `_version` to current after all migrations
- Added `version: 2` and `migrate` option to Zustand persist config
- Added `_version: SAVE_VERSION` to partialize function
- Updated `exportSave` to use `SAVE_VERSION` instead of hardcoded `1`

## Task B: Statistics/History Panel
- Added `productionHistory` to `GameState` interface in types.ts
- Added `'statistics'` to `GameTab` type in types.ts
- Added `productionHistory: []` to `createInitialState()` in store.ts
- Added production history snapshot every 50 ticks (keeps last 200 entries)
- Added `productionHistory` to partialize and set() in tick action
- Created `/src/components/game/StatisticsPanel.tsx` with:
  - Time range selector (50/100/200 data points)
  - Money Accumulation SVG line chart
  - Power Grid SVG area chart
  - Efficiency Timeline SVG chart
  - Top Resources SVG line chart
  - Resource Summary Table
  - Quick Stats Cards
- Added statistics tab to page.tsx TABS, MOBILE_MORE_TABS, and renderPanel()

## Verification
- `bun run lint` passes cleanly
- Dev server compiles successfully
