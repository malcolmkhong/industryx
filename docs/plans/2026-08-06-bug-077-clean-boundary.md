# BUG-077 — Supabase Client Boundary Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate all 127 call sites of `createServiceRoleClient` / `isServiceRoleConfigured` to `getDbClient` / `isDbClientConfigured`, remove the legacy aliases, and prove production runtime behavior is unchanged.

**Architecture:** Three-phase mechanical migration.

1. **Phase 1 — Make both names behave identical.** Bind the legacy aliases to the new implementations **at construction time** (not just function-call time) so the existing 70 source files + 57 test files keep working while the boundary is the single source of truth.
2. **Phase 2 — Flip the defaults.** Update the shared `tests/unit/mocks/supabase.ts` factory, the two legacy compat shims (`@/lib/supabase/server`, `@/lib/db/admin/admin`), and the `tests/architecture/db-access.test.ts` invariant. New code path uses `getDbClient()` exclusively; legacy keeps working but is no longer the listed canonical name.
3. **Phase 3 — Delete.** Once `git grep` reports zero non-access references to the legacy names, drop the functions from `getDbClient.server.ts`, drop the `@deprecated` tags, drop the boundary test's third expect.

**Tech Stack:** Next.js 15, Vitest 4, Supabase JS v2, TypeScript 5.

**Constraint:** Never leave `tsc` or `eslint` in a failing state between tasks. Every task is a green commit.

**Pre-existing acceptance test:** `tests/architecture/db-access.test.ts` is the spec — it gets updated **only at the end**, after which it must still pass.

**TDD red-phase (committed before Task 1):** Two test scaffolds exist to drive this work:

- `tests/unit/db-access-boundary.test.ts` — 10 Vitest unit tests pinning the in-process identity contract (legacy alias returns the same singleton as canonical name; null on missing env; concurrent callers all see the same instance). Currently green because the alias already delegates.
- `tests/integration/db-access-boundary.test.ts` — node:test integration suite. The in-process subset currently passes. The **filesystem invariant** suite (gated behind `BUG077_FILESYSTEM_INVARIANT=1`) intentionally fails today with **68 violations** — the exact list of legacy-importing files. Each Task 6 batch should re-enable the env to prove progress; final un-skip happens at Plan Task 9.3 where the count must reach 0.

---

## Inventory snapshot

- **70 source files** call `createServiceRoleClient`. Allowed as-is until Phase 3.
- **57 test files** call `createServiceRoleClient` or `isServiceRoleConfigured`. Most route through `mockSupabaseServer()` at `tests/unit/mocks/supabase.ts:79` — a single factory that's reused. That's the leverage point for Phase 2.
- **2 legacy compat shims** re-export the old name: `@/lib/supabase/server` and `@/lib/db/admin/admin`. Architecture test allows them.
- **1 architecture test** enforces both names exist on boundary, both old and new (`tests/architecture/db-access.test.ts:86-98`).

---

### Task 1: Pin behavior — both names return the exact same client

**Files:**

- Modify: `src/lib/db/access/getDbClient.server.ts:80-93`

**Step 1: Read the current implementation**

```ts
// Legacy aliases (kept for the migration window)
export function createServiceRoleClient(): SupabaseClient | null {
  return getDbClient();
}
```

Confirm the function body already delegates to `getDbClient()`. If not, fix it now.

**Step 2: Add a runtime assertion**

Replace the single-line body with an assertion that **proves** the legacy and new return identical references (the singleton contract):

```ts
export function createServiceRoleClient(): SupabaseClient | null {
  const client = getDbClient();
  // BUG-077: legacy must never bypass the singleton — that path bypasses
  // caching and would create a fresh client per request. Asserting identity
  // makes any drift a runtime error rather than a silent perf regression.
  if (client !== _cached) {
    throw new Error(
      "[BUG-077] createServiceRoleClient drifted from getDbClient",
    );
  }
  return client;
}
```

**Step 3: Run the existing access architecture tests**

Run: `npx vitest run tests/architecture/db-access.test.ts`
Expected: PASS. (No behavior change yet — both code paths return the same singleton.)

**Step 4: Run the initial-state test suite**

Run: `npx vitest run tests/unit/initialState.server.test.ts tests/unit/initialStateNoImports.test.ts tests/api/game/initial-state.test.ts tests/unit/p2-11-crypto-rng-in-initial-state.test.ts tests/unit/serverGameDataShape.test.ts tests/unit/serverGameStateHydration.test.ts`
Expected: PASS (55 tests total — same as before).

**Step 5: Commit**

```bash
git add src/lib/db/access/getDbClient.server.ts
git commit -m "fix(access): pin createServiceRoleClient to singleton (BUG-077 step 1)"
```

---

### Task 2: Add a comprehensive mock surface for both names

**Files:**

- Modify: `tests/unit/mocks/supabase.ts:79-87`

**Step 1: Verify the factory exposes both names**

Current state:

```ts
export function mockSupabaseServer(
  result: MockSupabaseResult = { data: [], error: null },
) {
  const { client } = createMockSupabaseClient(result);
  return {
    createServiceRoleClient: () => client,
    createClient: async () => client,
    isServiceRoleConfigured: () => true,
    isSupabaseConfigured: () => true,
  };
}
```

**Step 2: Add the new names to the factory**

```ts
export function mockSupabaseServer(
  result: MockSupabaseResult = { data: [], error: null },
) {
  const { client } = createMockSupabaseClient(result);
  return {
    // Legacy aliases (kept until BUG-077 sweep completes)
    createServiceRoleClient: () => client,
    isServiceRoleConfigured: () => true,
    // Canonical boundary names (Phase 2+)
    getDbClient: () => client,
    requireDbClient: () => client,
    isDbClientConfigured: () => true,
    createClient: async () => client,
    isSupabaseConfigured: () => true,
  };
}
```

**Step 3: Run the entire Vitest suite to confirm no test broke**

Run: `npx vitest run`
Expected: All previously-passing tests still pass. The new mock names are additive — no test calls them yet.

**Step 4: Commit**

```bash
git add tests/unit/mocks/supabase.ts
git commit -m "test(mocks): expose canonical boundary names alongside legacy (BUG-077 step 2)"
```

---

### Task 3: Migrate the two legacy compat shims

**Files:**

- Modify: `src/lib/supabase/server.ts:85` — `createServiceRoleClient`
- Modify: `src/lib/db/admin/admin.ts:22-23`

**Step 1: Read each shim and identify what it imports from the boundary**

For `src/lib/supabase/server.ts:5`: `createServiceRoleClient as getServiceRoleClientFromBoundary`. Switch the alias to `getDbClient as getServiceRoleClientFromBoundary` and keep the local export name `createServiceRoleClient` if the shim still re-exports it for back-compat.

For `src/lib/db/admin/admin.ts:22-23`: replace the two legacy imports with `getDbClient` / `isDbClientConfigured`.

**Step 2: Verify callers of these shims still work**

Run: `npx tsc --noEmit --project tsconfig.json --skipLibCheck`
Expected: PASS.

**Step 3: Run the architecture test (it should still pass — both names still exposed)**

Run: `npx vitest run tests/architecture/db-access.test.ts`
Expected: PASS.

**Step 4: Commit**

```bash
git add src/lib/supabase/server.ts src/lib/db/admin/admin.ts
git commit -m "refactor(shims): route internal use through getDbClient (BUG-077 step 3)"
```

---

### Task 4: Migrate the shared mock factory's owner — `tests/architecture/db-access.test.ts`

**Files:**

- Modify: `tests/architecture/db-access.test.ts:90-98` — assertion ONLY changes in Phase 4; here we add coverage so we know nothing is missed

**Step 1: Add a second invariant — assert the canonical names are imported everywhere**

Append a new `it` block to the existing describe:

```ts
it("routes all canonical-name call sites through the boundary", () => {
  const canonicalNames = [
    "getDbClient",
    "requireDbClient",
    "isDbClientConfigured",
  ];
  const violations = offenders.filter((o) => canonicalNames.includes(o.name));
  expect(violations).toEqual([]);
});
```

**Step 2: Run the architecture test**

Run: `npx vitest run tests/architecture/db-access.test.ts`
Expected: PASS (no `getDbClient` / `requireDbClient` used outside the boundary yet, so the invariant holds vacuously).

**Step 3: Commit**

```bash
git add tests/architecture/db-access.test.ts
git commit -m "test(architecture): assert canonical names stay in the boundary (BUG-077 step 4)"
```

---

### Task 5: Migrate one canonical helper, end-to-end, as a worked example

**Files:**

- Modify: `src/lib/db/shared/merge.ts:2` (already imports `asFullState` — add `getDbClient`)
- Modify: `src/lib/db/shared/merge.ts:25` — replace `createServiceRoleClient()`

**Step 1: Replace the import**

```ts
// Before:
import { createServiceRoleClient } from "@/lib/db/access";

// After:
import { getDbClient } from "@/lib/db/access";
```

**Step 2: Replace the call site**

Find every `createServiceRoleClient()` in the file and replace with `getDbClient()`. The null-handling pattern stays identical — both return `SupabaseClient | null` for now. (We'll switch to `requireDbClient` only where the file genuinely wants fail-closed semantics, judged per call site.)

**Step 3: Run the merge tests**

Run: `npx vitest run tests/unit/serverAuthoritativeDailyReward.test.ts tests/api/auth/migrate-guest.test.ts`
Expected: PASS (any failure = the migration is wrong, revert).

**Step 4: Run tsc + eslint + full suite**

Run: `npx tsc --noEmit --project tsconfig.json --skipLibCheck && npx eslint --no-warn-ignored src/lib/db/shared/merge.ts && npx vitest run`
Expected: ALL GREEN.

**Step 5: Commit**

```bash
git add src/lib/db/shared/merge.ts
git commit -m "refactor(merge): migrate createServiceRoleClient -> getDbClient (BUG-077 step 5)"
```

---

### Task 6: Mechanically migrate the remaining 69 source files (worktree-isolated)

**Files:** `git grep -l "createServiceRoleClient" src/ | grep -v "src/lib/db/access/"` — 69 files after Task 5.

**Strategy:** Do this in batches of 5-10 files per commit to keep diffs reviewable. For each batch:

**Step 1: List the batch**

```bash
git grep -l "createServiceRoleClient" src/ | grep -v "src/lib/db/access/"
```

**Step 2: Per file, apply the same pattern as Task 5**

- Replace `createServiceRoleClient` with `getDbClient` (or `requireDbClient` where the existing null-check explicitly throws)
- Replace `isServiceRoleConfigured` with `isDbClientConfigured`
- Update the import line

**Step 3: Run the tests for the migrated module**

For each file's batch, run the corresponding test files via `git log --follow --format="" --name-only <file>` to find sibling tests. Triage any failures individually — they almost always mean the test mock needs an updated key.

**Step 4: Batch commit**

```bash
git add src/<batch files>
git commit -m "refactor(<batch>): migrate db/access legacy aliases (BUG-077 step 6 batch N)"
```

**Step 5: Run full tsc + Vitest after each batch**

Run: `npx tsc --noEmit --project tsconfig.json --skipLibCheck && npx vitest run`
Expected: GREEN. If red, bisect by reverting half the batch.

**Step 6: Repeat for next batch**

Estimated 7-9 batches. Skip weekends / hot deploy windows.

---

### Task 7: Migrate the 57 test files (batch-isolated)

**Files:** `git grep -l "createServiceRoleClient\\|isServiceRoleConfigured" tests/`

**Strategy:** Tests are simple — most just need `createServiceRoleClient` → `getDbClient` in the `vi.mock()` factory block. ~50 of them go through `mockSupabaseServer()` (already supports both names after Task 2) — these are zero-work.

**Step 1: Identify the easy subset (already covered by mock factory)**

```bash
git grep -l "mockSupabaseServer" tests/ | xargs -I{} grep -l "createServiceRoleClient" {}
```

If any file in this intersection still manually defines `createServiceRoleClient`, Task 2 already covers it — **delete the manual definition** in favor of `mockSupabaseServer()`.

**Step 2: Migrate the remaining test files**

For files that hand-roll mocks without `mockSupabaseServer`, apply the same import-rename pattern. The mock contract is now: `getDbClient: () => client, requireDbClient: () => client, isDbClientConfigured: () => true`.

**Step 3: Run Vitest**

Run: `npx vitest run`
Expected: ALL GREEN.

**Step 4: Batch commit**

```bash
git add tests/<batch files>
git commit -m "test(<batch>): migrate db/access legacy aliases in mocks (BUG-077 step 7)"
```

---

### Task 8: Boundary invariant — assert legacy aliases are gone everywhere outside the boundary module

**Files:**

- Modify: `tests/architecture/db-access.test.ts:74-87`

**Step 1: Verify nothing outside the boundary uses the old names**

Run: `git grep -n "createServiceRoleClient\\|isServiceRoleConfigured" src tests | grep -v "src/lib/db/access/" | grep -v "src/lib/supabase/server.ts" | grep -v "src/lib/db/admin/admin.ts"`
Expected: empty. If not, more migration needed.

**Step 2: Tighten the architecture test**

Change `MIGRATABLE_NAMES` to track only canonical names:

```ts
const MIGRATABLE_NAMES = [
  "getDbClient",
  "requireDbClient",
  "isDbClientConfigured",
];
```

Change the boundary-must-have assertion to drop `createServiceRoleClient`:

```ts
it("exposes the canonical boundary module", () => {
  const boundary = readFileSync(
    join(SRC, "lib", "db", "access", "index.ts"),
    "utf-8",
  );
  expect(boundary).toMatch(/export[^;]+getDbClient/);
  expect(boundary).toMatch(/export[^;]+requireDbClient/);
  expect(boundary).not.toMatch(/createServiceRoleClient/); // legacy fully removed
});
```

**Step 3: Run architecture test**

Run: `npx vitest run tests/architecture/db-access.test.ts`
Expected: PASS.

**Step 4: Commit**

```bash
git add tests/architecture/db-access.test.ts
git commit -m "test(architecture): enforce canonical-only imports (BUG-077 step 8)"
```

---

### Task 9: Final removal — delete the legacy aliases

**Files:**

- Modify: `src/lib/db/access/getDbClient.server.ts:80-100`
- Modify: `src/lib/db/access/index.ts:28-29`

**Step 1: Remove the legacy exports**

In `getDbClient.server.ts`, delete the `createServiceRoleClient` and `isServiceRoleConfigured` functions AND the entire `// ─── Legacy aliases (kept for the migration window) ───` comment block.

In `index.ts:28-29`, remove the two re-exports.

**Step 2: Remove the `mockSupabaseServer` legacy keys**

In `tests/unit/mocks/supabase.ts`, remove `createServiceRoleClient` and `isServiceRoleConfigured` from the factory return object.

**Step 3: Run tsc + ESLint + Vitest**

Run: `npx tsc --noEmit --project tsconfig.json --skipLibCheck && npx eslint --no-warn-ignored src tests 2>&1 | tail -10 && npx vitest run`
Expected: ALL GREEN.

**Step 4: Run a production smoke build**

Run: `npx next build 2>&1 | tail -10`
Expected: Build succeeds. Any runtime reference to a deleted export would surface here in Vercel's lazy-compilation paths.

**Step 5: Commit**

```bash
git add src/lib/db/access/ tests/unit/mocks/supabase.ts
git commit -m "feat(access): drop legacy createServiceRoleClient alias (BUG-077)"
```

**Step 6: Update the BUG-077 entry**

If `docs/bugs.md` or similar exists, mark BUG-077 as resolved. (Skip if not applicable — don't fabricate files.)

---

### Task 10: Production observability — confirm runtime parity

**Files:** none — verification-only.

**Step 1: Confirm both names behave identically BEFORE Task 9's deletion (still possible if deferring Task 9)**

This task should already have passed Task 1's identity assertion. If you completed it, you're good.

**Step 2: After deploy, compare metrics**

Vercel logs / Sentry should show no `TypeError: … is not a function` errors after the deletion lands. Watch for 24 hours post-deploy.

**Step 3: Update the change log**

```bash
git log --oneline v0.<previous>..HEAD -- src/lib/db/access tests/architecture/db-access.test.ts
```

Document in the next release notes that the boundary module's public surface is now `getDbClient` + `requireDbClient` + `isDbClientConfigured`.

---

## Acceptance criteria

- [ ] `git grep -n "createServiceRoleClient\\|isServiceRoleConfigured" src` returns zero hits outside `src/lib/db/access/`
- [ ] `git grep -n "createServiceRoleClient\\|isServiceRoleConfigured" tests` returns zero hits
- [ ] `npx tsc --noEmit` is clean
- [ ] `npx eslint --no-warn-ignored src tests` is clean
- [ ] `npx vitest run` is green (all ~600+ tests)
- [ ] `tests/architecture/db-access.test.ts` passes with the new invariant
- [ ] `npx next build` succeeds
- [ ] No `@deprecated` JSDoc tags remain for the deleted names
- [ ] Vercel logs (post-deploy, 24h) show zero TypeError in production

---

## Risk register

| Risk                                                    | Likelihood | Impact | Mitigation                                                                    |
| ------------------------------------------------------- | ---------- | ------ | ----------------------------------------------------------------------------- |
| Test mocks silently miss an export                      | Med        | High   | Task 2 adds all names to factory once; Task 8 arches this into a CI invariant |
| `@/lib/supabase/server` callers break                   | Low        | Med    | Shim is allowed by arch test; Task 3 migrates it explicitly                   |
| Test file missed during manual sweep                    | Med        | Low    | Task 8 arch test; Phase 4 grep verification                                   |
| Production lazy-compile catches a missed call site late | Low        | High   | Run `npx next build` (Task 9.4) before deploy; watch Vercel logs 24h after    |
| Cognitive load during mechanical sweep                  | Low        | Med    | Batch by 5-10 files per commit; bisect helper in Task 6.5                     |

---

## Out of scope (don't touch in this plan)

- Migrating `createClient` / `isSupabaseConfigured` (the anon-client half) — those have a different lifecycle (per-request cookie store) and aren't part of this BUG.
- Refactoring `requireDbClient`-vs-`getDbClient` choice at call sites — separate refactor; for now, mechanical migration preserves existing null-handling.
- Schema-level changes to the boundary module API (e.g. exporting a React hook, factory function) — pure migration only.

---

## Time budget (best guess — not a delivery promise)

| Task                                | Estimated effort                |
| ----------------------------------- | ------------------------------- |
| Task 1 (pin behavior)               | 15 min                          |
| Task 2 (mock factory)               | 10 min                          |
| Task 3 (legacy shims)               | 30 min                          |
| Task 4 (arch invariant v1)          | 15 min                          |
| Task 5 (worked example)             | 30 min                          |
| Task 6 (69 source files in batches) | 4-6 hours                       |
| Task 7 (57 test files)              | 2-3 hours                       |
| Task 8 (arch invariant v2)          | 20 min                          |
| Task 9 (delete aliases)             | 30 min                          |
| Task 10 (observability)             | ongoing                         |
| **Total**                           | **~9-11 hours of focused work** |


## Status: COMPLETE (Tasks 1-9)
