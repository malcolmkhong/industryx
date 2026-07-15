// src/lib/game/production/observability/index.ts
//
// Audit §5.6 silent-failure telemetry (PR-BP-5 §7).
//
// Six §5.6 silent-failure cases share a missing-observability theme. This
// module is the in-process counter surface that lets the server-authoritative
// tick path surface "why nothing happened" without relying on console
// scraping or DB triggers. Counters are emitted in `production.silent_failure_count{reason}`
// shape (matching the audit §5.6 telemetry policy).
//
// Scope of THIS file:
//   1. Counter map (in-process; process-lifetime; safe under Node's
//      single-threaded tick model). Each counter increments monotonically
//      between admin reads.
//   2. The 4 runtime-emitted reasons (§5.6 cases 1-4):
//        - unknown_definition : `computeProduction` def lookup miss
//        - inactive            : `computeProduction` active=false
//        - missing_inputs      : factory branch ran out of inputs
//        - missing_recipe      : def present but no extractor/factory recipe
//        - storage_overflow    : output cap-clamped (runServerTicks)
//        - fuel_starved        : power plant starved of fuel (power.ts)
//   3. Snapshot installation metrics (NEW-TEST-031 variant):
//        - tick_response_count       (every emitted tick response)
//        - snapshot_emitted_count    (response carried a non-null snapshot)
//
// NOT in scope (documented design risks, not runtime silence — audit §5.6
// cases 5-6): `payout` modifier double-application and `event modifiers`
// cache/registry dual-path. Surfacing those requires instrumenting the
// registry/cache pair, which is a larger refactor — out of scope here.

/**
 * The 6 silent-failure reasons tracked by the engine. The shape is
 * string-literal so admin UI can map counters to display labels.
 */
export const SILENT_FAILURE_REASONS = [
  "unknown_definition",
  "inactive",
  "missing_inputs",
  "missing_recipe",
  "storage_overflow",
  "fuel_starved",
] as const;

export type SilentFailureReason = (typeof SILENT_FAILURE_REASONS)[number];

/**
 * In-process counter map. Keys are the §5.6 reasons. Values are monotonically
 * increasing per process lifetime. Read by the admin `/api/admin/production-telemetry`
 * endpoint and surfaced as `production.silent_failure_count{reason}` counters
 * (matching the audit §5.6 telemetry policy).
 */
const silentFailureCounts: Record<SilentFailureReason, number> = {
  unknown_definition: 0,
  inactive: 0,
  missing_inputs: 0,
  missing_recipe: 0,
  storage_overflow: 0,
  fuel_starved: 0,
};

// Snapshot installation metrics (NEW-TEST-031 telemetry variant).
// `tickResponseCount`  — total tick responses emitted (live + offline)
// `snapshotEmittedCount` — responses that carried a non-null productionSnapshot
// `snapshotNullCount`   — responses where the snapshot was null (zero-tick,
//                         cold-start, or settled-tick with empty snapshot)
let tickResponseCount = 0;
let snapshotEmittedCount = 0;
let snapshotNullCount = 0;

/**
 * Increment a silent-failure counter. Called from `computeProduction`
 * (production.ts), `runServerTicks` (storage overflow), and
 * `computePowerGrid` (fuel-starved branch).
 *
 * Reasons are validated against the §5.6 set; unknown reasons throw so a
 * typo cannot silently land in the wrong counter.
 */
export function recordSilentFailure(reason: SilentFailureReason): void {
  if (!(SILENT_FAILURE_REASONS as readonly string[]).includes(reason)) {
    throw new Error(
      `[observability] unknown silent_failure reason "${reason}". ` +
        `Allowed: ${SILENT_FAILURE_REASONS.join(", ")}`,
    );
  }
  silentFailureCounts[reason] += 1;
}

/**
 * Read all silent-failure counters as a plain object. Admin endpoint
 * surfaces this directly.
 */
export function getSilentFailureCounts(): Readonly<
  Record<SilentFailureReason, number>
> {
  return { ...silentFailureCounts };
}

/**
 * Record a tick response with its snapshot outcome. Called from the live-tick
 * and offline-progress routes after producing the response body. Used to
 * compute snapshot installation rate (NEW-TEST-031 telemetry variant).
 */
export function recordTickResponse(snapshotEmitted: boolean): void {
  tickResponseCount += 1;
  if (snapshotEmitted) snapshotEmittedCount += 1;
  else snapshotNullCount += 1;
}

/**
 * Read the snapshot installation metrics. `installationRate` is the ratio
 * of emitted-vs-null responses in [0, 1]. Returns 0 when no responses
 * have been recorded (avoids NaN under process-cold-start).
 */
export function getSnapshotInstallationMetrics(): {
  tickResponseCount: number;
  snapshotEmittedCount: number;
  snapshotNullCount: number;
  installationRate: number;
} {
  const total = tickResponseCount;
  return {
    tickResponseCount,
    snapshotEmittedCount,
    snapshotNullCount,
    installationRate: total === 0 ? 0 : snapshotEmittedCount / total,
  };
}

/**
 * Reset all counters. Test helper only — production code MUST NOT call this.
 * Kept in the same file (not a separate `_test` module) because:
 *   1. The reset is a one-liner; extracting it would scatter the counter API.
 *   2. Tests must import from the same path they exercise.
 */
export function _resetTelemetryCounters(): void {
  (Object.keys(silentFailureCounts) as SilentFailureReason[]).forEach((k) => {
    silentFailureCounts[k] = 0;
  });
  tickResponseCount = 0;
  snapshotNullCount = 0;
  snapshotEmittedCount = 0;
}