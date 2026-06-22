// Phase 1.6: Recover guest account by device_id
// device_id is the PRIMARY recovery signal. Fingerprint is NEVER used for recovery.

import { NextRequest, NextResponse } from 'next/server';

import { createServiceRoleClient } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/auth/rateLimiter';
import { logRequestIp } from '@/app/api/auth/request-ip-log-helper';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { deviceId, fingerprintHash, fingerprint } = body as {
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

    const { data: identity } = await supabase
      .from('guest_identities')
      .select('user_id, fingerprint_hash, superseded_at, superseded_by, is_primary')
      .eq('device_id', deviceId)
      .eq('is_primary', true)
      .single();

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

    // Phase 1.6 NOTE: Supabase does not expose createSession for anon users.
    // The client will use this response to know the recovery was possible,
    // and the actual session creation requires a client-side flow.
    // For anon users, this means the recovery returns the userId but
    // the client must then establish a session via signInAnonymously
    // and then merge the identity. This is a known limitation.
    // For Phase 1, we return the recovered user info and the client
    // can store it as a hint. Full recovery requires Phase 1.5+ work
    // or a custom JWT approach.

    await supabase
      .from('guest_identities')
      .update({ last_used_at: new Date().toISOString() })
      .eq('user_id', identity.user_id)
      .eq('device_id', deviceId);

    // Phase 1: if the client provided a fingerprint_hash and the stored
    // row doesn't have one, persist it for correlation.
    // (This is best-effort; never used for recovery denial.)
    if (fingerprintHash && !identity.fingerprint_hash) {
      await supabase
        .from('guest_identities')
        .update({ fingerprint_hash: fingerprintHash })
        .eq('user_id', identity.user_id)
        .eq('device_id', deviceId);
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
