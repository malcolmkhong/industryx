/**
 * POST /api/auth/guest/quickstart
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
 * Removed endpoints (now subsumed into this single round-trip):
 *   - /api/auth/recover-by-device
 *   - /api/auth/claim-guest
 *
 * Both flows were never deployed as standalone routes — their work is
 * what step 1+2 (device lookup) and the identity upsert below accomplish.
 *
 * Session establishment (Supabase Auth):
 *   This route does NOT create a Supabase session. The browser has no session
 *   for anon users; the game runs on localStorage-backed Zustand. Cloud sync
 *   attempts will fail gracefully. OAuth users establish sessions via the
 *   callback route (exchangeCodeForSession).
 */

import { createHash } from "crypto";
import { NextResponse, type NextRequest } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/auth/rateLimiter";
import { getCapacityStatus } from "@/lib/capacity";
import { logRequestIp } from "@/app/api/auth/_shared/request-ip-log-helper";
import { logFingerprintEvent } from "@/lib/db/fingerprint-events";
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

/**
 * Sentinel sent by the client when the browser could not produce a fingerprint.
 * Distinct from the legacy literal "unknown" (still rejected with 400) — this
 * value tells the route "I know fingerprint is missing, fall through to
 * deviceId-only dedupe and mark the profile as fingerprint_status='unavailable'".
 */
const FINGERPRINT_UNAVAILABLE_SENTINEL = "__fingerprint_unavailable__";

type Source = "deviceId" | "fingerprint" | "fresh";

/**
 * Test/development deviceId prefixes. When matched, the account is flagged
 * `is_test=true` on profiles and gets cleaned up after 1 day instead of 30.
 * Centralized here so the cleanup policy (migration 062) and detection stay
 * in sync.
 */
const TEST_DEVICE_PREFIX_RE =
  /^(it-|fp-test-|recover-test-|revisit-|quickstart-fp-|pw-test-)/i;

function looksLikeTestDevice(deviceId: string): boolean {
  return TEST_DEVICE_PREFIX_RE.test(deviceId);
}

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
    // Accept either a real fingerprint, the unavailable sentinel, or any
    // non-"unknown" value. The legacy literal "unknown" (SSR-only) is
    // still rejected to keep the contract clear.
    if (!fingerprint || fingerprint === "unknown") {
      return NextResponse.json(
        { error: 'fingerprint is required and must not be "unknown"' },
        { status: 400 },
      );
    }
    const fingerprintUnavailable =
      fingerprint === FINGERPRINT_UNAVAILABLE_SENTINEL;

    logRequestIp(request, "/api/auth/guest/quickstart", null);

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
      "/api/auth/guest/quickstart",
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

    const fingerprintHash = fingerprintUnavailable
      ? null
      : createHash("sha256").update(fingerprint).digest("hex");

    // ────────────────────────────────────────────────────────────────
    // STEP 1: primary match by deviceId (works with or without fingerprint)
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
    //   Skipped when the client sent the unavailable sentinel — there is
    //   no real fingerprint to match against.
    // ────────────────────────────────────────────────────────────────
    if (!userId && !fingerprintUnavailable) {
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
          //     (skipped when sentinel — no real fingerprint to store)
          user_metadata: {
            device_id: deviceId,
            ...(fingerprintUnavailable
              ? { fingerprint_unavailable: true }
              : { fingerprint }),
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
    // STEP 4b: mark test/development accounts.
    //   Idempotent: setting is_test=true on an already-true profile is a no-op.
    //   Future cleanup (migration 062) deletes test accounts after 1 day.
    // ────────────────────────────────────────────────────────────────
    if (looksLikeTestDevice(deviceId)) {
      await supabase
        .from("profiles")
        .update({ is_test: true })
        .eq("id", userId);
    }

    // ────────────────────────────────────────────────────────────────
    // STEP 4c: bump profiles.last_active for the cleanup policy.
    //   (Tier 1 fix 4: the column exists but was never written.)
    //   Best-effort: failure does not block the request.
    // ────────────────────────────────────────────────────────────────
    await supabase
      .from("profiles")
      .update({ last_active: new Date().toISOString() })
      .eq("id", userId);

    // ────────────────────────────────────────────────────────────────
    // STEP 4d: mark fingerprint_status when sentinel was sent.
    //   Idempotent: same status for an already-marked profile.
    //   This is the only signal the server has that the user lacks a
    //   real fingerprint — the modal's "why" depends on it.
    // ────────────────────────────────────────────────────────────────
    if (fingerprintUnavailable) {
      await supabase
        .from("profiles")
        .update({ fingerprint_status: "unavailable" })
        .eq("id", userId);
    } else if (isNewUser) {
      await supabase
        .from("profiles")
        .update({ fingerprint_status: "available" })
        .eq("id", userId);
    }

    // ────────────────────────────────────────────────────────────────
    // STEP 4e: log the fingerprint outcome to the analytics event log.
    //   Failure does not block the request.
    // ────────────────────────────────────────────────────────────────
    await logFingerprintEvent(supabase, {
      user_id: userId,
      status: fingerprintUnavailable ? "unavailable" : "available",
      reason:
        (request.headers.get("x-fp-reason") as
          | "blocked"
          | "timeout"
          | "network"
          | "unsupported"
          | "unknown"
          | null) ?? "unknown",
      user_agent: request.headers.get("user-agent") ?? null,
      platform: (request.headers.get("x-fp-platform") as string | null) ?? null,
    });

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
      // Skipped when the client sent the unavailable sentinel — no real hash.
      if (fingerprintHash) {
        await setIdentityFingerprintIfMissing(
          userId,
          deviceId,
          fingerprintHash,
        );
      }
    } else {
      // User has no identity on THIS device. Consider registering.
      const userHasAnyIdentity = await hasAnyIdentityForUser(userId);
      if (!userHasAnyIdentity) {
        // Brand new user (just created in step 3) — primary identity.
        const inserted = await insertGuestIdentity({
          user_id: userId,
          device_id: deviceId,
          fingerprint,
          ...(fingerprintHash ? { fingerprint_hash: fingerprintHash } : {}),
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

    // ────────────────────────────────────────────────────────────────
    // STEP 5b: always touch guest_identities.last_used_at.
    //   (Tier 1 fix 6: previously only touched when the (user, device)
    //   pair already had a row — new users + fingerprint-matched users
    //   on a different device skipped this. Now always called; updates
    //   0 rows when no identity exists for this (user, device), which
    //   is harmless.)
    // ────────────────────────────────────────────────────────────────
    await touchIdentityLastUsed(userId, deviceId);

    return NextResponse.json({
      userId,
      source,
      isNewUser,
      // Limited mode = sentinel AND no Step 1 deviceId match.
      // Step 1 match with sentinel = full recovery, NOT limited.
      limited: fingerprintUnavailable && source === "fresh",
    });
  } catch (error) {
    console.error("[quickstart] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
