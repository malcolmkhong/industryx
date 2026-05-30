---
Task ID: 3
Agent: full-stack-developer
Task: Create Building Management page

Work Log:
- Read existing codebase: types.ts, store.ts, GameSidebar.tsx, page.tsx
- Added `MaintenanceLogEntry` interface to types.ts with event types: storm_damage, earthquake_damage, power_overload_damage, deterioration, condition_warning, critical_warning, broken, repair, self_repair
- Added `buildingManagement` to `GameTab` type union
- Added `maintenanceLog: MaintenanceLogEntry[]` to `GameState` interface
- Updated store.ts: incremented SAVE_VERSION from 21 to 22
- Added V21→V22 save migration to add `maintenanceLog: []` to existing saves
- Added `maintenanceLog: []` to initial state in `createInitialState()`
- Added `addMaintenanceLog` action to GameActions interface and implementation (keeps last 200 entries)
- Added maintenance log calls throughout game tick:
  - Self-repair logging when selfRepair automation is active
  - Critical warning logging when building drops to critical (<25%)
  - Broken event logging when building condition hits 0
  - Condition warning logging when building drops below thresholds
  - Deterioration logging for significant condition loss
  - Earthquake damage logging for each building affected
  - Storm damage logging for outdoor buildings
- Added maintenance log calls to repairBuilding and repairAllBuildings actions
- Added BuildingManagementPanel tab to GameSidebar in Production group (after Workers)
- Added import and case for BuildingManagementPanel in page.tsx renderPanel switch
- Created comprehensive BuildingManagementPanel.tsx with 5 sub-tabs:
  - Overview: Health Dashboard (8 summary cards) + Building Overview Table (sortable, filterable)
  - Maintenance: Repair All button, auto-repair status, damaged building quick repair list
  - Analytics: Condition Distribution bars, Average Condition gauge, Most Damaged, Highest Det Rate, Breakdown by Type/Region
  - Log: Filterable Damage & Maintenance Log table with color-coded rows
  - Alerts: Grouped alert sections (Broken, Critical, Damaged, Worn, High Det Rate) with quick actions
- Building Detail Sheet with: condition bar, status badge, operational status, deterioration factors breakdown, repair cost breakdown, location, maintenance status, action buttons

Stage Summary:
- Building Management page fully implemented with 5 sub-sections
- Maintenance log system added to game store with automatic event recording
- Save migration V21→V22 ensures backward compatibility
- All lint checks pass, dev server compiles successfully
- Files modified: types.ts, store.ts, GameSidebar.tsx, page.tsx
- Files created: BuildingManagementPanel.tsx
