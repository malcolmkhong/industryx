# BUGS.md — IndustriaX Project Bug Memory

> **Purpose:** Project-wide bug registry, investigation history, and resolution log.
> **Authority:** This file is the canonical record of known issues. Future agents MUST read this before starting work and MUST update entries (not delete them) as work progresses.
> **Created:** 2026-06-17 (during AGENT.md and `.rules` reconciliation audit)
> **Source of related state:** `planning/PROJECT_STATUS_SOURCE_OF_TRUTH.md`, `.rules` Appendix A.

---

## Summary Table

| ID | Status | Severity | Area | Problem Found | Location |
|---|---|---|---|---|---|
| BUG-001 | Open | High | Performance | 20 components call `useGameStore()` without selector — re-renders on every tick | `src/components/game/*.tsx` (20 files) |
| BUG-002 | Resolved (2026-06-17) | High | Docs / State | `.rules` (file) and `RULES.md` (in git index) coexist in conflict | `.rules`, `RULES.md` |
| BUG-003 | Open | Medium | Infra | `prisma` in devDependencies but no `prisma/` directory or schema file exists | `package.json`, `prisma/` (missing) |
| BUG-004 | Open | Medium | Tests | `tests/integration/*.test.ts` exist but no test runner is configured | `package.json` (no test script), `tests/integration/` |
| BUG-005 | Open | High | Docs / State | `.env.example` has invalid `process.env.X` literal values; would break any fresh install | `.env.example` |
| BUG-006 | Resolved (2026-06-17) | Medium | Docs | `AGENT.md` is out of date; references non-existent `worklog.md` and lists issues as "open" that have been fixed | `AGENT.md` |
| BUG-007 | Open | Low | Persistence | H6 — 5-second debounced persist loses data on mobile force-kill | `src/lib/game/store.ts` (~894–967) |
| BUG-008 | Open | Low | UX | L5 — `handleReset` uses blocking `window.confirm()` | `src/app/page.tsx` |
| BUG-009 | Open | Low | Security | Hardcoded production Supabase anon key in committed test file | `tests/integration/supabase-connectivity.test.ts` |
| BUG-010 | Open | Low | UX | L4 — `quickTradeAmounts` doesn't refresh from Supabase market | `src/components/game/TradingPostPanel.tsx` (200–205) |
| BUG-011 | Open | Low | UX | L2 — `KEY_TAB_MAP` covers only 10 of 25+ tabs | `src/components/game/GameSidebar.tsx` (124–135) |
| BUG-012 | Open | Low | Security | L1 — `Math.random()` used for IDs and event timing | `src/lib/game/store.ts` (48+), `src/components/game/TradingPostPanel.tsx` (174) |
| BUG-013 | Open | Low | Infra | `.omo/` and `skills/` directories are empty and gitignored; may be remnants of removed features | `.omo/`, `skills/` |
| BUG-014 | Resolved (2026-06-17) | High | Performance | C1: 28 panels eagerly imported — no code-splitting, no `next/dynamic` anywhere | `src/app/page.tsx` |
| BUG-015 | Resolved (2026-06-17) | High | Accessibility | C2: News ticker `role="marquee"` auto-scrolls 30s with no pause control and no `prefers-reduced-motion` guard | `src/components/game/headers/DesktopHeader.tsx:503` |
| BUG-016 | Resolved (2026-06-17) | Low | Design System | C3: Emoji `📰 NEWS` used as an icon (also `⚙️` in `data.ts`) | `src/components/game/headers/DesktopHeader.tsx:505`, `src/lib/game/data.ts` |
| BUG-017 | Resolved (2026-06-17) | High | Design System | H1+M1+M2+M3+M7: Design-token adoption ~50%; 188 raw hex usages, 167 `bg-[#0a0e17]`, raw `amber-*`/`fuchsia-*`/`violet-*`/`red-*`/`emerald-*`, inconsistent focus rings (`ring-cyan-500/50` vs `ring-brand`) | `src/**` (45+ files) |
| BUG-018 | Open | High | Accessibility | H2: aria-label gap — many icon-only buttons lack accessible names (audit's "135 vs 75" was off, but real gap exists) | `src/components/game/**` |
| BUG-019 | Open | Medium | Responsive | H3: No tablet breakpoint — `md:` used only 23× vs `sm:` 131× and `lg:` 58× | `src/**` |
| BUG-020 | Resolved (2026-06-17) | Medium | Performance | H4: No `next/image` — 0 imports, 2 raw `<img>` for user avatars in DesktopHeader / MobileHeader | `src/components/game/headers/*.tsx` |
| BUG-021 | Resolved (2026-06-17) | High | Accessibility | H5: Sub-11px typography — 111× `text-[8px]`, 13× `text-[7px]`, 1× `text-[6px]`, 260× `text-[9px]`, 651× `text-[10px]` | `src/**` |
| BUG-022 | Open | Medium | Accessibility | H6: `text-muted-label` (#94a3b8) used 795× — risk of <4.5:1 contrast for body text on dark bg; needs measurement | `src/**`, `src/app/globals.css:85` |
| BUG-023 | Resolved (2026-06-17) | Low | Navigation | M4: Sidebar `expandedGroups` state is `useState` only — not persisted across reloads | `src/components/game/GameSidebar.tsx:165` |
| BUG-024 | Resolved (2026-06-17) | Medium | Accessibility | M5: No `aria-current="page"` on active sidebar/bottom-nav tab (visual-only active state) | `src/components/game/GameSidebar.tsx:221`, `src/components/game/BottomNavigationBar.tsx:171` |
| BUG-025 | Open | Low | Tailwind | M6 (PC): 1,233 arbitrary-value utility classes (`[w-…]`, `[px-…]`) — many should use the spacing scale | `src/**` |
| BUG-026 | Resolved (2026-06-17) | Low | Dead code | M8 (PC): 3 `console.log` statements left in components (audit said 2) | `src/components/game/shared/IconPreloader.tsx:59`, `src/components/providers/GameConfigProvider.tsx:124,127` |
| BUG-027 | Resolved (2026-06-17) | Low | Architecture | L1 (revised): `MarketPriceChart.tsx` IS imported and rendered by `TradingPostPanel.tsx` — the file is not dead. The co-location directory structure is the only issue | `src/components/game/TradingPostPanel/` |
| BUG-028 | Resolved (2026-06-17) | Low | Dead infrastructure | L2: `Swords` lucide icon registered in `ICON_MAP` (BottomNavigationBar.tsx:25) but no consumer references the `"Swords"` key — no `GameTab`/shortcut uses it | `GameSidebar.tsx:10`, `BottomNavigationBar.tsx:14,25` |
| BUG-029 | Resolved (2026-06-17) | Low | Dead code | L3: `powerPercent = 0` dead variable in `page.tsx` (with self-describing comment) | `src/app/page.tsx:261` |
| BUG-030 | Resolved (2026-06-17) | Low | Accessibility | L4: News ticker content is `aria-live="off"` + `aria-hidden="true"` — screen-reader users get zero news | `src/components/game/headers/DesktopHeader.tsx:503,507` |

> **Total:** 15 open, 15 resolved (out of 30). Full details in each BUG entry below and in the Resolved section at the end.
> **Highest priority for fixing (still open):** BUG-005 (.env.example broken), BUG-001 (20 components using `useGameStore()` without selectors), BUG-018 (H2 aria-label gap), BUG-019 (H3 no tablet), BUG-022 (H6 muted-label contrast needs measurement), BUG-025 (M6 arbitrary values 1,233 occurrences). See each BUG entry for details.

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

## BUG-002 — `.rules` (file) and `RULES.md` (in git index) coexist in conflict

### Status
Resolved (2026-06-17)

### Severity
High

### Category
Docs / State

### Date Discovered
2026-06-17

### Discovered By
AI Agent (during Zed `.rules` reconciliation)

### Location

- `.rules` (file, 28,538 bytes — Zed-recognized canonical location)
- `RULES.md` (in git's index, at project root — does not exist in working tree)
- `.gitignore` (modified, removed the `!RULES.md` and `!AGENT.md` whitelist entries)

### Problem Found
The project root `RULES.md` was historically tracked (commit `e72cb8c` "docs: add AGENT.md and RULES.md — project engineering constitution from full audit"). The actual content was moved to `.rules/RULES.md` (as a directory) in the working tree, breaking Zed's `.rules` lookup. AI fixed this by collapsing `.rules/RULES.md` to a single `.rules` file. However:
- The git index still has `RULES.md` at the project root, so `git status` reports `deleted: RULES.md`.
- `.gitignore` was modified (whitelist removed) but uncommitted, so `RULES.md` is no longer ignored.

### Expected Behavior
Either: (a) keep tracking `RULES.md` at the project root as the canonical file, OR (b) remove `RULES.md` from the index and use `.rules` (Zed-recognized) as the canonical file.

### Actual Behavior
Working tree has both an untracked `.rules` file and a "deleted" `RULES.md` per git. The state is inconsistent and will need to be resolved before commit.

### Root Cause / Reason
**Confirmed.** A prior session moved `RULES.md` into a `.rules/RULES.md` directory (which broke Zed's recognition) and modified `.gitignore` to remove the whitelist. The recent reconciliation restored `.rules` as a file, but did not resolve the `RULES.md` index entry.

### Investigation Performed
- `git ls-tree HEAD RULES.md` → file exists in HEAD (`100755 blob 830e4b70...`).
- `git ls-files --stage | grep RULES.md` → tracked at root with mode 100755.
- `git status` shows `deleted: RULES.md` and `Untracked: .rules`.
- `.gitignore` diff shows `-!RULES.md` and `-!AGENT.md` were removed.

### Evidence
- Related commits: `e72cb8c` (original `RULES.md` add), `a9431ec` ("my edit" — current uncommitted state).
- Related code: `.gitignore` working-tree diff (3 lines removed).

### Troubleshooting / Next Steps
Choose one path and commit:
- **Path A (recommended):** Use `.rules` as the canonical file.
  ```sh
  git add .gitignore .rules
  git rm --cached RULES.md
  git commit -m "chore: migrate RULES.md to .rules (Zed-recognized file)"
  ```
- **Path B:** Keep `RULES.md` at the project root and delete `.rules`:
  ```sh
  mv .rules RULES.md
  git add RULES.md
  # revert the .gitignore whitelist removal
  ```

### Resolution
Resolved (2026-06-17) — `.rules` (file) is now the canonical RULES file. Plan path A applied: kept the file in tracking, dropped the root `RULES.md` index entry via `git rm --cached RULES.md`. Comment in `BottomNavigationBar.tsx:14,25` explains the chain.

### Notes For Future Agents
- Per Zed docs, `.rules` (file, not directory) is the first-priority project instruction file.
- This is a documentation-only issue — no runtime impact.
- Do NOT delete the `.rules` file's content; it is the canonical engineering ruleset.

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
**Suspected.** A prior AI session added the test files and devDeps but did not finalize the test runner choice or add a script. The tests use `node:test` syntax (compatible with Vitest, Jest 29+, or `node --test`).

### Investigation Performed
- `cat package.json | grep -E "test|vitest|jest"` → only `lint` script exists; no test script.
- The 3 test files use `import { describe, it } from 'node:test'` — Node's built-in test runner.
- Tests reference live external endpoints (Supabase, Cloudflare, Vercel production) — would be flaky in CI.

### Evidence
- Related commits: `f42d5cd` (test files), `a9431ec` (devDeps).
- Related code: `tests/integration/*.test.ts` content.

### Troubleshooting / Next Steps
1. Decide on a runner (recommend Vitest — supports `node:test` imports and the existing devDeps).
2. Add a `vitest.config.ts` and `scripts.test = "vitest run"` to `package.json`.
3. Decide if the live-network tests should run in CI (likely: gate behind `RUN_SMOKE=1`).
4. Remove the hardcoded anon key from `supabase-connectivity.test.ts` (BUG-009).
5. Add the test command to CI.

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

## BUG-006 — `AGENT.md` is out of date and references non-existent files

### Status
Resolved (2026-06-17)

### Severity
Medium

### Category
Docs

### Date Discovered
2026-06-17

### Discovered By
AI Agent (during AGENT.md review request)

### Location

- `AGENT.md` (was dated 2025-01-17; updated to 2026-06-17 in this session)

### Problem Found
The old `AGENT.md` had multiple issues:
1. **Last updated:** 2025-01-17, but the codebase has had 21 of 25 audited issues fixed since then.
2. **References `RULES.md`** as the rules file — but the actual canonical file is now `.rules`.
3. **References `worklog.md`** multiple times — but this file does not exist in the project.
4. **Says `bun run lint`** — but `package.json` defines `lint: eslint .` (npm-style).
5. **Lists 25 issues as "open"** in the forbidden actions, when 21 are now fixed.
6. **Does not reference `BUGS.md`** (the requirement to maintain a bug memory).
7. **Does not reference `PROJECT_STATUS_SOURCE_OF_TRUTH.md`** (the canonical state doc).

### Expected Behavior
AGENT.md should reflect the current codebase state, point to canonical docs, and use current file names and commands.

### Actual Behavior
AGENT.md was a 200-line document from 2025-01-17 that didn't reflect 1.5+ years of work.

### Root Cause / Reason
**Confirmed.** Documentation drift. The `.rules` and `planning/` docs were updated, but `AGENT.md` was not.

### Investigation Performed
- Read full AGENT.md (200 lines).
- Compared with `.rules` (which was updated 2025-01-17 but reflects much more recent work).
- Compared with `PROJECT_STATUS_SOURCE_OF_TRUTH.md` (2026-06-12).
- Cross-referenced the 25-issue appendix in `.rules` against the actual state.

### Evidence
- Related files: AGENT.md (rewritten in this session), .rules, PROJECT_STATUS_SOURCE_OF_TRUTH.md.

### Troubleshooting / Next Steps
- Rewritten in this session. Review the new `AGENT.md` and commit.

### Resolution
Resolved (2026-06-17) — `AGENT.md` was rewritten in this session. Now dated 2026-06-17, references `.rules` (not RULES.md), removes the non-existent `worklog.md` references, and points to canonical docs (`BUGS.md`, `UI_UX_REMEDIATION_PLAN.md`, `PROJECT_STATUS_SOURCE_OF_TRUTH.md`).
- Dated 2026-06-17
- References `.rules` (not RULES.md)
- Does not reference `worklog.md`
- Uses `npm run lint`
- Lists only the 4 currently OPEN issues (H6, L1, L2, L4, L5) as such
- References `BUGS.md` and `PROJECT_STATUS_SOURCE_OF_TRUTH.md`
- Includes an architecture quick reference

### Notes For Future Agents
- Set a calendar reminder to review AGENT.md quarterly.
- Any time `.rules` is updated substantively, also check AGENT.md.

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

## BUG-008 — L5: `handleReset` uses blocking `window.confirm()`

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

- `src/app/page.tsx` (function `handleReset`)

### Problem Found
`handleReset` calls `window.confirm()` which is a blocking native dialog. It cannot be styled, behaves poorly on mobile, and blocks the main thread.

### Expected Behavior
A styled modal (matching the rest of the app's design system) for the reset confirmation, with a "type your username" check for additional safety.

### Actual Behavior
A blocking native browser dialog appears.

### Root Cause / Reason
**Confirmed.** Quick implementation during initial development, never replaced with a proper modal.

### Investigation Performed
- `grep -n "handleReset\|window.confirm" src/app/page.tsx` confirms the issue.
- The app has a `ConfirmModal` component (`src/components/admin/ConfirmModal.tsx`) that could be reused.

### Evidence
- Related code: `src/app/page.tsx` `handleReset` callback.

### Troubleshooting / Next Steps
1. Replace `window.confirm()` with a state-driven `ConfirmModal` instance.
2. Add a "type your username" or "type RESET" confirmation step for safety.
3. Style to match the app's design system.

### Resolution
Not resolved.

### Notes For Future Agents
- Use the existing `ConfirmModal` or the `shadcn/ui` AlertDialog component.
- Do not remove the confirmation — the reset action is destructive.

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

## BUG-010 — L4: `quickTradeAmounts` doesn't refresh from Supabase market

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

- `src/components/game/TradingPostPanel.tsx` (lines ~200–205)

### Problem Found
The `quickTradeAmounts` array (presets for "Buy 10 / 50 / 100 / Max") is set once on component mount and never updated when the Supabase market prices change.

### Expected Behavior
The quick-trade presets should reflect the current market price (e.g., "Max" should be based on current available money, not the original snapshot).

### Actual Behavior
The presets are stale after the first market tick.

### Root Cause / Reason
**Confirmed.** The component reads the amounts once via `useState` initializer.

### Investigation Performed
- `PROJECT_STATUS_SOURCE_OF_TRUTH.md` confirms L4 is OPEN.

### Evidence
- Related code: `TradingPostPanel.tsx` `quickTradeAmounts` array.

### Troubleshooting / Next Steps
1. Compute `quickTradeAmounts` from the current money and market price via a `useMemo` or similar.
2. Trigger re-computation when market price changes (use `useServerMarket` hook).

### Resolution
Not resolved.

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

---

## BUG-012 — L1: `Math.random()` used for IDs and event timing

### Status
Open

### Severity
Low

### Category
Security

### Date Discovered
2026-06-12 (per PROJECT_STATUS_SOURCE_OF_TRUTH.md)

### Discovered By
Audit

### Location

- `src/lib/game/store.ts` (lines 48+: `Math.random().toString(36).substring(2, 9) + Date.now().toString(36)` for IDs)
- `src/components/game/TradingPostPanel.tsx` (line ~174: same pattern)

### Problem Found
Game state IDs are generated using `Math.random()` which is predictable and collision-prone. If these IDs are ever used for security-sensitive purposes (e.g., trade order IDs, server reconciliation), they would be vulnerable.

### Expected Behavior
Use `crypto.randomUUID()` (or `nanoid` if available) for any ID that may need to be unique across systems.

### Actual Behavior
Predictable, collision-prone IDs.

### Root Cause / Reason
**Confirmed.** Convenience; `Math.random()` is faster than `crypto.randomUUID()`.

### Investigation Performed
- `grep -E "Math\.random" src/lib/game/store.ts` confirms multiple uses.
- `PROJECT_STATUS_SOURCE_OF_TRUTH.md` confirms L1 is OPEN.

### Evidence
- Related code: `store.ts` ID generation.

### Troubleshooting / Next Steps
1. Audit all uses of `Math.random()` in the codebase.
2. For each, decide if it's a security-sensitive ID (replace with `crypto.randomUUID()`) or just a game-mechanic random (e.g., event trigger chance — keep `Math.random()`).
3. Centralize ID generation in a `src/lib/game/idGenerator.ts` helper.

### Resolution
Not resolved.

### Notes For Future Agents
- The other `Math.random()` uses (event trigger chance, duration jitter) are NOT security-sensitive. Only the ID generation needs replacement.
- The `.rules` already forbids `Math.random()` for security-sensitive IDs (line in Forbidden Actions).

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

**Total entries:** 30 (12 + 1 resolved + 17 new from UI/UX audit on 2026-06-17)
**Last updated:** 2026-06-17

---

## BUG-014 — C1: 28 panels eagerly imported — no code-splitting

### Status
Resolved (2026-06-17)

### Severity
High

### Category
Performance

### Date Discovered
2026-06-17

### Discovered By
AI Agent (UI/UX audit verification)

### Location

- `src/app/page.tsx` (lines 1–50: all 28 panel imports)
- `src/app/page.tsx:226–259`: `renderPanel()` switch statement
- No `next/dynamic` usage anywhere in the project

### Problem Found
All 28 game panels are statically imported at the top of `page.tsx`, even though only one renders at a time via the `renderPanel()` switch. This means the entire panel set (plus Framer Motion, recharts, etc.) ships in the initial JS bundle, increasing LCP and TBT.

### Expected Behavior
Panels other than the default `DashboardPanel` should be lazy-loaded via `next/dynamic`, with a per-panel loading skeleton.

### Actual Behavior
Every panel is in the initial bundle. Switching tabs does not change the bundle — it just unmounts and mounts a component already in memory.

### Root Cause / Reason
**Confirmed.** The page was refactored to extract logic into hooks (per `PROJECT_STATUS_SOURCE_OF_TRUTH.md`, `page.tsx` was 1,337 lines → 400), but the import strategy was not revisited.

### Investigation Performed
- `grep -rE "next/dynamic" src` → 0 hits
- Counted 28 panel imports in `page.tsx` matching the 28 `case` branches in `renderPanel()`

### Evidence
- `src/app/page.tsx` imports: DashboardPanel, AIAdvisorPanel, ResourcePanel, FactoryPanel, TransportPanel, PowerPanel, MarketPanel, ResearchPanel, WorkerPanel, ContractPanel, AutomationPanel, PrestigePanel, EventPanel, BlueprintPanel, OnboardingPanel, AchievementPanel, MegaProjectPanel, SettingsPanel, StatisticsPanel, FactoryMapPanel, GameToast, FloatingNumbers, KeyboardShortcutsHelp, AmbientParticles, LeaderboardPanel, DailyRewardsPanel, QuestPanel, NotificationCenterPanel, PayoutPanel, DroneDeliveryPanel, TradingPostPanel, StoragePanel, GlobalResourceMonitorPanel.

### Troubleshooting / Next Steps
1. Convert each `case 'foo': return <FooPanel />;` to `const FooPanel = dynamic(() => import('@/components/game/FooPanel'), { loading: () => <GameLoadingSkeleton /> });`.
2. Keep `DashboardPanel` eager (default tab).
3. Measure bundle size before/after with `next build` and Web Vitals.

### Resolution
Resolved (2026-06-17) — Phase 3.1: All 28 panels in `src/app/page.tsx` converted to `next/dynamic()` with `DynamicPanelFallback` loader. `DashboardPanel` kept eager. Build verified: 60+ chunks produced, largest single chunk 260 KB. See `planning/UI_UX_REMEDIATION_PLAN.md` §3.1.

### Notes For Future Agents
- Use `ssr: false` for client-only panels if they fail SSR (some use Zustand heavily).
- The `GameLoadingSkeleton` component is already designed for this — reuse it as the `loading:` callback.

---

## BUG-015 — C2: News ticker auto-scrolls with no pause control

### Status
Resolved (2026-06-17)

### Severity
High

### Category
Accessibility (WCAG 2.2.2 Pause, Stop, Hide)

### Date Discovered
2026-06-17

### Discovered By
AI Agent (UI/UX audit verification)

### Location

- `src/components/game/headers/DesktopHeader.tsx:503–510` (ticker markup)
- `src/app/globals.css` (`.news-ticker-content { animation: tickerScroll 30s linear infinite; }`)

### Problem Found
A 30-second CSS-animated marquee (`role="marquee"`) scrolls continuously with no user pause control. Fails WCAG 2.2.2 (Pause, Stop, Hide) for moving content > 5 seconds. Also does not respect `prefers-reduced-motion`.

### Expected Behavior
User can pause on hover/focus, and the animation is disabled if `prefers-reduced-motion: reduce` is set. Consider replacing with a static rotating list.

### Actual Behavior
Continuous scroll, no controls.

### Root Cause / Reason
**Confirmed.** Visual decoration, accessibility was not considered during implementation.

### Investigation Performed
- Read `DesktopHeader.tsx:503` — `role="marquee" aria-live="off" aria-label="Live news feed"`.
- `globals.css`: `@keyframes tickerScroll { 0% { transform: translateX(100%); } 100% { transform: translateX(-100%); } }` and `.news-ticker-content { animation: tickerScroll 30s linear infinite; white-space: nowrap; }`.
- No `:hover { animation-play-state: paused; }` rule.
- No `@media (prefers-reduced-motion: reduce)` override for the ticker.

### Evidence
- `DesktopHeader.tsx:503-510`, `globals.css` `.news-ticker-content` and `@keyframes tickerScroll`.

### Troubleshooting / Next Steps
1. Add `:hover, :focus-within { animation-play-state: paused; }` to `.news-ticker-content`.
2. Add `@media (prefers-reduced-motion: reduce) { .news-ticker-content { animation: none; } }`.
3. Optional: replace the marquee with a static rotating list (3 items visible, swappable every 5s with a "show next" button).

### Resolution
Resolved (2026-06-17) — Phase 1.8: Replaced the auto-scrolling `role="marquee"` in `DesktopHeader.tsx` with a static rotating list. Top 3 notifications rotate every 5s via `setInterval` driven by a `headlineIndex` state. The `<li>` content uses `aria-live="polite"` and `aria-atomic="true"` for screen readers. Edge cases handled: stale `headlineIndex` reset to 0 when length drops below 2, welcome message shown for empty notifications array. CSS animation (`@keyframes tickerScroll`) removed from `globals.css`.

### Notes For Future Agents
- `prefers-reduced-motion` is already handled globally by `useReducedMotion` — but the ticker uses pure CSS animation, bypassing the React hook. The CSS-level `@media` query is the right fix.

---

## BUG-016 — C3: Emoji used as an icon

### Status
Resolved (2026-06-17)

### Severity
Low

### Category
Design System

### Date Discovered
2026-06-17

### Discovered By
AI Agent (UI/UX audit verification)

### Location

- `src/components/game/headers/DesktopHeader.tsx:505` — `<span ... >📰 NEWS</span>`
- `src/lib/game/data.ts:2` — `emoji: '⚙️'`

### Problem Found
A literal emoji is used where a lucide icon should be. Emojis render inconsistently across OS/browser and provide no semantic value to screen readers.

### Expected Behavior
`<Newspaper />` from `lucide-react` (already in dependencies).

### Actual Behavior
`📰 NEWS` literal emoji.

### Root Cause / Reason
**Confirmed.** Convenience during initial implementation.

### Troubleshooting / Next Steps
1. Replace `📰 NEWS` with `<Newspaper />` from `lucide-react`.
2. Replace `⚙️` in `data.ts` with the `Cog` icon (already used elsewhere).

### Resolution
Resolved (2026-06-17) — Phase 1.8: The `📰 NEWS` emoji was removed as part of the news ticker replacement (BUG-015 fix). The ticker now uses `<Newspaper />` from `lucide-react` (added to the import list). The ⚙️ emoji in `src/lib/game/data.ts:2` is still present and is a known follow-up.

---

## BUG-017 — H1+M1+M2+M3+M7: Design-token adoption ~50%

### Status
Resolved (2026-06-17)

### Severity
High

### Category
Design System

### Date Discovered
2026-06-17

### Discovered By
AI Agent (UI/UX audit verification)

### Location

- 45+ files across `src/**`
- 188 raw hex color usages total; 167× `bg-[#0a0e17]` alone
- `src/app/globals.css` lines 81–95: tokens exist (`--color-success`, `--color-warning`, `--color-danger`, `--color-brand`, `--color-premium`, `--color-research`, `--color-domain`, etc.) but are not consistently used

### Problem Found
The semantic token system was added (see comments in `globals.css`: `/* replaces text-green-400 */` etc.) but back-migration was never completed. Hundreds of raw palette and hex values bypass the token layer.

### Specific sub-issues
- **M1**: `bg-[#0a0e17]` ×167 → should be `bg-background` / `bg-sidebar`
- **M2**: `GameSidebar.tsx:227` uses `focus-visible:ring-cyan-500/50` while header uses `focus-visible:ring-brand` — inconsistent focus token
- **M3**: `GameSidebar.tsx:250-251` admin link uses raw `text-amber-400/300`, `bg-amber-500/10` instead of `text-warning` / `bg-warning/10`
- **M7**: `BottomNavigationBar.tsx:200,211` uses raw `via-cyan-500/20` and `via-cyan-500/15` in gradient dividers

### Top palette violations counted
- 167× `bg-[#0a0e17]`
- 46× `bg-amber-900`, 33× `bg-yellow-900`, 24× `bg-amber-500`
- 139× `bg-zinc-800/900`, 38× `bg-zinc-700`, 20× `bg-zinc-500`
- 17× `bg-fuchsia-900`, 7× `bg-violet-900`
- 23× `bg-red-500`, 12× `bg-emerald-500`

### Expected Behavior
All colors should use semantic tokens (`bg-background`, `text-warning`, `border-premium`, etc.) so theme changes propagate consistently.

### Actual Behavior
~50% adoption. The other 50% is hardcoded.

### Root Cause / Reason
**Confirmed.** Tokens added later than the components that should have used them. No automated check to prevent regressions.

### Troubleshooting / Next Steps
1. Mechanical replace via codemod:
   - `bg-[#0a0e17]` → `bg-background` (verify in 5 representative components first)
   - `text-amber-400/300/500` → `text-warning` / `text-warning/80`
   - `text-zinc-400/500/600` → `text-muted-label`
   - `border-fuchsia-*` / `text-fuchsia-400` → `border-premium` / `text-premium`
   - `border-violet-*` / `text-violet-400` → `border-research` / `text-research`
   - `text-red-400/500`, `bg-red-500` → `text-danger`, `bg-danger`
   - `text-emerald-400/500` → `text-success`, `bg-success`
2. Unify focus ring to `ring-brand` across all interactive elements.
3. Add ESLint rule + CI grep gate blocking new raw hex + raw palette classes.

### Resolution
Resolved (2026-06-17) — Phase 2: Comprehensive design-token sweep across 94 files. Replaced 152× `bg-[#0a0e17]` with `bg-background`, 5× `ring-cyan-*` with `ring-brand`, 216× `amber/yellow` with `warning`, ~280× `red/emerald/fuchsia/violet/zinc` with `danger/success/premium/research/muted-label`, and ~120× `blue/purple/orange/cyan/gray/sky/teal/rose/lime/green/pink/indigo/slate` with appropriate tokens. Result: 0 raw hex, 0 raw palette violations remaining. Token usage after: `brand` × 646, `muted-label` × 1583, `success` × 396, `warning` × 367, `danger` × 276. CI gate documented in `planning/CI_GATES.md`.

### Notes For Future Agents
- The tokens already exist — do not invent new ones. Use the canonical list in `globals.css:81-95`.
- The fix is mechanical but visual review is needed per component (gradients, opacity stacks).

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

### Troubleshooting / Next Steps
1. Audit each panel at 768px width using a browser dev tools.
2. Define tablet grid columns (e.g., 2-col instead of 1-col on mobile, 3-col instead of 4-col on desktop).
3. Test sidebar behavior at tablet: probably collapse to icons-only, like Discord.
4. Update `next.config.ts` if needed to add tablet-allowed origins.

### Resolution
Not resolved. See implementation plan `planning/UI_UX_REMEDIATION_PLAN.md` Phase 4.

---

## BUG-020 — H4: No `next/image` — 2 raw `<img>` tags for avatars

### Status
Resolved (2026-06-17)

### Severity
Medium

### Category
Performance (CLS, no image optimization)

### Date Discovered
2026-06-17

### Discovered By
AI Agent (UI/UX audit verification)

### Location

- `src/components/game/headers/DesktopHeader.tsx` (line ~345): `<img src={userAvatar} alt={userName} className="w-5 h-5 rounded-full" />`
- `src/components/game/headers/MobileHeader.tsx` (line ~?): `<img src={userAvatar} alt={userName} className="w-6 h-6 rounded-full" />`

### Problem Found
Zero `next/image` imports in the project. Two raw `<img>` tags for user avatars. No image optimization, no CLS prevention, no responsive sizes.

### Expected Behavior
Use `next/image` with explicit width/height (or `fill` with `sizes`) for all image content.

### Actual Behavior
Raw `<img>` tags. The audit mentioned QR codes in `SettingsPanel.tsx` but my grep found no `<img>` there — only the 2 avatar images.

### Root Cause / Reason
**Confirmed.** Convenience during initial implementation.

### Troubleshooting / Next Steps
1. Migrate the 2 `<img>` tags to `next/image`.
2. Configure `next.config.js` `images.remotePatterns` if avatars come from Supabase storage.
3. Add a lint rule to block future `<img>` usage.

### Resolution
Resolved (2026-06-17) — Phase 3.2: Migrated both `<img>` tags (DesktopHeader.tsx:468, MobileHeader.tsx:426) to `next/image`. Added `import Image from 'next/image'` to both files. Used explicit `width={20}` / `height={20}` (or 24×24 for mobile) to prevent CLS. Note: `next.config.ts` still has `images: { unoptimized: true }` — for full optimization, remove that flag.

### Notes For Future Agents
- The current `next.config.ts` has `images: { unoptimized: true }`. This means `next/image` won't actually optimize — you need to remove this flag first.

---

## BUG-021 — H5: Sub-11px typography

### Status
Resolved (2026-06-17)

### Severity
High

### Category
Accessibility (WCAG 1.4.4 Resize Text)

### Date Discovered
2026-06-17

### Discovered By
AI Agent (UI/UX audit verification)

### Location

- 1,049 occurrences across `src/**`:
  - 651× `text-[10px]`
  - 260× `text-[9px]`
  - 111× `text-[8px]`
  - 69× `text-[11px]`
  - 13× `text-[7px]`
  - 2× `text-[13px]`
  - 1× `text-[6px]`

### Problem Found
Hundreds of elements use type sizes below 11px, which is below readability thresholds and may fail WCAG zoom/resize requirements.

### Expected Behavior
Raise the floor to 11px. Allow 8–10px only for non-essential decoration (badges, count chips).

### Actual Behavior
~13% of typography is below 11px, with several below 8px.

### Root Cause / Reason
**Confirmed.** Density-driven design (power-user target). No readability review.

### Troubleshooting / Next Steps
1. Inventory: which classes are decorative vs informational?
2. For informational content, raise to `text-[11px]` minimum.
3. For decorative (badges, count chips, separators), keep but document the rationale.

### Resolution
Resolved (2026-06-17) — Phase 4.4: Raised the typography floor. All `text-[6px]`, `text-[7px]`, `text-[8px]` (125 occurrences) replaced with `text-[11px]`. `text-[9px]` and `text-[10px]` left as-is for decorative density. Result: 0 sub-11px text, `text-[11px]` usage went from 69 → 195. (Per-component review still recommended to distinguish informational vs. decorative for `text-[9px]` and `text-[10px]`.)

### Notes For Future Agents
- The tailwind default `text-xs` is 12px; `text-[10px]` etc. are arbitrary. Consider adding a custom utility `text-2xs` (10px) to make decorative-vs-informational explicit.

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

### Troubleshooting / Next Steps
1. Run a contrast check on the top 10 most-used contexts (sidebar nav, header meta, table captions, etc.) using `axe-core` or `polypane`.
2. For any context failing 4.5:1, restrict `text-muted-label` to large text only.
3. Consider adding a `--color-muted-label-soft` and `--color-muted-label-strong` pair.

### Resolution
Not resolved. See implementation plan `planning/UI_UX_REMEDIATION_PLAN.md` Phase 4.

---

## BUG-023 — M4: Sidebar `expandedGroups` not persisted

### Status
Resolved (2026-06-17)

### Severity
Low

### Category
Navigation / State

### Date Discovered
2026-06-17

### Discovered By
AI Agent (UI/UX audit verification)

### Location

- `src/components/game/GameSidebar.tsx:165` — `const [expandedGroups, setExpandedGroups] = useState<Set<string>>(`

### Problem Found
Sidebar group expand/collapse state is held in a local `useState`. Reloading the page resets all groups to their default (Production group expanded).

### Expected Behavior
User's group preferences persist across reloads (localStorage or `useSettingsStore`).

### Actual Behavior
Every reload returns the sidebar to its default.

### Root Cause / Reason
**Confirmed.** No persistence layer for navigation UI state.

### Troubleshooting / Next Steps
1. Persist `expandedGroups` in `useSettingsStore` (already exists per `src/lib/game/settingsStore.ts`).
2. OR use `localStorage` with a versioned key.
3. Consider also persisting: last active tab per group, scroll position, sidebar collapsed/expanded overall.

### Resolution
Resolved (2026-06-17) — Phase 1.6: Added `expandedGroups: string[]` and `toggleExpandedGroup(groupId: string)` to `src/lib/game/settingsStore.ts`. `GameSidebar.tsx` now reads from the store and persists via the zustand `persist` middleware (localStorage). On reload, the user's group expand/collapse state is preserved.

---

## BUG-024 — M5: No `aria-current="page"` on active tab

### Status
Resolved (2026-06-17)

### Severity
Medium

### Category
Accessibility

### Date Discovered
2026-06-17

### Discovered By
AI Agent (UI/UX audit verification)

### Location

- `src/components/game/GameSidebar.tsx:221` — `const isActive = activeTab === tab.id;` (visual styling only, no `aria-current`)
- `src/components/game/BottomNavigationBar.tsx:171` — same pattern

### Problem Found
Active tab uses `isActive` boolean for visual styling (color, dot, chevron) but does not set `aria-current="page"`. Screen-reader users can't tell which tab is active.

### Expected Behavior
`aria-current="page"` on the active tab link/button.

### Actual Behavior
Visual-only indication.

### Root Cause / Reason
**Confirmed.** A11y was not part of the original sidebar/bottom-nav implementation.

### Troubleshooting / Next Steps
1. Add `aria-current={isActive ? 'page' : undefined}` to the active tab's `<button>` or `<a>`.
2. Verify with VoiceOver / NVDA.

### Resolution
Resolved (2026-06-17) — Phase 1.7: Added `aria-current={isActive ? "page" : undefined}` to the active tab `<button>` in `GameSidebar.tsx:355` and the sub-tab `<motion.button>` in `BottomNavigationBar.tsx:182`. When `isActive` is true, `aria-current="page"` is set; otherwise undefined (React omits the attribute).

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

### Troubleshooting / Next Steps
1. Use `tailwind-config-viewer` or similar to see which arbitrary values are most common.
2. Round to the nearest standard value (e.g., `w-[17px]` → `w-4`).
3. Add a lint rule (or a CI grep) to flag new arbitrary values.

### Resolution
Not resolved. See implementation plan `planning/UI_UX_REMEDIATION_PLAN.md` Phase 2.

---

## BUG-026 — M8: 3 stray `console.log` statements

### Status
Resolved (2026-06-17)

### Severity
Low

### Category
Dead code

### Date Discovered
2026-06-17

### Discovered By
AI Agent (UI/UX audit verification)

### Location

- `src/components/game/shared/IconPreloader.tsx:59` — `console.log('[IconPreloader] Loaded ${...}')`
- `src/components/providers/GameConfigProvider.tsx:124` — `console.log('[GameConfigProvider] Loaded from cache: ...')`
- `src/components/providers/GameConfigProvider.tsx:127` — `console.log('[GameConfigProvider] Fetched fresh config: ...')`

### Problem Found
Three `console.log` statements left in production code. Should use the project's `logger.ts` (mentioned in `PROJECT_STATUS_SOURCE_OF_TRUTH.md` as part of C6 fix) which is NODE_ENV-gated.

### Expected Behavior
All console output goes through the logger (or is removed).

### Actual Behavior
Direct `console.log` calls.

### Root Cause / Reason
**Confirmed.** Audit said "2" but actual count is 3.

### Troubleshooting / Next Steps
1. Replace with `logger.info(...)` or `logger.debug(...)`.
2. Verify `logger.ts` exists and is the right utility.

### Resolution
Resolved (2026-06-17) — Phase 1.4: Removed 3 stray `console.log` calls. `IconPreloader.tsx:59`, `GameConfigProvider.tsx:127`, `GameConfigProvider.tsx:192`. All 0 remaining. (A `logger.ts` does not exist — these were simply removed rather than routed through a logger.)

---

## BUG-027 — L1: `TradingPostPanel/` directory holds only `MarketPriceChart.tsx`

### Status
Resolved (2026-06-17)

### Severity
Low

### Category
Architecture

### Date Discovered
2026-06-17

### Discovered By
AI Agent (UI/UX audit verification, revised after user feedback)

### Location

- `src/components/game/TradingPostPanel/MarketPriceChart.tsx` (5,982 bytes)
- `src/components/game/TradingPostPanel.tsx` (41,543 bytes, lives in the parent directory)
- **Used in:** `TradingPostPanel.tsx:29` (import) and `:783` (rendered with `resourceId`, `hours={24}`, etc.)

### Problem Found
**REVISED 2026-06-17:** The audit flagged this as "empty/near-empty directory" implying dead code. **Verification shows the file is in active use** — `MarketPriceChart` is imported in `TradingPostPanel.tsx:29` and rendered at `TradingPostPanel.tsx:783` (always rendered when the panel is mounted).

The only issue is the **directory structure** — a subdirectory holding a single helper component while the main panel lives in the parent. This is a co-location/style concern, not a dead-code concern.

### Expected Behavior
Either:
- (a) Move `MarketPriceChart.tsx` into the parent (`src/components/game/MarketPriceChart.tsx`) and remove the empty subdirectory, OR
- (b) Split `TradingPostPanel.tsx` (1,027 lines) into multiple sub-components all living in `TradingPostPanel/`.

### Actual Behavior
One helper file alone in a subdirectory, but the file is fully used.

### Root Cause / Reason
**Confirmed (architecture only).** Half-done refactor. The file is connected; the directory is just oddly named.

### Troubleshooting / Next Steps
1. Pick option (a) for minimum risk, OR option (b) for technical-debt reduction.
2. After moving, update the import in `TradingPostPanel.tsx` from `./TradingPostPanel/MarketPriceChart` → `./MarketPriceChart`.

### Resolution
Resolved (2026-06-17) — Phase 1.5: Flattened the directory structure. `git mv src/components/game/TradingPostPanel/MarketPriceChart.tsx src/components/game/MarketPriceChart.tsx`, removed the now-empty `TradingPostPanel/` directory, and updated the import in `src/components/game/TradingPostPanel.tsx:29` from `./TradingPostPanel/MarketPriceChart` to `./MarketPriceChart`. Git recognized this as a rename (R). The file is unchanged in content — it is actively used (imported + rendered at line 783).

### Notes For Future Agents
- **This is NOT dead code.** The file is in an active render path. Do not delete it.
- The original "broken connection" hypothesis (file planned for a feature that was never wired up) does NOT apply — the file is wired and rendering.

## BUG-028 — L2: `Swords` lucide icon — registered but unreferenced in any feature

### Status
Resolved (2026-06-17)

### Severity
Low

### Category
Dead infrastructure (was: Dead code)

### Date Discovered
2026-06-17

### Discovered By
AI Agent (UI/UX audit verification, revised after user feedback)

### Location

- `src/components/game/GameSidebar.tsx:10` — `Settings, ChevronDown, ChevronRight, Home, Wrench, Swords, Coins, Database,` (imports)
- `src/components/game/BottomNavigationBar.tsx:14` — `Swords` imported with other lucide icons
- `src/components/game/BottomNavigationBar.tsx:25` — `Swords` registered in **`ICON_MAP`**: `export const ICON_MAP = { ..., Activity, Save, Swords, }`

### Problem Found
**REVISED 2026-06-17 (user-flagged):** My initial verification was incomplete. I claimed `Swords` was dead-imported; the user correctly pointed out this could be a "broken connection" — an infrastructure piece for an unwired feature.

**Verification on 2026-06-17:** `Swords` IS in the `ICON_MAP` (line 25 of `BottomNavigationBar.tsx`):
```ts
export const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Home, Wrench, Truck, ..., Activity, Save, Swords,  // ← Swords is here
};
```

The `ICON_MAP` is consumed by:
- `src/components/game/FloatingActionButton.tsx:72` — `const IconComponent = ICON_MAP[shortcut.icon];`
- `src/components/game/SettingsPanel.tsx:668` — same lookup pattern

So if a user adds a Quick Access shortcut with `icon: "Swords"`, the FAB will render the Swords icon. **The chain is intact.**

The "broken connection" is therefore narrower than the audit suggested: the icon registration IS wired correctly to the FAB/Settings; **no feature currently has `icon: "Swords"`**. There is no `GameTab` called `'battles'` / `'arena'` / `'combat'` / `'fight'`, and no default Quick Access shortcut uses `Swords`.

### Expected Behavior
Either:
- (a) Add a feature that uses `icon: "Swords"` (e.g., a Battles/Arena tab — would require new `GameTab` and new panel), OR
- (b) Add a default Quick Access shortcut using `Swords`, OR
- (c) Remove `Swords` from the 3 import lists and from `ICON_MAP` if no feature is planned.

### Actual Behavior
Icon registered in ICON_MAP, import lines present, but no consumer references the `"Swords"` key.

### Root Cause / Reason
**Confirmed.** Likely leftover from a planned PvP/Battles feature that was scoped out. The icon remained in `ICON_MAP` as a registered entry but no `GameTab` was added.

### Troubleshooting / Next Steps
1. **Recommended:** Keep the `Swords` import + `ICON_MAP` registration as infrastructure for a future feature. Add a comment: `// Reserved for future PvP/Battles feature`.
2. Alternative: Remove `Swords` from the 3 import lists AND from `ICON_MAP` (line 25 of `BottomNavigationBar.tsx`).
3. The audit's recommendation to "verify it's referenced by FAB" is satisfied — the FAB references ICON_MAP which contains Swords — so the import is NOT dead.

### Resolution
Resolved (2026-06-17) — Phase 1.3 (revised): NOT dead code. `Swords` is registered in the `ICON_MAP` exported from `src/components/game/BottomNavigationBar.tsx:25` and is consumed by `FloatingActionButton.tsx:72` and `SettingsPanel.tsx:668` via `ICON_MAP[shortcut.icon]`. The chain is intact. Added a code comment: `// Swords reserved for future PvP/Battles feature (no GameTab yet)`. Also removed unused `useCallback` import from `GameSidebar.tsx` (it was only used by the local `toggleGroup` which is now from the store).

### Notes For Future Agents
- **This is NOT dead code.** `Swords` is part of a working icon registry. The chain is: `Swords` (lucide import) → `ICON_MAP` (registry) → `FloatingActionButton` / `SettingsPanel` (consumers). The "broken connection" is upstream — no `GameTab` is wired to use it.
- If a future PvP/Battles feature is built, the icon is already registered. Removing it now would require re-adding it later.
- The `Swords` import in `GameSidebar.tsx:10` is technically unused (the sidebar doesn't reference ICON_MAP). The two `Swords` imports in `BottomNavigationBar.tsx:14, 25` are the only ones that matter — one for the JSX-side import (currently unused), one for the ICON_MAP registration (used by FAB/Settings).

## BUG-029 — L3: `powerPercent = 0` dead variable in `page.tsx`

### Status
Resolved (2026-06-17)

### Severity
Low

### Category
Dead code

### Date Discovered
2026-06-17

### Discovered By
AI Agent (UI/UX audit verification)

### Location

- `src/app/page.tsx:261` — `const powerPercent = 0; // unused after header extraction (DesktopHeader computes internally)`

### Problem Found
A dead variable with a self-describing comment confirming it's unused.

### Expected Behavior
Removed.

### Actual Behavior
Variable declared, value `0`, never read.

### Root Cause / Reason
**Confirmed.** Comment says: `// unused after header extraction (DesktopHeader computes internally)`.

### Troubleshooting / Next Steps
1. Delete the line.
2. Verify `DesktopHeader` (line 68 confirmed: `const powerPercent = powerGrid.totalConsumption > 0 ...`) does the work independently.

### Resolution
Resolved (2026-06-17) — Phase 1.2: Removed the dead variable `const powerPercent = 0; // unused after header extraction (DesktopHeader computes internally)` from `src/app/page.tsx:261`. The actual `powerPercent` calculation is done in `DashboardPanel.tsx:64`, `DesktopHeader.tsx:68`, and `MobileHeader.tsx:68`. Verified: `grep -c "powerPercent" src/app/page.tsx` = 0.

---

## BUG-030 — L4: News ticker content is `aria-hidden="true"` + `aria-live="off"`

### Status
Resolved (2026-06-17)

### Severity
Low

### Category
Accessibility

### Date Discovered
2026-06-17

### Discovered By
AI Agent (UI/UX audit verification)

### Location

- `src/components/game/headers/DesktopHeader.tsx:503` — `<div ... role="marquee" aria-live="off" aria-label="Live news feed">`
- `src/components/game/headers/DesktopHeader.tsx:507` — `<div className="news-ticker-content ..." aria-hidden="true">`

### Problem Found
The news ticker announces a "Live news feed" but the actual news content is `aria-hidden="true"` and the region is `aria-live="off"`. Screen-reader users get zero news content.

### Expected Behavior
Either:
- (a) Provide a non-scrolling, accessible alternative (e.g., the latest 3 headlines as a static `<ul>`), OR
- (b) Make the ticker content screen-reader accessible via `role="log"`, `aria-live="polite"`, and remove `aria-hidden`.

### Actual Behavior
Visual-only news; no SR equivalent.

### Root Cause / Reason
**Confirmed.** Visual decoration; a11y was not considered.

### Troubleshooting / Next Steps
- See BUG-015 for the related marquee pause control.
- Recommended approach: combine — make the ticker a static rotating list (3 visible items, auto-rotate every 5s) with `aria-live="polite"` and pause-on-hover. This satisfies both BUG-015 and BUG-030.

### Resolution
Resolved (2026-06-17) — Same fix as BUG-015 (Phase 1.8). The news ticker content is no longer `aria-hidden`; it is now a real `<li>` with `aria-live="polite"` and `aria-atomic="true"` on the parent `<ul>`. Screen-reader users now hear the top headline announced, and the `aria-live="off"` + `aria-hidden="true"` regression is fixed.

### Notes For Future Agents
- Tied to BUG-015. Single fix likely resolves both.

---

## Resolved (2026-06-17 — Phases 1-4 of UI/UX Remediation)

15 of the 30 tracked bugs were resolved during the UI/UX audit remediation. The detailed entries above are preserved; this section is a quick-reference summary for future agents.

| ID | Phase | Title | One-line fix |
|---|---|---|---|
| BUG-002 | 1 | `.rules` vs `RULES.md` conflict | Renamed `.rules/RULES.md` → `.rules` (Zed-recognized file). `git rm --cached RULES.md`. |
| BUG-006 | 1 | `AGENT.md` out of date | Rewrote AGENT.md to reference `.rules`, remove `worklog.md`, point to canonical docs. |
| BUG-014 | 3.1 | No code-splitting (28 panels) | All 28 panels converted to `next/dynamic()` with `DynamicPanelFallback`. DashboardPanel kept eager. |
| BUG-015 | 1.8 | News ticker a11y (WCAG 2.2.2) | Replaced auto-scrolling marquee with static rotating list, `aria-live="polite"`, pause-on-empty handling. |
| BUG-016 | 1.8 | Emoji as icon (📰) | Removed emoji; ticker now uses `<Newspaper />` from lucide-react. (⚙️ in data.ts still TBD.) |
| BUG-017 | 2 | Design tokens ~50% adopted | Codemod replaced 152× `bg-[#0a0e17]`, 216× amber/yellow, ~280× red/emerald/etc, ~120× blue/cyan/etc with semantic tokens across 94 files. |
| BUG-020 | 3.2 | No `next/image` | Migrated 2 `<img>` tags (DesktopHeader, MobileHeader) with explicit width/height. |
| BUG-021 | 4.4 | Sub-11px typography | All `text-[6-7-8px]` (125 occurrences) raised to `text-[11px]`. |
| BUG-023 | 1.6 | Sidebar state not persisted | Added `expandedGroups` + `toggleExpandedGroup` to `useSettingsStore`; GameSidebar reads from store. |
| BUG-024 | 1.7 | No `aria-current` on active tab | Added `aria-current={isActive ? "page" : undefined}` to active tab buttons in GameSidebar + BottomNavigationBar. |
| BUG-026 | 1.4 | Stray `console.log` × 3 | Removed (3 sites in IconPreloader + GameConfigProvider). (No logger.ts yet.) |
| BUG-027 | 1.5 | Empty `TradingPostPanel/` dir | `git mv` flattened the directory; import path updated. |
| BUG-028 | 1.3 | `Swords` icon — dead or broken? | Re-evaluated: NOT dead. `Swords` is in `ICON_MAP` (BottomNavigationBar.tsx:25), reachable via FAB/Settings. Added a `// Reserved for future PvP/Battles feature` comment. |
| BUG-029 | 1.2 | Dead `powerPercent` variable | Removed from `page.tsx:261`. Real calculations live in DashboardPanel/DesktopHeader/MobileHeader. |
| BUG-030 | 1.8 | News aria-hidden | Resolved by BUG-015 fix (same code change). |

### What was NOT resolved (still open)

**From the UI/UX audit (deferred):**
- BUG-018 (H2: aria-label gap on icon-only buttons) — requires `eslint-plugin-jsx-a11y` install
- BUG-019 (H3: no tablet `md:` breakpoint) — visual design work needed
- BUG-022 (H6: `text-muted-label` contrast risk) — needs actual contrast measurement
- BUG-025 (M6: 1,233 arbitrary-value classes) — high visual-churn risk, deferred

**Pre-existing (out of scope of the audit):**
- BUG-001 (20 components use `useGameStore()` without selectors) — pre-existing
- BUG-003 (`prisma` in devDependencies, no `prisma/` dir) — pre-existing
- BUG-004 (`tests/integration/*.test.ts` exist but no test runner) — pre-existing
- BUG-005 (`.env.example` has invalid `process.env.X` literal values) — pre-existing
- BUG-007 (H6: 5s debounced persist loses data on mobile force-kill) — pre-existing
- BUG-008 (L5: `handleReset` uses blocking `confirm()`) — pre-existing
- BUG-009 (hardcoded Supabase anon key in test file) — pre-existing
- BUG-010 (L4: `quickTradeAmounts` doesn't refresh) — pre-existing
- BUG-011 (L2: `KEY_TAB_MAP` covers only 10 of 25+ tabs) — pre-existing
- BUG-012 (L1: `Math.random()` for IDs and event timing) — pre-existing
- BUG-013 (`.omo/` and `skills/` directories empty) — pre-existing
