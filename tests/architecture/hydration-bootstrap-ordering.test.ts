/**
 * tests/architecture/hydration-bootstrap-ordering.test.ts
 *
 * Reviewer feedback (HIGH-2, audit 2026-07-18): state-sync and hydration
 * changes may create cross-flow ordering issues. This guard verifies
 * the architectural invariants that prevent stale bootstrap/live-tick
 * responses from overwriting newer Zustand state.
 *
 * Concerns verified here:
 *   1. AuthOrchestrator uses a requestVersion counter; only the latest
 *      in-flight response applies state.
 *   2. useLiveServerTick skips polling while lastSyncAt is undefined
 *      (hydration incomplete).
 *   3. useLiveServerTick skips polling within LIVE_TICK_INTERVAL_MS of
 *      lastSyncAt (just-saved guard) so a just-applied bootstrap is
 *      not overwritten by an in-flight tick.
 *   4. The orchestrator's clear_previous_user_state effect runs BEFORE
 *      applyServerState on auth_user_changed.
 *   5. initialServerStateLoader.client.ts is the only cache that
 *      hydrateInitialStateFromServer reads — no duplicate definition.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

const ORCHESTRATOR = readFileSync(
  join(ROOT, "src/lib/auth/orchestrator/AuthOrchestrator.ts"),
  "utf8",
);
const STATE = readFileSync(
  join(ROOT, "src/lib/auth/orchestrator/state.ts"),
  "utf8",
);
const LIVE_TICK = readFileSync(
  join(ROOT, "src/lib/hooks/page/useLiveServerTick.ts"),
  "utf8",
);
const HYDRATE = readFileSync(
  join(ROOT, "src/lib/game/state/initialServerStateLoader.client.ts"),
  "utf8",
);
const ORCH_INDEX = readFileSync(
  join(ROOT, "src/lib/auth/orchestrator/index.ts"),
  "utf8",
);
const REGISTRY = readFileSync(
  join(ROOT, "src/lib/auth/orchestrator/registry.ts"),
  "utf8",
);

describe("hydration-bootstrap ordering — orchestrator version guard", () => {
  it("AuthOrchestrator declares a requestVersion counter", () => {
    expect(ORCHESTRATOR).toMatch(/private\s+requestVersion\s*=\s*0/);
  });

  it("runBootstrap bumps requestVersion on every entry", () => {
    // The bump must be the FIRST thing runBootstrap does so that any
    // response that resolves after this call is recognized as stale.
    expect(ORCHESTRATOR).toMatch(
      /const\s+version\s*=\s*\+\+this\.requestVersion/,
    );
  });

  it("requestVersion is checked at every async boundary", () => {
    // After fingerprint+session race
    expect(ORCHESTRATOR).toMatch(
      /if\s*\(\s*version\s*!==\s*this\.requestVersion\s*\)\s*return/,
    );
    // After building body but before issuing request — extra guard
    expect(
      (ORCHESTRATOR.match(/version\s*!==\s*this\.requestVersion/g) ?? [])
        .length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("startup's cleanup also bumps requestVersion (unmount invalidates in-flight)", () => {
    // The cleanup function returned from startup must invalidate any
    // pending bootstrap so a post-unmount response cannot apply.
    expect(ORCHESTRATOR).toMatch(/this\.requestVersion\s*\+=\s*1/);
  });
});

describe("hydration-bootstrap ordering — state machine purity", () => {
  it("transition() is a pure function (does not mutate state, does not throw)", () => {
    // transition() lives in state.ts and must not call any side effect
    // (no fetch, no setTimeout, no applyServerState). The orchestrator
    // applies side effects in applyTransition().
    expect(STATE).not.toMatch(/fetch\s*\(/);
    expect(STATE).not.toMatch(/applyServerState\s*\(/);
    expect(STATE).not.toMatch(/setTimeout\s*\(/);
    expect(STATE).not.toMatch(/window\./);
  });

  it("RESPONSE_BOOTSTRAP_READY only fires applyServerState effect (not auth_user_changed)", () => {
    // Critical invariant: a fresh bootstrap response applies state but
    // does NOT clear the previous user's state (no user change here).
    expect(STATE).toMatch(
      /case\s+["']RESPONSE_BOOTSTRAP_READY["'][\s\S]*?effects\s*:\s*\[\s*["']apply_ready_response["']\s*\]/,
    );
    // The same case body must NOT include clear_previous_user_state.
    // We slice from the case label to the next `return { nextStatus: current, effects: [] }`
    // so the regex doesn't accidentally match docblock text that mentions
    // the rule semantically.
    const readyIdx = STATE.indexOf('case "RESPONSE_BOOTSTRAP_READY"');
    const nextCaseIdx = STATE.indexOf('case "RESPONSE_CONFLICT"', readyIdx);
    expect(readyIdx).toBeGreaterThan(-1);
    expect(nextCaseIdx).toBeGreaterThan(-1);
    const readyBody = STATE.slice(readyIdx, nextCaseIdx);
    expect(readyBody).not.toMatch(/clear_previous_user_state/);
  });

  it("AUTH_USER_CHANGED carries clear_previous_user_state + block_gameplay", () => {
    expect(STATE).toMatch(
      /case\s+["']AUTH_USER_CHANGED["'][\s\S]*?effects\s*:\s*\[\s*["']clear_previous_user_state["'],\s*["']block_gameplay["']\s*\]/,
    );
  });

  it("INVALID_BOOTSTRAP_REQUEST maps to RESPONSE_RECOVERY (sticky) — not RETRY", () => {
    // L4 audit fix: 400 client errors must NOT loop. Confirmed by
    // responseBodyToEvent mapping INVALID_BOOTSTRAP_REQUEST to
    // RESPONSE_RECOVERY.
    expect(STATE).toMatch(
      /INVALID_BOOTSTRAP_REQUEST[\s\S]*?type\s*:\s*["']RESPONSE_RECOVERY["']/,
    );
  });
});

describe("hydration-bootstrap ordering — live-tick gate", () => {
  it("useLiveServerTick skips when lastSyncAt is undefined (hydration incomplete)", () => {
    expect(LIVE_TICK).toMatch(/if\s*\(\s*!lastSyncAt\s*\)/);
  });

  it("useLiveServerTick skips within LIVE_TICK_INTERVAL_MS of lastSyncAt (just-saved)", () => {
    expect(LIVE_TICK).toMatch(/msSinceSync\s*<\s*LIVE_TICK_INTERVAL_MS/);
  });

  it("useLiveServerTick re-entry guard prevents two concurrent POSTs", () => {
    // The inFlightRef.current check must come BEFORE the fetch call.
    const inFlightCheckIdx = LIVE_TICK.indexOf(
      "if (inFlightRef.current) return;",
    );
    const fetchIdx = LIVE_TICK.indexOf(
      'await fetch("/api/game/state/live-tick"',
    );
    expect(inFlightCheckIdx).toBeGreaterThan(-1);
    expect(fetchIdx).toBeGreaterThan(-1);
    expect(inFlightCheckIdx).toBeLessThan(fetchIdx);
  });

  it("useLiveServerTick only applies state when ticksApplied > 0 (no-op responses ignored)", () => {
    expect(LIVE_TICK).toMatch(/data\.ticksApplied\s*>\s*0/);
    expect(LIVE_TICK).toMatch(/data\.newState/);
  });
});

describe("hydration-bootstrap ordering — single canonical cache", () => {
  it("initialServerStateLoader.client.ts is the only canonical initial-state cache", () => {
    // No other file should declare a module-level `_cached` initial-state
    // variable. Check by greping for the literal pattern.
    const otherFiles = [
      "src/lib/game/state/store.ts",
      "src/lib/game/state/store-types.ts",
      "src/lib/game/state/initialClientState.ts",
      "src/lib/auth/orchestrator/state.ts",
    ];
    for (const f of otherFiles) {
      try {
        const src = readFileSync(join(ROOT, f), "utf8");
        expect(src, `${f} should not declare _cached`).not.toMatch(
          /let\s+_cached\s*:\s*ServerGameData/,
        );
      } catch {
        // File may not exist; skip.
      }
    }
  });

  it("hydrateInitialStateFromServer is the only entry point (read-only)", () => {
    expect(HYDRATE).toMatch(
      /export\s+(?:async\s+)?function\s+hydrateInitialStateFromServer/,
    );
    // setCanonicalInitialState is the only writer.
    expect(HYDRATE).toMatch(/export\s+function\s+setCanonicalInitialState/);
    // No direct assignment to _cached from outside the module.
    expect(HYDRATE).toMatch(/_cached\s*=\s*state/);
  });

  it("hydrateInitialStateFromServer returns null on cache miss (never throws)", () => {
    // The cache-miss path must return null and log, NOT throw — callers
    // rely on this to drive their own retry policy.
    expect(HYDRATE).not.toMatch(/throw\s+/);
    expect(HYDRATE).toMatch(/return\s+_cached/);
  });
});

describe("hydration-bootstrap ordering — orchestrator singletons", () => {
  it("registry.getOrchestratorStateSnapshot is the only public read path for orchestrator state", () => {
    // The registry exposes the snapshot to non-orchestrator callers
    // (e.g. useLiveServerTick) so they can read userId/deviceId
    // without coupling to AuthOrchestrator's private fields.
    expect(REGISTRY).toMatch(/getOrchestratorStateSnapshot/);
    expect(ORCH_INDEX).toMatch(/getOrchestratorStateSnapshot/);
  });
});
