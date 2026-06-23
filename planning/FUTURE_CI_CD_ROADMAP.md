# FUTURE_CI_CD_ROADMAP.md — IndustryX CI/CD Evolution Plan

> **Status:** Future planning document. **NOT YET IMPLEMENTED.**
> **Created:** 2026-06-23
> **Purpose:** Capture the complete target CI/CD architecture so it can be implemented after current development work is finished.
> **Source of decisions:** `planning/CI_GATES.md` (existing policy), audit of current `.github/workflows/` + `scripts/` + `tests/`.

---

## 1. Current State Audit (as of 2026-06-23)

### 1.1 Existing CI assets

| Path | Status | Wired? |
|---|---|---|
| `.github/workflows/test.yml` | Tracked | ✅ Runs on PR + push to main |
| `.github/workflows/dependency-audit.yml` | Tracked | ✅ Runs on PR |
| `.github/workflows/supabase-migrations.yml` | Tracked | ✅ Runs on PR (needs `SUPABASE_STAGING_PROJECT_REF` + `SUPABASE_ACCESS_TOKEN` secrets) |
| `planning/CI_GATES.sh` | Tracked | ❌ **Not wired** — exists but no workflow invokes it |
| `planning/CI_GATES.md` | Tracked | ✅ Reference doc (5 design-system gates documented) |
| `scripts/fix-test-ts-errors.py` | Tracked | ❌ One-off regex script, never invoked by CI |
| `scripts/update-bugs-md.py` | Tracked | ❌ One-off regex script, never invoked by CI |

### 1.2 Missing CI assets

| Path | Status |
|---|---|
| `scripts/ci/design-gate.sh` | Not yet created (exists as `planning/CI_GATES.sh`) |
| `scripts/ci/forbidden-imports.sh` | Not yet created |
| `scripts/ci/selector-required.sh` | Not yet created (logic embedded in old `CI_GATES.sh` gate #5) |
| `scripts/ci/smoke-test.sh` | Not yet created |
| `.github/workflows/ci.yml` | Not yet created (consolidates `test.yml` + smoke) |
| `.github/workflows/design-gate.yml` | Not yet created |
| `package.json` `typecheck` + `validate` scripts | Not yet added |

### 1.3 package.json scripts inventory

```json
{
  "dev":              "next dev -p 3000",
  "build":            "next build && cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/ && rm -rf .next/standalone/node_modules/sharp .next/standalone/node_modules/@img .next/standalone/node_modules/detect-libc",
  "start":            "NODE_ENV=production bun .next/standalone/server.js 2>&1 | tee server.log",
  "lint":             "eslint . --cache",
  "test":             "node --test --test-reporter=spec tests/integration/**/*.test.ts tests/security/**/*.test.ts",
  "test:integration": "node --test tests/integration/**/*.test.ts",
  "test:security":    "node --test tests/security/**/*.test.ts",
  "test:all":         "node --test tests/integration/**/*.test.ts tests/security/**/*.test.ts"
}
```

Missing: `typecheck`, `validate` (proposed for addition).

---

## 2. Final Target Architecture

### 2.1 Folder structure

```
.github/workflows/
├── ci.yml
├── dependency-audit.yml
├── design-gate.yml
└── supabase-migrations.yml

scripts/ci/
├── design-gate.sh
├── forbidden-imports.sh
├── selector-required.sh
└── smoke-test.sh

planning/
├── CI_GATES.md
└── FUTURE_CI_CD_ROADMAP.md   (this document)
```

**No** `scripts/dev/`, **no** `scripts/one-off/`, **no** `.gitkeep` placeholders. Only folders justified by current repository needs.

### 2.2 Workflow structure

| Workflow | Trigger | Jobs |
|---|---|---|
| `ci.yml` | PR + push to `main` | `lint`, `typecheck`, `build`, `test`, `smoke` |
| `dependency-audit.yml` | PR | `audit` (`npm audit --audit-level=high`) |
| `design-gate.yml` | PR touching `src/**` | `design-system`, `db-centralization`, `state-selectors` |
| `supabase-migrations.yml` | PR | `migrate` (dry-run + diff) |

### 2.3 CI gate structure

```
scripts/ci/
├── design-gate.sh          ← moved from planning/CI_GATES.sh
├── forbidden-imports.sh    ← new
├── selector-required.sh    ← new (extracted from old design-gate gate #5)
└── smoke-test.sh           ← new
```

Each script is independently runnable from CLI for fast local feedback.

---

## 3. CI Gates — Detailed Specification

### 3.1 Build

- **Where:** `.github/workflows/ci.yml` job `build`
- **Command:** `npm run build`
- **Why exists:** Catches SSR/build-time errors, dead imports, missing types, and broken dynamic routes that `tsc --noEmit` and lint miss.
- **Prevents:** Production deploys that fail to compile, broken Next.js builds, missing environment variable references, server/client component boundary violations.
- **Priority:** **Required Now**

### 3.2 TypeScript

- **Where:** `.github/workflows/ci.yml` job `typecheck`
- **Command:** `npx tsc --noEmit`
- **Why exists:** Catches type drift across the game engine, market simulation, admin APIs, and Zustand store slices.
- **Prevents:** Type drift that breaks at runtime but compiles locally. Especially important for the central `src/lib/db/*` helpers used by all 50+ API routes.
- **Priority:** **Required Now**

### 3.3 ESLint

- **Where:** `.github/workflows/ci.yml` job `lint`
- **Command:** `npm run lint`
- **Why exists:** Static analysis catches the broader class of selector anti-patterns, accessibility regressions, and unused exports.
- **Prevents:** `useGameStore()` without selector (per AGENTS.md forbidden patterns), unused imports, missing `aria-label`s.
- **Priority:** **Required Now**

### 3.4 Tests

- **Where:** `.github/workflows/ci.yml` job `test`
- **Command:** `node --test --test-reporter=spec tests/integration/**/*.test.ts tests/security/**/*.test.ts`
- **Why exists:** Validates the integration test suite (auth gate, cloudflare connectivity, crypto-id, game state validation) and security tests (auth routes).
- **Prevents:** Regressions in auth flow, crypto ID generation, game state validation, and Supabase connectivity.
- **Priority:** **Required Now**

### 3.5 Smoke test (IndustryX-specific)

- **Where:** `.github/workflows/ci.yml` job `smoke` (after `build`)
- **Script:** `scripts/ci/smoke-test.sh`
- **Why exists:** IndustryX has 50+ API routes, custom game engine, market simulation, admin/investigation/leaderboard systems, and two external Cloudflare workers. Compile-time checks cannot detect deployment-time failures.
- **Prevents:**
  - Dead API routes returning 500 instead of 401/404
  - Broken Supabase service-role client configuration
  - Unreachable Cloudflare workers (`newsgenerator` AI + `markettick` cron)
  - Stale market data (BUG-041 regression: cron worker silently fails for 54+ hours)
- **Checks:**
  1. `/api/health/liveness` returns 200
  2. Supabase service-role can ping DB (auth, leaderboard, investigations, market_state tables)
  3. Cloudflare workers reachable: `newsgenerator.malcolmkhong.workers.dev` + `markettick.malcolmkhong.workers.dev`
  4. `server_market_state.updated_at < 90s` (BUG-041 regression catcher)
- **Priority:** **Required Now**

### 3.6 Dependency audit

- **Where:** `.github/workflows/dependency-audit.yml`
- **Command:** `npm audit --audit-level=high`
- **Why exists:** Catches vulnerable dependencies before they reach production.
- **Prevents:** Deploys with known high-severity CVEs in the dependency tree. IndustryX uses `next`, `react`, `@supabase/supabase-js`, `zustand` — all have had historical CVEs.
- **Priority:** **Required Now**

### 3.7 Database migration validation

- **Where:** `.github/workflows/supabase-migrations.yml`
- **Command:** `supabase db push --dry-run` + `supabase db diff --exit-code`
- **Why exists:** Validates migrations locally before applying to staging. The DB has 53+ migrations and the `apply_market_tick` RPC has had multiple bugs that broke cron (BUG-041, BUG-042).
- **Prevents:** Broken migrations being applied to staging, RPC signature changes that break workers, RLS policy regressions, missing indexes that slow down queries.
- **Requires secrets:** `SUPABASE_STAGING_PROJECT_REF`, `SUPABASE_ACCESS_TOKEN`
- **Priority:** **Required Now**

### 3.8 Design system gate

- **Where:** `.github/workflows/design-gate.yml` job `design-system`
- **Script:** `scripts/ci/design-gate.sh`
- **Why exists:** The 5-gate script has existed at `planning/CI_GATES.sh` since 2026-06-17 but no workflow ever invoked it. Each merge could silently introduce raw hex colors or palette classes that break the design token system.
- **Prevents:**
  - Raw hex colors in `bg-` or `text-` utilities (use `bg-background`, `text-warning` instead)
  - Raw Tailwind palette colors for status meaning (use `bg-danger`, `text-success` instead)
  - Hardcoded `bg-[#0a0e17]` (use `bg-background`)
  - Cyan focus rings (use `focus-visible:ring-brand`)
- **Priority:** **Required Now**

### 3.9 DB centralization gate

- **Where:** `.github/workflows/design-gate.yml` job `db-centralization`
- **Script:** `scripts/ci/forbidden-imports.sh`
- **Why exists:** AGENTS.md mandates Database-First: only `src/lib/db/**` may call `.from()` or `.rpc()`. This boundary was created to prevent the exact regression that broke Trading Post pre-Phase 1C (client-side state mutation without server validation).
- **Prevents:**
  - Routes bypassing the centralized DB layer
  - Direct `supabase.from()` calls in components/hooks
  - RLS bypass via raw queries
  - Audit-log gaps from non-helper writes
- **Priority:** **Required Now**

### 3.10 Zustand selector gate

- **Where:** `.github/workflows/design-gate.yml` job `state-selectors`
- **Script:** `scripts/ci/selector-required.sh`
- **Why exists:** The game loop runs 1–10 Hz. Every component subscribing to the entire `useGameStore` re-renders every tick. The original H1 bug was 20 components using `useGameStore()` without a selector; BUG-009 (now resolved) reduced it to 1. The extracted gate prevents regression.
- **Prevents:**
  - `useGameStore()` without selector (full store subscription)
  - 1–10 Hz re-render storms on every tick
  - Game loop jank during active gameplay
- **Note:** Logic was previously gate #5 in `planning/CI_GATES.sh`. Extracted into its own script with false-positive fix (skip lines starting with `+//`).
- **Priority:** **Required Now**

---

## 4. Deferred / Optional CI Gates

| Gate | Reason for Deferral | Priority |
|---|---|---|
| Accessibility checks (axe-core via Playwright) | No Playwright infrastructure exists. IndustryX is a solo project at current scale — manual review sufficient. | Later |
| Visual regression (pixelmatch via Playwright) | Brittle, high maintenance, low ROI for solo project. | Later |
| Pre-commit hooks (husky + lint-staged) | Solo project — CI is sufficient. Add only if team grows. | Later |
| commitlint (Conventional Commits enforcement) | Solo project — flexibility > discipline. | Optional |
| Changelog automation (release-please) | Solo project — manual CHANGELOG.md is fine. | Optional |
| Console.log enforcement | Code review catches it. Gate adds noise. | Optional |
| `Math.random()` enforcement (BUG-012) | BUG-012 already Resolved; manual review catches regressions. | Optional |
| State-mutation gate | Subsumed by `forbidden-imports.sh` — same regex family. Don't duplicate. | Not Needed |

---

## 5. Phased Implementation Plan

When implementation begins (after current development work is finished), execute in three phases.

### Phase 1 — Wire existing assets (low risk, high value)

**Goal:** Move existing assets to canonical locations. Wire the design-system gate that has been unwired since 2026-06-17.

- Move `planning/CI_GATES.sh` → `scripts/ci/design-gate.sh` (no logic change)
- Update `planning/CI_GATES.sh` header comments (delete the old file)
- Add `scripts/ci/selector-required.sh` (extract from old gate #5)
- Add `scripts/ci/forbidden-imports.sh` (new, enforces DB centralization)
- Add `scripts/ci/README.md` (operations guide)
- Add `.github/workflows/design-gate.yml` (invokes the 3 gate scripts)
- Add `package.json` `typecheck` + `validate` scripts

**Risk:** Low. All gates are additive — they catch regressions but don't block existing code.

### Phase 2 — Consolidate test.yml + add smoke gate (medium risk, high value)

**Goal:** Replace the aging `test.yml` with a unified `ci.yml` that includes post-deployment smoke checks.

- Delete `.github/workflows/test.yml` (content moves verbatim)
- Add `.github/workflows/ci.yml` (lint + typecheck + build + test + smoke)
- Add `scripts/ci/smoke-test.sh` (IndustryX-specific smoke checks)
- Update `package.json` `validate` to include smoke gate

**Risk:** Medium. Smoke gate requires Supabase service-role credentials + Cloudflare worker URLs in CI environment. Smoke gate is post-deploy; failures don't block PR merge, only production deploys.

### Phase 3 — Add README + document workflow (low risk, low value)

**Goal:** Operations documentation. Last priority — only when the architecture stabilizes.

- Add `.github/workflows/README.md` (workflow operations guide)
- Add `scripts/ci/README.md` (gate script operations guide)
- Cross-reference `planning/CI_GATES.md` from all workflow files

**Risk:** Low. Documentation only.

---

## 6. Exact Commit Sequence (for implementation day)

8 atomic commits, each independently revert-safe.

### Commit 1 — `chore(ci): create scripts/ci/ directory`

**Files:**
- `scripts/ci/.gitkeep` (or empty placeholder)

**Message:**
```
chore(ci): create scripts/ci/ directory

Holds CI gate scripts invoked by .github/workflows/*.

Per project convention, no scripts/dev/ or scripts/one-off/
directories — only what current repository needs justify.
```

**Note:** No `.gitkeep` files will be created. Scripts directory will be populated by commit 2.

---

### Commit 2 — `refactor(ci): move planning/CI_GATES.sh → scripts/ci/design-gate.sh`

**Files:**
- `scripts/ci/design-gate.sh` (moved from `planning/CI_GATES.sh`, header updated)
- `planning/CI_GATES.sh` (deleted via `git rm`)

**Message:**
```
refactor(ci): move planning/CI_GATES.sh → scripts/ci/design-gate.sh

CI gate scripts are code. planning/CI_GATES.sh lived in
documentation folder — wrong home.

planning/CI_GATES.md stays at its original path. It is the
policy/specification. design-gate.sh is the implementation.
Single source of truth for policy; single implementation
file for code.

Script content unchanged. Header updated:
- "Source: planning/CI_GATES.md" (kept)
- "See planning/CI_GATES.md for details." (kept)
- Path self-reference removed (no longer needed)
```

---

### Commit 3 — `feat(ci): add scripts/ci/forbidden-imports.sh (DB centralization)`

**Files:**
- `scripts/ci/forbidden-imports.sh` (new)

**Message:**
```
feat(ci): add scripts/ci/forbidden-imports.sh

Enforces AGENTS.md Database-First policy. Only src/lib/db/**
may call .from() or .rpc().

Catches routes/hooks/components bypassing the centralized
DB layer — exactly the regression class that broke Trading
Post pre-Phase 1C. Game engine, leaderboard, investigations,
admin APIs all depend on this boundary.

Exits 1 with file:line:context for each offender.
```

---

### Commit 4 — `feat(ci): add scripts/ci/selector-required.sh (Zustand selector guard)`

**Files:**
- `scripts/ci/selector-required.sh` (new)

**Message:**
```
feat(ci): add scripts/ci/selector-required.sh

Extracted useGameStore() check from old design-gate gate #5.
Single-responsibility: this script only enforces selector
usage. Can run alone for fast feedback.

Fix: skip lines starting with `+//` (comments) to avoid
false positives.

The game loop runs 1-10 Hz. Every component subscribing to
the entire store re-renders every tick. This gate prevents
that regression class.
```

---

### Commit 5 — `feat(ci): add scripts/ci/smoke-test.sh (IndustryX smoke gate)`

**Files:**
- `scripts/ci/smoke-test.sh` (new)

**Message:**
```
feat(ci): add scripts/ci/smoke-test.sh

IndustryX-specific smoke checks. Catches production-readiness
issues that compile/typecheck cannot:

1. /api/health/liveness returns 200
2. Supabase service-role can ping DB (auth, leaderboard,
   investigations, market_state)
3. Cloudflare workers reachable:
   - newsgenerator.malcolmkhong.workers.dev
   - markettick.malcolmkhong.workers.dev
4. server_market_state.updated_at is fresh (<90s old)
   — BUG-041 regression catcher. If the cron froze, this
   fails fast instead of letting users see a stagnant market.

Runs in ci.yml after build succeeds (post-deploy smoke).
No external state required (uses HEAD endpoint variants).
```

---

### Commit 6 — `ci: replace test.yml with ci.yml (lint+typecheck+build+test+smoke)`

**Files:**
- `.github/workflows/test.yml` (deleted)
- `.github/workflows/ci.yml` (new)

**Message:**
```
ci: replace test.yml with ci.yml (adds smoke gate)

ci.yml consolidates test.yml's jobs (lint, typecheck, build,
test) and adds the smoke gate from scripts/ci/smoke-test.sh.

test.yml deleted (content moved verbatim + smoke added).

Smoke runs only after build succeeds. Catches deployment-
time failures (live API, DB connection, external workers,
cron-tick freshness) that compile-time checks cannot.
```

---

### Commit 7 — `ci: add design-gate workflow (3 gates)`

**Files:**
- `.github/workflows/design-gate.yml` (new)

**Message:**
```
ci: add design-gate workflow

Wires 3 previously-unwired CI gates:

1. design-gate.sh        - 4 design system gates
                            (raw hex, raw palette, hardcoded
                            dark-bg, cyan focus rings)
2. forbidden-imports.sh  - DB centralization
3. selector-required.sh  - Zustand selector usage

Trigger: PR touching src/**. Fetches base ref for diff.
Failure → exit 1 → blocks merge until offender replaces
with semantic token or moves to db helper.
```

---

### Commit 8 — `chore(package): add typecheck + validate scripts`

**Files:**
- `package.json` (modify)

**Message:**
```
chore(package): add typecheck + validate scripts

Local developer ergonomics:
- typecheck:  npx tsc --noEmit
- validate:   npm run lint && npm run typecheck && npm test &&
              bash scripts/ci/design-gate.sh &&
              bash scripts/ci/selector-required.sh &&
              bash scripts/ci/forbidden-imports.sh

Run `npm run validate` before pushing. Mirrors CI behavior
minus build (which is slow and runs in CI anyway).
```

---

## 7. Files To Move / Delete / Keep

### Move

| From | To |
|---|---|
| `planning/CI_GATES.sh` | `scripts/ci/design-gate.sh` |

### Delete

| File | Reason |
|---|---|
| `planning/CI_GATES.sh` | Replaced by `scripts/ci/design-gate.sh`. Single implementation, single location. |
| `.github/workflows/test.yml` | Content moved verbatim to `ci.yml` (plus smoke gate added). |

### Keep

| File | Reason |
|---|---|
| `planning/CI_GATES.md` | Policy/specification. Distinct from implementation. |
| `scripts/fix-test-ts-errors.py` | Useful regex template for the same class of TS error in any future test file. Low cost, potential value. |
| `scripts/update-bugs-md.py` | Useful regex template for bulk BUGS.md updates. Same reasoning. |
| `.github/workflows/dependency-audit.yml` | Independent from secret-scan; npm audit is a distinct concern. |
| `.github/workflows/supabase-migrations.yml` | Unchanged. |

---

## 8. Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| Smoke gate flakes on Cloudflare worker transient errors | Medium | Use `HEAD` request with timeout; allow 1 retry. Treat 5xx as warning, not failure, for first deployment. |
| `forbidden-imports.sh` false positives on type-only imports | Low | Regex exempts `import type` lines. Reviewed against all `src/lib/db/*` consumers. |
| `selector-required.sh` false positives on comment lines | Low | Fixed: regex skips `+//` lines. |
| Design gate drift between `.sh` and `.md` | Low | `.md` is the policy spec; `.sh` is the implementation. `.sh` references `.md`. |
| `test.yml` content loss during move | Very Low | `git mv` preserves history; commit message documents the move. |

---

## 9. Open Questions for Implementation Day

1. **Smoke gate credentials:** Where do `SUPABASE_SERVICE_ROLE_KEY` and Cloudflare worker URLs come from in CI? Need to decide: GitHub Actions secrets vs. dedicated environment.
2. **Smoke gate trigger:** Should smoke run on every PR (post-merge deploy preview) or only on `push to main` (production)?
3. **`validate` script scope:** Should `npm run validate` include smoke? Local smoke requires DB + workers — probably too heavy for local.
4. **Pre-commit hooks:** Even though deferred, worth re-evaluating once smoke gate proves its value.

---

## 10. References

- `planning/CI_GATES.md` — design system policy (5 gates)
- `planning/CI_GATES.sh` — current implementation (will move to `scripts/ci/design-gate.sh`)
- `AGENTS.md` § "Forbidden Actions" — design system constraints
- `AGENTS.md` § "Database-First" — DB centralization policy
- `AGENTS.md` § "Performance-First" — Zustand selector requirement
- `BUGS.md` BUG-041 — apply_market_tick validation (catches why smoke gate matters)

---

## 11. Implementation Status

- [ ] Phase 1 — Wire existing assets (commits 1–5)
- [ ] Phase 2 — Consolidate test.yml + add smoke gate (commits 6–7)
- [ ] Phase 3 — Document workflow (commit 8 only, README updates)

**Status:** Awaiting implementation. Do not implement until current development work is finished.