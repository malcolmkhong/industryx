/**
 * Server-only persistence helpers for the legacy game-state recovery ledger.
 *
 * This module does not decide whether progress is safe to reconstruct. The
 * recovery service owns that policy; this layer only reads evidence, records
 * reviewed cases, and invokes the single transactional CAS conversion RPC.
 */

import { requireDbClient } from "@/lib/db/access";
import type { Database, Json } from "@/lib/db/types";

type RecoveryCaseRow = Database["public"]["Tables"]["game_state_recovery_cases"]["Row"];
type RecoveryCaseInsert = Database["public"]["Tables"]["game_state_recovery_cases"]["Insert"];

/** Safe operator-facing metadata. It intentionally excludes original_full_state. */
export interface RecoveryCaseSummary {
  id: string;
  user_id: string;
  status: string;
  detected_schema_condition: string;
  evidence_sources: Json;
  field_classification: Json;
  recoverable_fields: Json;
  unresolved_fields: Json;
  approved_recovery_method: string | null;
  approved_by: string | null;
  approved_at: string | null;
  converted_at: string | null;
  created_at: string;
  updated_at: string;
}

export type RecoveryCaseStatus =
  | "evidence_collected"
  | "manual_review_required"
  | "approved"
  | "converted"
  | "rejected";

export interface RecoveryEvidenceSourceSummary {
  source: string;
  recordCount: number;
  latestRecordedAt: string | null;
}

export interface RecoveryEvidenceSources {
  playerProgress: RecoveryEvidenceSourceSummary;
  playerActions: RecoveryEvidenceSourceSummary;
  tradeHistory: RecoveryEvidenceSourceSummary;
  guestArchive: RecoveryEvidenceSourceSummary;
  mergeHistory: RecoveryEvidenceSourceSummary;
  bindingHistory: RecoveryEvidenceSourceSummary;
}

export interface RecoveryEvidenceRows {
  playerProgress: Json | null;
  sources: RecoveryEvidenceSources;
}

export type CreateRecoveryCaseValues = RecoveryCaseInsert;

export interface RecoveryImportRpcResult {
  outcome:
    | "COMPLETED"
    | "RECOVERY_CASE_NOT_FOUND"
    | "RECOVERY_CASE_NOT_APPROVED"
    | "STATE_NOT_FOUND"
    | "STATE_VERSION_CONFLICT"
    | "INVALID_SERVER_PAYLOAD";
  recoveredStateVersion: number | null;
}

const RECOVERY_CASE_COLUMNS =
  "id,user_id,original_state_id,original_state_version,original_full_state,original_payload_schema_version,original_payload_lifecycle,original_payload_checksum,detected_schema_condition,evidence_sources,field_classification,recoverable_fields,unresolved_fields,status,approved_recovery_method,approved_by,approved_at,converted_at,guest_recovery_reference_hash,created_at,updated_at";
const RECOVERY_CASE_SUMMARY_COLUMNS =
  "id,user_id,status,detected_schema_condition,evidence_sources,field_classification,recoverable_fields,unresolved_fields,approved_recovery_method,approved_by,approved_at,converted_at,created_at,updated_at";

function summary(source: string, rows: { created_at?: string | null; updated_at?: string | null; archived_at?: string | null }[] | null, timestampKey: "created_at" | "updated_at" | "archived_at"): RecoveryEvidenceSourceSummary {
  const timestamps = (rows ?? [])
    .map((row) => row[timestampKey])
    .filter((value): value is string => typeof value === "string")
    .sort();
  return {
    source,
    recordCount: rows?.length ?? 0,
    latestRecordedAt: timestamps.at(-1) ?? null,
  };
}

/** Read-only, bounded evidence lookup. Raw historical snapshots stay server-only. */
export async function loadRecoveryEvidenceRows(userId: string): Promise<RecoveryEvidenceRows> {
  const db = requireDbClient();
  const [
    progressResult,
    actionsResult,
    tradesResult,
    archivesResult,
    mergesResult,
    bindingsResult,
  ] = await Promise.all([
    db
      .from("player_progress")
      .select(
        "game_state,transport_lines,completed_research,active_research,research_progress,workers,market_state,contracts,prestige_state,mega_projects,events,quests,weather,payout_config,stats,power_grid,resource_capacity,auto_sell_resources,storage_upgrade_levels,drones,pending_payout,blueprints,daily_login_streak,daily_rewards_claimed,updated_at",
      )
      .eq("user_id", userId)
      .maybeSingle(),
    db.from("player_actions").select("created_at").eq("user_id", userId).limit(5000),
    db.from("trade_history").select("created_at").eq("user_id", userId).limit(5000),
    db
      .from("guest_state_archive")
      .select("archived_at")
      .or(`guest_user_id.eq.${userId},archived_by_auth_user_id.eq.${userId}`)
      .limit(5000),
    db
      .from("merge_audit_log")
      .select("created_at")
      .or(`guest_user_id.eq.${userId},google_user_id.eq.${userId},actor_user_id.eq.${userId}`)
      .limit(5000),
    db.from("device_bindings").select("updated_at").eq("user_id", userId).limit(5000),
  ]);

  for (const result of [
    progressResult,
    actionsResult,
    tradesResult,
    archivesResult,
    mergesResult,
    bindingsResult,
  ]) {
    if (result.error) throw result.error;
  }

  const progress = progressResult.data ?? null;
  return {
    playerProgress: progress as Json | null,
    sources: {
      playerProgress: {
        source: "player_progress",
        recordCount: progress ? 1 : 0,
        latestRecordedAt: progress?.updated_at ?? null,
      },
      playerActions: summary("player_actions", actionsResult.data, "created_at"),
      tradeHistory: summary("trade_history", tradesResult.data, "created_at"),
      guestArchive: summary("guest_state_archive", archivesResult.data, "archived_at"),
      mergeHistory: summary("merge_audit_log", mergesResult.data, "created_at"),
      bindingHistory: summary("device_bindings", bindingsResult.data, "updated_at"),
    },
  };
}

/** Idempotently create one recovery case per original state row. */
export async function createRecoveryCase(
  values: CreateRecoveryCaseValues,
): Promise<RecoveryCaseRow> {
  const db = requireDbClient();
  const { data, error } = await db
    .from("game_state_recovery_cases")
    .upsert(values, { onConflict: "original_state_id", ignoreDuplicates: true })
    .select(RECOVERY_CASE_COLUMNS)
    .maybeSingle();

  if (error) throw error;
  if (data) return data as RecoveryCaseRow;

  const { data: existing, error: existingError } = await db
    .from("game_state_recovery_cases")
    .select(RECOVERY_CASE_COLUMNS)
    .eq("original_state_id", values.original_state_id)
    .single();
  if (existingError || !existing) throw existingError ?? new Error("Recovery case was not created");
  return existing as RecoveryCaseRow;
}

export async function loadRecoveryCase(
  caseId: string,
  userId: string,
): Promise<RecoveryCaseRow | null> {
  const db = requireDbClient();
  const { data, error } = await db
    .from("game_state_recovery_cases")
    .select(RECOVERY_CASE_COLUMNS)
    .eq("id", caseId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as RecoveryCaseRow | null;
}

/**
 * Load the latest recovery case associated with a support ticket's player.
 * Raw snapshots remain excluded so support UI/API consumers cannot leak or
 * accidentally reuse the original persisted gameplay payload.
 */
export async function loadLatestRecoveryCaseForUser(
  userId: string,
): Promise<RecoveryCaseSummary | null> {
  const db = requireDbClient();
  const { data, error } = await db
    .from("game_state_recovery_cases")
    .select(RECOVERY_CASE_SUMMARY_COLUMNS)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as RecoveryCaseSummary | null;
}

/**
 * This is server-internal. Its caller must already have verified the support
 * operator's admin/write permission; no public route is introduced here.
 */
export async function approveRecoveryCase(
  caseId: string,
  approvedBy: string,
  method: string,
): Promise<RecoveryCaseRow | null> {
  const db = requireDbClient();
  const { data, error } = await db
    .from("game_state_recovery_cases")
    .update({
      status: "approved",
      approved_by: approvedBy,
      approved_recovery_method: method,
      approved_at: new Date().toISOString(),
    })
    .eq("id", caseId)
    .in("status", ["evidence_collected", "manual_review_required"])
    .select(RECOVERY_CASE_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return data as RecoveryCaseRow | null;
}

/** Single transactional state CAS, case transition, and immutable receipt. */
export async function completeRecoveryCase(
  input: {
    caseId: string;
    userId: string;
    expectedStateVersion: number;
    fullState: Json;
    payloadChecksum: string;
    denormalized: Json;
  },
): Promise<RecoveryImportRpcResult> {
  const db = requireDbClient();
  const { data, error } = await db.rpc("complete_game_state_recovery", {
    p_case_id: input.caseId,
    p_user_id: input.userId,
    p_expected_state_version: input.expectedStateVersion,
    p_full_state: input.fullState,
    p_payload_checksum: input.payloadChecksum,
    p_denormalized: input.denormalized,
  });
  if (error) throw error;

  const result = data?.[0];
  if (!result) throw new Error("Recovery conversion RPC returned no outcome");
  return {
    outcome: result.outcome as RecoveryImportRpcResult["outcome"],
    recoveredStateVersion: result.recovered_state_version,
  };
}
