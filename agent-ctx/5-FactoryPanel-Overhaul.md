# Task 5: FactoryPanel Overhaul with Tier Grouping, Collapsible Sections, and Search

## Agent: FactoryPanel Overhaul Developer

## Summary
Overhauled the FactoryPanel Build tab from a flat 44+ factory list to an organized, searchable, collapsible tier-grouped layout with visual status distinction.

## Changes Made

### File: `src/components/game/FactoryPanel.tsx`

**New Imports:**
- `Search`, `X`, `Filter`, `ChevronDown` from lucide-react
- `Input` from shadcn/ui
- `useRef` from React

**New Types:**
- `FactoryFilter = 'all' | 'built' | 'available' | 'locked'`

**New State:**
- `searchQuery` - search filter text
- `filterMode` - quick filter mode (all/built/available/locked)
- `collapsedTiers` - which tiers are collapsed (default: Tier 1 expanded, 2-4 collapsed)
- `searchInputRef` - ref for search input

**New Computed Values:**
- `ALL_FACTORY_TYPES` - memoized flat array of all factory types
- `factoryStatusMap` - Map categorizing each factory as built/available/locked
- `buildSummary` - aggregate stats {built, available, locked, powerNeed}
- `toggleTier` - callback for tier collapse toggle

**New renderBuild() Features:**
1. Summary Stats Bar (4 cards): Built, Available, Locked, Power Need
2. Search & Filter Bar: search input with clear button + 4 quick filter buttons
3. Collapsible Tier Sections with Framer Motion animation
4. Visual Status Distinction: Built (green border + badge), Available (normal), Locked (dimmed + overlay)
5. No Results message when search yields nothing

**Preserved:**
- GameItemTooltip on every card
- Production Chain Mini-Diagrams
- Chain Efficiency indicators
- Build buttons
- Active count display

## Verification
- ESLint: 0 errors
- Dev server: Compiles successfully
