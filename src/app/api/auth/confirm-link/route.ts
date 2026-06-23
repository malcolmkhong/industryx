// Phase 1.5: Confirm the merge transaction
// Single transaction: copy state, link identity, create receipt + audit log.
//
// Iteration 9d of DB centralization migration:
//   - pending_link_operations read + status update routed through db/linkOps.
//   - server_game_state reads + state copy / timestamp touch routed through
//     db/merge (loadFullGameStateForMerge, persistGuestStateOnSurvivingUser,
//     touchGameStateForSurvivingGoogleUser).
//   - profiles guest-flag flip routed through db/merge (linkGuestProfileToGoogle,
//     clearGuestFlagOnProfile).
//   - guest_identities supersede routed through db/merge (supersedeGuestIdentities).
//   - merge_receipts insert + merge_audit_log insert routed through db/merge.
//   - 11 inline .from() calls replaced.

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/auth/rateLimiter';
import { verifyAuth } from '@/lib/auth/verifyAuth';
import { logRequestIp, extractClientIp, hashIp } from '@/app/api/auth/request-ip-log-helper';
import {
  findLinkOperationById,
  findOtherPendingForGoogle,
  setLinkOperationStatus,
} from '@/lib/db/linkOps';
import {
  loadFullGameStateForMerge,
  persistGuestStateOnSurvivingUser,
  touchGameStateForSurvivingGoogleUser,
  linkGuestProfileToGoogle,
  clearGuestFlagOnProfile,
  supersedeGuestIdentities,
  insertMergeReceipt,
  insertMergeAuditLog,
} from '@/lib/db/merge';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { operationId, idempotencyKey, preference, fingerprintHash } = body as {
      operationId?: string;
      idempotencyKey?: string;
      preference?: 'keep_guest' | 'keep_google';
      fingerprintHash?: string;
    };

    if (!operationId || !idempotencyKey || !preference) {
      return NextResponse.json(
        { error: 'operationId, idempotencyKey, and preference are required' },
        { status: 400 }
      );
    }

    if (preference !== 'keep_guest' && preference !== 'keep_google') {
      return NextResponse.json(
        { error: 'Invalid preference. Must be keep_guest or keep_google' },
        { status: 400 }
      );
    }

    const auth = await verifyAuth();
    if (!auth.success) return auth.response;

    const rateLimitResponse = await checkRateLimit(
      auth.userId,
      RATE_LIMITS.action,
      '/api/auth/confirm-link'
    );
    if (rateLimitResponse) return rateLimitResponse;

    // Phase 1: log request IP for analytics (correlation only)
    logRequestIp(request, '/api/auth/confirm-link', auth.userId);

    // Phase 1: read IP + UA from request headers for the audit fields
    const realIp = extractClientIp(request.headers);
    const ipHashValue = hashIp(realIp);
    const requestUserAgent = request.headers.get('user-agent') ?? null;

    const anyPending = await findOtherPendingForGoogle(auth.userId, operationId);

    if (anyPending) {
      return NextResponse.json(
        { error: 'Another merge is already pending. Resolve it first.' },
        { status: 409 }
      );
    }

    const op = await findLinkOperationById(operationId, auth.userId, idempotencyKey);

    if (!op) {
      return NextResponse.json(
        { error: 'Operation not found' },
        { status: 404 }
      );
    }

    if (op.status !== 'pending') {
      return NextResponse.json(
        { error: `Operation is ${op.status}` },
        { status: 400 }
      );
    }

    if (new Date(op.expires_at) < new Date()) {
      await setLinkOperationStatus(operationId, 'expired');
      return NextResponse.json(
        { error: 'Operation expired' },
        { status: 400 }
      );
    }

    // google_user_id is NOT NULL in practice for any pending operation that
    // reaches confirm-link (link-identity only inserts after the OAuth user
    // resolves), but the schema allows null. Guard here to satisfy strict
    // types and fail loudly if a malformed row exists.
    if (!op.google_user_id) {
      return NextResponse.json(
        { error: 'Operation missing google_user_id' },
        { status: 400 }
      );
    }
    const googleUserId: string = op.google_user_id;

    const guestState = await loadFullGameStateForMerge(op.guest_user_id);
    const googleState = await loadFullGameStateForMerge(googleUserId);

    let survivingUserId: string;
    let archivedUserId: string;

    if (preference === 'keep_guest') {
      survivingUserId = op.guest_user_id;
      archivedUserId = googleUserId;

      if (guestState) {
        await persistGuestStateOnSurvivingUser(op.guest_user_id, guestState);
      }

      await linkGuestProfileToGoogle(op.guest_user_id, googleUserId);
      await supersedeGuestIdentities(op.guest_user_id, googleUserId);
    } else {
      survivingUserId = googleUserId;
      archivedUserId = op.guest_user_id;

      if (googleState) {
        await touchGameStateForSurvivingGoogleUser(googleUserId);
      }

      await supersedeGuestIdentities(op.guest_user_id, googleUserId);
      await clearGuestFlagOnProfile(op.guest_user_id);
    }

    await setLinkOperationStatus(operationId, 'completed');

    const receiptId = await insertMergeReceipt({
      operation_id: operationId,
      kept_user_id: survivingUserId,
      archived_user_id: archivedUserId,
      decision_type: preference,
      guest_state_snapshot: guestState?.full_state ?? null,
      google_state_snapshot: googleState?.full_state ?? null,
      risk_score: op.risk_score,
      expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    });

    if (!receiptId) {
      console.error('[ConfirmLink] Failed to create receipt');
    }

    await insertMergeAuditLog({
      merge_receipt_id: receiptId ?? 'unknown',
      idempotency_key: idempotencyKey,
      guest_user_id: op.guest_user_id,
      google_user_id: googleUserId,
      preference,
      guest_state_before: guestState?.full_state ?? null,
      google_state_before: googleState?.full_state ?? null,
      guest_state_after: preference === 'keep_guest' ? guestState?.full_state ?? null : null,
      google_state_after: preference === 'keep_google' ? googleState?.full_state ?? null : guestState?.full_state ?? null,
      merge_result: { receiptId: receiptId ?? null, survivingUserId },
      preview_version: op.preview_version,
      risk_score: op.risk_score,
      risk_flags: op.risk_flags ?? [],
      actor_user_id: auth.userId,
      // Phase 1: pre-existing IP/UA columns — now populated
      actor_ip_hash: ipHashValue,
      actor_ip_region: null, // not in scope for Phase 1
      actor_user_agent: requestUserAgent,
      // Phase 1: new correlation column
      ...(fingerprintHash ? { fingerprint_hash: fingerprintHash } : {}),
    });

    return NextResponse.json({
      success: true,
      preference,
      survivingUserId,
      archivedUserId,
      receiptId: receiptId ?? null,
    });
  } catch (error) {
    console.error('[ConfirmLink] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
