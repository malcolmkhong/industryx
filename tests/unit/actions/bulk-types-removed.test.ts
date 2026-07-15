/**
 * tests/unit/actions/bulk-types-removed.test.ts
 *
 * PR-BP-4b regression guard (2026-07-15):
 *   The `bulk_build` and `bulk_sell` action types were declared in the
 *   `ValidatedActionType` union and `ACTIONS_WITH_SERVER_STATE` Set but
 *   had no handler, no endpoint, no `VALID_ACTIONS` membership, no client
 *   emission, and no test. They were schema-only types per audit V-037.
 *
 *   They have been removed from:
 *     - `src/lib/game/actions/client/validationTypes.ts` (union + Set)
 *     - `src/lib/game/actions/server/correctedStateResponse.ts` (log union)
 *
 *   The DB CHECK constraint (`supabase/migrations/...004...sql`) is
 *   retained as forward-compatible — see audit V-037 decision "implement
 *   or remove from union; align validationTypes + correctedStateResponse".
 *
 *   This test pins the current state: types MUST NOT be in the union/Set
 *   so that any future attempt to use them surfaces as a TypeScript error
 *   rather than a silent fallback to the dispatcher "Unhandled action"
 *   branch.
 */

import { describe, expect, it } from "vitest";
import {
  ACTIONS_WITH_SERVER_STATE,
  type ValidatedActionType,
} from "@/lib/game/actions/client/validationTypes";

describe("PR-BP-4b — bulk_build / bulk_sell removed from client action types", () => {
  it("ValidatedActionType union does NOT include 'bulk_build'", () => {
    // Type-level: the union should not contain the string.
    type HasBulkBuild = "bulk_build" extends ValidatedActionType ? true : false;
    const assertion: HasBulkBuild = false;
    expect(assertion).toBe(false);
  });

  it("ValidatedActionType union does NOT include 'bulk_sell'", () => {
    type HasBulkSell = "bulk_sell" extends ValidatedActionType ? true : false;
    const assertion: HasBulkSell = false;
    expect(assertion).toBe(false);
  });

  it("ACTIONS_WITH_SERVER_STATE Set does NOT include 'bulk_build'", () => {
    expect(ACTIONS_WITH_SERVER_STATE.has("bulk_build" as ValidatedActionType)).toBe(false);
  });

  it("ACTIONS_WITH_SERVER_STATE Set does NOT include 'bulk_sell'", () => {
    expect(ACTIONS_WITH_SERVER_STATE.has("bulk_sell" as ValidatedActionType)).toBe(false);
  });
});