# IndustriaX — UI Implementation Execution Plan

> **Version**: 1.0  
> **Date**: 2025-01-13  
> **Status**: DRAFT — Awaiting Approval  
> **Companion Document**: `UI_ARCHITECTURE_BLUEPRINT.md`
>
> **STATUS NOTICE — SUPERSEDED**  
> This document has been classified as **SUPERSEDED** in `planning/DOCUMENT_INVENTORY.md` (June 2026 audit).  
> Date written: 2025-01-13. Status was "DRAFT — Awaiting Approval."  
> Never implemented. For the canonical project status, see [PROJECT_STATUS_SOURCE_OF_TRUTH.md](./PROJECT_STATUS_SOURCE_OF_TRUTH.md).

---

## Executive Summary

This plan transforms the UI Architecture Blueprint into 7 executable phases with explicit go/no-go gates. Each phase is designed to be independently deployable — if any phase fails validation, it can be rolled back without affecting prior phases.

**Codebase under modification**: 43,546 lines across `src/components/game/` (27,696) + `src/lib/game/` (15,850)

---

## Dependency Map

```
Phase 0 (Foundation)
  │
  ├──► Phase 1 (Design System) ──► Phase 3 (Panel Migration)
  │                                      │
  ├──► Phase 2 (Navigation)              │
  │       │                              │
  │       └──────────────────────────────┘
  │                      │
  │                      ▼
  │               Phase 4 (Mobile Optimization)
  │                      │
  │                      ▼
  │               Phase 5 (Panel Merge + Dedup)
  │                      │
  │                      ▼
  └────────────────► Phase 6 (Polish & Scale)
```

### Independence / Blocking Summary

| Phase | Can Start Independently? | Blocks | Blocked By | Highest ROI? | Highest Risk? |
|-------|-------------------------|--------|------------|-------------|---------------|
| **Phase 0** | ✅ Yes — no prerequisites | 1, 2, 3, 4, 5, 6 | None | 🏆 **YES** — unlocks all other phases + immediate perf gain | Low |
| **Phase 1** | ❌ No — needs Phase 0 selectors | 3, 4 | Phase 0 | High — enables all panel migration | Low |
| **Phase 2** | ⚠️ Partially — needs Phase 0 header fix | 4 | Phase 0 (header) | High — mobile nav overhaul | Medium |
| **Phase 3** | ❌ No — needs Phase 1 composites | 4, 5 | Phase 0, 1 | High — consistency across all panels | Medium |
| **Phase 4** | ❌ No — needs Phase 2 nav + Phase 3 panels | 6 | Phase 0, 2, 3 | 🏆 **YES** — biggest player-facing impact | Medium |
| **Phase 5** | ❌ No — needs Phase 3 migration | 6 | Phase 3 | Medium — code reduction | Low |
| **Phase 6** | ❌ No — needs Phase 5 | None | Phase 4, 5 | Low — nice-to-have | Low |

### ROI Ranking (Highest to Lowest)

| Rank | Phase | ROI Rationale |
|------|-------|--------------|
| 1 | **Phase 0** | 83% reduction in unnecessary re-renders, unblocks everything, lowest risk, fastest to complete |
| 2 | **Phase 4** | Biggest player-facing change: -50% build taps, +12pp mobile viewport, contextual prompts |
| 3 | **Phase 1** | Enables Phase 3+4, eliminates 170+ hardcoded colors, creates reusable composites |
| 4 | **Phase 2** | -60% visible tabs for new players, 5+More nav pattern, progressive unlocking |
| 5 | **Phase 3** | Consistency across all 31 panels, but primarily developer-facing improvement |
| 6 | **Phase 5** | ~2,000 lines removed from Factory+Resource merge, developer productivity |
| 7 | **Phase 6** | Polish and nice-to-haves, lowest urgency |

### Risk Ranking (Highest to Lowest)

| Rank | Phase | Risk Rationale |
|------|-------|---------------|
| 1 | **Phase 3** | Touches ALL 31 panels — widest blast radius, highest chance of visual regression |
| 2 | **Phase 4** | Mobile adaptations remove SVG views (Transport, FactoryMap), changes core gameplay UX |
| 3 | **Phase 2** | Navigation restructuring could confuse existing players; progressive unlock needs tuning |
| 4 | **Phase 5** | Merging Factory+Resource panels is complex; one component serves two distinct data sources |
| 5 | **Phase 1** | Design token migration could break styles; composites must exactly match current visuals |
| 6 | **Phase 0** | Selective selector migration is mechanical; header unification removes duplicate code |
| 7 | **Phase 6** | Low risk — additive features and polish only |

---

## Phase 0 — Critical Foundation

### Objective
Eliminate the performance bottleneck (full-store subscriptions), remove duplicate code (header, game loop), and delete dead code. This phase unlocks all subsequent work.

### Scope

| Task | Description | Lines Changed |
|------|-------------|---------------|
| 0A | Create `selectors/` directory with named selectors for all game systems | +350 new |
| 0B | Migrate all 30 panels from `useGameStore()` to selective selectors | ~60 lines per panel |
| 0C | Extract game tick loop from page.tsx → `useGameTick.ts` hook | +80 new, -100 from page.tsx |
| 0D | Unify header: integrate GameHeader.tsx, remove inline header from page.tsx | -500 from page.tsx |
| 0E | Delete dead `MobileNav` component from GameSidebar.tsx | -80 lines |
| 0F | Delete dead `SPEED_OPTIONS` duplicate in GameHeader.tsx | -5 lines |
| 0G | Delete dead Export/Import dialog duplicate in page.tsx (use GameHeader's) | -150 lines |

### Files Affected

| File | Action | Risk |
|------|--------|------|
| `src/lib/game/selectors/index.ts` | CREATE | None |
| `src/lib/game/selectors/resourceSelectors.ts` | CREATE | None |
| `src/lib/game/selectors/buildingSelectors.ts` | CREATE | None |
| `src/lib/game/selectors/marketSelectors.ts` | CREATE | None |
| `src/lib/game/selectors/powerSelectors.ts` | CREATE | None |
| `src/lib/game/selectors/progressionSelectors.ts` | CREATE | None |
| `src/lib/hooks/useGameTick.ts` | CREATE | Low |
| `src/app/page.tsx` | MAJOR EDIT (1,265 → ~400 lines) | Medium |
| `src/components/game/GameHeader.tsx` | EDIT (integrate into page.tsx) | Medium |
| `src/components/game/GameSidebar.tsx` | EDIT (remove MobileNav, ~-80 lines) | Low |
| All 31 panel components | EDIT (selector migration) | Low |

### Dependencies
- None — this is the starting phase

### Risk Level: 🟢 LOW

The selector migration is mechanical (find-replace pattern). The header unification removes duplicate code rather than creating new code. The game tick extraction is a straightforward hook extraction.

**Specific risk**: The header unification (0D) is the riskiest item because page.tsx's inline header has diverged from GameHeader.tsx — some features exist only in one version. Must audit both headers carefully before merging.

### Validation Steps

1. **Selector correctness**: After migration, all panels must render identical data. Test by:
   - Starting a new game → verify Dashboard shows correct money/resources
   - Building an extractor → verify ResourcePanel shows correct production
   - Trading on market → verify MarketPanel shows correct prices
   - Starting research → verify ResearchPanel shows correct progress

2. **Performance verification**: React DevTools Profiler comparison
   - Before: all panels re-render on every tick
   - After: only panels with changed data re-render
   - Target: <5 panel re-renders per tick at 1x speed

3. **Header parity**: Side-by-side comparison of old inline header vs unified GameHeader
   - All stats visible (Money, Power, RP, CP)
   - Speed controls functional
   - Export/Import dialogs working
   - Cloud sync status correct
   - Auth menu working
   - News ticker scrolling (desktop)

4. **No regressions**:
   - `bun run lint` — 0 new errors
   - No console errors in browser
   - Game tick continues at correct speed
   - Save/load functionality intact

### Rollback Plan

Each sub-task (0A-0G) can be rolled back independently:
- **0A (selectors)**: Revert is trivial — delete the new directory. Old `useGameStore()` calls still work.
- **0B (panel migration)**: Each panel can be individually reverted to `const store = useGameStore()`. Keep a list of migrated panels for targeted rollback.
- **0C (game tick)**: Move the hook code back into page.tsx. Keep the extracted hook file as backup.
- **0D (header)**: Revert page.tsx to inline header. GameHeader.tsx is preserved in git history.
- **0E-0G (deletions)**: Git revert restores deleted code.

**Full rollback**: `git revert` on the Phase 0 commit. Zero risk of partial state.

### Estimated Effort: 2-3 days

| Task | Hours | Notes |
|------|-------|-------|
| 0A: Create selectors | 4h | Straightforward, ~10 selectors per file |
| 0B: Migrate 31 panels | 8h | ~15 min per panel, mechanical |
| 0C: Extract game tick | 2h | Simple hook extraction |
| 0D: Unify header | 6h | Careful audit + merge of diverged features |
| 0E-0G: Delete dead code | 1h | Trivial deletions |
| Testing + validation | 4h | Manual testing of all panels |
| **Total** | **25h (~3 days)** | |

### Expected Outcome

- page.tsx reduced from 1,265 → ~400 lines (-68%)
- 83% reduction in unnecessary re-renders per tick
- Single source of truth for header and game loop
- Named selectors enable efficient panel migration in Phase 3
- Dead code eliminated (MobileNav, duplicate SPEED_OPTIONS, duplicate dialogs)

### Go / No-Go Criteria

| Criterion | Must Pass |
|-----------|-----------|
| All 31 panels render identical data before and after | ✅ |
| React Profiler shows <5 panel re-renders per tick at 1x | ✅ |
| No new lint errors | ✅ |
| No console errors in browser (desktop + mobile viewport) | ✅ |
| page.tsx < 500 lines | ✅ |
| Game tick runs at correct speed (no timing drift) | ✅ |
| Save/load works (localStorage + cloud sync) | ✅ |
| Header shows all stats, controls, auth | ✅ |

---

## Phase 1 — Design System Foundation

### Objective
Establish the design token system and create the 6 core composite components that will be used by all panel migrations in Phase 3.

### Scope

| Task | Description | Lines Changed |
|------|-------------|---------------|
| 1A | Create `tokens.ts` with JS-accessible design tokens | +120 new |
| 1B | Create `PanelShell` composite | +80 new |
| 1C | Create `PanelHeader` composite | +100 new |
| 1D | Create `ResourceBar` composite with color thresholds | +120 new |
| 1E | Create `SectionHeader` composite | +50 new |
| 1F | Create `StatRow` composite | +60 new |
| 1G | Create `EmptyState` composite | +50 new |
| 1H | Create `colorThresholds.ts` utility | +40 new |
| 1I | Create barrel export `composites/index.ts` | +20 new |
| 1J | Migrate 3 pilot panels to composites (Research, Leaderboard, Achievements) | ~-90 net |
| 1K | Migrate 170+ hardcoded `bg-[#111827]` / `bg-[#0a0e17]` to `bg-card` / `bg-background` | ~170 lines across 34 files |
| 1L | CSS cleanup: remove 6 duplicate rule blocks from globals.css | ~-30 lines |

### Files Affected

| File | Action | Risk |
|------|--------|------|
| `src/lib/theme/tokens.ts` | CREATE | None |
| `src/lib/theme/colorThresholds.ts` | CREATE | None |
| `src/components/game/composites/PanelShell.tsx` | CREATE | None |
| `src/components/game/composites/PanelHeader.tsx` | CREATE | None |
| `src/components/game/composites/ResourceBar.tsx` | CREATE | None |
| `src/components/game/composites/SectionHeader.tsx` | CREATE | None |
| `src/components/game/composites/StatRow.tsx` | CREATE | None |
| `src/components/game/composites/EmptyState.tsx` | CREATE | None |
| `src/components/game/composites/index.ts` | CREATE | None |
| `src/components/game/ResearchPanel.tsx` | EDIT | Low |
| `src/components/game/LeaderboardPanel.tsx` | EDIT | Low |
| `src/components/game/AchievementPanel.tsx` | EDIT | Low |
| 34 files with hardcoded colors | EDIT | Low |
| `src/app/globals.css` | EDIT | Low |

### Dependencies
- **Phase 0** (selectors) — pilot panels should already use selective selectors

### Risk Level: 🟢 LOW

All new files are additive — they don't modify existing functionality. The pilot migration targets 3 simple panels (Research 277 lines, Leaderboard 324 lines, Achievement 726 lines). Hardcoded color migration is a find-replace operation.

**Specific risk**: The `ResourceBar` composite must exactly replicate the color-threshold logic currently implemented ~40 times across the codebase. If the threshold boundaries differ even slightly between panels, the unified version must support all variants.

### Validation Steps

1. **Composite rendering**: Each composite renders correctly in isolation
   - PanelShell: default, compact, full-height variants
   - PanelHeader: with/without icon, badge, actions
   - ResourceBar: 0%, 25%, 50%, 75%, 95% fill with correct colors
   - SectionHeader: with/without icon, action
   - StatRow: 2-col mobile, 4-col desktop
   - EmptyState: with/without CTA button

2. **Pilot panel visual parity**: Side-by-side screenshots of 3 pilot panels before/after
   - Pixel-level comparison acceptable within 2px tolerance
   - All interactive elements (buttons, tabs, toggles) functional

3. **Hardcoded color audit**: Zero remaining instances of `bg-[#111827]` and `bg-[#0a0e17]` in codebase
   - `rg "bg-\[#111827\]" src/` → 0 results
   - `rg "bg-\[#0a0e17\]" src/` → 0 results

4. **CSS cleanup**: No duplicate rule blocks in globals.css
   - `.game-card:hover` appears exactly once
   - `.game-card-premium:hover` appears exactly once
   - `.game-scrollbar` appears exactly once

5. **No regressions**: `bun run lint` — 0 new errors

### Rollback Plan

- **New files (1A-1I)**: Delete the composites/ directory and theme/ directory. No existing code depends on them yet (pilot panels would need reverting).
- **Pilot migration (1J)**: Git revert the 3 pilot panels. They revert to raw CSS + inline patterns.
- **Color migration (1K)**: Git revert the 34 files. Hardcoded colors return.
- **CSS cleanup (1L)**: Git revert globals.css. Duplicate rules return.

**Full rollback**: `git revert` on the Phase 1 commit.

### Estimated Effort: 2-3 days

| Task | Hours | Notes |
|------|-------|-------|
| 1A: tokens.ts | 2h | Token mapping from Blueprint §3 |
| 1B-1G: 6 composites | 10h | ~1.5h each, careful API design |
| 1H: colorThresholds utility | 1h | Straightforward utility |
| 1I: barrel export | 0.5h | Trivial |
| 1J: 3 pilot panels | 4h | ~1.5h each |
| 1K: hardcoded color migration | 3h | Find-replace across 34 files + visual check |
| 1L: CSS cleanup | 1h | Remove 6 duplicate blocks |
| Testing + validation | 3h | Visual comparison + lint |
| **Total** | **24.5h (~3 days)** | |

### Expected Outcome

- 6 reusable composites ready for Phase 3 mass migration
- 170+ hardcoded colors replaced with semantic tokens
- 3 pilot panels using composites (proving the pattern works)
- CSS duplicates eliminated
- Design token system established for future theming

### Go / No-Go Criteria

| Criterion | Must Pass |
|-----------|-----------|
| All 6 composites render correctly in isolation | ✅ |
| 3 pilot panels visually identical (≤2px tolerance) | ✅ |
| Zero hardcoded `bg-[#111827]` / `bg-[#0a0e17]` in source | ✅ |
| Zero duplicate CSS rules in globals.css | ✅ |
| `bun run lint` — 0 new errors | ✅ |
| No console errors in browser | ✅ |

---

## Phase 2 — Navigation Redesign

### Objective
Restructure navigation to reduce cognitive load: 5+More bottom nav on mobile, progressive tab unlocking, and NavData-driven navigation architecture.

### Scope

| Task | Description | Lines Changed |
|------|-------------|---------------|
| 2A | Create `NavData.ts` with unlock conditions and priority metadata | +200 new |
| 2B | Update `GameSidebar.tsx` to use NavData + render lock icons for locked tabs | ~80 modified |
| 2C | Redesign `BottomNavigationBar.tsx` to 5+More pattern | ~200 modified |
| 2D | Create `MoreNavSheet.tsx` bottom sheet for secondary navigation | +120 new |
| 2E | Implement tab unlock logic in page.tsx `renderPanel()` — hide locked tabs | ~30 modified |
| 2F | Create "Show All Tabs" toggle in SettingsPanel | +20 new |
| 2G | Update `getGroupForTab()` to reference NavData instead of hardcoded NAV_GROUPS | ~20 modified |
| 2H | Implement smart FAB context logic (context-aware primary action) | ~100 modified |

### Files Affected

| File | Action | Risk |
|------|--------|------|
| `src/components/game/layout/NavData.ts` | CREATE | None |
| `src/components/game/layout/MoreNavSheet.tsx` | CREATE | None |
| `src/components/game/GameSidebar.tsx` | EDIT | Medium |
| `src/components/game/BottomNavigationBar.tsx` | EDIT | Medium |
| `src/components/game/FloatingActionButton.tsx` | EDIT | Medium |
| `src/app/page.tsx` | EDIT (renderPanel unlock logic) | Medium |
| `src/components/game/SettingsPanel.tsx` | EDIT (add "Show All Tabs" toggle) | Low |
| `src/lib/game/settingsStore.ts` | EDIT (add showAllTabs setting) | Low |

### Dependencies
- **Phase 0** (header unification) — the header must be the single source of truth before modifying navigation

### Risk Level: 🟡 MEDIUM

**Primary risk**: Progressive tab unlocking could confuse existing players who are accustomed to seeing all 25 tabs. The "Show All Tabs" toggle mitigates this, but the default experience changes.

**Secondary risk**: The 5+More bottom nav redesign changes the primary mobile interaction pattern. If the "More" sheet is accessed too frequently, the redesign adds friction instead of reducing it.

### Validation Steps

1. **New player experience**: Fresh game (no buildings) → verify only 8-10 tabs visible in sidebar
2. **Progressive unlock**: Build 5 buildings → verify Transport tab unlocks. Complete first research → verify related tabs unlock.
3. **"Show All Tabs" toggle**: Enable in Settings → verify all 25 tabs appear. Disable → tabs hide again.
4. **Bottom nav (mobile)**: Verify 5 primary items + "More" button. Tap "More" → bottom sheet with remaining groups.
5. **Smart FAB**: Early game → FAB shows "Build Extractor". After building → FAB shows "Quick Build". Power critical → FAB shows "Build Power Plant".
6. **No regressions**: Desktop sidebar still works identically. Keyboard shortcuts (1-9) still functional.

### Rollback Plan

- **2A (NavData)**: Not consumed by anything until 2B/2C — can be deleted without impact
- **2B-2C (Sidebar/BottomNav)**: Git revert restores original 7-group bottom nav and 25-tab sidebar
- **2D (MoreNavSheet)**: Delete the file, revert BottomNavigationBar — no other dependencies
- **2E (tab unlock)**: Remove the unlock condition check in renderPanel — all tabs visible again
- **2F (Settings toggle)**: Remove the toggle, default to `showAllTabs: true`
- **Full rollback**: `git revert` on the Phase 2 commit. All tabs become visible again, bottom nav returns to 7+1.

### Estimated Effort: 3-4 days

| Task | Hours | Notes |
|------|-------|-------|
| 2A: NavData.ts | 3h | Define all 25 tabs with unlock conditions |
| 2B: Sidebar update | 3h | Render lock icons, conditional visibility |
| 2C: Bottom nav redesign | 6h | 5+More layout, animations, safe area |
| 2D: MoreNavSheet | 3h | Bottom sheet with secondary groups |
| 2E: Tab unlock logic | 2h | Conditional rendering in page.tsx |
| 2F: Settings toggle | 1h | Simple setting + toggle |
| 2G: getGroupForTab refactor | 1h | Mechanical |
| 2H: Smart FAB | 4h | Context detection + action mapping |
| Testing + validation | 4h | Mobile + desktop testing |
| **Total** | **27h (~3.5 days)** | |

### Expected Outcome

- New players see 8-10 tabs instead of 25 (-60% cognitive load)
- Mobile bottom nav: 5+More instead of 7+1 (-25% items, +37% label legibility)
- Progressive unlocking drives exploration ("what unlocks next?")
- Smart FAB provides 1-tap access to most relevant action
- Desktop unchanged for existing players (with "Show All Tabs" toggle)

### Go / No-Go Criteria

| Criterion | Must Pass |
|-----------|-----------|
| New game shows ≤10 visible tabs | ✅ |
| All tabs unlock correctly at defined conditions | ✅ |
| "Show All Tabs" toggle works in both directions | ✅ |
| Bottom nav has exactly 5 primary items + "More" | ✅ |
| "More" sheet opens and closes correctly | ✅ |
| Smart FAB shows context-appropriate action | ✅ |
| Desktop sidebar works identically to pre-Phase 2 | ✅ |
| Keyboard shortcuts still work | ✅ |
| `bun run lint` — 0 new errors | ✅ |
| No console errors on mobile viewport | ✅ |

---

## Phase 3 — Panel Migration

### Objective
Migrate all 31 panels to use composites from Phase 1 and selective selectors from Phase 0. Achieve visual consistency across the entire application.

### Scope

| Task | Description | Lines Changed |
|------|-------------|---------------|
| 3A | Create `BuildingCard` composite (shared extractor/factory card) | +200 new |
| 3B | Create `TierTabBar` composite | +100 new |
| 3C | Create `PriceTag` composite | +50 new |
| 3D | Create `ResourceBadge` composite | +40 new |
| 3E | Create `CurrencyDisplay` composite | +40 new |
| 3F | Create `ProductionIO` composite | +60 new |
| 3G | Migrate Group 1 panels (Dashboard, FactoryMap, ResourceMonitor) | ~-200 net |
| 3H | Migrate Group 2 panels (Resources, Factories, Storage, Power, Workers) | ~-300 net |
| 3I | Migrate Group 3 panels (Transport, Market, Contracts, Drones, TradePost) | ~-300 net |
| 3J | Migrate Group 4 panels (Research, Automation, Prestige, MegaProjects) | ~-200 net |
| 3K | Migrate Group 5 panels (Quests, Achievements, Daily, Leaderboard, Events) | ~-150 net |
| 3L | Migrate Group 6 panels (Payouts, Notifications) | ~-50 net |
| 3M | Migrate Group 7 panels (Statistics, Blueprints, Settings) | ~-150 net |
| 3N | Migrate AIAdvisorPanel + ResourceFlowPanel + ProductionChainPanel | ~-200 net |
| 3O | Migrate OnboardingPanel + CelebrationOverlay + GameItemTooltip | ~-100 net |

### Files Affected

| File | Action | Risk |
|------|--------|------|
| `src/components/game/composites/BuildingCard.tsx` | CREATE | None |
| `src/components/game/composites/TierTabBar.tsx` | CREATE | None |
| `src/components/game/composites/PriceTag.tsx` | CREATE | None |
| `src/components/game/composites/ResourceBadge.tsx` | CREATE | None |
| `src/components/game/composites/CurrencyDisplay.tsx` | CREATE | None |
| `src/components/game/composites/ProductionIO.tsx` | CREATE | None |
| All 31 panel components | EDIT | Medium-High |

### Dependencies
- **Phase 0** (selective selectors) — panels must already use selectors
- **Phase 1** (composites) — PanelShell, PanelHeader, ResourceBar, etc. must exist

### Risk Level: 🟡🔴 MEDIUM-HIGH

This is the **highest-risk phase** because it touches ALL 31 panels — the widest blast radius of any phase. Visual regressions are likely during migration.

**Primary risk**: Each panel has unique logic and layout. The composites may not perfectly match every panel's current appearance, requiring per-panel adjustments.

**Secondary risk**: The `BuildingCard` composite must serve both ResourcePanel (extractors) and FactoryPanel (factories) — two complex panels with slightly different data shapes and interactions.

**Mitigation**: Migrate in small groups (3A-3O). Each group is a separate commit. If any group has issues, only that group is rolled back.

### Validation Steps

1. **Per-group visual validation**: After each group migration:
   - Take screenshots of all affected panels before migration
   - Take screenshots after migration
   - Compare — must be visually identical (≤2px tolerance)
   - All interactive elements (buttons, tabs, toggles, forms) functional

2. **Cross-panel consistency check**: All panels should use:
   - `PanelShell` as outer wrapper
   - `PanelHeader` with consistent icon + color + badge
   - `ResourceBar` for all progress/fill indicators
   - Same `text-sm`/`text-xs` sizing for labels
   - Same `p-4`/`gap-4` spacing pattern

3. **Performance check**: React DevTools Profiler
   - No panel re-renders on unrelated state changes
   - Building count changes → only ResourcePanel/FactoryPanel re-render
   - Market price changes → only MarketPanel re-render

4. **No regressions**: `bun run lint` — 0 new errors. No console errors.

### Rollback Plan

Each group (3G-3O) is a **separate commit**. Rollback strategy:
- **3G fails**: Revert only Group 1 panels (Dashboard, FactoryMap, ResourceMonitor)
- **3H fails**: Revert only Group 2 panels (Resources, Factories, Storage, Power, Workers)
- **3A-3F (new composites)**: Can remain even if migration is rolled back — they're not consumed by reverted panels

**Full rollback**: Revert Phase 3 commits in reverse order. All panels return to pre-Phase 3 state.

### Estimated Effort: 5-7 days

| Task | Hours | Notes |
|------|-------|-------|
| 3A-3F: Create 6 composites | 14h | ~2.5h each |
| 3G: Group 1 (3 panels) | 6h | Dashboard is complex (1,581 lines) |
| 3H: Group 2 (5 panels) | 10h | Factory+Resource use BuildingCard |
| 3I: Group 3 (5 panels) | 10h | Transport is massive (2,319 lines) |
| 3J: Group 4 (4 panels) | 6h | Research already piloted in Phase 1 |
| 3K: Group 5 (5 panels) | 6h | Leaderboard+Achievement already piloted |
| 3L: Group 6 (2 panels) | 3h | Simple panels |
| 3M: Group 7 (3 panels) | 6h | Settings is complex (1,035 lines) |
| 3N: Complex panels (3) | 8h | AI Advisor, Resource Flow, Production Chain |
| 3O: Misc panels (3) | 4h | Onboarding, Celebration, Tooltip |
| Testing + validation | 12h | Per-group visual comparison + functional testing |
| **Total** | **85h (~10 days)** | **Split across 2 sprints** |

### Expected Outcome

- All 31 panels use composites (PanelShell, PanelHeader, ResourceBar)
- All panels use selective selectors
- Consistent visual appearance across all panels
- 13 composites available for future panel development
- Estimated net code reduction: ~1,500 lines from deduplication

### Go / No-Go Criteria

| Criterion | Must Pass |
|-----------|-----------|
| All 31 panels render correctly | ✅ |
| All 31 panels visually match pre-migration (≤2px) | ✅ |
| All interactive elements functional in every panel | ✅ |
| Zero panels use `const store = useGameStore()` | ✅ |
| Zero hardcoded `bg-[#111827]` in panel files | ✅ |
| `bun run lint` — 0 new errors | ✅ |
| No console errors in browser | ✅ |
| React Profiler: no unrelated re-renders | ✅ |

---

## Phase 4 — Mobile Optimization

### Objective
Optimize the entire mobile experience: compact header, mobile-adapted panels, QuickBuildSheet for 1-tap building, contextual prompts for engagement.

### Scope

| Task | Description | Lines Changed |
|------|-------------|---------------|
| 4A | Redesign mobile header (2-row compact, 14px min text, collapsible row 2) | ~200 modified |
| 4B | Create `QuickBuildSheet` (FAB → bottom sheet → 1-tap build) | +150 new |
| 4C | Create `BottleneckAlert` composite + toast integration | +80 new |
| 4D | Create `ResourceQuickView` (tap header stat → detail sheet) | +100 new |
| 4E | Implement contextual prompts (power critical, storage full, prestige available, research complete) | +120 new |
| 4F | Mobile-adapt TransportPanel (hide SVG on <768px, show list view) | ~100 modified |
| 4G | Mobile-adapt FactoryMapPanel (simplified list view on <768px) | ~100 modified |
| 4H | Mobile-adapt ResourceFlowPanel (simplified on <768px) | ~60 modified |
| 4I | Dashboard mobile optimization (show 3-4 priority cards + "View All") | ~100 modified |
| 4J | Ensure all text ≥14px on mobile viewport | ~50 modified across panels |
| 4K | Ensure all touch targets ≥44px | ~30 modified across panels |

### Files Affected

| File | Action | Risk |
|------|--------|------|
| `src/components/game/GameHeader.tsx` | EDIT | Medium |
| `src/components/game/composites/QuickBuildSheet.tsx` | CREATE | None |
| `src/components/game/composites/BottleneckAlert.tsx` | CREATE | None |
| `src/components/game/composites/ResourceQuickView.tsx` | CREATE | None |
| `src/components/game/TransportPanel.tsx` | EDIT | Medium |
| `src/components/game/FactoryMapPanel.tsx` | EDIT | Medium |
| `src/components/game/ResourceFlowPanel.tsx` | EDIT | Low |
| `src/components/game/DashboardPanel.tsx` | EDIT | Medium |
| `src/components/game/GameToast.tsx` | EDIT | Low |
| ~15 panel files (text + touch target fixes) | EDIT | Low |

### Dependencies
- **Phase 2** (navigation) — QuickBuildSheet integrates with the 5+More bottom nav and smart FAB
- **Phase 3** (panel migration) — mobile adaptations should be applied to already-migrated panels (using composites)

### Risk Level: 🟡 MEDIUM

**Primary risk**: Removing SVG views on mobile (Transport, FactoryMap) changes the core gameplay experience. Some players may prefer the visual representation even on mobile. Must provide a "Switch to Map View" option.

**Secondary risk**: The QuickBuildSheet changes the build flow from "navigate → find → build" to "FAB → select → build". Existing players with muscle memory may find this disruptive initially.

### Validation Steps

1. **Mobile header**: At 375px viewport:
   - Header height ≤80px (currently ~90px)
   - All text ≥14px
   - Money/Power/RP stats visible
   - Speed controls functional
   - Row 2 collapses on scroll-down

2. **QuickBuildSheet**: FAB tap → sheet opens → shows available buildings for current tier → tap building → build confirmed → sheet closes → building appears. Total: 2 taps.

3. **Contextual prompts**:
   - Power <50% → red toast "Power critical!"
   - Storage >90% → orange toast "Storage full!"
   - Prestige available → persistent banner on Dashboard
   - Research complete → green toast with unlock info

4. **Mobile panel adaptations**: At 375px viewport:
   - TransportPanel: list view (no SVG graph)
   - FactoryMapPanel: list view (no interactive grid)
   - ResourceFlowPanel: simplified (no force-directed graph)
   - Dashboard: 3-4 priority cards + "View All" button
   - "Switch to Map View" toggle available on Transport and FactoryMap

5. **Text legibility**: No text below 14px on mobile. Use browser dev tools to verify.

6. **Touch targets**: All interactive elements ≥44×44px. Use accessibility inspector.

7. **No regressions**: Desktop experience unchanged. `bun run lint` — 0 new errors.

### Rollback Plan

- **4A (header)**: Git revert GameHeader.tsx → original mobile header restored
- **4B (QuickBuildSheet)**: Delete file, revert FAB → original FAB behavior
- **4C-4D (BottleneckAlert/ResourceQuickView)**: Delete files, revert toast/header changes
- **4E (contextual prompts)**: Remove prompt triggers from game tick logic
- **4F-4H (mobile adaptations)**: Remove `<768px` conditional rendering → SVG views show on all viewports
- **4I (Dashboard mobile)**: Revert to showing all sections on mobile
- **4J-4K (text/touch targets)**: Revert individual files
- **Full rollback**: `git revert` on Phase 4 commit

### Estimated Effort: 4-5 days

| Task | Hours | Notes |
|------|-------|-------|
| 4A: Mobile header redesign | 6h | Careful responsive work |
| 4B: QuickBuildSheet | 4h | New feature |
| 4C: BottleneckAlert | 3h | New feature |
| 4D: ResourceQuickView | 3h | New feature |
| 4E: Contextual prompts | 4h | Toast integration + game tick hooks |
| 4F: TransportPanel mobile | 4h | List view alternative |
| 4G: FactoryMapPanel mobile | 4h | List view alternative |
| 4H: ResourceFlowPanel mobile | 2h | Simplified view |
| 4I: Dashboard mobile | 3h | Priority cards + "View All" |
| 4J: Text legibility pass | 2h | Find all <14px text on mobile |
| 4K: Touch target pass | 1h | Find all <44px targets on mobile |
| Testing + validation | 6h | Extensive mobile testing |
| **Total** | **42h (~5 days)** | |

### Expected Outcome

- Mobile header: -10px height, all text ≥14px
- Build action: 4 taps → 2 taps (QuickBuildSheet)
- Contextual prompts for power, storage, prestige, research
- Transport and FactoryMap usable on mobile (list views)
- Dashboard focused on 3-4 priority items on mobile
- All text ≥14px, all touch targets ≥44px on mobile
- Estimated +20% mobile session length, +10% mobile retention

### Go / No-Go Criteria

| Criterion | Must Pass |
|-----------|-----------|
| Mobile header ≤80px on 375px viewport | ✅ |
| All text ≥14px on 375px viewport | ✅ |
| All touch targets ≥44px on 375px viewport | ✅ |
| QuickBuildSheet: build in ≤2 taps | ✅ |
| Contextual prompts fire correctly for all 4 trigger types | ✅ |
| Transport/FactoryMap functional on 375px (list view) | ✅ |
| Dashboard shows 3-4 priority cards on mobile | ✅ |
| Desktop experience unchanged | ✅ |
| `bun run lint` — 0 new errors | ✅ |
| No console errors on mobile viewport | ✅ |

---

## Phase 5 — Panel Merge + Deduplication

### Objective
Merge the near-identical ResourcePanel and FactoryPanel into a shared BuildingPanel, extract common panel patterns, and reduce codebase size.

### Scope

| Task | Description | Lines Changed |
|------|-------------|---------------|
| 5A | Create `BuildingPanel` — unified panel for both extractors and factories | +600 new |
| 5B | Create `BuildingPanelView` sub-component for tier tab + card grid + active list | +300 new |
| 5C | Replace ResourcePanel with BuildingPanel (mode='extractor') | ~-800 net |
| 5D | Replace FactoryPanel with BuildingPanel (mode='factory') | ~-800 net |
| 5E | Extract SVG flow diagram into shared `ProductionFlowDiagram` component | +200 new |
| 5F | Update NavData to reference BuildingPanel with mode parameter | ~10 modified |
| 5G | Remove obsolete ResourcePanel.tsx and FactoryPanel.tsx | -2,249 deleted |

### Files Affected

| File | Action | Risk |
|------|--------|------|
| `src/components/game/panels/production/BuildingPanel.tsx` | CREATE | None |
| `src/components/game/panels/production/BuildingPanelView.tsx` | CREATE | None |
| `src/components/game/panels/production/ProductionFlowDiagram.tsx` | CREATE | None |
| `src/components/game/ResourcePanel.tsx` | DELETE | High |
| `src/components/game/FactoryPanel.tsx` | DELETE | High |
| `src/app/page.tsx` | EDIT (renderPanel references) | Low |
| `src/components/game/layout/NavData.ts` | EDIT | Low |

### Dependencies
- **Phase 3** (panel migration) — both panels must already use composites and selectors

### Risk Level: 🟡 MEDIUM

**Primary risk**: ResourcePanel and FactoryPanel are the 2nd and 3rd most complex panels (1,108 and 1,141 lines). They have near-identical structure but subtle behavioral differences. Merging must preserve all functionality from both panels.

**Secondary risk**: Deleting 2,249 lines of working code. If the merged panel has any regression, there's no easy way to "partially" revert — both panels are gone.

**Mitigation**: Create the merged BuildingPanel FIRST, test it thoroughly with both modes, then delete the originals only after 100% verification.

### Validation Steps

1. **Extractor mode parity**: BuildingPanel(mode='extractor') must be functionally identical to the current ResourcePanel
   - All extractors listed with correct tier tabs
   - Build/upgrade/toggle actions work
   - SVG flow diagram renders correctly
   - Recently-built animation works
   - Search/filter works

2. **Factory mode parity**: BuildingPanel(mode='factory') must be functionally identical to the current FactoryPanel
   - All factories listed with correct tier tabs
   - Build/upgrade/toggle actions work
   - SVG flow diagram renders correctly
   - Recently-built animation works
   - Search/filter works

3. **Navigation**: Clicking "Resources" tab → shows BuildingPanel in extractor mode. Clicking "Factories" tab → shows BuildingPanel in factory mode. No flicker or remount issue.

4. **No regressions**: `bun run lint` — 0 new errors

5. **Code reduction**: Net line count should be ~-1,400 lines (2,249 deleted - 850 new)

### Rollback Plan

**Critical**: Do NOT delete ResourcePanel.tsx and FactoryPanel.tsx until BuildingPanel is fully verified.

- **5A-5B (BuildingPanel)**: Keep as new files — they don't affect existing panels
- **5C-5D (Replace panels)**: Git revert page.tsx renderPanel → points to original panels again
- **5E (SVG extraction)**: Git revert → inline SVG returns to BuildingPanel
- **5G (Delete originals)**: Git revert → original files restored

**Full rollback**: Revert Phase 5 commits. Original ResourcePanel and FactoryPanel are restored from git history.

### Estimated Effort: 3-4 days

| Task | Hours | Notes |
|------|-------|-------|
| 5A: BuildingPanel core | 8h | Mode switching + shared logic |
| 5B: BuildingPanelView | 4h | Shared card grid + active list |
| 5C: Extractor mode | 4h | Verify parity with ResourcePanel |
| 5D: Factory mode | 4h | Verify parity with FactoryPanel |
| 5E: SVG flow extraction | 4h | Shared production flow diagram |
| 5F: NavData update | 0.5h | Mechanical |
| 5G: Delete originals | 0.5h | After 100% verification |
| Testing + validation | 6h | Extensive parity testing |
| **Total** | **31h (~4 days)** | |

### Expected Outcome

- ~1,400 lines of code removed
- Single BuildingPanel serves both extractor and factory views
- Shared ProductionFlowDiagram reusable by future panels
- Easier maintenance — fix a bug once, both views benefit
- Future: same pattern can merge other similar panel pairs

### Go / No-Go Criteria

| Criterion | Must Pass |
|-----------|-----------|
| BuildingPanel(mode='extractor') identical to current ResourcePanel | ✅ |
| BuildingPanel(mode='factory') identical to current FactoryPanel | ✅ |
| All build/upgrade/toggle actions work in both modes | ✅ |
| SVG flow diagram renders in both modes | ✅ |
| Navigation to Resources/Factories tabs works correctly | ✅ |
| Net code reduction ≥1,000 lines | ✅ |
| `bun run lint` — 0 new errors | ✅ |
| No console errors in browser | ✅ |

---

## Phase 6 — Polish & Scale

### Objective
Final polish: accessibility compliance, performance optimization, search/command palette, and file reorganization. This phase turns a good UI into a professional-grade product.

### Scope

| Task | Description | Lines Changed |
|------|-------------|---------------|
| 6A | Accessibility audit: ARIA labels, keyboard navigation, screen reader support | ~100 modified |
| 6B | Performance audit: React.memo on list items, lazy loading panels, bundle optimization | ~80 modified |
| 6C | Create `SearchPalette` (Ctrl+K) — search panels, resources, buildings | +250 new |
| 6D | Reorganize panel files into `panels/` subdirectory structure | 0 net (file moves) |
| 6E | Update all imports after file reorganization | ~200 import changes |
| 6F | Add `role`, `aria-label`, `aria-describedby` to all interactive elements | ~60 modified |
| 6G | Add skip-to-content link for keyboard users | +10 new |
| 6H | Verify WCAG 2.1 AA compliance | 0 lines (audit only) |
| 6I | Final CSS pass: remove unused styles, optimize animations | ~-100 lines |
| 6J | Add `prefers-reduced-motion` fine-tuning for all remaining animations | ~30 modified |

### Files Affected

| File | Action | Risk |
|------|--------|------|
| `src/components/game/composites/SearchPalette.tsx` | CREATE | None |
| All 31 panel files | MOVE to `panels/` subdirectories | Low (import paths only) |
| ~20 files (accessibility additions) | EDIT | Low |
| `src/app/globals.css` | EDIT | Low |
| `src/app/page.tsx` | EDIT (lazy loading) | Medium |

### Dependencies
- **Phase 4** (mobile optimization) — accessibility audit must cover mobile adaptations
- **Phase 5** (panel merge) — file reorganization should include the merged BuildingPanel

### Risk Level: 🟢 LOW

This phase is almost entirely additive and non-breaking. The file reorganization (6D-6E) is the riskiest item because it changes import paths across the entire codebase, but this is a mechanical refactoring with zero logic changes.

### Validation Steps

1. **Accessibility**: Run automated accessibility audit (Lighthouse, axe-core)
   - WCAG 2.1 AA score ≥90
   - No critical accessibility violations
   - All interactive elements reachable via keyboard
   - Screen reader announces panel changes correctly

2. **Performance**: React Profiler + Lighthouse
   - Lighthouse Performance ≥90
   - No panel takes >100ms to render
   - Bundle size reduced by lazy loading

3. **Search Palette**: Ctrl+K opens → type "iron" → shows iron mine + iron plate + iron-related research → click → navigates to correct panel

4. **File reorganization**: All imports resolve correctly. `bun run lint` passes. No broken references.

5. **Reduced motion**: With `prefers-reduced-motion: reduce` OS setting, all animations are instant (no movement). Game remains fully playable.

### Rollback Plan

- **6A-6B (audit fixes)**: Individual reverts per file
- **6C (SearchPalette)**: Delete file, remove Ctrl+K listener from page.tsx
- **6D-6E (file reorganization)**: Git revert — file moves are perfectly reversible in git
- **6F-6G (ARIA)**: Remove added attributes — no functional impact
- **6I-6J (CSS)**: Git revert globals.css changes
- **Full rollback**: `git revert` on Phase 6 commits

### Estimated Effort: 3-4 days

| Task | Hours | Notes |
|------|-------|-------|
| 6A: Accessibility additions | 6h | ARIA across 31 panels |
| 6B: Performance optimization | 4h | React.memo, lazy loading |
| 6C: Search Palette | 8h | New feature with fuzzy search |
| 6D-6E: File reorganization | 4h | Move files + update imports |
| 6F-6G: Keyboard navigation | 2h | Skip links, focus management |
| 6H: WCAG audit | 2h | Automated + manual testing |
| 6I-6J: CSS optimization | 2h | Remove unused styles |
| Testing + validation | 4h | Accessibility + performance testing |
| **Total** | **32h (~4 days)** | |

### Expected Outcome

- WCAG 2.1 AA compliance
- Lighthouse Performance ≥90
- Search palette for power users
- Organized file structure for developer productivity
- All animations respect reduced-motion preferences
- Zero unused CSS rules
- Professional-grade accessibility

### Go / No-Go Criteria

| Criterion | Must Pass |
|-----------|-----------|
| Lighthouse Accessibility ≥90 | ✅ |
| Lighthouse Performance ≥90 | ✅ |
| All interactive elements keyboard-reachable | ✅ |
| Search Palette finds any panel/resource/building | ✅ |
| All imports resolve after file reorganization | ✅ |
| `bun run lint` — 0 new errors | ✅ |
| No console errors in browser | ✅ |
| All animations respect `prefers-reduced-motion` | ✅ |

---

## Cumulative Timeline

| Phase | Duration | Cumulative | Key Deliverable |
|-------|----------|-----------|----------------|
| **Phase 0** | 3 days | Day 3 | 83% fewer re-renders, unified header |
| **Phase 1** | 3 days | Day 6 | Design tokens + 6 composites + 3 pilot panels |
| **Phase 2** | 3.5 days | Day 10 | 5+More nav, progressive unlock, smart FAB |
| **Phase 3** | 10 days | Day 20 | All 31 panels migrated to composites |
| **Phase 4** | 5 days | Day 25 | Mobile-optimized, QuickBuildSheet, contextual prompts |
| **Phase 5** | 4 days | Day 29 | Factory+Resource merged, -1,400 lines |
| **Phase 6** | 4 days | Day 33 | WCAG AA, performance ≥90, search palette |
| **Total** | **~33 days** | | |

### Recommended Execution Order

```
Week 1-2: Phase 0 + Phase 1 (can partially overlap)
           Phase 0 selectors (0A-0B) can start immediately
           Phase 1 composites (1B-1G) can start while 0D-0G are in progress
           
Week 2-3: Phase 2 (starts after Phase 0 header is done)
           
Week 3-5: Phase 3 (starts after Phase 1 composites are ready)
           This is the longest phase — consider splitting across 2 developers
           
Week 5-6: Phase 4 (starts after Phase 2 nav + Phase 3 panels)

Week 6-7: Phase 5 (starts after Phase 3 panel migration)

Week 7-8: Phase 6 (starts after Phase 4 mobile + Phase 5 merge)
```

---

## Quick Reference: Phase Comparison Matrix

| | Phase 0 | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 | Phase 6 |
|---|---------|---------|---------|---------|---------|---------|---------|
| **Can start independently?** | ✅ Yes | ❌ Needs P0 | ⚠️ Partial | ❌ Needs P0+1 | ❌ Needs P2+3 | ❌ Needs P3 | ❌ Needs P4+5 |
| **Blocks other phases?** | 1,2,3,4,5,6 | 3,4 | 4 | 4,5 | 6 | 6 | None |
| **Highest ROI?** | 🏆 | | | | 🏆 | | |
| **Highest risk?** | | | | 🔴 | | | |
| **Effort** | 3d | 3d | 3.5d | 10d | 5d | 4d | 4d |
| **Lines touched** | ~2,500 | ~800 | ~700 | ~5,000 | ~1,000 | ~3,500 | ~800 |
| **Player-visible?** | Indirect | Indirect | ✅ Direct | Indirect | ✅ Direct | Indirect | Indirect |
| **Deployable alone?** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

*End of UI Implementation Execution Plan v1.0*  
*This document is a planning specification. No implementation should begin until this plan is reviewed and approved.*
