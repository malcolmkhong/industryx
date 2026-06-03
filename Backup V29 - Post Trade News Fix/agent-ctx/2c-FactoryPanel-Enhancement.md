# Task 2c: FactoryPanel Enhancement for 50+ Buildings

## Summary
Improved FactoryPanel.tsx to handle 50+ buildings without visual overload through better tier grouping, enhanced search/filter, building card improvements, production chain enhancements, and a new Storage Upgrades tab.

## Changes Made

### File Modified: `/home/z/my-project/src/components/game/FactoryPanel.tsx`

1. **Tier Color Scheme Updated**
   - TIER_CONFIG: Tier 1=green, Tier 2=cyan, Tier 3=purple, Tier 4=amber
   - TierColor type: `'green' | 'cyan' | 'purple' | 'amber'`
   - getTierColorClasses(): Full color maps with `progressBg`/`progressBar` properties

2. **Tier Header Improvements (Build Tab)**
   - Summary stats: `X built / Y avail / Z locked` (color-coded)
   - Power consumption per tier with Zap icon
   - Colored tier badges (T1-T4)
   - Mini completion progress bar (built/total ratio, tier-colored)
   - Tier card borders use tier color

3. **Enhanced Search/Filter**
   - Resource name search (type "iron" matches buildings producing/consuming iron)
   - "Producing" and "Idle" quick filter buttons
   - Match count indicator in search input
   - FactoryFilter type: added 'producing' | 'idle'

4. **Building Card Improvements**
   - Efficiency dot (green/yellow/red/gray) with tooltip
   - Quick toggle button (Power/PowerOff)
   - Inactive indicator badge ("No power" / "No input: X" / "Offline")

5. **Production Chain Tab Enhancement**
   - Chain completion % computation
   - Tier filter buttons (T0-T4, tier-colored)
   - Color-coded chain borders (green=full, yellow=partial, gray=none)
   - Completion percentage shown on each chain tab

6. **New Storage Upgrades Tab**
   - FactoryTab type: added 'storage'
   - FACTORY_TABS: added storage entry
   - renderStorage(): Tier-grouped resources, capacity bars, x1/x5/x10 bulk upgrades
   - storageUpgradeQty state

## Verification
- ESLint: 0 errors
- Dev server: 200 OK
- All tabs render correctly
