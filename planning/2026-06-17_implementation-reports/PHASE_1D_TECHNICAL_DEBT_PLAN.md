# Phase 1D — Technical Debt Cleanup Plan

**STATUS NOTICE — HISTORICAL**  
This document has been classified as **HISTORICAL** in `planning/DOCUMENT_INVENTORY.md` (June 2026 audit).  
Date written: 2025-01-24. Planning document for Phase 1D (5 cleanup items: 1D-A through 1D-E).  
For the canonical project status, see [PROJECT_STATUS_SOURCE_OF_TRUTH.md](./PROJECT_STATUS_SOURCE_OF_TRUTH.md).

**Predecessor:** Phase 1C (CLOSED ✅)
**Scope:** 5 cleanup items, no new features, no security changes

---

## Overview

Phase 1D addresses technical debt accumulated during Phases 0–1C. The project has crossed the security/architecture threshold — the remaining work is maintainability, not existential risk.

**Guiding principles:**
- No new features
- No security model changes
- No UX changes
- Each item must be independently deployable and reversible
- Existing consumer APIs must be preserved (facade/wrapper pattern)

---

## 1. useCloudSync Decomposition

### Current State

**File:** `src/lib/hooks/useCloudSync.ts` (~460 LOC)

**7 distinct responsibilities** in a single hook:

| # | Responsibility | Lines | LOC |
|---|---|---|---|
| R1 | Game state serialization (30-field extraction) | 56–93, 130–167 | ~75 **(duplicated ×2)** |
| R2 | Server save (POST + conflict merge + retry + fallback) | 48–275 | ~227 |
| R3 | Server load (GET + conflict detection + fallback) | 277–406 | ~129 |
| R4 | Error/auth blocking (HTTP → blockedState mapping) | 107–228, 284–297 | ~135 **(duplicated ×2)** |
| R5 | Conflict resolution UI state | 40, 45, 335–387, 408–418 | ~25 |
| R6 | Auto-load on login | 421–436 | ~15 |
| R7 | Auto-save timer | 438–459 | ~21 |

**Problems:**
- Serialization logic (R1) is **duplicated verbatim** — lines 56–93 and 130–167 are nearly identical
- Error mapping (R4) is **duplicated** across save and load paths
- Conflict detection heuristic is **duplicated** for primary and fallback endpoints
- 8 local state variables + 6 refs make the hook difficult to reason about
- No individual responsibility can be tested in isolation

### Proposed Architecture

```
useCloudSync (facade — thin orchestrator, preserves existing API)
├── serializeGameState()        ← pure util (extracts R1)
├── detectConflict()            ← pure util (extracts conflict heuristic)
├── mapHttpErrorToBlock()       ← pure util (extracts error mapping)
├── useBlockedState()           ← hook (extracts R4)
├── useServerAuthority()        ← hook (extracts hash/version tracking)
├── useConflictResolution()     ← hook (extracts R5)
├── useCloudSave()              ← hook (extracts R2)
├── useCloudLoad()              ← hook (extracts R3)
├── auto-load effect            ← stays in facade (R6)
└── auto-save effect            ← stays in facade (R7)
```

**3 pure utility functions** — no hooks, no state, trivially testable:
- `serializeGameState(state): Record<string, unknown>` — eliminates serialization duplication
- `detectConflict(localTick, cloudTick, localMoney, cloudMoney): 'local' | 'cloud' | 'manual'` — eliminates conflict heuristic duplication
- `mapHttpErrorToBlock(status, data): CloudBlockState | null` — eliminates error mapping duplication

**5 sub-hooks** — each with a single responsibility:
- `useBlockedState()` — manages blockedState for auth/validation errors
- `useServerAuthority()` — manages serverStateHash, serverStateVersion, isServerAuthoritative
- `useConflictResolution()` — manages pendingConflict, cloudDataRef, resolveConflict
- `useCloudSave(blocked, authority)` — manages saveToCloud with conflict merge & retry
- `useCloudLoad(blocked, authority, conflict)` — manages loadFromCloud with conflict detection

**1 facade hook** — preserves the existing `useCloudSync()` API:
- Composes all sub-hooks
- Owns auto-load and auto-save effects
- Returns the same shape consumers expect

### File Structure

```
src/lib/hooks/cloudSync/
├── serializeGameState.ts       ← pure util
├── detectConflict.ts           ← pure util
├── mapHttpErrorToBlock.ts      ← pure util
├── useBlockedState.ts          ← hook
├── useServerAuthority.ts       ← hook
├── useConflictResolution.ts    ← hook
├── useCloudSave.ts             ← hook
├── useCloudLoad.ts             ← hook
└── index.ts                    ← facade (useCloudSync) + re-exports
```

### Deliverables

| Item | Details |
|------|---------|
| Effort | **Medium** (4–6 hours) |
| Risk | **Low** — facade preserves existing API; each sub-hook is independently testable |
| Expected value | **High** — eliminates ~150 lines of duplication; enables unit testing of conflict detection, serialization, error mapping |
| Dependencies | None |
| Consumer changes | **Zero** — `useCloudSync()` import and return type unchanged |

---

## 2. Presence Hook Consolidation

### Current State

**Files:**
- `src/lib/hooks/useOnlinePresence.ts` (229 LOC)
- `src/lib/hooks/useAdminPresence.ts` (188 LOC)

**Total:** 417 LOC, **~130 lines duplicated**

Both hooks implement the same pattern:
- Singleton `PresenceManager` class with ref-counted channel sharing
- Supabase Realtime Presence on channel `'industriax-online'`
- 30-second periodic re-tracking
- `subscribe()/notify()/connect()/disconnect()` methods with identical structure

**Duplicated code:**

| Aspect | Status |
|--------|--------|
| `PresencePayload` interface | Identical in both files |
| Channel name constant | Identical (`'industriax-online'`) |
| Class structure (channel, supabase, listeners, state, refreshInterval, refCount) | ~90% identical layout |
| `subscribe()` method (ref counting, immediate emit, auto-disconnect) | Nearly identical |
| `notify()` method | Identical |
| `connect()` method skeleton | Identical |
| `disconnect()` method | Nearly identical |
| Hook pattern (useState + useEffect) | Identical |

**Genuinely different code:**

| Aspect | useOnlinePresence | useAdminPresence |
|--------|-------------------|------------------|
| Presence key source | `localStorage` persistent visitor ID | Ephemeral `admin_...` ID |
| Self-exclusion from counts | No | Yes (filters own key) |
| Track payload | Dynamic (user from `useAuth`) | Static (`Admin`, `is_logged_in: true`) |
| `onlineCount` type | `number` | `number \| null` (sentinel for "not connected") |
| Visibility change handler | Yes | No |
| User re-tracking effect | Yes | No |

### Proposed Architecture: Base Class + Specializations

```
src/lib/hooks/presence/
├── PresencePayload.ts            ← shared interface
├── BasePresenceManager.ts        ← abstract base class (shared logic)
├── VisitorPresenceManager.ts     ← extends Base (adds user tracking + visibility)
├── AdminPresenceManager.ts       ← extends Base (adds self-exclusion)
├── useOnlinePresence.ts          ← thin hook wrapper (preserves API)
└── useAdminPresence.ts           ← thin hook wrapper (preserves API)
```

**`BasePresenceManager<TState>`** — abstract class with:
- Shared fields: `channel`, `supabase`, `listeners`, `state`, `refreshInterval`, `refCount`
- Shared methods: `subscribe()`, `notify()`, `connect()`, `disconnect()`, `track()`
- Abstract hooks: `presenceKey`, `buildTrackPayload()`, `computeState()`, `initialState`
- Optional overrides: `onConnect()`, `onDisconnect()`

**`VisitorPresenceManager`** — extends base:
- Reads visitor ID from `localStorage`
- Dynamic track payload using `userRef`
- Counts all presence keys (no self-exclusion)
- Adds visibility-change handler
- Adds user re-tracking on login/logout

**`AdminPresenceManager`** — extends base:
- Generates ephemeral admin key
- Static track payload
- Filters out own key from counts (self-exclusion)
- `onlineCount: number | null` (null = not yet connected)

### Key Risk: Channel Sharing

Both managers subscribe to the **same Supabase channel** `'industriax-online'` but must create **separate Realtime channel instances** with different presence keys. The base class shares *code*, not *runtime state*. Each singleton owns its own channel connection.

### Deliverables

| Item | Details |
|------|---------|
| Effort | **Medium** (3–4 hours) |
| Risk | **Medium** — both managers share a Supabase channel; naive refactor that shares a single channel instance would break self-exclusion semantics |
| Expected value | **Medium** — eliminates ~130 lines of duplication; enables unit testing of base presence logic |
| Dependencies | None |
| Consumer changes | **Zero** — thin wrapper hooks preserve exact return types |

---

## 3. Color Token Extraction

### Current State

**Total hardcoded color instances in game components:** ~2,910

The project already has:
- shadcn/ui CSS variable token system (`text-primary`, `bg-background`, `text-muted-foreground`, etc.)
- Neon theme extension (`--color-neon-cyan`, `--color-neon-green`, etc.)
- Industrial theme variables (`--color-industrial-dark/card/border/hover`)
- Centralized tier color system in `shared/tierColors.ts` (60 classes)

**But these existing tokens are underused.** Most components use raw Tailwind color classes.

### Top Offenders

| File | Hardcoded Colors | |
|------|:---------------:|---|
| DashboardPanel.tsx | 236 | 🔴 |
| TransportPanel.tsx | 181 | 🔴 |
| MarketPanel.tsx | 181 | 🔴 |
| FactoryMapPanel.tsx | 161 | 🔴 |
| PowerPanel.tsx | 143 | 🔴 |
| StoragePanel.tsx | 124 | 🔴 |
| QuestPanel.tsx | 118 | 🟠 |
| SettingsPanel.tsx | 119 | 🟠 |
| WorkerPanel.tsx | 100 | 🟠 |
| MegaProjectPanel.tsx | 98 | 🟠 |

### Semantic Grouping

| Group | Approx. Instances | Top Classes | Proposed Token |
|-------|:----------------:|-------------|---------------|
| **Success/Positive** | ~580 | `text-green-400` (195), `bg-green-900/20` (45) | `text-success`, `bg-success-muted`, `border-success` |
| **Warning/Caution** | ~330 | `text-amber-400` (80), `text-yellow-400` (65) | `text-warning`, `bg-warning-muted`, `border-warning` |
| **Error/Danger** | ~350 | `text-red-400` (150), `bg-red-900/20` (40) | `text-danger`, `bg-danger-muted`, `border-danger` |
| **Info/Primary** | ~620 | `text-gray-500` (280), `text-cyan-400` (145) | `text-muted-label`, `text-primary` (exists!), `bg-surface-elevated` |
| **Domain-specific** | ~480 | `text-purple-400` (70), `text-fuchsia-400` (55) | `text-type-research`, `text-type-prestige`, `text-type-transport` |
| **Industrial** | ~250 | `bg-gray-900/*` (70), `bg-[#0a0e17]` (30) | `bg-industrial-dark` (exists!), `bg-industrial-card` (exists!) |

### Proposed Tokens (HIGH IMPACT — 50+ files each)

| Proposed Token | Replaces | Instances | Files |
|---------------|----------|:---------:|:-----:|
| `text-success` | `text-green-400` | ~195 | 40+ |
| `bg-success-muted` | `bg-green-900/20`, `bg-green-900/10` | ~65 | 30+ |
| `text-danger` | `text-red-400` | ~150 | 35+ |
| `bg-danger-muted` | `bg-red-900/20` | ~50 | 25+ |
| `text-warning` | `text-amber-400`, `text-yellow-400` | ~145 | 35+ |
| `text-muted-label` | `text-gray-500` | ~280 | 45+ |
| `text-muted-secondary` | `text-gray-400` | ~120 | 40+ |
| `bg-surface-elevated` | `bg-gray-800`, `bg-gray-800/50` | ~80 | 35+ |

### Proposed Tokens (MEDIUM IMPACT — domain-specific)

| Proposed Token | Replaces | Domain |
|---------------|----------|--------|
| `text-tier-1/2/3/4/5` | `text-cyan/orange/purple/emerald/red-400` | Building tiers |
| `text-type-research` | `text-purple-400` (research context) | Research |
| `text-type-prestige` | `text-fuchsia-400` | Prestige |
| `text-type-transport` | `text-teal-400` | Transport |
| `text-type-worker` | `text-sky-400` | Workers/drones |
| `text-type-contract` | `text-rose-400` | Contracts |
| `text-type-trade` | `text-violet-400` | Trading |

### Migration Strategy

**Phase approach — not a big-bang rewrite:**

1. **Define tokens** — add CSS variables to `globals.css` `@theme inline` block
2. **Extend `tierColors.ts`** — add domain-specific color mappings to the existing centralized system
3. **Migrate by semantic group** — one group per commit (success → danger → warning → info → domain)
4. **Automated find-and-replace** — most migrations are mechanical (`text-green-400` → `text-success`)
5. **Visual regression check** — each group migration gets a browser verification

**Priority order:**
1. `text-success` (195 instances, most impactful)
2. `text-muted-label` / `text-gray-500` (280 instances)
3. `text-danger` (150 instances)
4. `text-primary` replacing `text-cyan-400` (145 instances — token already exists!)
5. `text-warning` (145 instances)
6. Domain-specific tokens (lower priority, fewer files)

### Deliverables

| Item | Details |
|------|---------|
| Effort | **High** (8–12 hours for full migration) — but each semantic group is independently deployable |
| Risk | **Low** — visual-only changes; each group can be verified independently; tokens are CSS variables so theming is preserved |
| Expected value | **High** — 2,910 hardcoded instances → ~12 semantic tokens; enables consistent theming; eliminates "which shade of green?" decisions |
| Dependencies | None |
| Consumer changes | Visual only — no behavioral changes |

---

## 4. Dead Code Cleanup

### Inventory

#### ✅ Safe to Remove Immediately (8 items)

| # | What | File | Lines |
|---|------|------|-------|
| 1 | `validateTradeAction` function + JSDoc | `serverEngine.ts` | 936–1014 |
| 2 | Dead `case 'trade':` branch | `action/route.ts` | 384–388 |
| 3 | 6 stale Phase 1C/REMOVED comments | `action/route.ts` | 28–30, 289–293, 329, 385–386, 405–406 |
| 4 | `verifyChecksum` export | `gameStateValidator.ts` | 93–100 |
| 5 | `src/lib/db.ts` entire file (zero imports) | `db.ts` | all |
| 6 | `ResourceAmount` dead import | `serverEngine.ts` | 16 |
| 7 | `CostResourceType` dead import | `serverEngine.ts` | 17 |
| 8 | Historical `REMOVED` comment | `marketSimulator.ts` | 345–349 |

#### 🔍 Needs Investigation (9 items)

| # | What | File | Notes |
|---|------|------|-------|
| 1 | 7 internal-only server compute exports | `serverEngine.ts` | `buildMultipliersServer`, `computePowerGridServer`, `computeProductionServer`, `computeSellMultiplierServer`, `computePayoutServer`, `computeEndgameIncomeServer`, `buildProductionSnapshotServer` — remove `export` keyword |
| 2 | `TRADE_COMMISSION_RATE` export | `serverEngine.ts:1019` | Only used internally; client has duplicate |
| 3 | `TRADABLE_RESOURCES` export | `serverEngine.ts:1022` | Only used internally; client has duplicate — consider shared module |
| 4 | `generateChecksum` export | `gameStateValidator.ts:69` | Only used internally |
| 5 | `GAME_LIMITS` export | `gameStateValidator.ts:477` | Only used internally |
| 6 | `TickResult` interface export | `serverEngine.ts:595` | Only used as return type of `runServerTicks` |

#### ⚪ Keep (active code)

All other exports, hooks, and comments are actively used.

### Client-Side Duplicates

| Constant | Server Location | Client Location | Issue |
|----------|----------------|-----------------|-------|
| `TRADE_COMMISSION_RATE` | `serverEngine.ts:1019` | `TradingPostPanel.tsx` (local constant) | Values could drift |
| `TRADABLE_RESOURCES` | `serverEngine.ts:1022` | `TradingPostPanel.tsx:26` | Values could drift |

**Recommendation:** Extract to a shared `src/lib/game/tradeConstants.ts` module imported by both server and client.

### Deliverables

| Item | Details |
|------|---------|
| Effort | **Low** (1–2 hours) |
| Risk | **Very Low** — removing dead code and unused exports; no behavioral changes |
| Expected value | **Medium** — reduces confusion; eliminates security debt (dead trade path); prevents constant drift |
| Dependencies | None |
| Consumer changes | None |

---

## 5. Derived Selector Review

### Current State

**5 selector files** exist at `src/lib/game/selectors/`:

| File | Selectors | Derived | Problem |
|------|:---------:|:-------:|---------|
| `resourceSelectors.ts` | 8 | 2 | Derived selectors create **new arrays every call** |
| `buildingSelectors.ts` | 7 | 4 | `.filter()` on every call — no shallow equality |
| `marketSelectors.ts` | 7 | 2 | `.find()` on every call |
| `powerSelectors.ts` | 6 | 2 | ✅ Primitive derivations — OK |
| `progressionSelectors.ts` | 10 | 1 | `.filter()` on every call |

### Unmemoized Computations in Components

**25+ `.filter()` chains** execute on every render across these components:

| Component | Filter Chains | Impact |
|-----------|:------------:|--------|
| DashboardPanel | 4 | O(4n) every render |
| FactoryPanel | 2 | O(2n) every render |
| ResourcePanel | 3 | O(3n) every render |
| FactoryMapPanel | 7+ | O(7n) every render |
| PowerPanel | 3 | O(3n) every render |
| WorkerPanel | 3 | O(3n) every render |
| PayoutPanel | 4 | O(4n) every render |
| PrestigePanel | 7 | O(7n) per render |

**2 O(n²) computations** in render paths:
- MarketPanel `portfolioValue` — iterates resources × market entries
- AchievementPanel — 54 function calls with nested `.filter()/.some()`

### Missing `useCallback`

| Component | Unwrapped Functions |
|-----------|-------------------|
| ResourcePanel | `handleToggle` |
| FactoryPanel | `handleToggle` |
| PowerPanel | `handleBuild`, `handleUpgrade`, `handleToggle` |
| DashboardPanel | `handleBuild` |

### Missing `React.memo`

Only 4 components in the entire game directory use `React.memo`. Missing for high-frequency leaf components:

| Component | Props | Why It Needs It |
|-----------|-------|----------------|
| `PanelStatCard` | Primitives (icon, label, value, color, trend) | Ideal candidate — renders 5-20× per panel |
| `GameIcon` | String + size | Renders hundreds of times |
| `GameItemTooltip` | Wraps every building/market card | Re-renders on every parent state change |
| `BezierSparkline` | Data array | Heavy SVG re-computation |
| `SupplyDemandBar` | Primitives | Unnecessary re-renders |
| `MarketCycleIndicator` | Primitives | Unnecessary re-renders |

### The Right Pattern: `productionSnapshot`

The existing `productionCalculator.ts` is the model: compute all derived values once per tick in `gameTickAction`, write to `productionSnapshot`, and components read pre-computed values. This should be extended.

### Proposed Fixes

#### P0 — Immediate Impact (wrap in `useMemo`)

| Fix | Files | Effort |
|-----|-------|--------|
| Wrap unmemoized computations in `useMemo` | DashboardPanel, FactoryPanel, ResourcePanel, PowerPanel, FactoryMapPanel, WorkerPanel | Low |
| Add `useCallback` to handler functions | ResourcePanel, FactoryPanel, PowerPanel, DashboardPanel | Trivial |
| Memoize PrestigePanel bonus calculations | PrestigePanel | Low |

**Expected improvement:** Eliminates ~30 redundant O(n) iterations per render cycle.

#### P1 — Structural Improvements

| Fix | Effort | Impact |
|-----|--------|--------|
| Add `React.memo` to `PanelStatCard`, `GameIcon` | Trivial | Prevents hundreds of re-renders |
| Add derived building data to `productionSnapshot` | Medium | Eliminates duplicated filtering across 6+ panels |
| Add `completedResearchSet: Set<string>` to store | Low | O(1) lookups vs O(n) `.includes()` |

#### P2 — Architectural (longer-term)

| Fix | Effort | Impact |
|-----|--------|--------|
| Move achievement computation to store | Medium | Eliminates 54 function calls per render |
| Add `resourceDetails` computed map to `productionSnapshot` | Medium | Eliminates 4+ resource iterations |
| Move `portfolioValue` and `marketSummary` to store | Medium | Eliminates O(n²) per render |
| Create `useShallowSelector` hook | Medium | Prevents re-renders when array contents unchanged |

### Deliverables

| Item | Details |
|------|---------|
| Effort | **Variable** — P0: Low (2–3 hours); P1: Medium (4–6 hours); P2: High (8–12 hours) |
| Risk | **Low** — adding memoization and pre-computed values is purely additive |
| Expected value | **High** — P0 alone eliminates ~30 redundant computations per render |
| Dependencies | None |
| Consumer changes | None — memoization is transparent |

---

## Summary: Deliverables Per Item

| # | Item | Effort | Risk | Expected Value | Dependencies |
|---|------|--------|------|---------------|-------------|
| 1 | useCloudSync Decomposition | Medium (4–6h) | Low | High | None |
| 2 | Presence Hook Consolidation | Medium (3–4h) | Medium | Medium | None |
| 3 | Color Token Extraction | High (8–12h) | Low | High | None |
| 4 | Dead Code Cleanup | Low (1–2h) | Very Low | Medium | None |
| 5 | Derived Selector Review | Variable (2–12h) | Low | High | None |

### Recommended Execution Order

```
1. Dead Code Cleanup          ← fastest, lowest risk, clears the deck
2. useCloudSync Decomposition ← highest value, enables testing
3. Presence Hook Consolidation ← medium value, medium risk
4. Derived Selector Review    ← P0 fixes first, then P1, P2 as time allows
5. Color Token Extraction     ← largest scope, most mechanical, do last
```

### Out of Scope

- UI changes
- Navigation changes
- Mobile optimization
- New features
- Security model changes
- Database schema changes
- API changes

---

**This is a planning document. No implementation until approved.**
