/**
 * Autonoma test-data — auth-merge & guest-state factories.
 */

import { randomUUID } from "node:crypto";

import { defineFactory } from "@autonoma-ai/sdk";
import { z } from "zod";

import { ref, requireDb, shortIdFor, userUuidFor, uuidFor } from "./helpers";

// ─── pending_link_operations ────────────────────────────────────────────

export const pendingLinkOperationsFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    logicalGuestUserId: z.string(),
    logicalAuthUserId: z.string(),
    preference: z.string().default("auth_wins"),
    idempotencyKey: z.string(),
    expiresAt: z.string(),
  }),
  refSchema: z.object({ id: z.string(), idempotency_key: z.string() }),
  create: async (data, ctx) => {
    const supabase = requireDb();
    const guestId = userUuidFor(ctx.testRunId, data.logicalGuestUserId);
    const authId = userUuidFor(ctx.testRunId, data.logicalAuthUserId);
    const id = randomUUID();
    const idempotencyKey = `${data.idempotencyKey}-${shortIdFor(ctx.testRunId)}`;
    const { data: row, error } = await supabase
      .from("pending_link_operations")
      .insert({
        id,
        guest_user_id: guestId,
        google_user_id: authId,
        idempotency_key: idempotencyKey,
        status: "pending",
        preference: data.preference,
        expires_at: data.expiresAt,
      })
      .select("id,idempotency_key")
      .single();
    if (error)
      throw new Error(`[autonoma] pending_link_operations: ${error.message}`);
    return ref({ id: row.id, idempotency_key: row.idempotency_key });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase.from("pending_link_operations").delete().eq("id", record.id);
  },
});

// ─── merge_receipts ─────────────────────────────────────────────────────

export const mergeReceiptsFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    logicalKeptUserId: z.string(),
    logicalArchivedUserId: z.string().nullable().default(null),
    decisionType: z.string().default("auth_wins"),
    operationId: z.string(),
  }),
  refSchema: z.object({ id: z.string(), operation_id: z.string() }),
  create: async (data, ctx) => {
    const supabase = requireDb();
    const keptId = userUuidFor(ctx.testRunId, data.logicalKeptUserId);
    const archivedId = data.logicalArchivedUserId
      ? userUuidFor(ctx.testRunId, data.logicalArchivedUserId)
      : null;
    const id = randomUUID();
    // `operation_id` is a uuid column. Hash the recipe-supplied logical id
    // so concurrent runs get disjoint operation_ids.
    const operationId = uuidFor(ctx.testRunId, `op:${data.operationId}`);
    const { data: row, error } = await supabase
      .from("merge_receipts")
      .insert({
        id,
        operation_id: operationId,
        kept_user_id: keptId,
        archived_user_id: archivedId,
        decision_type: data.decisionType,
      })
      .select("id,operation_id")
      .single();
    if (error) throw new Error(`[autonoma] merge_receipts: ${error.message}`);
    return ref({ id: row.id, operation_id: row.operation_id });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase.from("merge_receipts").delete().eq("id", record.id);
  },
});

// ─── merge_audit_log ────────────────────────────────────────────────────

export const mergeAuditLogFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    mergeReceiptId: z.string(),
    logicalGuestUserId: z.string(),
    logicalGoogleUserId: z.string(),
    preference: z.string().default("auth_wins"),
    idempotencyKey: z.string(),
    logicalActorUserId: z.string(),
    guestStateBefore: z.record(z.string(), z.unknown()).nullable().default(null),
    googleStateBefore: z.record(z.string(), z.unknown()).nullable().default(null),
  }),
  refSchema: z.object({ id: z.string() }),
  create: async (data, ctx) => {
    const supabase = requireDb();
    const guestId = userUuidFor(ctx.testRunId, data.logicalGuestUserId);
    const googleId = userUuidFor(ctx.testRunId, data.logicalGoogleUserId);
    const actorId = userUuidFor(ctx.testRunId, data.logicalActorUserId);
    // The schema's `merge_receipt_id` column is text but the FK from
    // `merge_audit_log` to `merge_receipts` was dropped; per-run salt
    // keeps concurrent runs collision-free.
    const mergeReceiptId = `merge-${data.mergeReceiptId}-${shortIdFor(ctx.testRunId)}`;
    const idempotencyKey = `${data.idempotencyKey}-${shortIdFor(ctx.testRunId)}`;
    const id = randomUUID();
    const { data: row, error } = await supabase
      .from("merge_audit_log")
      .insert({
        id,
        merge_receipt_id: mergeReceiptId,
        idempotency_key: idempotencyKey,
        guest_user_id: guestId,
        google_user_id: googleId,
        preference: data.preference,
        guest_state_before: data.guestStateBefore,
        google_state_before: data.googleStateBefore,
        actor_user_id: actorId,
      })
      .select("id")
      .single();
    if (error) throw new Error(`[autonoma] merge_audit_log: ${error.message}`);
    return ref({ id: row.id });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase.from("merge_audit_log").delete().eq("id", record.id);
  },
});

// ─── guest_state_archive ────────────────────────────────────────────────

export const guestStateArchiveFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    logicalGuestUserId: z.string(),
    logicalArchivedByAuthUserId: z.string(),
    policyApplied: z.string().default("auth_wins_archive_guest"),
    reason: z.string().default("autonoma_seed"),
    fullStateSnapshot: z.record(z.string(), z.unknown()).default({}),
    money: z.number().default(0),
    gameTick: z.number().default(0),
  }),
  refSchema: z.object({ id: z.string() }),
  create: async (data, ctx) => {
    const supabase = requireDb();
    const guestId = userUuidFor(ctx.testRunId, data.logicalGuestUserId);
    const archivedById = userUuidFor(
      ctx.testRunId,
      data.logicalArchivedByAuthUserId,
    );
    const id = uuidFor(ctx.testRunId, `gsa:${data.logicalGuestUserId}`);
    const { data: row, error } = await supabase
      .from("guest_state_archive")
      .insert({
        id,
        guest_user_id: guestId,
        archived_by_auth_user_id: archivedById,
        policy_applied: data.policyApplied,
        reason: data.reason,
        full_state_snapshot: data.fullStateSnapshot,
        money: data.money,
        game_tick: data.gameTick,
        is_latest: true,
      })
      .select("id")
      .single();
    if (error)
      throw new Error(`[autonoma] guest_state_archive: ${error.message}`);
    return ref({ id: row.id });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase.from("guest_state_archive").delete().eq("id", record.id);
  },
});
