/**
 * Integration Test: Game State Validation
 *
 * Verifies the server-side validation pipeline for game actions.
 * Tests the actual /api/game/action endpoint with various inputs.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

const BASE_URL = "https://industryx.vercel.app";

async function fetchJSON(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: any }> {
  const r = await fetch(`${BASE_URL}${path}`, {
    ...init,
    signal: AbortSignal.timeout(15000),
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
  });
  let body: any = {};
  try {
    body = await r.json();
  } catch {
    body = await r.text().catch(() => "");
  }
  return { status: r.status, body };
}

describe("Game State Validation (server-authoritative)", () => {
  // ── P0: Bounds checking on game values ──

  it("rejects money > MAX_MONEY (1e12)", async () => {
    const { status, body } = await fetchJSON("/api/game/action", {
      method: "POST",
      body: JSON.stringify({
        action: "import",
        state: { money: 1e15, buildings: [], resources: {} },
      }),
    });
    // Must NOT be 200 (which would mean bounds check bypassed)
    assert.notEqual(
      status,
      200,
      `Import with money=1e15 returned 200 — bounds check bypassed! Body: ${JSON.stringify(body).slice(0, 200)}`,
    );
  });

  it("rejects money = Infinity", async () => {
    const { status, body } = await fetchJSON("/api/game/action", {
      method: "POST",
      body: JSON.stringify({
        action: "import",
        state: { money: Infinity, buildings: [], resources: {} },
      }),
    });
    assert.notEqual(
      status,
      200,
      `Import with money=Infinity returned 200 — bounds check bypassed! Body: ${JSON.stringify(body).slice(0, 200)}`,
    );
  });

  it("rejects money = -9999 (negative)", async () => {
    const { status, body } = await fetchJSON("/api/game/action", {
      method: "POST",
      body: JSON.stringify({
        action: "import",
        state: { money: -9999, buildings: [], resources: {} },
      }),
    });
    assert.notEqual(
      status,
      200,
      `Import with money=-9999 returned 200 — bounds check bypassed! Body: ${JSON.stringify(body).slice(0, 200)}`,
    );
  });

  it("rejects unknown action types", async () => {
    const { status, body } = await fetchJSON("/api/game/action", {
      method: "POST",
      body: JSON.stringify({
        action: "hack_economy",
        state: { money: 99999999 },
      }),
    });
    assert.notEqual(
      status,
      200,
      `Unknown action 'hack_economy' returned 200 — action validation bypassed! Body: ${JSON.stringify(body).slice(0, 200)}`,
    );
  });
});

describe("Definitions endpoint (game config)", () => {
  it("/api/game/definitions is accessible", async () => {
    // This endpoint is intentionally open (game config is public) but rate-limited
    const { status, body } = await fetchJSON("/api/game/definitions", {
      method: "GET",
    });
    // Should be 200 (public) or 429 (rate-limited)
    assert.ok(
      status === 200 || status === 429,
      `Definitions endpoint returned ${status} (expected 200 or 429)`,
    );
    if (status === 200) {
      console.log(
        `  ✅ Definitions: ${Object.keys(body).length} top-level keys`,
      );
    }
  });
});

describe("Server tick validation (gradual cheat detection)", () => {
  it("/api/cron/validate-ticks is accessible to cron (HMAC-guarded)", async () => {
    // This endpoint should reject unauthenticated requests (CRON_SECRET)
    const { status } = await fetchJSON("/api/cron/validate-ticks", {
      method: "POST",
    });
    // Must NOT be 200 (would mean cron endpoint is open)
    assert.notEqual(
      status,
      200,
      `Cron validate-ticks returned 200 without auth — CRITICAL security issue!`,
    );
    // Expected: 401, 403, or 405 (method not allowed)
    assert.ok(
      status === 401 || status === 403 || status === 405,
      `Expected 401/403/405, got ${status}`,
    );
  });
});

describe("Heartbeat (game save checkpoint)", () => {
  it("/api/game/heartbeat rejects unauthenticated", async () => {
    const { status } = await fetchJSON("/api/game/heartbeat", {
      method: "POST",
      body: JSON.stringify({ gameTick: 1000 }),
    });
    assert.notEqual(status, 200, "Heartbeat returned 200 without auth");
  });
});

describe("Market history endpoint", () => {
  it("GET /api/game/market-history is accessible (public data)", async () => {
    const { status, body } = await fetchJSON(
      "/api/game/market-history?resource=iron&hours=24",
      { method: "GET" },
    );
    // Market history is public game data
    assert.ok(
      status === 200 || status === 429,
      `Market history returned ${status} (expected 200 or 429)`,
    );
  });

  it("rejects invalid resource parameter (no data leak)", async () => {
    const { status, body } = await fetchJSON(
      "/api/game/market-history?resource=../etc/passwd&hours=24",
      { method: "GET" },
    );
    // The endpoint may return 200 with empty history (the resource is just a
    // filter that matches no rows), but the CRITICAL security property is that
    // no actual data is returned for an unknown/invalid resource.
    if (status === 200) {
      assert.deepEqual(
        body.history,
        [],
        `Path traversal resource returned non-empty history — data leak! Body: ${JSON.stringify(body).slice(0, 300)}`,
      );
    } else {
      // 400 (bad input) or 404 (not found) is also acceptable
      assert.ok(
        status === 400 || status === 404,
        `Expected 400/404 or 200 with empty data, got ${status}`,
      );
    }
  });
});

describe("Compute endpoint (server-side calculation)", () => {
  it("POST /api/game/compute rejects unauthenticated", async () => {
    const { status } = await fetchJSON("/api/game/compute", {
      method: "POST",
      body: JSON.stringify({ gameTick: 1, delta: 1 }),
    });
    assert.notEqual(status, 200, "Compute returned 200 without auth");
  });
});

describe("Offline progress endpoint", () => {
  it("POST /api/game/offline rejects unauthenticated", async () => {
    const { status } = await fetchJSON("/api/game/offline", {
      method: "POST",
      body: JSON.stringify({ lastTick: 0, currentTick: 99999 }),
    });
    assert.notEqual(status, 200, "Offline returned 200 without auth");
  });
});

describe("Tables proxy endpoint (debug leak prevention)", () => {
  it("/api/tables does not expose all table names to anonymous users", async () => {
    const { status, body } = await fetchJSON("/api/tables", { method: "GET" });
    // Should be 401/403 for unauthenticated, not 200 with full table list
    assert.notEqual(
      status,
      200,
      `Tables proxy returned 200 to anonymous — schema leak! Body: ${JSON.stringify(body).slice(0, 200)}`,
    );
  });
});
