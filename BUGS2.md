# BUGS2 - Vitest Failure Review Inventory

Status: Review only. No fixes applied from this document.

This is a temporary review ledger requested before changes are made. The canonical
bug registry remains BUGS.md; promote confirmed issues there only after the
remediation scope is agreed.

## Run Evidence

- Command: CI=true bunx vitest run --reporter=json --outputFile=.cache/vitest-results.json
- Test files collected: 472
- Test cases: 1,117 total; 1,059 passed; 58 failed
- Files reported as failed: 16
- Additional runner failures: 2 files have no failed assertion, but cannot run
  under Vitest.

The 38 "failed suites" number from Vitest is its nested describe-block count.
For repair planning, use the 16 failing files and 58 failed test cases below.

## Group Summary

| ID | Root cause group | Failed cases | Failing files |
| --- | --- | ---: | ---: |
| B2-001 | Architecture policy violations | 6 | 1 |
| B2-002 | Auth bootstrap mocks use a different Supabase boundary from production | 13 | 2 |
| B2-003 | Prestige test mocks an obsolete initial-state module path | 12 | 1 |
| B2-004 | Tests expect local mutations, but actions now require server-authoritative responses | 14 | 6 |
| B2-005 | Test fixtures and old client contracts no longer match the current initial state | 13 | 5, plus shared cases in store.baseline |
| B2-R01 | Test-runner configuration/discovery failures | 0 assertions | 2 |

Total: 58 failed test cases across 16 files.

---

## B2-001 - Architecture policy violations

Status: Confirmed production/test policy debt.

Owner: authentication orchestration, database access, and API route boundaries.

Why this fails:

The architecture test directly finds six rule violations. These are not flaky
assertions or missing mocks; the listed production paths violate the policy
that the test enforces.

Evidence:

- One client loader still fetches a deprecated game-state bootstrap endpoint.
- Two deprecated auth-route test files remain active.
- AuthProvider still uses the legacy orchestrator dependency alias.
- The Math.random scan treats visual particle randomness and test text as
  security-ID contexts, so the rule implementation is too broad even though
  its security goal is correct.
- The config table helper still has one select("*") query.
- Four useful auth routes have no rate-limit dependency.

Failed cases:

1. tests/architecture/auth-orchestrator.test.ts
   - A1: no src/ caller uses the deprecated bootstrap routes via fetch/axios/undici
     - Found: src/lib/game/state/initialServerStateLoader.client.ts:32
       fetching /api/game/state/initial.
   - A2: no active test file under tests/api/auth/ covers a deprecated route
     - Found: tests/api/auth/confirm-link.test.ts.
     - Found: tests/api/auth/link-identity.test.ts.
   - A3: AuthProvider.tsx wires the post-PR4-4A orchestrator deps shape
     - Found: AuthProvider uses legacy AuthOrchestratorDeps instead of
       AuthOrchestratorBootstrapDeps.
   - A5: Math.random is not used to generate security IDs (SEC-008)
     - Found: AmbientParticles visual randomness plus test-file text.
   - A6: no select('*') in src/app/api/ or src/lib/db/ (PER-003)
     - Found: src/lib/db/types.ts:11.
   - A7: every src/app/api/auth/ route handler imports checkRateLimit (API-001)
     - Found: callback, device/register, guest/quickstart, and session/me.

Decision needed before fixing:

Separate genuine production violations from the over-broad Math.random scanner.
Do not weaken SEC-008 merely to make this test pass.

---

## B2-002 - Auth bootstrap test boundary mismatch

Status: Confirmed test/production dependency-boundary mismatch.

Owner: src/lib/auth/server/bootstrapService.server.ts and the two auth bootstrap
test suites.

Why this fails:

Both test files install their dynamic Supabase mock at lib/db/access. The actual
bootstrap service resolves the browser session through lib/supabase/server.
Therefore the test session and RPC fixture do not reach the production service.
Authenticated scenarios are treated as guest/fresh flows, and upgrade/conflict
fixtures are never exercised as intended.

This is also an architecture decision point: DB-015 says cookie-aware Supabase
clients should use lib/db/access so one mock covers the server-side surface.
The production bootstrap service currently imports lib/supabase/server directly.
Before changing tests only, decide whether that direct production import is a
permitted legacy shim or should migrate to the canonical boundary.

Failed cases:

1. tests/api/auth/bootstrap.test.ts
   - returns 200 BOOTSTRAP_READY for authenticated bootstrap (no upgrade)
     - Expected source auth; received fresh.
   - returns 200 BOOTSTRAP_READY after successful guest-to-auth upgrade
     - Expected source auth; received fresh.
   - returns 200 BOOTSTRAP_READY with archiveReceiptId when default
     auth-wins-archive-guest policy archives a guest
     - Expected archive receipt; received null.
   - returns 409 ACCOUNT_PROGRESS_CONFLICT only when explicit_conflict policy
     is requested and upgrade RPC reports CONFLICT
     - Expected 409; received 200.
   - falls back to default policy when an unknown mergePolicy value is passed
     - Expected archive receipt; received null.
   - returns 422 STATE_RECOVERY_REQUIRED when auth RPC reports missing auth user
     - Expected 422; received 200.
   - returns 422 STATE_RECOVERY_REQUIRED when authenticated RPC returns
     missing fields
     - Expected 422; received 200.
   - ignores previousAuthUserId when it equals the current session user
     (idempotent auth path)
     - Expected 200; received 422.

2. tests/api/architecture/dataLoadIntegrity.test.ts
   - loads exact saved gameplay data; nothing is rewritten
     - Expected 200; received 422.
   - is idempotent - repeated bootstrap returns identical values
     - Expected saved money 8500; received undefined.
   - preserves gameplay data under auth user_id after upgrade
     - Expected 200; received 422.
   - repeat callback does not duplicate the upgrade
     - Expected saved money 4200; received undefined.
   - returns 409 and leaves both original states unchanged
     - Expected 409; received 422.

---

## B2-003 - Prestige unit test mocks an obsolete module path

Status: Confirmed stale mock after module ownership moved.

Owner: tests/unit/serverAuthoritativePrestige.test.ts.

Why this fails:

The test mocks lib/db/initialState.server. The prestige validator now reaches
lib/db/infra/initialState.server. The mock does not intercept that import, so
the test calls the real canonical-state loader without a configured service-role
database client. The validator correctly fails closed, then every "eligible
prestige" assertion fails as a consequence.

This is not evidence that prestige gameplay is invalid. It is evidence that the
test no longer replaces its external database dependency at the module path the
code actually owns.

Failed cases:

1. tests/unit/serverAuthoritativePrestige.test.ts
   - returns valid + correctedState for eligible prestige
   - computes CP using server-side formula
   - increments totalPrestiges by exactly 1
   - adds to existing corporationPoints (does not reset)
   - preserves megaFactoryUnlocked and bonuses in correctedState
   - exactly 5 buildings accepted (boundary)
   - scales with research count
   - scales with contractsCompleted
   - returns FULL canonical reset in correctedState (not just prestigeState)
   - overrides pre-prestige state values with canonical defaults
   - preserves lastOnlineTimestamp from input state when present
   - falls back to canonical lastOnlineTimestamp when not in input

Observed supporting error:

- ConfigLoader reports that Supabase config is unavailable because the service
  role client is not configured.

---

## B2-004 - Server-authoritative actions are tested as old local mutations

Status: Confirmed stale unit-test contract.

Owner: game store action tests and the action-validator test harness.

Why this fails:

These gameplay actions now call the server action validator and apply only the
returned correctedState. That is required by SEC-001, STO-008, and ARC-001.
The affected unit tests reset a local Zustand store, call the action, and then
expect immediate local state changes without supplying an approved
server-corrected response. The action therefore fails closed or remains async,
which is correct production behavior but invalidates the old test contract.

Failed cases:

1. tests/unit/store.baseline.test.ts
   - collectPayout collects pending
   - buildBuilding deducts money and adds building
   - upgradeBuilding increases level
   - toggleBuilding flips active
   - upgradeStorage increases capacity

2. tests/unit/services/buildingService.test.ts
   - buildBuilding deducts money and adds building
   - upgradeBuilding increases level
   - toggleBuilding toggles active state

3. tests/unit/services/marketService.test.ts
   - buyResource does nothing when insufficient funds

4. tests/unit/services/payoutService.test.ts
   - collectPayout adds pendingPayout to money
   - collectPayout resets pendingPayout to 0

5. tests/unit/services/storageService.test.ts
   - upgradeStorage increases capacity

6. tests/unit/services/transportService.test.ts
   - upgradeTransportLine does nothing for non-existent line
     - The action is async, so even its no-op result is a Promise. The test
       still expects synchronous undefined.
   - buildTransportLine adds line

Required fix direction:

Do not reintroduce local fallback mutations. Update the tests to mock the
client action validator with approved correctedState payloads, await async
actions, and assert that the store applies the server response.

---

## B2-005 - Initial-state fixtures and client contracts are stale

Status: Confirmed test setup and expectation drift.

Owner: service test fixtures and initial client state contracts.

Why this fails:

These tests assume state that no longer exists in the default client store, or
they assert old client-side API behavior:

- Initial automationUnlocks is now an empty list and is expected to be hydrated
  from server state.
- A saved blueprint made from an empty building list is rejected by the current
  blueprint validator.
- The first drone costs zero because the cost is 2000 times current fleet size;
  the initial fleet is empty.
- Daily login is currently a local state operation; it does not call the legacy
  daily-reward endpoint. Claiming requires an unclaimed reward fixture before
  it reaches server validation.
- Some fixtures assume resource keys and action names that are not present in
  the current initial store.

Failed cases:

1. tests/unit/services/automationService.test.ts
   - activateAutomation activates an unlocked automation
   - activateAutomation rejects insufficient corporation points
   - activateAutomation does nothing if already active
   - activateAutomation rejects when research requirement not met
   - activateAutomation autoCollect activates successfully

2. tests/unit/store.baseline.test.ts
   - importBlueprint round-trips
   - buyDrone rejected without money
   - all action keys present

3. tests/unit/services/blueprintService.test.ts
   - importBlueprint accepts valid code

4. tests/unit/services/dailyRewardService.test.ts
   - checkDailyLogin calls the API
   - claimDailyReward calls the API

5. tests/unit/services/droneService.test.ts
   - buyDrone does nothing with no money
   - upgradeDrone upgrades drone speed

Required fix direction:

Update fixtures to construct the state required by each behavior. For example,
seed automation unlocks, add a valid building before blueprint export, create a
drone when testing upgrades, and give daily-reward tests an unclaimed reward.
Confirm whether daily login should remain local; do not add a network call only
to satisfy a stale test.

---

## B2-R01 - Test runner discovery/configuration failures

Status: Confirmed test configuration debt. These do not count toward the
58 failed test cases because Vitest could not execute a test assertion.

1. tests/e2e/auth-merge-full.spec.ts
   - Error: Playwright Test did not expect test.describe.configure() to be
     called here.
   - Cause: Vitest includes every tests/**/*.spec.ts file, which picks up this
     Playwright E2E spec. Playwright owns tests/e2e via playwright.config.ts.
   - Fix direction: exclude tests/e2e from Vitest discovery; run it through
     the Playwright command only.

2. tests/unit/services/offlineService.test.ts
   - Error: No test suite found in file.
   - Cause: the file is named as a Vitest test but contains no describe or it
     block.
   - Fix direction: either add the intended tests, move the fixture-only file
     away from Vitest discovery, or remove it in a separately approved cleanup.

## Safe Repair Order

1. Fix B2-R01 so the test runner executes only the correct framework files.
2. Resolve B2-002 using the DB-015 boundary decision; it affects bootstrap and
   data integrity together.
3. Correct the B2-003 module mock path and verify the prestige validator in
   isolation.
4. Update B2-004 tests around server-authoritative correctedState contracts.
5. Update B2-005 fixtures and client contract expectations.
6. Resolve B2-001 policy violations, keeping the Math.random security rule
   precise rather than weakening it.

No source or test behavior has been changed by this inventory.
