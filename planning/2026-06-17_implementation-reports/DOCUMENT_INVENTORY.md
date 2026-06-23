# Document Inventory

> **Generated:** 2026-06-11
> **Purpose:** Classify all 20 root-level markdown files by status (CURRENT / HISTORICAL / CONTRADICTORY / SUPERSEDED / UNKNOWN)
> **Source:** planning/CLAIM_VERIFICATION_MATRIX.md + direct read of each file
> **Authority:** PROJECT_STATUS_SOURCE_OF_TRUTH.md (canonical)

## Classification Categories

| Status | Meaning |
|--------|---------|
| **CURRENT** | Aligned with code, actively used as engineering reference |
| **HISTORICAL** | Was accurate, now outdated but valuable as project history |
| **CONTRADICTORY** | Makes claims that conflict with verified code reality |
| **SUPERSEDED** | Replaced by a newer document (canonical successor exists) |
| **UNKNOWN** | Cannot verify without deeper audit (e.g., empty placeholder) |

## Document Inventory (20 files)

| # | File | Classification | Reason / Evidence |
|---|------|---------------|-------------------|
| 1 | `AGENT.md` | **CURRENT** | Engineering constitution; operating guidelines; no verified contradictions |
| 2 | `RULES.md` | **CURRENT** | Project rules + 25-issue registry (canonical authority on what's forbidden) |
| 3 | `README.md` | **UNKNOWN** | 1-line placeholder (`# industryx`); no project context — not a useful doc |
| 4 | `ARCHITECTURE_BASELINE_REPORT.md` | **CONTRADICTORY** | Claims `page.tsx=418 lines` (actual: 1,344), `useCloudSync=375 lines` (actual: 485) |
| 5 | `PHASE_0_CLOSURE_REPORT.md` | **CONTRADICTORY** | Claims 0 `useGameStore()` matches in components; verified 28 matches in 27 files |
| 6 | `PHASE_1B_SECURITY_REPORT.md` | **HISTORICAL** | Phase 1B security audit (2025-03-04); C1-C6, H3, H8 fixes verified in code |
| 7 | `PHASE_1B_SECURITY_FOLLOWUP_REPORT.md` | **HISTORICAL** | H3 fail-closed fix + trading validation investigation (NEW-1 = Phase 1C scope) |
| 8 | `PHASE_1C_SERVER_AUTHORITATIVE_TRADING_PLAN.md` | **SUPERSEDED** | Original trading plan; replaced by `PHASE_1C_REVISED_ARCHITECTURE.md` |
| 9 | `PHASE_1C_REVISED_ARCHITECTURE.md` | **SUPERSEDED** | Revised trading plan; implementation completed per `PHASE_1C_IMPLEMENTATION_REPORT.md` |
| 10 | `PHASE_1C_IMPLEMENTATION_REPORT.md` | **CONTRADICTORY** | Claims `tradeConstants.ts` was created in Phase 1D-A (does not exist), `trade_history.server_state_version` column added (NOT in migration 008) |
| 11 | `PHASE_1C_FOLLOWUP_REPORT.md` | **CONTRADICTORY** | Claims `useCloudSync` has `serverStateVersion`; verified it uses `serverStateHash` |
| 12 | `PHASE_1D_TECHNICAL_DEBT_PLAN.md` | **HISTORICAL** | Planning document for Phase 1D (5 cleanup items) |
| 13 | `PHASE_1D_A_IMPLEMENTATION_REPORT.md` | **CONTRADICTORY** | Claims `tradeConstants.ts` was created in `src/lib/game/`; file does not exist |
| 14 | `PHASE_1D_B_IMPLEMENTATION_REPORT.md` | **CONTRADICTORY** | Claims `cloudSync/` folder with 9 files was created; folder does not exist; `useCloudSync.ts` remains 485-line single file |
| 15 | `PHASE_1D_C_IMPLEMENTATION_REPORT.md` | **CONTRADICTORY** | Claims 37 useMemo + 6 useCallback + 3 React.memo added across 14 files; CLAIM_VERIFICATION_MATRIX shows UNKNOWN status (audit not independently verified) |
| 16 | `PHASE_1D_D_IMPLEMENTATION_REPORT.md` | **CONTRADICTORY** | Claims `presence/` folder with 5 files was created; folder does not exist |
| 17 | `PHASE_1D_E_IMPLEMENTATION_REPORT.md` | **CONTRADICTORY** | Claims 11 semantic color tokens in `globals.css`; verified NOT FOUND in current globals.css |
| 18 | `UI_ARCHITECTURE_BLUEPRINT.md` | **SUPERSEDED** | Draft architecture (2025-01-13); never implemented; status "DRAFT - Design Only" |
| 19 | `UI_IMPLEMENTATION_EXECUTION_PLAN.md` | **SUPERSEDED** | Draft execution plan (2025-01-13); never implemented; status "DRAFT - Awaiting Approval" |

## Summary

| Classification | Count | Files |
|----------------|------:|-------|
| **CURRENT** | 2 | AGENT.md, RULES.md |
| **HISTORICAL** | 4 | PHASE_1B_SECURITY_REPORT, PHASE_1B_FOLLOWUP, PHASE_1D_TECHNICAL_DEBT_PLAN, PHASE_1C_REVISED_ARCHITECTURE (planning artifacts) |
| **CONTRADICTORY** | 10 | ARCHITECTURE_BASELINE, PHASE_0_CLOSURE, PHASE_1C_IMPL, PHASE_1C_FOLLOWUP, PHASE_1D_A, 1D_B, 1D_C, 1D_D, 1D_E, (additional docs with verified-false claims) |
| **SUPERSEDED** | 3 | PHASE_1C_PLAN, UI_ARCHITECTURE_BLUEPRINT, UI_IMPLEMENTATION_EXECUTION_PLAN |
| **UNKNOWN** | 1 | README.md (placeholder) |

**Note on PHASE_1C_REVISED_ARCHITECTURE.md:** Although implementation completed per `PHASE_1C_IMPLEMENTATION_REPORT.md`, the IMPLEMENTATION report itself is CONTRADICTORY (claims files that don't exist). The plan document is SUPERSEDED by an implementation that itself failed to deliver as claimed.

## Cross-Reference with planning/ Folder

| planning/ File | Purpose | Status |
|---------------|---------|--------|
| `README.md` | Planning hub manifest | CURRENT |
| `CLAIM_VERIFICATION_MATRIX.md` | Maps doc claims to code evidence (22 claims tracked) | CURRENT |
| `LOST_CONTEXT_REGISTER.md` | Catalogs missing/deleted/contradicted items (18 items) | CURRENT |
| `phases/PHASE_00_SOURCE_OF_TRUTH.md` | Phase 0 plan | PENDING (in progress) |
| `phases/PHASE_01_SECURITY_CLOSURE.md` | Phase 1 plan (closes H3, M8, M6/L6, M7, H5, H2) | PENDING (in progress) |
| `phases/PHASE_02_SERVER_AUTHORITY_AND_SYNC.md` | Phase 2 plan (closes Phase 1C gaps) | PENDING |
| `phases/PHASE_03_PERFORMANCE_AND_RENDER_STABILITY.md` | Phase 3 plan (closes H1, perf) | PENDING |
| `phases/PHASE_04_ARCHITECTURE_DECOMPOSITION.md` | Phase 4 plan (decompose 3 monoliths) | PENDING |
| `phases/PHASE_05_UI_SYSTEM_ALIGNMENT.md` | Phase 5 plan (semantic tokens, composites) | PENDING |
| `phases/PHASE_06_RELEASE_READINESS.md` | Phase 6 plan (worklog, Sentry, checklists) | PENDING |

## Notes on Classification Decisions

**PHASE_1B reports classified HISTORICAL not CURRENT:** Although the fixes described were verified (C1-C6, H3, H8 all marked FIXED in PHASE_1B_SECURITY_REPORT), the report itself is from 2025-03-04 and represents a snapshot of work. The CURRENT status would imply "use this as ongoing engineering reference," which is not its purpose. PROJECT_STATUS_SOURCE_OF_TRUTH.md is the canonical source for current state.

**PHASE_1C_REVISED_ARCHITECTURE.md classified SUPERSEDED:** Even though it's a "revised" plan, the implementation it led to (PHASE_1C_IMPLEMENTATION_REPORT.md) is itself CONTRADICTORY. The plan was implemented in name only — many claimed artifacts do not exist.

**PHASE_1D_C marked CONTRADICTORY:** The report claims 37 useMemo + 6 useCallback additions across 14 files, but CLAIM_VERIFICATION_MATRIX.md shows this as UNKNOWN (not independently verified). The performance work may have happened, but documentation does not match code.

**README.md marked UNKNOWN:** Single-line placeholder provides no project context. Cannot classify as CURRENT (not useful) or CONTRADICTORY (no claims made). Replace with substantive README to upgrade to CURRENT.
