# Lost Context Register

> **Generated:** 2026-06-11
> **Purpose:** Catalog all missing, deleted, or contradicted context items that could mislead future developers
> **Columns:** Item | Category | Description | Recovery Priority | Suggested Action

---

## Missing Artifacts (Files/Folders Claimed But Not Found)

| Item | Category | Description | Recovery Priority | Suggested Action |
|------|----------|-------------|-------------------|------------------|
| `tradeConstants.ts` | Missing File | Phase 1D-A report claims this file was created in `src/lib/game/`. File does not exist. Contains trade-related constants. | HIGH | Recreate based on Phase 1D-A report specifications or remove claims from report |
| `cloudSync/` folder | Missing Folder | Phase 1D-B report claims a `cloudSync/` folder with 10 files was created in `src/lib/hooks/`. Folder does not exist. Was meant to decompose `useCloudSync.ts`. | HIGH | Either implement the decomposition as planned, or mark Phase 1D-B as never merged |
| `presence/` folder | Missing Folder | Phase 1D-D report claims a `presence/` folder with `BasePresenceManager` was created in `src/lib/hooks/`. Folder does not exist. Was meant for multiplayer presence tracking. | HIGH | Either implement presence system as planned, or mark Phase 1D-D as never merged |

## Missing Database Columns

| Item | Category | Description | Recovery Priority | Suggested Action |
|------|----------|-------------|-------------------|------------------|
| `trade_history.server_state_version` | Missing Column | Phase 1C report claims this column exists in the trade_history table. Migration 008 does not include it. | MEDIUM | Add column via new migration if needed for state sync, or remove claim from report |
| `trade_history.exchange_rate_used` | Missing Column | Phase 1C report claims this column exists in the trade_history table. Migration 008 does not include it. | MEDIUM | Add column via new migration if needed for audit trail, or remove claim from report |

## Deleted Files

| Item | Category | Description | Recovery Priority | Suggested Action |
|------|----------|-------------|-------------------|------------------|
| `worklog.md` | Deleted File | Was the project timeline anchor, referenced in RULES.md and AGENT.md. File is deleted. Contained chronological record of all phase work. | HIGH | Recreate from git history if available, or document that timeline is lost |
| `db.ts` | Deleted File | Phase 1D-A report claims this file was deleted. Confirmed: file does not exist. Was likely a database utility file. | LOW | No action needed — deletion was intentional per Phase 1D-A |

## Contradicted Context

| Item | Category | Description | Recovery Priority | Suggested Action |
|------|----------|-------------|-------------------|------------------|
| `serverStateVersion` variable | Contradicted Variable | Phase 1C and follow-up reports claim `useCloudSync.ts` uses `serverStateVersion`. Actual code uses `serverStateHash`. | MEDIUM | Update reports to reflect actual variable name, or rename variable in code if `serverStateVersion` is the correct term |
| `clientStateVersion` parameter | Contradicted Parameter | Phase 1C report claims `/api/game/state` endpoint accepts `clientStateVersion`. Actual endpoint has no such parameter. | MEDIUM | Add parameter if needed for conflict detection, or update report |
| `STATE_VERSION_CONFLICT` in state route | Contradicted Error Code | Phase 1C report claims this error code exists in `/api/game/state`. Only exists in `/api/game/trade`. | MEDIUM | Add error code to state route if needed, or update report |
| `useGameStore()` zero matches | Contradicted Metric | Phase 0 closure report claims 0 `useGameStore()` matches in components. Actual: 28 matches in 27 files. | LOW | Update Phase 0 report with correct count |
| `page.tsx` line count | Contradicted Metric | Architecture baseline claims 418 lines. Actual: 1,344 lines. | LOW | Update baseline report or add note about growth |
| `useCloudSync.ts` line count | Contradicted Metric | Architecture baseline claims 375 lines. Actual: 485 lines. | LOW | Update baseline report or add note about growth |
| Semantic color tokens | Contradicted Tokens | Phase 1D-E report claims 11 semantic tokens in `globals.css`. Actual: different token set (shadcn + neon/industrial). | MEDIUM | Either implement semantic tokens as planned, or update report to reflect actual token system |

## Unverified Claims

| Item | Category | Description | Recovery Priority | Suggested Action |
|------|----------|-------------|-------------------|------------------|
| Phase 1D-C memoization | Unverified | Phase 1D-C report (304 lines) claims extensive useMemo/useCallback/React.memo work across 20+ components. Not independently verified. | MEDIUM | Audit component files to verify memoization claims |
| 25-issue registry status | Unverified | RULES.md Appendix A lists 25 issues from Jan 2025 audit. Most marked OPEN without fresh codebase verification. | HIGH | Re-verify each issue against current codebase |

## Branch/PR Evidence

| Item | Category | Description | Recovery Priority | Suggested Action |
|------|----------|-------------|-------------------|------------------|
| Phase merge commits | Missing Git Evidence | No git merge commits found matching phase structure. Cannot determine which Phase implementations were actually merged vs. just documented. | MEDIUM | Check git reflog or remote branches for evidence of phase merges |

---

## Summary

| Category | Count |
|----------|-------|
| Missing Artifacts | 3 |
| Missing Database Columns | 2 |
| Deleted Files | 2 |
| Contradicted Context | 8 |
| Unverified Claims | 2 |
| Branch/PR Evidence | 1 |

**Total lost context items:** 18
**High priority recovery:** 4 (tradeConstants.ts, cloudSync/, presence/, worklog.md)
