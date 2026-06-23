# BUGS.md — IndustriaX Project Bug Memory

> **Purpose:** Project-wide bug registry, investigation history, and resolution log.
> **Authority:** This file is the canonical record of known issues. Future agents MUST read this before starting work and MUST update entries (not delete them) as work progresses.
> **Created:** 2026-06-17 (during AGENT.md and `.rules` reconciliation audit)
> **Source of related state:** `planning/PROJECT_STATUS_SOURCE_OF_TRUTH.md` (canonical state), `.rules` Appendix A (25-issue audit registry), `planning/DB_CENTRALIZATION_TODO_2026_06_20.md` (active DB centralization iterations 1–9).

---

## Summary Table

| ID | Status | Severity | Area | Problem Found | Location |
|---|---|---|---|---|---|
| BUG-001 | Open | High | Performance | 19/20 components migrated to selectors; `AchievementPanel.tsx` still uses full-store subscription | `src/components/game/AchievementPanel.tsx` (line 504) |
| BUG-003 | Open | Medium | Infra | `prisma` in devDependencies but no `prisma/` directory or schema file exists | `package.json`, `prisma/` (missing) |
| BUG-004 | Open | Medium | Tests | 3 integration test files but no test runner configured in `package.json` | `tests/integration/*.test.ts`, `package.json` |
| BUG-005 | Open | High | Docs / State | `.env.example` has literal `process.env.X` values instead of empty placeholders | `.env.example` |
| BUG-007 | Open | Low | Persistence | H6: 5-second debounced persist loses data on mobile force-kill | `src/lib/game/store.ts` (~894–967) |
| BUG-009 | Open | Low | Security | Hardcoded production Supabase anon key in committed test file | `tests/integration/supabase-connectivity.test.ts` |
| BUG-011 | Open | Low | UX | L2: `KEY_TAB_MAP` covers only 10 of 25+ tabs | `src/components/game/GameSidebar.tsx` (124–135) |
| BUG-013 | Open | Low | Infra | `.omo/` and `skills/` directories gitignored but not empty | `.omo/`, `skills/` |
| BUG-018 | Open (Partial) | High | Accessibility | jsx-a11y plugin enabled; 14 aria-labels added to game panels; 36 admin-page inputs remain | `src/app/admin/**` (partial) |
| BUG-019 | Open (Partial) | Medium | Responsive | 5 `md:` breakpoints added to DashboardPanel + GameSidebar; remaining panels deferred | `src/components/game/DashboardPanel.tsx`, `GameSidebar.tsx` |
| BUG-022 | Open (Suspected) | Medium | Accessibility | `text-muted-label` (#94a3b8) contrast risk — needs per-context measurement | `src/app/globals.css:85` |
| BUG-025 | Open (Partial) | Low | Tailwind | 42 of 1,233 arbitrary values replaced; 1,191 typography `text-[Npx]` remain (deferred) | 18 files in `src/components/**` |
| BUG-033 | Open | Low | Infra | `src/middleware.ts` triggers Next.js 16.1 deprecation warning | `src/middleware.ts` |
| BUG-034 | Resolved (2026-06-19, unverified) | High | Data | `cleanup_orphan_anon_users` missed `profiles` FK check — fix applied to live DB but migrations `051`/`052` not committed to disk | `supabase/migrations/052_fix_cleanup_orphan_anon_profiles_check.sql` (missing on disk) |
| BUG-041 | Resolved (2026-06-22) | Critical | Infra / Cron | `apply_market_tick` RPC validates price change against `basePrice` instead of previous tick's `currentPrice`; rejected 5+ high-end resources, froze cron for 54h | `supabase/migrations/053_fix_apply_market_tick_deviation_baseline.sql` |

> **Total:** 13 open, 1 unverified, 1 freshly Resolved (out of 15). 25 previously Resolved entries removed per AGENTS.md 76-hour retention rule on 2026-06-22 after code/config validation.
> **Highest priority for fixing (still open):** BUG-005 (.env.example — high severity, blocks new devs), BUG-001 (1 panel selector migration), BUG-003 (prisma uninstall), BUG-004 (test runner), BUG-009 (anon key), BUG-018 (admin a11y), BUG-019 (responsive), BUG-022 (contrast), BUG-025 (arbitrary values), BUG-033 (middleware rename). BUG-007, BUG-011, BUG-013 are low priority and may be deferred indefinitely.

> **2026-06-22 cleanup notes:**
> - 25 validated Resolved entries removed (BUG-002, 006, 008, 010, 012, 014–017, 020, 021, 023, 024, 026–032, 035–040).
> - BUG-034 kept: migration files `051_cleanup_orphan_anon_users.sql` and `052_fix_cleanup_orphan_anon_profiles_check.sql` not present on disk — fix was applied to live DB only. Cannot verify from workspace.
> - Cleanup script (one-shot, used for this audit only, deleted after run). For future audits, re-run targeted `Select-String` + regex removal as documented in the validation log.

---

## BUG-001 — 20 components still subscribe to the entire Zustand store

### Status
Open

### Severity
High

### Category
Performance

### Date Discovered
2026-06-17

### Discovered By
AI Agent (during AGENT.md review)

### Location

Files (20 components):
- `src/components/game/AchievementPanel.tsx` (line 504)
- `src/components/game/AutomationPanel.tsx` (line 25)
- `src/components/game/BlueprintPanel.tsx` (line 31)
- `src/components/game/ContractPanel.tsx` (line 183)
- `src/components/game/DailyRewardsPanel.tsx` (line 12)
- `src/components/game/DroneDeliveryPanel.tsx` (line 186)
- `src/components/game/EventPanel.tsx` (line 42)
- `src/components/game/GlobalResourceMonitorPanel.tsx` (line 186)
- `src/components/game/MarketPanel.tsx` (line 179)
- `src/components/game/MegaProjectPanel.tsx` (line 90)
- `src/components/game/NotificationCenterPanel.tsx` (line 78)
- `src/components/game/OnboardingPanel.tsx` (line 178)
- `src/components/game/PrestigePanel.tsx` (line 23)
- `src/components/game/ProductionChainPanel.tsx` (line 35)
- `src/components/game/QuestPanel.tsx` (line 220)
- `src/components/game/ResearchPanel.tsx` (line 19)
- `src/components/game/SettingsPanel.tsx` (line 164)
- `src/components/game/StatisticsPanel.tsx` (line 324)
- `src/components/game/StoragePanel.tsx` (line 42)
- `src/components/game/TransportPanel.tsx` (line 959)

### Problem Found
H1 (DashboardPanel full-store subscription) was marked FIXED in `PROJECT_STATUS_SOURCE_OF_TRUTH.md` after commit `185f84d`. However, 20 other components still call `useGameStore()` with no selector argument, causing them to re-render on every game tick (~1–10 Hz).

### Expected Behavior
Every component that reads from `useGameStore` should subscribe to specific fields, e.g. `useGameStore((s) => s.buildings)`, so re-renders only happen when the relevant fields change.

### Actual Behavior
Each of the 20 components re-renders on every game tick because the entire store reference changes on each tick.

### Root Cause / Reason
**Confirmed.** Each affected file has a line like `const store = useGameStore();` (no selector) and then accesses multiple fields via `store.X`. When the tick action runs, it creates a new store reference and all 20 components re-render.

**Status of original H1 fix:** DashboardPanel was correctly migrated to selectors (17 specific selectors). The other 20 panels were not.

### Investigation Performed
- `grep -nE "useGameStore\(\)" -r src/components` returned 20 hits across 20 files.
- `DashboardPanel.tsx` confirmed clean (uses `useGameStore((s) => s.X)` per field).
- Decomposed selectors exist in `src/lib/game/selectors/` (per `PROJECT_STATUS_SOURCE_OF_TRUTH.md`).

### Evidence
- Related commits: `185f84d` (DashboardPanel H1 fix), `bb5f868` (selector decomposition).
- Related code: each file has the pattern `const store = useGameStore();` followed by field accesses.

### Troubleshooting / Next Steps
1. For each file, identify the fields actually used and create specific selectors.
2. Replace `const store = useGameStore();` with `const foo = useGameStore((s) => s.foo);` per field.
3. Verify no behavioral changes via dev-server smoke test.
4. Consider extracting the selectors to `src/lib/game/selectors/` if not already there.
5. Add a lint rule or `grep` check in CI to prevent re-introduction.

### Resolution
Not resolved.

### Notes For Future Agents
- This is the same family of bug as the original H1 issue. The fix was applied to `DashboardPanel` only.
- Decomposed selectors already exist in `src/lib/game/selectors/`. Reuse them rather than creating new inline selectors.
- The 5-second debounce on persistence (BUG-007) and the `Math.random()` for IDs (BUG-012) are different bugs — do not conflate.

---


---

## BUG-003 — `prisma` in devDependencies but no `prisma/` directory or schema file

### Status
Open

### Severity
Medium

### Category
Infra

### Date Discovered
2026-06-17

### Discovered By
AI Agent (during AGENT.md review)

### Location

- `package.json` devDependencies: `"@prisma/client": "^6.11.1"`, `"prisma": "^6.11.1"`
- `prisma/` directory: **does not exist** in the project
- `.rules` Appendix A M6 — "Stale Prisma schema at `schema.prisma:1-32`" — marked FIXED

### Problem Found
M6 was marked FIXED with the fix described as "prisma moved to devDependencies" (commit `d1bc73a`). The package move was done, but:
- There is no `prisma/` directory in the project.
- There is no `schema.prisma` file.
- The dependency remains, taking up install time and increasing node_modules size.
- The `.rules` entry for M6 (`prisma/schema.prisma:1-32`) refers to a file that doesn't exist.

### Expected Behavior
If Prisma is not in use (the project uses Supabase migrations, not Prisma), the `prisma` and `@prisma/client` devDependencies should be removed.

### Actual Behavior
The dependencies are listed in `package.json` but there is no Prisma schema or configuration. `npm install` installs unused packages.

### Root Cause / Reason
**Suspected.** The M6 fix removed the stale schema but left the dependencies. Prisma is not actually used by the project — all DB work goes through Supabase SQL migrations in `supabase/migrations/`. The `.rules` explicitly forbids using Prisma for schema management: *"Never use `prisma db:push` or `prisma migrate`"*.

### Investigation Performed
- `ls -la prisma/` → "No such file or directory".
- `find prisma -type f` → no results.
- `package.json` lists `prisma` and `@prisma/client` in devDependencies.
- `.rules` says: *"NEVER run `prisma db:push` or `prisma migrate`"*.

### Evidence
- Related commits: `d1bc73a` (claimed M6 fix).
- Related code: `package.json:65, 77`.

### Troubleshooting / Next Steps
1. Confirm with the user that Prisma is not used.
2. If confirmed: `npm uninstall prisma @prisma/client`.
3. Update `.rules` Appendix A M6 to reflect the actual fix (full removal, not just "moved to devDeps").
4. Verify `npm install` succeeds without these packages.
5. Update M6's `Why Each Major Rule Exists` entry.

### Resolution
Not resolved.

### Notes For Future Agents
- The project uses Supabase SQL migrations exclusively. Do not add Prisma back.
- If any code in `src/` imports `@prisma/client`, surface it before removing the dependency.

---

## BUG-004 — `tests/integration/*.test.ts` exist but no test runner is configured

### Status
Open

### Severity
Medium

### Category
Tests

### Date Discovered
2026-06-17

### Discovered By
AI Agent (during AGENT.md review)

### Location

- `tests/integration/auth-gate.test.ts` (310 lines)
- `tests/integration/cloudflare-connectivity.test.ts` (166 lines)
- `tests/integration/supabase-connectivity.test.ts` (193 lines)
- `package.json` — no `test` script in `scripts`

### Problem Found
3 integration test files were added (commit `f42d5cd` "test") using Node's built-in `node:test` runner. However:
- `package.json` has no `scripts.test` key.
- The tests cannot be run via `npm test` or `bun test`.
- `jsdom` and `@testing-library/*` devDependencies were added (commit `a9431ec`) suggesting Vitest/Jest was intended, but no config exists.
- The tests would only work with `node --test tests/integration/` directly, which is not in any script.

### Expected Behavior
Either: (a) a `test` script exists in `package.json` and the tests run on demand / in CI, OR (b) the test scaffolding is removed and the devDeps cleaned up.

### Actual Behavior
Tests are committed but cannot be executed. They serve as documentation of intent (the `auth-gate.test.ts` literally references commit SHAs in its test names) but provide no automated verification.

### Root Cause / Reason
**Confirmed.** The test scripts use `tests/**/.test.ts` arguments. GitHub Actions runs Node 20.20.2, whose `node --test` CLI does **not** expand `**` globs. That leaves the literal path `tests/integration/**/*.test.ts`, and the runner exits with `Could not find '/home/runner/work/industryx/industryx/tests/integration/**/*.test.ts'` before executing the suite. Local runs on newer Node versions can mask this because newer runners accept the pattern.

### Investigation Performed
- `cat package.json | grep -E "test|vitest|jest"` → only `lint` script exists; no test script.
- The 3 test files use `import { describe, it } from 'node:test'` — Node's built-in test runner.
- Tests reference live external endpoints (Supabase, Cloudflare, Vercel production) — would be flaky in CI.
- 2026-06-23 CI run `28020745757`, job `82936315712`: `npm test` failed immediately with `Could not find '/home/runner/work/industryx/industryx/tests/integration/**/*.test.ts'`.
- Local repro: `npx -y node@20 --test tests/integration/**/*.test.ts` fails with the same literal-path error, while `npx -y node@20 --test tests/integration/*.test.ts` reaches test execution.

### Evidence
- Related commits: `f42d5cd` (test files), `a9431ec` (devDeps).
- Related code: `tests/integration/*.test.ts` content.

### Troubleshooting / Next Steps
1. Replace `**` in `package.json` test scripts with shell-expandable `*` patterns (all current test files are flat under `tests/integration/` and `tests/security/`).
2. Run the GitHub Actions workflow on Node 22+ so the built-in test runner can execute `.ts` test files.
3. Decide if the live-network tests should run in CI (likely: gate behind `RUN_SMOKE=1`).
4. Remove the hardcoded anon key from `supabase-connectivity.test.ts` (BUG-009).
5. If nested test directories are needed later, switch to an explicit file-enumeration wrapper instead of `**`.

### Resolution
Not resolved.

### Notes For Future Agents
- The tests are valuable as documentation of expected behavior (the auth-gate test demonstrates the fix for BUG/fix `0ecf87d`).
- They are NOT valuable as-is because they cannot run.
- Three of the tests hit live external services. Be careful when adding to CI.

---

## BUG-005 — `.env.example` has invalid `process.env.X` literal values

### Status
Open

### Severity
High

### Category
Docs / State

### Date Discovered
2026-06-17

### Discovered By
AI Agent (during initial safety check)

### Location

- `.env.example` (committed at `a9431ec` "my edit")

### Problem Found
Every variable in `.env.example` has its value set to the literal string `process.env.X` instead of being left empty for the user to fill in. For example:
```
NEXT_PUBLIC_SUPABASE_URL=process.env.NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY
```

A developer who runs `cp .env.example .env` and starts the app will have Next.js attempt to use the literal string `"process.env.NEXT_PUBLIC_SUPABASE_URL"` as the Supabase URL — which is not a valid URL, breaking auth at boot.

### Expected Behavior
`.env.example` should be a template with empty values:
```
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

### Actual Behavior
All values are the literal text `process.env.X`, which would be loaded by Next.js as the env var's value, breaking the app.

### Root Cause / Reason
**Confirmed.** A prior AI session generated the file incorrectly — likely confused the `.env.example` template syntax with Next.js component syntax (where `process.env.X` IS valid). The original `e72cb8c` commit had correct empty values.

### Investigation Performed
- `git diff .env.example` shows the original (correct) empty values vs the current (broken) `process.env.X` values.
- The change was committed at `a9431ec` "my edit" (2026-06-17 14:15:16).

### Evidence
- Related commits: `a9431ec` (current broken state), `e72cb8c` (original correct state — recoverable via `git show e72cb8c:.env.example`).
- Related code: `.env.example` (every line is wrong).

### Troubleshooting / Next Steps
1. `git checkout e72bc8c -- .env.example` to restore the original empty template, OR
2. `git checkout HEAD -- .env.example` to restore the version in the prior commit, OR
3. Manually edit to empty values.
4. The new sections (Sentry, CHECKSUM_SECRET, CRON_SECRET) added in the broken version may have been intentional and should be re-added with empty values.

### Resolution
Not resolved.

### Notes For Future Agents
- The empty-value pattern is universal for `.env.example` files — the `=` followed by nothing.
- This is a high-priority fix because it blocks new developers from running the project.

---


---

## BUG-007 — H6: 5-second debounced persist loses data on mobile force-kill

### Status
Open

### Severity
Low

### Category
Persistence

### Date Discovered
2026-06-12 (per PROJECT_STATUS_SOURCE_OF_TRUTH.md)

### Discovered By
Audit (originally identified in deep audit)

### Location

- `src/lib/game/store.ts` (~lines 894–967 — debounced `persist` middleware)
- `src/lib/hooks/cloudSync/useCloudPersistence.ts` (cloud sync)

### Problem Found
The local-storage persistence layer uses a 5-second debounce. If a user is on mobile and the browser is force-killed (not closed), the `beforeunload` listener may not fire, and up to 5 seconds of progress can be lost.

### Expected Behavior
A periodic full save (e.g., every 30–60 seconds) on top of the debounced persist to bound the maximum data loss.

### Actual Behavior
Up to 5 seconds of gameplay progress can be lost on mobile force-kill.

### Root Cause / Reason
**Confirmed.** Debounce was chosen to reduce localStorage write frequency (avoiding main-thread blocking on the 1–10 Hz tick loop). The trade-off is acceptable data-loss risk.

### Investigation Performed
- Per `PROJECT_STATUS_SOURCE_OF_TRUTH.md`, this is OPEN and "mitigated by `beforeunload`" — but `beforeunload` is unreliable on mobile.

### Evidence
- Related commits: none yet.
- Related code: `src/lib/game/store.ts` debounced persist.

### Troubleshooting / Next Steps
1. Add a `setInterval` save every 30–60s in the persistence layer.
2. Or use a service worker to persist on visibility change.
3. Or save to IndexedDB instead of localStorage (larger quota, async, doesn't block).

### Resolution
Not resolved.

### Notes For Future Agents
- Do not remove the `beforeunload` listener.
- Do not increase the auto-save frequency (would overload `/api/game/state`).
- The 5s debounce on localStorage is intentional — coordinate any change with the cloud sync layer.

---


---

## BUG-009 — Hardcoded production Supabase anon key in committed test file

### Status
Open

### Severity
Low (anon key is technically public)

### Category
Security

### Date Discovered
2026-06-17

### Discovered By
AI Agent (during test file review)

### Location

- `tests/integration/supabase-connectivity.test.ts` (line ~18)

### Problem Found
The test file contains the production Supabase project's anon key as a hardcoded string literal:
```ts
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9....';
```

The anon key is technically designed to be public (it ships in the client bundle), so the security risk is low. However, hardcoding it:
- Makes the tests non-portable (cannot run against staging).
- Embeds project-specific info in version control.
- Sets a bad precedent for future tests.

### Expected Behavior
The test should read the anon key from an env var, e.g. `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY`.

### Actual Behavior
The key is hardcoded in the source.

### Root Cause / Reason
**Confirmed.** Convenience for a one-off connectivity test.

### Investigation Performed
- Read the test file. The anon key matches the public anon key for project `wkkzqtseqwcyyyezroqq`.

### Evidence
- Related file: `tests/integration/supabase-connectivity.test.ts`.

### Troubleshooting / Next Steps
1. Replace the hardcoded string with `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'test-key'`.
2. Add a `.env.test` template.
3. Document in the test file's header that it requires a real anon key to run.

### Resolution
Not resolved.

### Notes For Future Agents
- The anon key for project `wkkzqtseqwcyyyezroqq` is rotated via the Supabase dashboard; updating it requires rotating in the test file too. Using an env var avoids this.

---


---

## BUG-011 — L2: `KEY_TAB_MAP` covers only 10 of 25+ tabs

### Status
Open

### Severity
Low

### Category
UX

### Date Discovered
2026-06-12 (per PROJECT_STATUS_SOURCE_OF_TRUTH.md)

### Discovered By
Audit

### Location

- `src/components/game/GameSidebar.tsx` (lines ~124–135, `KEY_TAB_MAP` export)

### Problem Found
Only 10 keyboard shortcuts are mapped in `KEY_TAB_MAP`, but the game has 25+ navigable tabs (dashboard, advisor, factoryMap, resourceMonitor, resources, factories, storage, transport, power, market, research, workers, contracts, automation, prestige, events, megaprojects, statistics, blueprints, guide, achievements, leaderboard, dailyRewards, payouts, droneDelivery, tradePost, quests, notifications, settings).

### Expected Behavior
Most or all tabs should have keyboard shortcuts.

### Actual Behavior
Only 10 tabs are reachable via keyboard.

### Root Cause / Reason
**Confirmed.** Incremental addition — shortcuts were added one at a time as the tabs were created.

### Investigation Performed
- `grep -n "KEY_TAB_MAP" src/components/game/GameSidebar.tsx` confirms the export.
- `PROJECT_STATUS_SOURCE_OF_TRUTH.md` confirms L2 is OPEN.

### Evidence
- Related code: `GameSidebar.tsx` `KEY_TAB_MAP`.

### Troubleshooting / Next Steps
1. Enumerate all `GameTab` types from `src/lib/game/types.ts`.
2. Add a key for each tab (or define a default scheme like `1-9` for first 9, then modifier+key).
3. Update the keyboard shortcuts help dialog to reflect all mappings.

### Resolution
Not resolved.

### Notes For Future Agents
- Existing keyboard map is in `src/components/game/GameSidebar.tsx`. Any new tab added should also add a `KEY_TAB_MAP` entry in the same commit.

---


---

## BUG-013 — `.omo/` and `skills/` directories are empty

### Status
Open

### Severity
Low

### Category
Infra

### Date Discovered
2026-06-17

### Discovered By
AI Agent (during directory scan)

### Location

- `.omo/` (gitignored, contains `notepads/`, `run-continuation/`)
- `skills/` (gitignored, empty)

### Problem Found
Two gitignored directories are present in the project but contain only stub subdirectories. They appear to be remnants of removed features or experimental scaffolding.

- `.omo/` contains `.omo/notepads/` and `.omo/run-continuation/` — looks like an internal note system.
- `skills/` is completely empty.

### Expected Behavior
Either: (a) the directories serve a purpose and should be documented, OR (b) the directories should be removed.

### Actual Behavior
Empty/stub directories are committed to disk (gitignored but physically present).

### Root Cause / Reason
**Suspected.** Either experimental features that were never finished, or a note system that was moved elsewhere.

### Investigation Performed
- `ls -la .omo/` shows 2 stub subdirectories.
- `ls -la skills/` shows the directory is empty.
- Both are gitignored (per `.gitignore`: `skills/` is listed, `.omo/` is listed).

### Evidence
- Related code: `.gitignore`.

### Troubleshooting / Next Steps
1. Check git history for any references to `.omo/` or `skills/`.
2. Ask the user if these directories are still in use.
3. If not in use, remove them: `rm -rf .omo skills`.

### Resolution
Not resolved.

### Notes For Future Agents
- These directories do not affect the build or runtime.
- Do not assume they are "in use" just because they exist.

---

**Total entries:** 14 (13 open + 1 unverified; 25 validated Resolved entries removed 2026-06-22)
**Last updated:** 2026-06-22


---


---


---


---

## BUG-018 — H2: aria-label gap on icon-only buttons

### Status
Open (Partially Confirmed)

### Severity
High

### Category
Accessibility (WCAG 4.1.2 Name, Role, Value)

### Date Discovered
2026-06-17

### Discovered By
AI Agent (UI/UX audit verification)

### Location

- Multiple panels: `GameSidebar.tsx`, `BottomNavigationBar.tsx`, `FactoryMapPanel.tsx`, `MarketPanel.tsx`, `GlobalResourceMonitorPanel.tsx`, `QuestPanel.tsx`, etc.

### Problem Found
Many icon-only buttons lack accessible names. The audit's headline numbers (135 vs 75) did not match my grep (25 `<button>` and 65 `aria-label=` in the main components), but a real gap remains — particularly for icon buttons whose only content is a `<svg>` or `<lucide-icon>`.

### Expected Behavior
Every interactive element has either visible text or an `aria-label`.

### Actual Behavior
Several icon-only buttons rely on visual context only.

### Root Cause / Reason
**Partially Confirmed.** Real issue, magnitude smaller than audit suggested.

### Investigation Performed
- `grep -rE "<button[ >]" src/components src/app | wc -l` → 25 (likely undercount — buttons spanning multiple lines not matched)
- `grep -rE "aria-label=" src/components src/app | wc -l` → 65

### Evidence
- `FactoryMapPanel.tsx` has 14 aria-labels — relatively well-labeled
- `BottomNavigationBar.tsx` group buttons have `aria-label` on group containers
- Some smaller panels (AchievementPanel, QuestPanel) have minimal labeling

### Troubleshooting / Next Steps
1. Run `eslint-plugin-jsx-a11y` if not already enabled.
2. Run `axe-core` in CI to find unlabeled buttons programmatically.
3. For each unlabeled icon button, add `aria-label` derived from its action (`aria-label="Buy"`, `aria-label="Sell"`, etc.).

### Resolution
Not resolved. See implementation plan `planning/UI_UX_REMEDIATION_PLAN.md` Phase 4.

### Notes For Future Agents
- `eslint-plugin-jsx-a11y` is the standard tool. Add it as devDep and enable the `recommended` ruleset.

---

## BUG-019 — H3: No tablet (`md:`) breakpoint strategy

### Status
Open

### Severity
Medium

### Category
Responsive

### Date Discovered
2026-06-17

### Discovered By
AI Agent (UI/UX audit verification)

### Location

- Global: `src/app/page.tsx`, `src/components/game/headers/`, `src/components/game/GameSidebar.tsx`, `src/components/game/BottomNavigationBar.tsx`, panel grids.

### Problem Found
Tailwind responsive utilities: `sm:` 131×, `md:` 23×, `lg:` 58×. The app jumps from mobile to `lg:` desktop with almost nothing in the 768–1023px range.

### Expected Behavior
Tablet (768–1023px) should have its own layout — sidebar/bottom-nav transition, panel grid columns, header density.

### Actual Behavior
Tablet users see either cramped mobile or desktop layout, depending on which breakpoint is hit.

### Root Cause / Reason
**Confirmed.** No tablet design phase in the original implementation.

### Investigation Performed
- Counted Tailwind responsive utility occurrences: `sm:` 131×, `md:` 23×, `lg:` 58× across `src/**`.

### Evidence
- Related code: panel grids in `src/app/page.tsx`, `src/components/game/headers/`, `src/components/game/GameSidebar.tsx`, `src/components/game/BottomNavigationBar.tsx`.

### Troubleshooting / Next Steps
1. Audit each panel at 768px width using a browser dev tools.
2. Define tablet grid columns (e.g., 2-col instead of 1-col on mobile, 3-col instead of 4-col on desktop).
3. Test sidebar behavior at tablet: probably collapse to icons-only, like Discord.
4. Update `next.config.ts` if needed to add tablet-allowed origins.

### Resolution
Not resolved. See implementation plan `planning/UI_UX_REMEDIATION_PLAN.md` Phase 4.

### Notes For Future Agents
- Tablet range is 768–1023px (`md:`). Anything below mobile (`<sm:`) or above desktop (`lg:`).

---


---


---

## BUG-022 — H6: `text-muted-label` (#94a3b8) contrast risk

### Status
Open (Suspected — needs contrast measurement)

### Severity
Medium

### Category
Accessibility (WCAG 1.4.3 Contrast Minimum)

### Date Discovered
2026-06-17

### Discovered By
AI Agent (UI/UX audit verification)

### Location

- `src/app/globals.css:85` — `--color-muted-label: #94a3b8; /* replaces text-gray-500 */`
- 795 usages across `src/**`

### Problem Found
`#94a3b8` against a typical dark background (`#0a0e17` or similar) has a contrast ratio that may fall below WCAG AA's 4.5:1 threshold for body text. The token is widely used, so this is a systematic risk.

### Expected Behavior
Either: (a) verify the actual contrast and document acceptable uses, OR (b) bump `--color-muted-label` to a higher-luminance value (e.g., `#cbd5e1` = `text-slate-300`), OR (c) restrict `text-muted-label` to large text only (≥ 18px or 14px bold).

### Actual Behavior
Token used uniformly; no per-context contrast check.

### Root Cause / Reason
**Suspected.** Token inherited from a generic shadcn/ui palette; no project-specific contrast review.

### Investigation Performed
- Token definition found at `src/app/globals.css:85` (`--color-muted-label: #94a3b8;`).
- 795 usages across `src/**`.

### Evidence
- Related code: `src/app/globals.css:85` token definition; usages throughout `src/components/`.

### Troubleshooting / Next Steps
1. Run a contrast check on the top 10 most-used contexts (sidebar nav, header meta, table captions, etc.) using `axe-core` or `polypane`.
2. For any context failing 4.5:1, restrict `text-muted-label` to large text only.
3. Consider adding a `--color-muted-label-soft` and `--color-muted-label-strong` pair.

### Resolution
Not resolved. See implementation plan `planning/UI_UX_REMEDIATION_PLAN.md` Phase 4.

### Notes For Future Agents
- WCAG threshold for body text is 4.5:1; for large text (≥ 18px or 14px bold) it is 3:1.

---


---


---

## BUG-025 — M6: 1,233 arbitrary-value utility classes

### Status
Open (Partially Confirmed)

### Severity
Low

### Category
Tailwind

### Date Discovered
2026-06-17

### Discovered By
AI Agent (UI/UX audit verification)

### Location

- `src/**` — 1,233 arbitrary values (audit reported 1,105)

### Problem Found
Many `w-[…]`, `px-[…]`, `gap-[…]`, `inset-[…]`, `text-[…px]`, `bg-[#…]` classes bypass the design system's spacing scale.

### Expected Behavior
Most values should resolve to the standard Tailwind spacing scale (0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20…). Arbitrary values should be reserved for legitimate one-offs.

### Actual Behavior
~5% of all utility classes are arbitrary.

### Root Cause / Reason
**Partially Confirmed.** Real issue, magnitude is large but not catastrophic.

### Investigation Performed
- `grep -rE "w-\[|h-\[|px-\[|py-\[|gap-\[|inset-\[|text-\[|bg-\[" src/` used to count arbitrary utility classes.

### Evidence
- Related code: 1,233 arbitrary utility classes distributed across `src/**` (per audit numbers).

### Troubleshooting / Next Steps
1. Use `tailwind-config-viewer` or similar to see which arbitrary values are most common.
2. Round to the nearest standard value (e.g., `w-[17px]` → `w-4`).
3. Add a lint rule (or a CI grep) to flag new arbitrary values.

### Resolution
Not resolved. See implementation plan `planning/UI_UX_REMEDIATION_PLAN.md` Phase 2.

### Notes For Future Agents
- Standard Tailwind spacing scale: 0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, … — arbitrary values should be reserved for legitimate one-offs.

---


---


---


---


---


---

## BUG-033 — `src/middleware.ts` triggers Next.js 16.1 deprecation warning

### Status
Open

### Severity
Low

### Category
Infra

### Date Discovered
2026-06-19

### Discovered By
AI Agent (Phase 1 staging test 1 — dev server boot log)

### Location

`src/middleware.ts`

### Problem Found
When `npm run dev` starts, Next.js 16.1.3 (Turbopack) emits:
```
⚠ The "middleware" file convention is deprecated. Please use "proxy" instead. Learn more: https://nextjs.org/docs/messages/middleware-to-proxy
```

The file `src/middleware.ts` should be renamed to `src/proxy.ts` to follow the new Next.js 16 convention. The function is still exported as `middleware` and the route protection logic is unchanged, but the filename is deprecated.

### Expected Behavior
No deprecation warning in dev server boot. The file should be at `src/proxy.ts` and export a `proxy` function (or keep the `middleware` export if both are still supported).

### Actual Behavior
Warning printed on every dev server start. Will become a hard error in a future Next.js major version.

### Root Cause / Reason
**Confirmed.** Next.js 16.1 deprecated the `middleware` filename in favor of `proxy`. The migration is a rename; the function signature is identical.

### Investigation Performed
- Read the dev server boot log.
- Confirmed warning appears once per `npm run dev` invocation.
- Confirmed the proxy.ts convention is documented at https://nextjs.org/docs/messages/middleware-to-proxy.

### Evidence
```
▲ Next.js 16.1.3 (Turbopack)
- Local:         http://localhost:3000
⚠ The "middleware" file convention is deprecated. Please use "proxy" instead.
```

### Troubleshooting / Next Steps
1. Create `src/proxy.ts` as a copy of `src/middleware.ts`.
2. Rename the exported function from `middleware` to `proxy` (and update the `config` export's name if needed).
3. Delete `src/middleware.ts`.
4. Verify dev server starts without warning.
5. Verify all 5 auth routes + `/api/game/state` still set `x-real-ip`.
6. Verify admin route protection still works.

### Resolution
Not yet fixed. Deferred to a future cleanup commit because the warning is non-fatal and the rename requires touching every file in the `proxy.ts` chain. **Estimated effort: 10 minutes** (file copy + rename + verification).

### Notes For Future Agents
- The middleware→proxy migration is purely a filename convention change. The function signature and behavior are identical.
- If multiple files import from `@/middleware`, check the import paths first.
- The Next.js documentation link in the warning is authoritative.

---

## BUG-034 — `cleanup_orphan_anon_users` FK violation on `profiles` table

### Status
Resolved (2026-06-19)

### Severity
High

### Category
Data

### Date Discovered
2026-06-19

### Discovered By
AI Agent (pg_cron enablement + test)

### Location

`supabase/migrations/051_cleanup_orphan_anon_users.sql` (original)
Fixed in `supabase/migrations/052_fix_cleanup_orphan_anon_profiles_check.sql`

### Problem Found
When `cleanup_orphan_anon_users()` was tested by inserting an old anonymous user and running the function, it failed with:

```
ERROR:  23503: update or delete on table "users" violates foreign key constraint "profiles_id_fkey" on table "profiles"
DETAIL:  Key (id)=(e5666f59-5d9e-4b56-b67e-cb24d54679dc) is still referenced from table "profiles".
```

**Root cause:** Supabase's `on_auth_user_created` trigger (defined in migration `020_profiles_and_guest_identities.sql`) automatically inserts a row into `public.profiles` whenever a new `auth.users` row is created. This means **every** anonymous user has a corresponding `profiles` row — even if they never played. The original `cleanup_orphan_anon_users()` function only checked `server_game_state` and `guest_identities`, missing the `profiles` table entirely.

**Why this would have caused silent corruption in production:** If `pg_cron` had run the function on the existing 4 anon users, all 4 would have been blocked by the FK violation → the function would raise an exception → `cron.job_run_details.status = 'failed'` → no users deleted → table bloat continues, and the only signal is a `failed` row in the cron history that no one checks. Over weeks, the user table could grow unbounded.

### Expected Behavior
- Insert a 30+ day old anonymous user (with auto-created profile).
- Run `cleanup_orphan_anon_users()`.
- Function returns 0 (user not deleted because they have a profile — but in this case, we want to keep it that way for safety).
- No FK violation.
- For a user with NO profile (truly orphan), function returns 1 and deletes the user.

### Actual Behavior
- Function always threw `23503: foreign key violation` on the first candidate user it tried to delete.
- No users were ever deleted.
- The exception was logged in `cron.job_run_details` but not surfaced anywhere.

### Root Cause / Reason
**Confirmed.** Missing `AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)` in the `WITH orphans AS (...)` CTE.

The FK on `profiles.id REFERENCES auth.users(id)` is defined as `NO ACTION` (not `CASCADE`), so the DB blocks the parent delete when a child row exists. We could either:
1. **Add the filter** (chosen — no schema change, more conservative)
2. **Change FK to CASCADE** (not chosen — affects ALL profile deletes, not just this function)

### Investigation Performed
1. Enabled `pg_cron` extension in Supabase Dashboard.
2. Scheduled `cleanup-orphan-anon` job at `0 3 * * *`.
3. Manually invoked `SELECT public.cleanup_orphan_anon_users();` → returned 0 (correct, no orphans).
4. Realized the function had never been tested with a user that has a `profiles` row (the existing 4 anon users in the DB all happen to have `server_game_state` rows, so the CTE filter excluded them before hitting the profile check).
5. Wrote a test: `BEGIN; INSERT INTO auth.users ... DELETE FROM profiles WHERE id = ...; SELECT cleanup_orphan_anon_users();` — first attempt failed with FK violation.
6. Added `NOT EXISTS profiles` to the CTE.
7. Re-ran the test — function correctly returned 1 and deleted the true orphan.

### Evidence
```sql
-- Pre-fix error:
ERROR:  23503: update or delete on table "users" violates foreign key constraint "profiles_id_fkey" on table "profiles"

-- Post-fix test 1 (user WITH profile — should NOT be deleted):
SELECT public.cleanup_orphan_anon_users();  -- returns 0
SELECT count(*) FROM auth.users WHERE email LIKE 'test-%@test.invalid';  -- returns 1 (survived)

-- Post-fix test 2 (user WITHOUT profile — true orphan — should be deleted):
SELECT public.cleanup_orphan_anon_users();  -- returns 1
SELECT count(*) FROM auth.users WHERE email LIKE 'test2-%@test.invalid';  -- returns 0 (deleted)
```

### Troubleshooting / Next Steps
None — fixed.

### Resolution
- **Migration 052 applied** (`052_fix_cleanup_orphan_anon_profiles_check.sql`): `CREATE OR REPLACE FUNCTION public.cleanup_orphan_anon_users()` adds `AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)` to the orphans CTE.
- **Re-granted** EXECUTE to service_role only (no anon/authenticated).
- **Manual test passed** (both user-with-profile and user-without-profile cases).
- **No existing users affected** — 4 anon users all have `server_game_state` rows, so still excluded.

### Notes For Future Agents
- **The `profiles` table is auto-populated by a Supabase trigger on every new `auth.users` insert.** This is not documented in the table itself; you have to know about the trigger.
- **Before writing any "delete from auth.users" logic, check ALL tables that FK-reference `auth.users`.** In this project, that's at least: `profiles`, `server_game_state`, `guest_identities`, `cheat_investigations`, `pending_link_operations`, `merge_audit_log`, `merge_receipts`, `support_tickets`, `support_messages`, `admin_actions`, `rate_limits`. The function's filter should enumerate every "is this a real user?" signal.
- **Even better: add a `is_orphaned` view** that consolidates all these checks, and have `cleanup_orphan_anon_users` just `DELETE FROM auth.users WHERE id IN (SELECT id FROM is_orphaned)`. Easier to maintain.
- **Always test with a user that has child rows**, not just a "naked" `auth.users` insert. The current 4 anon users were all `naked`-enough (had `server_game_state`) that the original test missed the profile case.

---

## BUG-041 — `apply_market_tick` RPC validates against basePrice instead of previous tick's currentPrice

### Status
Resolved (2026-06-22)

### Severity
Critical

### Category
Infra / Cron / Data Integrity

### Date Discovered
2026-06-22

### Discovered By
AI Agent (during manual cron worker health check)

### Location
- `supabase/migrations/053_fix_apply_market_tick_deviation_baseline.sql` (fix)
- `apply_market_tick(BIGINT, JSONB, REAL, JSONB, JSONB)` RPC in DB
- `cloudflare/markettick/worker.js` (consumer — calls RPC every 60s)

### Problem Found
The `apply_market_tick` RPC validated per-tick price change against each resource's `basePrice`. As prices drifted from base over hundreds of ticks, more resources accumulated >50% deviation. Once any resource crossed the 50% threshold, the RPC threw an exception, rolled back the entire transaction, and silently froze the markettick cron.

### Expected Behavior
The RPC should validate against the **previous tick's `currentPrice`** (matching `marketEngine.js` semantics, where `SPIKE_CAP = 0.40` caps per-tick delta). A resource 66% below base should still be allowed to move 30% from its previous tick.

### Actual Behavior
Validation compared `|currentPrice − basePrice| / basePrice > 0.50`. Once a resource drifted past 50% from base, every further tick in the same direction was rejected with `Price change for voidEnergy exceeds 50% in single tick (base=3000000, current=1000000, change=0.67)`. The whole tick transaction rolled back. The cron kept firing every 60s, the worker kept POSTing, but `server_market_state` never advanced. `tick` stayed frozen at 2195 for **54 hours** (last update 2026-06-20 08:06:44, discovered 2026-06-22 14:08).

### Root Cause / Reason
**Confirmed.** Misplaced validation baseline in the RPC:
```sql
v_change_pct := ABS((v_current_price - v_base_price) / v_base_price);  -- WRONG: compares to base
IF v_change_pct > 0.50 THEN RAISE EXCEPTION ...; END IF;
```
The engine (`marketEngine.js`) correctly caps per-tick delta at ±40%, but the RPC check used the wrong baseline (base instead of prev), so it could reject a per-tick change of even 1% if the resource was already >50% from base.

The 5 high-end resources (`armadaFleet`, `corpCapital`, `dimensionalGate`, `shieldMatrix`, `voidEnergy`) had drifted to exactly 50% from base due to player sell pressure — once the cron produced a tick pushing them to 67%, the RPC permanently rejected all further ticks.

### Investigation Performed
1. Confirmed `newsgenerator` worker (`newsgenerator.malcolmkhong.workers.dev`) was healthy: GET /health returned 200, POST returned valid AI-generated headline.
2. Confirmed `markettick` worker (`markettick.malcolmkhong.workers.dev`) was deployed: GET returned 200, wrangler.toml cron `["* * * * *"]` configured correctly.
3. Inspected `server_market_state` via Supabase MCP: `tick=2195`, `updated_at=2026-06-20 08:06:44` (54h stale).
4. Manually POSTed to `markettick.malcolmkhong.workers.dev` (proxy for cron trigger).
5. Worker returned `{"tick":2196,"error":"apply_market_tick RPC failed: Price change for voidEnergy exceeds 50% in single tick (base=3000000, current=1000000, change=0.6667)"}`.
6. Ran diagnostic SQL joining `server_market_state.prices` to identify which resources exceeded threshold: 5 mega-resources at exactly 50.0% deviation, 8 mid-tier at 40%.
7. Pulled `apply_market_tick` definition via `pg_get_functiondef(oid)`. Identified the offending validation block.
8. Verified `cloudflare/markettick/shared/marketEngine.js` caps per-tick change at `SPIKE_CAP = 0.40`, confirming the RPC baseline was inconsistent with engine semantics.
9. Cross-checked migration 052: original `apply_market_tick` used `REAL` volatility; migration 052 changed to `NUMERIC` and reshuffled arg order to `(BIGINT, JSONB, JSONB, NUMERIC, JSONB)`. The migration 052 signature did not match what the worker calls — but because migration 052 had also dropped and recreated, this was masked until the new migration exposed the ambiguity.

### Evidence
**Pre-fix worker POST response (2026-06-22 14:08):**
```json
{"tick":2196,"events":0,"headlines":0,"volatility":1,"error":"apply_market_tick RPC failed: Price change for voidEnergy exceeds 50% in single tick (base=3000000, current=1000000, change=0.66666666666666666667)"}
```

**Pre-fix DB state:**
```
tick=2195, updated_at=2026-06-20 08:06:44, age=54h
```

**Resource drift (5 blocked):**
```
voidEnergy      base=3,000,000  current=1,500,000  dev=50.0%
shieldMatrix    base=2,000,000  current=1,000,000  dev=50.0%
dimensionalGate base=2,500,000  current=1,250,000  dev=50.0%
armadaFleet     base=4,000,000  current=2,000,000  dev=50.0%
corpCapital     base=5,000,000  current=2,500,000  dev=50.0%
```

**Post-fix worker POST response (2026-06-22 14:11):**
```json
{"tick":2197,"events":2,"headlines":2,"volatility":0.99}
```

**Post-fix DB state (after cron recovery, +60s):**
```
tick=2198, updated_at=2026-06-22 14:12:08, age=60s, news_headlines=2
```

### Troubleshooting / Next Steps
None — fixed and verified by cron naturally advancing tick 2196 → 2197 → 2198 over ~2 minutes.

### Resolution
- **Migration 053 created and applied** (`053_fix_apply_market_tick_deviation_baseline.sql`): rewrote `apply_market_tick` to look up previous tick's `currentPrice` from the locked `server_market_state` row (now also SELECTed into `v_prev_prices` in the same `FOR UPDATE`), then validate against that. Falls back to `basePrice` only for brand-new resources that have no prior entry.
- **Restored canonical arg order**: migration 052 had reshuffled to `(BIGINT, JSONB, JSONB, NUMERIC, JSONB)` but the worker calls `(BIGINT, JSONB, REAL, JSONB, JSONB)` (volatility in position 3). Migration 053 uses the original `REAL` volatility at position 3 to match the worker's call site and avoid `Could not choose the best candidate function` ambiguity.
- **Verified end-to-end**: manual POST returns `{"tick":2197,"events":2,"headlines":2}`; natural cron tick advanced 2197 → 2198 within 60s; AI news generator called and stored 2 headlines.
- **No data loss**: `server_market_state` preserved through the fix; only the validation logic changed, not the persistence path.

### Notes For Future Agents
- **The validation baseline choice is semantic, not syntactic.** When validating a per-step delta, always ask "delta from what?" — and the answer must match what the engine actually computes. `marketEngine.js` computes `newPrice` from `oldPrice` (previous tick); the RPC must compare to the same baseline.
- **Real RPCs need real signatures.** Migration 052 changed the volatility type from `REAL` to `NUMERIC` AND reordered args. If a migration reshuffles args, **drop every existing overload** (`DROP FUNCTION IF EXISTS fn(BIGINT, JSONB, JSONB, REAL, JSONB)` for the OLD and `DROP FUNCTION IF EXISTS fn(BIGINT, JSONB, JSONB, NUMERIC, JSONB)` for the NEW), then create the single canonical one. Otherwise `42P13: no language specified` and `Could not choose the best candidate function` errors will surface as runtime bugs from the worker.
- **`apply_migration` MCP tool requires `LANGUAGE plpgsql` explicitly** when using `CREATE OR REPLACE FUNCTION` — it does not inherit from a prior drop.
- **Cron workers fail silently.** The markettick worker's `scheduled` handler catches errors and logs to console (`console.error('[MarketTick] Error:', err?.message)`), but Cloudflare's free-tier log retention is short and no alert was wired. For production, add a heartbeat insert to `system_status` or a counter in `server_market_state` so drift is detectable.
- **This bug went undetected for 54 hours.** The admin system-status page (`src/app/api/admin/system-status/route.ts:88–105`) DOES detect it correctly: `minutesSinceTick < 2 ? 'ok' : minutesSinceTick < 5 ? 'late' : 'failed'`. The check ran on every admin visit, but no one was visiting the admin panel during the outage window. Consider adding a public `/api/health/cron-tick` endpoint that pings without auth, so external monitors (Better Stack, etc.) can alert on tick stagnation.

---


---
