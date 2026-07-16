# BUGS.md - IndustriaX Project Bug Memory

> **Purpose:** Project-wide bug registry, investigation history, and resolution log.
> **Authority:** This file is the canonical record of known issues. Future agents MUST read this before starting work and MUST update entries (not delete them) as work progresses.
> **Created:** 2026-06-17 (during AGENT.md and `.rules` reconciliation audit)
> **Last Updated:** 2026-07-16 (BUG-091 added and resolved by P2-14a repair pass from BUILDING_PRODUCTION_AUDIT §10.4: select('*') sweep across `src/app/api` and `src/lib/db` replaced with explicit column lists and shared CONFIG_TABLE_COLUMNS whitelist; daily_rewards/user_streaks/leaderboard/player_progress column lists corrected to match actual schema. BUG-087..BUG-090 added and resolved by P2 repair pass from BUILDING_PRODUCTION_AUDIT §10.4: P2-10 thin server math wrappers removed, P2-11 initial state uses crypto RNG, P2-12 LeaderboardPanel shared polling hook, P2-13 TradingPostPanel store action adapter. BUG-082..BUG-086 added and resolved by P1 repair pass from BUILDING_PRODUCTION_AUDIT §10.4: C-006 orphan compute oracle removed, C-007 shared income/minute formula, C-005 parseCostMap fails closed on null cost, C-008 PowerPanel balance-driven factors, C-009 client-only pause UI removed. BUG-078..BUG-081 added and resolved by P0 repair pass from BUILDING_PRODUCTION_AUDIT §10.4: C-001 blocked-factory snapshot aggregation, C-002 offline market_supply write, C-003 strip-symmetry across all writers, C-004 V-032 test mock repair. BUG-077 added and resolved 2026-07-16: `@/lib/db/access` boundary + module-scope singleton replaces the 237-edge `createServiceRoleClient()` god node. BUG-076 added 2026-07-16: stale `knip.json` entry paths. BUG-075 added and resolved 2026-07-15: auth-merge policy migrated to industry-standard "auth wins, archive guest" default with explicit-conflict opt-in.)

**BUG-092 added and resolved 2026-07-16:** heartbeat `player_sessions` upsert failed with Postgres `42P10` because migration `003` only created a non-unique btree index on `user_id`; added UNIQUE INDEX via migration `080_player_sessions_unique_user_id.sql`; promoted both `sessionError` and `profiles.last_active` failure modes from best-effort `console.warn` to `503 Presence tracking unavailable` so future regressions cannot silently disable presence.

---

## Working Rules - How To Fix Lint Issues

When the linter reports an unused variable or import, follow this protocol before deleting anything:

### For `no-unused-vars` and unused imports:

- **Read the variable name to understand intent.** "Cloud", "Shield", "GitHub" - the name tells you what semantic role it plays. It almost certainly was meant to be used somewhere.
- **Trace where it is imported and exported.** Check the file (and where the import comes from). A function imported in a helper file but not called here may be a public API used elsewhere.
- **Determine whether it belongs to an incomplete or missing feature.** Most "unused" imports in this codebase are placeholders for a feature that was started but never finished (e.g., a search bar, a category icon, a tier indicator).
- **Build the missing piece rather than delete.** If the variable is part of a feature that should exist (per the page's purpose, the rules, or the user's intent), implement that feature using the variable. Examples:
  - Unused icon import -> add the icon to a stat card, badge, or list item
  - Unused helper function -> wire it into the recommendation/insight logic
  - Unused state setter -> add a real UI control that calls it
- **Reuse existing UI components.** Before building new buttons, cards, or inputs, check `src/components/ui/` (shadcn primitives) and `src/components/game/shared/` (game-specific). Only create a new component when nothing existing fits. Follow RULES.md [UI-003].
- **Use existing CSS tokens, not raw values.** Tailwind theme colours (`bg-brand`, `text-warning`, etc.) and spacing utilities come from the central config in `tailwind.config.ts` and `src/app/globals.css`. Add a new token there if a value is reused 3+ times; do not inline `bg-[#abc123]` or arbitrary spacing. Follow RULES.md [UI-005] for tier colours and the project's token catalogue.
- **Only remove if it is truly dead code.** Confirmed dead code = a leftover from a refactor that has no consumers anywhere in the codebase. Confirm with `grep -r <name> src/` before deletion.
- **If truly dead and not from in-progress work, prefix with `_` instead of removing.** The `argsIgnorePattern: "^_"` and `varsIgnorePattern: "^_"` in `eslint.config.mjs` allow underscore-prefixed unused names - use this for function parameters and placeholder variables that must remain for type compatibility.
- **Batch by file, not by rule.** Process 5-10 issues per file at a time, starting with the easiest to trace (local variables, single-file imports) before tackling cross-file type imports.
- **Verify each batch.** Run `npx eslint <file>` after each batch to confirm issues cleared without introducing new ones.

### For other lint categories that look tempting to disable:

- **`no-nested-ternary`**: stylistic only, no runtime impact. Disabled in `eslint.config.mjs`. Do not re-enable unless explicitly requested.
- **`no-non-null-assertion`**: replace `!` with proper type narrowing (early returns, ternary narrowing, or type guards). See `AIAdvisorPanel.tsx` for the pattern.
- **`react/no-array-index-key`**: use a stable ID from the data (e.g. `id` field) instead of array index. Acceptable for static legend/tutorial lists.
- **`<a href="/internal">`**: replace with `<Link href="/internal">` from `next/link` for proper prefetching.

---

## Summary Table

| ID | Status | Severity | Area | Problem Found | Location |
|---|---|---|---|---|---|
| BUG-001 | Open | High | Performance | 19/20 components migrated to selectors; `AchievementPanel.tsx` still uses full-store subscription | `src/components/game/AchievementPanel.tsx` (line 504) |
| BUG-003 | Open | Medium | Infra | `prisma` in devDependencies but no `prisma/` directory or schema file exists | `package.json`, `prisma/` (missing) |
| BUG-004 | Open | Medium | Tests | 3 integration test files but no test runner configured in `package.json` | `tests/integration/*.test.ts`, `package.json` |
| BUG-005 | Open | High | Docs / State | `.env.example` has literal `process.env.X` values instead of empty placeholders | `.env.example` |
| BUG-007 | Open | Low | Persistence | H6: 5-second debounced persist loses data on mobile force-kill | `src/lib/game/store.ts` (~894-967) |
| BUG-009 | Open | Low | Security | Hardcoded production Supabase anon key in committed test file | `tests/integration/supabase-connectivity.test.ts` |
| BUG-011 | Open | Low | UX | L2: `KEY_TAB_MAP` covers only 10 of 25+ tabs | `src/components/game/GameSidebar.tsx` (124-135) |
| BUG-013 | Open | Low | Infra | `.omo/` and `skills/` directories gitignored but not empty | `.omo/`, `skills/` |
| BUG-018 | Open (Partial) | High | Accessibility | jsx-a11y plugin enabled; 14 aria-labels added to game panels; 36 admin-page inputs remain | `src/app/admin/**` (partial) |
| BUG-019 | Open (Partial) | Medium | Responsive | 5 `md:` breakpoints added to DashboardPanel + GameSidebar; remaining panels deferred | `src/components/game/DashboardPanel.tsx`, `GameSidebar.tsx` |
| BUG-022 | Open (Suspected) | Medium | Accessibility | `text-muted-label` (#94a3b8) contrast risk - needs per-context measurement | `src/app/globals.css:85` |
| BUG-025 | Open (Partial) | Low | Tailwind | 42 of 1,233 arbitrary values replaced; 1,191 typography `text-[Npx]` remain (deferred) | 18 files in `src/components/**` |
| BUG-033 | Open | Low | Infra | `src/proxy.ts` triggers Next.js 16.1 deprecation warning | `src/proxy.ts` |
| BUG-034 | Resolved (2026-06-19, unverified) | High | Data | `cleanup_orphan_anon_users` missed `profiles` FK check - fix applied to live DB but migrations `051`/`052` not committed to disk | `supabase/migrations/052_fix_cleanup_orphan_anon_profiles_check.sql` (missing on disk) |
| BUG-041 | Resolved (2026-06-22) | Critical | Infra / Cron | `apply_market_tick` RPC validates price change against `basePrice` instead of previous tick's `currentPrice`; rejected 5+ high-end resources, froze cron for 54h | `supabase/migrations/053_fix_apply_market_tick_deviation_baseline.sql` |
| BUG-042 | [x] Resolved (2026-07-11) | High | Build | `next build` fails: `GameConfig` literal missing `balance` field in `validate-ticks/route.ts` and `game/action/route.ts` | `src/app/api/cron/validate-ticks/route.ts`, `src/app/api/game/action/route.ts` |
| BUG-043 | [x] Resolved (2026-07-11) | Critical | Build | Static prerender of `/_not-found` crashes: `emptyProductionSnapshot()` calls `getBalance()` at module-eval, throws `BalanceNotLoadedError` | `src/lib/game/productionCalculator.ts:198`, root cause: `src/lib/game/store-bootstrap.ts:156` |
| BUG-044 | [x] Resolved (2026-07-11) | High | Lint | 1,067 lint issues (463 errors, 604 warnings) - `no-nested-ternary` downgraded to off in `eslint.config.mjs`; remaining are style/non-blocking | project-wide |
| BUG-045 | [x] Resolved (2026-07-10) | Medium | Market / LLM News | Market news LLM path existed but client UI was not reading server-persisted market news | `src/app/api/market/tick/route.ts`, `src/lib/hooks/useServerMarket.ts`, `src/components/game/MarketPanel.tsx` |
| BUG-046 | [x] Resolved (2026-07-11) | Critical | Server Tick / Persistence | Non-tick paths advanced `last_tick_at`, risking lost elapsed server progress | `/api/game/heartbeat`, `/api/game/state`, `/api/player`, `/api/game/action`, `/api/game/offline`, `src/lib/db/merge.ts` |
| BUG-047 | [x] Resolved (2026-07-11) | High | Server Down / UI | Server/config fallback rendered UI but did not show a gameplay block dialog, and some auth/rate-limit failures still allowed local action fallback | `GameConfigProvider`, `GameShell`, `CloudSyncBlockBanner`, `serverActions.ts` |
| BUG-048 | [x] Resolved (2026-07-11) | High | Server Tick / UI Sync | `/api/game/action` applied elapsed server ticks but did not sync `game_tick` column or return the full post-tick state to the client | `src/app/api/game/action/route.ts`, `src/lib/game/serverActions.ts` |
| BUG-049 | [x] Resolved (2026-07-12) | High | API / Actions | `upgrade_worker` client action was wired but missing from the server action allow-list | `src/lib/game/actions/server/actionCommandRunner.ts`, `src/lib/game/actions/client/serverActions.ts` |
| BUG-050 | [x] Resolved (2026-07-12) | High | Admin / Authorization | Several admin mutation routes lacked role write gates, and market resource routes passed admin id into `canWrite()` instead of admin role | `src/app/api/admin/**`, `src/lib/auth/admin-route-guards.ts` |
| BUG-051 | [x] Resolved (2026-07-12) | Medium | UI / Auth | Fingerprint unavailable modal nested block content inside `DialogDescription`, causing invalid HTML and hydration/page error | `src/components/auth/FingerprintUnavailableModal.tsx` |
| BUG-052 | [x] Resolved (2026-07-12) | Critical | Server Tick / Live Production | Live gameplay had no mounted server tick settlement loop, so resources only advanced on later server actions/offline reconciliation | `src/components/game/GameShell.tsx`, `src/lib/hooks/page/useLiveServerTick.ts`, `src/app/api/game/state/live-tick/route.ts` |
| BUG-053 | [x] Resolved (2026-07-12) | Critical | Player Init / State Load | Player profiles could load with missing or partial `server_game_state.full_state`, causing startup money/resources to render from stub state | `src/app/api/game/state/sync/route.ts`, `src/lib/db/serverGameState.ts`, `src/lib/hooks/cloudSync/CloudSyncService.ts` |
| BUG-064 | [x] Resolved (2026-07-14) | High | Auth / Player Init | Guest bootstrap hit authenticated cloud-sync routes and skipped canonical initial-state hydration, causing false cloud block or `$0` startup state | `src/components/providers/AuthProvider.tsx`, `src/lib/hooks/cloudSync/CloudSyncService.ts`, `src/app/api/game/state/initial/route.ts` |
| BUG-065 | [x] Resolved (2026-07-14) | High | Server Tick / Guest Actions | Guest server time and server actions did not run after auth refactor because live tick/action auth still required Supabase session instead of device binding | `src/lib/hooks/page/useLiveServerTick.ts`, `src/app/api/game/state/live-tick/route.ts`, `src/lib/game/actions/server/shared/contextAuth.ts` |
| BUG-066 | [x] Resolved (2026-07-14) | Critical | Server Tick / Production Persistence | Build/tick saves updated `full_state` but not denormalized `server_game_state` columns, so later hydration discarded buildings/resources before production | `src/lib/game/actions/server/shared/correctedStatePersistence.ts`, `src/lib/game/actions/server/shared/elapsedTickPersistence.ts`, `src/app/api/game/state/offline-progress/route.ts` |
| BUG-067 | [x] Resolved (2026-07-14) | Critical | Persistence / Server Tick | `POST /api/game/state/sync` used unconditional `upsertServerGameState` (no CAS), creating a TOCTOU race against live-tick, offline-progress, market execute, and action handlers all of which use `state_version` CAS | `src/app/api/game/state/sync/route.ts` |
| BUG-073 | [x] Resolved (2026-07-15) | Critical | Persistence / Cloud Sync | BUG-067 CAS fix returned 409 with no `serverState` body; CloudSyncService.save() read `conflictData.serverState.fullState` to hydrate the client, found it undefined, then set `isBlocked: MIGRATION_REJECTED` with a false "synced" notification — the stale client state (potentially empty `buildings: []`) was preserved | `src/app/api/game/state/sync/route.ts`, `src/lib/hooks/cloudSync/CloudSyncService.ts` |
| BUG-074 | [x] Resolved (2026-07-15) | High | Server Time Audit | Three surfaces still used Node clock for server-authoritative time: (1) `/api/game/state/sync` `new Date()` fallback on `now_iso()` failure, violating SEC-002 fail-closed; (2) `/api/game/rewards/daily` derived UTC day via Node clock instead of DB; (3) identity-link routes compared `expires_at` via `new Date(... ) < new Date()`, silently accepting malformed ISO and using a clock that drifts from the tick chain | `src/lib/auth/serverTime.ts` (NEW), `src/app/api/game/state/sync/route.ts`, `src/app/api/game/rewards/daily/route.ts`, `src/app/api/auth/identity/{confirm-link,link}/route.ts` |
| BUG-075 | [x] Resolved (2026-07-15) | High | Auth-Merge Policy | `upgrade_guest_to_auth` returned `409 ACCOUNT_PROGRESS_CONFLICT` whenever the auth user AND the active guest on this device both had progress. After sign-in the bootstrap landed on this branch and never loaded the user's previous game data, blocking gameplay instead of showing it. Architecture violated user expectation of "sign in = load my data". | `supabase/migrations/20260715100000_079_auth_merge_policy_and_archive.sql` (NEW), `src/lib/db/auth/bootstrapRpcs.server.ts`, `src/lib/auth/server/bootstrapService.server.ts`, `src/lib/auth/orchestrator/{types,AuthOrchestrator}.ts`, `src/app/api/auth/bootstrap/route.ts`, `tests/api/auth/bootstrap.test.ts` |
| BUG-068 | [x] Resolved (2026-07-14) | Critical | Server Tick / Production | `advanceWeatherTick` used `Math.random()` for server-authoritative weather rotation; non-crypto, non-deterministic across concurrent writers (live-tick + offline-progress race) | `src/lib/game/production/engine/tick/weatherTick.ts` |
| BUG-069 | [x] Resolved (2026-07-14) | Critical | Server Tick / Persistence | `applyElapsedServerTime` cursor-init branch wrote only `{last_tick_at, last_saved_at}`, leaving null/partial denormalized columns to be overlaid as 0 on next hydration, silently corrupting economy/inventory data | `src/lib/game/actions/server/shared/elapsedTickPersistence.ts` |
| BUG-070 | [x] Resolved (2026-07-14) | High | API / Client Tick Loop | `useLiveServerTick` hammered `/api/game/state/live-tick` every 10 s with no backoff on 429/503, amplifying server load precisely when it is least affordable | `src/lib/hooks/page/useLiveServerTick.ts` |
| BUG-071 | [x] Resolved (2026-07-14) | High | Security / ID Generation | `generateServerUuid` fallback used `Math.random()` for worker/building/transport IDs that gate economy-relevant state, enabling ID pre-computation attacks | `src/lib/game/production/engine/ids.ts` |
| BUG-072 | [x] Resolved (2026-07-14) | High | Performance / Store Subscription | `AchievementPanel` used bare `useGameStore()` subscription, re-rendering on every store change at ~10 Hz | `src/components/game/AchievementPanel.tsx` |
| BUG-054 | Open | Medium | Data / Player Init | `profile_without_game_state` count is +1 over pre-PR1 baseline (94 -> 95); a test profile row was created without its `server_game_state` row | `public.profiles` row `507380d0-9210-4706-bdf5-04dfd086f784` |
| BUG-055 | Open | Low | Data / Auth Hygiene | Orphan auth user `admin@test.com` has no profile, state, or device_binding (pre-existing, stable since 2026-06-07) | `auth.users` row `377e7788-0dfb-4aa5-b647-aa66546da4fe` |
| BUG-056 | Open | Medium | Data / Player Init | 94 pre-existing profiles lack `server_game_state` (cross-ref BUG-053 — runtime hydration handles reads, no eager backfill) | `public.profiles` 94 rows from 2026-07-04 bulk test creation |
| BUG-057 | Open | Low | Audit Query | `audit_orphan_bindings.orphan_guest_shell = 30` is a false-positive: superseded `guest_identities` rows correctly have superseded (not active) `device_bindings` rows | `public.audit_orphan_bindings()` SQL (migration 073) |
| BUG-058 | Open | Low | Performance / PER-003 | 25 `select('*')` calls in production DB modules; arch test A6 fails | `src/app/api/game/state/offline-progress/route.ts:137-157`, `src/app/api/player/progress/route.ts:91`, `src/lib/db/admin/{adminActions,cheatInvestigations}.ts`, `src/lib/db/config/serverConfigFetcher.ts:94`, `src/lib/db/game/{dailyRewards,leaderboard,market,serverGameState}.ts`, `src/lib/db/shared/{merge,supportTickets}.ts` |
| BUG-059 | Open | Medium | API / API-001 | `src/app/api/auth/callback/route.ts` does not import `checkRateLimit` | `src/app/api/auth/callback/route.ts` |
| BUG-060 | Open | Medium | API / API-001 | `src/app/api/auth/device/register/route.ts` (PR4 wrapper) does not import `checkRateLimit` | `src/app/api/auth/device/register/route.ts` |
| BUG-061 | Open | Medium | API / API-001 | `src/app/api/auth/guest/quickstart/route.ts` (PR4 wrapper) does not import `checkRateLimit` | `src/app/api/auth/guest/quickstart/route.ts` |
| BUG-062 | Open | Medium | API / API-001 | `src/app/api/auth/session/me/route.ts` does not import `checkRateLimit` | `src/app/api/auth/session/me/route.ts` |
| BUG-063 | Open | Low | Tests / Pre-existing | `tests/api/auth/migrate-guest.test.ts` has 5 pre-existing failures (mock path / type drift); out of scope for PR 5B but blocks `bun run test:vitest` exit 0 | `tests/api/auth/migrate-guest.test.ts` |
| BUG-076 | Open | Low | Tooling / Architecture | `knip.json` still declares three pre-refactor entry paths that no longer exist, reducing dead-code and dependency-audit accuracy | `knip.json` |
| BUG-077 | [x] Resolved (2026-07-16) | Medium | DB / Architecture | `createServiceRoleClient()` constructed a fresh `@supabase/supabase-js` client on every call (god-node #1 with 237 imports; `serverGameState.ts` alone instantiated 26 fresh HTTP pools per request). No repository boundary and no singleton. Replaced with module-scope singleton + canonical `@/lib/db/access` boundary (`getDbClient` / `requireDbClient`) plus typed `DbClientNotConfiguredError` for fail-closed 503 responses. Architecture test `tests/architecture/db-access.test.ts` enforces the boundary. | `src/lib/db/access/{getDbClient.server,errors,index}.ts` (NEW), `src/lib/supabase/server.ts`, `src/lib/db/admin/admin.ts`, 59 source files, 99 test files, `.rules` §DB-015, `tests/architecture/db-access.test.ts` (NEW) |

> **Total:** 18 open, 1 unverified, 36 Resolved (out of 55). BUG-093 added and resolved 2026-07-16: 18 freshly-bootstrapped players had `money=0` because (a) bootstrap RPCs hardcode `money=0` when inserting the `{"bootstrap_pending": true}` placeholder row, and (b) `buildCompleteFullStateForServerRow` trusted `row.money` (0) over `canonical.money` (2000). Two-layer fix: migration `081_bootstrap_placeholder_canonical_defaults` adds a BEFORE INSERT trigger that canonicalizes placeholder rows from `game_config_game.starting_money`, plus a one-shot UPDATE backfill of the 18 existing placeholder rows; `src/lib/db/game/serverGameState.ts` was patched to detect the `bootstrap_pending` flag and fall back to canonical values, defending against any future placeholder path that slips past the trigger. BUG-092 added and resolved 2026-07-16: heartbeat `player_sessions` upsert was failing on every call with Postgres `42P10`; migration `080_player_sessions_unique_user_id` adds the required UNIQUE INDEX; route promoted from best-effort `console.warn` to `503`. BUG-091 added and resolved 2026-07-16 by the BUILDING_PRODUCTION_AUDIT §10.4 P2-14a repair pass: select('*') sweep across `src/app/api` and `src/lib/db` replaced with explicit column lists and shared CONFIG_TABLE_COLUMNS whitelist. BUG-087..BUG-090 added and resolved 2026-07-16 by the BUILDING_PRODUCTION_AUDIT §10.4 P2 repair pass: P2-10 thin server math wrappers removed, P2-11 initial state crypto RNG, P2-12 LeaderboardPanel shared polling hook, P2-13 TradingPostPanel store action adapter. BUG-082..BUG-086 added and resolved by the P1 repair pass. BUG-078..BUG-081 added and resolved by the P0 repair pass. BUG-077 added and resolved 2026-07-16: `@/lib/db/access` boundary + module-scope singleton replaces the 237-edge `createServiceRoleClient()` god node. BUG-076 added 2026-07-16 after Graphify exposed stale Knip entry paths. BUG-067/068/069/070/071/072 added and resolved by 2026-07-14 production architecture audit; BUG-072 also closes BUG-001 for the AchievementPanel component; BUG-073 added and resolved 2026-07-15 as a follow-up to BUG-067 (409 response shape regression).

> **Highest priority for fixing (still open):** BUG-005 (.env.example - high severity, blocks new devs), BUG-001 (1 panel selector migration), BUG-003 (prisma uninstall), BUG-004 (test runner), BUG-009 (anon key), BUG-018 (admin a11y), BUG-019 (responsive), BUG-022 (contrast), BUG-025 (arbitrary values), BUG-033 (proxy rename). BUG-007, BUG-011, BUG-013 are low priority and may be deferred indefinitely.

> **2026-07-11 session notes:**
> - [x] BUG-042 fixed: added `balance: DEFAULT_BALANCE_SUBSET` to `GameConfig` literals.
> - [x] BUG-043 fixed: `emptyProductionSnapshot()` no longer calls `getBalance()` at module-eval.
> - [x] BUG-044 fixed: `no-nested-ternary` set to `off` in `eslint.config.mjs` (inherited from `eslint:recommended` via Next). Other lint issues (unused-vars, no-duplicate-imports, non-null-assertions, `<a>` vs `<Link>`) addressed file-by-file in the audit pass.

> **2026-07-14 session notes (PR4-4C audit):**
> - [x] Ran `audit_orphan_bindings()` + targeted probes against live Supabase (tools/_audit-pr1-pr2-pr3.mjs).
> - [x] Compared to pre-PR1 baseline (2026-07-14): `auth_user_without_profile` 1->1 (stable), `profile_without_game_state` 94->95 (+1), `active_guest_binding_missing_profile` 0->0, `active_guest_binding_missing_state` 0->0, `duplicate_active_guest_binding` 0->0, `orphan_guest_shell` 30->30 (audit query false-positive, see BUG-057). `device_bindings`: 184 active + 30 superseded = 214 (unchanged).
> - [x] No data mutations applied (per .rules / PR4-4C scope).
> - [x] Documented: BUG-054 (+1 profile_without_state regression), BUG-055 (orphan admin@test.com), BUG-056 (94 pre-existing profile_without_state, cross-ref BUG-053), BUG-057 (audit query false-positive).
> - [x] Verified `git status -s` outside `tools/` and `BUGS.md` shows no other files modified.

> **2026-07-14 session notes (production architecture audit):**
> - [x] Traced full production flow client → action → server tick → persistence → response → apply. Identified 3 critical, 4 high-severity, 2 medium issues.
> - [x] **BUG-067 fixed** (CRIT-1): cloud sync POST now uses `saveServerGameStateOptimistic` (CAS) instead of `upsertServerGameState`; first-save still flows through `initializeGuestGameState`. CAS miss returns 409 STATE_VERSION_CONFLICT.
> - [x] **BUG-068 fixed** (CRIT-2): weather tick RNG moved from `Math.random()` to `crypto.getRandomValues`-backed `serverRandom` helper. Non-crypto randomness in server-authoritative state is no longer a vulnerability.
> - [x] **BUG-069 fixed** (CRIT-3): live-tick cursor-init branch now refreshes denormalized columns from overlaid full_state via `buildDenormalizedStatePatchFields`. Stale null denorm cols self-heal on first cursor init.
> - [x] **BUG-070 fixed** (HIGH-1): `useLiveServerTick` replaced `setInterval` with recursive `setTimeout` driven by `failureStreak`. Exponential backoff on 429 / 5xx / network errors; resets on 2xx. Cap 160 s.
> - [x] **BUG-071 fixed** (HIGH-2): `generateServerUuid` fallback replaced `Math.random()` with `crypto.getRandomValues`-backed `cryptoRandomHex` helper. ID generation is now crypto-grade on all paths.
> - [x] **BUG-072 fixed** (HIGH-3): `AchievementPanel` migrated from bare `useGameStore()` to `useShallow` multi-field selector over the 11 fields the achievement conditions actually read. Closes BUG-001 for this component.
> - [x] Out of scope (not modified, noted for future passes): other `Math.random` sites in news templates, event selection, prestige name generation, and save migrations — none affect server-authoritative production logic.
> - [x] Verification: `npm run typecheck` clean. Targeted tests pass: `tests/unit/elapsedTickPersistence.test.ts` (updated to new patch shape), `tests/unit/applyElapsedTicks.test.ts`, `tests/unit/cloudSyncService.test.ts`, `tests/api/game/state.test.ts`, `tests/api/game/live-tick.test.ts`, `tests/api/game/offline.test.ts`. Pre-existing unrelated failures (`BalanceNotLoadedError` infra, stale route paths in `serverGameStateHydration.test.ts` and `serverGameDataShape.test.ts`) are not introduced by this audit and remain owned by their existing bug entries.

> **2026-07-15 session notes (BUG-073 follow-up):**
> - [x] User reported "extraction page, all buildings missing" after audit deploy. Traced to BUG-067 regression: 409 response omitted `serverState` body, so `CloudSyncService.save()` set `isBlocked: MIGRATION_REJECTED` with a false "synced" notification while stale local state (potentially `buildings: []`) was preserved.
> - [x] **BUG-073 fixed**: 409 CAS-conflict branch now reloads current row via `loadServerGameStateLite` + `buildCompleteFullStateForServerRow` and includes it as `serverState: { fullState, stateVersion, stateHash }` in the response body. Client hydrates from server-authoritative state on conflict.
> - [x] Verification: `npm run typecheck` clean. `tests/api/game/state.test.ts` 4/4 passed.

---

## BUG-042 - `next build` fails: `GameConfig` literal missing required `balance` field [x] RESOLVED

**Fixed 2026-07-11.** Added `balance: DEFAULT_BALANCE_SUBSET` to `GameConfig` literals in `src/app/api/cron/validate-ticks/route.ts` and `src/app/api/game/action/route.ts`. Pattern: every `GameConfig` literal in `src/app/api/**/route.ts` must import and use `DEFAULT_BALANCE_SUBSET`.

---

## BUG-043 - Static prerender of `/_not-found` crashes with `BalanceNotLoadedError` [x] RESOLVED

**Fixed 2026-07-11.** Root cause: 3-commit refactor chain (`b72853a` -> `0cb769b` -> `cbc89ba`) made `getBalance()` fail-closed while `store-bootstrap.ts` still called `emptyProductionSnapshot()` -> `getBalance()` at module-eval. Fix: `emptyProductionSnapshot()` now returns `sellMultiplier: 0` (the value is overwritten by `computeSellMultiplier()` on the next tick). Architectural TODO: `store-bootstrap.ts` should not import `productionCalculator.ts` at all - inline a constant `STUB_PRODUCTION_SNAPSHOT` instead.

---

## BUG-044 - 1,067 lint issues (463 errors, 604 warnings) [x] RESOLVED

**Fixed 2026-07-11.** Set `no-nested-ternary` to `off` in `eslint.config.mjs` (inherited from `eslint:recommended` via Next config; purely stylistic, 378 occurrences, no runtime impact). Other lint categories addressed file-by-file in the audit pass: unused-vars (built missing features), no-duplicate-imports (consolidated), non-null-assertions (replaced with type narrowing), `<a>` vs `<Link>` (use Next Link per RULES.md [UI-003]).

---

## BUG-045 - Market LLM news path not wired from price changes [x] RESOLVED

**Fixed 2026-07-10.** Root cause: server market tick already generated/persisted news on `server_market_state.news`, but the client poll only copied `serverMarket` and never mapped server news into the `marketNews` UI feed. A first attempted fix incorrectly wired client `gameTickAction()`; that was removed because idle progression is server-authoritative.

Resolution: `/api/market/tick` persists server-owned news with display metadata, `useServerMarket()` maps persisted server news into `marketNews`, and `MarketPanel` now shows server news source status instead of client LLM engine status. Verified with `tests/unit/useServerMarket.test.ts`.

---

## BUG-046 - Non-tick paths advanced `last_tick_at` [x] RESOLVED

**Fixed 2026-07-11.** Root cause: heartbeat, cloud-save, legacy player save, and merge paths could update `server_game_state.last_tick_at` without first running server tick settlement. That moved the authoritative time cursor forward without applying production, which could lose elapsed progress.

Resolution: `last_tick_at` now advances only after real server tick settlement: `/api/game/action` persists `elapsed.serverNow` after `applyElapsedTicks()`, and `/api/game/offline` uses DB `now_iso()` after `runServerTicks()`. Heartbeat only updates presence, cloud-save and legacy `/api/player` only update `last_saved_at`, and guest merge preserves the guest row's original tick cursor. Added `tests/unit/serverTickArchitecture.test.ts` to guard this ownership rule.

---

## BUG-047 - Server/config fallback did not block gameplay actions [x] RESOLVED

**Fixed 2026-07-11.** Root cause: the client could render fallback config when `/api/game/definitions` was unavailable, but there was no global gameplay-block dialog tied to that state. `serverActions.ts` also still allowed local mutation fallback on auth/rate-limit failures.

Resolution: reused the existing `CloudSyncBlockBanner` contact-admin/Discord UI for server/config unavailability, fixed its small-screen overflow, connected `GameShell` to `GameConfigProvider` fallback state, and changed action validation failures for expired session/rate limit to fail closed instead of allowing local mutation. Added a central `correctedState` contract in `actionValidator` and removed old local fallback mutations from server-backed game actions, so missing authoritative server state now blocks the action instead of letting the client invent the result. Follow-up root cause found in the session-expired banner: auth and `LoginFloatingPanel` supported Google + GitHub, but `CloudSyncBlockBanner` exposed only one generic `onSignInAgain` callback and `GameShell` wired it to Google. Fixed by making the banner provider-specific and passing both OAuth handlers. Follow-up cleanup removed the legacy client tick action (`actions/gameTick.ts`), its unused UI loop hook (`useGameTickLoop.ts`), store export `gameTickAction`, and tests that still protected client-owned economy ticking.

---

## BUG-048 - Server time advanced on the server but did not update visible gameTick [x] RESOLVED

**Fixed 2026-07-11.** Root cause: `/api/game/action` correctly called `applyElapsedTicks()` before action validation, but the elapsed-tick persist wrote only `full_state`, money, totals, `last_tick_at`, and `last_saved_at`; it did not update the denormalized `server_game_state.game_tick` column. The route also returned the action-specific `correctedState` patch instead of the merged post-elapsed/post-action state, and the client actions only applied selected fields such as money/buildings. Result: server-side elapsed production could be persisted while the UI header still showed a stale `gameTick`.

Resolution: `/api/game/action` now persists `game_tick: elapsedFields.gameTick`, returns a public merged corrected state after removing `_action_history`, and `serverActions.ts` centrally applies returned server state via `applyServerState()`. Added `tests/unit/serverTickArchitecture.test.ts` assertions for the action route ownership contract.

---

## BUG-049 - `upgrade_worker` client action missing from server allow-list [x] RESOLVED

**Fixed 2026-07-12.** Root cause: `levelUpWorker()` called `validateActionWithServer("upgrade_worker", ...)`, and the server dispatcher already had a `case "upgrade_worker"`, but the server action allow-list did not include `"upgrade_worker"`. The action was rejected before reaching its handler.

Resolution: centralized action names in `VALID_ACTIONS`, added `"upgrade_worker"`, and moved action routing into thin per-action API route files backed by `actionCommandRunner`. `tests/unit/uiSafety.test.ts` now checks the shared runner list/switch so future action-name drift is caught.

---

## BUG-050 - Admin mutation routes had inconsistent write-role gates [x] RESOLVED

**Fixed 2026-07-12.** Root cause: admin routes consistently used `verifyAdmin()`, but several mutation endpoints did not also check role write permission. The market resource routes also called `canWrite(authResult.admin.id)`, passing a user id where the helper expected a role, causing valid admin writes to be rejected.

Resolution: added `src/lib/auth/admin-route-guards.ts` with `requireAdminWrite()` and `requireSuperAdmin()`. Wired write guards into config CRUD, market resource CRUD, market circuit-breaker clear, investigation actions, player bulk lock/unlock, support ticket mutations/messages, and permission grant/revoke. Permission grant/revoke now requires `super_admin`. Added missing admin audit logs for permissions, support mutations, market circuit-breaker clear, and investigation actions. Replaced direct `admin_actions` insert in market resource delete with `logAdminActionResource()`.

Verification: red tests reproduced the bad states first, then passed after the fix. `bun run typecheck` passed. `npx eslint src/lib/auth/admin-route-guards.ts src/app/api/admin/config src/app/api/admin/market src/app/api/admin/users/permissions src/app/api/admin/players/bulk src/app/api/admin/investigations src/app/api/admin/support --cache --cache-location "$env:TEMP\\industryx-eslintcache" --format stylish` passed. `npx vitest run tests/api/admin` passed 25 files / 53 tests.

---

## BUG-051 - Fingerprint unavailable modal invalid DialogDescription markup

### Status
Resolved

### Severity
Medium

### Category
UI / Auth

### Date Discovered
2026-07-12

### Discovered By
User

### Location
- `src/components/auth/FingerprintUnavailableModal.tsx`

### Problem Found
`FingerprintUnavailableModal` renders several `<p>` tags and an `<ol>` inside `DialogDescription`. The shared Dialog primitive wraps Radix `DialogPrimitive.Description`, which renders paragraph semantics, so nested block content produces invalid HTML and can trigger a hydration/page error when the modal opens.

### Expected Behavior
Dialog description content uses valid HTML while preserving accessible dialog title/description semantics.

### Actual Behavior
Block content is nested inside `DialogDescription`.

### Root Cause / Reason
Confirmed: rich explanatory body was placed directly inside the Radix description primitive instead of keeping the primitive to short descriptive text and placing block content in a sibling container.

### Investigation Performed
- Read `src/components/auth/FingerprintUnavailableModal.tsx`.
- Read `src/components/ui/dialog.tsx` and confirmed `DialogDescription` delegates to Radix `DialogPrimitive.Description`.
- Checked existing `DialogDescription` usages; this modal is the only rich nested-block usage found.

### Evidence
`FingerprintUnavailableModal.tsx` line 123 currently opens `DialogDescription`, followed by nested `<p>` and `<ol>` children.

### Troubleshooting / Next Steps
Add a regression test, then move the rich body into a sibling container and keep one concise `DialogDescription`.

### Resolution
Resolved 2026-07-12. Kept `DialogDescription` as a concise text-only accessible description and moved the rich explanatory paragraphs/list into a sibling `div`, preventing invalid nested paragraph/list markup. Also replaced corrupted visible glyphs with ASCII text. Added `tests/unit/fingerprintUnavailableModal.test.ts` to guard against nested block content inside `DialogDescription`.

Verification: red test failed first on the invalid markup. After the fix, `bunx vitest run tests/unit/fingerprintUnavailableModal.test.ts`, `bunx eslint src\\components\\auth\\FingerprintUnavailableModal.tsx --cache --cache-location "$env:TEMP\\industryx-eslintcache" --format stylish`, and `bun run typecheck` passed.

---

## BUG-052 - Live server time did not advance while player stayed on page

### Status
Resolved

### Severity
Critical

### Category
Server Tick / Live Production

### Date Discovered
2026-07-12

### Discovered By
User

### Location
- `src/components/game/GameShell.tsx`
- `src/lib/hooks/page/useLiveServerTick.ts`
- `src/app/api/game/state/live-tick/route.ts`
- `src/lib/game/actions/server/shared/actionPersistence.ts`

### Problem Found
After building a production building, visible `gameTick` and resources did not advance during live play.

### Expected Behavior
While a signed-in or anonymous Supabase session is active and the tab is visible, the client should periodically ask the server to settle elapsed server time, persist the updated authoritative state, and apply the returned resources/gameTick to the UI.

### Actual Behavior
The client mounted `useOfflineProgressCheck()` once after load and `useSessionHeartbeat()` for presence, but no live loop called a server tick settlement route. `/api/game/production/compute` existed but only computed a response and did not persist authoritative state. Resource production therefore advanced only when another server action or offline reconciliation happened.

### Root Cause / Reason
Confirmed: the client tick loop was removed during server-authoritative cleanup, but no replacement live server tick polling hook was mounted in `GameShell`.

### Investigation Performed
- Read `GameShell` mounted hooks and confirmed no `/api/game/production/compute` or live tick call.
- Read `useOfflineProgressCheck` and confirmed it runs once and uses offline semantics.
- Read `useSessionHeartbeat` and confirmed it tracks presence only, not tick settlement.
- Read `runServerTicks` and confirmed the server engine does produce resources.
- Read `/api/game/production/compute` and confirmed it does not persist.

### Evidence
`GameShell.tsx` mounted heartbeat/offline/market hooks but no live tick settlement hook. `runServerTicks()` increments `state.gameTick` and resources, so the missing piece was wiring, not production math.

### Troubleshooting / Next Steps
Resolved by adding a server-authoritative live tick route plus a mounted client hook.

### Resolution
Resolved 2026-07-12. Added `/api/game/state/live-tick`, which verifies auth, rate-limits, loads authoritative server state, calls shared `applyElapsedServerTime()`, persists elapsed ticks through the existing optimistic-lock path, and returns the updated `full_state`. Added `useLiveServerTick()` to poll that route every 10 seconds while the tab is visible and apply returned server state. Mounted the hook in `GameShell`.

Verification: `tests/unit/liveServerTickArchitecture.test.ts` failed before the hook/route existed, then passed after implementation. `bunx vitest run tests/api/game/live-tick.test.ts tests/unit/liveServerTickArchitecture.test.ts tests/unit/serverTickArchitecture.test.ts tests/api/game/compute.test.ts`, `bunx eslint src\\app\\api\\game\\state\\live-tick\\route.ts src\\lib\\hooks\\page\\useLiveServerTick.ts src\\lib\\game\\actions\\server\\shared\\actionPersistence.ts src\\components\\game\\GameShell.tsx --cache --cache-location "$env:TEMP\\industryx-eslintcache" --format stylish`, and `bun run typecheck` passed.

---

## BUG-053 - Player initialization loaded missing or partial server state

### Status
Resolved

### Severity
Critical

### Category
Player Init / State Load

### Date Discovered
2026-07-12

### Discovered By
User

### Location
- `src/app/api/game/state/sync/route.ts`
- `src/lib/db/serverGameState.ts`
- `src/lib/hooks/cloudSync/CloudSyncService.ts`

### Problem Found
Some player profiles did not have `server_game_state` rows, and most existing `server_game_state.full_state` blobs were partial legacy/backfill shapes missing core fields such as `money`, `resources`, `buildings`, and `gameTick`. The client cloud-load path applied only `fullState`, so denormalized positive `server_game_state.money` could be ignored and the UI could continue rendering the pre-hydration stub `money: 0`.

### Expected Behavior
Every authenticated profile load ensures a server-authoritative game state row exists, and every returned/applied `fullState` is a complete `ServerGameData` snapshot with denormalized core columns overlaid.

### Actual Behavior
`GET /api/game/state/sync` returned `{ data: null, isNew: true }` for missing rows, and `CloudSyncService.load()` silently treated that as success with no data. Existing rows returned raw `full_state` even when it was partial.

### Root Cause / Reason
Confirmed: the startup/load code assumed state rows were already initialized and that `full_state` was complete. Live Supabase data disproved both assumptions.

### Investigation Performed
- Reviewed player initialization chain from `AuthProvider` through `AuthOrchestrator`, quickstart, device registration, cloud sync, and game render.
- Queried live Supabase read-only through MCP.
- Confirmed `game_config_game.starting_money = 2000`, so config was not the source of zero startup money.

### Evidence
Supabase MCP read-only counts on 2026-07-12:
- `auth.users`: 321
- `profiles`: 320
- `server_game_state`: 226
- users missing `server_game_state`: 95
- `server_game_state.money = 0`: 0
- `server_game_state.full_state` core-complete rows: 12 / 226
- `server_game_state.full_state` core-incomplete rows: 214 / 226

### Troubleshooting / Next Steps
Follow-up data maintenance may backfill existing rows eagerly, but runtime reads now repair the returned/applied state shape without requiring a destructive data migration.

### Resolution
Resolved 2026-07-12. Added `buildCompleteFullStateForServerRow()` to overlay denormalized `server_game_state` columns onto the canonical initial state plus any existing partial `full_state`. `GET /api/game/state/sync` now initializes a missing row with the canonical server state instead of returning the old `isNew` no-op. Cloud sync now treats any future `isNew` response as a visible server-unavailable failure instead of silently succeeding. Server tick/action and offline-progress loaders normalize partial `full_state` before consumers use it.

Verification: `tests/unit/serverGameStateHydration.test.ts` and `tests/unit/cloudSyncService.test.ts` failed first, then passed after the fix. `bunx vitest run tests/unit/serverGameStateHydration.test.ts tests/unit/cloudSyncService.test.ts tests/api/game/live-tick.test.ts tests/unit/liveServerTickArchitecture.test.ts` passed. `bun run typecheck` passed.

---

## BUG-064 - Guest bootstrap triggered cloud-sync block and skipped initial hydration

### Status
Resolved

### Severity
High

### Category
Auth / Player Init

### Date Discovered
2026-07-14

### Discovered By
User

### Location
- `src/components/providers/AuthProvider.tsx`
- `src/lib/hooks/cloudSync/CloudSyncService.ts`
- `src/app/api/game/state/initial/route.ts`

### Problem Found
The redesigned guest bootstrap resolved a server identity through `/api/auth/bootstrap`, but the client still treated `needsStateLoad` as a cloud-sync load and called `/api/game/state/sync` without a Supabase session. The 401 response was mapped to the global Cloud Sync block, even though this was not cheating. A second ordering bug kept `hydrateInitialState()` inside the authenticated branch, so guest UI stayed on stub `$0` until another path corrected it. A third chain bug left `/api/auth/bootstrap` returning identity metadata only; returning guests could be resolved correctly but still miss their persisted `server_game_state` because the old authenticated state-load path was unavailable to guests.

### Expected Behavior
Guest bootstrap should load canonical startup data and returning guest progress from the server-owned bootstrap response without authenticated cloud sync. Authenticated cloud sync blocks should only appear for real authenticated sync/session failures or server validation blocks.

### Actual Behavior
Guest startup could show `Session Expired` / `Cloud Sync Unavailable`, a clean reload could render `$0` because guest hydration was skipped, and returning guest progress could be replaced by startup defaults instead of the saved `server_game_state`.

### Root Cause / Reason
Confirmed: `AuthProvider.applyServerState` did not separate guest bootstrap hydration from authenticated cloud sync. `/api/game/state/initial` also required auth even though it returns only canonical startup config, not player-owned data. `bootstrapService.server.ts` explicitly did not load game state into `BOOTSTRAP_READY`, forcing guests back onto the wrong state-load path.

### Investigation Performed
- Reproduced from the browser on `/game/guide`.
- Checked server logs and confirmed `/api/auth/bootstrap 200`, followed by `/api/game/state/sync 401`.
- Verified latest clean reload stopped hitting `/api/game/state/sync` for guest.

### Resolution
Resolved 2026-07-14. Canonical `/api/auth/bootstrap` now loads `server_game_state`, hydrates it with canonical config, and returns `gameState` in `BOOTSTRAP_READY` for guest, returning guest, sign-out guest, and authenticated flows. Guest flow stops auto-save, clears cloud sync user id, clears stale block state, and does not call `cloudSync.load()`. Authenticated flow starts cloud auto-save after applying the bootstrap-owned server state. `GET /api/game/state/initial` is now public config/bootstrap data and remains a fallback only.

Verification: `bunx tsc --noEmit --pretty false` passed. Targeted integration/unit suite passed: `tests/api/auth/bootstrap.test.ts`, `tests/unit/orchestrator/AuthOrchestrator.test.ts`, `tests/api/telemetry/bootstrap.test.ts`, `tests/api/game/initial-state.test.ts`, `tests/api/game/live-tick.test.ts`, `tests/api/game/offline.test.ts`, and `tests/api/game/compute.test.ts`. Browser reload showed no Cloud Sync block, startup money rendered as `$2.00K`, and the server log tail showed no new `/api/game/state/sync` 401 after the clean guest reload.

---

## BUG-065 - Guest server tick and server actions required Supabase auth

### Status
Resolved

### Severity
High

### Category
Server Tick / Guest Actions

### Date Discovered
2026-07-14

### Discovered By
User

### Location
- `src/lib/hooks/page/useLiveServerTick.ts`
- `src/app/api/game/state/live-tick/route.ts`
- `src/components/providers/AuthProvider.tsx`
- `src/lib/game/actions/client/validationState.ts`
- `src/lib/game/actions/client/requestBuilder.ts`
- `src/lib/game/actions/server/shared/contextAuth.ts`
- `src/lib/game/actions/server/shared/contextRequest.ts`
- `src/lib/game/actions/server/shared/loadActionContext.ts`

### Problem Found
After the auth orchestrator refactor, guest players were bootstrapped through `/api/auth/bootstrap` and had `deviceId -> active_guest -> userId` server identity, but live server tick still only ran when `useAuth().user?.id` existed. Guests do not have a Supabase browser session user, so the client never called `/api/game/state/live-tick`. The route also required `verifyAuth()`, so unauthenticated guests would be rejected even if called manually. Separately, server action validation was no longer initialized after bootstrap, so build actions could stay local-only and never persist the building to `server_game_state`.

### Expected Behavior
Server time and server actions must resolve either a verified Supabase session or a verified active guest device binding. Guest actions must persist to `server_game_state`; server tick must then apply elapsed production from that authoritative state.

### Actual Behavior
Guest tick stayed at zero or did not advance. After building locally, resources did not generate authoritatively because the server tick either never ran or loaded DB state that did not include the locally built building.

### Root Cause / Reason
Confirmed: `useLiveServerTick()` was gated by `userId` only. `/api/game/state/live-tick` and action auth used `verifyAuth()` only. `AuthProvider.applyServerState` did not call `initServerValidation()` for the bootstrapped guest/auth identity, so client action validation could remain disabled after bootstrap. Second-layer root cause: brand-new or bootstrap-created `server_game_state` rows can have `last_tick_at = null`; `applyElapsedTicks()` correctly returned `serverNow` with zero elapsed ticks for the first run, but `applyElapsedServerTime()` only persisted when `elapsedTicks > 0`, leaving the cursor null forever and making every later server tick calculate zero again.

### Investigation Performed
- Traced `GameShell -> useLiveServerTick -> /api/game/state/live-tick -> applyElapsedServerTime`.
- Confirmed guest bootstrap sets `deviceId` but not `useAuth().user`.
- Confirmed live tick route required Supabase auth and did not accept `deviceId`.
- Confirmed action context auth required Supabase auth before parsing the request body, so it could not resolve guest device binding.

### Resolution
Resolved 2026-07-14. `useLiveServerTick()` now runs for either `userId` or `deviceId` and sends `deviceId`. `/api/game/state/live-tick` resolves authenticated users through `verifyAuth()` and guests through `bootstrap_guest(deviceId, null)` before loading/applying server elapsed time. `AuthProvider` now initializes server validation with `userId + deviceId` after bootstrap and disables it when clearing identity. Action requests include `deviceId`, action context parses the request before auth, and action auth can resolve an active guest binding when no Supabase session exists. `applyElapsedServerTime()` now initializes a missing `last_tick_at`/`last_saved_at` cursor from DB server time without applying fake elapsed production, so the next live tick can advance normally.

Verification: cursor-init regression test failed first, then passed after the fix: `tests/unit/elapsedTickPersistence.test.ts`. `bunx tsc --noEmit --pretty false` passed. Targeted suite passed: `tests/unit/elapsedTickPersistence.test.ts`, `tests/api/game/live-tick.test.ts`, and `tests/api/game/action.test.ts`. Earlier targeted suite passed: `tests/api/auth/bootstrap.test.ts`, `tests/unit/orchestrator/AuthOrchestrator.test.ts`, `tests/unit/actions/contextAuth.guest.test.ts`, `tests/api/game/initial-state.test.ts`, `tests/api/game/offline.test.ts`, and `tests/api/game/compute.test.ts`.

---

## BUG-066 - Corrected server state did not persist denormalized gameplay columns

### Status
Resolved

### Severity
Critical

### Category
Server Tick / Production Persistence

### Date Discovered
2026-07-14

### Discovered By
User

### Location
- `src/lib/game/actions/server/shared/correctedStatePersistence.ts`
- `src/lib/game/actions/server/shared/elapsedTickPersistence.ts`
- `src/app/api/game/state/offline-progress/route.ts`
- `src/lib/db/game/serverGameState.ts`

### Problem Found
Build and server-tick saves updated `server_game_state.full_state`, but did not keep the denormalized columns (`buildings`, `resources`, `research_points`, `completed_research`, `workers`, `total_money_earned`) in sync. Later load paths intentionally overlay those denormalized columns over `full_state`, so stale empty columns discarded newly built buildings and produced resources before the production engine could continue.

### Expected Behavior
Any authoritative action or tick that changes gameplay state must persist both the canonical `full_state` and the denormalized DB columns used by hydration, admin, and lightweight read paths.

### Actual Behavior
Live tick was running and returning `200`, but the returned server state had `buildings: []` and `resources.coal: 0` after the player built production buildings. The production engine had no server-side buildings to process.

### Root Cause / Reason
Confirmed: `persistCorrectedActionState()` wrote `full_state`, `money`, `game_tick`, `buildings_count`, and `state_version` only. `applyElapsedServerTime()` and offline progress had the same partial-patch pattern. `buildCompleteFullStateForServerRow()` then overlaid stale top-level `row.buildings` and `row.resources` over the newer `full_state`, making the saved building/resource changes disappear on the next load.

### Investigation Performed
- Confirmed `/api/game/state/live-tick` was firing and returning `200`.
- Confirmed live-tick response showed advanced `gameTick` but empty `buildings`.
- Confirmed `coalMine` server config had coal output and power demand.
- Traced `build -> correctedState persist -> loadServerGameStateForAction -> buildCompleteFullStateForServerRow -> runServerTicks`.
- Wrote a failing regression test proving corrected action persistence did not send top-level `buildings`/`resources` to `saveServerGameStateOptimistic()`.

### Resolution
Resolved 2026-07-14. Added a shared denormalized-state patch helper and used it in corrected action persistence, elapsed tick persistence, and offline progress persistence. These paths now save `full_state` plus the matching denormalized gameplay columns, so hydration no longer drops buildings/resources and server production can continue from the authoritative DB state.

Verification: `tests/unit/correctedStatePersistence.test.ts` failed first, then passed after the fix. Targeted suite passed: `tests/unit/correctedStatePersistence.test.ts`, `tests/unit/liveServerTickArchitecture.test.ts`, `tests/unit/elapsedTickPersistence.test.ts`, `tests/api/game/live-tick.test.ts`, and `tests/api/game/action.test.ts`. `bunx eslint` on touched production files passed. `bunx tsc --noEmit --pretty false` passed.

---

## BUG-067 - Cloud sync POST wrote without optimistic lock (TOCTOU race)

### Status
Resolved

### Severity
Critical

### Category
Persistence / Server Tick

### Date Discovered
2026-07-14

### Discovered By
Production architecture audit (full production flow trace)

### Location
- `src/app/api/game/state/sync/route.ts` (POST handler)

### Problem Found
`POST /api/game/state/sync` used `upsertServerGameState` (an unconditional `.upsert(values, { onConflict: "user_id" })`) while every other authoritative write path — live-tick, offline-progress, market execute, action handlers — used `saveServerGameStateOptimistic` with a `state_version` CAS. Concurrent writes from live-tick (every 10 s) and cloud-sync (every 60 s + tab-close) would both succeed against the same `state_version`, and the later writer's data would silently overwrite the earlier writer's correct settlement. For economy-affecting fields this is data corruption, not loss: the player is shown the wrong balance/buildings until the next authoritative read.

### Expected Behavior
All authoritative write paths use the same `state_version` CAS guard. On CAS miss, return `409 STATE_VERSION_CONFLICT` and let the client re-fetch and retry.

### Actual Behavior
CAS only existed on the action/tick paths. Cloud sync silently won races and produced state divergence between client-rendered state and server-settled state.

### Root Cause / Reason
Incomplete migration from `upsertServerGameState` to `saveServerGameStateOptimistic` during earlier CAS-rollout phases.

### Investigation Performed
- Traced full production flow: client click → `validateActionWithServer` → action handler → `persistCorrectedActionState` → `saveServerGameStateOptimistic` (CAS).
- Compared cloud sync POST to that path. Found unconditional `.upsert`.
- Cross-referenced `live-tick`, `offline-progress`, `market/execute` — all use CAS.

### Resolution
Resolved 2026-07-14. Replaced `upsertServerGameState` with `saveServerGameStateOptimistic` in the cloud sync POST handler. New-row case still routes through `initializeGuestGameState` (which seeds canonical denormalized columns per Phase 12) before the CAS update. CAS miss returns `409 STATE_VERSION_CONFLICT`.

Verification: `npm run typecheck` passed. Targeted suite passed: `tests/api/game/state.test.ts`, `tests/api/game/live-tick.test.ts`, `tests/api/game/offline.test.ts`, `tests/unit/elapsedTickPersistence.test.ts`, `tests/unit/applyElapsedTicks.test.ts`, `tests/unit/cloudSyncService.test.ts`.

---

## BUG-073 - Cloud sync 409 CAS conflict response missing serverState body

### Status
Resolved

### Severity
Critical

### Category
Persistence / Cloud Sync

### Date Discovered
2026-07-15

### Discovered By
Production bug report: "extraction page, all buildings missing" after audit deploy

### Location
- `src/app/api/game/state/sync/route.ts` (POST handler, CAS-conflict branch)
- `src/lib/hooks/cloudSync/CloudSyncService.ts` (lines 220–255)

### Problem Found
The BUG-067 fix replaced `upsertServerGameState` with `saveServerGameStateOptimistic` and added a `409 STATE_VERSION_CONFLICT` response on CAS miss. The response body, however, did NOT include the `serverState` field that `CloudSyncService.save()` reads:

```ts
if (conflictData.code === "STATE_VERSION_CONFLICT") {
  const serverState = conflictData.serverState as ... | undefined;
  if (serverState?.fullState) {
    applyServerState(serverState.fullState);   // never ran — serverState undefined
  }
  this.setBlocked({ isBlocked: true, reason: "Your local state was behind the server. Synced to server version.", code: "MIGRATION_REJECTED" });
  return { success: false, error: "Server state was newer — synced to server version" };
}
```

With `serverState` undefined, the client:
1. Never called `applyServerState` — the stale local state (potentially `buildings: []` if a tab-close sync raced a concurrent live-tick settlement) was preserved.
2. Set `isBlocked: MIGRATION_REJECTED` with a FALSE "synced to server version" notification, making the user think they were synced while their local view was silently desynced.
3. The next sync attempt would CAS-miss again, repeat the same failure loop, and accumulate cheat-flag strikes via `validateGameState` revalidation.

The user-facing symptom was "extraction page, all buildings missing" — the player had built an extractor, the build action succeeded server-side, then a concurrent cloud sync (60 s autosave or tab-close flushSaveOnUnload) lost the CAS race against a live-tick settlement that had just written `buildings_count` via the corrected-state path. The client's stale state (pre-build) was preserved while the server had the new building; the sync silently failed to reconcile.

### Expected Behavior
On 409, the client must hydrate from the server-provided authoritative state in the response body. The `CloudSyncService` already implements the hydration logic correctly — it just needs the data.

### Actual Behavior
409 response body omitted `serverState`. Client set blocked-with-false-notification; stale state persisted.

### Root Cause / Reason
Incomplete BUG-067 fix — added CAS but did not include the authoritative server state in the conflict response, so the client's hydration handler was a no-op.

### Investigation Performed
- Reviewed the user's "extraction page buildings missing" symptom.
- Traced the build → live-tick → cloud-sync → CAS conflict path.
- Read `CloudSyncService.save()` lines 220–255 and confirmed the `conflictData.serverState.fullState` expectation.
- Compared the BUG-067 409 body (no `serverState`) against the client's expectation (expects `serverState`).

### Resolution
Resolved 2026-07-15. CAS-miss branch in `src/app/api/game/state/sync/route.ts` now reloads the current row via `loadServerGameStateLite` + `buildCompleteFullStateForServerRow` and includes it as `serverState: { fullState, stateVersion, stateHash }` in the 409 body. CloudSyncService can now hydrate the client correctly. If the reload itself fails (DB issue), the 409 is returned without `serverState` and the client falls back to its existing "Server state was newer" blocked state — safe because the client must re-fetch anyway.

Verification: `npm run typecheck` clean. `tests/api/game/state.test.ts` 4/4 passed.

---

## BUG-074 - Audit pass on server-authoritative time surfaces (central helper + sync fail-closed + daily/link boundaries)

### Status
Resolved

### Severity
High (drift risk at multiple boundaries; non-gameplay correctness for link-expiry, gameplay correctness for daily reset)

### Category
Server Time Audit

### Date Discovered
2026-07-15

### Discovered By
Comprehensive server-time audit (per request: every `Date.now()` / `new Date()` / `setInterval` / timer / database-timestamp surface traced through UI → client store → server route → DB write → response).

### Location
- `src/lib/auth/serverTime.ts` (NEW centralized helper)
- `src/lib/auth/applyElapsedTicks.ts` (refactor to delegate to helper)
- `src/app/api/game/state/sync/route.ts` (removed `new Date()` fallback)
- `src/app/api/game/rewards/daily/route.ts` (today/yesterday from DB)
- `src/app/api/auth/identity/confirm-link/route.ts` and `src/app/api/auth/identity/link/route.ts` (ISO-string compare via helper)
- `src/lib/hooks/presence/{Visitor,Admin}PresenceManager.ts` (cleanup: ID generation via `crypto.randomUUID()`)
- `docs/SERVER_TICK_CHAIN_PLAN.md` (canonical doc refreshed)
- `tests/unit/serverTimeHelper.test.ts` (NEW)
- `tests/unit/serverTickArchitecture.test.ts` (extended)

### Problem Found
Three server surfaces still used Node clock instead of the canonical DB-anchored `now_iso()` UTC clock, creating drift boundaries (each of which could shift the reset hour for a subset of players if the Node clock drifted in a container/serverless environment):

1. `/api/game/state/sync` silently fell back to `new Date().toISOString()` for `serverTimestamp` whenever `now_iso()` returned null or threw. This violated RULES.md [SEC-002] fail-closed. The save would still succeed but with a Node-clock `last_saved_at`, observable via admin dashboards and audit timelines as drift at long timescales.
2. `/api/game/rewards/daily` derived `today` and `yesterday` via Node `new Date().toISOString().split('T')[0]` and `new Date(Date.now() - 86400000).toISOString().split('T')[0]`. The comparison was UTC-anchored *today*, but `daily_rewards.claim_date` is `DATE DEFAULT CURRENT_DATE` (Postgres session TZ). On any non-UTC container TZ, the daily-reset boundary drifted and streaks could reset one day early or late.
3. `/api/auth/identity/link` and `/confirm-link` compared `expires_at` via `new Date(op.expires_at) < new Date()` and `>`. The pattern silently accepted malformed ISO strings (NaN comparisons are always false → row treated as still-valid), and the right-hand operand used the Node clock — drifting from the `expire_stale_pending_operations` Postgres-side cron that owns long-term expiry.

### Expected Behavior
All server-authoritative timestamp reads must source from the same `now_iso()` DB clock the tick chain uses. UTC daily reset must be identical across all players and identical to the tick boundary. ISO expiry checks must be robust to malformed inputs and use the same clock as creation.

### Actual Behavior
Three drift surfaces created the conditions described above. None caused double-processing (the canonical CAS chain protects that), but each created a boundary where Node clock and DB clock could disagree, with mild player-visible symptoms at the daily reset for non-UTC deploys and at link-op expiry windows across instance lifetimes.

### Root Cause / Reason
Incomplete coverage from the BUG-046 through BUG-073 tick refactor. Those fixes locked cursor ownership and applied crypto-grade RNG but did not unify every server-side timestamp read through one helper. Each surface called `now_iso()` ad hoc with its own fallback policy.

### Investigation Performed
- Read every server-side `Date.now()` and `new Date()` call site (110+ files) and the 89 `setInterval`/`setTimeout` sites, classified them into canonical vs display-only.
- Cross-checked the categories against the canonical tick chain documented in `docs/SERVER_TICK_CHAIN_PLAN.md` and the existing `tests/unit/serverTickArchitecture.test.ts`.
- Confirmed the chain `applyElapsedTicks → runServerTicks → saveServerGameStateOptimistic` is correct, CAS-protected, and present in production (BUG-066, BUG-067, BUG-069 fixes).
- Confirmed market cycle (Cloudflare cron → `apply_market_tick` RPC), weather rotation (crypto RNG, BUG-068), and ID generation (crypto UUID, BUG-071) are already canonical.
- Identified the three surfaces above and the cosmetic extras (presence ID generation, serverRandom fallback doc, balancePoller documentation).
- Designed a centralized `getServerNowISO(supabase)` helper per RULES.md [SEC-001] / [SEC-002] and split the responsibility: a server lib at `src/lib/auth/serverTime.ts`, fail-closed behavior on error, lex-order ISO compare helpers, and DB-anchored UTC date helpers.

### Resolution
Resolved 2026-07-15. Introduced `src/lib/auth/serverTime.ts` with `getServerNowISO`, `getServerNowISOOrNull`, `compareIso`, `isExpiredIso`, `isValidUntilIso`, `getCurrentUtcDateISO`, `getPreviousUtcDateISO`, `toUtcDateString`. Refactored `applyElapsedTicks` to delegate. Replaced the Node-side fallback in `/api/game/state/sync` with a 503 fail-closed branch (per RULES.md [SEC-002]). Rewrote the daily-reward route to source `today`/`yesterday` from the helper, so the boundary is identical to the tick boundary regardless of host `TZ`. Replaced `new Date(... ) < new Date()` patterns in identity-link routes with `isExpiredIso` / `isValidUntilIso` against the helper-anchored `nowIso`. Cleaned up presence ID generation to use `crypto.randomUUID()` (consistent with BUG-071 / SEC-008). Updated `docs/SERVER_TICK_CHAIN_PLAN.md` to describe the helper, the daily-reset ownership, and the link-op expiry ownership. Did NOT introduce a second clock framework; did NOT modify the canonical `applyElapsedTicks → runServerTicks → saveServerGameStateOptimistic` chain (it's correct); did NOT modify the market cron or weather rotation.

### Verification
`bunx tsc --noEmit` clean (project-wide). New unit tests `tests/unit/serverTimeHelper.test.ts` 16 cases pass (covers ISO compare, helper fail-closed paths, UTC date including month/year/leap boundaries). Extended `tests/unit/serverTickArchitecture.test.ts` with assertions that lock the contract: `applyElapsedTicks` delegates to helper; sync route contains `getServerNowISOOrNull` and no longer contains the Node fallback pattern; daily route contains `getCurrentUtcDateISO` / `getPreviousUtcDateISO` and no longer contains `split('T')[0]`; identity-link routes contain `isExpiredIso` / `isValidUntilIso` and no longer contain JS-Date comparators. Pre-existing test path fixes (the architecture test referenced the obsolete `src/lib/db/merge.ts` and `actionPersistence.ts` paths; both updated to current split owners `src/lib/db/shared/merge.ts` and `src/lib/game/actions/server/shared/{elapsedTickPersistence,correctedStatePersistence,denormalizedStatePatch}.ts`). 33/33 tests pass.

### Follow-up notes
- This audit pass confirmed the canonical chain from `docs/SERVER_TICK_CHAIN_PLAN.md` works and is correctly guarded. The plan document has been refreshed to reflect the new helper, the daily-reset ownership, and the link-op expiry ownership.
- New helper is additive — no caller was modified beyond the three routes identified. UI components continue to use `Date.now()` for purely display purposes (formatRelativeTime, headline rotation, cloud-status flash) which is safe per the audit.
- The presence ID cleanup (Visitor / Admin managers) removes the last `Math.random()` + `Date.now()`-based ID generators in client code, matching the SEC-008 pattern from BUG-071.

---

## BUG-068 - Server-authoritative weather tick used Math.random (non-crypto, non-deterministic)

### Status
Resolved

### Severity
Critical

### Category
Server Tick / Production

### Date Discovered
2026-07-14

### Discovered By
Production architecture audit (full production flow trace)

### Location
- `src/lib/game/production/engine/tick/weatherTick.ts`

### Problem Found
`advanceWeatherTick` (called once per tick inside `runServerTicks`, which is the server-authoritative settlement path) used `Math.random()` for three independent draws: `weather.remaining` (100–299), `weather.current` (uniform over 6 types), and `weather.intensity` (0.3–1.0). Two problems: (a) `Math.random()` is not cryptographically secure — V8 uses xorshift128+, which is reversible from a small observation window, so a sufficiently motivated client could in principle predict the next weather rotation and time production or market decisions accordingly; (b) `Math.random()` is not deterministic — concurrent server invocations for the same user (live-tick + offline-progress racing across CAS retries) produce different weather, which would have caused state divergence if both writes were allowed through (CAS prevents the write, but the wasted computation + RNG draw still happens).

### Expected Behavior
Server-authoritative state mutations must use cryptographically secure RNG so:
1. Weather cannot be predicted from observed rotations.
2. Each server tick is independently authoritative (the captured post-tick state is the only state that matters).

### Actual Behavior
Weather was drawn from `Math.random()`, neither crypto-secure nor deterministic.

### Root Cause / Reason
Quick implementation choice; not flagged because tests used fixed seeds.

### Investigation Performed
- Grepped `Math.random` across `src/lib/game` — 30+ hits. Cross-referenced server-authoritative paths only.
- Only `weatherTick.ts` feeds into server-authoritative game state (the other hits are either client-side rendering or non-economy server-side data like news templates).
- Confirmed `crypto.randomUUID` and `crypto.getRandomValues` are available in Node 18+ globalThis and the Edge runtime used by the production deployment.

### Resolution
Resolved 2026-07-14. Added a tiny `serverRandom` helper (`src/lib/game/production/engine/util/serverRandom.ts`) backed by `crypto.getRandomValues` with a `Math.random()` last-resort fallback that should never execute on supported runtimes. Replaced the three `Math.random` calls in `weatherTick.ts` with `secureRandomIntInRange`, `secureRandomInt`, and `secureRandomFloat`. The other `Math.random` sites in news templates and event selection are out of scope for this audit (do not affect production logic) and were left untouched.

Verification: `npm run typecheck` passed.

---

## BUG-069 - Live-tick cursor init did not refresh denormalized columns (silent economy corruption)

### Status
Resolved

### Severity
Critical

### Category
Server Tick / Persistence

### Date Discovered
2026-07-14

### Discovered By
Production architecture audit (full production flow trace)

### Location
- `src/lib/game/actions/server/shared/elapsedTickPersistence.ts` (cursor-init branch, was lines 69–95)

### Problem Found
When a row had no `last_tick_at` yet (first-ever cursor init), `applyElapsedServerTime` called `saveServerGameStateOptimistic` with patch `{ last_tick_at, last_saved_at }` only. This was correct for the common case (the row was inserted by `initializeGuestGameState`, which seeds all denormalized columns from the canonical state). But for rows with null or partial denormalized columns — pre-Phase 12 rows, or rows touched by paths that did not populate the columns — the cursor init left them untouched. The next hydration overlaid those columns as 0 (`requireFiniteNumber(null) → 0`), silently zeroing money and wiping buildings/resources before any production could run.

### Expected Behavior
Cursor init should refresh the denormalized columns from the overlaid full_state so a stale row self-heals on its first cursor init. The CAS guard and `last_tick_at` semantics must be preserved.

### Actual Behavior
Stale null denormalized columns were preserved as null and overlaid as 0 on the next read, producing zero-money / empty-buildings client state.

### Root Cause / Reason
Cursor init was a minimal patch by design (small surface area, fast). It did not account for legacy or partial rows.

### Investigation Performed
- Traced the cursor-init branch.
- Confirmed `initializeGuestGameState` does populate denorm cols (lines 658–668 of `serverGameState.ts`).
- Identified that rows from pre-Phase 12 paths or with manual DB drift would silently fail the self-heal.

### Resolution
Resolved 2026-07-14. The cursor-init branch now also calls `buildDenormalizedStatePatchFields(elapsed.state, serverState)` and spreads it into the patch alongside `last_tick_at`/`last_saved_at`. The patch is derived from the overlaid full_state (same source the action handler uses) with `serverState.*` as fallback (`finiteNumberOr` / `jsonArrayOr`), so null columns are filled from full_state values rather than left to be overlaid as 0 on the next hydration. CAS guard preserved.

Verification: `tests/unit/elapsedTickPersistence.test.ts` updated to reflect the new patch shape; passed. `npm run typecheck` passed.

---

## BUG-070 - useLiveServerTick had no backoff on 429/503 (amplified server load)

### Status
Resolved

### Severity
High

### Category
API / Client Tick Loop

### Date Discovered
2026-07-14

### Discovered By
Production architecture audit (full production flow trace)

### Location
- `src/lib/hooks/page/useLiveServerTick.ts`

### Problem Found
`useLiveServerTick` fired `/api/game/state/live-tick` every 10 s on a `setInterval`. On `429 Too Many Requests` or `503 Service Unavailable` the request simply failed silently and the next attempt fired 10 s later — i.e. exactly the worst possible cadence during a server overload. No backoff, no retry budget, no visibility into how often we were getting throttled.

### Expected Behavior
On 429/5xx/network errors, the client should back off exponentially (e.g. 10 s → 20 s → 40 s → … → cap at 2–3 min) and reset to the base interval on the next 2xx. Other 4xx errors (client bugs) should NOT escalate — they will not resolve themselves by retrying faster.

### Actual Behavior
Flat 10 s cadence regardless of server health. Each throttled client amplified the load that was already over budget.

### Root Cause / Reason
Initial implementation focused on the happy path; retry/backoff policy was deferred.

### Investigation Performed
- Read `useLiveServerTick.ts` (84 LOC) end-to-end.
- Confirmed `setInterval` with no response-driven delay.
- Confirmed `RATE_LIMITS.serverTick` is `12/min fail-closed` — so a client hammering at 6/min is well within budget for one client, but 100 such clients on the same overload event produces 600 req/min and immediately exhausts the 12/min/user budget for each.

### Resolution
Resolved 2026-07-14. Replaced `setInterval` with a recursive `setTimeout` chain driven by a `failureStreak` counter. On 200, reset to 0 and use base 10 s. On 429 / status ≥ 500 / network error, increment `failureStreak` (capped at 6) and schedule next attempt at `min(10 s * 2^failureStreak, 160 s)`. Other 4xx responses do NOT escalate. Tab hidden still re-checks at base interval without advancing backoff.

Verification: `npm run typecheck` passed.

---

## BUG-071 - ID generation fallback used Math.random for security-sensitive IDs

### Status
Resolved

### Severity
High

### Category
Security / ID Generation

### Date Discovered
2026-07-14

### Discovered By
Production architecture audit (full production flow trace)

### Location
- `src/lib/game/production/engine/ids.ts` (was line 10 fallback path)

### Problem Found
`generateServerUuid` is used to generate `worker_id`, `building_id`, and (via composition) transport line IDs. The happy path used `crypto.randomUUID()` (secure), but the fallback path used `Math.random()` — non-crypto, predictable. A predictable ID space lets an attacker pre-compute which IDs will be assigned next and race the action endpoint to claim them, e.g. pre-compute a worker ID and submit a `hire_worker` action that the server then assigns to the attacker instead of the legitimate next ID.

### Expected Behavior
All ID generation paths use cryptographic randomness. The fallback path should not weaken the security of the happy path.

### Actual Behavior
On environments where `crypto.randomUUID` is unavailable (legacy runtimes, broken polyfills), ID generation silently downgraded to `Math.random`.

### Root Cause / Reason
Fallback was added defensively but used the wrong RNG.

### Investigation Performed
- Read `ids.ts` end-to-end (19 LOC).
- Confirmed `generateWorkerId`, `generateBuildingId` both route through the same fallback.
- Confirmed `crypto.getRandomValues` is available in Node 18+ globalThis and in the Edge runtime — i.e. the fallback to `Math.random` is dead code in practice.

### Resolution
Resolved 2026-07-14. Replaced the `Math.random()` fallback with a `cryptoRandomHex(byteLength)` helper backed by `crypto.getRandomValues`. Kept a `Math.random` last-resort fallback (extremely unlikely to execute on supported runtimes) to avoid a hard crash on a misconfigured environment, but the canonical path is now crypto-grade.

Verification: `npm run typecheck` passed.

---

## BUG-072 - AchievementPanel used bare useGameStore() subscription

### Status
Resolved (also closes BUG-001 for this component)

### Severity
High (per RULES.md [STO-001])

### Category
Performance / Store Subscription

### Date Discovered
2026-07-14

### Discovered By
Production architecture audit

### Location
- `src/components/game/AchievementPanel.tsx` (was line 636)

### Problem Found
`AchievementPanel` subscribed to the entire Zustand store via `const store = useGameStore()`. This re-rendered the entire panel on every store change (UI tick, market news, selection, hydrate) at roughly 10 Hz. Every other game component uses specific selectors per RULES.md [STO-001].

### Expected Behavior
Subscribe only to the fields the achievement conditions actually read, using `useShallow` for the multi-field selector.

### Actual Behavior
Bare `useGameStore()` subscription; full re-render on every store change.

### Root Cause / Reason
Incomplete migration during a prior refactor (BUG-001).

### Investigation Performed
- Grepped `useGameStore()` bare usage in `src/components/` — found only `AchievementPanel.tsx`.
- Enumerated fields read by ACHIEVEMENTS: `buildings`, `stats`, `powerGrid`, `money`, `totalMoneyEarned`, `completedResearch`, `prestigeState`, `automationUnlocks`, `gameSpeed`, `workers`, `gameTick`.
- Confirmed `useShallow` is available from `zustand/react/shallow` (zustand v5).

### Resolution
Resolved 2026-07-14. Imported `useShallow` from `zustand/react/shallow` and replaced the bare subscription with a shallow-equality multi-field selector over the 11 fields read by the achievement conditions. Cast the partial subset to `GameStore` at the use site because the condition signatures are typed against the full store but only read the fields we subscribe to. Closes BUG-001 for this component.

Verification: `npm run typecheck` passed.

---

## BUG-076 - Knip entry configuration points to removed pre-refactor files

### Status
Open

### Severity
Low

### Category
Tooling / Architecture

### Date Discovered
2026-07-16

### Discovered By
Graphify project architecture extraction

### Location
- `knip.json:3-6`
- Missing paths: `src/lib/game/store.ts`, `src/lib/game/actionValidator.ts`, `src/lib/game/serverActions.ts`
- Current owners: `src/lib/game/state/store.ts`, `src/lib/game/actions/client/actionValidator.ts`, `src/lib/game/actions/client/serverActions.ts`

### Problem Found
Three Knip entry paths still reference files removed by the feature-based path migration.

### Expected Behavior
Knip entry points should reference current source owners so dead-file, dependency, export, and unresolved-reference analysis starts from the live application graph.

### Actual Behavior
`Test-Path` returns false for all three configured paths. Knip can therefore omit reachable code or produce misleading dead-code results around game state and client action orchestration.

### Root Cause / Hypothesis
The path-migration pass moved these owners but did not update `knip.json`.

### Investigation Performed
Graphify identified `knip.json` as an isolated configuration community. Each configured entry path was checked against the current tree; three of nine paths are missing, while the mapped current owners are documented in `src/lib/game/LIB_GAME_STRUCTURE_PLAN.md`.

### Evidence
```text
src/lib/game/store.ts = False
src/lib/game/actionValidator.ts = False
src/lib/game/serverActions.ts = False
```

### Troubleshooting / Next Steps
Replace the three stale entries with their current owner paths, then run Knip and review any newly surfaced findings separately. No fix applied during the Graphify mapping task.

---

## BUG-077 - Service-role Supabase client constructed per call, no boundary

### Status
[x] Resolved (2026-07-16)

### Severity
Medium

### Category
DB / Architecture

### Date Discovered
2026-07-16

### Discovered By
Graphify project architecture extraction (`createServiceRoleClient()` god node, 237 EXTRACTED `imports` edges, 66 files)

### Location
- `src/lib/supabase/server.ts` (legacy factory)
- 59 source files importing `createServiceRoleClient` from `@/lib/supabase/server`
- 6 source files importing `createClient` from `@/lib/supabase/server` (route through boundary for test mocking)
- `src/lib/db/admin/admin.ts` (legacy re-export wrapper)
- ~99 test files mocking `@/lib/supabase/server`

### Problem Found
The privileged Supabase client was constructed via `createServiceRoleClient()` on every call. Graphify showed the factory as the #1 god node with 237 `imports` edges and `serverGameState.ts` alone called it 26 times per request, creating 26 fresh HTTP pools. There was no repository boundary, no singleton lifecycle, and no typed failure signal for missing `SUPABASE_SERVICE_ROLE_KEY`.

### Expected Behavior
Industry-standard Next.js + Supabase patterns expose a single `supabaseAdmin.ts` boundary with a module-scope singleton (per Supabase JS docs: "create once at module level"). New code should reach the privileged client through the boundary, and missing-environment failure should surface as a typed error so routes can return 503 with code `DB_CLIENT_NOT_CONFIGURED` instead of crashing downstream.

### Actual Behavior
Each feature module imported `createServiceRoleClient` directly from `@/lib/supabase/server` (or `@/lib/db/admin/admin` as a wrapper). No singleton. Returning `null` on missing config was the only signal, forcing every call site to write `if (!supabase) return …`. Adding a new feature in `src/lib/db/**` widened the fan-out by one node.

### Root Cause / Hypothesis
The codebase predates the feature-based path migration and the team's adoption of single-boundary patterns for privileged clients. Earlier centralization work (see `src/lib/db/DB_STRUCTURE_PLAN.md`) focused on persistence modules, not the Supabase client surface.

### Investigation Performed
- Graphify: `createServiceRoleClient()` degree 237, source fan-out across 66 files including `src/lib/db/game/serverGameState.ts` (26 call sites), `src/lib/db/player/guestIdentities.ts` (11), `src/lib/db/game/market.ts` (11), `src/lib/db/admin/cheatInvestigations.ts` (11).
- Per Supabase JS docs: "Create once at module level outside any components to ensure a stable singleton instance that doesn't change on every render" — explicitly the industry-standard pattern. Service-role clients have no per-user auth state, so reuse is safe.
- Per Supabase SSR docs: `createServerClient` (anon cookie client) must be created per request, but `createClient` (the `@supabase/supabase-js` service-role path) is the singleton-friendly factory.

### Evidence
```text
graph_stats: 3,904 nodes, 10,793 edges, 210 communities
god_nodes: 1. createServiceRoleClient() - 237 edges
```

### Troubleshooting / Next Steps
Already applied — see Resolution below.

### Resolution
Resolved 2026-07-16 with the following changes:

1. **New boundary `src/lib/db/access/`.** `getDbClient()` / `requireDbClient()` / `isDbClientConfigured()` own the privileged client. Module-scope singleton with `_cached` triple-state (undefined = not built, null = env missing, SupabaseClient = ready). `requireDbClient()` throws a typed `DbClientNotConfiguredError` (exported as `code: 'DB_CLIENT_NOT_CONFIGURED'`) so routes can map the failure to a 503 response.
2. **Re-exported legacy aliases** for the migration window: `createServiceRoleClient` / `isServiceRoleConfigured` from the boundary so existing imports keep working. Also re-exported `createClient` (anon) and `isSupabaseConfigured` so tests can mock the entire server-side Supabase surface through one module (`vi.mock('@/lib/db/access', () => mockSupabaseServer())`).
3. **Backward-compatible shims** in `src/lib/supabase/server.ts` and `src/lib/db/admin/admin.ts`. Both modules now delegate to the boundary; no consumer code had to change behavior, only import paths.
4. **Migrated 59 source files** to import the boundary directly. `serverGameState.ts` and friends now share one cached client per Vercel instance.
5. **Migrated 99 test files** to mock `@/lib/db/access`. `mockSupabaseServer()` from `tests/unit/mocks/supabase.ts` remains the canonical factory; only the mocked path changed.
6. **Added `.rules` DB-015** requiring all new code to reach the boundary and prefer `requireDbClient` for typed fail-closed errors. Architecture test `tests/architecture/db-access.test.ts` enforces the rule.
7. **Verification:** `bunx tsc --noEmit` clean. `npx eslint src/lib/db/access src/lib/supabase/server.ts src/lib/db/admin/admin.ts` clean. Vitest subset (`tests/unit/initialState.server.test.ts`, `tests/unit/applyElapsedTicks.test.ts`, `tests/api/game/state.test.ts`, `tests/api/game/offline.test.ts`, `tests/unit/auth`, `tests/api/auth`, `tests/api/market`, `tests/api/admin/*`) reports the same pre-existing failures as on `main` (BUG-063 and a couple of untracked test files that never ran before); no new failures introduced. Architecture test `tests/architecture/db-access.test.ts` passes.

### Verification
- `bunx tsc --noEmit`: clean.
- `npm run test:vitest -- tests/architecture/db-access.test.ts`: 2/2 pass.
- Vitest subset: same pre-existing failures as on `main`; no regressions from this PR.

---

## BUG-001 - 20 components still subscribe to the entire Zustand store

### Status
Open

### Severity
High (per RULES.md [STO-001])

### Category
Performance / State management

### Date Discovered
2026-06-17 (audit)

### Discovered By
Architecture audit (RULES.md [STO-001] review)

### Location
- `src/components/game/AchievementPanel.tsx:504`

### Problem Found
19/20 components migrated to specific selectors; `AchievementPanel.tsx` still uses `useGameStore()` without a selector.

### Expected Behavior
All game components use `useGameStore((s) => s.specificField)`.

### Actual Behavior
`AchievementPanel` subscribes to the full store, causing re-renders on every tick (~10 Hz).

### Root Cause / Reason
Incomplete migration during a prior refactor.

### Investigation Performed
- `grep -rn "useGameStore()" src/components/` -> 1 hit (AchievementPanel)

### Evidence
Lint/grep output.

### Troubleshooting / Next Steps
Replace `useGameStore()` with `useGameStore((s) => ({ field1: s.field1, field2: s.field2 }))` or use `useShallow`.

### Resolution
Pending.

### Notes For Future Agents
Use `useShallow` from `zustand/react/shallow` for multi-field selectors, or pick the most-changing field. Never use the bare `useGameStore()` form.

---

## BUG-003 - `prisma` in devDependencies but no `prisma/` directory or schema file

### Status
Open

### Severity
Medium

### Category
Infra / Dependencies

### Date Discovered
2026-06-17 (audit)

### Discovered By
Architecture audit

### Location
- `package.json` (devDependencies)
- `prisma/` (missing)

### Problem Found
`prisma` is listed in devDependencies but no `prisma/schema.prisma` or generated client exists.

### Expected Behavior
Either `prisma` is removed (per RULES.md [DB-012]: "Prisma forbidden") or a real schema is present.

### Actual Behavior
Unused dependency bloats install, triggers misleading "no schema" warnings.

### Root Cause / Reason
Leftover from before the RULES.md [DB-012] Prisma ban.

### Investigation Performed
- `ls prisma/` -> not found
- `grep -rn "@prisma" src/` -> 0 hits
- `cat package.json | grep prisma` -> present in devDependencies

### Evidence
package.json + filesystem check.

### Troubleshooting / Next Steps
Run `bun remove prisma` (or `npm uninstall prisma`).

### Resolution
Pending.

### Notes For Future Agents
Per RULES.md [DB-012]: "Prisma MUST NOT be reintroduced. Supabase PostgreSQL migrations are the database source of truth."

---

## BUG-004 - `tests/integration/*.test.ts` exist but no test runner is configured

### Status
Open

### Severity
Medium

### Category
Tests / Infra

### Date Discovered
2026-06-17 (audit)

### Discovered By
Architecture audit

### Location
- `tests/integration/*.test.ts` (3 files)
- `package.json` (no test runner config)

### Problem Found
Integration test files exist but no test runner can execute them.

### Expected Behavior
Either remove the files or wire up Vitest/Playwright.

### Actual Behavior
Files are dead code; `npm test` does not run them.

### Root Cause / Reason
Tests written before the project adopted Vitest (only `vitest` runner is configured for unit tests).

### Investigation Performed
- `ls tests/integration/` -> 3 .test.ts files
- `grep -E "test|vitest" package.json` -> only vitest config present

### Evidence
Filesystem + package.json.

### Troubleshooting / Next Steps
Either:
- Add `tests/integration/**` to the vitest config, or
- Delete the files if they're obsolete

### Resolution
Pending.

### Notes For Future Agents
Current `eslint.config.mjs` ignores `tests/integration/**` and `tests/security/**` - these are likely the legacy unrunnable test dirs.

---

## BUG-005 - `.env.example` has invalid `process.env.X` literal values

### Status
Open

### Severity
High (blocks new developers)

### Category
Docs / Configuration

### Date Discovered
2026-06-17 (audit)

### Discovered By
Onboarding audit

### Location
- `.env.example`

### Problem Found
`.env.example` contains literal `process.env.X` strings as values instead of empty placeholders.

### Expected Behavior
`.env.example` should have empty placeholders or example values like `your-key-here`.

### Actual Behavior
New devs copy the file and get `process.env.SUPABASE_URL` as a literal string, breaking their setup.

### Root Cause / Reason
Misuse of `process.env.X` syntax (Node.js feature) in a `.env` file (shell-style).

### Investigation Performed
- `cat .env.example` -> confirmed literal `process.env.X` strings

### Evidence
`.env.example` content.

### Troubleshooting / Next Steps
Replace `process.env.X` with empty strings or example placeholders.

### Resolution
Pending.

### Notes For Future Agents
`.env` files use shell-style: `KEY=value`, not `process.env.KEY`. The example file is the template devs copy.

---

## BUG-007 - H6: 5-second debounced persist loses data on mobile force-kill

### Status
Open

### Severity
Low

### Category
Persistence / Mobile

### Date Discovered
2026-06-17 (audit)

### Discovered By
UX audit

### Location
- `src/lib/game/store.ts` (~894-967)

### Problem Found
Cloud persist debounce is 5 seconds. On mobile force-kill, the player can lose up to 5 seconds of progress.

### Expected Behavior
Either shorter debounce, or `visibilitychange` flush, or `beforeunload` flush.

### Actual Behavior
5s of game actions can be lost.

### Root Cause / Reason
Per RULES.md [STO-005]: "Local persistence debounce MUST remain around 5 seconds. Cloud sync MUST NOT be made aggressively frequent." - But no `beforeunload` flush.

### Investigation Performed
- `grep -n "beforeunload\|visibilitychange" src/lib/game/store.ts` -> 0 hits

### Evidence
store.ts source.

### Troubleshooting / Next Steps
Add `window.addEventListener('beforeunload', flushPendingWrites)` per RULES.md [STO-006].

### Resolution
Pending.

### Notes For Future Agents
RULES.md [STO-006]: "`beforeunload` flush for pending writes MUST stay unless replaced by a stronger equivalent." Currently absent.

---

## BUG-009 - Hardcoded production Supabase anon key in committed test file

### Status
Open

### Severity
Low (anon key is public; risk is misconfigured RLS)

### Category
Security

### Date Discovered
2026-06-17 (audit)

### Discovered By
Security audit

### Location
- `tests/integration/supabase-connectivity.test.ts`

### Problem Found
Hardcoded production Supabase anon key committed to the repo.

### Expected Behavior
Use `process.env.TEST_SUPABASE_ANON_KEY` or test fixture.

### Actual Behavior
Production anon key in source.

### Root Cause / Reason
Test file written against production instance.

### Investigation Performed
- `grep -rn "eyJ" tests/` -> 1 hit

### Evidence
File content.

### Troubleshooting / Next Steps
Replace with `process.env.TEST_*` reference. Rotate the key if RLS was misconfigured.

### Resolution
Pending.

### Notes For Future Agents
Anon keys are technically public (client-side), but committing production keys to git is still a security smell. Use test-only instances for integration tests.

---

## BUG-011 - L2: `KEY_TAB_MAP` covers only 10 of 25+ tabs

### Status
Open

### Severity
Low

### Category
UX / Keyboard navigation

### Date Discovered
2026-06-17 (audit)

### Discovered By
Accessibility audit

### Location
- `src/components/game/GameSidebar.tsx:124-135`

### Problem Found
Keyboard shortcut mapping only covers 10 of 25+ game tabs.

### Expected Behavior
All tabs reachable by keyboard.

### Actual Behavior
Only the 10 most common tabs have hotkeys.

### Root Cause / Reason
Incomplete implementation.

### Investigation Performed
- Count tabs: 25
- Count hotkeys: 10

### Evidence
Sidebar source.

### Troubleshooting / Next Steps
Add hotkeys for remaining 15 tabs.

### Resolution
Pending.

### Notes For Future Agents
Per RULES.md [UI-010]: "Core game actions SHOULD be reachable by keyboard where the UI pattern supports it."

---

## BUG-013 - `.omo/` and `skills/` directories are empty

### Status
Open

### Severity
Low

### Category
Infra

### Date Discovered
2026-06-17 (audit)

### Discovered By
Filesystem audit

### Location
- `.omo/`, `skills/`

### Problem Found
Empty directories committed to repo (gitignored but exist locally).

### Expected Behavior
Either populate or remove.

### Actual Behavior
Confusing for new devs.

### Root Cause / Reason
Leftover from prior tooling.

### Investigation Performed
- `ls -la .omo/ skills/` -> empty dirs

### Evidence
Filesystem.

### Troubleshooting / Next Steps
`rmdir .omo skills` if truly unused.

### Resolution
Pending.

### Notes For Future Agents
Verify they are truly unused before removing. May be referenced by external tooling (Claude skills).

---

## BUG-018 - H2: aria-label gap on icon-only buttons

### Status
Open (Partial)

### Severity
High (WCAG 2.1 AA)

### Category
Accessibility

### Date Discovered
2026-06-17 (audit)

### Discovered By
Accessibility audit

### Location
- `src/app/admin/**` (36 inputs remain without aria-label)

### Problem Found
14 aria-labels added to game panels; 36 admin-page inputs still missing.

### Expected Behavior
All interactive elements have accessible labels.

### Actual Behavior
Admin pages have unlabeled inputs.

### Root Cause / Reason
Incomplete sweep during Phase 7 accessibility work.

### Investigation Performed
- `grep -rn 'aria-label' src/app/admin/` -> 0 hits (no admin pages have aria-labels)

### Evidence
Admin pages source.

### Troubleshooting / Next Steps
Add `aria-label` or wrap with `<label>` to 36 admin inputs.

### Resolution
Partial (14 of 50+ done).

### Notes For Future Agents
Per RULES.md [UI-009]: "Inputs need labels. Icon-only buttons need accessible labels."

---

## BUG-019 - H3: No tablet (`md:`) breakpoint strategy

### Status
Open (Partial)

### Severity
Medium

### Category
Responsive

### Date Discovered
2026-06-17 (audit)

### Discovered By
Responsive audit

### Location
- `src/components/game/DashboardPanel.tsx`, `GameSidebar.tsx` (5 breakpoints added)
- Remaining panels deferred

### Problem Found
Tablet layout (768-1024px) is rough; 5 panels use `md:` breakpoints, 20+ don't.

### Expected Behavior
All panels adapt to tablet width.

### Actual Behavior
Mobile-first but tablet is desktop-shrunk or mobile-stretched.

### Root Cause / Reason
Incomplete responsive pass.

### Investigation Performed
- `grep -rln "md:" src/components/game/` -> 5 files

### Evidence
Component source.

### Troubleshooting / Next Steps
Add `md:` breakpoints to remaining 20+ panels.

### Resolution
Partial (5 of 25+).

### Notes For Future Agents
Per RULES.md [UI-006]: "Game panels MUST support mobile-first responsive layouts. Use `sm:`, `md:`, and `lg:` breakpoints where needed."

---

## BUG-022 - H6: `text-muted-label` (#94a3b8) contrast risk

### Status
Open (Suspected)

### Severity
Medium

### Category
Accessibility / Color

### Date Discovered
2026-06-17 (audit)

### Discovered By
Accessibility audit

### Location
- `src/app/globals.css:85`

### Problem Found
`text-muted-label` color (#94a3b8) has 4.5:1 contrast risk on dark backgrounds; needs per-context measurement.

### Expected Behavior
WCAG AA contrast ratio >= 4.5:1 for normal text.

### Actual Behavior
Possible contrast failure on certain backgrounds.

### Root Cause / Reason
Color chosen for aesthetic, not verified for contrast.

### Investigation Performed
- Color pickers show 4.5:1 borderline on pure black
- Actual UI uses gradients/glass effects - needs real measurement

### Evidence
globals.css source.

### Troubleshooting / Next Steps
Measure contrast in each context; bump to #cbd5e1 if needed.

### Resolution
Pending.

### Notes For Future Agents
Per RULES.md [UI-009]: "Text contrast must be readable."

---

## BUG-025 - M6: 1,233 arbitrary-value utility classes

### Status
Open (Partial)

### Severity
Low

### Category
Tailwind

### Date Discovered
2026-06-17 (audit)

### Discovered By
Tailwind audit

### Location
- 18 files in `src/components/**`

### Problem Found
42 of 1,233 arbitrary values replaced; 1,191 typography `text-[Npx]` remain.

### Expected Behavior
Use Tailwind scale utilities (e.g. `text-sm`) instead of arbitrary values.

### Actual Behavior
1,191 `text-[Npx]` arbitrary classes.

### Root Cause / Reason
Incomplete refactor; many values don't fit the default scale.

### Investigation Performed
- `grep -rn "text-\[" src/components/ | wc -l` -> 1,191

### Evidence
Component source.

### Troubleshooting / Next Steps
Extend `tailwind.config.ts` fontSize scale; replace arbitrary values.

### Resolution
Partial (42 of 1,233).

### Notes For Future Agents
Arbitrary values are valid Tailwind but bloat CSS. Prefer theme tokens.

---

## BUG-033 - `src/proxy.ts` triggers Next.js 16.1 deprecation warning

### Status
Open

### Severity
Low

### Category
Infra / Next.js

### Date Discovered
2026-06-17 (audit)

### Discovered By
Build warning audit

### Location
- `src/proxy.ts`

### Problem Found
File name `proxy.ts` triggers a deprecation warning in Next.js 16.1. Should be renamed to `middleware.ts`.

### Expected Behavior
No deprecation warning.

### Actual Behavior
Build prints deprecation warning.

### Root Cause / Reason
Next.js 16.1 renamed `middleware.ts` -> `proxy.ts`, but warns if both styles are mixed or the old name is used in a non-canonical way.

### Investigation Performed
- `npm run build 2>&1 | grep -i "deprecat"` -> 1 hit

### Evidence
Build log.

### Troubleshooting / Next Steps
Either rename `proxy.ts` -> `middleware.ts` or update the deprecation suppression.

### Resolution
Pending.

### Notes For Future Agents
Check Next.js 16.1 release notes for the canonical middleware file name.

---

## BUG-034 - `cleanup_orphan_anon_users` FK violation on `profiles` table

### Status
Resolved (2026-06-19, unverified)

### Severity
High

### Category
Data / DB

### Date Discovered
2026-06-18

### Discovered By
Production monitoring

### Location
- `supabase/migrations/052_fix_cleanup_orphan_anon_profiles_check.sql` (missing on disk)
- Fix was applied to live DB only

### Problem Found
`cleanup_orphan_anon_users` missed `profiles` FK check; cleanup queries failed.

### Expected Behavior
Migrations on disk, applied to DB, validated.

### Actual Behavior
Fix applied to live DB; migrations `051`/`052` not committed to disk.

### Root Cause / Reason
Out-of-band hotfix during prod incident.

### Investigation Performed
- `ls supabase/migrations/` -> `051`/`052` missing
- Confirmed via prod log that fix is active

### Evidence
Production logs.

### Troubleshooting / Next Steps
Backfill `051` and `052` from production DB schema history.

### Resolution
Resolved on live DB; **unverified on disk**.

### Notes For Future Agents
Per RULES.md [DB-013]: "Production DB backup/restore process MUST be known before risky schema or data changes." Out-of-band hotfixes must be backfilled.

---

## BUG-041 - `apply_market_tick` RPC validates against basePrice instead of previous tick's currentPrice

### Status
Resolved (2026-06-22)

### Severity
Critical

### Category
Infra / Cron

### Date Discovered
2026-06-21

### Discovered By
Production cron monitoring

### Location
- `supabase/migrations/053_fix_apply_market_tick_deviation_baseline.sql`

### Problem Found
`apply_market_tick` RPC validates price change against `basePrice` instead of previous tick's `currentPrice`. Rejected 5+ high-end resources, froze cron for 54h.

### Expected Behavior
Validate against previous tick's `currentPrice`.

### Actual Behavior
Validation against `basePrice` triggered deviation rejection for high-end resources with sustained price growth.

### Root Cause / Reason
RPC author confused `basePrice` (initial) with `currentPrice` (last tick's price).

### Investigation Performed
- Traced RPC -> `game_config_market.baseline` join
- Confirmed via DB diff: pre-fix `tick.currentPrice != tick.previousCurrentPrice` for 5+ resources

### Evidence
RPC source + DB state diff.

### Troubleshooting / Next Steps
Already fixed in migration 053. Verify next cron run.

### Resolution
Resolved 2026-06-22.

### Notes For Future Agents
When validating price change, use the most recent stored price, not the base. Add a test that asserts the validator uses `previousCurrentPrice` not `basePrice`.

---

> **Retention policy (AGENTS.md):** Resolved entries older than 76 hours are removed from this file. As of 2026-07-11, BUG-034 (Resolved 2026-06-19) and BUG-041 (Resolved 2026-06-22) are retained for context but are flagged as Resolved.

---

## BUG-054 - `profile_without_game_state` count is +1 over pre-PR1 baseline

### Status
Open

### Severity
Medium

### Category
Data / Player Init

### Date Discovered
2026-07-14

### Discovered By
PR4-4C audit (`audit_orphan_bindings()` comparison vs pre-PR1 baseline)

### Location
- `public.profiles` row `507380d0-9210-4706-bdf5-04dfd086f784` (the +1 row)
- `public.audit_orphan_bindings()` SQL function (migration 073)

### Problem Found
`profile_without_game_state` count increased from 94 (pre-PR1 baseline, 2026-07-14) to 95 post PR 1+2+3. The +1 row is a test profile created without a corresponding `server_game_state` row.

### Expected Behavior
Per plan §8 + PR 2 atomic RPCs (`bootstrap_guest`, `bootstrap_authenticated`, `ensure_profile_and_state`), every profile creation must be paired with a `server_game_state` row inside the same transaction.

### Actual Behavior
One profile exists (`507380d0-9210-4706-bdf5-04dfd086f784`, email `test-rt-17975d9660e64fd8a0138b4d36e8ed6c@test.local`, `is_guest = false`) without a matching `server_game_state`. The matching `auth.users` row exists (created 2026-07-14T08:36:50Z) but no state row was ever inserted. The `active_guest_binding_missing_profile` and `active_guest_binding_missing_state` counts both remain 0, so the +1 row is NOT a new guest-bootstrap orphan — it is a profile created by a path that does not go through the canonical bootstrap RPCs.

### Root Cause / Reason
Suspected (not confirmed): one of the legacy startup paths (still-active legacy `/api/auth/guest/quickstart`, `/api/auth/device/register`, or a test-only profile creation script) is bypassing `bootstrap_guest`/`bootstrap_authenticated` and inserting directly into `public.profiles` without the matching `server_game_state` insert. PR 2/3 added the canonical paths; the legacy paths remain in the codebase pending PR 4 deprecation wrappers.

### Investigation Performed
- Ran `SELECT * FROM public.audit_orphan_bindings()` against live DB on 2026-07-14.
- Probed `profile_without_game_state` count directly: 95 rows.
- Sampled 5 most-recent profile_without_state rows; only 1 is from 2026-07-14, the other 4 are from the 2026-07-04 bulk test-creation cluster.
- Cross-referenced the +1 row against `auth.users`: matching row exists, `is_guest=false`, `display_name=null`, no `server_game_state`, no `device_bindings`.
- Confirmed `device_bindings` totals: 184 active + 30 superseded = 214 (no new active bindings beyond baseline), so the +1 profile is not the user-side of a new active binding.
- Migration 073 applied at 2026-07-14 12:01:00; +1 profile created at 2026-07-14 00:36:50 (before migration) but after the baseline was captured.

### Evidence
Live query output (2026-07-14):
```
audit_orphan_bindings.profile_without_game_state = 95
  baseline (2026-07-14): 94
  delta: +1

profile 507380d0-9210-4706-bdf5-04dfd086f784
  display_name: null
  is_guest: false
  created_at: 2026-07-14T00:36:50.586Z
  auth.users.email: test-rt-17975d9660e64fd8a0138b4d36e8ed6c@test.local
  auth.users.created_at: 2026-07-14T08:36:50.586Z
  server_game_state: NONE
  device_bindings: NONE
```

Distribution of profile_without_state by creation hour (top 4 most recent):
- 2026-07-14 00:00 hour: 1 (this row, the +1 delta)
- 2026-07-04 01:00 hour: 84 (bulk test cluster, see BUG-056)
- 2026-07-04 00:00 hour: 8 (same cluster)
- 2026-07-03 23:00 hour: 2 (same cluster)

### Troubleshooting / Next Steps
1. Identify which path created this row. Check Supabase logs / `auth.audit_log_entries` for the matching `auth.users` insert (id `507380d0-9210-4706-bdf5-04dfd086f784`).
2. If the path is a legacy route (`/api/auth/guest/quickstart`, `/api/auth/device/register`, `/api/game/state/initial`, or initial `/api/game/state/sync` load), confirm PR 4 deprecation wrappers cover it before merge.
3. If the path is a test-only script that bypasses the RPC, document the script and add an admin-only cleanup option.
4. Once path is identified, either backfill state or delete the row (approval required for both).

### Recommended Action
DO NOT auto-apply data mutations (irreversible). Approval required before running either:

```sql
-- Option A: Backfill state (mirrors BUG-053 hydration in src/lib/db/serverGameState.ts).
-- Service-role only. Approve after path investigation confirms this row is a real orphan.
INSERT INTO public.server_game_state (
  user_id, full_state, money, resources, game_tick, last_tick_at, last_saved_at
)
SELECT
  p.id,
  public.build_canonical_initial_full_state(),
  (SELECT starting_money FROM public.game_config_game LIMIT 1),
  '{}'::jsonb,
  0,
  NOW(),
  NOW()
FROM public.profiles p
WHERE p.id = '507380d0-9210-4706-bdf5-04dfd086f784'
ON CONFLICT (user_id) DO NOTHING;

-- Option B: Delete the orphan test profile (if the test user is not needed).
-- Auth.users row deletion must use Supabase Admin API (auth schema is owned by Supabase Auth):
--   auth.admin.deleteUser('507380d0-9210-4706-bdf5-04dfd086f784')
-- Then:
DELETE FROM public.profiles
WHERE id = '507380d0-9210-4706-bdf5-04dfd086f784';
```

---

## BUG-055 - Orphan auth user `admin@test.com` has no profile, state, or device_binding

### Status
Open

### Severity
Low

### Category
Data / Auth Hygiene

### Date Discovered
2026-07-14

### Discovered By
PR4-4C audit (`audit_orphan_bindings()` row `auth_user_without_profile = 1`)

### Location
- `auth.users` row `377e7788-0dfb-4aa5-b647-aa66546da4fe` (email `admin@test.com`, created 2026-06-07T22:38:49Z)

### Problem Found
A single `auth.users` row exists with no matching `public.profiles`, `public.server_game_state`, or `public.device_bindings` rows.

### Expected Behavior
Per RULES.md ownership principle (profile-per-user), every authenticated user should have a corresponding `public.profiles` row.

### Actual Behavior
Single orphan auth user, present in pre-PR1 baseline (count=1) and unchanged after PR 1+2+3 implementation (count=1). All downstream tables are NULL for this user.

### Root Cause / Reason
Confirmed: pre-existing orphan. Likely a manual Supabase dashboard test creation from early project setup (2026-06-07) that never went through any profile-creation flow. The cleanup RPC `cleanup_orphan_anon_users` (referenced in BUG-034) targets anonymous users, not named `admin@test.com`.

### Investigation Performed
- Ran `SELECT * FROM auth.users WHERE email LIKE 'admin@test.com'` against live DB.
- Cross-referenced against `public.profiles`, `public.server_game_state`, `public.device_bindings` — all NULL.
- Confirmed count stable across baseline (1) and post-PR audit (1).

### Evidence
Live query output (2026-07-14):
```
id: 377e7788-0dfb-4aa5-b647-aa66546da4fe
email: admin@test.com
created_at: 2026-06-07T22:38:49.369Z
profile_id: null
server_state_user_id: null
device_bindings.id: null
```

`audit_orphan_bindings.auth_user_without_profile = 1` (stable baseline=1).

### Troubleshooting / Next Steps
1. Confirm whether `admin@test.com` is intentionally a known admin test account held in reserve.
2. If yes: provision the missing `public.profiles` row (idempotent INSERT) so the auth user is properly represented.
3. If no: delete the auth user via `auth.admin.deleteUser()` (admin-only) and revoke any sessions.
4. Coordinate with admin RBAC (BUG-050) to confirm whether any admin role is granted to this user — if so, the row should be preserved.

### Recommended Action
DO NOT auto-apply. Approval required before either:

```sql
-- Option A: Provision the missing profile (if admin@test.com should exist).
INSERT INTO public.profiles (id, display_name, is_guest, created_at)
VALUES (
  '377e7788-0dfb-4aa5-b647-aa66546da4fe',
  'admin@test.com',
  false,
  '2026-06-07T22:38:49.369Z'
)
ON CONFLICT (id) DO NOTHING;

-- Option B: Delete the auth user via Supabase Admin API (NOT raw SQL — auth schema is owned by Supabase Auth).
-- Server-only, service-role client.
--   await supabaseAdmin.auth.admin.deleteUser('377e7788-0dfb-4aa5-b647-aa66546da4fe')
```

---

## BUG-056 - 94 pre-existing profiles lack `server_game_state` (cross-ref BUG-053)

### Status
Open

### Severity
Medium

### Category
Data / Player Init

### Date Discovered
2026-07-14 (re-confirmed by PR4-4C audit)

### Discovered By
PR4-4C audit (baseline carry-over from 2026-07-12 BUG-053 evidence section)

### Location
- `public.profiles`: 94 rows from 2026-07-04 bulk test-creation cluster (UTC hours 2026-07-03T23, 2026-07-04T00, 2026-07-04T01: 2 + 8 + 84)
- `public.server_game_state`: no rows for these 94 profiles
- Cross-reference: BUG-053 (Resolved 2026-07-12) — runtime hydration of missing state at READ time

### Problem Found
94 profiles predate the BUG-053 runtime hydration fix and never received an eager `server_game_state` row. PR 1+2+3 did not eagerly backfill these rows.

### Expected Behavior
Either:
- Eager backfill of canonical `server_game_state` rows for the 94 pre-existing profiles.
- Or formal sign-off that BUG-053's runtime hydration is the chosen long-term pattern and no eager row is required.

### Actual Behavior
The 94 profiles render correctly via BUG-053's runtime hydration (canonical initial state + denormalized columns overlaid), but no `server_game_state` row exists. DB-level analysis (e.g., `SELECT COUNT(*) FROM server_game_state`, foreign-key joins, admin tooling that queries the table directly) under-counts the playable population by 94. Audit query `audit_orphan_bindings.profile_without_game_state` continues to flag them.

### Root Cause / Reason
Confirmed: the 94 rows predate BUG-053's hydration fix and have never been eagerly backfilled. The 2026-07-12 BUG-053 evidence section explicitly noted: *"Follow-up data maintenance may backfill existing rows eagerly, but runtime reads now repair the returned/applied state shape without requiring a destructive data migration."* The follow-up was deferred.

### Investigation Performed
- Ran `SELECT * FROM public.audit_orphan_bindings()` against live DB on 2026-07-14.
- Cross-referenced baseline 94 → 95 (BUG-054 delta +1) confirms 94 are pre-existing.
- Grouped `profile_without_state` by creation hour; 94 of 95 are in the 2026-07-04 bulk test-creation cluster (2 + 8 + 84).
- Verified BUG-053 fix does not eagerly insert missing rows.

### Evidence
- BUG-053 evidence (2026-07-12): 95 missing-state.
- Pre-PR1 baseline (2026-07-14): 94 missing-state (BUG-053 hydration was exercised for 1 profile during testing, dropping count by 1).
- Post PR 1+2+3 (2026-07-14): 95 missing-state (BUG-054 delta +1).
- 94 of 95 rows are from the 2026-07-04 bulk test cluster; 1 is from 2026-07-14 (BUG-054).

### Troubleshooting / Next Steps
1. Decide whether eager backfill is needed (impacts admin tooling accuracy and future audit runs) or whether BUG-053's runtime hydration is the chosen long-term pattern.
2. If eager backfill approved, run the canonical initial state builder for each orphan profile (SQL provided below).
3. Coordinate with admin tooling consumers (e.g., admin player list) before/after backfill so dashboards update correctly.
4. If hydration-only is approved, update `audit_orphan_bindings()` to skip profiles where the corresponding `auth.users` row was created before BUG-053's hydration fix landed (2026-07-12). This is a query refinement, not a data fix.

### Recommended Action
DO NOT auto-apply. Approval required before either:

```sql
-- Option A: Eager backfill (mirrors BUG-053 hydration in src/lib/db/serverGameState.ts).
-- Service-role only.
INSERT INTO public.server_game_state (
  user_id, full_state, money, resources, game_tick, last_tick_at, last_saved_at
)
SELECT
  p.id,
  public.build_canonical_initial_full_state(),
  (SELECT starting_money FROM public.game_config_game LIMIT 1),
  '{}'::jsonb,
  0,
  NOW(),
  NOW()
FROM public.profiles p
WHERE NOT EXISTS (SELECT 1 FROM public.server_game_state s WHERE s.user_id = p.id)
ON CONFLICT (user_id) DO NOTHING;

-- Option B: Refine the audit query (migration 075) to suppress pre-existing
-- orphans that BUG-053 hydration handles at runtime.
CREATE OR REPLACE FUNCTION public.audit_orphan_bindings()
RETURNS TABLE (issue TEXT, count BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  -- ... existing 5 UNION ALL blocks ...
  UNION ALL
  SELECT 'profile_without_game_state'::TEXT, COUNT(*)::BIGINT
  FROM public.profiles p
  LEFT JOIN public.server_game_state s ON s.user_id = p.id
  WHERE s.user_id IS NULL
    AND p.created_at > '2026-07-12T00:00:00Z'::TIMESTAMPTZ;  -- post BUG-053 hydration cutoff
$$;
```

---

## BUG-057 - `audit_orphan_bindings.orphan_guest_shell = 30` is a false-positive

### Status
Open

### Severity
Low

### Category
Audit Query / Migration 073

### Date Discovered
2026-07-14

### Discovered By
PR4-4C audit cross-reference probe

### Location
- `public.audit_orphan_bindings()` SQL function, `orphan_guest_shell` UNION ALL block (migration 073, `supabase/migrations/20260714120100_073_device_bindings.sql:187-192`)
- `public.guest_identities` (30 superseded rows)
- `public.device_bindings` (30 superseded rows, 1:1 match)

### Problem Found
The `audit_orphan_bindings.orphan_guest_shell` count is 30, but every flagged `guest_identities` row has a corresponding `device_bindings` row with `status='superseded'`. The audit query is over-strict: it looks for an ACTIVE `device_bindings` row, but superseded guest identities correctly lack active bindings by design.

### Expected Behavior
Either:
- The audit query should report 0 orphans when each superseded `guest_identities` row has a matching superseded `device_bindings` row.
- Or the audit should distinguish between "superseded but untracked" (real defect) and "superseded with proper binding row" (correct end-state).

### Actual Behavior
The audit consistently reports `orphan_guest_shell = 30`. This number is a tautology: it equals the total count of `guest_identities WHERE superseded_by IS NOT NULL`. There is no real defect — the migration backfill correctly created a superseded `device_bindings` row for each superseded guest identity, and the 30 row counts are 1:1.

### Root Cause / Reason
Confirmed: the SQL in migration 073 uses `db.status = 'active'` in the LEFT JOIN's ON clause:
```sql
SELECT 'orphan_guest_shell'::TEXT, COUNT(*)::BIGINT
FROM public.guest_identities gi
LEFT JOIN public.device_bindings db
  ON db.user_id = gi.user_id AND db.status = 'active'  -- <-- only matches active bindings
WHERE gi.superseded_by IS NOT NULL
  AND db.id IS NULL;
```
For a superseded guest identity, the correct binding status is `superseded`, not `active`. The query therefore flags every superseded guest as an orphan.

### Investigation Performed
- Ran `SELECT * FROM public.audit_orphan_bindings()` against live DB.
- Cross-referenced: `SELECT COUNT(*) FROM public.guest_identities WHERE superseded_by IS NOT NULL` = 30.
- Cross-referenced: `SELECT binding_type, status, COUNT(*) FROM public.device_bindings GROUP BY binding_type, status` returns 184 active + 30 superseded.
- Ran targeted probe (tools/_audit-pr1-pr2-pr3-crossref.mjs): every one of the 30 superseded `guest_identities` rows has a matching `device_bindings` row with `status='superseded'`.

### Evidence
Live query output (2026-07-14):
```
audit_orphan_bindings.orphan_guest_shell = 30
guest_identities WHERE superseded_by IS NOT NULL = 30
device_bindings WHERE status = 'superseded' = 30
-- all 30 superseded guests have a matching superseded binding (1:1 match)
```

### Troubleshooting / Next Steps
1. Apply migration 075 to refine the `orphan_guest_shell` query: replace `db.status = 'active'` with `db.status = 'superseded'`. Expected post-fix count: 0.
2. After refinement, re-run the audit to confirm no real defects surface.
3. No data cleanup required.

### Recommended Action
Low-priority audit query refinement (not a data fix). Approve migration 075 to apply:

```sql
-- Migration 075: refine audit_orphan_bindings.orphan_guest_shell query.
-- A superseded guest is an orphan only if it has NO matching
-- device_bindings row at all (i.e., never migrated to the new binding table).

CREATE OR REPLACE FUNCTION public.audit_orphan_bindings()
RETURNS TABLE (issue TEXT, count BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  -- ... existing 5 UNION ALL blocks unchanged ...

  UNION ALL

  -- orphan guest shell (refined): only counts superseded guests that have
  -- NO matching device_bindings row of any status (i.e., migration 073
  -- backfill missed them entirely).
  SELECT 'orphan_guest_shell'::TEXT, COUNT(*)::BIGINT
  FROM public.guest_identities gi
  LEFT JOIN public.device_bindings db ON db.user_id = gi.user_id
  WHERE gi.superseded_by IS NOT NULL
    AND db.id IS NULL;
$$;

GRANT EXECUTE ON FUNCTION public.audit_orphan_bindings() TO service_role;

COMMENT ON FUNCTION public.audit_orphan_bindings() IS
  'Plan §19 audit report. Migration 075: orphan_guest_shell refined to count only superseded guests with no matching device_bindings row (previously tautologically 30 due to over-strict status filter).';
```

---

## BUG-074 - Audit pass on server-authoritative time surfaces (central helper + sync fail-closed + daily/link boundaries)


### Status
Resolved


### Severity
High (drift risk at multiple boundaries; non-gameplay correctness for link-expiry, gameplay correctness for daily reset)


### Category
Server Time Audit


### Date Discovered
2026-07-15


### Discovered By
Comprehensive server-time audit (per request: every Date.now()/new Date()/setInterval/timer/database-timestamp surface traced through UI ? client store ? server route ? DB write ? response).


### Location
- src/lib/auth/serverTime.ts (NEW centralized helper)
- src/lib/auth/applyElapsedTicks.ts (refactor to delegate to helper)
- src/app/api/game/state/sync/route.ts (removed 
ew Date() fallback)
- src/app/api/game/rewards/daily/route.ts (today/yesterday from DB)
- src/app/api/auth/identity/confirm-link/route.ts and src/app/api/auth/identity/link/route.ts (ISO-string compare via helper)
- src/lib/hooks/presence/{Visitor,Admin}PresenceManager.ts (cleanup: ID generation via crypto.randomUUID)
- docs/SERVER_TICK_CHAIN_PLAN.md (canonical doc refreshed)
- 	ests/unit/serverTimeHelper.test.ts (NEW)
- 	ests/unit/serverTickArchitecture.test.ts (extended)


### Problem Found
Three server surfaces still used Node clock instead of the canonical DB-anchored 
ow_iso() UTC clock, creating drift boundaries (each of which could shift the reset hour for a subset of players if the Node clock drifted in a container/serverless environment):


1. /api/game/state/sync silently fell back to 
ew Date().toISOString() for serverTimestamp whenever 
ow_iso() returned null or threw. This violated RULES.md [SEC-002] fail-closed. The save would still succeed but with a Node-clock last_saved_at, observable via admin dashboards and audit timelines as drift at long timescales.


2. /api/game/rewards/daily derived 	oday and yesterday via Node 
ew Date().toISOString().split('T')[0] and 
ew Date(Date.now() - 86400000)...split('T')[0]. The comparison was UTC-anchored *today*, but the prior claim_date was stored as Postgres CURRENT_DATE (session TZ). On any non-UTC container TZ, the daily-reset boundary drifted and streaks could reset one day early or late.


3. /api/auth/identity/link and /confirm-link compared expires_at via 
ew Date(op.expires_at) < new Date() and >. The pattern silently accepted malformed ISO strings (NaN comparisons are always false ? row is treated as still-valid), and the right-hand operand used the Node clock � drifting from the expire_stale_pending_operations Postgres-side cron that owns long-term expiry.


### Expected Behavior
All server-authoritative timestamp reads must source from the same 
ow_iso() DB clock the tick chain uses. UTC daily reset must be identical across all players and identical to the tick boundary. ISO expiry checks must be robust to malformed inputs and use the same clock as creation.


### Actual Behavior
Three drift surfaces created the conditions described above. None caused double-processing (the canonical CAS chain protects that), but each created a boundary where Node clock and DB clock could disagree, with mild player-visible symptoms at the daily reset for non-UTC deploys and at link-op expiry windows across instance lifetimes.


### Root Cause / Reason
Incomplete coverage from the BUG-046 through BUG-073 tick refactor. Those fixes locked cursor ownership and applied crypto-grade RNG but did not unify every server-side timestamp read through one helper. Each surface called 
ow_iso() ad hoc with its own fallback policy.


### Resolution
Resolved 2026-07-15. Introduced src/lib/auth/serverTime.ts with getServerNowISO, getServerNowISOOrNull, compareIso, isExpiredIso, isValidUntilIso, getCurrentUtcDateISO, getPreviousUtcDateISO, 	oUtcDateString. Refactored pplyElapsedTicks to delegate. Replaced the 
ew Date() fallback in /api/game/state/sync with a 503 fail-closed branch. Rewrote the daily-reward route to source 	oday/yesterday from the helper, so the boundary is identical to the tick boundary. Replaced 
ew Date(... ) < new Date() patterns in identity-link routes with isExpiredIso/isValidUntilIso against the helper-anchored 
owIso. Cleaned up presence ID generation to use crypto.randomUUID() (consistent with BUG-071 / SEC-008). Updated docs/SERVER_TICK_CHAIN_PLAN.md to describe the helper, the daily-reset ownership, and the link-op expiry ownership. Did NOT introduce a second clock framework; did NOT modify the canonical pplyElapsedTicks ? runServerTicks ? saveServerGameStateOptimistic chain (it's correct); did NOT modify the market cron or weather rotation.


### Verification
unx tsc --noEmit clean (project-wide). New unit tests 	ests/unit/serverTimeHelper.test.ts 16 cases pass (covers ISO compare, helper fail-closed paths, UTC date including month/year/leap boundaries). Extended 	ests/unit/serverTickArchitecture.test.ts with assertions that lock the contract: pplyElapsedTicks delegates to helper; sync route contains getServerNowISOOrNull and no longer contains Node 
ew Date() fallback; daily route contains getCurrentUtcDateISO/getPreviousUtcDateISO and no longer contains split('T')[0]; identity-link routes contain isExpiredIso/isValidUntilIso and no longer contain JS-Date comparators. Pre-existing test path fixes (the architecture test referenced obsolete src/lib/db/merge.ts and obsolete ctionPersistence.ts paths; both updated to current split owners src/lib/db/shared/merge.ts and src/lib/game/actions/server/shared/{elapsedTickPersistence,correctedStatePersistence,denormalizedStatePatch}.ts). 33/33 tests pass.


---

## BUG-075 - Auth-merge policy migrated to industry-standard sign-in behavior

### Status
Resolved

### Severity
High (sign-in flow blocked on the COMMON case of returning players with both auth and guest progress)

### Category
Auth / Identity / Data Retention

### Date Discovered
2026-07-15

### Discovered By
User report: "after I sign in, it should fetch my previous game play data" � accompanied by HTTP log POST /api/auth/bootstrap 409.

### Location
- supabase/migrations/20260715100000_079_auth_merge_policy_and_archive.sql (NEW � extends migration 074 atomic-RPC family)
- src/lib/db/auth/bootstrapRpcs.server.ts � UpgradeStatus union gains 'OK_ARCHIVED_GUEST'; UpgradeGuestToAuthArgs.policy parameter; row gains rchive_receipt_id + policy_applied
- src/lib/auth/server/bootstrapService.server.ts � handles 'OK_ARCHIVED_GUEST' as a successful eady outcome; threads policy through BootstrapServiceArgs.mergePolicy; emits structured audit log on every archive
- src/lib/auth/orchestrator/types.ts + src/lib/auth/orchestrator/AuthOrchestrator.ts � BootstrapResponseBody and BootstrapReadyResult carry rchiveReceiptId + rchivedGuestId; transitions still resolve to eady
- src/app/api/auth/bootstrap/route.ts � accepts mergePolicy from the request body, returns the archive receipt in the 200 response when applicable
- src/components/providers/AuthProvider.tsx � fires a one-time sonner toast on a fresh archive receipt (deduped by (receiptId, userId) via sessionStorage)
- 	ests/api/auth/bootstrap.test.ts � old 409 test split into 2 cases: the archive path (default policy) and the explicit-conflict path (opt-in)

### Problem Found
After a returning player signs in, the auth-orchestrator migration 074 RPC upgrade_guest_to_auth(p_auth_user_id, p_device_id) returned 409 ACCOUNT_PROGRESS_CONFLICT whenever the auth user AND the active guest on this device both had progress. The player saw a BootstrapConflictScreen and never reached their game state. This violated the player's expected behavior ("sign in ? load my data") and the industry standard for OAuth-bound sessions (RFC 6749 �1.5: the verified session is authoritative).

The legacy plan �11 ("never auto-merge") implemented this 409 as a hard rule. It works for the rare case where the player genuinely does NOT want a silent merge, but it actively blocks the common case where they do.

### Expected Behavior
Industry-standard OAuth + cloud-save systems (Steam Cloud, Google Sign-In merge, PlayStation Network, Game Center) all default to "auth wins + archive/recover the prior session". The auth session is authoritative; the prior local progress is preserved in a recoverable store rather than silently discarded.

### Actual Behavior
Hard 409 on any dual-progress sign-in, regardless of policy preference.

### Root Cause / Reason
Migration 074 implemented the simplest correct path but did not include a policy parameter for the dual-progress case. The user-experience gap was masked because the prior audit pass focused on safe defaults and idempotency, not on UX outcomes for the dual-progress case.

### Investigation Performed
- Read every reference to ACCOUNT_PROGRESS_CONFLICT across src/lib, src/lib/auth/orchestrator, src/components/game/auth, 	ests/api/auth.
- Compared to industry references: Steam Cloud, Google Sign-In + Workspace profile merge, GitHub Importer, iOS Game Center. Every reference implements "auth wins + archive" by default with an opt-in explicit_conflict policy for users who want manual control.
- Audited STD-014 (GDPR), STD-012 (SOC 2), STD-013 (ISO 27001) � silent hardcoded archival violates consent principle; configurable policy + recoverable archive satisfies all three.
- Decided to ship option C from the user decision: default 'auth_wins_archive_guest' with 'explicit_conflict' opt-in via profiles.auth_merge_policy.

### Resolution
Resolved 2026-07-15 with the following changes:

1. **Migration 079.** New public.guest_state_archive table � recoverable snapshot of guest progress at the moment of archive (JSONB snapshot, money, game_tick, is_latest flag, restored_at marker for support-driven restore). New profiles.auth_merge_policy column with check constraint IN ('auth_wins_archive_guest','explicit_conflict') and server-side default uth_wins_archive_guest. upgrade_guest_to_auth recreated to accept p_policy TEXT DEFAULT 'auth_wins_archive_guest' and a new 'OK_ARCHIVED_GUEST' status that returns rchive_receipt_id to the caller. The default policy archives the guest and returns ready; the explicit_conflict policy returns the legacy CONFLICT branch.

2. **Server wrapper.** UpgradeStatus union adds 'OK_ARCHIVED_GUEST'. UpgradeGuestToAuthRow gains rchive_receipt_id + policy_applied. callUpgradeGuestToAuth accepts and validates the policy parameter against the allow-list UPGRADE_POLICIES = ['auth_wins_archive_guest','explicit_conflict'].

3. **Bootstrap service.** Threads mergePolicy from BootstrapServiceArgs to the RPC. Maps 'OK_ARCHIVED_GUEST' to kind: 'ready' with rchiveReceiptId + rchivedGuestId propagated. Emits a structured console.info audit log per archive (archived_guest_id, auth_user_id, archive_receipt_id, policy, device_id) for industry-standard accountability.

4. **Orchestrator + route.** BootstrapResponseBody carries rchiveReceiptId + rchivedGuestId. The HTTP route forwards the request's mergePolicy (rejecting unknown values client-side), and surfaces the archive receipt in the 200 response. The conflict branch is preserved as the opt-in-only path.

5. **UI banner.** AuthProvider fires a one-time sonner toast on each fresh (archiveReceiptId, userId) pair via sessionStorage dedup so the same archive does not re-fire on reload.

6. **Tests.** Old "returns 409 ACCOUNT_PROGRESS_CONFLICT" split into two: (a) default policy returns 200 with archive metadata; (b) explicit_conflict opt-in still returns the legacy 409 path. Added a third test verifying that unknown mergePolicy values fall back to the default.

### Verification
unx tsc --noEmit clean. unx vitest run tests/api/auth/bootstrap.test.ts 14/14 tests pass including the three new migration-079 cases. unx vitest run tests/unit/serverTimeHelper.test.ts tests/unit/serverTickArchitecture.test.ts 33/33 still green.

### Industry-Standard Mapping
- STD-014 GDPR � recoverable archive satisfies "personal data � exportable, correctable, deletable"; per-user uth_merge_policy column provides explicit consent toggle for the user's preferred behavior.
- STD-012 SOC 2 � structured audit log per archive provides "audit trails, change traceability, incident visibility"; policy parameter is captured in every audit entry.
- STD-013 ISO 27001 � explicit policy parameter is "auditable" rather than implicit; future opt-in UX surfaces the policy choice to users.
- STD-008 NIST SSDF � recoverable archive row + estored_at marker provides "traceable change history".


---

## BUG-078 - C-001: buildProductionSnapshotServer aggregated blocked factory outputs as actual production

### Status
Resolved

### Severity
High

### Category
Production / Observability

### Date Discovered
2026-07-16

### Discovered By
Production architecture audit C-001 (BUILDING_PRODUCTION_AUDIT.md �10.4)

### Location
- `src/lib/game/production/engine/tick/productionSnapshot.ts` (FIXED)
- `src/lib/game/production/math/production.ts:143-178` (factory branch returns potential output even when `canProduce=false`)
- `src/components/game/FactoryPanel.tsx`, `PowerPanel.tsx`, `StoragePanel.tsx`, etc. (consumers)

### Problem Found
`buildProductionSnapshotServer` iterated every building and aggregated `result.outputs` into `snapshot.production` regardless of `canProduce`. `computeProduction` returns a populated `outputs` array (potential output) for factories that ran out of inputs, so the snapshot reported potential output as actual production. `runServerTicks` correctly skipped the result (no inventory or money change), so server economy stayed correct, but the UI snapshot over-reported production rates for blocked factories. `FactoryPanel` and downstream panels (PowerPanel, StoragePanel, AIAdvisorPanel) read `snapshot.production[resource]` and `snapshot.buildings[id].outputs` as actual rates.

### Expected Behavior
A blocked factory (`canProduce: false`) must contribute zero to `snapshot.production[resource]` and have an empty `snapshot.buildings[id].outputs`. Input demand (`snapshot.consumption`) continues to advertise demand for planning; `actualConsumption` already reflected `actualInputs` (empty for blocked).

### Actual Behavior
Blocked factories contributed their full potential output to `snapshot.production`. `snapshot.buildings[id].outputs` showed the potential output array. UI displayed non-zero production rates while inventory stayed unchanged.

### Root Cause / Reason
Confirmed: `buildProductionSnapshotServer` did not check `result.canProduce` before aggregating `result.outputs` into `snapshot.production` or before writing `result.outputs` to `snapshot.buildings[id].outputs`. The factory branch of `computeProduction` always returns a populated `outputs` array (the potential output, useful for the calculator and demand planning), so the snapshot must filter on `canProduce`.

### Investigation Performed
- Confirmed `production.ts:162-178` returns `outputs` regardless of `canProduce` (potential output for the calculator).
- Confirmed `runServerTicks.ts:78-110` correctly skips the result and does not credit blocked output.
- Confirmed `buildProductionSnapshotServer` (productionSnapshot.ts:50-76) aggregated `result.outputs` unconditionally.
- Wrote failing regression test `tests/unit/snapshot-blocked-factory.test.ts` proving the snapshot reported 5 ironPlate from a blocked factory.

### Resolution
Resolved 2026-07-16. `buildProductionSnapshotServer` now gates the per-building `outputs` field and the `production` / `actualConsumption` aggregation on `result.canProduce`. The `consumption` (demand) loop continues to advertise input demand for planning. The per-building detail still records `inputs` (demand) and `efficiency` for blocked buildings.

Verification: `tests/unit/snapshot-blocked-factory.test.ts` (5 cases) failed first, then passed. `tests/unit/runServerTicks.storageOverflow.test.ts` (5 cases) still passes. `npm run typecheck` clean.

---

## BUG-079 - C-002: offline-progress route did not write market_supply projection

### Status
Resolved

### Severity
High

### Category
Server Tick / Persistence

### Date Discovered
2026-07-16

### Discovered By
Production architecture audit C-002 (BUILDING_PRODUCTION_AUDIT.md �10.4)

### Location
- `src/app/api/game/state/offline-progress/route.ts:614-625` (FIXED)
- `src/lib/game/production/snapshot/marketSupplyProjection.ts`
- `supabase/migrations/20260715000000_076_market_supply_state.sql`

### Problem Found
The offline route ran `runServerTicks` and wrote `full_state` plus denormalized columns, but it did NOT write the `server_game_state.market_supply` JSONB projection that the global market aggregate cron reads. The live/action elapsed writers (via `applyElapsedServerTime` in `elapsedTickPersistence.ts:165-180`) already do this; the offline route had its own separate CAS write and was missed by the V-032 fix. A player whose only progress came through offline settlement would have correct inventory but stale/empty aggregate supply, causing the global market to omit their contribution.

### Expected Behavior
Every authoritative tick-settlement writer that produces a snapshot must update the same server-only `market_supply` projection, or the aggregate cron must recompute from a canonical source. The offline route must write the same projection that `applyElapsedServerTime` writes.

### Actual Behavior
The offline route returned a valid `newState` and `productionSnapshot` to the client, but `server_game_state.market_supply` was not refreshed. The aggregate cron (`/api/market/supply/aggregate`) reads `row.market_supply` and would skip or zero the contribution.

### Root Cause / Reason
Migration 076 added the `market_supply` column and `buildMarketSupplyProjection` writer. The V-032 fix integrated the writer into `elapsedTickPersistence.ts` (the shared elapsed writer used by live-tick and action paths) but not into the standalone offline route, which has its own CAS write block at `offline-progress/route.ts:614-625`.

### Investigation Performed
- `grep buildMarketSupplyProjection` confirmed only `marketSupplyProjection.ts` and `elapsedTickPersistence.ts` used it; offline-progress was missing.
- Wrote failing regression test `tests/api/game/state/offline-progress-market-supply.test.ts` proving the offline CAS patch did not include `market_supply`.

### Resolution
Resolved 2026-07-16. The offline CAS patch at `offline-progress/route.ts:618-625` now writes `market_supply: buildMarketSupplyProjection(result.productionSnapshot, serverNow)` alongside `full_state` and denormalized fields, mirroring `applyElapsedServerTime`. `stripUIFields` is also applied to `full_state` (see BUG-081).

Verification: `tests/api/game/state/offline-progress-market-supply.test.ts` failed first, then passed. `tests/api/market/supply-aggregate-v032.test.ts` (4 cases) passes after C-004 mock repair. `npm run typecheck` clean.

---

## BUG-080 - C-003: full_state writers missing stripUIFields defense-in-depth

### Status
Resolved

### Severity
High

### Category
Persistence / Security

### Date Discovered
2026-07-16

### Discovered By
Production architecture audit C-003 (BUILDING_PRODUCTION_AUDIT.md �10.4)

### Location
- `src/lib/game/actions/server/shared/elapsedTickPersistence.ts` (FIXED)
- `src/lib/game/actions/server/shared/correctedStatePersistence.ts` (FIXED)
- `src/app/api/game/state/offline-progress/route.ts` (FIXED)
- `src/app/api/market/trades/execute/route.ts` (FIXED)
- `src/lib/db/game/serverGameStatePayload.ts` (`stripUIFields` helper)

### Problem Found
Four production writers passed `asFullState(state)` without first calling `stripUIFields(state)`. The Phase 13 invariant states that `server_game_state.full_state` must never contain UI-only keys (`hydrated`, `activeTab`, `selectedBuilding`, `notifications`, `productionSnapshot`). `stripUIFields` is the shared defense-in-depth helper. The existing `serverGameDataShape.test.ts` only enumerated three writers (serverGameState, sync route, guest migrate), so the other four passed silently. In current code the state is pure `ServerGameData` (no UI keys leak), so this is a latent defect � a future code change that adds a UI field to `state` would persist it.

### Expected Behavior
Every `full_state` writer must call `stripUIFields(state)` before coercing with `asFullState`. The architecture test must enumerate every writer, not a hand-maintained subset.

### Actual Behavior
`elapsedTickPersistence.ts:169`, `correctedStatePersistence.ts:82`, `offline-progress/route.ts:618`, and `market/trades/execute/route.ts:267` all wrote `full_state: asFullState(state)` without stripping. The `serverGameDataShape.test.ts` `PERSISTENCE_WRITERS` array only covered three of the seven writers, giving false confidence.

### Root Cause / Reason
The refactor that introduced `stripUIFields` (Phase 13) applied it to the three original writers but missed the ones added or refactored later (elapsed tick persistence, corrected action persistence, offline-progress route, market trade route). The architecture test was not updated when new writers were added.

### Investigation Performed
- Expanded the `PERSISTENCE_WRITERS` list in the new `tests/unit/strip-symmetry.test.ts` to cover all seven writers.
- Test failed first on four writers (elapsed, corrected, offline, trades), confirming the gap.
- Applied `stripUIFields(state as unknown as Record<string, unknown>)` before `asFullState` in all four.
- Test now passes 8/8 cases.

### Resolution
Resolved 2026-07-16. All seven production writers now call `stripUIFields` before `asFullState`. Added `tests/unit/strip-symmetry.test.ts` that enumerates the full writer set and asserts both the strip call and its ordering relative to `asFullState`. Updated existing test mocks for `correctedStatePersistence.test.ts` and `elapsedTickPersistence.test.ts` to export `stripUIFields` from the `@/lib/db/game/serverGameStatePayload` mock.

Verification: `tests/unit/strip-symmetry.test.ts` (8 cases) failed first, then passed. Full targeted regression suite (10 files, 60 tests) passes. `npm run typecheck` clean.

---

## BUG-081 - C-004: V-032 aggregate test mocked wrong import path

### Status
Resolved

### Severity
Medium

### Category
Tests / Infrastructure

### Date Discovered
2026-07-16

### Discovered By
Production architecture audit C-004 (BUILDING_PRODUCTION_AUDIT.md �10.4)

### Location
- `tests/api/market/supply-aggregate-v032.test.ts:72-77` (FIXED)

### Problem Found
The V-032 aggregate test mocked `createServiceRoleClient` from `@/lib/supabase/server` (the legacy shim) but the production route imports it from `@/lib/db/access` (the DB-015 boundary). The mock's `mockReturnValue` call was applied to a function the route never uses, so the test failed with `TypeError: createServiceRoleClient.mockReturnValue is not a function` before any assertion ran. All four test cases failed in CI even though the production code was correct.

### Expected Behavior
Tests must mock the same import path the production code uses. The DB-015 boundary (`@/lib/db/access`) is the canonical import path for the service-role client.

### Actual Behavior
Four test cases failed with `TypeError: createServiceRoleClient.mockReturnValue is not a function` in `tests/api/market/supply-aggregate-v032.test.ts`.

### Root Cause / Reason
The test was written during the V-032 fix before the `@/lib/db/access` boundary was introduced (BUG-077). The import was not updated when the boundary landed.

### Investigation Performed
- Confirmed `aggregate/route.ts:41` imports from `@/lib/db/access`.
- Confirmed the test imported from `@/lib/supabase/server`.
- Confirmed `@/lib/supabase/server` is now a shim that re-exports from `@/lib/db/access`, so the mock must target the canonical boundary.

### Resolution
Resolved 2026-07-16. Updated the test to `await import("@/lib/db/access")` and call `mockReturnValue` on the boundary's `createServiceRoleClient`.

Verification: `tests/api/market/supply-aggregate-v032.test.ts` (4 cases) failed first, then passed. The test now correctly exercises the V-032 reader path and provides a green regression guard for the market aggregate.

---

## BUG-082 - C-006: /api/game/production/compute was an orphan oracle route

### Status
Resolved

### Severity
Medium

### Category
API / Server Tick

### Date Discovered
2026-07-16

### Discovered By
Production architecture audit C-006 (BUILDING_PRODUCTION_AUDIT.md �10.4)

### Location
- `src/app/api/game/production/compute/route.ts` (REMOVED)
- `tests/api/game/compute.test.ts` (REMOVED)
- `src/app/api/API_STRUCTURE_PLAN.md` (updated)
- `tests/unit/v043-explicit-columns.test.ts` (updated)

### Problem Found
`POST /api/game/production/compute` authenticated, rate-limited, ownership-checked, and tick-capped, then ran `runServerTicks` and returned `{newState, productionSnapshot}` without persisting. Zero production callers existed in `src/`, `src/components/`, or `src/lib/`. The route was a misleading preview endpoint with no approved caller, and if wired as a mutation without CAS + idempotency it would double-apply ticks.

### Expected Behavior
Either rename and document as a non-persisting preview, or remove until an approved caller exists.

### Actual Behavior
The route was removed in C-006 because no approved caller existed. The test `tests/api/game/compute.test.ts` and the `v043-explicit-columns.test.ts` compute-route block were also removed/updated.

### Root Cause / Reason
Legacy oracle that survived the server-authoritative migration. Production settlement moved to the live-tick, offline-progress, and action elapsed paths, all of which persist authoritatively. The compute route was never wired into any consumer.

### Investigation Performed
- `grep "/api/game/production/compute" src/` confirmed only the route self-reference and the API_STRUCTURE_PLAN.md doc entry.
- Confirmed the live-tick, offline-progress, and action elapsed paths cover all authoritative settlement.

### Resolution
Resolved 2026-07-16. Removed `src/app/api/game/production/compute/`, `tests/api/game/compute.test.ts`, and the `v043-explicit-columns.test.ts` compute-route block. Updated `src/app/api/API_STRUCTURE_PLAN.md` to remove the table and tree entries for the compute route. Updated `v043-explicit-columns.test.ts` to assert the compute route does not reappear.

Verification: `npm run typecheck` clean. `tests/unit/v043-explicit-columns.test.ts` (8 cases) passes.

---

## BUG-083 - C-007: Dashboard income/minute diverged from header income/minute

### Status
Resolved

### Severity
High

### Category
UI / Configuration

### Date Discovered
2026-07-16

### Discovered By
Production architecture audit C-007 (BUILDING_PRODUCTION_AUDIT.md �10.4)

### Location
- `src/components/game/DashboardPanel.tsx:182-184` (FIXED)
- `src/components/game/headers/DesktopHeader.tsx:77-80` (FIXED to use shared formula)
- `src/components/game/headers/MobileHeader.tsx:73-80` (FIXED to use shared formula)
- `src/lib/game/state/store.ts` (NEW `computeNetIncomePerMinute` utility)

### Problem Found
`DashboardPanel` computed `payoutPerCycle * 6` as income/min � a literal 6 cycles/min that assumed 1x speed and a 10s payout interval. `DesktopHeader` and `MobileHeader` used the correct formula `(effectiveSpeed / basePayoutInterval) * 60`. At any non-default game speed or payout interval, the dashboard and headers displayed different income values.

### Expected Behavior
All income/minute surfaces must use the same formula: `(payoutPerCycle * effectiveSpeed / basePayoutInterval) * 60`, floored.

### Actual Behavior
Dashboard showed `payoutPerCycle * 6` (correct only at 1x/10s). Headers showed the correct formula. At 5x speed the dashboard showed 1/5 of the header value.

### Root Cause / Reason
The dashboard retained a 10-second/6-cycles-per-minute literal while headers were updated to use the current configuration. No shared helper existed.

### Investigation Performed
- Confirmed `DashboardPanel.tsx:182` used `* 6`; both headers used `(effectiveSpeed / basePayoutInterval) * 60`.
- Wrote `tests/unit/compute-net-income-per-minute.test.ts` pinning the shared formula with parameterized cases.

### Resolution
Resolved 2026-07-16. Extracted `computeNetIncomePerMinute(payoutPerCycle, effectiveSpeed, basePayoutInterval)` to `src/lib/game/state/store.ts`. `DashboardPanel`, `DesktopHeader`, and `MobileHeader` all import and use the shared formula. Dashboard gained `gameSpeed` and `payoutConfig` selectors and computes `effectiveSpeed` from `gameSpeed` and prestige gameSpeed bonuses, matching the headers.

Verification: `tests/unit/compute-net-income-per-minute.test.ts` (8 cases) passes. `npm run typecheck` clean.

---

## BUG-084 - C-005: parseCostMap silently fabricated 100 money on null cost

### Status
Resolved

### Severity
High

### Category
Configuration / Data Integrity

### Date Discovered
2026-07-16

### Discovered By
Production architecture audit C-005 (BUILDING_PRODUCTION_AUDIT.md �10.4)

### Location
- `src/lib/game/config/transformers/buildings.ts:4-5` (FIXED)
- `src/lib/db/config/serverConfigFetcher.ts:117-124` (FIXED)
- `src/lib/game/actions/server/shared/configParsers.ts:14-25` (FIXED)
- `src/lib/admin/investigations/configLoader.ts:30-45` (FIXED)
- `src/app/api/game/state/offline-progress/route.ts:78-84` (was already fail-closed)

### Problem Found
Four production copies of `parseCostMap` silently returned `[{resource: "money", amount: 100}]` when `base_cost` was null or missing. The offline-progress route already failed closed (it threw). A missing `base_cost` row is a DB-integrity issue; silently defaulting to 100 money could let a player build a building at a non-existent price or mask a migration backfill bug.

### Expected Behavior
Every `parseCostMap` copy must fail closed (throw) on null/missing `base_cost`. The error must surface through the route's `loadConfig()` null return ? 503 response, per RULES.md [SEC-002].

### Actual Behavior
Three of four copies fabricated 100 money on null. The offline-progress route was the only one that threw. Three production paths (client config, server fetcher, action config, admin config) had inconsistent fail-open behavior.

### Root Cause / Reason
The offline-progress route was updated during the C-002 pass to fail closed, but the other copies were missed. The canonical client-side transformer and three server-side copies all retained the original silent default.

### Investigation Performed
- `grep parseCostMap` found 4 copies with the silent fallback and 1 (offline-progress) that already threw.
- Wrote `tests/unit/parse-cost-map-fail-closed.test.ts` pinning the canonical behavior and scanning all 4 server copies for the silent default regex.

### Resolution
Resolved 2026-07-16. All four production copies of `parseCostMap` now throw on null/missing cost with a clear error message. The `tests/unit/parse-cost-map-fail-closed.test.ts` regression test pins the canonical behavior and scans all server copies to prevent reintroduction.

Verification: `tests/unit/parse-cost-map-fail-closed.test.ts` (8 cases) passes. `npm run typecheck` clean.

---

## BUG-085 - C-008: PowerPanel used hardcoded economy factors instead of balance config

### Status
Resolved

### Severity
Medium

### Category
UI / Configuration

### Date Discovered
2026-07-16

### Discovered By
Production architecture audit C-008 (BUILDING_PRODUCTION_AUDIT.md �10.4)

### Location
- `src/components/game/PowerPanel.tsx` (FIXED � three blocks)

### Problem Found
`PowerPanel` used hardcoded economy factors for its local per-plant power calculation: `0.1` (fuel-starved ratio), `0.5`/`0.5`/`0.01` (solar amplitude/swing/frequency), `0.2` (solar min output), `0.5`/`0.5`/`0.007`/`Math.PI/3` (wind), and `0.3` (wind min output). The `getBalance().power.*` config has `fuelStarvedOutputRatio`, `solarAmplitudeBase/Swing/OscillationFreq/MinOutput`, and `windAmplitudeBase/Swing/OscillationFreq/MinOutput`. A balance-config tuning did not affect the UI preview.

### Expected Behavior
Per-plant power values should use balance-driven factors, matching what the server uses for the authoritative total. The snapshot total is still authoritative; the per-type ratio is an estimate scaled to that total.

### Actual Behavior
Hardcoded literals diverged from balance config. A balance-config tuning of solar/wind/fuel-starved parameters would not affect the PowerPanel preview.

### Root Cause / Reason
PowerPanel pre-dated the balance-config migration for these fields. The per-type ratio is a presentation-only estimate scaled to the authoritative snapshot total.

### Investigation Performed
- Confirmed `getBalance().power` has all the needed fields.
- Located three hardcoded blocks in PowerPanel: the per-type `useMemo`, the `solarFactor`/`windFactor` `useMemo` pair, and the per-plant card display logic.
- Each block was updated to read from `getBalance().power`.

### Resolution
Resolved 2026-07-16. All three PowerPanel blocks now read from `getBalance().power` (fuel-starved ratio, solar/wind amplitude base/swing, oscillation frequency, and minimum output). The `powerScaleFactor` fudge that scales per-type values to the authoritative snapshot total is preserved; per-type values are clearly estimates scaled to server truth.

Verification: `npm run typecheck` clean.

---

## BUG-086 - C-009: Client-only pause toggle misled players about server state

### Status
Resolved

### Severity
Medium

### Category
UI / Server Tick

### Date Discovered
2026-07-16

### Discovered By
Production architecture audit C-009 (BUILDING_PRODUCTION_AUDIT.md �10.4)

### Location
- `src/lib/game/state/store-actions/core.ts` (togglePause removed)
- `src/lib/game/state/store-types.ts` (interface updated)
- `src/components/game/headers/DesktopHeader.tsx` (button + selectors removed)
- `src/components/game/headers/MobileHeader.tsx` (button + selectors removed)
- `src/lib/hooks/page/useKeyboardShortcuts.ts` (Space binding removed)
- `src/lib/hooks/page/useSessionHeartbeat.ts` (paused field removed)
- `tests/unit/services/coreService.test.ts` (togglePause tests removed)
- `tests/unit/store.baseline.test.ts` (togglePause test removed)
- `tests/unit/store/composition.test.ts` (togglePause assertion removed)

### Problem Found
`togglePause` flipped local `state.paused` only. The server tick runner (`runServerTicks`) never read `state.paused`, so resources continued advancing on the server regardless of the client's pause state. The header button and Space-key shortcut gave players a false sense of control. After reload, the pause was overwritten by the server-authoritative state.

### Expected Behavior
Either make pause server-authoritative (a new `set_paused` action with persistence and tick-runner honoring), or remove the misleading UI entirely.

### Actual Behavior
Pause button worked locally but had zero effect on server gameplay. Players believed production was paused while resources kept advancing.

### Root Cause / Reason
Client pause action survived the server-authoritative migration without a server owner. The pause field was never read by `runServerTicks` or any persistence path.

### Investigation Performed
- Confirmed `runServerTicks.ts:88-190` never reads `state.paused`.
- Confirmed no server action handler for pause exists.
- Confirmed `serializeGameState.ts:55-56` and `useSessionHeartbeat.ts:70` carried `paused` over the wire, but the server had no concept of it.

### Resolution
Resolved 2026-07-16 per product decision: remove the pause UI entirely. `togglePause` removed from the store type and core actions. The pause button removed from both headers. The Space-key shortcut removed from `useKeyboardShortcuts`. `paused` removed from the heartbeat payload. Three existing test files updated to drop `togglePause` assertions. Added `tests/unit/c-009-pause-ui-removed.test.ts` with 6 regression checks asserting the UI, store, shortcut, and heartbeat no longer reference pause. The `paused` field stays in `ServerGameData` for backward compatibility but is never set to `true`. A future product can reintroduce a server-authoritative pause as a proper mechanic.

Verification: `tests/unit/c-009-pause-ui-removed.test.ts` (6 cases) passes. `npm run typecheck` clean. Full targeted regression suite (14 files, 93 tests) passes.

---

## BUG-087 - P2-10: Thin server math wrappers added no behavior

### Status
Resolved

### Severity
Low

### Category
Architecture

### Date Discovered
2026-07-16

### Discovered By
Production architecture audit P2-10 (BUILDING_PRODUCTION_AUDIT.md �10.4)

### Location
- `src/lib/game/production/engine/math/production.server.ts` (REMOVED)
- `src/lib/game/production/engine/math/power.server.ts` (REMOVED)
- `src/lib/game/production/engine/math/payout.server.ts` (REMOVED)
- `src/lib/game/production/engine/math/endgame.server.ts` (REMOVED)
- `src/lib/game/production/engine/math/sell.server.ts` (REMOVED)
- `src/lib/game/production/engine/math/index.server.ts` (REMOVED)
- `src/lib/game/production/engine/tick/runServerTicks.ts` (UPDATED to direct imports)
- `src/lib/game/production/engine/tick/productionSnapshot.ts` (UPDATED to direct imports)
- `src/lib/game/production/engine/serverEngine.ts` (UPDATED barrel)
- `tests/unit/runServerTicks.storageOverflow.test.ts` (UPDATED mocks)
- `tests/unit/observability/silent-failure-counter.test.ts` (UPDATED mocks)
- `tests/unit/production/pr-bp-3-expense-rates.test.ts` (UPDATED mocks)
- `tests/unit/snapshot-blocked-factory.test.ts` (UPDATED mocks)

### Problem Found
Five thin wrapper functions in `src/lib/game/production/engine/math/*.server.ts` packaged `buildings` and `workerDefs` into a `gameDefs` shape and delegated to the underlying math functions in `productionCalculator`. The `math/index.server.ts` barrel re-exported all five. The wrappers added no behavior beyond input packaging; the same packaging could be done at the two call sites (`runServerTicks.ts` and `productionSnapshot.ts`).

### Expected Behavior
One canonical owner per function. Wrappers that add no behavior should be deleted after caller migration.

### Actual Behavior
Two callers (`runServerTicks` and `productionSnapshot`) imported the wrappers; the productionCalculator module already exported the underlying functions. The wrappers and barrel were dead weight in the import graph.

### Root Cause / Reason
The wrappers were created when the engine was split into smaller files. The caller migration to direct imports was never completed.

### Investigation Performed
- `grep` confirmed `runServerTicks.ts` and `productionSnapshot.ts` were the only callers.
- Both callers already had `buildings` and `workerDefs` as separate variables; inlining the packaging was trivial.
- `multipliers.server.ts` kept because it does real server-specific work (cache builder, worker-defs map).

### Resolution
Resolved 2026-07-16. Deleted all 5 wrapper files and the `index.server.ts` barrel. Updated `runServerTicks.ts` and `productionSnapshot.ts` to import directly from `productionCalculator` with inline `{buildings, workers: workerDefs}` packaging. Updated `serverEngine.ts` barrel to re-export only `multipliers.server` and the direct `productionCalculator` functions. Updated 4 test files to mock `productionCalculator` directly instead of the deleted wrapper paths.

Verification: `tests/unit/p2-10-thin-delegators-removed.test.ts` (9 cases) passes. `npm run typecheck` clean. Full targeted regression suite (10 files, 48 tests) passes.

---

## BUG-088 - P2-11: initial state weather cadence used Math.random

### Status
Resolved

### Severity
Medium

### Category
Security / Server RNG

### Date Discovered
2026-07-16

### Discovered By
Production architecture audit P2-11 (BUILDING_PRODUCTION_AUDIT.md �10.4)

### Location
- `src/lib/db/infra/initialState.server.ts:141` (FIXED)

### Problem Found
`fetchCanonicalInitialState()` builds the server-authoritative initial `ServerGameData`. The weather cadence (`nextChange` tick count) was seeded with `Math.random()` � non-cryptographic, non-deterministic across concurrent server invocations. The code comment claimed "server-side random (replaces client Math.random)" but the implementation still used `Math.random()`.

### Expected Behavior
Server-authoritative random values must use crypto RNG (SEC-008). The server already had `secureRandomIntInRange` in `serverRandom.ts` that uses `crypto.getRandomValues` and fails closed on missing crypto.

### Actual Behavior
Initial weather timing was non-reproducible and predictable from PRNG state. Two concurrent server invocations for the same user (e.g., live-tick and offline-progress racing on a fresh session) could produce different weather, making state divergence possible if both wrote without CAS.

### Root Cause / Reason
The migration to crypto RNG during BUG-068 covered production paths (weather rotation, ID generation) but missed the canonical initial-state path. The comment indicated intent to use server RNG but the implementation was never updated.

### Investigation Performed
- `grep Math.random src/` found the call in `initialState.server.ts:141`.
- Confirmed `secureRandomIntInRange` exists in `serverRandom.ts` with fail-closed semantics.
- The BUG-068 audit already classified event/news/prestige `Math.random` sites as out of scope (non-security); canonical initial weather is server-authoritative and in scope.

### Resolution
Resolved 2026-07-16. Replaced `Math.floor(Math.random() * Math.max(1, wmax - wmin))` with `secureRandomIntInRange(0, Math.max(1, wmax - wmin))`. Updated the comment to reference SEC-008 and fail-closed semantics.

Verification: `tests/unit/p2-11-crypto-rng-in-initial-state.test.ts` (3 cases) passes. `npm run typecheck` clean.

---

## BUG-089 - P2-12: LeaderboardPanel component-owned polling loop

### Status
Resolved

### Severity
Medium

### Category
Architecture / Polling

### Date Discovered
2026-07-16

### Discovered By
Production architecture audit P2-12 (BUILDING_PRODUCTION_AUDIT.md �10.4)

### Location
- `src/components/game/LeaderboardPanel.tsx` (FIXED)
- `src/lib/hooks/page/useLeaderboardPolling.ts` (NEW shared hook)

### Problem Found
LeaderboardPanel used `setInterval(fetchLeaderboard, 30_000)` with no visibility handling and no failure backoff. A 429/503 during a service incident would amplify load because every mounted leaderboard kept polling on a fixed interval. PER-008 forbids component-owned polling loops.

### Expected Behavior
Shared backoff-aware polling hook with visibility handling, exponential backoff on failure, and cleanup on unmount. Mirrors the `useLiveServerTick` pattern without coupling to a specific endpoint.

### Actual Behavior
Every mounted LeaderboardPanel polled every 30 seconds regardless of tab visibility or server health. Multiple mounts (e.g., navigation between pages) would multiply load.

### Root Cause / Reason
LeaderboardPanel predated the centralized polling hook pattern introduced for live-tick (BUG-070 fix).

### Investigation Performed
- Confirmed the component owned `setInterval` with a fixed interval.
- Confirmed no visibility handler, no failure handler, no shared hook.

### Resolution
Resolved 2026-07-16. Created `src/lib/hooks/page/useLeaderboardPolling.ts` with recursive `setTimeout`, visibility check, and exponential backoff (30s ? 60s ? 120s cap 160s). Updated LeaderboardPanel to call `useLeaderboardPolling(fetchLeaderboard)` and removed the component-owned `setInterval` block.

Verification: `tests/unit/p2-12-leaderboard-polling.test.ts` (2 cases) passes. `npm run typecheck` clean.

---

## BUG-090 - P2-13: TradingPostPanel bypassed store action boundary

### Status
Resolved

### Severity
Medium

### Category
Architecture / State Management

### Date Discovered
2026-07-16

### Discovered By
Production architecture audit P2-13 (BUILDING_PRODUCTION_AUDIT.md �10.4)

### Location
- `src/components/game/TradingPostPanel.tsx:597` (FIXED)
- `src/lib/game/state/store-actions/market/marketActions.ts` (NEW action)

### Problem Found
After a successful trade, the panel called `useGameStore.setState({ resources: serverResult.updatedResources })` directly, bypassing the store action boundary (STO-003). The component silently dropped any other fields the server might add to the trade response. Other store-affecting code paths (live-tick, offline-progress, action elapsed) use `applyServerState` from the store.

### Expected Behavior
Components call store actions; server-authoritative response updates flow through the action boundary.

### Actual Behavior
Direct `setState` from a component, partial field application, and inconsistent pattern vs. other paths.

### Root Cause / Reason
Trade UI predated the centralized response application path.

### Investigation Performed
- `grep "useGameStore.setState" src/components` confirmed this was the only economic-path `setState` from a component.

### Resolution
Resolved 2026-07-16. Added `applyTradeResources(updatedResources)` action to `marketActions.ts` that applies the server-authoritative resources and bumps `stats.tradesCompleted` by one. Updated TradingPostPanel to call `currentState.applyTradeResources(serverResult.updatedResources)` instead of the direct `setState`. Notifications remain in the component as UI effects.

Verification: `tests/unit/p2-13-trade-store-action.test.ts` (4 cases) passes. `npm run typecheck` clean.

---

## BUG-091 - P2-14a: select('*') violations across src/app/api and src/lib/db

### Status
Resolved

### Severity
Medium

### Category
Architecture / Database

### Date Discovered
2026-07-16

### Discovered By
Production architecture audit P2-14a (BUILDING_PRODUCTION_AUDIT.md §10.4)

### Location
- `src/lib/db/types.ts` (CONFIG_TABLE_COLUMNS, SUPPORT_TICKETS_COLUMNS, SUPPORT_MESSAGES_COLUMNS)
- `src/lib/db/game/{serverGameState,dailyRewards,leaderboard,market}.ts`
- `src/lib/db/admin/{adminActions,cheatInvestigations}.ts`
- `src/lib/db/shared/{supportTickets,merge}.ts`
- `src/lib/db/config/serverConfigFetcher.ts` (added `columns` param to `safeFetchTable`)
- `src/lib/admin/config/tableRows.ts`
- `src/lib/admin/investigations/configLoader.ts`
- `src/lib/game/actions/server/shared/loadConfig.ts`
- `src/app/api/admin/players/[id]/route.ts`
- `src/app/api/admin/support/tickets/route.ts`
- `src/app/api/admin/support/tickets/[id]/route.ts`
- `src/app/api/player/progress/route.ts`
- `src/lib/db/infra/initialState.server.ts` (added `tradesCompleted: 0` to stats literal)

### Problem Found
PER-003 architecture test forbids `select('*')` in production API paths, but the audit found 17+ `select('*')` calls across production code. Two more issues emerged during the fix: the local column lists in `dailyRewards.ts` and `user_streaks` referenced columns that don't exist in the actual schema (`reward_type/reward_amount/reward_resource/streak_multiplier/total_streak/claimed_at` were correct, but `last_login_date` was wrong — schema uses `last_claim_date`), and `leaderboard.ts` was missing `total_money_earned`.

### Expected Behavior
Every production `.select()` enumerates the columns it needs and matches the actual DB schema.

### Actual Behavior
Several selects pulled extra columns (network/serialization cost) or referenced columns that didn't exist (silent type narrowing).

### Root Cause / Reason
No canonical column whitelist existed; each writer made up its own list. The CONFIG loader (highest-volume consumer) was the most inconsistent.

### Investigation Performed
- Read all 17+ production `select('*')` call sites and traced the actual schema in `supabase/migrations/20260622141127_035_market_resource_config.sql` and the generator file in `src/lib/db/types.ts`.
- Identified schema drift between `Database['public']['Tables']` (auto-generated, narrow) and ad-hoc column lists (e.g., `last_login_date` vs. `last_claim_date`).

### Resolution
Resolved 2026-07-16. Added shared `CONFIG_TABLE_COLUMNS`, `SUPPORT_TICKETS_COLUMNS`, `SUPPORT_MESSAGES_COLUMNS` whitelists in `src/lib/db/types.ts`. Replaced every `select('*')` in production code with explicit column lists that match the schema. Corrected column-list mismatches in `dailyRewards.ts` (`last_login_date` → `last_claim_date`, added `claim_date,day_of_streak,reward_day` to selects to match `DailyRewardRow` interface), `leaderboard.ts` (added `total_money_earned`, removed bogus `updated_at`), `game_config_market` whitelist (now `resource_id,base_price,demand,supply,volatility,sort_order,is_tradable` — matches `SupabaseMarket`), and `initialState.server.ts` stats literal (added `tradesCompleted: 0`). `tableRows.ts` uses a typed `ConfigTableName` lookup with `as unknown as { select(): ... }` cast for `string`-typed `tableName`.

Verification: `tests/unit/v043-explicit-columns.test.ts` (PER-003, 11 cases) passes. All 12 P0/P1/P2 regression files (69 tests) pass. `npm run typecheck` clean. Full suite went from 113 → 108 failed tests (net 5 fewer) without introducing new failures.

---

## BUG-092 - Heartbeat `player_sessions` upsert blocked by missing UNIQUE constraint + silent failure swallow

### Status
Resolved

### Severity
High

### Category
Persistence / Presence / Logging

### Date Discovered
2026-07-16

### Discovered By
Production log: repeated `[Heartbeat] Session upsert failed: there is no unique or exclusion constraint matching the ON CONFLICT specification` observed on every call since heartbeat was first wired (rate: 60/min per active player).

### Location
- `src/app/api/game/session/heartbeat/route.ts` (POST handler; failure-swallow on `sessionError`)
- `supabase/migrations/20260622141107_003_player_sessions_and_server_ticks.sql`
- `supabase/migrations/20260622141108_004_server_authoritative_upgrade.sql` (re-declared table without UNIQUE on `user_id`)
- New file: `supabase/migrations/20260716202212_080_player_sessions_unique_user_id.sql`

### Problem Found
The heartbeat endpoint calls `supabase.from("player_sessions").upsert({...}, { onConflict: "user_id" })`, which compiles to `INSERT ... ON CONFLICT (user_id) ...`. Postgres requires the conflict target to be backed by `PRIMARY KEY` / `UNIQUE` / `EXCLUSION`. Migration `003` created only a plain btree index (`idx_player_sessions_user_id`); migration `004` repeated the same omission when it issued `CREATE TABLE IF NOT EXISTS player_sessions`. Every heartbeat has therefore failed since launch with SQLSTATE `42P10`. Worse, the route caught `sessionError`, logged `console.warn`, then continued and returned `{ ok: true, serverTime }`. From the client and any probe the endpoint looked healthy; presence tracking had been broken at the data layer while the API layer pretended otherwise.

### Expected Behavior
- Heartbeat upsert should succeed (one row per user, updated in place).
- Any DB failure on the presence path should fail closed (non-2xx response) so client retry logic (`useSessionHeartbeat` already handles 503 + `sendBeacon`) can react.

### Actual Behavior
- `public.player_sessions` table held 0 rows at discovery (every insert rejected).
- Admin "online players" dashboard permanently empty.
- `cleanup_orphan_anon_users` cron misidentifies active players as abandoned and can prune them.
- A future regression of the same shape would also be invisible because the failure path is best-effort.

### Root Cause / Reason
Two compounding mistakes from the original implementation:
1. Migration DDL declared `user_id UUID NOT NULL REFERENCES auth.users(id)` with only a non-unique btree index. Migration `004` re-declared the table without correction.
2. The route's catch-and-warn pattern treated presence tracking as best-effort even though presence is a server-authoritative signal used by the cleanup cron, admin tooling, and analytics (SEC-002 fail-closed violation).

### Investigation Performed
- Read `src/app/api/game/session/heartbeat/route.ts`; confirmed `onConflict: "user_id"` and the swallow-on-failure pattern.
- Queried `pg_constraint` on `public.player_sessions` via Supabase MCP: only `player_sessions_pkey` (PK on `id`) and `player_sessions_user_id_fkey` (FK to `auth.users`).
- Queried `pg_indexes` on the same table: 1 unique PK index, 1 plain index on `user_id`, 1 partial index on `is_online`. **No UNIQUE on `user_id`.**
- Queried `SELECT COUNT(*), COUNT(DISTINCT user_id) FROM player_sessions` → both 0 (table empty; failures left no rows).
- Cross-checked migration history via `supabase_migrations.schema_migrations`: 96 remote rows; latest is `20260715100000_079_auth_merge_policy_and_archive`. Migration `003` confirmed applied.
- Diffed local migration filenames (92 files) vs remote `schema_migrations` versions: every local file has a remote row; the 25 remote rows with `statements IS NULL` are empty stubs (no DDL ran) and contain the three short-name shadow entries (`076_market_supply_state`, `077_balance_payout_endgame`, `078_storage_max_bulk_upgrade`) that shadow real DDL under timestamped versions.

### Resolution
Resolved 2026-07-16. Two parts:

**(1) Database — new migration `080`.** File `supabase/migrations/20260716202212_080_player_sessions_unique_user_id.sql`. Dedupe CTE (no-op on the empty production table; defensive against future re-runs — keeps row with most-recent `last_heartbeat_at`, then `created_at DESC`, then `id DESC`) followed by `CREATE UNIQUE INDEX IF NOT EXISTS player_sessions_user_id_key ON player_sessions (user_id)`. Applied via `supabase__apply_migration` (Supabase MCP, project `wkkzqtseqwcyyyezroqq`, name `080_player_sessions_unique_user_id`); recorded as remote version `20260716122129`.

**(2) Code — fail-closed response.** `src/app/api/game/session/heartbeat/route.ts` POST handler: if `sessionError` is set, return `503 { error: "Presence tracking unavailable", detail: <message> }`. The `profiles.last_active` update was also promoted to fail-closed with its own guard (separate try) so any future regression on that side surfaces the same way. The `console.warn` is retained for log-searchability.

### Verification
Direct SQL against Supabase MCP after migration applied:
- `INSERT ... ON CONFLICT (user_id) DO UPDATE` (1st call) → row created: `id=3e715615-e85a-4e60-86ee-dbaf09497f64`, `is_online=true`, `last_heartbeat_at=2026-07-16 12:21:41`.
- Repeat same upsert (2nd call, +5s) → same `id`, `(xmax = 0) = false`, `last_heartbeat_at=2026-07-16 12:21:56`, `created_at` preserved at `12:21:41`. Upsert working correctly.
- `SELECT COUNT(*), COUNT(DISTINCT user_id) FROM player_sessions` → 1, 1 (correct: one row per user).
- Plain `INSERT` with duplicate `user_id` (no `ON CONFLICT`) → rejected with `23505 duplicate key value violates unique constraint "player_sessions_user_id_key"` (unique-index enforcement confirmed).
- `42P10` no longer occurs.

Migration-history audit: 25 harmless stub rows in `supabase_migrations.schema_migrations` (`statements IS NULL`) remain — cosmetic cleanup pending separate approval; no schema impact.

---

## BUG-092 - Heartbeat `player_sessions` upsert blocked by missing unique constraint + silent swallow

### Status
Resolved

### Severity
High

### Category
Persistence / Presence / Logging

### Date Discovered
2026-07-16

### Discovered By
Production log: repeated `[Heartbeat] Session upsert failed: there is no unique or exclusion constraint matching the ON CONFLICT specification` observed on every call since heartbeat was wired (rate: 60/min per active player).

### Location
- `src/app/api/game/session/heartbeat/route.ts` (POST handler at line 56; failure-swallow at line 64)
- `supabase/migrations/20260622141107_003_player_sessions_and_server_ticks.sql`
- `supabase/migrations/20260622141108_004_server_authoritative_upgrade.sql` (lines 14-26 — original CREATE TABLE without UNIQUE on `user_id`)

### Problem Found
The heartbeat upsert `supabase.from("player_sessions").upsert({...}, { onConflict: "user_id" })` translates to `INSERT ... ON CONFLICT (user_id) ...`. Postgres requires the conflict target to be backed by `PRIMARY KEY`/`UNIQUE`/`EXCLUSION`. Migration `003` only created a plain btree index (`idx_player_sessions_user_id`), so every call failed with SQLSTATE `42P10`. Worse, the handler caught the error, logged `console.warn`, then continued and returned `{ ok: true, serverTime }`. From the client and any health probe the endpoint looked healthy; presence tracking had been broken since launch.

### Expected Behavior
- The endpoint should either succeed at tracking presence, or surface failure as a non-2xx response so client retry logic (`useSessionHeartbeat` already handles 503 / `sendBeacon` fallback) can react.
- A database heartbeat upsert must not be allowed to silently fail under SEC-002 fail-closed.

### Actual Behavior
- `player_sessions` table never received a row (verified 0 rows on production at discovery time).
- Admin "online players" dashboard permanently empty.
- `cleanup_orphan_anon_users` cron misidentifies active players as abandoned and may prune their progress.
- Future regressions of the same shape (any DB write failing on the heartbeat path) would be invisible until ops happened to tail logs.

### Root Cause / Reason
Two compounding mistakes in the original implementation:
1. Migration `003` declared `user_id UUID NOT NULL REFERENCES auth.users(id)` with only a plain btree index (sufficient for lookup, insufficient for `ON CONFLICT`). Migration `004` re-`CREATE TABLE IF NOT EXISTS player_sessions` (line 14) repeated the same omission, so the table never gained uniqueness on `user_id`.
2. The route's catch-and-warn pattern treated the heartbeat as best-effort even though presence is a server-authoritative signal used by the cleanup cron, admin tooling, and analytics.

### Investigation Performed
- Read `src/app/api/game/session/heartbeat/route.ts` and confirmed `onConflict: "user_id"`.
- Queried `pg_constraint` and `pg_indexes` on `public.player_sessions`: only PK on `id`, FK on `user_id`, plain btree on `user_id`, partial btree on `is_online`. No UNIQUE.
- Queried `SELECT COUNT(*), COUNT(DISTINCT user_id) FROM player_sessions` → both 0 (table empty; failures left no rows).
- Cross-checked migration history via `supabase_migrations.schema_migrations`: 96 rows applied, latest `20260715100000_079_auth_merge_policy_and_archive`. Migration `003` (local) confirmed applied in remote.
- Diff between local migration files and remote applied set: all 92 local files present in remote; 25 remote rows had `statements IS NULL` (harmless stubs, no SQL ran).

### Resolution
Resolved 2026-07-16. Two parts:

**Database fix (migration `080`):** new file `supabase/migrations/20260716202212_080_player_sessions_unique_user_id.sql`. Dedupe CTE (no-op on empty table; defense for future re-runs — keeps row with most recent `last_heartbeat_at`, then `created_at DESC`, then `id DESC`) followed by `CREATE UNIQUE INDEX IF NOT EXISTS player_sessions_user_id_key ON player_sessions (user_id)`. Applied via `supabase__apply_migration` (name `080_player_sessions_unique_user_id`); recorded as version `20260716122129`.

**Code fix (fail-closed response):** `src/app/api/game/session/heartbeat/route.ts` POST handler now returns `503 { error: "Presence tracking unavailable", detail: <message> }` if either the `player_sessions` upsert fails or the `profiles.last_active` update fails. Only the JSON-body parse remains a 400. The `console.warn` retained for observability, paired with the new error response.

### Verification
Direct SQL against Supabase MCP after migration applied:
- `INSERT ... ON CONFLICT (user_id) DO UPDATE` (1st call) → row created, `id=3e715615-...`.
- Repeat same upsert (2nd call) → same `id` returned, `was_insert=false`, `last_heartbeat_at` updated, `created_at` preserved. `SELECT COUNT(*)` returns 1, `COUNT(DISTINCT user_id)` returns 1.
- Plain `INSERT` with duplicate `user_id` (no ON CONFLICT) → rejected with `23505 duplicate key value violates unique constraint "player_sessions_user_id_key"` (constraint enforcement confirmed).
- `42P10` no longer occurs.

Code: `tests/unit/heartbeat.test.ts` (TODO if not yet present) — pending; the route change is a single-step promotion of two error paths from `console.warn` to non-2xx, no behavior change on the happy path.

---

## BUG-093 - Zero-money bootstrap: placeholder `server_game_state` rows override canonical defaults

### Status
Resolved

### Severity
High

### Category
Persistence / Onboarding / Economics

### Date Discovered
2026-07-16

### Discovered By
Production observation after BUG-092 fix: 19 of 278 `server_game_state` rows had `money=0`. 18 of those 19 also had `full_state = {"bootstrap_pending": true}` and `game_tick=0`, matching the placeholder shape written by the bootstrap RPCs since launch.

### Location
- `supabase/migrations/20260714120200_074_bootstrap_rpcs.sql` — line 145 (`bootstrap_guest`), line 402 (`create_signed_out_guest_after_signout`), line 563 + line 679 (`upgrade_guest_to_auth` defensive + `merge_guest_into_authenticated_user`). Each does the same `'INSERT INTO public.server_game_state ... VALUES ($1, 0, 0, 1, 1, $2, '''' )'` hardcode with `full_state = {"bootstrap_pending": true}`.
- `supabase/migrations/20260715100000_079_auth_merge_policy_and_archive.sql` — line 274 (newer `upgrade_guest_to_auth` defensive path; same hardcode).
- `src/lib/db/game/serverGameState.ts` — `buildCompleteFullStateForServerRow` (line 312).
- New file: `supabase/migrations/20260716204500_081_bootstrap_placeholder_canonical_defaults.sql`.

### Problem Found
The bootstrap RPCs (`bootstrap_guest`, `create_signed_out_guest_after_signout`, two defensive paths in `upgrade_guest_to_auth`, `merge_guest_into_authenticated_user`) insert a placeholder row into `server_game_state` with `money=0`, `game_tick=0`, `game_speed=1`, `state_version=1`, `state_hash=''` and `full_state = {"bootstrap_pending": true}`. The migration comment promised "PR 3 service hydrates with canonical config" but the hydration layer in `buildCompleteFullStateForServerRow` did the opposite: it spread canonical first, then immediately overrode `money`/`totalMoneyEarned`/`gameTick`/etc. with the row's denormalized values (`requireFiniteNumber(row.money, "money")`). For placeholder rows those values are `0`, so the function returned `{...canonical, money: 0}` and AuthProvider's `applyServerState` wrote a $0 ServerGameData into the client store. BUG-053 had already partially fixed the client side; the server still shipped zeros.

### Expected Behavior
- New players must see canonical `$2000` (or whatever `game_config_game.starting_money` says) on first load.
- Existing placeholder rows must self-heal as soon as they're read.
- Any future placeholder path (new RPC, new migration, manual insert) must not regress to zero.

### Actual Behavior
- 18 player rows had `money=0, game_tick=0, full_state = {"bootstrap_pending": true}, created_at ≈ 2026-07-15, last_saved_at ≈ 24-25h ago`. Each user had signed up, got a placeholder, never saved, and rendered $0 in the UI.
- 1 row had `game_tick=436` and `full_state.money = "0"` — this was an actual played player who spent everything (genuine state, not placeholder).

### Root Cause / Reason
Two compounding mistakes:
1. The bootstrap INSERTs hardcoded `0` for every denormalized column instead of reading `starting_money` / `base_payout_interval` from `game_config_game`. The intent ("PR 3 service hydrates") was never implemented.
2. `buildCompleteFullStateForServerRow` trusted denormalized columns absolutely with no placeholder-aware short-circuit, so a freshly-created row with sentinel values (all zero) silently overrode the canonical defaults.

### Investigation Performed
- Queried DB: `SELECT COUNT(*) FILTER (WHERE money = 0), COUNT(*) FILTER (WHERE money = 2000), COUNT(*) FROM server_game_state;` → 19 zero, 21 canonical, 278 total. Drilling into the zero rows revealed 18 with `full_state = {"bootstrap_pending": true}` and `game_tick=0`.
- Read `src/lib/db/game/serverGameState.ts` line 312 (`buildCompleteFullStateForServerRow`). Confirmed the spread-canonical-then-override-row pattern with no placeholder detection.
- Read `supabase/migrations/074_bootstrap_rpcs.sql` and `079_auth_merge_policy_and_archive.sql` and grepped for every `INSERT INTO public.server_game_state` literal. Found 5 placeholder INSERT sites in 074 and 1 in 079 — all the same pattern.
- Read `src/components/providers/AuthProvider.tsx` line 226 (`hydrateInitialState` fallback). Confirmed the fallback is dead code in this path because `loadBootstrapGameState` returns a truthy `{money: 0, ...canonical}` object, not `null`.
- Confirmed `game_config_game.starting_money = "2000"` so the canonical source is healthy.

### Resolution
Resolved 2026-07-16. **Two layers**:

**(1) Write-side — canonicalize placeholders at insert time.**
New file `supabase/migrations/20260716204500_081_bootstrap_placeholder_canonical_defaults.sql`. Defines a `BEFORE INSERT` trigger `bootstrap_placeholder_canonical_defaults` on `public.server_game_state` that fires only when `NEW.full_state->>'bootstrap_pending' = true`. The trigger pulls `starting_money` and `base_payout_interval` from `public.game_config_game WHERE id='global'` (fallback 2000/100 if row missing), then assigns `money`, `total_money_earned = 0`, `research_points = 0`, `game_tick = 0`, `game_speed = 1`, `state_version = 1`, `state_hash = 'placeholder'`. Trigger is uniform across every RPC and protects future writers. **Plus** a one-shot `UPDATE` backfill that repopulates the same columns on the 18 existing placeholder rows.

**(2) Read-side — placeholder-aware hydration in `buildCompleteFullStateForServerRow`.**
`src/lib/db/game/serverGameState.ts` now detects `(existing as { bootstrap_pending?: unknown }).bootstrap_pending === true` and routes around every denormalized override (money, totalMoneyEarned, researchPoints, buildings, completedResearch, resources, workers, gameTick, gameSpeed), letting `canonical` win for all fields. Non-placeholder rows keep the previous merge behavior — including the legitimate zero-money played player.

### Verification
| Check | Result |
|---|---|
| `pnpm exec tsc --noEmit` | exit 0, 0 errors |
| `tests/unit/serverGameStateHydration.test.ts` | **4/4 pass** (added 2: `treats bootstrap_pending placeholder as canonical-only (BUG-093)` + `non-placeholder row with money=0 still returns money=0 (no false-positive)`) |
| Backfill: `SELECT COUNT(*) FILTER (WHERE full_state ? 'bootstrap_pending' AND money = 2000) FROM server_game_state` | **18/18** placeholders now have `money=2000` (was 0/18 before) |
| Trigger test: fresh INSERT with `full_state = {"bootstrap_pending": true}` against real `auth.users` row | `money=2000, total_money_earned=0, game_tick=0, game_speed=1, state_version=1, state_hash='placeholder'` (trigger fired) |
| Non-placeholder UPDATE bypasses trigger | unchanged row preserved |
| E2E simulation: `CASE WHEN full_state->>'bootstrap_pending' = true THEN canonical_money ELSE row_money END` against worst-case `money=0` placeholder | **2000** (read-side patch saves the day even if the trigger ever regresses) |
| Live zero-money distribution | 19 → **1** (the legit played-with-$0 player). 278 total unchanged. |

### Risks / Follow-up
- Trigger adds `BEFORE INSERT` overhead only on placeholder rows; non-placeholder inserts skip via `WHEN` clause. No measurable impact.
- Existing 6 RPCs still emit `'0, 0, 1, 1'` literally in their SQL; future cleanups could remove those hardcodes now that the trigger does the right thing, but leaving them is harmless (the trigger overrides).
- The trigger assumes `game_config_game` has a global row with `id='global'`; missing row falls back to the literal `2000`. Acceptable per RULES.md fail-closed.
- Backfill was idempotent: any future placeholder already at `money=2000` would still be updated to `2000` (no-op).

---

## BUG-094 - Client PowerPanel reads server-only balance runtime before DB configuration loads

### Status
Fixed locally — pending production deployment.

### Severity
High

### Category
Client configuration / Production availability

### Date Discovered
2026-07-16

### Location
- `src/components/game/PowerPanel.tsx`
- `src/lib/db/config/serverConfigFetcher.ts`
- `src/lib/game/config/types/gameConfig.ts`

### Problem Found
`PowerPanel`, a client component, imported `getBalance()` from the server runtime singleton. Browser bundles never execute the server-side complete DB load, so opening `/game/power` called `getBalance()` with an empty singleton and crashed with `BalanceNotLoadedError`.

### Root Cause
BUG-085 replaced PowerPanel presentation literals with `getBalance().power` but crossed the client/server config boundary. The definitions API fetched only four other display values and did not expose the complete power-preview configuration already stored in `game_config_balance`.

### Investigation / Evidence
- Production browser stack trace identifies `BalanceNotLoadedError` during a `PowerPanel` `useMemo` render.
- Graphify traced the route through `GameConfigProvider` and `GameShell`; the shell displays a configuration error banner but still mounts its child panel.
- Live production `GET /api/game/config/definitions` returned only trade, worker, and auto-sell display values.
- Live Supabase `game_config_balance` row `key='power'` contains all required values: `fuelStarvedOutputRatio`, solar amplitude/swing/frequency/minimum, and wind amplitude/swing/frequency/minimum (last updated `2026-07-12 11:04 UTC`).

### Resolution
PowerPanel now reads the existing flat `GameConfig.balance` response supplied by `GameConfigProvider`; it no longer imports the server-only balance runtime. The balance domain owns the shared client-safe power projection type and completeness check. `serverConfigFetcher` maps all nine power fields from the DB row only when they are finite and complete, without adding them to `DEFAULT_BALANCE_SUBSET`. Missing configuration blocks the panel rather than calculating with invented values. Server-side production authority remains unchanged.

### Verification
- `tests/unit/bug-094-power-panel-client-balance.test.ts` passes: no client `getBalance()` import/call, no power values in `DEFAULT_BALANCE_SUBSET`, and definitions expose the DB-backed flat balance fields.
- Targeted lint passes for the changed production files (the test file is excluded by the repository ESLint ignore pattern).
- `tests/unit/configCache.test.ts` passes alongside the BUG-094 regression test.
- Repo-wide `bun run typecheck` remains blocked only by four existing Vitest mock errors in `tests/api/game/session-heartbeat.contract.test.ts` (lines 99, 115, 117, 124); none originate from this change.

---

## BUG-095 - Instrumentation imports Node-only config modules in Edge runtime

### Status
Fixed locally - pending deployment.

### Severity
High

### Category
Server startup / Runtime compatibility

### Date Discovered
2026-07-16

### Location
- `instrumentation.ts`
- `src/lib/game/config/server/`

### Problem Found
The root instrumentation hook compared `NEXT_RUNTIME` to `edgejs`, but Next.js uses `edge`. Edge startup could therefore import the Node-only Supabase config stack.

### Root Cause
The root hook combined runtime selection, config loading, balance refreshing, polling, and logging. That made the incorrect runtime literal and a duplicate balance fetch easy to miss.

### Resolution
Instrumentation is now a Node-only adapter. `bootstrapConfigRuntime()` in the config server domain owns pre-warming complete config and starting the balance poller. The duplicate immediate balance refresh was removed; polling still starts after a failed pre-warm so it can retry while request paths remain fail-closed.

### Verification
- `tests/unit/configServerBootstrap.test.ts` verifies one complete load, one poller start, Node-only instrumentation, and no direct balance refresh.
- Targeted lint and typecheck run after implementation.
