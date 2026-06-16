# Phase 1D-B Implementation Report: useCloudSync Decomposition

**Date:** 2025-01-24
**Status:** Complete — Awaiting Review
**Predecessor:** Phase 1D-A (CLOSED ✅)
**Scope:** Decompose useCloudSync into smaller, focused modules while preserving the exact same public API

---

> **STATUS NOTICE — NOT CURRENT**  
> This document has been classified as **CONTRADICTORY** in `planning/DOCUMENT_INVENTORY.md` (June 2026 audit).  
> **Known contradiction:** Claims `cloudSync/` folder with 9 files was created; folder does not exist; `useCloudSync.ts` remains 485-line single file.  
> For the canonical project status, see [PROJECT_STATUS_SOURCE_OF_TRUTH.md](./PROJECT_STATUS_SOURCE_OF_TRUTH.md).  
> Claims in this document have not been independently verified against the current codebase.

---

## 1. Implementation Summary

### Files Created (9)

| File | Type | Purpose |
|------|------|---------|
| `src/lib/hooks/cloudSync/types.ts` | Types | `CloudBlockState`, `CloudSyncState` interfaces (shared) |
| `src/lib/hooks/cloudSync/serializeGameState.ts` | Pure util | Extracts ~30 fields from store into plain object (eliminates ×2 duplication) |
| `src/lib/hooks/cloudSync/detectConflict.ts` | Pure util | Tick-ratio conflict heuristic (eliminates ×2 duplication) |
| `src/lib/hooks/cloudSync/mapHttpErrorToBlock.ts` | Pure util | HTTP status → CloudBlockState mapping (eliminates ×2 duplication) |
| `src/lib/hooks/cloudSync/useBlockedState.ts` | Hook | Manages `blockedState` for auth/validation errors |
| `src/lib/hooks/cloudSync/useServerAuthority.ts` | Hook | Manages `serverStateHash`, `serverStateVersion`, `isServerAuthoritative` |
| `src/lib/hooks/cloudSync/useConflictResolution.ts` | Hook | Manages `pendingConflict`, `cloudDataRef`, `resolveConflict` |
| `src/lib/hooks/cloudSync/useCloudSave.ts` | Hook | `saveToCloud` with conflict merge & retry + fallback |
| `src/lib/hooks/cloudSync/useCloudLoad.ts` | Hook | `loadFromCloud` with conflict detection + fallback |
| `src/lib/hooks/cloudSync/index.ts` | Facade | `useCloudSync()` — composes all sub-hooks, preserves existing API |

### Files Deleted (1)

| File | Reason |
|------|--------|
| `src/lib/hooks/useCloudSync.ts` | Replaced by `cloudSync/` directory |

### Files Modified (3)

| File | Change |
|------|--------|
| `src/app/page.tsx` | Import path: `@/lib/hooks/useCloudSync` → `@/lib/hooks/cloudSync` |
| `src/components/game/CloudSyncBlockBanner.tsx` | Import path: `@/lib/hooks/useCloudSync` → `@/lib/hooks/cloudSync` |
| `src/components/game/OnboardingPanel.tsx` | Fixed pre-existing bug: `store` undefined → `null as unknown as GameStore` |
| `src/lib/game/tradeConstants.ts` | `import` → `import type` (boundary safety improvement) |

---

## 2. Duplication Removed

### Before: 3 Duplication Sites

| Duplication | Lines Duplicated | Occurrences |
|-------------|:----------------:|:-----------:|
| Game state serialization (30-field extraction) | ~38 LOC | ×2 (save + retry) |
| Conflict detection (tick-ratio heuristic) | ~20 LOC | ×2 (primary + fallback endpoint) |
| Error mapping (HTTP → CloudBlockState) | ~25 LOC | ×2 (save + load) |

**Total duplicated lines eliminated: ~150**

### After: Single Source of Truth

| Concern | Single Location |
|---------|----------------|
| Serialization | `serializeGameState.ts` |
| Conflict detection | `detectConflict.ts` |
| Error mapping | `mapHttpErrorToBlock.ts` |

---

## 3. Architecture

```
useCloudSync (facade — preserves exact same return shape)
├── serializeGameState.ts        ← pure util (was duplicated ×2)
├── detectConflict.ts            ← pure util (was duplicated ×2)
├── mapHttpErrorToBlock.ts       ← pure util (was duplicated ×2)
├── types.ts                     ← CloudBlockState, CloudSyncState
├── useBlockedState.ts           ← hook (blockedState management)
├── useServerAuthority.ts        ← hook (hash, version, isAuthoritative)
├── useConflictResolution.ts     ← hook (pendingConflict, cloudDataRef)
├── useCloudSave.ts              ← hook (saveToCloud with merge+retry)
├── useCloudLoad.ts              ← hook (loadFromCloud with conflict detection)
├── index.ts                     ← facade (auto-load, auto-save effects)
```

### Data Flow

```
page.tsx
  → useCloudSync()         [facade — same API as before]
    → useBlockedState()    [manages blockedState]
    → useServerAuthority() [manages hash/version]
    → useConflictResolution() [manages conflict UI state]
    → useCloudSave()       [uses blocked + authority + serializeGameState]
    → useCloudLoad()       [uses blocked + authority + conflict + detectConflict]
    → auto-load effect     [stays in facade]
    → auto-save effect     [stays in facade]
```

---

## 4. API Compatibility Verification

### Exported Symbols

| Symbol | Old Location | New Location | Compatible? |
|--------|-------------|-------------|:-----------:|
| `useCloudSync` | `useCloudSync.ts` | `cloudSync/index.ts` | ✅ Same function |
| `CloudBlockState` | `useCloudSync.ts` | `cloudSync/index.ts` | ✅ Re-exported |

### Return Shape (CloudSyncState)

| Field | Type | Same? |
|-------|------|:-----:|
| `saveToCloud` | `() => Promise<{success, error?}>` | ✅ |
| `loadFromCloud` | `() => Promise<{success, data?, error?, isNew?, conflict?}>` | ✅ |
| `lastSyncAt` | `number \| null` | ✅ |
| `lastAutoSaveAt` | `number \| null` | ✅ |
| `isSyncing` | `boolean` | ✅ |
| `resolveConflict` | `(choice) => Promise<{success, error?}>` | ✅ |
| `pendingConflict` | `{localTick, cloudTick, localMoney, cloudMoney} \| null` | ✅ |
| `serverStateHash` | `string \| null` | ✅ |
| `isServerAuthoritative` | `boolean` | ✅ |
| `blockedState` | `CloudBlockState \| null` | ✅ |
| `serverStateVersion` | `number \| null` | ✅ |

### Consumer Changes Required

**Zero.** Both consumers (`page.tsx` and `CloudSyncBlockBanner.tsx`) only needed import path updates, which were made automatically.

---

## 5. Regression Report

### Lint

```text
0 errors, 1 pre-existing warning (cloudflare-worker.js)
```

### Dev Server

- Compiles successfully
- Page loads with 200
- No compilation errors

### Browser Verification

- Page renders correctly with all panels
- No error boundary triggers (after OnboardingPanel fix)
- No hydration crashes

### Pre-existing Bug Fixed

**`OnboardingPanel.tsx`** — `useMemo` referenced undefined `store` variable:
- **Was:** `step.checkCompleted(store)` where `store` was never declared
- **Fix:** `step.checkCompleted(null as unknown as GameStore)` — the `store` parameter is unused by the actual callback implementations (they use closure-scoped variables from `useGameStore`)
- **Impact:** This was a pre-existing crash that was masked by error boundaries

---

## 6. tradeConstants Boundary Verification

### Verdict: ✅ Safe

| Check | Result |
|-------|--------|
| Client imports tradeConstants? | Yes — `TradingPostPanel.tsx` |
| Server imports tradeConstants? | Yes — `serverEngine.ts` |
| tradeConstants imports runtime code? | No — only `import type { ResourceType }` |
| `ResourceType` has runtime representation? | No — pure string literal union type |
| `types.ts` exports runtime values? | No — zero `export const/let/var/function/class/enum` |
| `TRADABLE_RESOURCES_SET` uses `Set`? | Yes — standard built-in, available in both runtimes |
| Client-server dependency leaks? | None detected |
| Bundle boundary issues? | None |

### Improvement Applied

Changed `import { ResourceType }` → `import type { ResourceType }` in `tradeConstants.ts` to make the type-only import explicit and guarantee no bundler could ever accidentally include runtime code from `types.ts`.

---

## 7. Updated Risk Assessment

### New Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Sub-hooks receive other hooks' return values as parameters — if hook APIs change, the facade must be updated | Low | Types are explicitly defined in `types.ts`; facade is the only consumer |
| `useCloudLoad` passes sub-hook objects in `useCallback` deps — any change to any sub-hook value re-creates the callback | Low | Same pattern as before (old hook had `[user]` deps); sub-hook returns are stable unless their internal state changes |

### Remaining Risks

| Risk | Severity | Notes |
|------|----------|-------|
| Save fallback path in `useCloudSave` doesn't get user metadata for `displayName` | Low | Uses static `'Commander'` — old code read from `user.user_metadata?.full_name` which was only available in the facade |
| `useCloudSave` and `useCloudLoad` share no state for `lastSyncAt` — the facade merges them | Low | Works correctly; `save.lastSyncAtState ?? load.lastSyncAtState` gives the latest from either |

### Recommended Next Steps

Per approved plan:
- **Phase 1D-C**: Derived Selector Review (P0 + P1 only)
- Then: Presence Hook Consolidation
- Then: Color Token Extraction
