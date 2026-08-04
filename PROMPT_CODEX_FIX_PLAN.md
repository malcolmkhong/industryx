# PR CI Fix Plan

## Summary

- PR: https://github.com/malcolmkhong/industryx/pull/9
- Branch: `autonoma-integration` (`efc838d687c2b5c1c00e71c7cb4a69b6017b3363`)
- Base: `main` (`569ceefdf82408b21e8e02029201f5c23edc3aae`)
- Total checks: 15
- Currently passing: 10
- Currently skipped: 1 (`Supabase Preview`)
- Currently failing: 4
- Estimated time to green: 4-8 hours, contingent on access to the staging Supabase migration history. The two code/dependency fixes should be separate from this Autonoma PR because both defects predate it.

## Evidence and limits

The GitHub Actions job-log download endpoints returned HTTP 403 without GitHub authentication. GitHub's public job page exposes only the failing step and `Process completed with exit code 1`, not the command stderr. The excerpts below therefore contain the available GitHub metadata plus locally reproduced output; do not treat them as invented CI log text.

The branch has unrelated, pre-existing working-tree changes. This diagnosis did not modify them, source files, commits, dependencies, or remote state.

The repository's former bug registry (`BUGS.md`) is deleted by this PR and no replacement registry is present. Before implementing any bug fix, establish the canonical registry location and record these defects as required by `AGENTS.md`.

## Failing checks

### Check 1: Test suite

- **Bucket:** B. pre-existing on main (non-hermetic integration test; CI-only external dependency)
- **Failing step:** `Run tests` in `.github/workflows/test.yml`; GitHub recorded the failure at workflow line 176. `Run security tests` was skipped because `npm test` exited nonzero.
- **Error excerpt:** `Run tests — Process completed with exit code 1.` The raw 50-line GitHub log could not be retrieved anonymously (HTTP 403). Locally, `npm test` passed: 64 tests, 14 pass, 0 fail, 50 skip. The same command also passed after removing `NEXT_PUBLIC_SUPABASE_ANON_KEY` and using the CI values for `RUN_LIVE_TESTS=0`, `BASE_URL=''`, and `NEWS_GENERATOR_URL=''`.
- **Root cause:** `tests/integration/supabase-connectivity.test.ts` directly calls the production Supabase project. Only the first reachability assertion is skipped when unavailable; four later tests still make real `fetch` calls and assert the precise response shape/status. They are not gated by `RUN_LIVE_TESTS` (the gate starts only at line 175). This makes the required test job depend on public-network availability and mutable production auth behavior. The test files and the `npm test` script are unchanged from `main`; the PR merely adds CI environment variables. The available metadata cannot prove the exact transient response, but it proves the failure is in this external-facing step rather than lint, TypeScript, build, or the PR's security-test step.
- **Proposed fix:** Separate PR. In `tests/integration/supabase-connectivity.test.ts`, make every production HTTP assertion opt-in under `RUN_LIVE_TESTS=1`, or replace the required-CI coverage with deterministic mocked/contract tests. Keep one minimal non-network test in the default suite. Update `.github/workflows/test.yml` so live checks run only on an explicit `workflow_dispatch` or a dedicated scheduled/staging job, with a non-empty staging `BASE_URL` and documented secrets. Do not weaken assertions for the explicitly opted-in live job.
- **Risk:** Medium. This changes CI coverage boundaries; preserve a deterministic test of the client request/response handling so a gating change does not silently remove behavior coverage.
- **Verification:** Run `npm test` with `RUN_LIVE_TESTS=0` while network access is disabled or the Supabase URL is intentionally unreachable; it must remain green. Run the live suite against staging with `RUN_LIVE_TESTS=1` and authenticated log access. Re-run the PR's `Test suite` check and confirm `Run security tests` executes.

### Check 2: audit

- **Bucket:** B. pre-existing on main
- **Failing step:** `Audit dependencies` in `.github/workflows/dependency-audit.yml`
- **Error excerpt:** Local equivalent reproduced the failure: `5 high severity vulnerabilities`; `npm audit --audit-level=high` exited 1. Reported direct/transitive vulnerable packages include `brace-expansion`, `next`, `postcss`, `sharp`, and `undici`.
- **Root cause:** The vulnerable resolved versions are identical on `main` and this PR: `next@16.2.10`, `brace-expansion@1.1.16`, `postcss@8.5.19`, and `undici@7.28.0`. The PR's lockfile changes only remove `@autonoma-ai/server-node` and add `@vercel/kv`/`@upstash/redis`; it does not change those vulnerable resolution roots. The audit failure is therefore not caused by the Autonoma integration changes.
- **Proposed fix:** Separate security-dependency PR. Use `npm audit --json` to identify each root dependency and the non-breaking patched version, then explicitly update the applicable direct dependencies in `package.json` and regenerate only the necessary `package-lock.json` entries. Start with Next.js because it is a production dependency with multiple high-severity advisories; resolve the remaining transitive roots without `npm audit fix` bulk changes. Review Next.js release notes and run the full app/security regression set.
- **Risk:** High. A Next.js upgrade can change framework/runtime behavior and its transitive PostCSS/Sharp dependency tree.
- **Verification:** `npm ci`, `npm audit --audit-level=high`, `npm run lint`, `npx tsc --noEmit -p tsconfig.ci.json`, `npm test`, `npm run test:security`, and `npm run build`; then re-run the `audit` workflow.

### Check 3: migrate

- **Bucket:** C. configuration / shared Supabase migration state
- **Failing step:** `List remote + local migrations (debug diff)` in `.github/workflows/supabase-migrations.yml`
- **Error excerpt:** Job metadata shows `supabase/setup-cli@v1` succeeded, `Link staging project` succeeded, then `List remote + local migrations (debug diff)` failed and both `supabase db push --dry-run` and `supabase db diff --exit-code` were skipped. Raw job stderr is unavailable without GitHub authentication (HTTP 403).
- **Root cause:** Authentication and project linking are not the failing operation. The next command is `supabase migration list`, so the defect is in the remote/local migration-history comparison or the linked staging database state. The workflow itself is unchanged from `main`; it fails against shared staging state. The PR adds one local migration, `supabase/migrations/20260803000001_090_player_delete_cascade.sql`, but an extra unapplied local migration should be reported by the list/dry-run steps rather than make the list command itself fail. Obtain the authenticated stderr before changing migration filenames or metadata.
- **Proposed fix:** Infrastructure owner runs `supabase migration list` with the same staging project ref and captures the full output. Compare every remote migration version with `supabase/migrations/`; then choose the narrow, evidence-backed repair: restore/rename a missing local migration file if the remote applied version has the same SQL, or use Supabase's migration-history repair only after confirming the remote schema and intended history. Do not alter production/staging schema, migration metadata, or migration filenames merely to make CI green. After history is aligned, run `supabase db push --dry-run` and `supabase db diff --exit-code`.
- **Risk:** High. Incorrect migration-history repair can desynchronize recorded versions from the actual schema and cause later deploy failures.
- **Verification:** Authenticated `supabase migration list` has no history error; `supabase db push --dry-run` succeeds without unintended SQL; `supabase db diff --exit-code` is clean; then re-run `migrate`.

### Check 4: All checks passed

- **Bucket:** D. aggregate workflow result (derivative)
- **Failing step:** `Check all required jobs succeeded` in `.github/workflows/test.yml`
- **Error excerpt:** `One or more required jobs failed or were cancelled`.
- **Root cause:** The `all-pass` job requires `lint`, `typecheck`, `build`, `test`, and `ci-gate`. ESLint, TypeScript, Build, and Design-system gate passed; `test` failed, so this aggregate job correctly failed. The separate `audit` and `migrate` workflows do not feed this aggregate job.
- **Proposed fix:** No direct change. Re-run after the Test suite issue is corrected/resolved.
- **Risk:** Low. Changing the aggregate would hide a required failure.
- **Verification:** The job prints `All checks passed` only after `Test suite` succeeds.

## Recommended commit sequence

1. `test(ci): isolate live Supabase connectivity checks` — separate PR; fixes the required `Test suite` and therefore `All checks passed` without removing deterministic coverage.
2. `deps(security): remediate high-severity audit findings` — separate PR; fixes `audit` after explicit dependency updates and regression validation.
3. `chore(supabase): reconcile staging migration history` — only after authenticated remote/local evidence and infrastructure-owner review; fixes `migrate`.

## Out-of-scope items (NOT in this PR)

- Production Supabase connectivity test design — pre-existing on `main`; needs a focused test/CI PR.
- High-severity dependency remediation — vulnerable lock entries predate this PR; needs a focused security upgrade PR.
- Staging migration history — shared environment state/workflow predates this PR; needs authenticated Supabase access and owner review.
- Aggregate workflow — no independent defect; it should remain strict.

## Open questions for the human

- Can an authenticated maintainer provide the last 50 lines for the three failed Actions steps, especially the exact `npm test` and `supabase migration list` stderr? Public GitHub endpoints deny raw job-log download.
- Which file replaces the deleted `BUGS.md` as the canonical bug registry? Fix work must record these defects there.
- Is staging intended to be the migration authority for PR validation, and who may perform `migration repair` if history is mismatched?
- Should the required CI suite be fully hermetic, with live Supabase checks moved to scheduled/manual staging validation? This is the recommended boundary.
