# Task 6: ResourcePanel Overhaul with Extractor Grouping and Net Production Display

## Agent: ResourcePanel Overhaul Developer

## Status: COMPLETED

## Summary
Completely rewrote ResourcePanel.tsx with 4 major features: extractor grouping by operation type, net production/consumption display per resource, resource summary bar with bottleneck warnings, and collapsible sections.

## Changes Made
- **File**: `src/components/game/ResourcePanel.tsx` - Complete rewrite

## Key Features Implemented

### A) Extractor Grouping
9 operation groups with unique colors:
- Mining Operations (amber) → Mining Drill → iron, copper, coal
- Oil Operations (orange) → Oil Pump → oil
- Water Operations (blue) → Water Extractor → water
- Quarry Operations (stone) → Quarry → sand, lithium, rareEarth
- Farm Operations (green) → Farm → organic, rubber
- Deep Mining (lime) → Deep Drill → uranium, titanium
- Bauxite Mining (slate) → Bauxite Miner → aluminium, silicon
- Air Processing (cyan) → Air Separator → nitrogen, sulfur
- Volcanic Harvesting (yellow) → Sulfur Vent → sulfur

### B) Net Production Display
- Production rates from store.computedProductionRates (green)
- Consumption rates from store.computedConsumptionRates (red)
- Net = production - consumption shown per resource
- Time-to-fill/deplete calculations

### C) Resource Summary Bar
- Always visible above tabs
- Total production rate badge
- Bottleneck warnings (⚠️ red chips for negative net resources)
- Quick strip with emoji + net rate per active resource
- Tooltips on each resource chip

### D) Collapsible Sections
- Framer Motion animated expand/collapse
- Auto-expand sections with built extractors
- Chevron rotation indicator
- Build button in each section header

### Tab Reorganization
- 4 tabs → 3 tabs (Operations, Active, Storage)
- Operations combines Overview + Build

## Verification
- ESLint: 0 errors
- Dev server: compiles successfully
