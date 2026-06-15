// Phase 1.4: Link anonymous guest to Google account
// Creates a pending_link_operations row for the merge dialog.
// The actual merge happens in /api/auth/confirm-link.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/auth/rateLimiter';
import { verifyAuth } from '@/lib/auth/verifyAuth';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { idempotencyKey } = body as { idempotencyKey?: string };

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

    const supabase = createServiceRoleClient();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Service not configured' },
        { status: 503 }
      );
    }

    const cookieStore = await cookies();
    const guestUserId = cookieStore.get('factory-dominion-guest-uid')?.value;

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

    const { data: guestState } = await supabase
      .from('server_game_state')
      .select('money, total_money_earned, buildings_count, game_tick, is_locked')
      .eq('user_id', guestUserId)
      .single();

    const { data: googleState } = await supabase
      .from('server_game_state')
      .select('money, total_money_earned, buildings_count, game_tick, is_locked')
      .eq('user_id', auth.userId)
      .single();

    if (guestState?.is_locked) {
      return NextResponse.json(
        { error: 'Guest account is locked' },
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
