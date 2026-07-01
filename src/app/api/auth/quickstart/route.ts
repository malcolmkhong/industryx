/**
 * POST /api/auth/quickstart
 *
 * Combined guest account creation: creates an anonymous Supabase Auth user AND
 * initializes the game state in a single server-side call.
 *
 * Eliminates the browser → Supabase Auth round-trip (~800ms) that was previously
 * required by `signInAnonymously()` before `initializeGuest()` could fire.
 *
 * For returning users (session exists): use the normal startup flow instead.
 * For new guest users: this endpoint handles everything.
 */

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
import { createHash } from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { deviceId, fingerprint, existingUserId } = body as {
      deviceId?: string;
      fingerprint?: string;
      existingUserId?: string;
    };

    if (!deviceId) {
      return NextResponse.json({ error: 'deviceId is required' }, { status: 400 });
    }

    logRequestIp(request, '/api/auth/quickstart', null);

    const supabase = createServiceRoleClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Service not configured' }, { status: 503 });
    }

    // Rate limit by device ID (best-effort; fail-open)
    const rateLimitResponse = await checkRateLimit(
      deviceId,
      RATE_LIMITS.action,
      '/api/auth/quickstart'
    );
    if (rateLimitResponse) return rateLimitResponse;

    // Capacity check
    const capacity = await getCapacityStatus();
    if (capacity.status === 'full') {
      return NextResponse.json({ error: 'capacity_full', redirect: '/waitlist' }, { status: 503 });
    }

    if (!isServerGameStateAvailable()) {
      return NextResponse.json({ error: 'Service not configured' }, { status: 503 });
    }

    let userId: string;

    if (existingUserId) {
      // Recovery path: reuse the existing user instead of creating a new one
      const { data: existingUser, error: fetchError } = await supabase.auth.admin.getUserById(existingUserId);
      if (fetchError || !existingUser?.user) {
        return NextResponse.json({ error: 'recovered_user_not_found' }, { status: 404 });
      }
      userId = existingUserId;
    } else {
      // New guest: create anonymous user via Supabase Admin API
      // This bypasses the browser → Supabase Auth round-trip (~800ms saved)
      const anonEmail = `${crypto.randomUUID()}@guest.industryx.game`;
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: anonEmail,
        email_confirm: true,
        user_metadata: { device_id: deviceId, is_anonymous: true },
      });

      if (createError || !newUser?.user) {
        console.error('[quickstart] Failed to create anon user:', createError);
        return NextResponse.json({ error: 'account_creation_failed' }, { status: 500 });
      }
      userId = newUser.user.id;
    }

    // Check if already initialized (idempotent)
    if (await hasServerGameState(userId)) {
      return NextResponse.json({ initialized: false, reason: 'state_exists', userId });
    }

    // Initialize game state
    const initialState = await initializeGuestGameState(userId);
    if (!initialState) {
      return NextResponse.json({ error: 'state_insert_failed' }, { status: 500 });
    }

    // Insert guest identity (skip for recovered users — identity already exists)
    if (!existingUserId && !(await hasIdentityForUserAndDevice(userId, deviceId))) {
      if (!(await hasAnyIdentityForUser(userId))) {
        const newIdentity = await insertGuestIdentity({
          user_id: userId,
          device_id: deviceId,
          fingerprint: fingerprint ?? '',
          fingerprint_hash: fingerprint
            ? createHash('sha256').update(fingerprint).digest('hex')
            : null,
          is_primary: true,
        });
        if (!newIdentity) {
          return NextResponse.json({ error: 'guest_identity_insert_failed' }, { status: 500 });
        }
      }
    }

    return NextResponse.json({
      initialized: true,
      userId,
      fingerprintHash: fingerprint
        ? createHash('sha256').update(fingerprint).digest('hex')
        : null,
    });
  } catch (error) {
    console.error('[quickstart] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
