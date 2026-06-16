# IndustriaX — Phase 2: UI Architecture Blueprint

> **Version**: 1.0  
> **Date**: 2025-01-13  
> **Authors**: Principal UI/UX Designer + Product Designer + Design System Architect + Frontend UX Engineer  
> **Status**: DRAFT — Design Only, No Implementation  
> **STATUS NOTICE — SUPERSEDED**  
> This document has been classified as **SUPERSEDED** in `planning/DOCUMENT_INVENTORY.md` (June 2026 audit).  
> Date written: 2025-01-13. Status was "DRAFT — Design Only, No Implementation."  
> Never implemented. For the canonical project status, see [PROJECT_STATUS_SOURCE_OF_TRUTH.md](./PROJECT_STATUS_SOURCE_OF_TRUTH.md).

---

## Table of Contents

1. [Target UI Architecture](#1-target-ui-architecture)
2. [Shared Component Hierarchy](#2-shared-component-hierarchy)
3. [Design Token Structure](#3-design-token-structure)
4. [Desktop Strategy](#4-desktop-strategy)
5. [Tablet Strategy](#5-tablet-strategy)
6. [Mobile Strategy](#6-mobile-strategy)
7. [Information Hierarchy Strategy](#7-information-hierarchy-strategy)
8. [Navigation Strategy](#8-navigation-strategy)
9. [Reusable Component Standards](#9-reusable-component-standards)
10. [Implementation Roadmap](#10-implementation-roadmap)

---

## Prequel: Industry Game Comparison

Before defining the architecture, we must ground our decisions in how successful games in our genre solve the same problems.

### Reference Game Analysis

| Game | Genre | Navigation | Info Density | Mobile Layout | Resource Display | Build Flow | Progression Visibility |
|------|-------|-----------|-------------|---------------|-----------------|------------|----------------------|
| **AdVenture Communist** | Idle/Incremental | Vertical tabs (left sidebar on desktop, bottom tabs on mobile) | Low — one resource chain per screen | Single-column, scroll per industry | Single large number per resource | Tap to buy, auto-unlock | Milestone bars, prestige timer |
| **Idle Factory Tycoon** | Idle/Factory | Bottom tab bar (5 items) + swipe between factories | Medium — one factory view at a time | Full-screen factory view with overlay stats | Compact badges at top | Tap factory slot → select from list | Progress bars on each factory, prestige counter |
| **Factorio** (Desktop) | Factory Sim | Top bar + keyboard shortcuts + map overlay | Very high — entire factory visible at once | N/A (desktop-only) | Production graph overlay | Click place from inventory | Production statistics panel |
| **Satisfactory** (Desktop) | Factory Sim | HUD + build mode radial menu | High — first-person 3D + HUD | N/A (desktop-only) | HUD sidebar + inventory | Build gun + radial menu | Milestone tiers, hub progress |
| **Egg Inc** | Idle/Clicker | Bottom nav (4 tabs) + hamburger | Low — one screen at a time | Full-screen single focus | Large central counter | Tap-to-buy list | Prestige egg display, prophecy |
| **Reactor Idle** | Idle/Factory | Tab-based (5 tabs across top) | Medium — grid map + stats sidebar | Responsive grid | Top bar with money/power | Click grid cell → build menu | Research tree, prestige tier |
| **Universal Paperclips** | Incremental | Section-based (auto-scroll) | Low→High — unfolds over time | Single-column progressive | Simple counters | Button-driven | Stage transitions, milestone unlocks |

### Key Patterns That Work in Our Genre

1. **Progressive Disclosure**: Successful incremental games start simple and reveal complexity as the player progresses (Universal Paperclips, Egg Inc). IndustriaX already has 25 tabs visible from the start — this is **anti-pattern** for idle games.

2. **One-Focus Screens**: The most successful mobile idle games show ONE primary interaction per screen (Egg Inc, AdVenture Communist). IndustriaX's Dashboard tries to show 10+ systems simultaneously.

3. **Bottom Navigation for Core Loops**: Every successful mobile idle game uses bottom nav for 4-5 primary actions. IndustriaX has 7 groups in bottom nav — this exceeds the cognitive limit.

4. **Persistent Resource Bar**: All successful games show core currencies (money/power) persistently at the top. IndustriaX does this correctly.

5. **Build-as-Primary-Action**: In factory games, the build action is the #1 interaction. The fastest path from "I want to build" to "building placed" is 3-4 taps in IndustriaX vs 1-2 in competitors.

6. **Prestige Prominence**: When prestige is available, successful games make it visually prominent and explain the benefit clearly (Egg Inc's "Prestige Now" overlay).

### Where IndustriaX Should INTENTIONALLY Diverge

1. **Depth of Production Chains**: Our 78-resource, 6-tier chain system is far more complex than any competitor. We need a Production Chain Viewer that competitors don't have. This justifies a more complex UI for mid/late game.

2. **Transport System**: No idle game competitor has a transport/conveyor system. This is a differentiator but requires its own dedicated screen with visual representation.

3. **Market Simulation**: Our 3-layer market (MVIL + News + Narrative) is unique. This justifies a dedicated Market screen with sub-views.

4. **Real-time Online/Leaderboard**: Social features are a strength that competitors lack. Leaderboard deserves prominent placement.

---

## Prequel: Gameplay Flow Analysis

Understanding WHERE players spend time determines WHERE we invest in UI quality.

### First 5 Minutes

**Current Flow**: Page loads → Loading skeleton → Dashboard (10 sections) → Player is overwhelmed

**Player Actions (Ideal)**: 
1. See money counter ($1,000) — understand the currency
2. Build first extractor (iron mine) — understand building
3. See iron accumulating — understand production
4. Build first factory (smelter) — understand processing
5. See iron→iron plate chain — understand the core loop

**Current Pain Points**:
- Dashboard shows 10+ sections; new player doesn't know what to look at
- No guided tutorial — OnboardingPanel exists but is hidden in "Rewards" group
- Build flow requires: Click "Production" group → Click "Resources" tab → Find iron mine → Click build
- That's 4 taps minimum to first meaningful action

**Business Impact**: If first-5-min retention < 30%, all other UI improvements are moot.

### First 30 Minutes

**Player State**: ~5 extractors, 2-3 factories, first research started, ~50k money

**Primary Activities**:
1. Building extractors and factories (60% of clicks)
2. Checking resource counts (20% of clicks)
3. Starting research (10% of clicks)
4. Exploring other tabs (10% of clicks)

**Current Pain Points**:
- Resource panel and Factory panel are separate tabs — player switches between them constantly
- No "quick build" from the resource view — must navigate to factory tab
- No connection between "I need more iron" → "Build iron mine" flow
- Transport system not yet needed but visible in nav, causing confusion

### First Prestige (Typical: 2-4 hours)

**Player State**: ~20 buildings, T2 unlocked, first mega project started, ~500k money earned

**Primary Activities**:
1. Managing production chains (40% of clicks)
2. Market trading for income (20%)
3. Research progression (15%)
4. Contract fulfillment (15%)
5. Considering prestige (10%)

**Current Pain Points**:
- Prestige is buried in "Progression" group — should be contextually prompted
- No "what will I gain/lose" quick preview without navigating to PrestigePanel
- Production chain bottlenecks are hard to identify (no bottleneck highlighting in main view)
- Must navigate to GlobalResourceMonitor to see bottleneck data

### Mid-Game (5-20 hours)

**Player State**: Post-first prestige, T3 buildings, active market trading, multiple contracts

**Primary Activities**:
1. Optimizing production chains (35%)
2. Market trading (25%)
3. Managing transport lines (15%)
4. Research and automation (15%)
5. Mega projects (10%)

**Current Pain Points**:
- Transport panel is 2,319 lines — complex but essential; needs visual simplification
- No way to see "all production at a glance" without the Dashboard's cramped view
- Worker assignment requires navigating to Worker panel, selecting building from dropdown — tedious
- Auto-sell configuration requires visiting Market panel, not Resource panel

### Late Game (20+ hours)

**Player State**: Multiple prestiges, T4-T5 buildings, endgame passive income, mega projects completing

**Primary Activities**:
1. Checking passive income (30%)
2. Mega project management (25%)
3. Market optimization (20%)
4. Leaderboard competition (15%)
5. Blueprint management (10%)

**Current Pain Points**:
- No "idle income summary" — how much am I making per minute total?
- Leaderboard doesn't show relative progress (how far to next rank?)
- Blueprint system is basic — no visual layout preview
- Settings become more important (speed, auto-save) but are buried in "System" group

### Click/Tap Count Analysis

| Flow | Current Taps | Target Taps | Reduction |
|------|-------------|-------------|-----------|
| Build first extractor | 4 | 2 | 50% |
| Check resource count | 2 (switch tab + find) | 0 (always visible) | 100% |
| Start research | 3 | 2 | 33% |
| Trade on market | 3 | 2 | 33% |
| Fulfill contract | 4 | 2 | 50% |
| Check bottleneck | 5 | 1 | 80% |
| Prestige | 5 | 3 | 40% |
| Assign worker | 5 | 3 | 40% |
| Toggle auto-sell | 4 | 2 | 50% |

**Total estimated click reduction from architecture changes: ~45%**

---

## 1. Target UI Architecture

### 1.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    INDUSTRIAX UI LAYER CAKE                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Layer 4: SCREEN COMPOSER (page.tsx orchestrator)           │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  HeaderComposer  │  PanelComposer  │  NavComposer    │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  Layer 3: PANEL FRAMEWORK (shared panel shell)               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  PanelShell  │  PanelHeader  │  PanelBody  │  FAB    │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  Layer 2: COMPOSITE COMPONENTS (domain-specific assemblies)  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  BuildingCard  │  ResourceBar  │  StatCard  │  etc.  │    │
│  │  ChainViewer   │  PriceChart   │  FlowGraph │  etc.  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  Layer 1: PRIMITIVE COMPONENTS (design system atoms)         │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Button  │  Badge  │  Progress  │  Tooltip  │  etc.  │    │
│  │  Icon    │  Card   │  Dialog    │  Sheet    │  etc.  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  Layer 0: DESIGN TOKENS (CSS custom properties)              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Colors  │  Spacing  │  Typography  │  Motion  │ etc.│    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Architecture Principles

| # | Principle | Rationale |
|---|-----------|-----------|
| 1 | **Game-State-Driven Rendering** | UI derives from `productionSnapshot` (SSoT), never from computed-in-render |
| 2 | **Selective Store Subscriptions** | Every component subscribes to ONLY the state slice it needs |
| 3 | **Progressive Disclosure** | Show fewer options early, reveal complexity as player progresses |
| 4 | **Mobile-First, Desktop-Enhanced** | Design for 375px first, enhance for 1280px+ |
| 5 | **2-Click Core Loops** | Primary actions (build, trade, research) achievable in ≤2 taps |
| 6 | **Panel = Feature Module** | Each panel is a self-contained feature with clear boundaries |
| 7 | **Token-First Styling** | All values come from design tokens, never hardcoded |
| 8 | **Shared Before Custom** | Use shared components; create new ones only when ≥3 panels need it |
| 9 | **Graceful Degradation** | Mobile isn't "less desktop" — it's a focused experience |
| 10 | **Accessibility by Default** | Min 14px text, 44px touch targets, ARIA on all interactive elements |

### 1.3 Target File Architecture

```
src/
├── app/
│   ├── page.tsx                    # Slim orchestrator (<300 lines)
│   ├── globals.css                 # Design tokens ONLY (<200 lines)
│   └── layout.tsx
│
├── components/
│   ├── game/
│   │   ├── layout/                 # NEW: Layout system
│   │   │   ├── GameShell.tsx       # Root layout with header/nav/panel slots
│   │   │   ├── GameHeader.tsx      # Unified header (desktop + mobile)
│   │   │   ├── GameSidebar.tsx     # Desktop sidebar (nav data only)
│   │   │   ├── BottomNavigationBar.tsx  # Mobile bottom nav
│   │   │   └── NavData.ts          # Navigation structure (extracted)
│   │   │
│   │   ├── panels/                 # NEW: Organized panel directory
│   │   │   ├── overview/           # Dashboard, FactoryMap, ResourceMonitor, Guide
│   │   │   ├── production/         # Resources, Factories, Storage, Power, Workers
│   │   │   ├── logistics/          # Transport, Market, Contracts, Drones, TradePost
│   │   │   ├── progression/        # Research, Automation, Prestige, MegaProjects
│   │   │   ├── rewards/            # Quests, Achievements, Daily, Leaderboard, Events
│   │   │   ├── finance/            # Payouts, Notifications
│   │   │   └── system/             # Statistics, Blueprints, Settings
│   │   │
│   │   ├── shared/                 # Existing + expanded
│   │   │   ├── GameCard.tsx
│   │   │   ├── GameIcon.tsx
│   │   │   ├── GameItemTooltip.tsx
│   │   │   ├── PanelStatCard.tsx
│   │   │   ├── LoadingSpinner.tsx
│   │   │   ├── tierColors.ts
│   │   │   ├── useReducedMotion.ts
│   │   │   ├── IconPreloader.tsx
│   │   │   ├── index.ts            # NEW: Barrel export
│   │   │   └── ...
│   │   │
│   │   ├── composites/             # NEW: Domain-specific assemblies
│   │   │   ├── BuildingCard.tsx    # Shared extractor/factory card
│   │   │   ├── ResourceBar.tsx     # Unified progress/fill bar
│   │   │   ├── PanelHeader.tsx     # Standardized panel header
│   │   │   ├── PanelShell.tsx      # Panel wrapper with consistent chrome
│   │   │   ├── SectionHeader.tsx   # Repeated section heading pattern
│   │   │   ├── StatRow.tsx         # Row of stat cards
│   │   │   ├── EmptyState.tsx      # "No X yet" pattern
│   │   │   ├── TierTabBar.tsx      # Tier selection tabs (T0-T5)
│   │   │   ├── PriceTag.tsx        # Cost display with icon
│   │   │   ├── ResourceBadge.tsx   # Compact resource count display
│   │   │   ├── CurrencyDisplay.tsx # Money/RP/CP with formatting
│   │   │   ├── ProductionIO.tsx    # Input→Output display for buildings
│   │   │   └── BottleneckAlert.tsx # Warning card for production issues
│   │   │
│   │   ├── feedback/               # NEW: Visual feedback components
│   │   │   ├── CelebrationOverlay.tsx
│   │   │   ├── FloatingNumbers.tsx
│   │   │   ├── GameToast.tsx
│   │   │   ├── AmbientParticles.tsx
│   │   │   └── CloudSyncBlockBanner.tsx
│   │   │
│   │   └── FloatingActionButton.tsx
│   │
│   ├── providers/
│   │   ├── AuthProvider.tsx
│   │   └── GameConfigProvider.tsx
│   │
│   └── ui/                         # shadcn/ui primitives (unchanged)
│       ├── button.tsx
│       ├── card.tsx
│       └── ... (28 components)
│
├── lib/
│   ├── game/
│   │   ├── store.ts                # Game state (Zustand)
│   │   ├── settingsStore.ts        # Settings state
│   │   ├── selectors/              # NEW: Named selectors
│   │   │   ├── index.ts
│   │   │   ├── resourceSelectors.ts
│   │   │   ├── buildingSelectors.ts
│   │   │   ├── marketSelectors.ts
│   │   │   ├── powerSelectors.ts
│   │   │   └── progressionSelectors.ts
│   │   └── ...
│   │
│   ├── hooks/
│   │   ├── useCloudSync.ts
│   │   ├── useOnlinePresence.ts
│   │   └── useGameTick.ts          # NEW: Extracted game loop
│   │
│   └── theme/
│       ├── tokens.ts               # NEW: JS-accessible design tokens
│       └── animations.ts           # NEW: Animation constants
│
└── styles/
    ├── animations.css               # NEW: Extracted animation keyframes
    ├── components.css               # NEW: Component-specific styles
    └── utilities.css                # NEW: Utility classes
```

---

## 2. Shared Component Hierarchy

### 2.1 Component Dependency Graph

```
Design Tokens (Layer 0)
    │
    ▼
Primitive Components (Layer 1)
    ├── shadcn/ui: Button, Badge, Card, Dialog, Sheet, Tabs, Tooltip,
    │              Progress, Input, Select, Switch, Slider, Separator
    ├── GameIcon (iconify wrapper)
    └── LoadingSpinner
    │
    ▼
Composite Components (Layer 2)
    ├── PanelShell ─────── uses Card + animation
    ├── PanelHeader ────── uses GameIcon + Badge + neon-glow
    ├── PanelStatCard ──── uses GameIcon + Card
    ├── StatRow ────────── uses PanelStatCard[] (responsive grid)
    ├── ResourceBar ────── uses Progress + color-threshold utility
    ├── BuildingCard ───── uses GameIcon + ResourceBar + PriceTag + GameItemTooltip
    ├── SectionHeader ──── uses GameIcon
    ├── EmptyState ─────── uses GameIcon
    ├── TierTabBar ─────── uses Button + tierColors
    ├── PriceTag ───────── uses CurrencyDisplay + GameIcon
    ├── ResourceBadge ──── uses GameIcon + Badge
    ├── CurrencyDisplay ── uses formatting utils
    ├── ProductionIO ───── uses ResourceBadge[] + GameIcon
    └── BottleneckAlert ── uses GameIcon + Badge
    │
    ▼
Panel Components (Layer 3)
    ├── DashboardPanel ─── uses PanelShell, PanelHeader, StatRow, BuildingCard, ResourceBar
    ├── FactoryPanel ───── uses PanelShell, PanelHeader, TierTabBar, BuildingCard, ProductionIO
    ├── ResourcePanel ──── uses PanelShell, PanelHeader, TierTabBar, BuildingCard, ProductionIO
    ├── MarketPanel ────── uses PanelShell, PanelHeader, StatRow, ResourceBar, PriceTag
    ├── ResearchPanel ──── uses PanelShell, PanelHeader, ResourceBar, PriceTag
    ├── ... (25 panels)
    │
    ▼
Layout Components (Layer 4)
    ├── GameShell ───────── uses GameHeader, GameSidebar, BottomNavigationBar
    ├── GameHeader ──────── uses CurrencyDisplay, ResourceBadge, GameIcon
    ├── GameSidebar ─────── uses NavData, GameIcon
    └── BottomNavigationBar uses NavData, GameIcon, AnimatePresence
```

### 2.2 Composite Component Specifications

#### PanelShell
```
Purpose: Consistent panel wrapper with entry animation, background, and padding
Props:
  - children: ReactNode
  - className?: string
  - variant?: 'default' | 'compact' | 'full-height'
  - animate?: boolean (default: true)
  - scrollable?: boolean (default: true)
Behavior:
  - Applies game-card bg, border, padding consistently
  - Handles entry animation (fade + slide up)
  - Full-height variant fills parent with flex column
  - Compact variant uses p-3 instead of p-4
  - Scrollable adds max-height + overflow + custom scrollbar
Replaces: 50+ instances of `game-card rounded-xl bg-card p-4 border border-border`
```

#### PanelHeader
```
Purpose: Standardized panel title with icon, color, subtitle, and action slot
Props:
  - title: string
  - icon?: string (GameIcon id)
  - color?: TierColor | StatColor (unified)
  - subtitle?: string
  - badge?: string | number
  - actions?: ReactNode (right-aligned slot)
  - className?: string
Behavior:
  - Renders h2 with neon-glow effect matching color
  - Optional icon at left
  - Badge (e.g., building count) as pill
  - Actions slot for buttons/filters
Replaces: 29 instances of `<h2 className="text-xl font-bold text-{color}-400 neon-glow-...">`
```

#### ResourceBar
```
Purpose: Unified progress/fill bar with color thresholds and labels
Props:
  - value: number (0-100 percentage)
  - max?: number (for absolute display)
  - label?: string
  - showPercentage?: boolean
  - colorThresholds?: 'default' | 'danger' | 'inverse'
  - size?: 'xs' | 'sm' | 'md' | 'lg'
  - animated?: boolean
  - className?: string
Color Logic (default):
  - 0-50%: green (healthy)
  - 50-70%: yellow (warning)
  - 70-90%: orange (high)
  - 90-100%: red (critical)
Inverse Logic (for efficiency):
  - 90-100%: green (good)
  - 70-90%: yellow
  - 50-70%: orange
  - 0-50%: red (bad)
Replaces: ~40 independently implemented progress bars across 15 panels
```

#### BuildingCard
```
Purpose: Unified card for extractor/factory display with build/upgrade/toggle actions
Props:
  - building: BuildingDefinition
  - instance?: BuildingInstance (null = not yet built)
  - onBuild?: (id: string) => void
  - onUpgrade?: (id: string) => void
  - onToggle?: (id: string) => void
  - showEfficiency?: boolean
  - compact?: boolean (mobile mode)
  - recentlyBuilt?: boolean (animation trigger)
Behavior:
  - Tier-colored left accent + icon
  - Name + level badge
  - ProductionIO (inputs → outputs)
  - Cost display with PriceTag
  - Build/Upgrade/Toggle buttons
  - Efficiency bar when active
  - Compact mode: icon + name + one-line stats only
Replaces: Duplicated build cards in FactoryPanel + ResourcePanel (~800 lines shared)
```

#### StatRow
```
Purpose: Responsive grid of PanelStatCards
Props:
  - stats: Array<{ icon, label, value, subtext, color, trend }>
  - columns?: { sm: 2, md: 4 } (responsive)
Behavior:
  - Renders PanelStatCard in responsive grid
  - Consistent 2-col mobile → 4-col desktop layout
Replaces: 15 panels with hand-coded stat grids
```

#### SectionHeader
```
Purpose: Repeated section heading pattern with icon and optional action
Props:
  - title: string
  - icon?: ReactNode
  - action?: ReactNode (right-aligned)
  - className?: string
Replaces: 60+ instances of `<div className="flex items-center gap-2 mb-3">`
```

#### EmptyState
```
Purpose: "No X yet" pattern with icon, message, and optional CTA
Props:
  - icon?: string (GameIcon id)
  - title: string
  - description?: string
  - action?: { label: string, onClick: () => void }
Replaces: 20+ "No X yet" / "Nothing here" patterns
```

#### TierTabBar
```
Purpose: Tier selection tabs (T0-T5) with building counts
Props:
  - activeTier: number
  - onTierChange: (tier: number) => void
  - counts?: Record<number, number> (building count per tier)
  - availableTiers?: number[] (only show tiers player has unlocked)
Behavior:
  - Colored tabs matching tierColors
  - Badge with building count
  - Lock icon for unavailable tiers
  - Responsive: full tabs on desktop, scrollable on mobile
Replaces: Duplicated tier tabs in FactoryPanel + ResourcePanel
```

---

## 3. Design Token Structure

### 3.1 Token Categories

```
TOKENS
├── Color
│   ├── Primitive (oklch base values — NEVER used directly in components)
│   │   ├── gray-50 through gray-950
│   │   ├── cyan-50 through cyan-950
│   │   ├── orange-50 through orange-950
│   │   ├── purple-50 through purple-950
│   │   ├── emerald-50 through emerald-950
│   │   ├── amber-50 through amber-950
│   │   ├── red-50 through red-950
│   │   └── neon-* (glow colors)
│   │
│   ├── Semantic (mapped from primitives — USED in components)
│   │   ├── --color-bg-primary        → oklch(0.07 0.02 260)  — #0a0e17
│   │   ├── --color-bg-card           → oklch(0.12 0.02 260)  — #111827
│   │   ├── --color-bg-elevated       → oklch(0.15 0.02 260)  — hover states
│   │   ├── --color-bg-inset          → oklch(0.05 0.01 260)  — deep inset cards
│   │   ├── --color-text-primary      → oklch(0.92 0.01 260)  — main text
│   │   ├── --color-text-secondary    → oklch(0.60 0.02 260)  — labels
│   │   ├── --color-text-muted        → oklch(0.40 0.02 260)  — disabled
│   │   ├── --color-border-default    → oklch(0.25 0.03 260)  — borders
│   │   ├── --color-border-subtle     → oklch(0.15 0.02 260)  — inner borders
│   │   ├── --color-accent-primary    → cyan-500               — primary CTA
│   │   ├── --color-accent-danger     → red-500                — destructive
│   │   ├── --color-accent-success    → emerald-500            — positive
│   │   ├── --color-accent-warning    → amber-500              — caution
│   │   └── --color-accent-prestige   → purple-500             — prestige
│   │
│   ├── Tier (game-specific — for building/resource tier colors)
│   │   ├── --color-tier-0            → gray-400    (Startup)
│   │   ├── --color-tier-1            → cyan-400    (Basic)
│   │   ├── --color-tier-2            → orange-400  (Advanced)
│   │   ├── --color-tier-3            → purple-400  (High-Tech)
│   │   ├── --color-tier-4            → emerald-400 (Singularity)
│   │   └── --color-tier-5            → red-400     (Transcendent)
│   │
│   └── Currency (game-specific — for money/RP/CP)
│       ├── --color-currency-money    → yellow-400
│       ├── --color-currency-rp       → cyan-400
│       └── --color-currency-cp       → purple-400
│
├── Spacing
│   ├── --space-1   → 0.25rem (4px)
│   ├── --space-2   → 0.5rem  (8px)
│   ├── --space-3   → 0.75rem (12px)
│   ├── --space-4   → 1rem    (16px)
│   ├── --space-5   → 1.25rem (20px)
│   ├── --space-6   → 1.5rem  (24px)
│   ├── --space-8   → 2rem    (32px)
│   └── --space-10  → 2.5rem  (40px)
│
├── Typography
│   ├── --font-size-xs     → 0.75rem  (12px)  — badges, tiny labels
│   ├── --font-size-sm     → 0.875rem (14px)  — secondary text (WCAG minimum)
│   ├── --font-size-base   → 1rem     (16px)  — body text
│   ├── --font-size-lg     → 1.125rem (18px)  — card titles
│   ├── --font-size-xl     → 1.25rem  (20px)  — panel headers
│   ├── --font-size-2xl    → 1.5rem   (24px)  — section titles
│   ├── --font-size-3xl    → 1.875rem (30px)  — page titles
│   ├── --font-weight-normal → 400
│   ├── --font-weight-medium → 500
│   ├── --font-weight-bold   → 700
│   └── --font-family-mono   → 'JetBrains Mono', monospace
│
├── Radius
│   ├── --radius-sm   → 6px
│   ├── --radius-md   → 8px
│   ├── --radius-lg   → 10px
│   ├── --radius-xl   → 14px
│   └── --radius-full → 9999px (pills/badges)
│
├── Shadow
│   ├── --shadow-sm    → subtle card shadow
│   ├── --shadow-md    → elevated card shadow
│   ├── --shadow-lg    → modal/dialog shadow
│   ├── --shadow-glow-cyan    → 0 0 15px rgba(0,255,242,0.15)
│   ├── --shadow-glow-orange  → 0 0 15px rgba(249,115,22,0.15)
│   ├── --shadow-glow-purple  → 0 0 15px rgba(168,85,247,0.15)
│   ├── --shadow-glow-red     → 0 0 15px rgba(239,68,68,0.15)
│   └── --shadow-glow-amber   → 0 0 15px rgba(245,158,11,0.15)
│
├── Motion
│   ├── --duration-instant  → 100ms  (hover feedback)
│   ├── --duration-fast     → 200ms  (button press, toggle)
│   ├── --duration-normal   → 300ms  (card animation, panel enter)
│   ├── --duration-slow     → 500ms  (page transition, progress)
│   ├── --duration-glacial  → 1000ms (ambient effects)
│   ├── --ease-default      → cubic-bezier(0.4, 0, 0.2, 1)
│   ├── --ease-in           → cubic-bezier(0.4, 0, 1, 1)
│   ├── --ease-out          → cubic-bezier(0, 0, 0.2, 1)
│   ├── --ease-spring       → cubic-bezier(0.34, 1.56, 0.64, 1)
│   └── --ease-bounce       → cubic-bezier(0.68, -0.55, 0.265, 1.55)
│
├── Z-Index
│   ├── --z-base        → 0
│   ├── --z-sidebar     → 40
│   ├── --z-header      → 50
│   ├── --z-overlay     → 90
│   ├── --z-toast       → 100
│   ├── --z-modal       → 110
│   └── --z-celebration → 120
│
└── Breakpoints
    ├── --bp-sm   → 640px   (mobile landscape)
    ├── --bp-md   → 768px   (tablet portrait)
    ├── --bp-lg   → 1024px  (tablet landscape / small desktop)
    └── --bp-xl   → 1280px  (desktop)
```

### 3.2 Token Usage Rules

1. **NEVER use primitive colors directly** in component code. Always use semantic or tier tokens.
2. **NEVER hardcode spacing values** like `p-3.5` or `gap-[13px]`. Use Tailwind spacing scale.
3. **NEVER hardcode font sizes** below 12px. The minimum visible text is `text-xs` (12px). For mobile, minimum is `text-sm` (14px).
4. **ALWAYS use motion tokens** for animations. No `transition-all duration-700` — use `transition-[property] duration-[var(--duration-normal)]`.
5. **NEVER duplicate z-index values**. Use the defined scale.

### 3.3 JavaScript Token Access

```typescript
// src/lib/theme/tokens.ts
// For use in JS-computed styles (e.g., SVG, Canvas, dynamic positioning)

export const TOKENS = {
  color: {
    tier: ['#a0a0a0', '#22d3ee', '#f97316', '#a855f7', '#00ffcc', '#ff1744'],
    currency: { money: '#facc15', rp: '#22d3ee', cp: '#a855f7' },
    neon: { cyan: '#00fff2', green: '#39ff14', orange: '#ff6600', purple: '#bf00ff', red: '#ff0040', yellow: '#ffff00' },
  },
  duration: { instant: 100, fast: 200, normal: 300, slow: 500, glacial: 1000 },
  ease: {
    default: [0.4, 0, 0.2, 1],
    spring: [0.34, 1.56, 0.64, 1],
  },
  z: { base: 0, sidebar: 40, header: 50, overlay: 90, toast: 100, modal: 110, celebration: 120 },
} as const;
```

---

## 4. Desktop Strategy (≥1024px)

### 4.1 Layout Grid

```
┌─────────────────────────────────────────────────────────────────┐
│ HEADER (fixed, z-50)                                            │
│ ┌─────┬───────────────────────────────────────────┬──────────┐  │
│ │Logo │ Money │ Power │ RP │ CP │ ═════════════ │ Controls │  │
│ └─────┴───────────────────────────────────────────┴──────────┘  │
│ ┌───────────────────────────────────────────────────────────┐   │
│ │ News Ticker (scrolling)                                    │   │
│ └───────────────────────────────────────────────────────────┘   │
├─────────┬───────────────────────────────────────────────────────┤
│         │                                                        │
│ SIDEBAR │  MAIN PANEL AREA                                      │
│ w-56    │  (flex-1, scrollable)                                  │
│         │                                                        │
│ ▼ Overview   │  ┌──────────────────────────────────────────┐    │
│   Dashboard  │  │  PanelHeader                              │    │
│   FactoryMap │  │  ────────────────────────────────────     │    │
│   Monitor    │  │                                            │    │
│   Guide      │  │  Panel Content (varies per tab)            │    │
│              │  │                                            │    │
│ ▼ Production │  │                                            │    │
│   Resources  │  │                                            │    │
│   Factories  │  │                                            │    │
│   Storage    │  │                                            │    │
│   Power      │  │                                            │    │
│   Workers    │  │                                            │    │
│              │  │                                            │    │
│ ▼ Logistics  │  └──────────────────────────────────────────┘    │
│   Transport  │                                                  │
│   Market     │                                                  │
│   ...        │                                                  │
│              │                                                  │
│ ☕ Buy Coffee │                                                  │
├─────────┴───────────────────────────────────────────────────────┤
│ (No footer on desktop)                                           │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Desktop-Specific Features

| Feature | Implementation | Business Impact |
|---------|---------------|-----------------|
| **Persistent Sidebar** | Always visible, groups collapsible | Zero-click navigation to any panel |
| **Wide Stat Grid** | 4-5 stat cards per row | At-a-glance overview of all systems |
| **Keyboard Shortcuts** | 1-9 tab switching, Space pause | Power-user efficiency (+30% click reduction) |
| **News Ticker** | Scrolling market news | Market awareness without switching tabs |
| **Tooltips Everywhere** | Hover for detail on any icon/badge | Deep information without clicking |
| **Multi-column Layouts** | lg:grid-cols-3 for stats+sidebar+detail | Side-by-side comparison (e.g., building stats + production chain) |
| **Resizable Sidebar** (Future) | Drag to resize w-44 to w-72 | Personal workspace customization |

### 4.3 Desktop Header Specification

```
Left Section:
  - Logo/Brand (click → Dashboard)
  - Money badge (with income/min tooltip)
  - Power badge (with efficiency indicator)
  - RP badge
  - CP badge
  - Separator line

Right Section:
  - Speed controls (1x/5x/10x/∞ + pause)
  - Tick counter
  - Online count badge
  - Config badge (Live/Local)
  - Save indicator (with flash on auto-save)
  - Cloud sync status
  - Export/Import buttons
  - Auth (avatar or Sign In)
```

---

## 5. Tablet Strategy (768px–1023px)

### 5.1 Layout Grid

```
┌─────────────────────────────────────────────────┐
│ HEADER (compact)                                 │
│ ┌──────┬───────────────────────────┬──────────┐  │
│ │ Logo │ $1.2M │ ⚡87% │ 🔬450 │  │ ⏸ ▶ 1x │  │
│ └──────┴───────────────────────────┴──────────┘  │
├─────────────────────────────────────────────────┤
│                                                   │
│  MAIN PANEL AREA (full width, scrollable)         │
│                                                   │
│  ┌───────────────────────────────────────────┐   │
│  │  PanelHeader                              │   │
│  │  Content (2-col grid where desktop=3-col) │   │
│  └───────────────────────────────────────────┘   │
│                                                   │
├─────────────────────────────────────────────────┤
│ BOTTOM NAV (5 groups + expandable menu)           │
└─────────────────────────────────────────────────┘
```

### 5.2 Tablet-Specific Adaptations

| Adaptation | Detail | Rationale |
|-----------|--------|-----------|
| **Collapsible Sidebar → Bottom Nav** | Sidebar hidden at <1024px, replaced by bottom nav | Touch-friendly navigation |
| **3-col → 2-col Grids** | Stat rows use 2 columns instead of 4 | Prevent cramping |
| **Compact Header** | Stats inline, no news ticker | Save vertical space |
| **Touch Targets** | All interactive elements ≥44px | Touch accuracy |
| **Popover Overlays** | Detail views use slide-over instead of tooltip | Touch can't hover |
| **Split View (Future)** | Optional sidebar panel for building inspector | Use wider tablet screens |

### 5.3 Tablet Breakpoint Rules

- `md:` (768px) — Switch from mobile to tablet grid (2-col)
- `lg:` (1024px) — Switch from tablet to desktop (sidebar appears)

---

## 6. Mobile Strategy (<768px)

### 6.1 Layout Grid

```
┌──────────────────────────────┐
│ HEADER (2-row compact)        │
│ ┌──────────────────────────┐ │
│ │ 🏭 $1.2M ⚡87% 🔬450 👤│ │ ← Row 1: Logo + core stats
│ ├──────────────────────────┤ │
│ │ ⏸ ▶ 1x 5x  💾 ☁️      │ │ ← Row 2: Speed + quick actions
│ └──────────────────────────┘ │
├──────────────────────────────┤
│                                │
│  MAIN PANEL AREA               │
│  (full width, scrollable)       │
│  pb-20 (space for bottom nav)   │
│                                │
│  ┌──────────────────────────┐ │
│  │  PanelHeader             │ │
│  │  Content (1-2 col grid)  │ │
│  │  Compact cards           │ │
│  └──────────────────────────┘ │
│                                │
├──────────────────────────────┤
│ BOTTOM NAV BAR                 │
│ ┌──┬──┬──┬──┬──┬──┬──┬──┐   │
│ │📊│🏭│📦│🔬│⭐│💰│⚙️│⟳│   │
│ └──┴──┴──┴──┴──┴──┴──┴──┘   │
│ (7 groups + mode toggle)       │
├──────────────────────────────┤
│ FAB (draggable, bottom-right)  │
└──────────────────────────────┘
```

### 6.2 Mobile Design Principles

| # | Principle | Implementation | Impact |
|---|-----------|---------------|--------|
| 1 | **14px Minimum Text** | No `text-[10px]` or `text-[7px]` anywhere | Legibility for 40%+ mobile users |
| 2 | **44px Touch Targets** | All buttons, tabs, cards ≥44px height | Touch accuracy |
| 3 | **One-Hand Reach** | Primary actions in bottom 60% of screen | One-handed use |
| 4 | **Reduce Chrome** | Header ≤80px, bottom nav ≤56px | Maximize content area |
| 5 | **Swipe Navigation** | Swipe left/right between related panels | Faster navigation |
| 6 | **Bottom Sheets over Modals** | Use Sheet (bottom drawer) instead of Dialog | Mobile-native pattern |
| 7 | **Progressive Disclosure** | Show essentials, expand for details | Reduce cognitive load |
| 8 | **Sticky Key Stats** | Money/power always visible in header | Never lose awareness |
| 9 | **Visual Hierarchy** | Size + color + position > labels alone | Faster scanning |
| 10 | **Offline Resilience** | All data from store, no loading spinners for local data | Instant interaction |

### 6.3 Mobile Header Redesign

**Current Problems**:
- Two rows consume ~90px (27% of 390px viewport on iPhone)
- Text as small as 9px in stat badges
- Speed controls cramped into 24px height
- No income-per-minute visibility

**Target Design**:
```
Row 1 (height: 44px):
  [Logo 24px] [$1.2M ▲] [⚡87%] [🔬450] [👤/🟢]

Row 2 (height: 36px, collapsible on scroll):
  [⏸] [1x] [5x] [💾●] [☁️✓]
```

**Key Changes**:
- Stats use `text-sm` (14px) minimum — no more 9px badges
- Money shows income trend arrow (▲/▼) — at-a-glance economy health
- Speed controls are larger (36px height)
- Save/sync status as simple dot indicators
- Row 2 collapses on scroll-down to maximize content area

### 6.4 Mobile Bottom Navigation Redesign

**Current**: 7 groups + mode toggle = 8 buttons in bottom bar

**Problem**: 8 buttons in a 390px bar = 48px each (OK) but labels at 9px are unreadable

**Target**: 5 primary groups in bar + "More" overflow

```
┌──────┬──────┬──────┬──────┬──────┐
│  📊  │  🏭  │  📦  │  🔬  │ ⋯ │
│Overview│Build│Trade│Research│More│
└──────┴──────┴──────┴──────┴──────┘
```

**"More" overflow** opens a bottom sheet with remaining groups:
- Rewards (Quests, Achievements, Daily, Leaderboard, Events)
- Finance (Payouts, Notifications)
- System (Statistics, Blueprints, Settings)

**Rationale**: The 5 primary groups cover 85%+ of player actions. "More" is for less frequent tasks. This follows the standard 5-tab mobile pattern used by all successful idle games.

**Business Impact**: Reduces nav cognitive load by 37.5%, aligns with industry standard, reduces mis-taps.

### 6.5 Mobile Panel Adaptations

| Panel | Desktop Layout | Mobile Layout | Key Adaptation |
|-------|---------------|---------------|----------------|
| Dashboard | 10-section page | Priority cards (3-4) + "View All" | Show only: Money, Power, Active Quest, Quick Build |
| Factory/Resource | SVG flow + tabs + grid | Tier tabs + compact card list (no SVG flow) | SVG flow hidden on mobile; list view is primary |
| Market | 4 view modes | 2 modes: Trade + News | Sectors/Chains collapsed into Trade view |
| Research | Category grid | Stacked category cards | Same, but single column |
| Storage | 3-view tabs | Overview only (accordion) | Dependencies/Alerts as badge indicators |
| Transport | SVG node graph | List of lines + connect-all | SVG hidden; list management is primary |
| FactoryMap | Interactive grid | Simplified list view | Grid view too complex for mobile touch |
| Leaderboard | Full table | Scrollable card list | Already implemented correctly |

### 6.6 Mobile-Specific Components

**QuickBuildSheet** (Bottom Sheet)
- Triggered from FAB or "Build" bottom nav tab
- Shows: Available buildings for current tier
- One-tap build with confirmation
- Replaces: Navigate → Production → Resources → Find building → Build (4 taps → 1 tap)

**ResourceQuickView** (Slide-up from header stat)
- Tap any stat badge (Money/Power/RP) → bottom sheet with:
  - Current value
  - Income rate per minute
  - Top 3 income sources
  - Top 3 expense sources
- Replaces: Navigate to Dashboard or Monitor panel to see rates

**BottleneckToast** (Auto-notification)
- When production bottleneck detected → toast with:
  - "⚠️ Copper Wire shortage limiting 3 factories"
  - [Build Copper Wire Mill] button
- One-tap resolution

---

## 7. Information Hierarchy Strategy

### 7.1 Data Visibility Tiers

Not all data is equally important at all times. The architecture must support **progressive data revelation** based on game phase and player context.

| Visibility Tier | When Visible | Examples | Display Pattern |
|----------------|-------------|----------|-----------------|
| **Always On** | Every screen, every phase | Money, Power, active tab name | Header badge |
| **Contextual** | When relevant system is active | Research progress, contract timers, quest objectives | Panel stat row |
| **On Demand** | When player navigates to it | Full resource table, market history, blueprint list | Full panel content |
| **Progressive** | Unlocked as player advances | Prestige, mega projects, T3+ buildings | Tab unlocks, contextual prompts |
| **Hidden Until Needed** | Only when issue exists | Bottleneck alerts, power overload, storage full | Toast/notification |

### 7.2 Progressive Disclosure by Game Phase

#### Early Game (Tier 0-1, 0-30 min)

**Visible Tabs**: Dashboard, Resources, Factories, Research, Settings  
**Hidden Tabs**: Transport, Prestige, Mega Projects, Automation, Contracts, Drones  
**Header Shows**: Money, Power  
**Header Hides**: RP (until first research started), CP (never until first prestige)

**Dashboard Priority**:
1. Money + income rate
2. Quick Build section (top 3 available buildings)
3. Active research progress
4. "Getting Started" guide (if not completed)

**Rationale**: New players need to learn the core loop (build → produce → sell → research). Too many options create decision paralysis.

#### Mid Game (Tier 2-3, 30 min - 5 hours)

**Visible Tabs**: All production + logistics + research tabs  
**Hidden Tabs**: Prestige (until threshold met), Mega Projects (until T3 research), Automation (until unlocked)  
**Header Shows**: Money, Power, RP  
**Header Hides**: CP (until prestige threshold)

**Dashboard Priority**:
1. Production summary (income/rates)
2. Active research + time remaining
3. Contract status (if any active)
4. Market highlights (best sell prices)
5. Power status (if <90%)

**Rationale**: Mid-game players are optimizing. They need rate data, chain visibility, and market information.

#### Late Game (Tier 4-5, 5+ hours)

**Visible Tabs**: All 25 tabs  
**Header Shows**: Money, Power, RP, CP  
**Dashboard Priority**:
1. Passive income summary
2. Mega project progress
3. Prestige readiness indicator
4. Market conditions
5. Leaderboard position

**Rationale**: Late-game players are strategizing. They need global overview and optimization data.

### 7.3 Contextual Prompts

The UI should proactively prompt players at key decision points:

| Trigger | Prompt | Placement | Business Impact |
|---------|--------|-----------|-----------------|
| Power < 50% | ⚡ "Power critical! Build generators" | Toast + header badge red | Prevents player frustration from low efficiency |
| Storage > 90% for any resource | 📦 "Storage almost full! Upgrade or auto-sell" | Toast on affected resource | Prevents wasted production |
| Research completed | 🔬 "Research complete! New building unlocked: [name]" | Toast + panel notification | Immediate awareness of new options |
| Prestige threshold reached | 🏆 "Global Expansion available! +X Corporation Points" | Persistent banner on Dashboard | Drives prestige engagement (retention mechanic) |
| Contract expiring in 60s | 📋 "Contract expires in 60 seconds!" | Urgent toast | Prevents contract failure |
| Mega project stage completable | 🏗️ "Mega project stage ready! Contribute resources" | Panel notification | Drives engagement with long-term goals |
| New daily reward available | 🎁 "Daily reward available!" | Login notification | Drives daily retention |

### 7.4 Information Density Rules

| Screen Width | Max Visible Stats | Max Card Columns | Max Table Rows (visible) | Text Min Size |
|-------------|------------------|-----------------|--------------------------|---------------|
| 375px (mobile) | 4 | 1-2 | 5 | 14px |
| 428px (mobile XL) | 4 | 2 | 7 | 14px |
| 768px (tablet) | 6 | 2-3 | 10 | 12px |
| 1024px (desktop S) | 8 | 3 | 15 | 12px |
| 1280px+ (desktop) | 10+ | 4-5 | 20+ | 12px |

---

## 8. Navigation Strategy

### 8.1 Navigation Architecture

```
NAVIGATION LAYER 1: Device-Level
├── Desktop: Sidebar (always visible, 7 groups, 25 tabs)
├── Tablet: Bottom Nav (5 items + More sheet)
└── Mobile: Bottom Nav (5 items + More sheet) + FAB

NAVIGATION LAYER 2: Panel-Level
├── Tab Bar (within panel, e.g., Market's 4 views)
├── Tier Selector (within panel, e.g., Factory T0-T5)
└── Filter Bar (within panel, e.g., Resource Monitor search)

NAVIGATION LAYER 3: Detail-Level
├── Bottom Sheet (detail view on mobile)
├── Slide-over Panel (detail view on tablet)
├── Tooltip/Popover (quick detail on desktop)
└── Dialog (confirmation, settings)

NAVIGATION LAYER 4: Cross-Cutting
├── Keyboard Shortcuts (desktop: 1-9, Space, +/-)
├── Quick Actions (FAB on mobile)
├── Search (future: search panels, resources, buildings)
└── Breadcrumbs (for deeply nested views)
```

### 8.2 Bottom Navigation Grouping (Mobile/Tablet)

**Primary (Bottom Bar — always visible)**:

| Position | Icon | Group | Key Panels | Tap % (estimated) |
|----------|------|-------|-----------|-------------------|
| 1 | 📊 BarChart3 | Overview | Dashboard, FactoryMap | 35% |
| 2 | 🏭 Factory | Build | Resources, Factories, Power, Storage, Workers | 25% |
| 3 | 📦 Package | Trade | Market, Trade Post, Contracts, Drones, Transport | 20% |
| 4 | 🔬 FlaskConical | Research | Research, Automation | 10% |
| 5 | ⋯ More | More | (opens bottom sheet) | 10% |

**Secondary (More Sheet — tap to expand)**:

| Group | Panels | Rationale for Secondary |
|-------|--------|------------------------|
| Rewards | Quests, Achievements, Daily, Leaderboard, Events | Checked 2-3x per session, not primary loop |
| Finance | Payouts, Notifications | Passive systems, checked occasionally |
| System | Statistics, Blueprints, Settings | Management tasks, infrequent |

### 8.3 Sidebar Grouping (Desktop)

Same 7-group structure as current, but with **progressive unlock indicators**:

```
▼ Overview (always unlocked)
  Dashboard
  Factory Map        [🔓 locked until 5 buildings]
  Resource Monitor   [🔓 locked until 10 resources]
  Guide

▼ Production (always unlocked)
  Resources
  Factories
  Storage
  Power
  Workers

▼ Logistics (unlocked after first factory)
  Transport          [🔒 locked until 3 buildings]
  Market             [🔒 locked after first factory]
  Contracts          [🔒 locked until 5 buildings]
  Drone Delivery     [🔒 locked until research: drones]
  Trade Post

▼ Progression
  Research           (unlocked after first factory)
  Automation         [🔒 locked until research: automation]
  Prestige           [🔒 locked until prestige threshold]
  Mega Projects      [🔒 locked until T3 research]

▼ Rewards (unlocked after 10 min playtime)
  Quests
  Achievements
  Daily Rewards
  Leaderboard        [🔒 locked until online]
  Events

▼ Finance (unlocked after first contract)
  Payouts
  Notifications

▼ System (always unlocked)
  Statistics
  Blueprints
  Settings
```

**Lock icons** → greyed out with lock icon + tooltip: "Unlocks when [condition]"

**Business Impact**: New players see 8-10 available tabs instead of 25. Reduces overwhelm, increases first-session retention.

### 8.4 FAB (Floating Action Button) Strategy

**Current**: Generic FAB with quick-access shortcuts (configurable)

**Target**: Smart FAB that adapts to context:

| Context | FAB Action | Icon |
|---------|-----------|------|
| Early game (no buildings) | Build First Extractor | Hammer |
| Normal play | Quick Build (most relevant building) | Plus |
| Research available | Start Research | Flask |
| Contract expiring | View Contract | Clipboard |
| Storage full | Auto-sell Suggestion | ArrowUpDown |
| Power critical | Build Power Plant | Zap |
| Prestige available | View Prestige | Trophy |

**Behavior**: Single tap → primary action. Long press → shortcut menu (current FAB behavior).

### 8.5 Navigation Data Architecture

```typescript
// src/components/game/layout/NavData.ts

interface NavItem {
  id: GameTab;
  label: string;
  icon: string; // GameIcon id
  group: NavGroupId;
  unlockCondition?: (state: GameState) => boolean;
  unlockDescription?: string;
  priority: number; // 1 = highest, determines FAB/bottom nav ordering
  mobilePosition?: 'primary' | 'secondary'; // bottom nav placement
}

interface NavGroup {
  id: string;
  label: string;
  icon: string;
  color: string; // tier color for accent
  items: NavItem[];
  unlockCondition?: (state: GameState) => boolean;
}

export const NAV_CONFIG: NavGroup[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: 'lucide:bar-chart-3',
    color: 'cyan',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: 'lucide:layout-dashboard', group: 'overview', priority: 1, mobilePosition: 'primary' },
      { id: 'factoryMap', label: 'Factory Map', icon: 'lucide:map', group: 'overview', priority: 8, unlockCondition: s => s.buildings.length >= 5, unlockDescription: 'Unlocks at 5 buildings', mobilePosition: 'secondary' },
      // ...
    ]
  },
  // ... other groups
];
```

This replaces the current `NAV_GROUPS` constant in GameSidebar.tsx with a richer, condition-aware navigation system.

---

## 9. Reusable Component Standards

### 9.1 Component Creation Criteria

A new shared component should be created when:

1. **The pattern appears in 3+ panels** — proven need, not speculative
2. **The pattern has consistent structure** — same HTML skeleton, varying data
3. **The pattern benefits from centralized styling** — fix once, apply everywhere
4. **The pattern reduces >20 lines per usage** — meaningful reduction

### 9.2 Component API Standards

| Standard | Rule | Example |
|----------|------|---------|
| **Props interface** | Always named, always exported | `export interface ResourceBarProps { ... }` |
| **Children** | Use `children` for layout, props for data | `<PanelShell><PanelHeader />{content}</PanelShell>` |
| **className** | Always accept `className?: string` for escape hatch | Last class wins via `cn()` |
| **Events** | Always optional, named `on[Action]` | `onBuild?: (id: string) => void` |
| **Color** | Use unified `TierColor` type, not arbitrary strings | `color: TierColor` not `color: string` |
| **Size** | Use `'sm' \| 'md' \| 'lg'` pattern | `size?: 'sm' \| 'md' \| 'lg'` |
| **Variant** | Use string union, not boolean flags | `variant?: 'default' \| 'compact' \| 'premium'` |
| **Accessibility** | Interactive elements get `aria-label`, `role` | `aria-label="Build iron mine"` |
| **Forward Ref** | Use `forwardRef` for components that wrap DOM elements | For buttons, inputs, containers |
| **Memo** | Use `React.memo` for list item components | `BuildingCard = React.memo(BuildingCardInner)` |

### 9.3 Styling Standards

| Pattern | Standard | Anti-Pattern |
|---------|----------|-------------|
| Background | `bg-card`, `bg-primary` | `bg-[#111827]`, `bg-gray-900` |
| Text Color | `text-foreground`, `text-muted-foreground` | `text-gray-400`, `text-white` |
| Border | `border-border`, `border-primary/30` | `border-gray-700/30`, `border-[#1e293b]` |
| Spacing | `p-4`, `gap-3`, `space-y-4` | `p-[13px]`, `gap-[7px]` |
| Typography | `text-sm`, `font-medium`, `tracking-wide` | `text-[10px]`, `font-[600]` |
| Animation | `duration-[var(--duration-normal)]` | `duration-300`, `duration-[200ms]` |
| Hover | `hover:bg-elevated`, `hover:border-accent` | `hover:bg-[#1e3a5f]` |
| Focus | `focus-visible:ring-2 focus-visible:ring-primary/50` | No focus ring |
| Responsive | `sm:`, `md:`, `lg:` breakpoints only | `@[350px]:`, custom breakpoints |
| Color Threshold | `getThresholdColor(percentage)` utility | Inline `> 90 ? 'red' : > 70 ? 'orange' : ...` |

### 9.4 State Access Standards

**Current Problem**: 30/31 panels use `const store = useGameStore()` which subscribes to ALL state changes, causing unnecessary re-renders.

**Standard**: Every panel MUST use selective selectors.

```typescript
// ❌ BAD — subscribes to everything, re-renders on any change
const store = useGameStore();
const money = store.money;
const buildings = store.buildings;

// ✅ GOOD — subscribes only to needed slices
const money = useGameStore(s => s.money);
const buildings = useGameStore(s => s.buildings);

// ✅ BETTER — use named selectors for complex derivations
import { selectActiveFactories, selectPowerEfficiency } from '@/lib/game/selectors';
const factories = useGameStore(selectActiveFactories);
const efficiency = useGameStore(selectPowerEfficiency);
```

**Selector Organization** (`src/lib/game/selectors/`):

```typescript
// resourceSelectors.ts
export const selectResources = (s: GameState) => s.resources;
export const selectResourceCapacity = (s: GameState) => s.resourceCapacity;
export const selectStorageUtilization = (s: GameState) => {
  // Derived computation
  const utilization: Record<string, number> = {};
  for (const key of Object.keys(s.resources)) {
    const cap = s.resourceCapacity[key] || 0;
    utilization[key] = cap > 0 ? s.resources[key] / cap : 0;
  }
  return utilization;
};

// buildingSelectors.ts
export const selectBuildings = (s: GameState) => s.buildings;
export const selectBuildingsByTier = (tier: number) => (s: GameState) =>
  s.buildings.filter(b => getBuildingTier(b.type) === tier);
export const selectActiveBuildingCount = (s: GameState) =>
  s.buildings.filter(b => b.active).length;

// powerSelectors.ts
export const selectPowerGrid = (s: GameState) => s.powerGrid;
export const selectPowerEfficiency = (s: GameState) => s.powerGrid.efficiency;
export const selectIsOverloaded = (s: GameState) => s.powerGrid.overload;
```

### 9.5 Panel Implementation Template

```typescript
// Standard panel structure

'use client';

import { useGameStore } from '@/lib/game/store';
import { selectX, selectY } from '@/lib/game/selectors';
import { PanelShell } from '@/components/game/composites/PanelShell';
import { PanelHeader } from '@/components/game/composites/PanelHeader';
import { StatRow } from '@/components/game/composites/StatRow';
import { SectionHeader } from '@/components/game/composites/SectionHeader';

interface ExamplePanelProps {
  // No props — panels are self-contained
}

export function ExamplePanel() {
  // Selective state subscription
  const data1 = useGameStore(selectX);
  const data2 = useGameStore(selectY);

  // Memoized computations
  const computed = useMemo(() => deriveFrom(data1, data2), [data1, data2]);

  return (
    <PanelShell>
      <PanelHeader
        title="Example Panel"
        icon="lucide:box"
        color="cyan"
        badge={computed.count}
        actions={<button>Filter</button>}
      />

      <StatRow stats={[
        { icon: <Icon />, label: 'Stat 1', value: data1, color: 'cyan' },
        { icon: <Icon />, label: 'Stat 2', value: data2, color: 'orange' },
      ]} />

      <SectionHeader title="Details" icon={<Icon />} />

      {/* Panel-specific content */}
    </PanelShell>
  );
}
```

### 9.6 File Size Standards

| Component Type | Max Lines | Action When Exceeded |
|---------------|-----------|---------------------|
| Primitive (Layer 1) | 100 | Extract variants to separate file |
| Composite (Layer 2) | 200 | Split into sub-components |
| Panel (Layer 3) | 800 | Extract sections to composites/hooks |
| Layout (Layer 4) | 300 | Extract navigation data, header sections |
| Hook | 100 | Split complex hooks into composable hooks |

**Current violations**:
- page.tsx: 1,265 lines (target: <300) — extract header, game loop, dialogs
- TransportPanel: 2,319 lines (target: 800) — extract SVG, line management, connect-all
- FactoryMapPanel: 1,673 lines (target: 800) — extract grid, build palette, inspector
- DashboardPanel: 1,581 lines (target: 800) — extract sections into composites

---

## 10. Implementation Roadmap

### 10.1 Effort/Risk/Impact Matrix

| # | Initiative | Effort | Risk | Expected Impact | Priority |
|---|-----------|--------|------|----------------|----------|
| 1 | Selective Store Subscriptions | Low | Low | **Critical** (render perf) | P0 |
| 2 | Extract Game Loop from page.tsx | Low | Low | High (code maintainability) | P0 |
| 3 | Unify Header (remove duplicate) | Medium | Low | High (consistency, maintainability) | P0 |
| 4 | Design Token Migration | Medium | Low | High (consistency, theme support) | P1 |
| 5 | Create PanelShell + PanelHeader | Low | Low | High (consistency, 80+ duplications) | P1 |
| 6 | Create ResourceBar Composite | Low | Low | High (40+ duplications) | P1 |
| 7 | Create BuildingCard Composite | Medium | Medium | High (merges Factory+Resource panels) | P1 |
| 8 | Mobile Header Redesign | Medium | Low | High (27% viewport reclaimed) | P1 |
| 9 | Mobile Bottom Nav Simplification (5+More) | Medium | Medium | High (cognitive load -37%) | P1 |
| 10 | Progressive Tab Unlocking | Medium | Low | High (new player retention) | P1 |
| 11 | CSS Cleanup (remove duplicates, extract) | Low | Low | Medium (code health) | P2 |
| 12 | Create SectionHeader + EmptyState | Low | Low | Medium (80+ duplications) | P2 |
| 13 | StatRow Composite | Low | Low | Medium (15 panels) | P2 |
| 14 | Named Selectors (all panels) | Medium | Low | Medium (perf, maintainability) | P2 |
| 15 | Tablet Breakpoint Audit | Medium | Low | Medium (tablet users) | P2 |
| 16 | Merge ResourcePanel + FactoryPanel | High | Medium | High (eliminate ~2000 lines duplication) | P3 |
| 17 | Smart FAB (context-aware) | Medium | Low | Medium (1-tap primary action) | P3 |
| 18 | Mobile Panel Adaptations (no SVG on small screens) | High | Medium | High (mobile usability) | P3 |
| 19 | QuickBuildSheet | Medium | Low | High (4 taps → 1 tap) | P3 |
| 20 | Contextual Prompts (bottleneck, prestige) | Medium | Low | High (retention, engagement) | P3 |
| 21 | Panel File Reorganization | Medium | Low | Low (developer experience) | P4 |
| 22 | ResourceQuickView (slide-up from header) | Low | Low | Medium (info accessibility) | P4 |
| 23 | Search/Command Palette | Medium | Low | Medium (power users) | P4 |
| 24 | Resizable Desktop Sidebar | Medium | Medium | Low (nice-to-have) | P4 |
| 25 | Swipe Navigation Between Panels | Medium | Medium | Low (nice-to-have) | P4 |

### 10.2 Phase Breakdown

#### Phase A: Foundation (Week 1-2) — P0 Items

**Goal**: Fix critical performance and architecture issues that block all other work.

| Step | Task | Deliverable | Lines Changed |
|------|------|-------------|---------------|
| A1 | Create `selectors/` directory with named selectors | `resourceSelectors.ts`, `buildingSelectors.ts`, `powerSelectors.ts`, `marketSelectors.ts`, `progressionSelectors.ts` | +300 new |
| A2 | Migrate all 30 panels from `useGameStore()` to selective selectors | All panels updated | ~60 lines per panel |
| A3 | Extract game loop from page.tsx → `useGameTick.ts` hook | New hook, slimmer page.tsx | +50 new, -80 from page.tsx |
| A4 | Unify header — integrate GameHeader.tsx into page.tsx (delete inline header) | Single header source | -500 from page.tsx |
| A5 | Delete dead `MobileNav` component from GameSidebar.tsx | Cleaner codebase | -80 lines |

**Verification**: 
- All panels re-render only when their specific data changes
- page.tsx < 400 lines
- No duplicate header implementations

**Business Impact**: 
- +50% render performance on game tick (fewer unnecessary re-renders)
- Developer velocity increase (single source of truth for header, game loop)

---

#### Phase B: Design System (Week 3-4) — P1 Items

**Goal**: Establish the design token system and create core composites.

| Step | Task | Deliverable | Lines Changed |
|------|------|-------------|---------------|
| B1 | Create `tokens.ts` with JS-accessible design tokens | `src/lib/theme/tokens.ts` | +80 new |
| B2 | Migrate globals.css to use semantic tokens only | Refactored CSS | ~200 lines modified |
| B3 | Create `PanelShell` composite | `src/components/game/composites/PanelShell.tsx` | +60 new |
| B4 | Create `PanelHeader` composite | `src/components/game/composites/PanelHeader.tsx` | +80 new |
| B5 | Create `ResourceBar` composite with color thresholds | `src/components/game/composites/ResourceBar.tsx` | +100 new |
| B6 | Create `SectionHeader` composite | `src/components/game/composites/SectionHeader.tsx` | +40 new |
| B7 | Create `StatRow` composite | `src/components/game/composites/StatRow.tsx` | +50 new |
| B8 | Create `EmptyState` composite | `src/components/game/composites/EmptyState.tsx` | +40 new |
| B9 | Migrate 5 pilot panels to use new composites (Dashboard, Research, Leaderboard, Achievements, Settings) | 5 panels updated | ~-300 net |
| B10 | Mobile header redesign (compact 2-row, 14px minimum) | Updated GameHeader.tsx | ~100 modified |

**Verification**:
- Pilot panels render identically to current (visual regression)
- All text ≥14px on mobile
- Token usage >80% (vs hardcoded values)
- Composites barrel-exported from `shared/index.ts`

**Business Impact**:
- Mobile viewport +8-10% (header reduction)
- Faster panel development (composites save ~40% boilerplate)
- Design consistency across pilot panels

---

#### Phase C: Navigation & Progression (Week 5-6) — P1 Items

**Goal**: Simplify navigation and implement progressive unlocking.

| Step | Task | Deliverable | Lines Changed |
|------|------|-------------|---------------|
| C1 | Create `NavData.ts` with unlock conditions | New navigation data file | +150 new |
| C2 | Update GameSidebar to use NavData + show lock icons | Modified sidebar | ~80 modified |
| C3 | Update BottomNavigationBar to 5+More pattern | Redesigned mobile nav | ~150 modified |
| C4 | Create "More" bottom sheet for secondary nav | New component | +80 new |
| C5 | Implement tab unlock logic (hide locked tabs) | Modified page.tsx renderPanel | ~30 modified |
| C6 | Create `BuildingCard` composite | New shared building card | +150 new |
| C7 | Migrate FactoryPanel + ResourcePanel to use BuildingCard | 2 panels refactored | ~-400 net |
| C8 | Create `TierTabBar` composite | New shared tier selector | +80 new |

**Verification**:
- New players see only 8-10 tabs (vs 25)
- Bottom nav has 5 items + "More"
- Locked tabs show unlock condition on hover/tap
- FactoryPanel + ResourcePanel share BuildingCard

**Business Impact**:
- New player cognitive load -60% (fewer visible options)
- First-session retention +15-20% (estimated, based on idle game benchmarks)
- Build action: 4 taps → 3 taps (with BuildingCard)

---

#### Phase D: Mobile Optimization (Week 7-8) — P2/P3 Items

**Goal**: Full mobile experience optimization.

| Step | Task | Deliverable | Lines Changed |
|------|------|-------------|---------------|
| D1 | Mobile panel adaptations (hide SVG on <768px, show list views) | Multiple panels | ~200 modified |
| D2 | Create `QuickBuildSheet` (FAB → build in 1 tap) | New component | +120 new |
| D3 | Implement smart FAB (context-aware primary action) | Modified FAB | ~100 modified |
| D4 | Create `BottleneckAlert` composite | New component | +60 new |
| D5 | Implement contextual prompts (power, storage, prestige) | Toast system enhancement | ~80 new |
| D6 | Create `ResourceQuickView` (tap header stat → detail sheet) | New component | +80 new |
| D7 | Migrate remaining 20 panels to composites | 20 panels updated | ~-600 net |
| D8 | CSS cleanup (remove duplicates, extract animation CSS) | globals.css refactored | -200 net |
| D9 | Full tablet breakpoint audit and fixes | Responsive fixes | ~150 modified |

**Verification**:
- All panels functional on 375px viewport
- No text <14px on mobile
- All touch targets ≥44px
- Build action: 2 taps (FAB → QuickBuild → done)
- Power/storage alerts fire correctly
- Tablet renders correctly at 768-1023px

**Business Impact**:
- Build action: 4 taps → 2 taps (50% reduction)
- Mobile session length +20% (estimated, better usability)
- Proactive alerts reduce "stuck" states by 40% (estimated)
- Mobile retention +10% (better first experience)

---

#### Phase E: Polish & Scale (Week 9-10) — P3/P4 Items

**Goal**: Advanced features and long-term maintainability.

| Step | Task | Deliverable | Lines Changed |
|------|------|-------------|---------------|
| E1 | Merge ResourcePanel + FactoryPanel into shared `BuildingPanel` | New unified panel | ~-1500 net |
| E2 | Panel file reorganization (panels/ subdirectory) | File moves | 0 net (restructure) |
| E3 | Search/Command Palette (Ctrl+K) | New feature | +200 new |
| E4 | Swipe navigation between related panels | New feature | +100 new |
| E5 | Production chain viewer mobile optimization | Mobile-specific view | +100 new |
| E6 | Performance audit (React Profiler, bundle size) | Optimized rendering | Various |
| E7 | Accessibility audit (WCAG 2.1 AA compliance) | ARIA, keyboard, screen reader | Various |

**Verification**:
- Lighthouse Performance >90
- WCAG 2.1 AA compliance
- Bundle size <500KB (panel lazy loading)
- Zero console errors

**Business Impact**:
- Codebase -2000+ lines (deduplication)
- Developer velocity +50% (organized structure)
- Accessibility compliance (wider audience)
- Power-user efficiency +30% (search, keyboard)

---

### 10.3 Total Estimated Impact

| Metric | Current | After Phase D | After Phase E | Improvement |
|--------|---------|---------------|---------------|-------------|
| **First-tap-to-build** | 4 taps | 2 taps | 2 taps | -50% |
| **Mobile viewport for content** | 73% | 85% | 85% | +12pp |
| **Visible tabs (new player)** | 25 | 8-10 | 8-10 | -60% |
| **Bottom nav items** | 8 | 6 | 6 | -25% |
| **Unnecessary re-renders per tick** | ~30 panels | ~3-5 panels | ~3-5 panels | -83% |
| **Minimum mobile text** | 7-9px | 14px | 14px | +56% |
| **Duplicate CSS rules** | 6 | 0 | 0 | -100% |
| **Duplicate header code** | 1,700 lines | 0 | 0 | -100% |
| **page.tsx line count** | 1,265 | ~300 | ~300 | -76% |
| **Shared composites** | 4 | 13 | 16 | +300% |
| **Panels using selective selectors** | 1/31 | 31/31 | 31/31 | +3000% |
| **Estimated code reduction** | — | -2,000 | -4,000 | — |

### 10.4 Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| Visual regression during composite migration | Medium | High | Screenshot comparison before/after each panel migration |
| Selective selector bugs (stale closures) | Low | Medium | Thorough testing of each selector; use `getState()` for callbacks |
| Progressive unlock confuses existing players | Low | Medium | Add "Show All Tabs" toggle in Settings; remember preference |
| Mobile bottom nav "More" adds friction | Medium | Medium | Track tap analytics; if >40% use "More", consider reorganizing |
| BuildingCard merge breaks Factory/Resource panels | Medium | High | Migrate one panel first, test extensively, then the other |
| Design token migration breaks existing styles | Medium | High | Incremental migration: new tokens for NEW code first, then migrate old code panel-by-panel |

### 10.5 Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| First-session retention (5 min) | >40% | Analytics (post-implementation) |
| Mobile session length | >8 min avg | Analytics |
| Build-action tap count | ≤2 | Manual measurement |
| Lighthouse Performance Score | >90 | Automated |
| WCAG 2.1 AA compliance | 100% | Accessibility audit |
| Re-render count per tick | <5 panels | React Profiler |
| Developer velocity (new panel) | <2 hours | Time tracking |
| Code duplication | <5% | Static analysis |

---

## Appendix A: Current Architecture Problems Summary

| # | Problem | Category | Current Impact | Blueprint Solution |
|---|---------|----------|---------------|-------------------|
| 1 | 30/31 panels subscribe to entire store | Performance | Every tick re-renders all panels | Selective selectors (Phase A) |
| 2 | page.tsx is 1,265 lines | Maintainability | Hard to modify, high bug risk | Extract game loop, header, dialogs (Phase A) |
| 3 | Duplicate header implementations | Consistency | Features diverge, bugs fixed in one not the other | Single GameHeader.tsx (Phase A) |
| 4 | 3 incompatible color type systems | Consistency | TierColor ≠ StatColor ≠ GameCard accent | Unified color token system (Phase B) |
| 5 | 40+ duplicated progress bars | Duplication | Bug fixes must be applied 40 times | ResourceBar composite (Phase B) |
| 6 | 50+ duplicated card containers | Duplication | Inconsistent padding, borders | PanelShell composite (Phase B) |
| 7 | 29 duplicated panel headers | Duplication | Inconsistent styling, titles | PanelHeader composite (Phase B) |
| 8 | Mobile text as small as 7px | Accessibility | Illegible on mobile devices | 14px minimum rule (Phase B) |
| 9 | 25 tabs visible from game start | Cognitive Load | New players overwhelmed | Progressive unlock (Phase C) |
| 10 | 8 bottom nav buttons (mobile) | Usability | Labels unreadable at 9px | 5+More pattern (Phase C) |
| 11 | FactoryPanel + ResourcePanel are near-clones | Duplication | ~2000 lines of duplicated code | BuildingCard + BuildingPanel (Phase C/E) |
| 12 | No contextual prompts | Engagement | Players miss prestige, power issues | Contextual prompts (Phase D) |
| 13 | Build action takes 4 taps | Usability | Friction for most common action | QuickBuildSheet + smart FAB (Phase D) |
| 14 | SVG overflows on mobile | Visual Bug | Transport/FactoryMap panels broken | Mobile list alternatives (Phase D) |
| 15 | CSS has 6 duplicate rule blocks | Code Health | Conflicting overrides, confusion | CSS cleanup (Phase D) |

---

## Appendix B: Game Comparison Decision Matrix

For each UI pattern, should IndustriaX follow the industry convention or intentionally diverge?

| Pattern | Industry Convention | IndustriaX Decision | Rationale |
|---------|--------------------|--------------------|-----------|
| Bottom nav: 4-5 items | Follow | ✅ Follow | Proven cognitive limit; 8 items is anti-pattern |
| Progressive disclosure | Follow | ✅ Follow | Universal best practice for idle games |
| Single-focus screens | Follow | ✅ Partially follow | Primary screens = single focus; Dashboard = strategic overview |
| Persistent money display | Follow | ✅ Follow | Already doing this correctly |
| Build from resource view | Follow | ✅ Follow | Currently requires tab switch — fix with BuildingCard |
| Prestige prompt | Follow | ✅ Follow | Currently buried — add contextual prompt |
| SVG production view | Diverge | ✅ Diverge | Our chain depth justifies it; hide on mobile only |
| Transport system | Diverge | ✅ Diverge | Unique differentiator; needs own screen |
| Market simulation view | Diverge | ✅ Diverge | 3-layer market is unique; justifies dedicated view |
| Leaderboard prominence | Diverge | ✅ Diverge | Social features are our strength; give them visibility |
| One-tap build | Follow | ✅ Follow | QuickBuildSheet reduces to 1-2 taps |
| Auto-sell from resource view | Follow | ✅ Follow | Currently requires Market tab; fix with contextual toggle |
| Number formatting options | Follow | ✅ Follow | Already have scientific/standard/compact in Settings |
| Speed controls | Follow | ✅ Follow | Already implemented; just need mobile optimization |
| News/events ticker | Neutral | ✅ Keep desktop only | Not common in idle games but adds atmosphere |

---

*End of Phase 2: UI Architecture Blueprint v1.0*  
*This document is a design specification. No implementation should begin until this blueprint is reviewed and approved.*
