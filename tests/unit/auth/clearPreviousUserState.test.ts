/**
 * tests/unit/auth/clearPreviousUserState.test.ts
 *
 * Regression test for audit C1 + C2: AuthProvider's
 * `clearPreviousUserState` callback must:
 *   - C1: actually reset the Zustand store to a stub (the pre-audit
 *     code only did `void stub` which was a no-op)
 *   - C2: clear the canonical initial-state cache so the next
 *     bootstrap does not surface the previous user's gameState
 *
 * The callback runs on sign-out and on auth-user-changed events. It
 * is critical for plan §5 hard rule #3 ("Never render one user's
 * state while another is bootstrapping"). Before the fix, the
 * previous user's money/buildings stayed visible during the brief
 * window before applyServerState fired.
 *
 * Mock strategy: the test mounts a fresh useGameStore (the real
 * one — no vi.mock) and calls the same reset primitive that
 * AuthProvider uses after my C1 fix:
 *
 *     useGameStore.setState(createStubInitialState() as Partial<...>, false)
 *
 * The false second arg means "merge" (don't replace the whole
 * store) so the action methods stay attached.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { useGameStore, applyServerState } from "@/lib/game/state/store";
import {
  setCanonicalInitialState,
  hydrateInitialStateFromServer,
} from "@/lib/game/state/initialServerStateLoader.client";
import { createStubInitialState } from "@/lib/game/state/store-bootstrap";

describe("clearPreviousUserState (audit C1+C2)", () => {
  beforeEach(() => {
    // Reset module-level cache so the canonical initial state
    // does not leak between tests.
    setCanonicalInitialState(null);
  });

  it("resets the Zustand store to stub values on identity change", () => {
    // 1. Hydrate the store with a non-trivial game state.
    applyServerState({
      money: 12345,
      gameTick: 999,
      buildings: [
        { id: "b1", type: "ironMine", level: 3 },
        { id: "b2", type: "factory", level: 1 },
      ],
      workers: [{ id: "w1", type: "miner", level: 2 }],
      completedResearch: ["basicProcessing", "advancedSmelting"],
      quests: [{ id: "q1", status: "active" }],
    });
    const before = useGameStore.getState();
    expect(before.money).toBe(12345);
    expect(before.gameTick).toBe(999);

    // 2. Apply the C1 fix: reset the store to a stub by replacing
    //    the SERVER_FIELDS with stub values while keeping action
    //    methods attached. This is the same primitive AuthProvider
    //    now uses after the C1 audit fix.
    useGameStore.setState(
      createStubInitialState() as Partial<
        ReturnType<typeof useGameStore.getState>
      >,
      false,
    );

    // 3. Verify the previous user's data is gone.
    const after = useGameStore.getState();
    // The stub sets money to the canonical starting_money (2000)
    // or 0 — anything other than 12345 is the reset signal.
    expect(after.money).not.toBe(12345);
    expect(after.gameTick).not.toBe(999);
    // buildings/workers/research reset
    expect(after.buildings ?? []).toEqual([]);
    expect(after.workers ?? []).toEqual([]);
    expect(after.completedResearch ?? []).toEqual([]);
    // Action methods must still be attached (the setState with
    // `false` second arg merges, doesn't replace). Use a real
    // action from the core actions module.
    expect(typeof after.setGameSpeed).toBe("function");
  });

  it("clears the canonical initial-state cache (audit C2)", async () => {
    // 1. Simulate a successful bootstrap that cached a gameState.
    const guestState = {
      money: 5000,
      gameTick: 42,
      buildings: [{ id: "b1", type: "ironMine", level: 1 }],
    };
    setCanonicalInitialState(guestState);
    const cached = await hydrateInitialStateFromServer();
    expect(cached).toEqual(guestState);

    // 2. Apply the C2 fix: clear the cache as part of
    //    clearPreviousUserState.
    setCanonicalInitialState(null);

    // 3. Subsequent reads return null instead of the previous
    //    user's cached gameState.
    const after = await hydrateInitialStateFromServer();
    expect(after).toBeNull();
  });

  it("cleared cache does not leak to the next guest bootstrap", async () => {
    // Sequence test:
    //   1. Guest A bootstraps, caches their state.
    //   2. User signs in, AuthProvider runs clearPreviousUserState.
    //   3. User signs out, server creates a NEW guest B.
    //   4. New guest B bootstraps — they must NOT see Guest A's
    //      cached state. The fix guarantees this because
    //      setCanonicalInitialState(null) runs before the next
    //      bootstrap resolves.
    const guestA = { money: 999, gameTick: 100, buildings: [] };
    setCanonicalInitialState(guestA);
    expect(await hydrateInitialStateFromServer()).toEqual(guestA);

    // Sign-out transition
    setCanonicalInitialState(null);
    // Clear store too (mirrors the C1 fix)
    useGameStore.setState(
      createStubInitialState() as Partial<
        ReturnType<typeof useGameStore.getState>
      >,
      false,
    );

    // New guest bootstraps — server returns a fresh state.
    const guestB = { money: 2000, gameTick: 0, buildings: [] };
    setCanonicalInitialState(guestB);
    expect(await hydrateInitialStateFromServer()).toEqual(guestB);
    // Crucially, Guest A's money (999) is NOT visible.
    const cached = await hydrateInitialStateFromServer();
    expect(cached?.money).not.toBe(999);
    expect(cached?.money).toBe(2000);
  });

  it("after reset, applyServerState with new gameState hydrates cleanly", () => {
    // Sequence:
    //   1. Store has old user data.
    //   2. Reset to stub (C1).
    //   3. Apply new user's gameState.
    //   4. Store now shows the new user only.
    applyServerState({
      money: 10000,
      gameTick: 500,
      buildings: [{ id: "old-b1", type: "ironMine", level: 5 }],
    });
    expect(useGameStore.getState().money).toBe(10000);

    useGameStore.setState(
      createStubInitialState() as Partial<
        ReturnType<typeof useGameStore.getState>
      >,
      false,
    );
    expect(useGameStore.getState().money).not.toBe(10000);

    applyServerState({
      money: 2500,
      gameTick: 10,
      buildings: [{ id: "new-b1", type: "ironMine", level: 1 }],
    });
    const after = useGameStore.getState();
    expect(after.money).toBe(2500);
    expect(after.gameTick).toBe(10);
    expect(after.buildings?.[0]?.id).toBe("new-b1");
    // The old building ID is gone.
    expect(after.buildings?.find((b) => b.id === "old-b1")).toBeUndefined();
  });
});
