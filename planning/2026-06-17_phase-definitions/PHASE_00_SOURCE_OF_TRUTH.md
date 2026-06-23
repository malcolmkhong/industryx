# Phase 00 - Source of Truth Recovery

## Status: PENDING
## Predecessor: None (do this before any implementation work)
## References: All root markdown files, RULES.md, ARCHITECTURE_BASELINE_REPORT.md

---

## Background

14 planning/report docs exist at the project root. Many contradict the actual code.
Key contradictions found in audit (June 2025):

Claim in docs                                                    | Code Reality
ARCHITECTURE_BASELINE_REPORT: page.tsx = 418 lines              | Actual: 1,344 lines
Phase 1C report: /api/game/trade/route.ts created               | Was MISSING (created June 2025)
Phase 1C report: useCloudSync has serverStateVersion             | NOT present in useCloudSync.ts
Phase 1C report: /api/game/state has clientStateVersion check   | NOT present
Phase 1D-A report: tradeConstants.ts created                    | File does NOT exist
Phase 1D-B report: cloudSync/ folder with 10 files              | Folder does NOT exist
Phase 1D-D report: presence/ folder with BasePresenceManager    | Folder does NOT exist
Phase 1D-E report: 2,469 color replacements with 11 tokens      | Tokens NOT in globals.css
worklog.md referenced in RULES.md and AGENT.md                  | File is DELETED/MISSING

25 issues were tracked in RULES.md Appendix A (audit date 2025-01-17).
Current verified status of each issue is unknown without a fresh audit.

---

## Objective

Produce a single verified canonical document reflecting ACTUAL project state.
Classify every root markdown file. Register all missing context.

---

## Scope
- Classify every root-level markdown file
- Build claim-vs-code verification matrix
- Create lost context register
- Publish PROJECT_STATUS_SOURCE_OF_TRUTH.md

## Out of Scope
- Any code changes
- Feature implementation

---

## Task Breakdown

### 00.1 Document Inventory and Classification

Classify each file as one of:
  CURRENT       - aligned with code, actively used as reference
  HISTORICAL    - was accurate, now outdated but valuable context
  CONTRADICTORY - makes claims that conflict with code reality
  SUPERSEDED    - replaced by a newer document
  UNKNOWN       - cannot verify without deeper audit

Files to classify (19 total):
  AGENT.md, RULES.md, README.md
  ARCHITECTURE_BASELINE_REPORT.md
  PHASE_0_CLOSURE_REPORT.md
  PHASE_1B_SECURITY_REPORT.md
  PHASE_1B_SECURITY_FOLLOWUP_REPORT.md
  PHASE_1C_SERVER_AUTHORITATIVE_TRADING_PLAN.md
  PHASE_1C_REVISED_ARCHITECTURE.md
  PHASE_1C_IMPLEMENTATION_REPORT.md
  PHASE_1C_FOLLOWUP_REPORT.md
  PHASE_1D_TECHNICAL_DEBT_PLAN.md
  PHASE_1D_A_IMPLEMENTATION_REPORT.md
  PHASE_1D_B_IMPLEMENTATION_REPORT.md
  PHASE_1D_C_IMPLEMENTATION_REPORT.md
  PHASE_1D_D_IMPLEMENTATION_REPORT.md
  PHASE_1D_E_IMPLEMENTATION_REPORT.md
  UI_ARCHITECTURE_BLUEPRINT.md
  UI_IMPLEMENTATION_EXECUTION_PLAN.md

### 00.2 Claim Verification Matrix

For each implementation report, extract ALL file creation/modification claims.
Verify each claim against repository.

Matrix columns:
  Doc | Claim | Claimed File/Change | Actual in Repo | Status

Known unverified claims (start here):
  1. PHASE_1C_IMPL: /api/game/trade/route.ts created              -> NOW EXISTS (June 2025)
  2. PHASE_1C_IMPL: useCloudSync serverStateVersion tracking      -> NOT present
  3. PHASE_1C_IMPL: /api/game/state STATE_VERSION_CONFLICT        -> NOT present
  4. PHASE_1C_IMPL: trade_history columns: server_state_version   -> NOT verified
  5. PHASE_1D_A: tradeConstants.ts created                        -> NOT present
  6. PHASE_1D_A: db.ts deleted                                    -> NOT verified
  7. PHASE_1D_B: cloudSync/ folder with 10 files                  -> NOT present
  8. PHASE_1D_C: useMemo/useCallback across heavy panels          -> NOT verified
  9. PHASE_1D_D: presence/ folder with BasePresenceManager        -> NOT present
  10. PHASE_1D_E: 11 semantic tokens in globals.css               -> NOT present

### 00.3 25 Issue Registry Current Status

RULES.md Appendix A lists 25 issues from the Jan 2025 deep audit.
For each issue, determine: FIXED / PARTIAL / OPEN / CANNOT VERIFY

Already verified in audit (June 2025):
  FIXED:   C1 (HMAC fallback), C2 (fail-closed), C3 (importSave), C4 (setGameSpeed)
  FIXED:   C5 (trading now uses /api/game/trade)
  FIXED:   H4 (dead action types removed), H8 (rate limiting added)
  FIXED:   M2 (queueMicrotask replaces setImmediate)
  OPEN:    H1 (DashboardPanel full-store subscription)
  OPEN:    H2 (in-memory rate limiter)
  PARTIAL: H3 (RPC migration exists but code still does read-then-write)
  OPEN:    H5 (solarPanel naming collision), H6 (debounced persist risk)
  OPEN:    M1 (configCache no re-render), M3 M4 M5 M6 M7 M8
  OPEN:    L1 L2 L3 L4 L5 L6

### 00.4 Lost Context Register

Items known to be missing and requiring recreation:
  1. worklog.md - deleted, was project timeline anchor, referenced in RULES.md
  2. Branch/PR references for each phase (no VCS evidence of merges in repo)
  3. Why page.tsx grew from 418 (baseline claim) to 1,344 (actual June 2025)
  4. What Phase 1D implementations existed before and were lost
  5. Whether production DB has trade_history new columns from Phase 1C
  6. Whether increment_cheat_flag RPC exists in production Supabase

### 00.5 Canonical Status Document

Produce PROJECT_STATUS_SOURCE_OF_TRUTH.md with:
  - Project vision (stable, from AGENT.md)
  - Actual architecture snapshot (verified current file structure and sizes)
  - Issue registry with verified status for all 25 issues
  - What is DONE / PARTIAL / NOT DONE
  - Phase roadmap going forward (reference this planning/ folder)

### 00.6 Add Status Banners to Stale Root Docs

For each non-current root doc, add front banner:
  > STATUS: HISTORICAL - Written [date]. Superseded by PROJECT_STATUS_SOURCE_OF_TRUTH.md.
  > Claims in this doc have not been fully verified against current codebase.

---

## Deliverables

1. planning/CLAIM_VERIFICATION_MATRIX.md
2. planning/LOST_CONTEXT_REGISTER.md
3. PROJECT_STATUS_SOURCE_OF_TRUTH.md (root level)
4. Status banners on all root phase/report docs

---

## Validation

- bun run lint passes (no code regressions from doc-only changes)
- All 19 root markdown files have explicit classification

## Exit Criteria

- Every root markdown file has a classification (CURRENT/HISTORICAL/CONTRADICTORY/etc)
- PROJECT_STATUS_SOURCE_OF_TRUTH.md exists with verified 25-issue registry
- Lost context items listed with recovery priority
- All doc claims mapped to code evidence (verified/not_found/conflicts_with_code)
