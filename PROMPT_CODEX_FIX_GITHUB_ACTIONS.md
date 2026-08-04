You are Codex, a coding agent. Your job is to **diagnose** the failing
GitHub Actions checks on the open PR, **audit** the project to
understand the root cause, and **propose a fix plan**. Do NOT
implement the fixes — just produce the plan.

## Repo context

- **Working directory:** `a:\industryx\industryx` (PowerShell on
  Windows, Node 22+, pnpm/npm available)
- **GitHub:** `github.com/malcolmkhong/industryx` (public)
- **Open PR:** `autonoma-integration` → `main` (8 commits ahead)
- **Your task scope:** diagnosis + plan, **not implementation**

## Step 1 — Identify the failing checks

Try these in order until you have the names + conclusion of every
check on the PR:

```powershell
# Option A: gh CLI (if installed + authenticated)
gh pr list --state open --json number,headRefName
gh pr checks <PR#>

# Option B: scrape the PR page HTML
curl.exe -s -m 15 -A "Mozilla/5.0" `
  "https://github.com/malcolmkhong/industryx/pull/<PR#>/checks"

# Option C: scrape the Actions page
curl.exe -s -m 15 -A "Mozilla/5.0" `
  "https://github.com/malcolmkhong/industryx/actions?query=branch%3Aautonoma-integration"
```

For each failing check, fetch the last 50 lines of the failing step's
log. Pattern: the job log URLs look like
`https://github.com/malcolmkhong/industryx/actions/runs/<run-id>/jobs/<job-id>`.

## Step 2 — Read context

Before forming hypotheses, read these files. Order matters:

1. `.github/workflows/test.yml` — the main CI workflow (lint,
   typecheck, build, test, ci-gate, all-pass jobs)
2. `.github/workflows/dependency-audit.yml` — `npm audit`
3. `.github/workflows/supabase-migrations.yml` — `supabase link` + diff
4. `package.json` — scripts: `lint`, `build`, `test`, `test:security`
5. `tsconfig.json` + `tsconfig.ci.json` (extends tsconfig.json, excludes
   `tests/`)
6. `planning/CI_GATES.sh` — design-system gate (v2 rules, only
   checks `^\+` lines)

## Step 3 — Reproduce each failure locally

For each failing check, run the equivalent local command to confirm
the failure. This catches 80% of "works locally, fails in CI" cases.

```powershell
# Lint
npm run lint

# Typecheck (matches CI: uses tsconfig.ci.json)
npx tsc --noEmit -p tsconfig.ci.json

# Build (mock env vars; CI has the real ones)
$env:NEXT_TELEMETRY_DISABLED = "1"
$env:CHECKSUM_SECRET = "test"
$env:AUTONOMA_SHARED_SECRET = "test"
$env:AUTONOMA_SIGNING_SECRET = "test"
npm run build

# Tests
npm test

# Design-system gate
bash planning/CI_GATES.sh origin/main

# Dependency audit
npm audit --audit-level=high
```

## Step 4 — Audit the root cause

For each failing check, find **why** it fails. Distinguish between:

| Failure type             | What to look for                                                             | Who can fix                               |
| ------------------------ | ---------------------------------------------------------------------------- | ----------------------------------------- |
| **Code in this PR**      | New lint/tsc/test error pointing to a file changed by `autonoma-integration` | This PR (Codex recommends fix)            |
| **Pre-existing on main** | Error in code that was already on `origin/main` before the PR                | Separate PR (Codex documents)             |
| **Workflow / config**    | Missing secret, bad path, env-var mismatch                                   | Owner of secrets/config (Codex documents) |
| **Tooling / infra**      | Bot race condition, npm registry hiccup, runner OOM                          | Re-run the check                          |

For "pre-existing on main" cases, verify by checking out `origin/main`
and running the same command:

```powershell
git stash
git checkout origin/main
npm run lint      # or whichever check failed
git checkout autonoma-integration
git stash pop
```

## Step 5 — Produce the fix plan

Write a plan to `PROMPT_CODEX_FIX_PLAN.md` with this structure:

```markdown
# PR CI Fix Plan

## Summary

- PR: <url>
- Branch: autonoma-integration
- Total checks: 7
- Currently passing: N
- Currently failing: M
- Estimated time to green: <realistic estimate>

## Failing checks

### Check 1: <name>

- **Bucket:** (A. code in this PR / B. pre-existing / C. config / D. infra)
- **Failing step:** <step name>
- **Error excerpt:** (paste last 20 lines of the log)
- **Root cause:** <one paragraph>
- **Proposed fix:** <exact files + lines to change, or "document as out-of-scope">
- **Risk:** <low/medium/high + why>
- **Verification:** <how to confirm locally + in CI>

### Check 2: ...

## Recommended commit sequence

1. `<commit subject 1>` — fixes Check X
2. `<commit subject 2>` — fixes Check Y
3. (optional) `<commit subject 3>` — addresses a pre-existing issue if you have time

## Out-of-scope items (NOT in this PR)

- <item 1> — pre-existing on main, needs separate PR
- <item 2> — config issue, needs secret owner

## Open questions for the human

- <anything you're not sure about>
```

## What you should NOT do

- Do NOT edit any source files
- Do NOT make any commits
- Do NOT push anything
- Do NOT install new dependencies
- Do NOT run `npm audit fix` (changes the lockfile)
- Do NOT delete files

Your only output is the fix plan in `PROMPT_CODEX_FIX_PLAN.md` and
a short summary in the chat.

## Reference

- **PR commits** (in order, oldest first):
  - `358dd52d` fix(autonoma): root-cause SDK type errors, preview guard, signing-secret fallback
  - `94e6f2d7` fix(ci): clear lint + typecheck + build errors
  - `520b414b` fix(ci): track planning/CI_GATES.sh
  - `b7f4ec42` chore(gitignore): ignore local design-system audit artifacts
  - `3ea7dbd1` feat(ci-gate): v2 — extend design-system rules
  - `5e9f9c4c` chore(repo): clean main-branch clutter
  - `efc838d6` chore(gitignore): ignore removed files
- **Known pre-existing failures** (likely bucket B/C — verify first):
  - `npm audit --audit-level=high` (high-sev in `brace-expansion` + `next`)
  - `supabase-migrations.yml` (`supabase link` step — config issue)

## Working environment

PowerShell 5. Use `$env:X = "Y"` not `export X=Y`. For multiline
bash scripts, write to a file first then run.

You have full read access on this directory. Begin.
