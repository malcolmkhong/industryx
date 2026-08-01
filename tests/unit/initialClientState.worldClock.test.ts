/**
 * tests/unit/initialClientState.worldClock.test.ts — Phase 1 of the
 * time refactor. Verifies the client-side stub state includes a valid
 * `worldClock` so the header clock renders before hydration completes.
 *
 * Why this exists separately from initialState.server.test.ts:
 * the stub is the client's fallback when the bootstrap response is
 * delayed or fails. The header relies on `formatWorldClock` and
 * `worldClock` from the store; without this invariant, the header
 * throws before hydration completes.
 */

import { describe, expect, it } from "vitest";
import { createStubServerData } from "@/lib/game/state/initialClientState";

describe("createStubServerData — worldClock invariant", () => {
  it("includes a finite worldClock", () => {
    const stub = createStubServerData();
    expect(stub.worldClock).toBeDefined();
    expect(typeof stub.worldClock.worldStartUtc).toBe("string");
    expect(stub.worldClock.worldStartUtc.length).toBeGreaterThan(0);
    expect(Number.isFinite(stub.worldClock.ticksPerRealSecond)).toBe(true);
    expect(stub.worldClock.ticksPerRealSecond).toBeGreaterThan(0);
    expect(Number.isFinite(stub.worldClock.displayTimezoneOffsetHours)).toBe(true);
  });

  it("uses the canonical anchor 2026-01-01T00:00:00.000Z", () => {
    const stub = createStubServerData();
    expect(stub.worldClock.worldStartUtc).toBe("2026-01-01T00:00:00.000Z");
  });

  it("uses 1 tick per real second (matches DEFAULT_TICKS_PER_REAL_SECOND)", () => {
    const stub = createStubServerData();
    expect(stub.worldClock.ticksPerRealSecond).toBe(1);
  });

  it("defaults the display TZ offset to GMT+8", () => {
    const stub = createStubServerData();
    expect(stub.worldClock.displayTimezoneOffsetHours).toBe(8);
  });
});