/**
 * Autonoma test-data — admin / moderation / system factories.
 */

import { defineFactory } from "@autonoma-ai/sdk";
import { z } from "zod";

import { ref, requireDb, userUuidFor } from "./helpers";

const randomUUID = () => require("node:crypto").randomUUID();

// ─── admin_users ────────────────────────────────────────────────────────

export const adminUsersFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    logicalUserId: z.string(),
    role: z.enum(["viewer", "admin", "super_admin"]).default("admin"),
    email: z.string(),
    addedBy: z.string().nullable().default(null),
  }),
  refSchema: z.object({ id: z.string(), user_id: z.string() }),
  create: async (data, ctx) => {
    const supabase = requireDb();
    const userId = userUuidFor(ctx.testRunId, data.logicalUserId);
    const id = randomUUID();
    const addedById = data.addedBy
      ? userUuidFor(ctx.testRunId, data.addedBy)
      : null;
    const { data: row, error } = await supabase
      .from("admin_users")
      .insert({
        id,
        user_id: userId,
        email: data.email,
        role: data.role,
        added_by: addedById,
      })
      .select("id,user_id")
      .single();
    if (error) throw new Error(`[autonoma] admin_users: ${error.message}`);
    return ref({ id: row.id, user_id: row.user_id });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase.from("admin_users").delete().eq("id", record.id);
  },
});

// ─── admin_permissions ──────────────────────────────────────────────────

export const adminPermissionsFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    adminId: z.string(),
    permission: z.string(),
    grantedBy: z.string().nullable().default(null),
  }),
  refSchema: z.object({ id: z.string() }),
  create: async (data) => {
    const supabase = requireDb();
    const id = randomUUID();
    const { data: row, error } = await supabase
      .from("admin_permissions")
      .insert({
        id,
        admin_user_id: data.adminId,
        permission: data.permission,
        granted_by: data.grantedBy,
      })
      .select("id")
      .single();
    if (error)
      throw new Error(`[autonoma] admin_permissions: ${error.message}`);
    return ref({ id: row.id });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase.from("admin_permissions").delete().eq("id", record.id);
  },
});

// ─── admin_actions ──────────────────────────────────────────────────────

export const adminActionsFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    logicalAdminId: z.string(),
    actionType: z.enum([
      "lock_account",
      "unlock_account",
      "reset_state",
      "edit_state",
      "create_config_row",
      "update_config_row",
      "delete_config_row",
      "resolve_investigation",
      "dismiss_investigation",
      "add_admin",
      "remove_admin",
      "change_admin_role",
    ]),
    targetId: z.string().nullable().default(null),
    targetUserId: z.string().nullable().default(null),
    details: z.record(z.unknown()).default({}),
  }),
  refSchema: z.object({ id: z.string() }),
  create: async (data, ctx) => {
    const supabase = requireDb();
    const adminId = userUuidFor(ctx.testRunId, data.logicalAdminId);
    const targetUserId = data.targetUserId
      ? userUuidFor(ctx.testRunId, data.targetUserId)
      : null;
    const id = randomUUID();
    const { data: row, error } = await supabase
      .from("admin_actions")
      .insert({
        id,
        admin_user_id: adminId,
        action_type: data.actionType,
        target_id: data.targetId,
        target_user_id: targetUserId,
        details: data.details,
      })
      .select("id")
      .single();
    if (error) throw new Error(`[autonoma] admin_actions: ${error.message}`);
    return ref({ id: row.id });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase.from("admin_actions").delete().eq("id", record.id);
  },
});

// ─── cheat_investigations ───────────────────────────────────────────────

export const cheatInvestigationsFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    logicalUserId: z.string(),
    detectionType: z.enum([
      "money_manipulation",
      "tick_manipulation",
      "invalid_building",
      "invalid_research",
      "speed_hack",
      "import_hack",
      "state_tampering",
      "negative_resources",
      "impossible_progression",
      "other",
    ]),
    severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
    status: z
      .enum(["open", "investigating", "resolved", "dismissed"])
      .default("open"),
    description: z.string().default("Autonoma seeded investigation"),
    evidence: z.record(z.unknown()).default({}),
    fingerprintHash: z.string().nullable().default(null),
  }),
  refSchema: z.object({ id: z.string() }),
  create: async (data, ctx) => {
    const supabase = requireDb();
    const userId = userUuidFor(ctx.testRunId, data.logicalUserId);
    const id = randomUUID();
    const { data: row, error } = await supabase
      .from("cheat_investigations")
      .insert({
        id,
        user_id: userId,
        detection_type: data.detectionType,
        severity: data.severity,
        status: data.status,
        description: data.description,
        evidence: data.evidence,
        fingerprint_hash: data.fingerprintHash,
      })
      .select("id")
      .single();
    if (error)
      throw new Error(`[autonoma] cheat_investigations: ${error.message}`);
    return ref({ id: row.id });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase.from("cheat_investigations").delete().eq("id", record.id);
  },
});

// ─── support_tickets ────────────────────────────────────────────────────

export const supportTicketsFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    logicalUserId: z.string().nullable().default(null),
    subject: z.string(),
    status: z
      .enum(["open", "in_progress", "resolved", "closed"])
      .default("open"),
  }),
  refSchema: z.object({ id: z.string() }),
  create: async (data, ctx) => {
    const supabase = requireDb();
    const userId = data.logicalUserId
      ? userUuidFor(ctx.testRunId, data.logicalUserId)
      : null;
    const id = randomUUID();
    const { data: row, error } = await supabase
      .from("support_tickets")
      .insert({
        id,
        user_id: userId,
        subject: data.subject,
        status: data.status,
      })
      .select("id")
      .single();
    if (error) throw new Error(`[autonoma] support_tickets: ${error.message}`);
    return ref({ id: row.id });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase.from("support_tickets").delete().eq("id", record.id);
  },
});

// ─── support_messages ───────────────────────────────────────────────────

export const supportMessagesFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    ticketId: z.string(),
    logicalSenderId: z.string(),
    message: z.string(),
    senderType: z.enum(["user", "admin", "system"]).default("user"),
  }),
  refSchema: z.object({ id: z.string() }),
  create: async (data, ctx) => {
    const supabase = requireDb();
    const senderId = userUuidFor(ctx.testRunId, data.logicalSenderId);
    const ticketId = randomUUID();
    const id = randomUUID();
    const { data: row, error } = await supabase
      .from("support_messages")
      .insert({
        id,
        ticket_id: ticketId,
        sender_id: senderId,
        sender_type: data.senderType,
        message: data.message,
      })
      .select("id")
      .single();
    if (error) throw new Error(`[autonoma] support_messages: ${error.message}`);
    return ref({ id: row.id });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase.from("support_messages").delete().eq("id", record.id);
  },
});

// ─── waitlist_entries ───────────────────────────────────────────────────

export const waitlistEntriesFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    email: z.string(),
    name: z.string().nullable().default(null),
    source: z.string().nullable().default("waitlist_form"),
    status: z.enum(["pending", "approved", "rejected"]).default("pending"),
  }),
  refSchema: z.object({ id: z.string() }),
  create: async (data) => {
    const supabase = requireDb();
    const id = randomUUID();
    const { data: row, error } = await supabase
      .from("waitlist_entries")
      .insert({
        id,
        email: data.email,
        name: data.name,
        source: data.source,
        status: data.status,
      })
      .select("id")
      .single();
    if (error) throw new Error(`[autonoma] waitlist_entries: ${error.message}`);
    return ref({ id: row.id });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase.from("waitlist_entries").delete().eq("id", record.id);
  },
});

// ─── rate_limits ────────────────────────────────────────────────────────

export const rateLimitsFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    identifier: z.string(),
    endpoint: z.string(),
    windowStart: z.string(),
    requestCount: z.number().default(1),
  }),
  refSchema: z.object({ id: z.number() }),
  create: async (data) => {
    const supabase = requireDb();
    const { data: row, error } = await supabase
      .from("rate_limits")
      .insert({
        identifier: data.identifier,
        endpoint: data.endpoint,
        window_start: data.windowStart,
        request_count: data.requestCount,
      })
      .select("id")
      .single();
    if (error) throw new Error(`[autonoma] rate_limits: ${error.message}`);
    return ref({ id: row.id });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase.from("rate_limits").delete().eq("id", record.id);
  },
});

// ─── request_ip_log ─────────────────────────────────────────────────────

export const requestIpLogFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    ipHash: z.string(),
    endpoint: z.string(),
    logicalUserId: z.string().nullable().default(null),
  }),
  refSchema: z.object({ id: z.number() }),
  create: async (data, ctx) => {
    const supabase = requireDb();
    const userId = data.logicalUserId
      ? userUuidFor(ctx.testRunId, data.logicalUserId)
      : null;
    const { data: row, error } = await supabase
      .from("request_ip_log")
      .insert({
        ip_hash: data.ipHash,
        endpoint: data.endpoint,
        user_id: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(`[autonoma] request_ip_log: ${error.message}`);
    return ref({ id: row.id });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase.from("request_ip_log").delete().eq("id", record.id);
  },
});

// ─── fingerprint_events (bigint id) ────────────────────────────────────

export const fingerprintEventsFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    logicalUserId: z.string().nullable().default(null),
    status: z.enum(["available", "unavailable"]).default("available"),
    reason: z
      .enum(["blocked", "timeout", "network", "unsupported", "unknown"])
      .default("unknown"),
    userAgent: z.string().nullable().default(null),
    platform: z.string().nullable().default(null),
  }),
  refSchema: z.object({ id: z.number() }),
  create: async (data, ctx) => {
    const supabase = requireDb();
    const userId = data.logicalUserId
      ? userUuidFor(ctx.testRunId, data.logicalUserId)
      : null;
    const { data: row, error } = await supabase
      .from("fingerprint_events")
      .insert({
        user_id: userId,
        status: data.status,
        reason: data.reason,
        user_agent: data.userAgent,
        platform: data.platform,
      })
      .select("id")
      .single();
    if (error)
      throw new Error(`[autonoma] fingerprint_events: ${error.message}`);
    return ref({ id: row.id });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase.from("fingerprint_events").delete().eq("id", record.id);
  },
});

// ─── bootstrap_telemetry ────────────────────────────────────────────────

export const bootstrapTelemetryFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    deviceId: z.string(),
    outcome: z
      .enum([
        "ready",
        "conflict",
        "recovery_required",
        "temporary_error",
        "signed_out",
        "signed_in",
      ])
      .default("ready"),
    source: z
      .enum(["deviceId", "auth", "fresh", "sign_out_to_guest"])
      .nullable()
      .default(null),
    durationMs: z.number().nullable().default(null),
    fingerprintStatus: z
      .enum(["ok", "unavailable", "timeout"])
      .nullable()
      .default(null),
    stateAtEmit: z.string().nullable().default(null),
    isGuest: z.boolean().nullable().default(null),
    logicalUserId: z.string().nullable().default(null),
  }),
  refSchema: z.object({ id: z.string() }),
  create: async (data, ctx) => {
    const supabase = requireDb();
    const userId = data.logicalUserId
      ? userUuidFor(ctx.testRunId, data.logicalUserId)
      : null;
    const id = randomUUID();
    const { data: row, error } = await supabase
      .from("bootstrap_telemetry")
      .insert({
        id,
        device_id: data.deviceId,
        user_id: userId,
        outcome: data.outcome,
        source: data.source,
        duration_ms: data.durationMs,
        fingerprint_status: data.fingerprintStatus,
        state_at_emit: data.stateAtEmit,
        is_guest: data.isGuest,
      })
      .select("id")
      .single();
    if (error)
      throw new Error(`[autonoma] bootstrap_telemetry: ${error.message}`);
    return ref({ id: row.id });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase.from("bootstrap_telemetry").delete().eq("id", record.id);
  },
});
