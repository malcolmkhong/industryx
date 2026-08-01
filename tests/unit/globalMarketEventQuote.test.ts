import { describe, expect, it, vi } from "vitest";
import {
  applyActiveGlobalMarketEventToPrices,
  isMarketTrend,
  MARKET_TRENDS,
  parseMarketPriceQuotes,
  resolveActiveGlobalMarketEvent,
} from "@/lib/game/market/server/globalMarketEventQuote";
import { DEFAULT_WORLD_CLOCK, tickToUtcMs } from "@/lib/utils/time";

const ACTIVE_EVENT = {
  templateId: "oilCrisis",
  name: "Oil Crisis",
  description: "Oil supply disruption.",
  icon: "game-icons:oil-rig",
  effects: [
    {
      id: "oil",
      type: "marketPriceMultiplier" as const,
      target: "oil",
      value: 2.5,
    },
  ],
  startedAt: "2026-07-19T00:00:00.000Z",
  expiresAt: "2026-07-19T00:30:00.000Z",
};

describe("global market event quotes", () => {
  it("applies an active server event to returned prices without changing raw prices", () => {
    const prices = [
      {
        resource: "oil",
        currentPrice: 15,
        basePrice: 15,
        trend: "stable" as const,
        volume: 1,
      },
    ];
    const result = applyActiveGlobalMarketEventToPrices(
      prices,
      ACTIVE_EVENT,
      Date.parse("2026-07-19T00:15:00.000Z"),
      DEFAULT_WORLD_CLOCK,
    );

    expect(prices[0].currentPrice).toBe(15);
    expect(result).toEqual([{ ...prices[0], currentPrice: 37.5 }]);
  });

  it("fails closed for a malformed or expired event", () => {
    const prices = [
      {
        resource: "oil",
        currentPrice: 15,
        basePrice: 15,
        trend: "stable" as const,
        volume: 1,
      },
    ];
    expect(
      applyActiveGlobalMarketEventToPrices(
        prices,
        { expiresAt: "bad" },
        Date.now(),
        DEFAULT_WORLD_CLOCK,
      ),
    ).toEqual(prices);
    expect(
      applyActiveGlobalMarketEventToPrices(
        prices,
        {
          effects: [
            { type: "marketPriceMultiplier", target: "oil", value: 2.5 },
          ],
          expiresAt: "2026-07-19T00:00:00.000Z",
        },
        Date.parse("2026-07-19T00:15:00.000Z"),
        DEFAULT_WORLD_CLOCK,
      ),
    ).toEqual(prices);
  });
});

describe("Phase 5 — endsAtTick derivation", () => {
  it("derives endsAtTick from the canonical world clock", () => {
    const expiresAtMs = Date.parse(ACTIVE_EVENT.expiresAt);
    const expectedTick = Math.floor(
      ((expiresAtMs - Date.parse(DEFAULT_WORLD_CLOCK.worldStartUtc)) *
        DEFAULT_WORLD_CLOCK.ticksPerRealSecond) /
        1000,
    );

    const resolved = resolveActiveGlobalMarketEvent(
      ACTIVE_EVENT,
      Date.parse("2026-07-19T00:15:00.000Z"),
      DEFAULT_WORLD_CLOCK,
    );
    expect(resolved.status).toBe("active");
    if (resolved.status !== "active") return;
    expect(resolved.event.endsAtTick).toBe(expectedTick);
    expect(resolved.event.endsAtTick).toBeGreaterThan(0);
  });

  it("rejects a multiplier > 1000 as invalid (FIX 4 sanity cap)", () => {
    // 1000x is a sane upper bound. A 1001x multiplier is almost
    // certainly a bug or attack vector — reject it at the parser
    // so a corrupt config row can't make iron worth $1M/unit.
    const badEvent = {
      ...ACTIVE_EVENT,
      effects: [
        {
          id: "iron",
          type: "marketPriceMultiplier" as const,
          target: "iron",
          value: 1001,
        },
      ],
    };
    const resolved = resolveActiveGlobalMarketEvent(
      badEvent,
      Date.parse("2026-07-19T00:15:00.000Z"),
      DEFAULT_WORLD_CLOCK,
    );
    expect(resolved.status).toBe("invalid");
  });

  it("accepts a 0.1x (90% off) discount as valid (FIX 4 lower bound stays at 0)", () => {
    // value <= 0 was already the cutoff. After FIX 4 the upper
    // bound is 1000. A 0.1x discount must still parse.
    const discountEvent = {
      ...ACTIVE_EVENT,
      effects: [
        {
          id: "iron",
          type: "marketPriceMultiplier" as const,
          target: "iron",
          value: 0.1,
        },
      ],
    };
    const resolved = resolveActiveGlobalMarketEvent(
      discountEvent,
      Date.parse("2026-07-19T00:15:00.000Z"),
      DEFAULT_WORLD_CLOCK,
    );
    expect(resolved.status).toBe("active");
  });

  it("rejects a multiplier of 0 (price crash to free) as invalid (FIX 4)", () => {
    // 0 is not a "multiplier" — it's a "giveaway". The price
    // quote path must not produce a NaN/0 from a 0x multiplier.
    const freeEvent = {
      ...ACTIVE_EVENT,
      effects: [
        {
          id: "iron",
          type: "marketPriceMultiplier" as const,
          target: "iron",
          value: 0,
        },
      ],
    };
    const resolved = resolveActiveGlobalMarketEvent(
      freeEvent,
      Date.parse("2026-07-19T00:15:00.000Z"),
      DEFAULT_WORLD_CLOCK,
    );
    expect(resolved.status).toBe("invalid");
  });

  it("returns the same endsAtTick for every client (server-anchored)", () => {
    // Same input + same clock = same endsAtTick, regardless of caller
    // local time. Two "calls" at different real moments still derive the
    // same tick because the conversion is purely a function of expiresAt
    // and the world clock. Both calls use a nowMs before expiresAt so
    // each call resolves as active.
    const a = resolveActiveGlobalMarketEvent(
      ACTIVE_EVENT,
      Date.parse("2026-07-19T00:15:00.000Z"),
      DEFAULT_WORLD_CLOCK,
    );
    const b = resolveActiveGlobalMarketEvent(
      ACTIVE_EVENT,
      Date.parse("2026-07-19T00:29:00.000Z"),
      DEFAULT_WORLD_CLOCK,
    );
    if (a.status !== "active" || b.status !== "active") {
      throw new Error("expected both calls to be active");
    }
    expect(a.event.endsAtTick).toBe(b.event.endsAtTick);
  });

  it("falls back to endsAtTick=0 if clock derivation throws", () => {
    const badClock = { ...DEFAULT_WORLD_CLOCK, worldStartUtc: "not-an-iso" };
    const resolved = resolveActiveGlobalMarketEvent(
      ACTIVE_EVENT,
      Date.parse("2026-07-19T00:15:00.000Z"),
      badClock,
    );
    expect(resolved.status).toBe("active");
    if (resolved.status !== "active") return;
    expect(resolved.event.endsAtTick).toBe(0);
  });

  it("logs an error when clock derivation throws (FIX 2 observability)", () => {
    // FIX 2: the previous version silently swallowed the
    // utcMsToTick error and returned endsAtTick=0, which is
    // indistinguishable from a legitimate "expired" result. The
    // new version logs so production telemetry captures the cause.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const badClock = {
        ...DEFAULT_WORLD_CLOCK,
        worldStartUtc: "not-an-iso",
      };
      resolveActiveGlobalMarketEvent(
        ACTIVE_EVENT,
        Date.parse("2026-07-19T00:15:00.000Z"),
        badClock,
      );
      expect(errorSpy).toHaveBeenCalled();
      const callArgs = errorSpy.mock.calls[0];
      expect(callArgs[0]).toMatch(/utcMsToTick failed/);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("sets clockDegraded=true when clock derivation throws (FIX 8 wire-up)", () => {
    // FIX 8: distinguish "event just expired" (endsAtTick=0) from
    // "world clock is broken" (endsAtTick=0 + clockDegraded=true).
    // The client can now render a degraded-state UI for the latter.
    vi.spyOn(console, "error").mockImplementation(() => {});
    const badClock = { ...DEFAULT_WORLD_CLOCK, worldStartUtc: "not-an-iso" };
    const resolved = resolveActiveGlobalMarketEvent(
      ACTIVE_EVENT,
      Date.parse("2026-07-19T00:15:00.000Z"),
      badClock,
    );
    expect(resolved.status).toBe("active");
    if (resolved.status !== "active") return;
    expect(resolved.event.clockDegraded).toBe(true);
  });

  it("does NOT set clockDegraded when the derivation succeeds", () => {
    // The flag is optional; success path leaves it undefined.
    const resolved = resolveActiveGlobalMarketEvent(
      ACTIVE_EVENT,
      Date.parse("2026-07-19T00:15:00.000Z"),
      DEFAULT_WORLD_CLOCK,
    );
    expect(resolved.status).toBe("active");
    if (resolved.status !== "active") return;
    expect(resolved.event.clockDegraded).toBeUndefined();
  });

  it("endsAtTick converts back to the same expiresAt instant", () => {
    const resolved = resolveActiveGlobalMarketEvent(
      ACTIVE_EVENT,
      Date.parse("2026-07-19T00:15:00.000Z"),
      DEFAULT_WORLD_CLOCK,
    );
    if (resolved.status !== "active") throw new Error("expected active");
    const roundTripMs = tickToUtcMs(
      resolved.event.endsAtTick,
      DEFAULT_WORLD_CLOCK,
    );
    expect(roundTripMs).toBe(Date.parse(ACTIVE_EVENT.expiresAt));
  });

  it("propagates endsAtTick through applyActiveGlobalMarketEventToPrices", () => {
    const prices = [
      {
        resource: "oil",
        currentPrice: 15,
        basePrice: 15,
        trend: "stable" as const,
        volume: 1,
      },
    ];
    // We can only assert that the call does not throw and returns a price;
    // the endsAtTick is on the resolver output, not on the prices array.
    const result = applyActiveGlobalMarketEventToPrices(
      prices,
      ACTIVE_EVENT,
      Date.parse("2026-07-19T00:15:00.000Z"),
      DEFAULT_WORLD_CLOCK,
    );
    expect(result[0].currentPrice).toBe(37.5);
  });
});

describe("parseMarketPriceQuotes (FIX 9 — skip bad rows)", () => {
  const GOOD_ROW = {
    resource: "iron",
    currentPrice: 100,
    basePrice: 100,
    trend: "stable" as const,
    volume: 50,
  };

  it("returns null for non-array input", () => {
    expect(parseMarketPriceQuotes("not an array")).toBeNull();
    expect(parseMarketPriceQuotes(null)).toBeNull();
    expect(parseMarketPriceQuotes({})).toBeNull();
  });

  it("returns all good rows as parsed", () => {
    const result = parseMarketPriceQuotes([GOOD_ROW, GOOD_ROW]);
    expect(result).toHaveLength(2);
    expect(result![0]).toEqual({
      ...GOOD_ROW,
      currentPrice: 100,
      basePrice: 100,
      volume: 50,
    });
  });

  it("skips a single malformed row and returns the rest (FIX 9)", () => {
    // The previous version returned null for the whole array
    // whenever ANY row was malformed — a single bad row would
    // 503 the market panel for every player. The new version
    // drops bad rows and keeps the good ones.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const result = parseMarketPriceQuotes([
        GOOD_ROW,
        {
          resource: "iron",
          currentPrice: -1,
          basePrice: 100,
          trend: "stable" as const,
          volume: 0,
        },
        GOOD_ROW,
      ]);
      expect(result).toHaveLength(2);
      expect(result![0].resource).toBe("iron");
      expect(result![1].resource).toBe("iron");
      expect(warnSpy).toHaveBeenCalled();
      expect(warnSpy.mock.calls[0][0]).toMatch(/dropped 1 malformed row/);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("skips multiple malformed rows and reports the count", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const result = parseMarketPriceQuotes([
        GOOD_ROW,
        {
          resource: "iron",
          currentPrice: -1,
          basePrice: 100,
          trend: "stable" as const,
          volume: 0,
        },
        {
          resource: "iron",
          currentPrice: 100,
          basePrice: -1,
          trend: "stable" as const,
          volume: 0,
        },
        {
          resource: "iron",
          currentPrice: 100,
          basePrice: 100,
          trend: "bogus",
          volume: 0,
        },
        GOOD_ROW,
      ]);
      expect(result).toHaveLength(2);
      expect(warnSpy.mock.calls[0][0]).toMatch(/dropped 3 malformed row/);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("does not warn when every row is valid", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const result = parseMarketPriceQuotes([GOOD_ROW, GOOD_ROW]);
      expect(result).toHaveLength(2);
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("returns an empty array (not null) when every row is malformed", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const result = parseMarketPriceQuotes([
        {
          resource: "iron",
          currentPrice: -1,
          basePrice: 100,
          trend: "stable" as const,
          volume: 0,
        },
        null,
        "not a row",
      ]);
      expect(result).toEqual([]);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("skips a row whose trend is not in the allowed set", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const result = parseMarketPriceQuotes([
        GOOD_ROW,
        { ...GOOD_ROW, trend: "volatile" },
        GOOD_ROW,
      ]);
      expect(result).toHaveLength(2);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe("MarketTrend — closed set (FIX 10)", () => {
  it("MARKET_TRENDS is exactly up / down / stable", () => {
    // Adding a trend is a one-file change in MARKET_TRENDS and
    // isMarketTrend. The closed set is the source of truth.
    expect(MARKET_TRENDS).toEqual(["up", "down", "stable"]);
  });

  it("isMarketTrend accepts the three allowed values", () => {
    expect(isMarketTrend("up")).toBe(true);
    expect(isMarketTrend("down")).toBe(true);
    expect(isMarketTrend("stable")).toBe(true);
  });

  it("isMarketTrend rejects unknown values", () => {
    expect(isMarketTrend("volatile")).toBe(false);
    expect(isMarketTrend("")).toBe(false);
    expect(isMarketTrend("UP")).toBe(false); // case-sensitive
  });

  it("isMarketTrend rejects non-strings", () => {
    expect(isMarketTrend(null)).toBe(false);
    expect(isMarketTrend(undefined)).toBe(false);
    expect(isMarketTrend(42)).toBe(false);
    expect(isMarketTrend({})).toBe(false);
    expect(isMarketTrend([])).toBe(false);
  });
});
