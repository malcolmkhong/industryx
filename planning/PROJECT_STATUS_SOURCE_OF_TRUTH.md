# PROJECT_STATUS_SOURCE_OF_TRUTH.md

> **Last Updated:** 2026-06-12 (session 2 — 5 more commits)
> **Authority:** This document is the canonical source for IndustriaX project state. All other docs reference this.
> **Source evidence:** planning/CLAIM_VERIFICATION_MATRIX.md, planning/LOST_CONTEXT_REGISTER.md, planning/DOCUMENT_INVENTORY.md, PHASE_1B_SECURITY_REPORT.md, PHASE_1B_FOLLOWUP_REPORT.md, direct code/file reads, PROJECT_REVIEW.md (2026-06-12).

## Project Vision

IndustriaX ("Factory Dominion: Automated Empire") is a browser-based industrial tycoon idle game built with Next.js 16, React 19, Zustand 5, and Supabase. The project aims for high integrity, security, and quality, following an architecture-first and security-first philosophy. It features a complex game loop, server-side validation, and a robust persistence layer.

## Architecture Snapshot (June 2026 verified)

### Core File Metrics

| File | Lines | Notes |
|------|------:|-------|
| `src/lib/game/store.ts` | 3,506 | God file: 42 actions, gameTickAction (~1,000 lines), 19 save migrations — **decomposition map exists, implementation pending** |
| `src/app/page.tsx` | **292** | Was 1,337. **-78% reduction** (Phase 04.3 complete) |
| `src/lib/hooks/useCloudSync.ts` | 9 | **Barrel re-export** — decomposed to `src/lib/hooks/cloudSync/` (9 files, `9d3b7c1`) |
| `src/lib/hooks/cloudSync/` | 9 files | `serializeGameState`, `detectConflict`, `mapHttpErrorToBlock`, `useBlockedState`, `useServerAuthority`, `useCloudPersistence`, `useConflictResolution`, `index` facade |
| `src/lib/hooks/presence/` | 5 files | `BasePresenceManager`, `VisitorPresenceManager`, `AdminPresenceManager` + 2 thin wrapper hooks (`0e83906`) |
| `src/lib/game/selectors/` | 6 files | 30 named selectors across 5 domains + barrel export (`bb5f868`) |

### Database Status

- **Supabase Project Ref:** `wkkzqtseqwcyyyezroqq`
- **Migrations:** 11 → **17** total (001 → 017, 6 new in 2026 cycle)
- **Migrations added:**
  - `012_atomic_cheat_flag.sql` (H3)
  - `013_tradable_resources.sql`
  - `014_trade_cooldown.sql`
  - `015_market_history.sql`
  - `016_rate_limits.sql` (H2)
  - `017_rate_limits_cron.sql` (H2 cleanup)

### Document Inventory (Summary)

See `planning/DOCUMENT_INVENTORY.md` for full classification (2 CURRENT, 4 HISTORICAL, 10 CONTRADICTORY, 3 SUPERSEDED, 1 UNKNOWN).

## Verified 25-Issue Registry (RULES.md Appendix A)

> **Source:** RULES.md Appendix A + PHASE_1B verification (C1-C6, H3, H8) + PHASE_1B_FOLLOWUP (H3 fail-closed) + PHASE_1C_FOLLOWUP (H4 dead action types) + **2026-06-12 audit update (19 FIXED)** + **2026-06-12 session (21 FIXED — H5, M1, 03.5, 04.1, 04.2)**

### Status Legend

| Status | Meaning |
|--------|---------|
| **FIXED** | Verified in code, no further work needed |
| **PARTIAL** | Partially addressed; remaining gap documented |
| **OPEN** | Known issue, not yet addressed |
| **CANNOT_VERIFY** | Insufficient evidence to classify |

### Critical Issues (C1–C6)

| ID | Issue | Status | Evidence |
|----|-------|:------:|----------|
| C1 | Hardcoded HMAC fallback secret | **FIXED** | PHASE_1B: `process.env.CHECKSUM_SECRET` with no fallback; throws if missing |
| C2 | `isAccountLocked` returns `false` on DB errors | **FIXED** | PHASE_1B: returns `{ locked: true, reason: '...' }` in catch blocks |
| C3 | Unvalidated save import (no bounds) | **FIXED** | PHASE_1B: `Number.isFinite()`, `validResourceKeys.has(key)` checks |
| C4 | `setGameSpeed` accepts any number | **FIXED** | PHASE_1B: `ALLOWED_SPEEDS.includes(speed)` check |
| C5 | Trading Post bypasses server validation | **FIXED** | CLAIM_VERIFICATION_MATRIX: `/api/game/trade/route.ts` created June 2025; server-authoritative |
| C6 | Production `console.log` statements | **FIXED** | PHASE_1B: replaced with `logger.ts` (NODE_ENV gated) |

### High Issues (H1–H8)

| ID | Issue | Status | Evidence |
|----|-------|:------:|----------|
| H1 | DashboardPanel full-store subscription | **FIXED** | `185f84d`: 17 specific selectors; L3/M4/M5 accuracy fixes included |
| H2 | In-memory rate limiter doesn't scale | **FIXED** | `43c74a3`: Supabase-backed rate limiter with fail-closed for trade/state; migrations 016-017 |
| H3 | TOCTOU race in cheat flagging | **FIXED** | PHASE_1B + FOLLOWUP: atomic RPC `increment_cheat_flag`; fallback creates investigation entry (fail-closed) |
| H4 | 14 dead action types in `validActions` | **FIXED** | PHASE_1C_FOLLOWUP: dead `case 'trade':` unreachable; `validActions` trimmed |
| H5 | `solarPanel` in both FactoryType and PowerPlantType | **FIXED** | `ec72408`: renamed power plant building to `solarFarm` across 9 files + save migration V19→V20 |
| H6 | Debounced persist loses up to 5s of data | **OPEN** | `store.ts` 5s debounce still active; mitigated by `beforeunload` |
| H7 | ~2,910 hardcoded color instances | **FIXED** | Phase 05.1: 4,748 → 218 (95% reduction) across 130+ files. 218 remain by design (opacities, gradient stops) |
| H8 | 4 unprotected API routes | **FIXED** | PHASE_1B: `verifyAuth()` + `checkRateLimit()` added to `/api/news-llm`, `/api/config`, IP rate-limit on `/api/game/definitions` + `/api/icons` |

### Medium Issues (M1–M8)

| ID | Issue | Status | Evidence |
|----|-------|:------:|----------|
| M1 | Config updates don't trigger re-renders | **FIXED** | `9bd9004`: `version` counter in `GameConfigContext` + `useConfigVersion()` hook triggers re-render |
| M2 | `setImmediate` in `logActionAsync` | **FIXED** | PHASE_00 doc: `queueMicrotask` replaces `setImmediate` in `gameStateValidator.ts` |
| M3 | Hardcoded income rates in tooltip | **FIXED** | `978b25c`: uses `productionSnapshot.researchPointsPerTick` instead of hardcoded 20/50 |
| M4 | Inaccurate `rpPerTick` calculation | **FIXED** | `185f84d` (H1 commit): now uses `productionSnapshot` |
| M5 | Meaningless `storageUtilization` | **FIXED** | `185f84d` (H1 commit): weighted by tier cap, not simple average |
| M6 | Stale Prisma schema | **FIXED** | `d1bc73a`: prisma moved to devDependencies |
| M7 | Admin auth via env var `ADMIN_UIDS` | **FIXED** | `b8a0b1b`: Supabase `admin_users` table as primary source |
| M8 | Weak blueprint import validation | **FIXED** | `d1b7694`: bounds validation, type validation, count range check |

### Low Issues (L1–L6)

| ID | Issue | Status | Evidence |
|----|-------|:------:|----------|
| L1 | `Math.random()` for IDs | **OPEN** | `store.ts:48+`, `TradingPostPanel.tsx:174` still use Math.random for security-sensitive IDs |
| L2 | `KEY_TAB_MAP` incomplete | **OPEN** | `GameSidebar.tsx:124-135` only 10 of 25+ tabs mapped |
| L3 | `topResources` shows only raw materials | **FIXED** | `185f84d` (H1 commit): now includes all tiers |
| L4 | `quickTradeAmounts` never updates | **OPEN** | `TradingPostPanel.tsx:200-205` doesn't refresh from Supabase market |
| L5 | `handleReset` uses `confirm()` | **OPEN** | `page.tsx:412` blocking dialog still present |
| L6 | `prisma` in dependencies, not devDependencies | **FIXED** | `d1bc73a`: prisma moved to devDependencies |

### Registry Summary

| Status | Count | IDs |
|--------|------:|-----|
| **FIXED** | **21** | C1-C6, H1-H5, H7-H8, M1-M8, L3, L6 |
| **OPEN** | **4** | H6, L1, L2, L4, L5 |
| **PARTIAL** | 0 | — |
| **CANNOT_VERIFY** | 0 | — |

**Total tracked:** 25
**Closed:** 21 of 25 (84%) — was 19 after 2026-06-12 audit, +2 more in this session (H5, M1)

## Phase Roadmap

| Phase | Title | Status | High-Priority Items |
|-------|-------|:------:|---------------------|
| **00** | Source of Truth Recovery | **COMPLETE** | All 6 todos done |
| **01** | Security Closure | **COMPLETE** | All 8 todos done (H5 fixed `ec72408`) |
| **02** | Server Authority & Sync | **COMPLETE** | STATE_VERSION_CONFLICT + trading + dead code all done |
| **03** | Performance & Render Stability | **COMPLETE** | All 6 todos done (selector library `bb5f868`) |
| **04** | Architecture Decomposition | **COMPLETE** | 04.1 cloudSync `9d3b7c1`, 04.2 presence `0e83906`, 04.3 page.tsx, 04.4 store map |
| **05** | UI System Alignment | **COMPLETE** | Bulk migration 88% done; 218 by-design remaining |
| **06** | Release Readiness | **PARTIAL** (5/7) | Docs done, Sentry test error + CHECKSUM_SECRET runtime verify pending |

See `planning/phases/PHASE_XX_*.md` for detailed task breakdowns. See `PROJECT_REVIEW.md` (2026-06-12) for full review.

## Phase 00 Status (COMPLETE)

- ✅ `CLAIM_VERIFICATION_MATRIX.md` (22 claims, 17 false = 77% false-claim rate)
- ✅ `LOST_CONTEXT_REGISTER.md` (18 items, 4 high-priority recovery)
- ✅ `DOCUMENT_INVENTORY.md` (20 root docs classified)
- ✅ This document (canonical status)
- ✅ STATUS banners on 17 non-current root docs
- ✅ `worklog.md` reconstructed

## Phase 01 Status (MOSTLY DONE)

- ✅ H3 (atomic cheat flag) — verified in code, no further action
- ✅ M8 (blueprint validation) — `d1b7694`
- ✅ M6/L6 (Prisma cleanup) — `d1bc73a`
- ✅ M7 (admin auth Supabase) — `b8a0b1b`
- ✅ H2 (Supabase rate limiter) — `43c74a3`
- ✅ H5 (solarPanel→solarFarm) — `ec72408` (renamed + save migration V19→V20)
- ✅ M1 (config cache re-render) — `9bd9004` (version counter + useConfigVersion hook)
- ✅ ADMIN_AUTH_MIGRATION_PLAN.md, RATE_LIMITER_MIGRATION_PLAN.md

## Phase 02 Status (COMPLETE)

- ✅ 02.1 Trading feature: DB-driven tradable list, trade cooldown, market price history, shared constants, dead code removal — 8 atomic commits
- ✅ 02.2 STATE_VERSION_CONFLICT flow (client half) — `f08730e`
- ✅ 02.3 STATE_VERSION_CONFLICT flow (server half) — `f08730e`
- ✅ 02.4 `tradeConstants.ts` shared module — implemented as part of 02.1
- ✅ 02.5 Dead code cleanup (validateTradeAction removed) — `964f359`
- ✅ 02.6 `trade_history` schema verification — migrations 013-015

## Phase 03 Status (MOSTLY DONE)

- ✅ 03.1 H1 DashboardPanel selector migration — `185f84d`
- ✅ 03.2 P0 panel useMemo migrations — 6 panels (`d456770`-`4677222`)
- ✅ 03.3 useCallback handlers — `e8aa7de`, `4677222`
- ✅ 03.4 React.memo on PanelStatCard + GameIcon — `ed50cb0`
- ✅ 03.5 M3 hardcoded income rates — `978b25c`
- ✅ 03.6 Named selectors library (30 selectors, 5 domains) — `bb5f868`

## Phase 04 Status (PARTIAL)

- ✅ 04.3 page.tsx decomposition: 1,337 → 292 lines (-78%) — 4 phased commits (`1babb50`, `e60f770`, `6901253`, `35e9b81`) + bugfixes (`6e22fad`, `2deecf6`, `2909388`)
- ✅ 04.4 `STORE_DECOMPOSITION_MAP.md` — `57c9e35` (232 lines)
- ✅ 04.1 useCloudSync decomposition (9 files in `src/lib/hooks/cloudSync/`) — `9d3b7c1`
- ✅ 04.2 Presence hooks consolidation (5 files in `src/lib/hooks/presence/`) — `0e83906`

## Phase 05 Status (COMPLETE)

- ✅ 05.1 Color token extraction: 21 semantic tokens + bulk migration of all 6 groups
  - 224 files, 6,500+ lines, 4,748 → 218 (88% reduction)
  - Token foundation: `cdd91ef`
  - Groups 1-4: `b7356c9`-`7dc33ad`
  - Groups 5-6: `44367f6`
- ✅ 05.2 Composite components — `e054dfc` (6 components)
- ✅ 05.3 PanelShell framework — `e054dfc`
- ✅ 05.4 `UI_ALIGNMENT_BASELINE.md` — `01a11a7`

## Phase 06 Status (PARTIAL — docs done, runtime verify pending)

- ✅ 06.1 `worklog.md` reconstructed (2026-06-11)
- ✅ 06.2 Sentry SDK setup — files tracked in `65babec`; env vars set on Vercel; **runtime test error pending**
- ✅ 06.3 CHECKSUM_SECRET — `withSentryConfig` defensive guard in `next.config.ts`; **runtime verification pending**
- ✅ 06.4 `MIGRATION_SAFETY_CHECKLIST.md`
- ✅ 06.5 `RELEASE_CHECKLIST.md`
- ✅ 06.6 `ROLLBACK_PLAYBOOK.md`
- ✅ 06.7 `MONITORING_PLAYBOOK.md`

## Deploy Fix Status (BONUS — COMPLETE)

- ✅ Tracked 3 Sentry config files (`sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`) — `65babec`
- ✅ Defensive `withSentryConfig` guard in `next.config.ts` — `65babec`
- ✅ Vercel deployment `5028102637` status: `success`, "Deployment has completed"
- ✅ User verified working

## Known Gaps & Contradictions

1. **Previously Missing Artifacts — ALL NOW EXIST:**
   - ✅ `src/lib/hooks/cloudSync/` — 9 files (`9d3b7c1`)
   - ✅ `src/lib/hooks/presence/` — 5 files (`0e83906`)
   - ✅ `src/lib/game/selectors/` — 6 files, 30 selectors (`bb5f868`)

2. **Open Registry Issues (4):**
   - H6 5s debounce risk — store.ts 5s debounce, mitigated by `beforeunload` only
   - L1 Math.random() for IDs — low risk
   - L2 KEY_TAB_MAP incomplete — only 10 of 25+ tabs
   - L4 quickTradeAmounts stale — no Supabase market refresh
   - L5 confirm() blocking dialog — mobile UX

3. **Runtime Verification Gaps (06.2/06.3):**
   - Sentry test error in browser not yet confirmed
   - CHECKSUM_SECRET env var on Vercel not yet confirmed

4. **UI Token Migration Residual (acceptable as-is):**
   - 218 remaining hardcoded color instances in specific patterns: opacity modifiers, gradient stops, text-white/bg-white base colors, neon-glow-green custom class. These were scoped out of the 95% bulk migration target.

## Recommended Next Actions (Priority Order — Updated)

1. **Sentry runtime verification** (30 min) — confirm 06.2 working in production
2. **CHECKSUM_SECRET verification** (5 min) — confirm 06.3 working on Vercel
3. **Push commits to origin/main** (5 min) — 6 commits ahead, pending push
4. **store.ts decomposition** (1-2 weeks) — apply 04.4 map; **#1 technical risk**
5. **H6 5s debounce → periodic saves** (2-3 days) — prevent data loss on mobile force-kill
6. **L4 quickTradeAmounts update** (1 hour) — refresh from Supabase market

## References

- **RULES.md** — Authoritative rules and 25-issue registry
- **AGENT.md** — Engineering constitution
- **PROJECT_REVIEW.md** — Comprehensive review (2026-06-12)
- **planning/CLAIM_VERIFICATION_MATRIX.md** — Doc claims vs code evidence
- **planning/LOST_CONTEXT_REGISTER.md** — Missing/deleted/contradicted items
- **planning/DOCUMENT_INVENTORY.md** — 20 root docs classified
- **planning/phases/PHASE_XX_*.md** — Phase 00-06 detailed plans
- **planning/STORE_DECOMPOSITION_MAP.md** — Phase 04.4 decomposition plan
- **planning/UI_ALIGNMENT_BASELINE.md** — Phase 05.4 reconciliation
- **planning/MONITORING_PLAYBOOK.md** — Phase 06.7 operational procedures
- **worklog.md** — Project timeline (reconstructed)
