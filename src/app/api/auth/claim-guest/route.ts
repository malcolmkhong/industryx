// src/app/api/auth/claim-guest/route.ts
// Phase 1.6 follow-up: Re-attach a previously-orphaned guest's data to a new
// anonymous identity, when the user has cleared cookies and re-signed-in
// anonymously. The new anon user takes over the device_id's prior data.
//
// FIX (AUDIT_FIXES_2026_06_18.md P0-#2): The previous `recover-by-device`
// endpoint returned success but couldn't establish a session for the old
// anon user (Supabase doesn't expose `createSession` for anon users). The
// result: users who cleared cookies saw a "recovery" but had no valid session
// and lost their game state.
//
// This endpoint solves it by:
//   1. Client signs in anonymously (creates a fresh auth.users row, is_anonymous=true)
//   2. Client calls POST /api/auth/claim-guest with { newUserId, deviceId }
//   3. Server finds the old guest identity by device_id
//   4. Server re-assigns per-user tables from old -> new
//   5. Server marks the old guest identity as superseded
//   6. Server creates a fresh primary guest_identity for the new user
//
// LIMITATIONS:
//   - The old anon user row remains in auth.users (orphaned). It cannot be
//     deleted via the REST API. Run a periodic cleanup SQL to remove old
//     anonymous users that have no linked accounts and no game state.
//   - If two devices claim the same device_id concurrently, the second
//     request may see "no_guest_found" — the first wins. This is the safer
//     default. Clients should retry with the response from recover-by-device.
//   - The old `server_game_state.state_version` is preserved on the new row
//     so conflict detection in /api/game/state keeps working.
//
// Iteration 9 of DB centralization migration:
//   - guest_identities lookup + supersede + insert routed through
//     db/guestIdentities.
//   - 7-table user_id reassign routed through db/guestIdentities#reassignUserData.
//   - profiles.is_guest flag update routed through db/profiles (new helper).
//   - server_game_state.is_locked check routed through db/serverGameState.

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/auth/rateLimiter';
import { logRequestIp } from '@/app/api/auth/request-ip-log-helper';
import { loadLockState } from '@/lib/db/serverGameState';
import {
  findPrimaryIdentityByDevice,
  insertGuestIdentity,
  markIdentitySuperseded,
  reassignUserData,
} from '@/lib/db/guestIdentities';
import { markProfileAsGuest } from '@/lib/db/profiles';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { newUserId, deviceId } = body as {
      newUserId?: string;
      deviceId?: string;
    };

    if (!newUserId) {
      return NextResponse.json(
        { error: 'newUserId is required (the new anon user id)' },
        { status: 400 }
      );
    }
    if (!deviceId) {
      return NextResponse.json(
        { error: 'deviceId is required' },
        { status: 400 }
      );
    }

    // Basic UUID sanity check on newUserId to avoid injection-y nonsense
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRe.test(newUserId)) {
      return NextResponse.json(
        { error: 'newUserId must be a valid UUID' },
        { status: 400 }
      );
    }

    // Rate-limit by deviceId (not newUserId — that hasn't authenticated yet)
    const rateLimitResponse = await checkRateLimit(
      deviceId,
      RATE_LIMITS.action,
      '/api/auth/claim-guest'
    );
    if (rateLimitResponse) return rateLimitResponse;

    // Phase 1: log request IP for analytics (correlation only)
    logRequestIp(request, '/api/auth/claim-guest', newUserId);

    // 1. Find the old guest identity by device_id
    const oldIdentity = await findPrimaryIdentityByDevice(deviceId);

    if (!oldIdentity) {
      return NextResponse.json(
        { claimed: false, reason: 'no_guest_found' },
        { status: 404 }
      );
    }

    if (oldIdentity.user_id === newUserId) {
      // Already claimed by this user — idempotent success
      return NextResponse.json({
        claimed: true,
        reason: 'already_claimed',
      });
    }

    const oldUserId = oldIdentity.user_id;
    const oldIdentityId = oldIdentity.id;

    // Phase 3: refuse re-claim if old user_id is locked (Google-anchored enforcement).
    // This is the canonical fix for the E1 risk in the 2026-06-18 audit:
    // a banned guest-only user can no longer clear cookies and re-claim via
    // claim-guest. The lock authority is server_game_state.is_locked.
    // (Delegated to @/lib/db/serverGameState.)
    if (await loadLockState(oldUserId)) {
      return NextResponse.json(
        { error: 'Previous account is locked', code: 'previous_account_locked' },
        { status: 403 }
      );
    }

    // 2. Re-assign per-user tables from oldUserId -> newUserId
    //    We use individual updates per table (not a single transaction) so a
    //    failure in one table doesn't block the others. Each is idempotent.
    const reassignResults = await reassignUserData(oldUserId, newUserId);

    // 3. Mark the old guest identity as superseded
    if (oldIdentityId) {
      await markIdentitySuperseded(oldIdentityId, newUserId);
    }

    // 4. Create a new primary guest identity for the new user with the same
    //    device_id. This is what recover-by-device will return on next call.
    const newIdentity = await insertGuestIdentity({
      user_id: newUserId,
      device_id: deviceId,
      fingerprint: '',
      fingerprint_hash: oldIdentity.fingerprint_hash ?? null,
      is_primary: true,
      claimed_at: new Date().toISOString(),
    });

    if (!newIdentity) {
      // Likely a unique-constraint race; non-fatal — the user can still play
      console.warn('[ClaimGuest] Failed to create new identity row');
    }

    // 5. Update profile: the new user becomes a guest
    await markProfileAsGuest(newUserId);

    console.log(
      `[ClaimGuest] Reassigned from old=${oldUserId} to new=${newUserId} on deviceId=${deviceId.slice(0, 8)}…`
    );

    // Shape the per-table report as the route's public response shape
    // (matches the prior { table: { ok, rows, error? } } map).
    const reassigned: Record<string, { ok: boolean; rows: number; error?: string }> = {};
    for (const r of reassignResults) {
      reassigned[r.table] = { ok: r.ok, rows: r.rows, ...(r.error ? { error: r.error } : {}) };
    }

    return NextResponse.json({
      claimed: true,
      oldUserId,
      newUserId,
      deviceId,
      reassigned,
    });
  } catch (error) {
    console.error('[ClaimGuest] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
