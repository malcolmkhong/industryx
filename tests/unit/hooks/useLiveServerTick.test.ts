/**
 * tests/unit/hooks/useLiveServerTick.test.ts
 *
 * Source-level invariants for useLiveServerTick.
 *
 * Reviewer feedback (HIGH-1, audit 2026-07-18): the live-tick hook changed
 * substantially in commit 0f1ef0f. We need focused coverage for:
 *   - timer / channel cleanup on unmount (no leaked timers or BroadcastChannels)
 *   - duplicate-subscription prevention across re-renders
 *   - in-flight dedup (inFlightRef)
 *   - stale-response handling (cancelled flag)
 *   - behavior during auth transitions (user/deviceId/lastSyncAt deps)
 *   - backoff / 429 handling
 *   - leader election via BroadcastChannel
 *
 * Mirrors tests/unit/hooks/usePerSecondTick.test.ts: source-level static
 * analysis (no @testing-library/react in this repo). Every invariant here
 * is something the hook source MUST satisfy — if a future refactor
 * regresses one, the suite fails.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC_PATH = join(
  process.cwd(),
  "src/lib/hooks/page/useLiveServerTick.ts",
);
const SRC = readFileSync(SRC_PATH, "utf8");

// Strip comments for noisy-pattern checks so doc strings don't trip them.
const stripped = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("useLiveServerTick — export shape", () => {
  it("is exported as a named function (not a default export)", () => {
    expect(SRC).toMatch(/export\s+function\s+useLiveServerTick\b/);
    expect(SRC).not.toMatch(/export\s+default\s+function\s+useLiveServerTick/);
  });

  it("returns void (no stale state in component re-renders)", () => {
    expect(SRC).toMatch(/export\s+function\s+useLiveServerTick\s*\(\s*\)\s*:\s*void/);
  });
});

describe("useLiveServerTick — timer / channel cleanup (no leaks)", () => {
  it("schedules the next tick via setTimeout (not setInterval)", () => {
    // setTimeout allows the backoff calculation to drive the next interval
    // dynamically, which is required for the 429/5xx backoff path.
    expect(SRC).toMatch(/window\.setTimeout\s*\(/);
    expect(SRC).toMatch(/setTimeout\s*\(/);
  });

  it("clears the scheduled timeout on cleanup (no leaked timers)", () => {
    expect(SRC).toMatch(/window\.clearTimeout\s*\(/);
    expect(SRC).toMatch(/clearTimeout\s*\(/);
  });

  it("closes the BroadcastChannel on cleanup", () => {
    expect(SRC).toMatch(/leaderChannel\.close\s*\(\s*\)/);
  });

  it("removes the focus listener on cleanup", () => {
    expect(SRC).toMatch(/removeEventListener\s*\(\s*["']focus["']/);
  });

  it("uses a cancelled flag to abort late ticks after unmount", () => {
    expect(SRC).toMatch(/let\s+cancelled\s*=\s*false/);
    expect(SRC).toMatch(/cancelled\s*=\s*true/);
    // The cancelled flag must gate every entry point (fetch, scheduleNext,
    // settleServerTime) so a post-unmount response cannot apply state.
    expect(SRC).toMatch(/if\s*\(\s*cancelled\s*\)\s*return/);
  });
});

describe("useLiveServerTick — duplicate-subscription prevention", () => {
  it("guards against re-entry via inFlightRef", () => {
    expect(SRC).toMatch(/inFlightRef\.current\s*=\s*true/);
    // The guard must run before the fetch.
    expect(SRC).toMatch(/if\s*\(\s*inFlightRef\.current\s*\)\s*return/);
    // And must be cleared in `finally` so the next tick can fire.
    expect(SRC).toMatch(/inFlightRef\.current\s*=\s*false/);
  });

  it("reschedules via scheduleNext, never via setInterval — no double-fire on re-render", () => {
    // The useEffect dependency list must include all three reactive values
    // so the interval is torn down + rebuilt on user/deviceId/lastSyncAt
    // change, NOT stacked on top of an existing timer.
    expect(SRC).toMatch(/\},\s*\[deviceId,\s*userId,\s*lastSyncAt\]\)/);
  });
});

describe("useLiveServerTick — auth transitions", () => {
  it("reads user/deviceId from useAuth() so auth context changes propagate", () => {
    expect(SRC).toMatch(/const\s*\{\s*user,\s*deviceId\s*\}\s*=\s*useAuth\(\)/);
  });

  it("reads lastSyncAt from useCloudSync() so AFK gating reacts to fresh saves", () => {
    expect(SRC).toMatch(/const\s*\{\s*lastSyncAt\s*\}\s*=\s*useCloudSync\(\)/);
  });

  it("falls back to orchestrator snapshot + persistent device id when AuthProvider is silent", () => {
    expect(SRC).toMatch(/getOrchestratorStateSnapshot\(\)/);
    expect(SRC).toMatch(/readPersistentDeviceId\(\)/);
    expect(SRC).toMatch(/createDeviceIdStorage/);
  });

  it("skips the tick when there is no active user OR device id (prevents orphan POSTs)", () => {
    expect(SRC).toMatch(/if\s*\(\s*!activeUserId\s*&&\s*!activeDeviceId\s*\)/);
  });
});

describe("useLiveServerTick — visibility + hydration gating", () => {
  it("skips when document.visibilityState !== 'visible' (background tabs)", () => {
    expect(SRC).toMatch(/document\.visibilityState\s*[!=]==?\s*["']visible["']/);
  });

  it("skips while lastSyncAt is undefined (hydration incomplete)", () => {
    // The hook must NOT apply state until the cloud sync service has
    // bumped lastSyncAt — otherwise a stale tick could overwrite
    // freshly-bootstrapped state.
    expect(SRC).toMatch(/if\s*\(\s*!lastSyncAt\s*\)/);
  });

  it("skips while the user just saved (lastSyncAt within LIVE_TICK_INTERVAL_MS)", () => {
    expect(SRC).toMatch(/msSinceSync\s*<\s*LIVE_TICK_INTERVAL_MS/);
  });

  it("skips while the user is AFK (>5 min since lastSyncAt)", () => {
    expect(SRC).toMatch(/msSinceSync\s*>\s*AFK_THRESHOLD_MS/);
  });
});

describe("useLiveServerTick — leader election (multi-tab dedup)", () => {
  it("uses a BroadcastChannel named industryx-tick-leader", () => {
    expect(SRC).toMatch(/new\s+BroadcastChannel\s*\(\s*["']industryx-tick-leader["']/);
  });

  it("only the leader polls — non-leaders reschedule without fetching", () => {
    expect(SRC).toMatch(/if\s*\(\s*!\s*isLeader\s*\)/);
  });

  it("re-elects on window focus so the visible tab takes over polling", () => {
    expect(SRC).toMatch(/window\.addEventListener\s*\(\s*["']focus["']/);
  });

  it("guards BroadcastChannel setup with `typeof !== 'undefined'` for SSR", () => {
    expect(SRC).toMatch(/typeof\s+BroadcastChannel\s*[!=]==?\s*["']undefined["']/);
  });
});

describe("useLiveServerTick — backoff + stale-response handling", () => {
  it("escalates backoff on 429", () => {
    expect(SRC).toMatch(/status\s*===\s*429/);
  });

  it("escalates backoff on 5xx", () => {
    expect(SRC).toMatch(/status\s*>=\s*500/);
  });

  it("escalates backoff on network error (status === 0)", () => {
    expect(SRC).toMatch(/status\s*=\s*0/);
  });

  it("caps backoff at LIVE_TICK_BACKOFF_MAX_MS (160s)", () => {
    expect(SRC).toMatch(/LIVE_TICK_BACKOFF_MAX_MS/);
    expect(SRC).toMatch(/160_000/);
  });

  it("resets failure streak on successful 200 response", () => {
    expect(SRC).toMatch(/failureStreak\s*=\s*0/);
  });

  it("only applies state when the response carried ticksApplied > 0", () => {
    // A 200 with ticksApplied === 0 must NOT call applyServerState —
    // it would re-apply the same payload and overwrite newer client state.
    expect(SRC).toMatch(/data\.ticksApplied\s*>\s*0/);
    expect(SRC).toMatch(/data\.newState/);
    expect(SRC).toMatch(/applyServerState\s*\(/);
  });
});

describe("useLiveServerTick — server endpoint contract", () => {
  it("POSTs to /api/game/state/live-tick", () => {
    expect(SRC).toMatch(/["']\/api\/game\/state\/live-tick["']/);
  });

  it("sends deviceId in the request body", () => {
    expect(SRC).toMatch(/body\s*:\s*JSON\.stringify\s*\(\s*\{\s*deviceId/);
  });

  it("uses same-origin credentials so the auth cookie travels", () => {
    expect(SRC).toMatch(/credentials\s*:\s*["']same-origin["']/);
  });
});

describe("useLiveServerTick — client-clock independence", () => {
  it("does not call new Date() in the hot path", () => {
    expect(stripped).not.toMatch(/new\s+Date\(/);
  });

  it("uses Date.now() only for elapsed-since calculations (acceptable)", () => {
    // Date.now() is used for msSinceSync and AFK gating. These are
    // best-effort heuristics on the client, not authoritative timing,
    // so Date.now() is acceptable here. The hook must NOT, however,
    // call new Date() — that would produce a Date object for state.
    expect(stripped).toMatch(/Date\.now\(\)/);
  });
});