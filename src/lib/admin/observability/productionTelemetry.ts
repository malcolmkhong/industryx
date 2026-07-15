// src/lib/admin/observability/productionTelemetry.ts
//
// Admin-side consumer for production telemetry counters (PR-BP-5 §7).
// Reads in-process counters from `src/lib/game/production/observability`
// and packages them for the `/api/admin/production-telemetry` endpoint.
//
// Output shape (matches audit §5.6 telemetry policy):
//
//   {
//     silent_failure_count: { unknown_definition: n, inactive: n, ... },
//     snapshot_installation: {
//       tick_response_count, snapshot_emitted_count,
//       snapshot_null_count, installation_rate,
//     },
//     generated_at: <iso>,
//   }
//
// The counters are process-lifetime; in production they reset on every
// Next.js cold start. The endpoint should be called frequently enough that
// deltas are still meaningful (admin dashboard polls ~30s).

import {
  getSilentFailureCounts,
  getSnapshotInstallationMetrics,
  SILENT_FAILURE_REASONS,
  type SilentFailureReason,
} from "@/lib/game/production/observability";

export interface ProductionTelemetry {
  /** Counters keyed by audit §5.6 reason. */
  silent_failure_count: Record<SilentFailureReason, number>;
  /** NEW-TEST-031 telemetry variant — snapshot installation rate. */
  snapshot_installation: {
    tick_response_count: number;
    snapshot_emitted_count: number;
    snapshot_null_count: number;
    installation_rate: number;
  };
  /** Server ISO timestamp when this snapshot was generated. */
  generated_at: string;
}

export function readProductionTelemetry(): ProductionTelemetry {
  const installation = getSnapshotInstallationMetrics();
  return {
    silent_failure_count: {
      // Type assertion: `getSilentFailureCounts` already returns the same
      // shape; spreading preserves readonly semantics.
      ...(getSilentFailureCounts() as Record<SilentFailureReason, number>),
    },
    snapshot_installation: {
      tick_response_count: installation.tickResponseCount,
      snapshot_emitted_count: installation.snapshotEmittedCount,
      snapshot_null_count: installation.snapshotNullCount,
      installation_rate: installation.installationRate,
    },
    generated_at: new Date().toISOString(),
  };
}

/**
 * Returns the canonical list of silent-failure reasons. Re-exported so the
 * admin endpoint can iterate without coupling to the engine module's path.
 */
export function listSilentFailureReasons(): readonly SilentFailureReason[] {
  return SILENT_FAILURE_REASONS;
}