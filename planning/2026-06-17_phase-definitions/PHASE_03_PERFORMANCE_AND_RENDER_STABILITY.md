# Phase 03 - Performance and Render Stability

## Status: PENDING
## Predecessor: Phase 02 Server Authority and Sync Alignment
## References: ARCHITECTURE_BASELINE_REPORT.md section 4, PHASE_1D_TECHNICAL_DEBT_PLAN.md section 5

---

## Background

From ARCHITECTURE_BASELINE_REPORT.md (verified vs code June 2025):

Issue                                   | ID | File                       | Status
DashboardPanel full-store subscription  | H1 | DashboardPanel.tsx:24      | OPEN - useGameStore() confirmed
Selector library 0% adoption            | -  | src/lib/game/selectors/    | OPEN - 37 selectors, 0 imports
25+ filter chains on every render       | -  | 8+ panels                  | OPEN
No React.memo on leaf components        | -  | PanelStatCard, GameIcon    | OPEN
Missing useCallback on handlers         | -  | 4 panels                   | OPEN
MarketPanel O(n^2) portfolioValue       | -  | MarketPanel.tsx            | OPEN
AchievementPanel 54 nested calls        | -  | AchievementPanel.tsx       | OPEN
Inaccurate rpPerTick calculation        | M4 | DashboardPanel.tsx:99-101  | OPEN
Meaningless storageUtilization          | M5 | DashboardPanel.tsx:155-161 | OPEN
topResources shows only raw materials   | L3 | DashboardPanel.tsx:43      | OPEN

Phase 1D-C claimed these were fixed. No merged code evidence was found.
This phase verifies each claim and implements what is missing.

---

## Objective

Fix the highest-impact render performance issues. H1 (DashboardPanel full-store
subscription causing ~10-100 rerenders/sec) is the top priority. Then systematically
memoize expensive computed values across all heavy panels.

---

## Priority Order

P0 - Immediate render impact (do first):
1. DashboardPanel: replace useGameStore() with ~17 specific selectors
2. DashboardPanel: wrap filter/reduce chains in useMemo
3. FactoryPanel, ResourcePanel, PowerPanel, WorkerPanel, PrestigePanel: useMemo pass
4. Add useCallback to handlers in above panels

P1 - Structural improvements:
1. Add React.memo to PanelStatCard (renders 5-20x per panel)
2. Add React.memo to GameIcon (renders hundreds of times)
3. Activate selector library in top 10 panels (currently 0% adoption)
4. Add completedResearchSet: Set to store for O(1) lookups

P2 - Architectural (can defer to Phase 04):
1. Move achievement computation to store (eliminates 54 calls/render)
2. Move portfolioValue/marketSummary to store (eliminates O(n^2))

---

## Task Breakdown

### 03.1 H1 - DashboardPanel Full-Store Fix

File: src/components/game/DashboardPanel.tsx line 24

Current code:
  const store = useGameStore();
  // then: store.buildings, store.resources, store.money ...

Required: Replace with individual selectors:
  const buildings = useGameStore(s => s.buildings);
  const resources = useGameStore(s => s.resources);
  const money = useGameStore(s => s.money);
  const powerGrid = useGameStore(s => s.powerGrid);
  const researchPoints = useGameStore(s => s.researchPoints);
  const completedResearch = useGameStore(s => s.completedResearch);
  const prestigeState = useGameStore(s => s.prestigeState);
  const workers = useGameStore(s => s.workers);
  const productionSnapshot = useGameStore(s => s.productionSnapshot);
  const market = useGameStore(s => s.market);
  const gameTick = useGameStore(s => s.gameTick);

Also fix during 03.1:
  M4: rpPerTick - use productionSnapshot.researchPointsPerTick not hardcoded formula
  M5: storageUtilization - weight by resource tier cap not simple average
  L3: topResources - include all tiers in top 5 not just raw materials

### 03.2 P0 Panel useMemo Additions

For each panel below, wrap filter/map/reduce/sort in useMemo:
  FactoryPanel.tsx - active buildings, buildings by tier
  ResourcePanel.tsx - resources by tier, auto-sell list
  PowerPanel.tsx - power plants, active consumers
  WorkerPanel.tsx - workers by assignment and type
  PayoutPanel.tsx - payout history sorted
  PrestigePanel.tsx - bonus sums by effect type (7 filter-reduce chains per render)
  FactoryMapPanel.tsx - grid cells, building connections (7+ chains)

Add useCallback to:
  DashboardPanel.handleBuild
  ResourcePanel.handleToggle
  FactoryPanel.handleToggle
  PowerPanel.handleBuild, handleUpgrade, handleToggle

### 03.3 React.memo on Leaf Components

Files: src/components/game/shared/PanelStatCard.tsx
       src/components/game/shared/GameIcon.tsx

Both receive primitive props - ideal React.memo candidates.
Wrap with React.memo and add display name.

### 03.4 Activate Selector Library (Top 10 Panels)

Directory: src/lib/game/selectors/ (37 selectors already written, 0% used)

For top 10 panels by size: replace inline s=>s.prop with named selector imports.
Add missing selectors: selectPowerPercent, selectFactoryEfficiency, selectIncomePerMinute
  (all identified as needed in ARCHITECTURE_BASELINE_REPORT.md section 4.3)

### 03.5 M3 - Fix Hardcoded Income Rates in Tooltip

File: src/app/page.tsx lines 463-467
Current: extractorRate=20, factoryRate=50 (hardcoded, wrong)
Fix: Read from productionSnapshot for real rates.

---

## Deliverables

1. DashboardPanel selector migration complete (H1 closed)
2. P0 useMemo/useCallback pass across all listed panels
3. React.memo on PanelStatCard and GameIcon
4. Selector library adoption >50% in top 10 panels
5. M3/M4/M5/L3 dashboard accuracy fixes
6. planning/PERF_REPORT_PHASE_03.md with before/after evidence

---

## Dependencies

- Phase 01 and 02 complete
- Browser access for profiler validation

---

## Validation

  grep -r 'useGameStore()' src/components/  # must return 0 matches after 03.1
  bun run lint                               # 0 errors

- React DevTools Profiler: DashboardPanel render count per tick drops visibly
- Browser: game still runs correctly, all panels display correct values

## Exit Criteria

- grep 'useGameStore()' src/components/ returns 0 matches (H1 CLOSED)
- All P0 panels have useMemo on expensive derived values
- PanelStatCard and GameIcon wrapped with React.memo
- Selector library adoption >50% in top 10 panels
- M3/M4/M5/L3 fixed
