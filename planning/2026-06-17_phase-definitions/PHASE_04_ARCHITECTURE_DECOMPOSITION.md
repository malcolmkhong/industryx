# Phase 04 - Architecture Decomposition

## Status: PENDING
## Predecessor: Phase 03 Performance and Render Stability
## References: ARCHITECTURE_BASELINE_REPORT.md sections 2-3, PHASE_1D_TECHNICAL_DEBT_PLAN.md sections 1-2

---

## Background

Three monolithic files are the core architecture risk:

File                           | Lines | Problem
src/lib/game/store.ts          | 3,506 | God file: all 42 actions, gameTickAction (~1,000 lines), 19 save migrations, persist config, utilities
src/app/page.tsx               | 1,344 | Orchestrator + inline header (~488 lines) + 10 effects + handlers + dialog state
src/lib/hooks/useCloudSync.ts  | 485   | 7 responsibilities, serialization logic duplicated x2, error mapping duplicated x2

Additional decomposition targets (from Phase 1D plan):
src/lib/hooks/useOnlinePresence.ts + useAdminPresence.ts = ~130 lines duplicated
  (Phase 1D-D plan exists with full BasePresenceManager architecture)

Phase 1D-B claimed useCloudSync was decomposed into 10 files under cloudSync/.
Phase 1D-D claimed presence hooks were consolidated.
Audit found NEITHER folder exists. Both are unimplemented.

---

## Objective

Decompose the three largest files into bounded, independently testable modules
WITHOUT changing any external behavior or API surface.

---

## Task Breakdown

### 04.1 useCloudSync Decomposition

Reference: PHASE_1D_TECHNICAL_DEBT_PLAN.md section 1

Target architecture (from plan, unimplemented):
  src/lib/hooks/cloudSync/
  - serializeGameState.ts     pure util - extracts the 30-field game state object
  - detectConflict.ts         pure util - conflict heuristic (tick ratio + money delta)
  - mapHttpErrorToBlock.ts    pure util - HTTP status -> CloudBlockState mapping
  - useBlockedState.ts        hook - manages blockedState for auth/validation errors
  - useServerAuthority.ts     hook - manages serverStateHash, serverStateVersion, isServerAuthoritative
  - useConflictResolution.ts  hook - manages pendingConflict, cloudDataRef, resolveConflict
  - useCloudSave.ts           hook - saveToCloud with conflict merge + retry
  - useCloudLoad.ts           hook - loadFromCloud with conflict detection + auto-load
  - index.ts                  facade - useCloudSync() with identical return type

Critical rule: useCloudSync() public API MUST remain identical.
  - Same function signature: () => CloudSyncState
  - Same return shape: { saveToCloud, loadFromCloud, lastSyncAt, isSyncing, resolveConflict,
                         pendingConflict, serverStateHash, isServerAuthoritative, blockedState, migrationResult, isMigrating }
  - All consumers continue to work with zero changes

### 04.2 Presence Hook Consolidation

Reference: PHASE_1D_TECHNICAL_DEBT_PLAN.md section 2

Target architecture:
  src/lib/hooks/presence/
  - BasePresenceManager.ts    abstract class with shared subscribe/notify/connect/disconnect/track
  - VisitorPresenceManager.ts extends Base - adds user tracking, visibility handler, self-include
  - AdminPresenceManager.ts   extends Base - adds self-exclusion from count, ephemeral key
  - useOnlinePresence.ts      thin wrapper hook (preserves existing API)
  - useAdminPresence.ts       thin wrapper hook (preserves existing API)

Key differences to preserve:
  - useOnlinePresence: counts self in online count, tracks real user, visibility handler
  - useAdminPresence: excludes self from count, uses ephemeral admin key, null sentinel state

Critical rule: Both hooks must preserve exact return types and behavior.
  useOnlinePresence: returns { onlineCount: number }
  useAdminPresence: returns { onlineCount: number | null }

### 04.3 page.tsx Decomposition

Reference: PHASE_0_CLOSURE_REPORT.md section 2 (extraction plan)
           ARCHITECTURE_BASELINE_REPORT.md section 1.1

page.tsx is 1,344 lines. Target after extraction: ~204 lines (orchestration shell).

Extraction targets with estimated savings:
  DesktopHeader component    ~343 lines saved (header JSX inline)
  MobileHeader component     ~145 lines saved (mobile header JSX inline)
  HeaderAuth component       ~108 lines saved (auth/cloud UI inline)
  Effects -> custom hooks    ~188 lines saved (10 useEffect hooks)
  Export/Import dialogs      ~90 lines saved (dialog JSX inline)
  Offline earnings dialog    ~87 lines saved (dialog JSX inline)
  Loading skeleton           ~47 lines saved (GameLoadingSkeleton)

Order:
1. Extract effects first (lowest risk - no JSX changes)
2. Extract dialog components (medium risk - isolated JSX sections)
3. Extract header components last (highest risk - most props)

Rules for header extraction:
  - DesktopHeader must read its own data via useGameStore selectors (not via props)
  - Exception: pass only event handlers (onExport, onImport, onReset) as props
  - This eliminates the 35-prop problem (H6 from baseline report)

### 04.4 Store.ts Decomposition (Planning Only in This Phase)

store.ts at 3,506 lines is the biggest risk. Full decomposition is Phase 05+ work.
In this phase: produce the decomposition map only.

Plan to produce:
  planning/STORE_DECOMPOSITION_MAP.md with:
  - Proposed slice boundaries: economy, buildings, research, market, workers, progression, ui
  - Dependencies between slices (which slices read which other slices)
  - Estimate for gameTickAction decomposition (it is ~1,000 lines itself)
  - Risk register: what can break during extraction

---

## Deliverables

1. src/lib/hooks/cloudSync/ folder with all 9 files (useCloudSync decomposed)
2. src/lib/hooks/presence/ folder with all 5 files (hooks consolidated)
3. DesktopHeader.tsx and MobileHeader.tsx extracted from page.tsx
4. 10 effects extracted to custom hooks, dialog components extracted
5. planning/STORE_DECOMPOSITION_MAP.md (planning only, no implementation)

---

## Dependencies

- Phase 03 complete (performance work done first - stable panels before structural changes)
- Phase 02 complete (sync logic finalized before decomposing useCloudSync)

---

## Validation

  # Verify useCloudSync API unchanged
  grep -r 'useCloudSync' src/  # same call sites, same usage pattern

  # Verify presence hooks unchanged
  grep -r 'useOnlinePresence\|useAdminPresence' src/  # same call sites

  bun run lint  # 0 errors
  bun run dev   # starts, GET / returns 200

- Browser: cloud sync save/load works correctly after decomposition
- Browser: online count displays correctly after presence consolidation
- Browser: header displays all stats, controls, auth after extraction

## Exit Criteria

- cloudSync/ folder exists with all 9 files
- presence/ folder exists with all 5 files
- useCloudSync() return type identical to before
- page.tsx < 500 lines (or significantly reduced from 1,344)
- No broken imports anywhere
- planning/STORE_DECOMPOSITION_MAP.md exists and is reviewed
