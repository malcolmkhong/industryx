# AGENT.md — IndustriaX AI Agent Operating Constitution

> **Last Updated:** 2026-06-17
> **Status:** Living document. Read this, `.rules`, `BUGS.md`, and `planning/PROJECT_STATUS_SOURCE_OF_TRUTH.md` before any work.
> **File rename note:** This project uses `.rules` (file, not directory) as the canonical RULES location — Zed-recognized. References to "RULES.md" mean `.rules`.

---

## Who You Are

You are an AI development agent working on **IndustriaX** ("Factory Dominion: Automated Empire"), a browser-based industrial tycoon idle game built with **Next.js 16, React 19, Zustand 5, Supabase (PostgreSQL + Auth + Realtime)**, and a **Cloudflare Worker** for AI news generation.

You are not a code generator. You are a **senior engineer** responsible for the integrity, security, and quality of this project.

---

## Canonical Documents (read in this order)

| # | Document | Purpose | When to read |
|---|---|---|---|
| 1 | `AGENT.md` (this file) | Operating philosophy, workflows, decision framework | Always |
| 2 | `.rules` | Hard rules (FORBIDDEN/ALLOWED), 25-issue registry, security checklist | Always |
| 3 | `BUGS.md` | Open / investigating / resolved bugs with evidence | Before any feature or bugfix |
| 4 | `planning/PROJECT_STATUS_SOURCE_OF_TRUTH.md` | Current project state, file metrics, verified issue statuses | When state is unclear |
| 5 | `planning/CLAIM_VERIFICATION_MATRIX.md` | Maps doc claims to code evidence | When claims contradict code |
| 6 | `planning/LOST_CONTEXT_REGISTER.md` | Missing / deleted / contradicted items | When something is "lost" |
| 7 | `planning/DOCUMENT_INVENTORY.md` | Classification of all planning/ docs | When assessing doc reliability |

**Bug documentation is mandatory.** Every discovered bug, defect, security concern, or unexpected behavior MUST be recorded in `BUGS.md` with the standard structure (see *Bug Documentation* section). Do not silently ignore issues. Do not delete resolved entries — move them to the Resolved section.

---

## Development Philosophy

### Architecture-First
Every feature starts with a design question. Understand how it interacts with:
- The Zustand game store (`src/lib/game/store.ts`, **3,637 lines**) and its decomposed selectors at `src/lib/game/selectors/`
- The Supabase database (project ref `wkkzqtseqwcyyyezroqq`, **17 migrations** under `supabase/migrations/`) and its RLS policies
- The server-side validation pipeline (`/api/game/action` + `src/lib/auth/gameStateValidator.ts`, 448 lines)
- The admin moderation system (**19 admin pages**, ~25 admin API routes under `/api/admin/`)
- The Cloudflare Worker `newsgenerator.malcolmkhong.workers.dev` for AI news
- The Caddy reverse proxy and the dev origins configured in `next.config.ts`

### Database-First
Every mutation must have a database table/column, be auditable, respect RLS, and survive a client crash. The Trading Post is the canonical lesson — it was rebuilt server-authoritatively at `/api/game/trade` (Phase 1C) and **must not regress to client-only**.

### Security-First
The project has had 25 audited issues (see `.rules` Appendix A). **As of the 2026-06-12 audit, 21 of 25 are FIXED** (per `PROJECT_STATUS_SOURCE_OF_TRUTH.md`). The 4 still OPEN are:
- **H6** — 5-second debounced persist loses data on mobile force-kills
- **L1** — `Math.random()` still used for IDs in `store.ts` and `TradingPostPanel.tsx`
- **L2** — `KEY_TAB_MAP` covers only 10 of 25+ tabs in `GameSidebar.tsx`
- **L4** — `quickTradeAmounts` in `TradingPostPanel.tsx` does not refresh from Supabase market
- **L5** — `handleReset` in `page.tsx` uses blocking `confirm()`

**Fail-closed principle:** Database or server errors MUST block access, not allow it. Enforced in `gameStateValidator.ts` for `isAccountLocked`, `generateChecksum`, and `verifyChecksum`. **20 components still call `useGameStore()` without a selector** (see BUG-009), which causes re-renders on every tick — same family of bug as the original H1, which was fixed for `DashboardPanel` only.

### Performance-First
Game loop runs 1–10 Hz on the client. Every re-render, API call, and DB query must be justified. `store.ts` is already 3,637 lines; do not add bloat without a decomposition plan.

### Production-First
Code that works on `localhost` is not done. It must work behind the Caddy reverse proxy, against the Supabase production instance, with real player data, under rate limiting, with proper error handling, and without hardcoded secrets.

---

## Decision-Making Framework

1. **Security** — Does this introduce or expose a vulnerability?
2. **Data Integrity** — Can player data be lost, corrupted, or forged?
3. **Architecture** — Does this fit the existing system or create technical debt?
4. **Performance** — Does this degrade the game loop or API responsiveness?
5. **User Experience** — Does this improve the player's experience?
6. **Code Quality** — Is this maintainable and testable?

Features failing #1 or #2 do not ship regardless of other qualities.

---

## Review Process Before Implementation

Before writing ANY code, you MUST:

1. **Read the relevant existing code** — Understand how the current system works
2. **Check `.rules` and `BUGS.md`** — Ensure your plan doesn't violate any rule or duplicate an open investigation
3. **Check `planning/PROJECT_STATUS_SOURCE_OF_TRUTH.md`** — Confirm your assumptions are current
4. **Identify database impact** — Does this need schema changes? (Migrations go in `supabase/migrations/`)
5. **Identify security impact** — Server-side validation? Auth checks? Rate limiting?
6. **Identify API impact** — New endpoint or modification to existing?
7. **Plan the implementation** — Write down the steps before executing

### Specifically, you must answer:
- Which Zustand store slices are affected? (`src/lib/game/store.ts` — 3,637 lines, 42 actions)
- Which API routes are affected? (50+ routes under `/api/`)
- Which database tables are affected? (Check the migration history in `supabase/migrations/`)
- Does this need a new Supabase migration?
- Does this need server-side validation in `/api/game/action`, `/api/game/trade`, or another route?
- Does this need admin audit logging? (`admin_actions` table)
- Does this need rate limiting? (`checkRateLimit()` in `src/lib/auth/rateLimiter.ts` — Supabase-backed)
- How does this behave when the player is offline?
- How does this behave when the server is unreachable?
- **What happens if the database is unreachable?** (Must fail closed, not open)

---

## Required Validation Process After Implementation

After writing ANY code, you MUST:

1. **Lint check** — Run `npm run lint` (the script in `package.json` is `eslint .`, **not** `bun run lint`)
2. **Dev server test** — Verify the page loads at `http://localhost:3000/`
3. **Console check** — No JavaScript errors in the browser console
4. **Feature test** — Verify the feature actually works in the browser
5. **Security check** — No auth bypass, no data leak, no unvalidated input
6. **Database check** — Verify the data is persisted correctly (if applicable)
7. **Admin check** — Verify admin actions are logged (if applicable)
8. **Performance check** — No unnecessary re-renders (React DevTools Profiler)
9. **Selector check** — Every `useGameStore` call MUST use a selector. Never `useGameStore()` (no args).

---

## Feature Development Workflow

```
1. Read AGENT.md, .rules, BUGS.md, PROJECT_STATUS_SOURCE_OF_TRUTH.md
2. Search BUGS.md for related issues; avoid duplicate investigations
3. Design the feature:
   a. Data model (which tables, which columns)
   b. API layer (which endpoints, what validation)
   c. State layer (which store slices, what actions, what selectors)
   d. UI layer (which panels, which components)
4. Create Supabase migration (if needed) — under supabase/migrations/
5. Implement server-side API with auth + validation + rate limiting
6. Implement store actions with proper persistence
7. Implement UI components with PROPER Zustand selectors
8. Add to navigation (GameSidebar + page.tsx + types.ts)
9. Add admin audit logging (if applicable)
10. Run full validation process
11. Update BUGS.md if any defects are discovered
```

**NEVER** skip step 5. Every game-affecting mutation MUST go through a server-side API with validation.
**NEVER** skip step 7. Always use `useGameStore(s => s.specificField)`.

---

## Bug Fixing Workflow

```
1. Reproduce the bug
2. Check BUGS.md — if not already documented, create a new entry with the standard structure
3. Identify root cause
4. Confirm the fix does not violate .rules
5. Implement the minimal fix
6. Verify the fix does not introduce new bugs
7. Check for similar bugs elsewhere
8. Run validation process
9. Update BUGS.md (status, evidence, fix commit SHA)
10. Move the entry to the Resolved section once verified
```

**A bug is not "fixed" until `BUGS.md` is updated.** The BUGS.md entry is the audit trail.

---

## Refactoring Workflow

```
1. Document what will change and why (in BUGS.md if it fixes a known issue, else in the commit message)
2. Ensure all existing tests pass (if any) — see Test Infrastructure Notes
3. Refactor incrementally — one file/section at a time
4. Run validation process after each incremental change
5. Verify no behavioral changes
6. If new bugs surface, add them to BUGS.md
```

---

## Deployment Workflow

```
1. Ensure all lint checks pass
2. Ensure dev server starts without errors
3. Verify all critical pages load (game / and admin /admin/)
4. Commit with descriptive message
5. Push to GitHub
6. Verify production deployment at https://industryx.vercel.app
```

**NEVER** push secrets to GitHub. **NEVER** push `.env` files.

---

## Forbidden Actions

These are absolutely forbidden without explicit user approval:

- Modifying `.env` or pushing secrets
- Dropping database tables or columns
- Removing RLS policies
- Bypassing auth checks on API routes
- Creating client-only game mutations without server validation (regression risk: Trading Post)
- Modifying the Caddyfile without security review
- Creating new admin endpoints without role checks (`verifyAdmin()` + `canWrite()`)
- Removing audit logging
- Using hardcoded secrets as fallbacks (e.g. `process.env.X || "default"`)
- Returning "success" on server errors or auth failures (must fail closed)
- Subscribing to the entire Zustand store: `useGameStore()` without a selector
- Using `setImmediate` in server-side code (use `queueMicrotask` instead)
- Using `Math.random()` for security-sensitive IDs (use `crypto.randomUUID()`)
- Using `prisma` for schema management (the schema is stale; use Supabase migrations in `supabase/migrations/`)
- Running `prisma db:push` or `prisma migrate`
- Silently ignoring discovered bugs (must update `BUGS.md`)
- Removing, renaming, or converting `.rules` to a directory (it is a Zed-recognized file at the project root)
- Adding documentation references to `worklog.md` (it does not exist in this project)

- Do not retry the same failed action more than 3 times. If the issue cannot be resolved after 3 attempts, stop and either fix the root cause or ask me for assistance before continuing.

---

## Architecture Quick Reference

### Directory layout (verified 2026-06-17)

```
src/
├── app/
│   ├── page.tsx                            # Main game page (~400 lines, post Phase 04.3)
│   ├── admin/                              # 19 admin pages
│   └── api/                                # 50+ API routes
│       ├── auth/                           # callback, confirm-link, initialize-guest, link-identity, me, migrate-guest, recover-by-device, update-profile
│       ├── game/                           # action, compute, definitions, heartbeat, market-history, offline, state, trade, trades
│       ├── admin/                          # actions, admin-actions, admins, audit, economy, investigations, jobs, market, permissions, players, stats, support, system-status
│       ├── market/                         # action, state
│       ├── leaderboard/                    # submit, list
│       ├── config/                         # [table], [table]/[id]
│       ├── cron/                           # validate-ticks
│       └── health/                         # liveness
├── components/
│   ├── game/                               # 43+ game panels
│   ├── admin/                              # 13 admin components
│   ├── providers/                          # AuthProvider, GameConfigProvider
│   └── ui/                                 # shadcn/ui — do not modify directly
├── lib/
│   ├── game/                               # store.ts (3,637 lines), serverEngine, types, config, etc.
│   ├── auth/                               # gameStateValidator, rateLimiter, admin, csrf
│   ├── hooks/
│   │   ├── cloudSync/                      # Decomposed (10 files: index, types, useBlockedState, useCloudLoad, useCloudPersistence, useCloudSave, useConflictResolution, useServerAuthority, serializeGameState, mapHttpErrorToBlock)
│   │   ├── page/                           # useTabChange, useGameTickLoop, useKeyboardShortcuts, etc. (14 files)
│   │   ├── presence/                       # BasePresenceManager, VisitorPresenceManager, AdminPresenceManager (3 files)
│   │   ├── useAdminPresence.ts
│   │   ├── useCloudSync.ts                 # Barrel re-export to ./cloudSync
│   │   ├── useLoginPrompt.ts               # Recently refactored to use a shared Zustand store (b87d93d)
│   │   ├── useMergeFlow.ts
│   │   ├── useOnlinePresence.ts
│   │   └── useServerMarket.ts
│   └── admin/                              # fetchWrapper, navTree
└── middleware.ts                           # Auth middleware

supabase/
└── migrations/                             # 17 SQL migrations (root is gitignored; this folder is whitelisted)

planning/                                   # Project history, audits, plans (see DOCUMENT_INVENTORY.md for classification)
tests/integration/                          # 3 test files, NO runner configured (see Test Infrastructure Notes)
.omo/                                       # Internal note system (gitignored, empty)
skills/                                     # (gitignored, empty)

.rules                                       # Canonical RULES file (Zed-recognized)
AGENT.md                                     # This file
BUGS.md                                      # Project bug memory
```

### External services

- **Supabase project:** `wkkzqtseqwcyyyezroqq` (auth, postgres, realtime, presence channel `industriax-online`)
- **Cloudflare Worker:** `newsgenerator.malcolmkhong.workers.dev` (AI news headlines)
- **Vercel:** Deployment target (CSP, headers, edge runtime)
- **Caddy:** Reverse proxy in production (do not modify the Caddyfile without security review)

### Key abstractions

- **`useGameStore`** — Single Zustand store, 3,637 lines, 42 actions. Always use selectors. Decomposed selectors live in `src/lib/game/selectors/`.
- **`gameStateValidator`** — Server-side anti-cheat. HMAC-signed checksums via `CHECKSUM_SECRET` env (no fallback — throws if missing). Fail-closed.
- **`useCloudSync`** — Decomposed into `src/lib/hooks/cloudSync/` (10 files). Uses `serverStateHash` for conflict detection.
- **`useLoginPrompt`** — Recently refactored to use a shared Zustand store (commit `b87d93d`) instead of per-component `useState`, so the gate in `useTabChange` and the panel in `page.tsx` share one source of truth.
- **Auth flow** — `AuthProvider` wraps `getSession()` and `signInAnonymously()` in try-catch; gated tabs (market, leaderboard, tradePost, megaprojects) trigger `LoginFloatingPanel` for guests.
- **Server-authoritative trading** — `/api/game/trade` validates + persists trades; client `TradingPostPanel` just calls it.
- **Rate limiting** — Supabase-backed (`src/lib/auth/rateLimiter.ts` + migrations 016–017). Replaces the in-memory limiter. Fails closed for `/api/game/trade` and `/api/game/state`.
- **Admin RBAC** — Three roles: `viewer` (read-only), `admin` (read+write), `super_admin` (admin management). `verifyAdmin()` + `canWrite()` required for mutations.

---

## Test Infrastructure Notes

- The project has `tests/integration/*.test.ts` (3 files) using Node's built-in `node:test` runner.
- **No test runner is configured in `package.json`.** The test files cannot be run with `npm test` or `bun test`. The `scripts.test` key does not exist.
- `jsdom` and `@testing-library/*` are in devDependencies (added 2026-06-17) but unused (no Vitest/Jest config).
- `tests/integration/supabase-connectivity.test.ts` contains a hardcoded production Supabase anon key (BUG-011).
- **Decision needed:** Either configure a test runner (recommended: Vitest, which natively supports `node:test`-style imports) or gitignore `tests/` and remove the test scaffolding.

---

## Bug Documentation

**Every bug, defect, security concern, or unexpected behavior MUST be recorded in `BUGS.md`.**

The entry must include:
- **Status** (`Investigating` | `Open` | `Confirmed` | `Hypothesis` | `Resolved`)
- **Severity** (`Critical` | `High` | `Medium` | `Low`)
- **Category** (e.g. `Auth`, `Performance`, `Security`, `UI`, `API`, `State`, `Infra`)
- **Date discovered** and **Discovered by** (`AI Agent` | `User` | `Test` | `Production`)
- **Location** — files, components, and the flow affected
- **Problem found**, **Expected behavior**, **Actual behavior**
- **Root cause / Reason** — distinguish Confirmed vs Suspected vs Hypothesis
- **Investigation performed** and **Evidence** (logs, related commits)
- **Troubleshooting / Next steps**
- **Resolution** (when fixed, including commit SHA)

Agent requirements:
1. **Read `BUGS.md` before starting any work.**
2. **Check for related issues** — avoid duplicate investigations.
3. **Update status** when progress is made.
4. **Link fixes** back to the BUG ID in commit messages and PRs.
5. **Move resolved entries** to the Resolved section (do not delete).
6. **If you discover a new bug during work, add it immediately** — do not silently fix it without documentation.

`BUGS.md` is the project's bug memory and investigation history. Future agents should be able to continue work without re-discovering the same issue.

---

**Summary of authority:**
- `.rules` is the source of truth for what is **FORBIDDEN** and what was audited.
- `BUGS.md` is the source of truth for what is **BROKEN** or under investigation.
- `planning/PROJECT_STATUS_SOURCE_OF_TRUTH.md` is the source of truth for what **EXISTS** in the codebase today.
- This file (`AGENT.md`) is the source of truth for **HOW TO WORK** in this project.
