# IndustriaX — Post-Phase 1 Architecture Baseline Report

> **Date**: 2025-03-04
> **Status**: Architecture Review — No Implementation
> **After**: Phase 0 (Foundation) + Phase 1 (Extraction)
> **Before**: Phase 2 (TBD)

---

> **STATUS NOTICE — NOT CURRENT**  
> This document has been classified as **CONTRADICTORY** in `planning/DOCUMENT_INVENTORY.md` (June 2026 audit).  
> **Known contradictions:** Claims `page.tsx=418 lines` (actual: 1,344) and `useCloudSync=375 lines` (actual: 485).  
> For the canonical project status, see [PROJECT_STATUS_SOURCE_OF_TRUTH.md](./PROJECT_STATUS_SOURCE_OF_TRUTH.md).  
> Claims in this document have not been independently verified against the current codebase.

---

## Executive Summary

Phase 0 and Phase 1 together reduced `page.tsx` from **1,246 → 418 lines** (66% reduction), eliminated all full-store subscriptions (100% selector adoption), extracted 12 custom hooks, 3 dialog components, 3 header components, and deleted 745+ lines of dead code. The project now follows an Orchestrator → Hooks → Components → Render pattern.

However, significant architectural concerns remain:

- **Store monolith**: 3,498 lines, single file, `gameTickAction` alone is ~1,000 lines
- **Dead selector library**: 37 selectors exist but 0 are imported — 0% adoption
- **Header prop drilling**: DesktopHeader (35 props), MobileHeader (25 props)
- **`useCloudSync` is 375 lines** with 6 responsibilities and duplicated conflict-resolution logic
- **~160 hardcoded hex colors** across 38 files with no design tokens
- **5 Critical security issues** from prior audit remain unfixed

This report establishes the new baseline and re-evaluates the roadmap.

---

## 1. Current File Structure

### 1.1 Directory Tree (Key Directories Only)

```
src/
├── app/
│   ├── page.tsx                          # Game entry point (418 lines) ← Phase 1 win
│   ├── layout.tsx                        # Root layout
│   ├── globals.css                       # Global styles (~1,400 lines)
│   ├── admin/                            # Admin panel (9 pages)
│   │   ├── page.tsx                      # Dashboard
│   │   ├── login/page.tsx
│   │   ├── players/page.tsx + [id]/page.tsx
│   │   ├── investigations/page.tsx
│   │   ├── audit/page.tsx
│   │   ├── admin-audit/page.tsx
│   │   ├── config/page.tsx
│   │   ├── admins/page.tsx
│   │   └── auth/callback/route.ts
│   └── api/                              # API routes (24 endpoints)
│       ├── game/                         # Game state, action, compute, offline, trades, heartbeat, definitions
│       ├── admin/                        # Stats, players, investigations, actions, admin-actions
│       ├── auth/                         # me, callback
│       ├── config/                       # Table CRUD
│       ├── admins/                       # Admin CRUD
│       ├── health/
│       ├── icons/
│       ├── news-llm/
│       ├── player/
│       └── tables/
│
├── components/
│   ├── game/                             # 43 game panels + 7 shared = 50 files (28,823 lines)
│   │   ├── [43 Panel/Component files]    # Ranging from 2,327 to 11 lines
│   │   └── shared/                       # Reusable primitives
│   │       ├── GameCard.tsx              (48)
│   │       ├── GameIcon.tsx             (158)
│   │       ├── IconPreloader.tsx         (82)
│   │       ├── LoadingSpinner.tsx        (11)
│   │       ├── PanelStatCard.tsx         (56)
│   │       ├── tierColors.ts            (113)
│   │       └── useReducedMotion.ts       (33)
│   ├── providers/                        # 2 providers
│   │   ├── AuthProvider.tsx             (95)
│   │   └── GameConfigProvider.tsx       (201)
│   ├── ui/                               # 45 shadcn/ui components (untouched)
│   └── ErrorBoundary.tsx                (92)
│
├── lib/
│   ├── game/                             # Core game logic (15,995 lines)
│   │   ├── store.ts                     (3,498) ← GOD FILE
│   │   ├── data.ts                      (5,029) ← BUILDING/RESOURCE DEFINITIONS
│   │   ├── marketSimulator.ts           (1,140)
│   │   ├── serverEngine.ts             (1,031)
│   │   ├── newsBuilder.ts               (778)
│   │   ├── config.ts                    (661)
│   │   ├── productionCalculator.ts       (606)
│   │   ├── newsLLM.ts                   (595)
│   │   ├── types.ts                     (532)
│   │   ├── soundEngine.ts               (463)
│   │   ├── iconMap.ts                   (445)
│   │   ├── configCache.ts               (414)
│   │   ├── settingsStore.ts             (224)
│   │   ├── serverActions.ts             (192)
│   │   ├── buildingDiscovery.ts         (128)
│   │   ├── idMigration.ts              (114)
│   │   └── selectors/                   # ← 37 selectors, 0% adoption
│   │       ├── index.ts                 (18)
│   │       ├── buildingSelectors.ts      (33)
│   │       ├── progressionSelectors.ts   (29)
│   │       ├── resourceSelectors.ts      (25)
│   │       ├── marketSelectors.ts       (24)
│   │       └── powerSelectors.ts        (16)
│   ├── hooks/                            # 12 custom hooks (1,119 lines)
│   │   ├── useCloudSync.ts             (375) ← LARGEST HOOK
│   │   ├── useOnlinePresence.ts        (229)
│   │   ├── useAdminPresence.ts         (188)
│   │   ├── useKeyboardShortcuts.ts      (68)
│   │   ├── useHydration.ts              (38)
│   │   ├── useGlobalEventHandlers.ts    (41)
│   │   ├── useOfflineProgress.ts        (43)
│   │   ├── useDailyLogin.ts             (31)
│   │   ├── useAutosave.ts              (31)
│   │   ├── useMoneyGlow.ts             (25)
│   │   ├── useGameTick.ts              (30)
│   │   └── useAutoOpenGuide.ts          (20)
│   ├── auth/                             # 5 auth/security files
│   ├── config/                           # 1 table config
│   └── supabase/                         # 3 Supabase client/server/middleware
```

### 1.2 Major Architectural Changes from Phase 0 + Phase 1

| Change | Before | After | Impact |
|--------|--------|-------|--------|
| `page.tsx` line count | 1,246 | 418 | -66% — page is now orchestrator only |
| Full-store subscriptions | ~30 components | 0 | 100% selector adoption |
| Custom hooks | 4 inline effects | 12 extracted hooks | All effects testable, reusable |
| Dead code (GameHeader) | 556 lines | 0 | Deleted |
| Dead code (MobileNav) | 169 lines | 0 | Deleted |
| Dialog components | Inline in page | 3 extracted components | Isolated, testable |
| Header components | Inline in page | 3 extracted components | DesktopHeader, MobileHeader, HeaderAuth |
| Loading states | Inline in page | GameLoadingSkeleton component | Reusable |
| Game tick logic | Inline useEffect | useGameTick hook | Isolated, testable |
| Selector library | 0 selectors | 37 selectors | Created but NOT ADOPTED |

---

## 2. Component Size Audit

### 2.1 Top 20 Largest Components

| Rank | Component | Lines | Responsibility | Future Extraction Candidates |
|------|-----------|-------|---------------|------------------------------|
| 1 | `TransportPanel.tsx` | 2,327 | Transport line management, upgrades, stats | TransportLineCard, TransportStats, TransportUpgradeModal |
| 2 | `FactoryMapPanel.tsx` | 1,684 | Visual factory layout, drag-drop placement | FactoryGrid, FactoryNode, FactoryToolbar |
| 3 | `DashboardPanel.tsx` | 1,610 | Home dashboard with 10+ widgets | RankBar, WeatherInfoCard, IncomeChart, QuickStats, TopResources |
| 4 | `AIAdvisorPanel.tsx` | 1,229 | AI advisor with analysis tabs | AdvisorAnalysis, AdvisorRecommendations, AdvisorInsightCards |
| 5 | `MarketPanel.tsx` | 1,177 | Market trading, price charts, news | PriceChart, TradeForm, MarketNewsFeed, SectorTrends |
| 6 | `FactoryPanel.tsx` | 1,152 | Building list, upgrade, stats | BuildingCard, BuildingStats, UpgradeModal, TierFilter |
| 7 | `ResourcePanel.tsx` | 1,121 | Resource grid, capacity, auto-sell | ResourceGrid, ResourceCard, CapacityBar, AutoSellToggle |
| 8 | `PowerPanel.tsx` | 1,058 | Power grid, overload, statistics | PowerGridDiagram, PowerStats, PowerPlantCard |
| 9 | `SettingsPanel.tsx` | 1,039 | Game settings (audio, visual, save) | AudioSettings, VisualSettings, SaveSettings |
| 10 | `ResourceFlowPanel.tsx` | 1,028 | Resource flow visualization | FlowDiagram, FlowNode, FlowEdge |
| 11 | `GlobalResourceMonitorPanel.tsx` | 903 | All resources table + currency table | ResourceTable, CurrencyTable, FilterBar |
| 12 | `StoragePanel.tsx` | 874 | Storage upgrades, mega project storage | StorageGrid, UpgradeCard, MegaStorageStatus |
| 13 | `TradingPostPanel.tsx` | 762 | Trading post with server validation | TradeForm, TradeHistory, MarketPhaseIndicator |
| 14 | `AchievementPanel.tsx` | 748 | Achievement grid with progress | AchievementCard, AchievementProgress, AchievementFilter |
| 15 | `QuestPanel.tsx` | 737 | Quest list, tracking, rewards | QuestCard, QuestTracker, QuestRewardList |
| 16 | `WorkerPanel.tsx` | 661 | Worker hiring, assignment, levels | WorkerCard, WorkerAssignment, WorkerLevelUp |
| 17 | `StatisticsPanel.tsx` | 657 | Game statistics, production history | StatsGrid, ProductionHistory, StatChart |
| 18 | `BlueprintPanel.tsx` | 644 | Blueprint save/load/share | BlueprintCard, BlueprintEditor, BlueprintShare |
| 19 | `OnboardingPanel.tsx` | 597 | Tutorial/guide system | GuideStep, GuideProgress, GuideTip |
| 20 | `ProductionChainPanel.tsx` | 580 | Production chain visualization | ChainDiagram, ChainNode, ChainEdge |

### 2.2 Key Observations

- **Top 10 components total 12,595 lines** — 44% of all game component code
- **No component below 300 lines is a candidate for extraction** — they're appropriately sized
- **TransportPanel (2,327 lines)** is the largest component and has clear sub-component boundaries
- **DashboardPanel (1,610 lines)** has already been partially refactored (sub-components extracted) but is still monolithic
- **Average panel size**: 577 lines across 43 panels

### 2.3 File Size Distribution

| Size Range | Count | Files |
|-----------|-------|-------|
| 1,000+ lines | 10 | Transport, FactoryMap, Dashboard, AIAdvisor, Market, Factory, Resource, Power, Settings, ResourceFlow |
| 500–999 lines | 10 | GlobalMonitor, Storage, TradingPost, Achievement, Quest, Worker, Statistics, Blueprint, Onboarding, ProductionChain |
| 200–499 lines | 12 | FloatingActionButton, Drone, MegaProject, Contract, Prestige, DesktopHeader, Payout, Leaderboard, BottomNav, DailyRewards, Research, GameSidebar |
| Under 200 lines | 18 | NotificationCenter, CloudSyncBlock, MobileHeader, CelebrationOverlay, EventPanel, AutomationPanel, HeaderAuth, GameToast, FloatingNumbers, OfflineEarnings, GameItemTooltip, KeyboardShortcutsHelp, OnlineCount, AmbientParticles, ExportDialog, ImportDialog, GameLoadingSkeleton, shared/* |

---

## 3. Hook Architecture Audit

### 3.1 All Custom Hooks

| Hook | Lines | Responsibility | Dependencies | Store Usage | Risk |
|------|-------|---------------|-------------|-------------|------|
| `useCloudSync` | 375 | Cloud save/load, conflict resolution, blocked state, auto-save, legacy fallback | useAuth, useGameStore (30+ fields via getState) | 30+ fields via `getState()` | 🔴 **CRITICAL** — 6 responsibilities, duplicated logic |
| `useOnlinePresence` | 229 | Real-time online count via Supabase Presence | useAuth, supabase/client | None | 🟡 Embedded PresenceManager class (~140 lines) |
| `useAdminPresence` | 188 | Admin-specific presence tracking | supabase/client | None | 🟡 ~200 lines duplicated with useOnlinePresence |
| `useKeyboardShortcuts` | 68 | Global keyboard bindings | useGameStore (5 selectors) | setActiveTab, togglePause, setGameSpeed, selectBuilding, gameSpeed | 🟢 Small, focused. Couples to GameSidebar constant |
| `useHydration` | 38 | SSR hydration guard | useGameStore (persist API) | persist.hasHydrated() | 🟢 Clean |
| `useGlobalEventHandlers` | 41 | Prevent drag/contextmenu | None | None | 🟢 Clean |
| `useOfflineProgress` | 43 | Calculate + show offline earnings | useGameStore (3 selectors) | gameTick, buildings, calculateOfflineProgress | 🟢 Clean |
| `useDailyLogin` | 31 | Daily login check + dialog | useGameStore (2 selectors) | checkDailyLogin, loginStreak | 🟢 Clean |
| `useAutosave` | 31 | Show "saved" flash indicator | useGameStore (1 selector) | gameTick | 🟢 Clean. Name ambiguous with useCloudSync auto-save |
| `useMoneyGlow` | 25 | Flash on money increase | useGameStore (1 selector) | money | 🟢 Clean |
| `useGameTick` | 30 | Game loop interval | useGameStore (3 selectors) | gameSpeed, prestigeState.bonuses, paused | 🟢 Clean |
| `useAutoOpenGuide` | 20 | Open guide for new players | useGameStore (3 selectors) | buildings, gameTick, setActiveTab | 🟢 Clean |

### 3.2 Hooks Growing Too Large

**🔴 `useCloudSync` (375 lines)** — The only hook that qualifies as "too large."

| Responsibility | Approx Lines | Extractable? |
|---------------|-------------|-------------|
| Save to cloud (primary endpoint) | ~100 | ✅ → `useCloudSave` or `cloudSave()` utility |
| Blocked-state detection | ~40 | ✅ → `useCloudBlockState` |
| Load from cloud + conflict resolution | ~130 | ✅ → `useCloudLoad` + `resolveConflict()` utility |
| Legacy `/api/player` fallback | ~70 | ✅ → Remove or extract to strategy |
| Auto-save interval | ~25 | ✅ → `useCloudAutoSave` |
| Auto-load on login | ~20 | ✅ → Part of `useCloudLoad` |

**Critical issue**: `loadFromCloud` contains ~120 lines of conflict-resolution logic duplicated verbatim between primary and fallback paths.

**Also critical**: Hook manually serializes 30+ fields from store. If any field is added to the store but forgotten here, cloud saves silently lose data.

### 3.3 Consolidation Candidates

| Pair | Shared Lines | Recommendation |
|------|-------------|---------------|
| `useOnlinePresence` ↔ `useAdminPresence` | ~200 lines | Extract `BasePresenceManager` factory. Both hooks instantiate with config options. |
| `useDailyLogin` ↔ `useOfflineProgress` | Pattern only | Same "check-on-mount → open-dialog" boilerplate. Not worth consolidating — logic differs. |
| `useAutosave` ↔ `useCloudSync` auto-save | Conceptual | Rename `useAutosave` → `useLocalSaveIndicator` to clarify scope. |

### 3.4 DOM-Accessing vs State-Only Hooks

| Category | Hooks | Count |
|----------|-------|-------|
| **DOM-accessing** | useGlobalEventHandlers, useKeyboardShortcuts, useOnlinePresence | 3 |
| **State-only** | useCloudSync, useDailyLogin, useHydration, useGameTick, useAutoOpenGuide, useMoneyGlow, useOfflineProgress, useAdminPresence, useAutosave | 9 |

---

## 4. State Architecture Audit

### 4.1 Zustand Store Structure

| Metric | Value |
|--------|-------|
| File | `src/lib/game/store.ts` |
| Lines | 3,498 |
| State properties | 28 top-level slices |
| Actions | 42 |
| Save version | 19 |
| Middleware | `persist()` with custom `debouncedPersistStorage` (5s debounce) |
| Resource types | 67 (T0–T5) |

**The store is a God File.** It contains:
- All state declarations
- All 42 actions
- The entire `gameTickAction` (~1,000 lines) — the game engine
- Save migration logic (19 versions)
- Persist middleware configuration
- Helper utilities (formatNumber, etc.)

### 4.2 Selector Adoption

| Pattern | Count | Status |
|---------|-------|--------|
| Files using `useGameStore(s => s.xxx)` | 41 | ✅ 100% adoption |
| Files using `useGameStore()` (full store) | 0 | ✅ Eliminated |
| Named selectors in `selectors/` directory | 37 | ⚠️ **0% imported** |

**The selector library exists but is completely unused.** Every component still uses inline `s => s.prop` patterns. The selectors provide zero runtime benefit today.

### 4.3 Derived Selector Opportunities

These values are recomputed independently in multiple components:

| Computation | Locations | Times Computed | Recommended Selector |
|-------------|-----------|----------------|---------------------|
| `powerPercent` | page.tsx, DashboardPanel | 2× | `selectPowerPercent` |
| `incomePerMinute` | page.tsx, PayoutPanel | 2× (different formulas!) | `selectIncomePerMinute` |
| `factoryEfficiency` | page.tsx (passed to headers) | 1× computed, 2× consumed | `selectFactoryEfficiency` |
| Active buildings filter | FactoryPanel, DashboardPanel, PowerPanel, page.tsx, AchievementPanel | 5+× | `selectActiveBuildings` (exists but unused) |
| Buildings by category | TransportPanel, FactoryMapPanel, AchievementPanel, PowerPanel, AIAdvisorPanel | 8+× | `selectBuildingsByCategory` (exists but unused) |
| `hasUnlimitedStorage` check | Store utility, resourceSelectors, StoragePanel, ResourcePanel | 4+× | Already in selectors |

### 4.4 Co-Accessed Properties (Selector Bundles)

| Bundle | Properties | Consumer Count |
|--------|-----------|----------------|
| Economy | money, buildings, powerGrid, productionSnapshot | ~12 components |
| Resources | resources, resourceCapacity, megaProjects | ~8 components |
| Research | completedResearch, prestigeState, researchPoints | ~9 components |
| Building+Action | buildings, buildBuilding, upgradeBuilding, toggleBuilding | ~5 components |
| Dashboard | 17 properties | 1 component (but 17 selectors!) |

### 4.5 Performance Concerns

| Concern | Severity | Details |
|---------|----------|---------|
| **Dead selector library** | 🔴 High | 37 selectors exist, 0 imported. All inline `s => s.prop` patterns provide no derived computation benefit |
| **`buildings` array** | 🟡 Medium | Subscribed by 18 components. Every building mutation re-renders all 18 |
| **`productionSnapshot`** | 🟡 Medium | Rewritten every tick (new object reference). 7 subscribers re-render every frame |
| **No `useShallow`** | 🟡 Medium | Zero usage of `zustand/react/shallow`. Components selecting multiple primitives could benefit |
| **DashboardPanel 17 selectors** | 🟡 Medium | Most change every tick. Panel re-renders on nearly every tick regardless of selector optimization |
| **Persist debounce** | 🟢 Low | 5-second window for data loss on crash. Mitigated by `beforeunload` handler |

### 4.6 Settings Store

| Metric | Value |
|--------|-------|
| File | `src/lib/game/settingsStore.ts` |
| Lines | 225 |
| State properties | 17 |
| Actions | 21 |
| Persist | Default JSON storage (no debounce — appropriate for small, infrequent writes) |

---

## 5. Technical Debt Audit

### 🔴 CRITICAL — Must Fix Before Future Features

| ID | Issue | File | Impact |
|----|-------|------|--------|
| C1 | Hardcoded HMAC fallback secret | `gameStateValidator.ts:56` | Anyone can forge anti-cheat checksums |
| C2 | `isAccountLocked` returns `false` on DB errors (fail-open) | `gameStateValidator.ts:298-316` | Banned users unlocked during DB outages |
| C3 | Unvalidated save import (no bounds) | `store.ts:2412-2455` | Accepts Infinity, negative, arbitrary keys |
| C4 | `setGameSpeed` accepts any number | `store.ts:1804` | Speed=1000 crashes browser |
| C5 | Trading Post bypasses server validation | `TradingPostPanel.tsx` | Client-only mutations, zero server validation |
| C6 | 8 `console.log` in production code | configCache, config, newsLLM, GameConfigProvider, IconPreloader | Exposes internal state to DevTools |

### 🟠 HIGH — Should Fix Soon

| ID | Issue | File | Impact |
|----|-------|------|--------|
| H1 | DashboardPanel 29 individual selectors | `DashboardPanel.tsx` | Still re-renders on nearly every tick |
| H2 | In-memory rate limiter | `rateLimiter.ts` | Doesn't scale across instances |
| H3 | TOCTOU race in cheat flagging | `gameStateValidator.ts:322-372` | Concurrent requests lose increments |
| H4 | 14 dead action types | `api/game/action/route.ts` | Always return "Unhandled action" |
| H5 | `solarPanel` naming collision | `types.ts:34-35` | Building misclassification bugs |
| H6 | DesktopHeader 35 props, MobileHeader 25 props | DesktopHeader, MobileHeader, page.tsx | Worst prop drilling in codebase |
| H7 | ~160 hardcoded hex colors across 38 files | All game panels + admin | No design tokens, theme changes require find-replace |
| H8 | 4 unprotected API routes | /api/game/definitions, /api/news-llm, /api/icons, /api/config | No auth, no rate limiting |
| H9 | Stale Prisma schema + unused db.ts | db.ts, schema.prisma | Prisma in production deps, never used |

### 🟡 MEDIUM — Future Cleanup

| ID | Issue | File |
|----|-------|------|
| M1 | Config updates don't trigger re-renders | configCache.ts |
| M2 | Hardcoded income rates in tooltip | page.tsx:245-247 |
| M3 | Inaccurate rpPerTick calculation | DashboardPanel.tsx:122-124 |
| M4 | Meaningless storageUtilization | DashboardPanel.tsx:178-184 |
| M5 | Admin auth via env var allowlist | middleware.ts |
| M6 | Weak blueprint import validation | store.ts:3274-3277 |
| M7 | 6 `any` type usages | HeaderAuth, DesktopHeader, MobileHeader, useOnlinePresence, config/route |
| M8 | PrestigeBonus.effect.type is `string` | types.ts:234 |
| M9 | Duplicate formatActionType + admin layouts | audit pages |
| M10 | 1 TODO comment | gameStateValidator.ts:385 |
| M11 | 18+ Math.random() usages for IDs | store, newsBuilder, marketSimulator, admin pages |
| M12 | 40 shadcn/ui components, many unused | components/ui/ |

### 🟢 LOW — Optional

| ID | Issue | File |
|----|-------|------|
| L1 | KEY_TAB_MAP incomplete (10 of 25+ tabs) | GameSidebar.tsx |
| L2 | topResources shows only raw materials | DashboardPanel.tsx:66 |
| L3 | quickTradeAmounts never updates | TradingPostPanel.tsx |
| L4 | handleReset uses confirm() | page.tsx:194 |
| L5 | prisma in dependencies, not devDependencies | package.json |
| L6 | Debounced persist 5s data loss risk | store.ts |

---

## 6. Updated Roadmap Recommendation

### 6.1 Re-evaluation of Original Phases

The original roadmap was:

```
Phase 0 (Foundation) → Phase 1 (Design System) → Phase 2 (Navigation) →
Phase 3 (Panel Migration) → Phase 4 (Mobile) → Phase 5 (Panel Merge) → Phase 6 (Polish)
```

Phase 0 and Phase 1 are complete. Here's my assessment of the remaining phases against the **current** codebase state:

| Original Phase | Still Valid? | Assessment |
|---------------|-------------|------------|
| Phase 1 (Design System) | ⚠️ **Needs revision** | Original scope was design tokens + composites. 160 hardcoded colors remain, but header extraction is done. Composites can wait. |
| Phase 2 (Navigation) | ❌ **Not recommended next** | User explicitly forbids navigation redesign. Risk of confusing existing players. |
| Phase 3 (Panel Migration) | ⚠️ **Too risky now** | Touches all 31 panels. Selector library is dead (0% adoption). Need to activate selectors first. |
| Phase 4 (Mobile) | ❌ **Not yet** | User explicitly forbids mobile redesign. Depends on Phase 2+3. |
| Phase 5 (Panel Merge) | ❌ **Not yet** | Depends on Phase 3. Premature. |
| Phase 6 (Polish) | ❌ **Not yet** | Depends on everything. |

### 6.2 Recommended New Phase Sequence

Based on the actual codebase state, I recommend the following revised phases:

---

#### **Phase 1B: Security Hardening** (NEW — highest priority)

| Aspect | Details |
|--------|---------|
| **Objective** | Fix the 5 Critical + 3 High security issues before building anything new |
| **Scope** | C1–C6 (Critical), H2–H4 (High security items) |
| **Expected Value** | Prevents cheating, data corruption, and security exploits. Foundation of trust. |
| **Risk** | Low — targeted fixes, no UI changes |
| **Effort** | 2-3 days |
| **Dependencies** | None — can start immediately |
| **Items** | |
| | 1. Remove HMAC fallback secret (C1) |
| | 2. Fix isAccountLocked fail-open → fail-closed (C2) |
| | 3. Add bounds validation to importSave (C3) |
| | 4. Add speed validation to setGameSpeed (C4) |
| | 5. Fix Trading Post server integration (C5) |
| | 6. Remove console.log statements (C6) |
| | 7. Add rate limiting to unprotected routes (H8) |
| | 8. Fix TOCTOU race with atomic increment (H3) |
| | 9. Remove dead action types (H4) |
| **Go/No-Go** | All Critical items must pass security review before proceeding |

---

#### **Phase 1C: Dead Code Cleanup + Selector Activation**

| Aspect | Details |
|--------|---------|
| **Objective** | Remove technical debt that blocks future work; activate the dead selector library |
| **Scope** | Remove Prisma (H9), activate selectors, extract design tokens (H7), clean up `any` types (M7) |
| **Expected Value** | Unblocks Panel Migration phase; makes color theming possible; reduces confusion |
| **Risk** | Low — removing dead code and wiring up existing selectors |
| **Effort** | 3-4 days |
| **Dependencies** | None — can start immediately (parallel with 1B) |
| **Items** | |
| | 1. Remove stale Prisma schema + db.ts (H9) |
| | 2. Wire up existing selectors from selectors/ directory into components (replace inline `s => s.prop`) |
| | 3. Add missing derived selectors (selectPowerPercent, selectFactoryEfficiency, selectIncomePerMinute) |
| | 4. Extract ~160 hardcoded hex colors to Tailwind config tokens (H7) |
| | 5. Replace 6 `any` types with proper interfaces (M7) |
| | 6. Audit and remove unused shadcn/ui components (M12) |
| | 7. Consolidate useOnlinePresence + useAdminPresence (eliminate ~200 lines duplication) |
| | 8. Decompose useCloudSync into focused modules |
| **Go/No-Go** | Selector adoption must reach >50% before Phase 2 starts |

---

#### **Phase 2: Header Refactor** (Revised — was Navigation Redesign)

| Aspect | Details |
|--------|---------|
| **Objective** | Reduce header prop drilling (35+25 props) and prepare header for future customization |
| **Scope** | Extract `useHeaderState()` hook, reduce DesktopHeader to composable sub-components |
| **Expected Value** | -60% prop count, enables future header customization without touching page.tsx |
| **Risk** | Low — visual behavior unchanged, internal refactoring only |
| **Effort** | 2-3 days |
| **Dependencies** | Phase 1C (selectors must be active for clean hook) |
| **Items** | |
| | 1. Create `useHeaderState()` hook that composes all header data from selectors |
| | 2. Split DesktopHeader into: HeaderStats, HeaderEconomy, HeaderControls, HeaderIndicators, HeaderNotifications, HeaderAuth |
| | 3. Reduce MobileHeader props similarly |
| | 4. page.tsx header section → `<DesktopHeader />` + `<MobileHeader />` with minimal props |
| **Go/No-Go** | Visual regression test: headers must look identical before and after |

---

#### **Phase 3: Top-10 Panel Refactor** (Revised — was all 31 panels)

| Aspect | Details |
|--------|---------|
| **Objective** | Refactor the 10 largest panels (10,000+ lines total) using shared composites |
| **Scope** | TransportPanel, FactoryMapPanel, DashboardPanel, AIAdvisorPanel, MarketPanel, FactoryPanel, ResourcePanel, PowerPanel, SettingsPanel, ResourceFlowPanel |
| **Expected Value** | -30% lines in top 10 panels, consistent UX patterns, better shared component reuse |
| **Risk** | Medium — touches high-traffic panels, but each panel is independently deployable |
| **Effort** | 5-7 days |
| **Dependencies** | Phase 1C (design tokens), Phase 2 (header components may share patterns) |
| **Go/No-Go** | Each panel must pass visual regression check before merging |

---

#### **Phase 4: Store Decomposition**

| Aspect | Details |
|--------|---------|
| **Objective** | Break the 3,498-line God Store into domain slices |
| **Scope** | Extract: economySlice, buildingSlice, researchSlice, marketSlice, etc. |
| **Expected Value** | -70% store file size, each slice independently testable, enables tree-shaking |
| **Risk** | Medium-High — touches core game logic, migration path must be carefully planned |
| **Effort** | 5-7 days |
| **Dependencies** | Phase 1C (selectors must be active), Phase 3 (panels must use selectors, not direct store access) |
| **Go/No-Go** | All 42 actions must pass unit tests; gameTickAction must be unchanged in behavior |

---

#### **Phase 5: Mobile Optimization** (Deferred from original Phase 4)

| Aspect | Details |
|--------|---------|
| **Objective** | Optimize mobile UX without redesigning navigation |
| **Scope** | Mobile header height reduction, text legibility fixes, touch target compliance |
| **Expected Value** | +12pp mobile viewport, 14px minimum text, WCAG touch targets |
| **Risk** | Medium — mobile changes affect the majority of players |
| **Effort** | 5 days |
| **Dependencies** | Phase 2 (header refactor), Phase 3 (panel refactor) |

---

#### **Phase 6: Polish & Scale** (Same as original)

| Aspect | Details |
|--------|---------|
| **Objective** | Framer Motion transitions, keyboard accessibility, ARIA improvements |
| **Scope** | Animation polish, accessibility audit, performance optimization |
| **Expected Value** | Better perceived performance, WCAG AA compliance |
| **Risk** | Low — additive only |
| **Effort** | 4 days |
| **Dependencies** | All prior phases |

---

### 6.3 Phase Comparison Matrix

| Phase | Value | Risk | Effort | Dependencies | ROI Rank |
|-------|-------|------|--------|-------------|----------|
| **1B: Security** | Critical — prevents cheating | Low | 2-3d | None | 🏆 1 |
| **1C: Dead Code + Selectors** | High — unblocks Phase 2+3 | Low | 3-4d | None | 2 |
| **2: Header Refactor** | Medium — developer productivity | Low | 2-3d | 1C | 3 |
| **3: Top-10 Panels** | High — consistency + maintainability | Medium | 5-7d | 1C, 2 | 4 |
| **4: Store Decomposition** | High — testability + tree-shaking | Med-High | 5-7d | 1C, 3 | 5 |
| **5: Mobile Optimization** | High — player-facing | Medium | 5d | 2, 3 | 6 |
| **6: Polish** | Low — nice-to-have | Low | 4d | All | 7 |

### 6.4 Key Insight: The Original Roadmap Was Wrong

The original Phase 2 (Navigation Redesign) was the **riskiest and least necessary** next step. The codebase has more pressing concerns:

1. **Security holes** are actively exploitable — any player can forge checksums, bypass account locks, crash the browser with speed=1000
2. **Dead selector library** means Phase 3 (Panel Migration) cannot safely proceed — panels would need to be migrated twice
3. **Header prop drilling** (35+25 props) makes any header-related feature painful to add
4. **God Store** (3,498 lines) makes any game logic change high-risk

The revised sequence addresses these in order of urgency and dependency chain, with each phase unlocking the next.

---

## Appendix A: File Count Summary

| Directory | Files | Total Lines |
|-----------|-------|------------|
| `src/components/game/` (panels) | 43 | 28,823 |
| `src/components/game/shared/` | 7 | 501 |
| `src/components/providers/` | 2 | 296 |
| `src/components/ui/` | 45 | ~5,000 (shadcn) |
| `src/lib/game/` (logic) | 16 | 15,995 |
| `src/lib/game/selectors/` | 6 | 145 |
| `src/lib/hooks/` | 12 | 1,119 |
| `src/lib/auth/` | 5 | ~800 |
| `src/app/api/` | 24 routes | ~3,000 |
| `src/app/admin/` | 9 pages | ~5,000 |
| **Total** | **~170** | **~60,000** |

## Appendix B: Metrics Dashboard

| Metric | Value | Trend |
|--------|-------|-------|
| `page.tsx` lines | 418 | ↓ from 1,246 (-66%) |
| Full-store subscriptions | 0 | ↓ from ~30 (100% fixed) |
| Custom hooks | 12 | ↑ from 4 (+200%) |
| Dead code lines removed | 745+ | ✅ |
| Selector library adoption | 0% | ❌ Needs work |
| Critical security issues | 6 | ❌ Unfixed |
| Hardcoded hex colors | ~160 | ❌ Unfixed |
| God Store size | 3,498 lines | ❌ Unfixed |
| Largest hook | useCloudSync (375 lines) | ❌ Needs decomposition |
| Header prop count | 35 + 25 | ❌ Needs reduction |
