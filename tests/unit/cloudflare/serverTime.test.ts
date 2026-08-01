/**
 * tests/unit/cloudflare/serverTime.test.ts — Phase 6 of the time
 * refactor. Unit tests for cloudflare/markettick/shared/serverTime.js.
 *
 * Verifies that the Cloudflare worker reaches the same authoritative
 * UTC clock as the Next.js routes (Postgres `now_iso()` RPC), so the
 * two halves of the system never disagree about what "now" is.
 *
 * The helper is pure (URL + fetch), so tests stub the global `fetch`
 * to simulate the REST response. Cloudflare's `Date.now()` is no
 * longer trusted for time-sensitive writes — this test pins the
 * contract so any future drift is loud.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchNowIsoMs } from "@/../cloudflare/markettick/shared/serverTime.js";

const SUPABASE_URL = "https://example.supabase.co";
const HEADERS = {
  apikey: "test-key",
  Authorization: "Bearer test-key",
  "Content-Type": "application/json",
};

describe("fetchNowIsoMs (Phase 6 — Cloudflare side)", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("POSTs to /rest/v1/rpc/now_iso with the supabase URL", async () => {
    const fetchMock = vi.fn(
      async () => new Response('"2026-07-26T08:00:00.000Z"', { status: 200 }),
    );
    (globalThis as { fetch: typeof globalThis.fetch }).fetch =
      fetchMock as unknown as typeof globalThis.fetch;

    await fetchNowIsoMs(SUPABASE_URL, HEADERS);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${SUPABASE_URL}/rest/v1/rpc/now_iso`);
    expect(init.method).toBe("POST");
  });

  it("returns ms-since-epoch from the RPC ISO string", async () => {
    const fetchMock = vi.fn(
      async () => new Response('"2026-07-26T08:00:00.000Z"', { status: 200 }),
    );
    (globalThis as { fetch: typeof globalThis.fetch }).fetch =
      fetchMock as unknown as typeof globalThis.fetch;

    const ms = await fetchNowIsoMs(SUPABASE_URL, HEADERS);
    expect(ms).toBe(Date.parse("2026-07-26T08:00:00.000Z"));
  });

  it("returns null on HTTP error and logs a warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn(async () => new Response("error", { status: 500 }));
    (globalThis as { fetch: typeof globalThis.fetch }).fetch =
      fetchMock as unknown as typeof globalThis.fetch;

    const ms = await fetchNowIsoMs(SUPABASE_URL, HEADERS);
    expect(ms).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it("returns null on empty body and logs a warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn(async () => new Response("", { status: 200 }));
    (globalThis as { fetch: typeof globalThis.fetch }).fetch =
      fetchMock as unknown as typeof globalThis.fetch;

    const ms = await fetchNowIsoMs(SUPABASE_URL, HEADERS);
    expect(ms).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it("returns null on unparseable ISO and logs a warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn(
      async () => new Response('"not-an-iso"', { status: 200 }),
    );
    (globalThis as { fetch: typeof globalThis.fetch }).fetch =
      fetchMock as unknown as typeof globalThis.fetch;

    const ms = await fetchNowIsoMs(SUPABASE_URL, HEADERS);
    expect(ms).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it("returns null on fetch throw and logs a warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });
    (globalThis as { fetch: typeof globalThis.fetch }).fetch =
      fetchMock as unknown as typeof globalThis.fetch;

    const ms = await fetchNowIsoMs(SUPABASE_URL, HEADERS);
    expect(ms).toBeNull();
    expect(warn).toHaveBeenCalled();
  });
});
