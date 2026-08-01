/**
 * Controlled recovery/import for metadata-null legacy gameplay snapshots.
 *
 * This is deliberately server-only and has no route in this batch. A future
 * support workflow must authenticate and authorize its operator before it can
 * approve a case. The service never fills missing gameplay with defaults.
 */

import { createHash, timingSafeEqual } from "crypto";

import {
  approveRecoveryCase,
  completeRecoveryCase,
  createRecoveryCase,
  loadRecoveryCase,
  loadRecoveryEvidenceRows,
  type RecoveryCaseStatus,
} from "@/lib/db/game/stateRecovery";
import {
  loadServerGameStateLite,
  type ServerGameStateLite,
} from "@/lib/db/game/serverGameState";
import { asFullState } from "@/lib/db/game/serverGameStatePayload";
import type { Json } from "@/lib/db/types";
import { buildDenormalizedStatePatchFields } from "@/lib/game/actions/server/shared/denormalizedStatePatch";

// Compatibility shims for stale imports (the recovery feature is WIP per file header).
// These wrap the currently-exported names so legacy call sites still compile.
// `loadServerGameStateForRecovery` → returns ServerGameStateLite (a superset of
// the fields the legacy code reads). The few `payload_*` metadata fields that the
// legacy code expected as row columns now come from full_state JSON if needed.
type ServerGameStateRecoverySource = ServerGameStateLite & {
  user_id: string;
  id: string;
  payload_schema_version: number | null;
  payload_lifecycle: string | null;
  payload_checksum: string | null;
};
async function loadServerGameStateForRecovery(
  userId: string,
): Promise<ServerGameStateRecoverySource | null> {
  const row = await loadServerGameStateLite(userId);
  if (!row) return null;
  const full = (row.full_state ?? {}) as Record<string, unknown>;
  return {
    ...row,
    user_id: userId,
    id: userId,
    payload_schema_version:
      (full.payload_schema_version as number | null) ?? null,
    payload_lifecycle: (full.payload_lifecycle as string | null) ?? null,
    payload_checksum: (full.payload_checksum as string | null) ?? null,
  };
}

// `buildDenormalizedFieldsFromCompleteState(state)` — the legacy call passes a single
// state arg. The current export requires (state, fallback). Provide an empty fallback
// so the shape matches what the legacy caller expects.
function buildDenormalizedFieldsFromCompleteState(
  state: ServerGameData | Record<string, unknown>,
) {
  return buildDenormalizedStatePatchFields(
    state as unknown as Record<string, unknown>,
    {
      buildings: undefined,
      completed_research: undefined,
      game_tick: undefined,
      money: undefined,
      research_points: undefined,
      resources: undefined,
      total_money_earned: undefined,
      workers: undefined,
    },
  );
}
import type { ServerGameData } from "@/lib/game/shared/types/types";
import {
  classifyRawPersistedPayload,
  prepareCompletePersistedPayload,
  serializeCanonicalJson,
} from "./persistedGameStateContract.server";
import {
  REQUIRED_SERVER_GAME_DATA_FIELDS,
  isValidServerGameData,
} from "./serverGameDataSchema";

type RecoveryFieldClassification =
  | "exact_authoritative"
  | "deterministically_reconstructible"
  | "recoverable_from_trusted_history"
  | "conflicting_evidence"
  | "missing_unsafe";

type RecoveryDisposition =
  | "eligible_for_controlled_conversion"
  | "manual_recovery_required"
  | "recovery_required";

export interface LegacyRecoveryEvidence {
  detectedSchemaCondition:
    | "full_shape_unverified"
    | "partial_legacy"
    | "invalid_raw"
    | "conflicting_evidence"
    | "unknown_progress";
  disposition: RecoveryDisposition;
  fieldClassification: Record<string, RecoveryFieldClassification>;
  recoverableFields: Record<string, string[]>;
  unresolvedFields: string[];
  evidenceSources: Json;
}

export type RecoveryAccess =
  | { kind: "authenticated"; userId: string }
  | { kind: "guest_reference"; userId: string; recoveryReference: string };

export type OpenLegacyRecoveryCaseResult =
  | { kind: "opened"; caseId: string; evidence: LegacyRecoveryEvidence }
  | { kind: "not_eligible"; reason: string };

export type ImportLegacyRecoveryResult =
  | { kind: "completed"; stateVersion: number }
  | { kind: "forbidden" }
  | { kind: "not_approved" }
  | { kind: "state_conflict" }
  | { kind: "not_found" }
  | { kind: "invalid_payload" };

const AUTHORITATIVE_FIELD_VALUES = (
  row: ServerGameStateRecoverySource,
): Record<string, unknown> => ({
  money: row.money,
  totalMoneyEarned: row.total_money_earned,
  gameTick: row.game_tick,
  gameSpeed: row.game_speed,
  resources: row.resources,
  buildings: row.buildings,
  researchPoints: row.research_points,
  completedResearch: row.completed_research,
  workers: row.workers,
});

const PLAYER_PROGRESS_FIELD_MAP: Record<string, string> = {
  transportLines: "transport_lines",
  activeResearch: "active_research",
  researchProgress: "research_progress",
  market: "market_state",
  contracts: "contracts",
  prestigeState: "prestige_state",
  megaProjects: "mega_projects",
  activeEvents: "events",
  quests: "quests",
  weather: "weather",
  payoutConfig: "payout_config",
  stats: "stats",
  powerGrid: "power_grid",
  resourceCapacity: "resource_capacity",
  autoSellResources: "auto_sell_resources",
  storageUpgradeLevels: "storage_upgrade_levels",
  drones: "drones",
  pendingPayout: "pending_payout",
  blueprints: "blueprints",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasField(record: Record<string, unknown>, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, field);
}

function jsonEqual(left: unknown, right: unknown): boolean {
  try {
    return serializeCanonicalJson(left) === serializeCanonicalJson(right);
  } catch {
    return false;
  }
}

function classifyLegacyEvidence(
  row: ServerGameStateRecoverySource,
  playerProgress: Json | null,
  sourceSummary: Json,
): LegacyRecoveryEvidence {
  const raw = isRecord(row.full_state) ? row.full_state : null;
  const progress = isRecord(playerProgress) ? playerProgress : null;
  const authoritative = AUTHORITATIVE_FIELD_VALUES(row);
  const classification: Record<string, RecoveryFieldClassification> = {};
  const conflicts: string[] = [];

  for (const [field, expected] of Object.entries(authoritative)) {
    if (raw && hasField(raw, field) && !jsonEqual(raw[field], expected)) {
      classification[field] = "conflicting_evidence";
      conflicts.push(field);
    } else {
      classification[field] = "exact_authoritative";
    }
  }

  const rawComplete = raw !== null && isValidServerGameData(raw);
  for (const field of REQUIRED_SERVER_GAME_DATA_FIELDS) {
    if (classification[field]) continue;
    const progressField = PLAYER_PROGRESS_FIELD_MAP[field];
    if (rawComplete) {
      classification[field] = "deterministically_reconstructible";
    } else if (raw && hasField(raw, field)) {
      classification[field] = "recoverable_from_trusted_history";
    } else if (progress && progressField && hasField(progress, progressField)) {
      classification[field] = "recoverable_from_trusted_history";
    } else {
      classification[field] = "missing_unsafe";
    }
  }

  const unresolvedFields = Object.entries(classification)
    .filter(
      ([, state]) =>
        state === "conflicting_evidence" || state === "missing_unsafe",
    )
    .map(([field]) => field);
  const recoverableFields = Object.entries(classification).reduce<
    Record<string, string[]>
  >((groups, [field, state]) => {
    if (state !== "missing_unsafe" && state !== "conflicting_evidence") {
      (groups[state] ??= []).push(field);
    }
    return groups;
  }, {});

  const detectedSchemaCondition =
    raw === null
      ? "invalid_raw"
      : rawComplete
        ? "full_shape_unverified"
        : conflicts.length > 0
          ? "conflicting_evidence"
          : unresolvedFields.length === REQUIRED_SERVER_GAME_DATA_FIELDS.length
            ? "unknown_progress"
            : "partial_legacy";
  const disposition: RecoveryDisposition =
    rawComplete && conflicts.length === 0
      ? "eligible_for_controlled_conversion"
      : detectedSchemaCondition === "unknown_progress"
        ? "recovery_required"
        : "manual_recovery_required";

  return {
    detectedSchemaCondition,
    disposition,
    fieldClassification: classification,
    recoverableFields,
    unresolvedFields,
    evidenceSources: sourceSummary,
  };
}

function hashGuestRecoveryReference(reference: string): string {
  if (reference.length < 32) {
    throw new Error("Guest recovery reference must be high entropy");
  }
  return createHash("sha256").update(reference, "utf8").digest("hex");
}

function isAuthorizedRecoveryAccess(
  access: RecoveryAccess,
  storedGuestReferenceHash: string | null,
): boolean {
  if (access.kind === "authenticated") return true;
  if (!storedGuestReferenceHash) return false;
  const provided = Buffer.from(
    hashGuestRecoveryReference(access.recoveryReference),
    "hex",
  );
  const stored = Buffer.from(storedGuestReferenceHash, "hex");
  return provided.length === stored.length && timingSafeEqual(provided, stored);
}

function recoveryCaseStatusFor(
  evidence: LegacyRecoveryEvidence,
): RecoveryCaseStatus {
  return evidence.disposition === "eligible_for_controlled_conversion"
    ? "evidence_collected"
    : "manual_review_required";
}

/**
 * Snapshot one legacy state and its read-only evidence. It does not update the
 * gameplay row or its metadata; a repeated call returns the same case.
 */
export async function openLegacyRecoveryCase(input: {
  userId: string;
  guestRecoveryReference?: string;
}): Promise<OpenLegacyRecoveryCaseResult> {
  const state = await loadServerGameStateForRecovery(input.userId);
  if (!state) return { kind: "not_eligible", reason: "state_not_found" };

  const rawClassification = classifyRawPersistedPayload(state.full_state, {
    payload_schema_version: state.payload_schema_version,
    payload_lifecycle: state.payload_lifecycle,
    payload_checksum: state.payload_checksum,
  });
  if (rawClassification.kind === "bootstrap_pending") {
    return { kind: "not_eligible", reason: "bootstrap_pending" };
  }
  if (rawClassification.kind === "complete") {
    return { kind: "not_eligible", reason: "already_complete" };
  }

  const evidenceRows = await loadRecoveryEvidenceRows(input.userId);
  const evidence = classifyLegacyEvidence(
    state,
    evidenceRows.playerProgress,
    asFullState(evidenceRows.sources),
  );
  const recoveryCase = await createRecoveryCase({
    user_id: state.user_id,
    original_state_id: state.id,
    original_state_version: state.state_version,
    original_full_state: state.full_state,
    original_payload_schema_version: state.payload_schema_version,
    original_payload_lifecycle: state.payload_lifecycle,
    original_payload_checksum: state.payload_checksum,
    detected_schema_condition: evidence.detectedSchemaCondition,
    evidence_sources: evidence.evidenceSources,
    field_classification: asFullState(evidence.fieldClassification),
    recoverable_fields: asFullState(evidence.recoverableFields),
    unresolved_fields: asFullState(evidence.unresolvedFields),
    status: recoveryCaseStatusFor(evidence),
    guest_recovery_reference_hash: input.guestRecoveryReference
      ? hashGuestRecoveryReference(input.guestRecoveryReference)
      : null,
  });

  return { kind: "opened", caseId: recoveryCase.id, evidence };
}

/**
 * Server-internal approval boundary. A future support route must call
 * verifyAdmin() and canWrite() before invoking this function.
 */
export function approveLegacyRecoveryCase(
  caseId: string,
  approvedByUserId: string,
  method: string,
) {
  return approveRecoveryCase(caseId, approvedByUserId, method);
}

/**
 * Convert an explicitly approved case. It validates before crossing the DB
 * boundary and the RPC atomically performs the CAS update, case transition,
 * and immutable receipt insert.
 */
export async function importApprovedLegacyRecovery(input: {
  caseId: string;
  access: RecoveryAccess;
  reconstructedPayload: Record<string, unknown>;
}): Promise<ImportLegacyRecoveryResult> {
  const recoveryCase = await loadRecoveryCase(
    input.caseId,
    input.access.userId,
  );
  if (!recoveryCase) return { kind: "not_found" };
  if (
    !isAuthorizedRecoveryAccess(
      input.access,
      recoveryCase.guest_recovery_reference_hash,
    )
  ) {
    return { kind: "forbidden" };
  }
  if (recoveryCase.status !== "approved") return { kind: "not_approved" };

  let prepared: {
    gameState: ServerGameData;
    checksum: string;
  };
  try {
    prepared = prepareCompletePersistedPayload(input.reconstructedPayload);
  } catch {
    return { kind: "invalid_payload" };
  }

  const result = await completeRecoveryCase({
    caseId: recoveryCase.id,
    userId: recoveryCase.user_id,
    expectedStateVersion: recoveryCase.original_state_version,
    fullState: asFullState(prepared.gameState),
    payloadChecksum: prepared.checksum,
    denormalized: asFullState(
      buildDenormalizedFieldsFromCompleteState(prepared.gameState),
    ),
  });

  if (result.outcome === "COMPLETED" && result.recoveredStateVersion !== null) {
    return { kind: "completed", stateVersion: result.recoveredStateVersion };
  }
  if (result.outcome === "STATE_VERSION_CONFLICT")
    return { kind: "state_conflict" };
  if (
    result.outcome === "RECOVERY_CASE_NOT_FOUND" ||
    result.outcome === "STATE_NOT_FOUND"
  ) {
    return { kind: "not_found" };
  }
  if (result.outcome === "RECOVERY_CASE_NOT_APPROVED")
    return { kind: "not_approved" };
  return { kind: "invalid_payload" };
}
