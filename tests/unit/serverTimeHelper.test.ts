// ============================================
// serverTimeHelper.test.ts — unit tests for the centralized server-time
// helper (audit 2026-07-15, BUG-074).
//
// Pure unit tests: no live Supabase, no DB. Each test instantiates a
// `TimeClient` shape with a stubbed `rpc("now_iso")`.
//
// Coverage:
//   - getServerNowISO returns ISO on success
//   - getServerNowISO throws on error (fail closed)
//   - getServerNowISO throws on null data
//   - getServerNowISOOrNull returns null instead of throwing
//   - getCurrentUtcDateISO derives YYYY-MM-DD correctly
//   - getPreviousUtcDateISO returns day-before across month boundary
//   - getPreviousUtcDateISO handles year boundary (Jan 1)
//   - compareIso returns -1/0/+1
//   - isExpiredIso and isValidUntilIso are mutually consistent
//   - toUtcDateString handles Postgres-style and YYYY-MM-DD inputs
// ============================================

import { describe, expect, it } from "vitest";
import {
  compareIso,
  getCurrentUtcDateISO,
  getPreviousUtcDateISO,
  getServerNowISO,
  getServerNowISOOrNull,
  isExpiredIso,
  isValidUntilIso,
  toUtcDateString,
  type TimeClient,
} from "@/lib/auth/serverTime";

function makeClient(
  iso: string | null,
  error: { message: string } | null = null,
): TimeClient {
  return {
    rpc: () => Promise.resolve({ data: iso, error }),
  };
}

const SAMPLE_ISO = "2026-07-15T12:34:56.789Z";

describe("getServerNowISO", () => {
  it("returns the RPC string on success", async () => {
    const client = makeClient(SAMPLE_ISO);
    await expect(getServerNowISO(client)).resolves.toBe(SAMPLE_ISO);
  });

  it("throws fail-closed when the RPC returns an error", async () => {
    const client = makeClient(null, { message: "db down" });
    await expect(getServerNowISO(client)).rejects.toThrow(/now_iso.*failed/);
  });

  it("throws fail-closed when the RPC returns null data", async () => {
    const client = makeClient(null);
    await expect(getServerNowISO(client)).rejects.toThrow(/no data/);
  });

  it("throws fail-closed when the RPC returns an empty string", async () => {
    const client = makeClient("");
    await expect(getServerNowISO(client)).rejects.toThrow(/no data/);
  });
});

describe("getServerNowISOOrNull", () => {
  it("returns the ISO on success", async () => {
    const client = makeClient(SAMPLE_ISO);
    await expect(getServerNowISOOrNull(client)).resolves.toBe(SAMPLE_ISO);
  });

  it("returns null instead of throwing on error", async () => {
    const client = makeClient(null, { message: "boom" });
    await expect(getServerNowISOOrNull(client)).resolves.toBeNull();
  });

  it("returns null instead of throwing on empty data", async () => {
    const client = makeClient("");
    await expect(getServerNowISOOrNull(client)).resolves.toBeNull();
  });
});

describe("getCurrentUtcDateISO", () => {
  it("extracts YYYY-MM-DD from now_iso string", async () => {
    const client = makeClient("2026-07-15T23:59:59.999Z");
    await expect(getCurrentUtcDateISO(client)).resolves.toBe("2026-07-15");
  });

  it("returns null on RPC failure (no silent fallback)", async () => {
    const client = makeClient(null, { message: "down" });
    await expect(getCurrentUtcDateISO(client)).resolves.toBeNull();
  });

  it("returns null on empty data", async () => {
    const client = makeClient("");
    await expect(getCurrentUtcDateISO(client)).resolves.toBeNull();
  });
});

describe("getPreviousUtcDateISO", () => {
  it("returns one day earlier within a month", async () => {
    const client = makeClient("2026-07-15T12:00:00.000Z");
    await expect(getPreviousUtcDateISO(client)).resolves.toBe("2026-07-14");
  });

  it("rolls back across a month boundary", async () => {
    const client = makeClient("2026-08-01T00:00:00.000Z");
    await expect(getPreviousUtcDateISO(client)).resolves.toBe("2026-07-31");
  });

  it("rolls back across a year boundary", async () => {
    const client = makeClient("2026-01-01T00:00:00.000Z");
    await expect(getPreviousUtcDateISO(client)).resolves.toBe("2025-12-31");
  });

  it("handles leap year: 2024-03-01 → 2024-02-29", async () => {
    const client = makeClient("2024-03-01T00:00:00.000Z");
    await expect(getPreviousUtcDateISO(client)).resolves.toBe("2024-02-29");
  });

  it("returns null on RPC failure", async () => {
    const client = makeClient(null, { message: "down" });
    await expect(getPreviousUtcDateISO(client)).resolves.toBeNull();
  });
});

describe("compareIso", () => {
  it("returns -1 when a < b", () => {
    expect(compareIso("2026-07-15T00:00:00.000Z", "2026-07-16T00:00:00.000Z")).toBe(
      -1,
    );
  });

  it("returns +1 when a > b", () => {
    expect(compareIso("2026-07-16T00:00:00.000Z", "2026-07-15T00:00:00.000Z")).toBe(
      1,
    );
  });

  it("returns 0 when equal", () => {
    expect(compareIso("2026-07-15T12:00:00.000Z", "2026-07-15T12:00:00.000Z")).toBe(
      0,
    );
  });

  it("ordering is consistent with chrono order at same precision", () => {
    const earlier = "2026-07-15T00:00:00.000Z";
    const later = "2026-07-15T00:00:00.001Z";
    expect(compareIso(earlier, later)).toBe(-1);
    expect(compareIso(later, earlier)).toBe(1);
  });
});

describe("isExpiredIso", () => {
  it("returns true when expiresAt < now (clearly past)", () => {
    expect(
      isExpiredIso("2026-07-15T00:00:00.000Z", "2026-07-16T00:00:00.000Z"),
    ).toBe(true);
  });

  it("returns false when expiresAt > now (still valid)", () => {
    expect(
      isExpiredIso("2026-07-16T00:00:00.000Z", "2026-07-15T00:00:00.000Z"),
    ).toBe(false);
  });

  it("returns false at exact equality (boundary not yet expired)", () => {
    expect(
      isExpiredIso("2026-07-15T12:00:00.000Z", "2026-07-15T12:00:00.000Z"),
    ).toBe(false);
  });
});

describe("isValidUntilIso", () => {
  it("returns true when validUntil > now (still valid)", () => {
    expect(
      isValidUntilIso("2026-07-16T00:00:00.000Z", "2026-07-15T00:00:00.000Z"),
    ).toBe(true);
  });

  it("returns false when validUntil < now (no longer valid)", () => {
    expect(
      isValidUntilIso("2026-07-14T00:00:00.000Z", "2026-07-15T00:00:00.000Z"),
    ).toBe(false);
  });

  it("returns false at exact equality (boundary no longer valid)", () => {
    expect(
      isValidUntilIso("2026-07-15T12:00:00.000Z", "2026-07-15T12:00:00.000Z"),
    ).toBe(false);
  });

  it("agrees with isExpiredIso at strict inequality (a < b, a > b)", () => {
    // At a < b: isExpiredIso=true, isValidUntilIso=false (negations agree)
    expect(
      isExpiredIso("2026-07-15T00:00:00.000Z", "2026-07-16T00:00:00.000Z"),
    ).toBe(true);
    expect(
      isValidUntilIso("2026-07-15T00:00:00.000Z", "2026-07-16T00:00:00.000Z"),
    ).toBe(false);

    // At a > b: isExpiredIso=false, isValidUntilIso=true (negations agree)
    expect(
      isExpiredIso("2026-07-16T00:00:00.000Z", "2026-07-15T00:00:00.000Z"),
    ).toBe(false);
    expect(
      isValidUntilIso("2026-07-16T00:00:00.000Z", "2026-07-15T00:00:00.000Z"),
    ).toBe(true);
  });

  it("treats exact equality as boundary: isValidUntilIso=false, isExpiredIso=false", () => {
    // Documented boundary semantics:
    //   - isExpiredIso uses `<`, so equality is "not yet expired" (false).
    //   - isValidUntilIso uses `>`, so equality is "not still valid" (false).
    // The helpers are NOT mutual negations at the boundary by design —
    // the caller decides which interpretation fits the use case.
    const a = "2026-07-15T12:00:00.000Z";
    const b = "2026-07-15T12:00:00.000Z";
    expect(isExpiredIso(a, b)).toBe(false);
    expect(isValidUntilIso(a, b)).toBe(false);
  });
});

describe("toUtcDateString", () => {
  it("accepts Postgres-style ISO with `T` separator", () => {
    expect(toUtcDateString("2026-07-15T12:34:56.789Z")).toBe("2026-07-15");
  });

  it("accepts date-only strings", () => {
    expect(toUtcDateString("2026-07-15")).toBe("2026-07-15");
  });

  it("returns null for null input", () => {
    expect(toUtcDateString(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(toUtcDateString(undefined)).toBeNull();
  });
});
