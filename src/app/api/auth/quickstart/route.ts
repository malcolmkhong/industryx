/**
 * POST /api/auth/quickstart
 *
 * SINGLE entry point for all anonymous (guest) startup flows. Consolidates:
 *   - Device-ID primary lookup
 *   - Fingerprint secondary lookup (for cookies/localStorage cleared devices)
 *   - User creation when neither matches
 *   - Guest identity upsert
 *   - Game state initialization (new users only — reused users keep their state)
 *
 * Response:
 *   { userId, source: 'deviceId' | 'fingerprint' | 'fresh' }
 *
 *   source lets the client log / telemetry decide how the user was resolved.
 *
 * Removed endpoints (now subsumed):
 *   - /api/auth/recover-by-device (its logic is in step 1+2)
 *   - /api/auth/claim-guest (its logic is in the identity upsert path)
 *
 * Session establishment (Supabase Auth):
 *   This route does NOT create a Supabase session. The browser has no session
 *   for anon users; the game runs on localStorage-backed Zustand. Cloud sync
 *   attempts will fail gracefully. OAuth users establish sessions via the
 *   callback route (exchangeCodeForSession).
 */

import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/auth/rateLimiter";
import { getCapacityStatus } from "@/lib/capacity";
import { logRequestIp } from "@/app/api/auth/request-ip-log-helper";
import {
  isServerGameStateAvailable,
  hasServerGameState,
  initializeGuestGameState,
} from "@/lib/db/serverGameState";
import {
  findUserByDeviceId,
  findUserByFingerprint,
  hasIdentityForUserAndDevice,
  hasAnyIdentityForUser,
  insertGuestIdentity,
  setIdentityFingerprintIfMissing,
  touchIdentityLastUsed,
} from "@/lib/db/guestIdentities";

type Source = "deviceId" | "fingerprint" | "fresh";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { deviceId, fingerprint } = body as {
      deviceId?: string;
      fingerprint?: string;
    };

    if (!deviceId) {
      return NextResponse.json(
        { error: "deviceId is required" },
        { status: 400 },
      );
    }
    if (!fingerprint || fingerprint === "unknown") {
      return NextResponse.json(
        { error: 'fingerprint is required and must not be "unknown"' },
        { status: 400 },
      );
    }

    logRequestIp(request, "/api/auth/quickstart", null);

    const supabase = createServiceRoleClient();
    if (!supabase) {
      return NextResponse.json(
        { error: "Service not configured" },
        { status: 503 },
      );
    }

    // Rate limit by deviceId (best-effort; fail-open)
    const rateLimitResponse = await checkRateLimit(
      deviceId,
      RATE_LIMITS.action,
      "/api/auth/quickstart",
    );
    if (rateLimitResponse) return rateLimitResponse;

    // Capacity check
    const capacity = await getCapacityStatus();
    if (capacity.status === "full") {
      return NextResponse.json(
        { error: "capacity_full", redirect: "/waitlist" },
        { status: 503 },
      );
    }

    if (!isServerGameStateAvailable()) {
      return NextResponse.json(
        { error: "Service not configured" },
        { status: 503 },
      );
    }

    const fingerprintHash = createHash("sha256")
      .update(fingerprint)
      .digest("hex");

    // ────────────────────────────────────────────────────────────────
    // STEP 1: primary match by deviceId
    // ────────────────────────────────────────────────────────────────
    let userId: string | null = null;
    let source: Source = "fresh";

    const deviceMatch = await findUserByDeviceId(deviceId);
    if (deviceMatch?.user_id) {
      userId = deviceMatch.user_id;
      source = "deviceId";
    }

    // ────────────────────────────────────────────────────────────────
    // STEP 2: secondary match by fingerprint (only if deviceId didn't match)
    //   The unique partial index on guest_identities(fingerprint) WHERE
    //   superseded_by IS NULL ensures we find at most one active user.
    // ────────────────────────────────────────────────────────────────
    if (!userId) {
      const fpMatch = await findUserByFingerprint(fingerprint);
      if (fpMatch?.user_id) {
        userId = fpMatch.user_id;
        source = "fingerprint";
      }
    }

    // ────────────────────────────────────────────────────────────────
    // STEP 3: create new user if neither matched
    // ────────────────────────────────────────────────────────────────
    let isNewUser = false;
    if (!userId) {
      const anonEmail = `${crypto.randomUUID()}@guest.industryx.game`;
      const { data: newUser, error: createError } =
        await supabase.auth.admin.createUser({
          email: anonEmail,
          email_confirm: true,
          // user_metadata is consumed by handle_new_user() trigger (migration 055):
          //   - device_id: passed through for any downstream reads
          //   - fingerprint: written into profiles.device_fingerprint
          user_metadata: {
            device_id: deviceId,
            fingerprint,
            is_anonymous: true,
          },
        });

      if (createError || !newUser?.user) {
        console.error("[quickstart] Failed to create anon user:", createError);
        return NextResponse.json(
          { error: "account_creation_failed" },
          { status: 500 },
        );
      }
      userId = newUser.user.id;
      isNewUser = true;
      source = "fresh";
    }

    // ────────────────────────────────────────────────────────────────
    // STEP 4: initialize game state for new users only
    //   (Reused users already have server_game_state from previous visits.)
    // ────────────────────────────────────────────────────────────────
    if (isNewUser) {
      if (!(await hasServerGameState(userId))) {
        const initial = await initializeGuestGameState(userId);
        if (!initial) {
          return NextResponse.json(
            { error: "state_insert_failed" },
            { status: 500 },
          );
        }
      }
    }

    // ────────────────────────────────────────────────────────────────
    // STEP 5: register / update guest_identity (the (user_id, device_id) pair)
    //
    //   Decision: only register an active identity when this user_id has
    //   NO existing identity elsewhere. Otherwise we touch the existing one
    //   and only set fingerprint on first-sight. This matches the OAuth
    //   register-device behavior (skips insert if user has any identity).
    //
    //   Rationale: if a fingerprint-reuse user already has identities on
    //   other devices, those identities already anchor that user. Adding
    //   a 2nd active identity on this device could undermine the unique
    //   partial index in migration 054. Touch is the safe path.
    // ────────────────────────────────────────────────────────────────
    const hasThisDeviceIdentity = await hasIdentityForUserAndDevice(
      userId,
      deviceId,
    );

    if (hasThisDeviceIdentity) {
      await touchIdentityLastUsed(userId, deviceId);
      // Persist fingerprint hash if we now know it (first-sight for this device).
      await setIdentityFingerprintIfMissing(userId, deviceId, fingerprintHash);
    } else {
      // User has no identity on THIS device. Consider registering.
      const userHasAnyIdentity = await hasAnyIdentityForUser(userId);
      if (!userHasAnyIdentity) {
        // Brand new user (just created in step 3) — primary identity.
        const inserted = await insertGuestIdentity({
          user_id: userId,
          device_id: deviceId,
          fingerprint,
          fingerprint_hash: fingerprintHash,
          is_primary: true,
        });
        if (!inserted) {
          return NextResponse.json(
            { error: "guest_identity_insert_failed" },
            { status: 500 },
          );
        }
      }
      // else: user has identity on another device → skip insert.
      // (The (user_id, device_id) pair is already "owned" by the auth user.)
      // The user can still play on this device; recovery by fingerprint
      // works because their fingerprint matches the existing identity.
    }

    return NextResponse.json({
      userId,
      source,
      isNewUser,
    });
  } catch (error) {
    console.error("[quickstart] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
