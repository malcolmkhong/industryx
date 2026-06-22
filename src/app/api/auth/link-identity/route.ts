// Phase 1.4: Link anonymous guest to Google account
// Creates a pending_link_operations row for the merge dialog.
// The actual merge happens in /api/auth/confirm-link.
//
// FIX (AUDIT_FIXES_2026_06_18.md P0-#3): Accept `deviceId` in the request body
// as a fallback when the `factory-dominion-guest-uid` cookie is missing (e.g.,
// user cleared cookies before signing in with Google). The deviceId is used to
// query `guest_identities` for the prior guest identity, preventing silent
// data loss for the guest's progress.

import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

import { createServiceRoleClient } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/auth/rateLimiter';
import { loadServerGameStateForPreview } from '@/lib/db/serverGameState';
import { verifyAuth } from '@/lib/auth/verifyAuth';
import { logRequestIp } from '@/app/api/auth/request-ip-log-helper';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { idempotencyKey, deviceId, fingerprintHash, userAgent } = body as {
      idempotencyKey?: string;
      deviceId?: string;
      fingerprintHash?: string;
      userAgent?: string;
    };

    if (!idempotencyKey) {
      return NextResponse.json(
        { error: 'idempotencyKey is required' },
        { status: 400 }
      );
    }

    const auth = await verifyAuth();
    if (!auth.success) return auth.response;

    if (auth.email === undefined) {
      return NextResponse.json(
        { error: 'Google authentication required (email-based identity)' },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkRateLimit(
      auth.userId,
      RATE_LIMITS.action,
      '/api/auth/link-identity'
    );
    if (rateLimitResponse) return rateLimitResponse;

    // Phase 1: log request IP for analytics (correlation only)
    logRequestIp(request, '/api/auth/link-identity', auth.userId);

    // Phase 1: read IP + UA from request headers for the audit fields
    const { hashIp, extractClientIp } = await import('@/app/api/auth/request-ip-log-helper');
    const realIp = extractClientIp(request.headers);
    const ipHashValue = hashIp(realIp);
    const requestUserAgent = userAgent ?? request.headers.get('user-agent') ?? null;

    const supabase = createServiceRoleClient();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Service not configured' },
        { status: 503 }
      );
    }

    const cookieStore = await cookies();
    console.log(
  '[LinkIdentity] cookie guest uid:',
  cookieStore.get('factory-dominion-guest-uid')?.value
);
    let guestUserId = cookieStore.get('factory-dominion-guest-uid')?.value;

    // Fallback: if the cookie is missing (e.g., user cleared cookies), try to
    // find the prior guest by deviceId in `guest_identities`. This prevents
    // silent data loss for guest progress when the user re-signs-in with Google
    // on the same device after clearing cookies.
    if (!guestUserId && deviceId) {
      const { data: identityByDevice } = await supabase
        .from('guest_identities')
        .select('user_id, is_primary')
        .eq('device_id', deviceId)
        .eq('is_primary', true)
        .maybeSingle();

      if (identityByDevice?.user_id && identityByDevice.user_id !== auth.userId) {
        guestUserId = identityByDevice.user_id;
      }
    }

    if (!guestUserId || guestUserId === auth.userId) {
      return NextResponse.json({
        linked: true,
        reason: 'no_guest_to_link',
      });
    }

    const { data: existingOp } = await supabase
      .from('pending_link_operations')
      .select('id, status, expires_at')
      .eq('idempotency_key', idempotencyKey)
      .eq('google_user_id', auth.userId)
      .single();

    if (existingOp && existingOp.status === 'pending') {
      if (new Date(existingOp.expires_at) > new Date()) {
        return NextResponse.json({
          conflict: true,
          operationId: existingOp.id,
          message: 'Existing pending operation',
        });
      }
      await supabase
        .from('pending_link_operations')
        .update({ status: 'expired', completed_at: new Date().toISOString() })
        .eq('id', existingOp.id);
    }

    const guestState = await loadServerGameStateForPreview(guestUserId);

    const googleState = await loadServerGameStateForPreview(auth.userId);

    if (guestState?.is_locked) {
      return NextResponse.json(
        { error: 'Guest account is locked' },
        { status: 403 }
      );
    }

    // Phase 3: refuse link if Google user_id is locked. Closes the E8 risk
    // from the 2026-06-18 audit: a Google-locked user could re-link from a
    // new device. Lock authority is server_game_state.is_locked.
    if (googleState?.is_locked === true) {
      return NextResponse.json(
        { error: 'Account is locked', code: 'account_locked' },
        { status: 403 }
      );
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, is_guest')
      .eq('id', guestUserId)
      .single();

    const { data: googleProfile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', auth.userId)
      .single();

    const previewVersion = {
      guest: {
        user_id: guestUserId,
        display_name: profile?.display_name ?? 'Guest',
        money: guestState?.money ?? 0,
        total_money_earned: guestState?.total_money_earned ?? 0,
        game_tick: guestState?.game_tick ?? 0,
        buildings_count: guestState?.buildings_count ?? 0,
        is_guest: true,
      },
      google: {
        user_id: auth.userId,
        display_name: googleProfile?.display_name ?? auth.email?.split('@')[0] ?? 'Commander',
        money: googleState?.money ?? 0,
        total_money_earned: googleState?.total_money_earned ?? 0,
        game_tick: googleState?.game_tick ?? 0,
        buildings_count: googleState?.buildings_count ?? 0,
        is_guest: false,
      },
    };

    const riskScore = Math.min(
      100,
      Math.floor(
        (Number(guestState?.total_money_earned ?? 0) +
          Number(googleState?.total_money_earned ?? 0)) /
          100000
      )
    );

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { data: operation, error: opError } = await supabase
      .from('pending_link_operations')
      .insert({
        guest_user_id: guestUserId,
        google_user_id: auth.userId,
        idempotency_key: idempotencyKey,
        status: 'pending',
        risk_score: riskScore,
        risk_flags: [],
        preview_version: previewVersion,
        expires_at: expiresAt,
        // Phase 1: correlation fields (never used for enforcement)
        ...(fingerprintHash ? { fingerprint_hash: fingerprintHash } : {}),
        ...(deviceId ? { device_id: deviceId } : {}),
        // Pre-existing IP/UA columns — now populated
        ip_hash: ipHashValue,
        ip_region: null, // not in scope for Phase 1
        user_agent: requestUserAgent,
      })
      .select('id')
      .single();

    if (opError || !operation) {
      console.error('[LinkIdentity] Failed to create operation:', opError);
      return NextResponse.json(
        { error: 'Failed to create merge operation' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      conflict: true,
      operationId: operation.id,
      preview: previewVersion,
      riskScore,
      expiresAt,
    });
  } catch (error) {
    console.error('[LinkIdentity] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
