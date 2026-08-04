/**
 * Autonoma test-data — user & identity factories.
 */

import { randomUUID } from "node:crypto";

import { defineFactory } from "@autonoma-ai/sdk";
import { z } from "zod";

import { requireDb, ref, userUuidFor } from "./helpers";

// ─── profiles ───────────────────────────────────────────────────────────

export const profilesFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    logicalUserId: z.string(),
    email: z.string().nullable(),
    isGuest: z.boolean().default(false),
    displayName: z.string(),
    deviceFingerprint: z.string(),
    progressLifecycle: z
      .enum(["never_initialized", "active", "recovery_required"])
      .default("never_initialized"),
  }),
  refSchema: z.object({
    id: z.string(),
    authEmail: z.string(),
    password: z.string(),
  }),
  create: async (data, ctx) => {
    const supabase = requireDb();
    const userId = userUuidFor(ctx.testRunId, data.logicalUserId);
    const password = `autonoma-${ctx.testRunId.slice(0, 12)}`;
    const email =
      data.email ??
      `guest+${ctx.testRunId.slice(0, 8)}+${data.logicalUserId}@autonoma.local`;

    const { error: authErr } = await supabase.auth.admin.createUser({
      id: userId,
      email,
      password,
      email_confirm: true,
      user_metadata: {
        autonoma_seed: true,
        is_guest: data.isGuest,
        device_fingerprint: data.deviceFingerprint,
      },
    });
    if (authErr) {
      throw new Error(
        `[autonoma] auth.admin.createUser failed: ${authErr.message}`,
      );
    }

    const { error: patchErr } = await supabase
      .from("profiles")
      .update({
        display_name: data.displayName,
        device_fingerprint: data.deviceFingerprint,
        is_guest: data.isGuest,
        progress_lifecycle: data.progressLifecycle,
        is_test: true,
      })
      .eq("id", userId);
    if (patchErr) {
      throw new Error(`[autonoma] profile patch failed: ${patchErr.message}`);
    }

    return ref({ id: userId, authEmail: email, password });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    // The `auth.users → profiles.id` FK is `NO ACTION`, so we must
    // remove the dependent profile row first before deleteUser.
    // Wrap in a best-effort cleanup: drop any rows that depend on
    // this user, then delete the auth user.
    const cleanup = async () => {
      await supabase
        .from("server_game_state")
        .delete()
        .eq("user_id", record.id);
      await supabase.from("player_progress").delete().eq("user_id", record.id);
      await supabase.from("player_actions").delete().eq("user_id", record.id);
      await supabase.from("trade_history").delete().eq("user_id", record.id);
      await supabase.from("leaderboard").delete().eq("user_id", record.id);
      await supabase.from("user_streaks").delete().eq("user_id", record.id);
      await supabase.from("daily_rewards").delete().eq("user_id", record.id);
      await supabase
        .from("fingerprint_events")
        .delete()
        .eq("user_id", record.id);
      await supabase.from("request_ip_log").delete().eq("user_id", record.id);
      await supabase
        .from("cheat_investigations")
        .delete()
        .eq("user_id", record.id);
      await supabase.from("admin_users").delete().eq("user_id", record.id);
      await supabase
        .from("admin_actions")
        .delete()
        .eq("admin_user_id", record.id);
      await supabase
        .from("admin_actions")
        .delete()
        .eq("target_user_id", record.id);
      await supabase.from("support_tickets").delete().eq("user_id", record.id);
      await supabase
        .from("support_messages")
        .delete()
        .eq("sender_id", record.id);
      await supabase.from("guest_identities").delete().eq("user_id", record.id);
      await supabase
        .from("guest_identities")
        .delete()
        .eq("superseded_by", record.id);
      await supabase.from("device_bindings").delete().eq("user_id", record.id);
      await supabase.from("player_sessions").delete().eq("user_id", record.id);
      await supabase
        .from("game_state_recovery_cases")
        .delete()
        .eq("user_id", record.id);
      await supabase
        .from("merge_receipts")
        .delete()
        .eq("kept_user_id", record.id);
      await supabase
        .from("merge_receipts")
        .delete()
        .eq("archived_user_id", record.id);
      await supabase
        .from("merge_audit_log")
        .delete()
        .eq("guest_user_id", record.id);
      await supabase
        .from("merge_audit_log")
        .delete()
        .eq("google_user_id", record.id);
      await supabase
        .from("merge_audit_log")
        .delete()
        .eq("actor_user_id", record.id);
      await supabase
        .from("pending_link_operations")
        .delete()
        .eq("guest_user_id", record.id);
      await supabase
        .from("pending_link_operations")
        .delete()
        .eq("google_user_id", record.id);
      await supabase
        .from("guest_state_archive")
        .delete()
        .eq("guest_user_id", record.id);
      await supabase
        .from("guest_state_archive")
        .delete()
        .eq("archived_by_auth_user_id", record.id);
      await supabase
        .from("game_state_recovery_cases")
        .delete()
        .eq("approved_by", record.id);
      await supabase
        .from("bootstrap_telemetry")
        .delete()
        .eq("user_id", record.id);
      await supabase.from("profiles").delete().eq("id", record.id);
    };
    try {
      await cleanup();
      const { error } = await supabase.auth.admin.deleteUser(record.id);
      if (error) {
        console.error(
          `[autonoma] profiles teardown deleteUser failed: ${error.message}`,
        );
      }
    } catch (e) {
      console.error(`[autonoma] profiles teardown exception:`, e);
    }
  },
});

// ─── device_bindings ────────────────────────────────────────────────────

export const deviceBindingsFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    logicalUserId: z.string(),
    deviceId: z.string(),
    bindingType: z.enum(["active_guest", "authenticated_association"]),
  }),
  refSchema: z.object({ id: z.string() }),
  create: async (data, ctx) => {
    const supabase = requireDb();
    const userId = userUuidFor(ctx.testRunId, data.logicalUserId);
    const id = randomUUID();
    const { data: row, error } = await supabase
      .from("device_bindings")
      .insert({
        id,
        device_id: data.deviceId,
        user_id: userId,
        binding_type: data.bindingType,
        status: "active",
      })
      .select("id")
      .single();
    if (error) throw new Error(`[autonoma] device_bindings: ${error.message}`);
    return ref({ id: row.id });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase.from("device_bindings").delete().eq("id", record.id);
  },
});

// ─── guest_identities ───────────────────────────────────────────────────

export const guestIdentitiesFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    logicalUserId: z.string(),
    fingerprint: z.string(),
    deviceId: z.string().nullable().default(null),
    supersededBy: z.string().nullable().default(null),
  }),
  refSchema: z.object({ id: z.string() }),
  create: async (data, ctx) => {
    const supabase = requireDb();
    const userId = userUuidFor(ctx.testRunId, data.logicalUserId);
    const id = randomUUID();
    const supersededById = data.supersededBy
      ? userUuidFor(ctx.testRunId, data.supersededBy)
      : null;
    const nowIso = new Date().toISOString();
    const { data: row, error } = await supabase
      .from("guest_identities")
      .insert({
        id,
        fingerprint: data.fingerprint,
        user_id: userId,
        device_id: data.deviceId,
        fingerprint_hash: data.fingerprint,
        is_primary: true,
        claimed_at: nowIso,
        last_used_at: nowIso,
        superseded_by: supersededById,
        superseded_at: supersededById ? nowIso : null,
      })
      .select("id")
      .single();
    if (error) throw new Error(`[autonoma] guest_identities: ${error.message}`);
    return ref({ id: row.id });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase.from("guest_identities").delete().eq("id", record.id);
  },
});

// ─── player_sessions ───────────────────────────────────────────────────

export const playerSessionsFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    logicalUserId: z.string(),
    isOnline: z.boolean().default(true),
  }),
  refSchema: z.object({ id: z.string() }),
  create: async (data, ctx) => {
    const supabase = requireDb();
    const userId = userUuidFor(ctx.testRunId, data.logicalUserId);
    const id = randomUUID();
    const nowIso = new Date().toISOString();
    const { data: row, error } = await supabase
      .from("player_sessions")
      .upsert(
        {
          id,
          user_id: userId,
          is_online: data.isOnline,
          last_heartbeat_at: nowIso,
          connected_at: nowIso,
          disconnected_at: data.isOnline ? null : nowIso,
        },
        { onConflict: "user_id" },
      )
      .select("id")
      .single();
    if (error) throw new Error(`[autonoma] player_sessions: ${error.message}`);
    return ref({ id: row.id });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase.from("player_sessions").delete().eq("id", record.id);
  },
});
