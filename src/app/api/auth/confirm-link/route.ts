// Phase 1.5: Confirm the merge transaction
// AUTH ALWAYS WINS — there is no preference. The guest user's data is
// MOVED (not copied) onto the auth user's row in every per-user table.
// The guest profile is archived (is_guest preserved for audit),
// guest_identities marked superseded, and merge_receipts/merge_audit_log
// written for the audit trail.
//
// Iteration 9d of DB centralization migration:
//   - pending_link_operations read + status update routed through db/linkOps.
//   - server_game_state reads + state MOVE routed through db/merge
//     (loadFullGameStateForMerge, moveGuestDataOntoAuthUser).
//   - profiles archive routed through db/merge (archiveGuestProfile).
//   - guest_identities supersede routed through db/merge (supersedeGuestIdentities).
//   - Reassign of all per-user tables (player_actions, player_progress, etc.)
//     routed through db/guestIdentities#reassignUserData (already used by claim-guest).
//   - merge_receipts insert + merge_audit_log insert routed through db/merge.
//
// Behavior change vs. previous version:
//   - Removed `preference` parameter (was 'keep_guest' | 'keep_google').
//     Auth always wins. No user choice. UI no longer asks.
//   - All per-user table data (player_actions, player_progress, etc.) is
//     reassigned to auth user_id. Previously only server_game_state was touched.
//   - keep_guest path removed entirely (linkGuestProfileToGoogle, persistGuestStateOnSurvivingUser).

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/auth/rateLimiter";
import { verifyAuth } from "@/lib/auth/verifyAuth";
import {
  logRequestIp,
  extractClientIp,
  hashIp,
} from "@/app/api/auth/request-ip-log-helper";
import {
  findLinkOperationById,
  findOtherPendingForGoogle,
  setLinkOperationStatus,
} from "@/lib/db/linkOps";
import {
  loadFullGameStateForMerge,
  moveGuestDataOntoAuthUser,
  archiveGuestProfile,
  supersedeGuestIdentities,
  insertMergeReceipt,
  insertMergeAuditLog,
  type MergeDecisionType,
} from "@/lib/db/merge";
import { reassignUserData } from "@/lib/db/guestIdentities";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // preference is OPTIONAL for backward compatibility with old clients,
    // but IGNORED. Auth always wins.
    const { operationId, idempotencyKey, fingerprintHash } = body as {
      operationId?: string;
      idempotencyKey?: string;
      fingerprintHash?: string;
      preference?: string;
    };

    if (!operationId || !idempotencyKey) {
      return NextResponse.json(
        { error: "operationId and idempotencyKey are required" },
        { status: 400 },
      );
    }

    const auth = await verifyAuth();
    if (!auth.success) return auth.response;

    const rateLimitResponse = await checkRateLimit(
      auth.userId,
      RATE_LIMITS.action,
      "/api/auth/confirm-link",
    );
    if (rateLimitResponse) return rateLimitResponse;

    // Phase 1: log request IP for analytics (correlation only)
    logRequestIp(request, "/api/auth/confirm-link", auth.userId);

    // Phase 1: read IP + UA from request headers for the audit fields
    const realIp = extractClientIp(request.headers);
    const ipHashValue = hashIp(realIp);
    const requestUserAgent = request.headers.get("user-agent") ?? null;

    const anyPending = await findOtherPendingForGoogle(
      auth.userId,
      operationId,
    );

    if (anyPending) {
      return NextResponse.json(
        { error: "Another merge is already pending. Resolve it first." },
        { status: 409 },
      );
    }

    const op = await findLinkOperationById(
      operationId,
      auth.userId,
      idempotencyKey,
    );

    if (!op) {
      return NextResponse.json(
        { error: "Operation not found" },
        { status: 404 },
      );
    }

    if (op.status !== "pending") {
      return NextResponse.json(
        { error: `Operation is ${op.status}` },
        { status: 400 },
      );
    }

    if (new Date(op.expires_at) < new Date()) {
      await setLinkOperationStatus(operationId, "expired");
      return NextResponse.json({ error: "Operation expired" }, { status: 400 });
    }

    // google_user_id is NOT NULL in practice for any pending operation that
    // reaches confirm-link (link-identity only inserts after the OAuth user
    // resolves), but the schema allows null. Guard here to satisfy strict
    // types and fail loudly if a malformed row exists.
    if (!op.google_user_id) {
      return NextResponse.json(
        { error: "Operation missing google_user_id" },
        { status: 400 },
      );
    }
    const googleUserId: string = op.google_user_id;

    const guestState = await loadFullGameStateForMerge(op.guest_user_id);
    const googleState = await loadFullGameStateForMerge(googleUserId);

    // AUTH ALWAYS WINS:
    //   survivingUserId = googleUserId
    //   archivedUserId = op.guest_user_id
    const survivingUserId = googleUserId;
    const archivedUserId = op.guest_user_id;
    const decisionType: MergeDecisionType = "auth_wins";

    // 1. Move server_game_state from guest onto auth user
    //    (or seed fresh if auth had no prior state)
    if (guestState) {
      await moveGuestDataOntoAuthUser(googleUserId, guestState);
    }

    // 2. Reassign all per-user tables (player_actions, player_progress, etc.)
    //    from guest_user_id → googleUserId. Same logic as claim-guest uses.
    await reassignUserData(op.guest_user_id, googleUserId);

    // 3. Mark guest_identities as superseded
    await supersedeGuestIdentities(op.guest_user_id, googleUserId);

    // 4. Archive guest profile (preserve for audit, flip is_guest back to true
    //    if needed so the row reads as a "ghost shell")
    await archiveGuestProfile(op.guest_user_id, googleUserId);

    await setLinkOperationStatus(operationId, "completed");

    const receiptId = await insertMergeReceipt({
      operation_id: operationId,
      kept_user_id: survivingUserId,
      archived_user_id: archivedUserId,
      decision_type: decisionType,
      guest_state_snapshot: guestState?.full_state ?? null,
      google_state_snapshot: googleState?.full_state ?? null,
      risk_score: op.risk_score,
      expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    });

    if (!receiptId) {
      console.error("[ConfirmLink] Failed to create receipt");
    }

    await insertMergeAuditLog({
      merge_receipt_id: receiptId ?? "unknown",
      idempotency_key: idempotencyKey,
      guest_user_id: op.guest_user_id,
      google_user_id: googleUserId,
      preference: decisionType,
      guest_state_before: guestState?.full_state ?? null,
      google_state_before: googleState?.full_state ?? null,
      guest_state_after: null, // guest row no longer has the data
      google_state_after: guestState?.full_state ?? null, // data MOVED here
      merge_result: {
        receiptId: receiptId ?? null,
        survivingUserId,
        decisionType,
      },
      preview_version: op.preview_version,
      risk_score: op.risk_score,
      risk_flags: op.risk_flags ?? [],
      actor_user_id: auth.userId,
      actor_ip_hash: ipHashValue,
      actor_ip_region: null,
      actor_user_agent: requestUserAgent,
      ...(fingerprintHash ? { fingerprint_hash: fingerprintHash } : {}),
    });

    return NextResponse.json({
      success: true,
      preference: decisionType, // kept for backward compat in client/audit
      survivingUserId,
      archivedUserId,
      receiptId: receiptId ?? null,
    });
  } catch (error) {
    console.error("[ConfirmLink] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
