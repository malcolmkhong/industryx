/**
 * tests/unit/utils/gameClock.test.ts — Phase 1 + Phase 2 of the time
 * refactor. Pure unit tests for the world-clock helpers exported from
 * src/lib/utils/time.ts.
 *
 * Covers:
 *   - DEFAULT_WORLD_CLOCK shape and values
 *   - tickToUtcMs maps tick=0 to worldStartUtc
 *   - tickToUtcMs advances 1 tick = 1 second at ticksPerRealSecond=1
 *   - tickToUtcMs throws on invalid worldStartUtc
 *   - tickToUtcMs clamps negative / non-finite ticks to 0
 *   - utcMsToTick is the inverse of tickToUtcMs (round-trip)
 *   - utcMsToTick returns 0 for pre-anchor UTC and non-finite input
 *   - formatWorldClock emits HH:MM in the configured display TZ offset
 *   - formatWorldClock is identical for every client (no local clock input)
 *   - formatCountdown emits "Xm" for >=60 ticks and "Xs" for <60 ticks
 *   - formatCountdown emits "Now" for non-positive / non-finite input
 *   - formatShortDate and formatClock retain their existing behavior
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_DISPLAY_TZ_OFFSET_HOURS,
  DEFAULT_TICKS_PER_REAL_SECOND,
  DEFAULT_WORLD_CLOCK,
  DEFAULT_WORLD_START_UTC,
  formatClock,
  formatCountdown,
  formatShortDate,
  formatWorldClock,
  tickToUtcMs,
  utcMsToTick,
  type WorldClock,
} from "@/lib/utils/time";

describe("DEFAULT_WORLD_CLOCK constants", () => {
  it("anchors to 2026-01-01T00:00:00.000Z", () => {
    expect(DEFAULT_WORLD_START_UTC).toBe("2026-01-01T00:00:00.000Z");
  });

  it("uses 1 tick per real second at gameSpeed=1", () => {
    expect(DEFAULT_TICKS_PER_REAL_SECOND).toBe(1);
  });

  it("displays in GMT+8", () => {
    expect(DEFAULT_DISPLAY_TZ_OFFSET_HOURS).toBe(8);
  });

  it("exports a fully populated DEFAULT_WORLD_CLOCK", () => {
    expect(DEFAULT_WORLD_CLOCK).toEqual({
      worldStartUtc: DEFAULT_WORLD_START_UTC,
      ticksPerRealSecond: DEFAULT_TICKS_PER_REAL_SECOND,
      displayTimezoneOffsetHours: DEFAULT_DISPLAY_TZ_OFFSET_HOURS,
    });
  });
});

describe("tickToUtcMs", () => {
  it("maps tick=0 to the worldStartUtc instant", () => {
    const ms = tickToUtcMs(0, DEFAULT_WORLD_CLOCK);
    expect(ms).toBe(Date.parse(DEFAULT_WORLD_START_UTC));
  });

  it("advances one tick = one real second at ticksPerRealSecond=1", () => {
    const start = tickToUtcMs(0, DEFAULT_WORLD_CLOCK);
    expect(tickToUtcMs(1, DEFAULT_WORLD_CLOCK)).toBe(start + 1000);
    expect(tickToUtcMs(60, DEFAULT_WORLD_CLOCK)).toBe(start + 60_000);
  });

  it("respects ticksPerRealSecond scaling", () => {
    const fastClock: WorldClock = { ...DEFAULT_WORLD_CLOCK, ticksPerRealSecond: 10 };
    const start = tickToUtcMs(0, fastClock);
    // 10 ticks per real second: 1 tick = 100 ms.
    expect(tickToUtcMs(10, fastClock)).toBe(start + 1000);
  });

  it("clamps negative ticks to 0", () => {
    expect(tickToUtcMs(-5, DEFAULT_WORLD_CLOCK)).toBe(
      tickToUtcMs(0, DEFAULT_WORLD_CLOCK),
    );
  });

  it("clamps non-finite ticks to 0", () => {
    expect(tickToUtcMs(Number.NaN, DEFAULT_WORLD_CLOCK)).toBe(
      tickToUtcMs(0, DEFAULT_WORLD_CLOCK),
    );
    expect(tickToUtcMs(Number.POSITIVE_INFINITY, DEFAULT_WORLD_CLOCK)).toBe(
      tickToUtcMs(0, DEFAULT_WORLD_CLOCK),
    );
  });

  it("throws on invalid worldStartUtc", () => {
    const badClock: WorldClock = {
      ...DEFAULT_WORLD_CLOCK,
      worldStartUtc: "not-an-iso",
    };
    expect(() => tickToUtcMs(0, badClock)).toThrow(/invalid worldStartUtc/);
  });
});

describe("utcMsToTick", () => {
  it("maps the worldStartUtc instant to tick=0", () => {
    expect(utcMsToTick(Date.parse(DEFAULT_WORLD_START_UTC), DEFAULT_WORLD_CLOCK)).toBe(0);
  });

  it("round-trips with tickToUtcMs", () => {
    for (const tick of [0, 1, 60, 3600, 86_400, 1_234_567]) {
      const ms = tickToUtcMs(tick, DEFAULT_WORLD_CLOCK);
      expect(utcMsToTick(ms, DEFAULT_WORLD_CLOCK)).toBe(tick);
    }
  });

  it("returns 0 for pre-anchor UTC milliseconds", () => {
    expect(utcMsToTick(0, DEFAULT_WORLD_CLOCK)).toBe(0);
    expect(utcMsToTick(-1, DEFAULT_WORLD_CLOCK)).toBe(0);
  });

  it("returns 0 for non-finite input", () => {
    expect(utcMsToTick(Number.NaN, DEFAULT_WORLD_CLOCK)).toBe(0);
    expect(utcMsToTick(Number.POSITIVE_INFINITY, DEFAULT_WORLD_CLOCK)).toBe(0);
  });

  it("throws on invalid worldStartUtc", () => {
    const badClock: WorldClock = {
      ...DEFAULT_WORLD_CLOCK,
      worldStartUtc: "garbage",
    };
    expect(() => utcMsToTick(Date.now(), badClock)).toThrow(/invalid worldStartUtc/);
  });
});

describe("formatWorldClock", () => {
  it("emits HH:MM format", () => {
    const hhmm = formatWorldClock(0, DEFAULT_WORLD_CLOCK);
    expect(hhmm).toMatch(/^\d{2}:\d{2}$/);
  });

  it("starts at 08:00 (anchor + GMT+8 offset)", () => {
    // 2026-01-01T00:00:00Z + 8h = 2026-01-01T08:00 (display TZ).
    expect(formatWorldClock(0, DEFAULT_WORLD_CLOCK)).toBe("08:00");
  });

  it("advances by one minute every 60 ticks at 1x speed", () => {
    expect(formatWorldClock(60, DEFAULT_WORLD_CLOCK)).toBe("08:01");
    expect(formatWorldClock(60 * 60, DEFAULT_WORLD_CLOCK)).toBe("09:00");
  });

  it("rolls over 24h into the next day", () => {
    // 24h worth of minutes = 24 * 60 ticks
    expect(formatWorldClock(24 * 60 * 60, DEFAULT_WORLD_CLOCK)).toBe("08:00");
  });

  it("honors a different display timezone offset", () => {
    const utcClock: WorldClock = { ...DEFAULT_WORLD_CLOCK, displayTimezoneOffsetHours: 0 };
    expect(formatWorldClock(0, utcClock)).toBe("00:00");
    const negativeClock: WorldClock = { ...DEFAULT_WORLD_CLOCK, displayTimezoneOffsetHours: -5 };
    expect(formatWorldClock(0, negativeClock)).toBe("19:00"); // 00:00 UTC - 5h = previous day 19:00
  });

  it("is deterministic regardless of real local time", () => {
    // formatWorldClock takes only tick + clock — no `new Date()` argument,
    // so two callers at different real times get the same output.
    const a = formatWorldClock(12345, DEFAULT_WORLD_CLOCK);
    const b = formatWorldClock(12345, DEFAULT_WORLD_CLOCK);
    expect(a).toBe(b);
  });
});

describe("formatCountdown", () => {
  it('returns "Now" for zero or negative ticks', () => {
    expect(formatCountdown(0)).toBe("Now");
    expect(formatCountdown(-1)).toBe("Now");
    expect(formatCountdown(-99999)).toBe("Now");
  });

  it('returns "Now" for non-finite input', () => {
    expect(formatCountdown(Number.NaN)).toBe("Now");
    expect(formatCountdown(Number.POSITIVE_INFINITY)).toBe("Now");
  });

  it("emits whole minutes for >= 60 ticks (no seconds shown)", () => {
    expect(formatCountdown(60)).toBe("1m");
    expect(formatCountdown(120)).toBe("2m");
    expect(formatCountdown(300)).toBe("5m");
    expect(formatCountdown(3599)).toBe("59m");
  });

  it("emits clean seconds for < 60 ticks (no minutes shown)", () => {
    expect(formatCountdown(1)).toBe("1s");
    expect(formatCountdown(59)).toBe("59s");
  });

  it("floors fractional ticks", () => {
    expect(formatCountdown(60.9)).toBe("1m");
    expect(formatCountdown(59.9)).toBe("59s");
  });

  it("matches the spec transition at the 60-tick boundary", () => {
    expect(formatCountdown(60)).toBe("1m");
    expect(formatCountdown(59)).toBe("59s");
  });
});

describe("formatClock (regression — existing behavior)", () => {
  it("emits zero-padded HH:MM from a Date", () => {
    expect(formatClock(new Date("2026-07-27T03:05:00Z"))).toMatch(/^\d{2}:\d{2}$/);
    // Default branch uses local methods; just confirm the format is HH:MM.
    expect(formatClock(new Date("2026-01-01T00:00:00Z"))).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe("formatShortDate (regression — existing behavior)", () => {
  it("emits 'Mon DD' style", () => {
    const out = formatShortDate(new Date(2026, 6, 27)); // July 27, 2026 (local)
    expect(out).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
  });
});