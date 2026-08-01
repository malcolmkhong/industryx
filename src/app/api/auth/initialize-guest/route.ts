// Phase 1.3: Initialize guest profile + server_game_state + device mapping
// Called after signInAnonymously completes.

import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

import { createServiceRoleClient } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/auth/rateLimiter';
import { getCapacityStatus } from '@/lib/capacity';
import { logRequestIp } from '@/app/api/auth/request-ip-log-helper';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { deviceId, fingerprint } = body as {
      deviceId?: string;
      fingerprint?: string;
    };

    if (!deviceId) {
      return NextResponse.json(
        { error: 'deviceId is required' },
        { status: 400 }
      );
    }

    // Phase 1: log request IP for analytics (correlation only)
    logRequestIp(request, '/api/auth/initialize-guest', null);

    const supabase = createServiceRoleClient();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Service not configured' },
        { status: 503 }
      );
    }

console.log(
  '[InitializeGuest] Authorization:',
  request.headers.get('authorization')
);

const accessToken =
  request.headers.get('authorization')?.replace('Bearer ', '') ?? '';

const {
  data: { user },
  error: authError,
} = await supabase.auth.getUser(accessToken);

console.log('[InitializeGuest] Auth result:', {
  hasUser: !!user,
  authError: authError?.message,
});

if (authError || !user) {
  return NextResponse.json(
    { error: 'Unauthorized' },
    { status: 401 }
  );
}

    const rateLimitResponse = await checkRateLimit(
      user.id,
      RATE_LIMITS.action,
      '/api/auth/initialize-guest'
    );
    if (rateLimitResponse) return rateLimitResponse;

    // Capacity check — reject new guest signups at MAX_TOTAL_PLAYERS
    // Idempotent: the auth.users row from signInAnonymously stays, but no game state is created.
    // Client redirects to /waitlist on this signal.
    const capacity = await getCapacityStatus();
    if (capacity.status === 'full') {
      return NextResponse.json(
        { error: 'capacity_full', redirect: '/waitlist' },
        { status: 503 }
      );
    }

    const { data: existingState } = await supabase
      .from('server_game_state')
      .select('user_id')
      .eq('user_id', user.id)
      .single();

    if (existingState) {
      return NextResponse.json({ initialized: false, reason: 'state_exists' });
    }

    await supabase.from('server_game_state').insert({
      user_id: user.id,
      money: 1000,
      total_money_earned: 1000,
      research_points: 0,
      buildings: [],
      buildings_count: 0,
      completed_research: [],
      resources: {},
      workers: [],
      game_tick: 0,
      game_speed: 1,
      is_locked: false,
      cheat_flag_count: 0,
    });

    const { data: existingIdentity } = await supabase
      .from('guest_identities')
      .select('id')
      .eq('user_id', user.id)
      .eq('device_id', deviceId)
      .single();

    if (!existingIdentity) {
      const { data: anyIdentity } = await supabase
        .from('guest_identities')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!anyIdentity) {
console.log('[InitializeGuest] Creating guest identity', {
  userId: user.id,
  deviceId,
});

const { error: insertError } = await supabase
  .from('guest_identities')
  .insert({
    user_id: user.id,
    device_id: deviceId,
    fingerprint: fingerprint ?? '',
    fingerprint_hash: fingerprint
      ? createHash('sha256').update(fingerprint).digest('hex')
      : null,
    is_primary: true,
  });

console.log(
  '[InitializeGuest] guest_identities insert error:',
  insertError
);

if (insertError) {
  return NextResponse.json(
    {
      error: 'guest_identity_insert_failed',
      details: insertError.message,
    },
    { status: 500 }
  );
}

console.log('[InitializeGuest] Guest identity created successfully');
      }
    }

    return NextResponse.json({
      initialized: true,
      fingerprintHash: fingerprint
        ? createHash('sha256').update(fingerprint).digest('hex')
        : null,
    });
  } catch (error) {
    console.error('[InitializeGuest] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
