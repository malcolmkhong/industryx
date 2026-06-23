// Phase 1.6: Recover guest account by device_id
// device_id is the PRIMARY recovery signal. Fingerprint is NEVER used for recovery.
//
// Iteration 9: routed through db/guestIdentities.ts.

import { NextRequest, NextResponse } from 'next/server';

import { createServiceRoleClient } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/auth/rateLimiter';
import { logRequestIp } from '@/app/api/auth/request-ip-log-helper';
import {
  findPrimaryIdentityByDevice,
  setIdentityFingerprintIfMissing,
  touchIdentityLastUsed,
} from '@/lib/db/guestIdentities';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { deviceId, fingerprintHash, fingerprint: _fingerprint } = body as {
      deviceId?: string;
      fingerprintHash?: string;
      fingerprint?: string;
    };

    if (!deviceId) {
      return NextResponse.json(
        { error: 'deviceId is required' },
        { status: 400 }
      );
    }

    const supabase = createServiceRoleClient();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Service not configured' },
        { status: 503 }
      );
    }

    const rateLimitResponse = await checkRateLimit(
      deviceId,
      RATE_LIMITS.action,
      '/api/auth/recover-by-device'
    );
    if (rateLimitResponse) return rateLimitResponse;

    // Phase 1: log request IP for analytics (correlation only)
    logRequestIp(request, '/api/auth/recover-by-device', null);

    const identity = await findPrimaryIdentityByDevice(deviceId);
    if (!identity) {
      console.log(
        '[RecoverByDevice] No identity found for device:',
        deviceId
      );
      return NextResponse.json(
        { recovered: false, reason: 'no_identity' },
        { status: 404 }
      );
    }

    if (identity.superseded_at && identity.superseded_by) {
      return NextResponse.json({
        recoveredAs: 'linked_to',
        googleUserId: identity.superseded_by,
        message: 'Device is linked to a Google account',
      });
    }

    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(
      identity.user_id
    );
    if (userError || !userData?.user) {
      return NextResponse.json(
        { recovered: false, reason: 'user_not_found' },
        { status: 404 }
      );
    }

    await touchIdentityLastUsed(identity.user_id, deviceId);

    // Phase 1: if the client provided a fingerprint_hash and the stored
    // row doesn't have one, persist it for correlation.
    if (fingerprintHash && !identity.fingerprint_hash) {
      await setIdentityFingerprintIfMissing(
        identity.user_id,
        deviceId,
        fingerprintHash
      );
    }

    return NextResponse.json({
      recovered: true,
      recoveredAs: 'recovered',
      userId: identity.user_id,
      fingerprintHash: identity.fingerprint_hash ?? fingerprintHash ?? null,
      message: 'Recovery signal confirmed. Session establishment requires client-side flow.',
    });
  } catch (error) {
    console.error('[RecoverByDevice] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
