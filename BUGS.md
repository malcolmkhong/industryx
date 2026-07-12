# BUGS.md - IndustriaX Project Bug Memory

> **Purpose:** Project-wide bug registry, investigation history, and resolution log.
> **Authority:** This file is the canonical record of known issues. Future agents MUST read this before starting work and MUST update entries (not delete them) as work progresses.
> **Created:** 2026-06-17 (during AGENT.md and `.rules` reconciliation audit)
> **Last Updated:** 2026-07-12 (admin mutation write guards + audit sync)

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

> **Total:** 13 open, 1 unverified, 7 Resolved (out of 21). BUG-042/043/044/048/049/050 closed in recent sessions.

> **Highest priority for fixing (still open):** BUG-005 (.env.example - high severity, blocks new devs), BUG-001 (1 panel selector migration), BUG-003 (prisma uninstall), BUG-004 (test runner), BUG-009 (anon key), BUG-018 (admin a11y), BUG-019 (responsive), BUG-022 (contrast), BUG-025 (arbitrary values), BUG-033 (proxy rename). BUG-007, BUG-011, BUG-013 are low priority and may be deferred indefinitely.

> **2026-07-11 session notes:**
> - [x] BUG-042 fixed: added `balance: DEFAULT_BALANCE_SUBSET` to `GameConfig` literals.
> - [x] BUG-043 fixed: `emptyProductionSnapshot()` no longer calls `getBalance()` at module-eval.
> - [x] BUG-044 fixed: `no-nested-ternary` set to `off` in `eslint.config.mjs` (inherited from `eslint:recommended` via Next). Other lint issues (unused-vars, no-duplicate-imports, non-null-assertions, `<a>` vs `<Link>`) addressed file-by-file in the audit pass.

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
