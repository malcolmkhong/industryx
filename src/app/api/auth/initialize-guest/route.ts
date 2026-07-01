// Phase 1.3: Initialize guest profile + server_game_state + device mapping
// Called after signInAnonymously completes.
//
// Iteration 9 of DB centralization migration:
//   - guest_identities insert routed through db/guestIdentities (raw
//     fingerprint + computed fingerprint_hash).
//   - server_game_state availability check routed through db/serverGameState.
//   - The two existence-check reads on server_game_state + guest_identities
//     remain inline because they're one-off shape checks, not CRUD patterns
//     that justify a dedicated helper.

import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

import { createServiceRoleClient } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/auth/rateLimiter';
import { getCapacityStatus } from '@/lib/capacity';
import { logRequestIp } from '@/app/api/auth/request-ip-log-helper';
import {
  isServerGameStateAvailable,
  hasServerGameState,
  initializeGuestGameState,
} from '@/lib/db/serverGameState';
import {
  insertGuestIdentity,
  hasIdentityForUserAndDevice,
  hasAnyIdentityForUser,
} from '@/lib/db/guestIdentities';

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

    const accessToken =
      request.headers.get('authorization')?.replace('Bearer ', '') ?? '';

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(accessToken);

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

    // server_game_state availability check preserves prior 503 behavior.
    if (!(await isServerGameStateAvailable())) {
      return NextResponse.json(
        { error: 'Service not configured' },
        { status: 503 }
      );
    }

    if (await hasServerGameState(user.id)) {
      return NextResponse.json({ initialized: false, reason: 'state_exists' });
    }

    const initialState = await initializeGuestGameState(user.id);
    if (!initialState) {
      return NextResponse.json(
        { error: 'state_insert_failed' },
        { status: 500 }
      );
    }

    if (!(await hasIdentityForUserAndDevice(user.id, deviceId))) {
      if (!(await hasAnyIdentityForUser(user.id))) {
        const newIdentity = await insertGuestIdentity({
          user_id: user.id,
          device_id: deviceId,
          fingerprint: fingerprint ?? '',
          fingerprint_hash: fingerprint
            ? createHash('sha256').update(fingerprint).digest('hex')
            : null,
          is_primary: true,
        });

        if (!newIdentity) {
          return NextResponse.json(
            { error: 'guest_identity_insert_failed' },
            { status: 500 }
          );
        }
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
