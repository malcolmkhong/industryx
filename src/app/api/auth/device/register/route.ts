// Phase 4: Register authenticated account with current device + guest identity.
//
// Single-purpose endpoint (per Decision 2 — keep responsibilities explicit).
// Distinct from link-identity (which produces the merge conflict UI) and
// confirm-link (which commits the merge). This endpoint only records the
// device ↔ account binding.
//
// Idempotent: re-running for the same (user_id, device_id) pair is a no-op.
// On re-login from the same device, this writes the same row state.
//
// Auth: requires an authenticated, non-anonymous session.
// - Google or GitHub OAuth both produce email-based identity.
// - Anonymous sessions do NOT reach this endpoint; signInAnonymously + quickstart
//   remains the guest-creation path.
//
// Phase 5 (migration 055): also writes the fingerprint to profiles
//   so the user's "current device" is recorded on the canonical profile
//   row, not just the historical guest_identities table.

import { createHash } from "crypto";
import { NextResponse, type NextRequest } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/auth/rateLimiter";
import { verifyAuth } from "@/lib/auth/verifyAuth";
import { logRequestIp } from "@/app/api/auth/_shared/request-ip-log-helper";
import {
  hasIdentityForUserAndDevice,
  hasAnyIdentityForUser,
  findIdentityByFingerprint,
  insertGuestIdentity,
  setIdentityFingerprintIfMissing,
  touchIdentityLastUsed,
} from "@/lib/db/player/guestIdentities";
import { setProfileFingerprint } from "@/lib/db/player/profiles";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { deviceId, fingerprint, fingerprintHash } = body as {
      deviceId?: string;
      fingerprint?: string;
      fingerprintHash?: string | null;
    };

    if (!deviceId) {
      return NextResponse.json(
        { error: "deviceId is required" },
        { status: 400 },
      );
    }

    const auth = await verifyAuth();
    if (!auth.success) return auth.response;

    if (auth.email === undefined) {
      return NextResponse.json(
        { error: "Email-based authentication required" },
        { status: 403 },
      );
    }

    const supabase = createServiceRoleClient();
    if (!supabase) {
      return NextResponse.json(
        { error: "Service not configured" },
        { status: 503 },
      );
    }

    const rateLimitResponse = await checkRateLimit(
      auth.userId,
      RATE_LIMITS.action,
      "/api/auth/device/register",
    );
    if (rateLimitResponse) return rateLimitResponse;

    logRequestIp(request, "/api/auth/device/register", auth.userId);

    // Phase 5 (migration 055): sync the current device fingerprint to the
    // user's profile row so it stays authoritative. Only writes when a
    // fingerprint is supplied (avoid clobbering an existing fingerprint with
    // null on re-logins without fingerprint). Best-effort: profile is auxiliary
    // metadata, locking happens via guest_identities unique index.
    if (fingerprintHash) {
      await setProfileFingerprint(auth.userId, fingerprintHash);
    } else if (fingerprint) {
      const computed = createHash("sha256").update(fingerprint).digest("hex");
      await setProfileFingerprint(auth.userId, computed);
    }

    // Idempotent identity insert:
    // - If a (user, device) identity already exists, just touch it.
    // - Otherwise, if user has no identity at all, create a primary one.
    // - If user has an identity but on a different device, skip insert (preserves
    //   link-identity ownership over device transitions).
    const exists = await hasIdentityForUserAndDevice(auth.userId, deviceId);
    if (exists) {
      await touchIdentityLastUsed(auth.userId, deviceId);
      if (fingerprintHash) {
        await setIdentityFingerprintIfMissing(
          auth.userId,
          deviceId,
          fingerprintHash,
        );
      }
      return NextResponse.json({
        registered: true,
        alreadyExists: true,
      });
    }

    if (!(await hasAnyIdentityForUser(auth.userId))) {
      // Pre-check: if the fingerprint is already claimed by another user
      // (the typical post-OAuth bind case), the partial unique index
      // (migration 054) will reject our insert. Skip the insert and let
      // confirm-link do the formal supersede via merge_receipts.
      if (fingerprint || fingerprintHash) {
        const claimedBy = await findIdentityByFingerprint(fingerprint ?? "");
        if (claimedBy && claimedBy.user_id !== auth.userId) {
          console.info(
            `[RegisterDevice] Fingerprint already claimed by ${claimedBy.user_id}; deferring to confirm-link for ${auth.userId}`,
          );
          return NextResponse.json({
            registered: true,
            alreadyExists: false,
            reason: "fingerprint_claimed_by_other_user",
          });
        }
      }

      const computedHash =
        fingerprintHash ??
        (fingerprint
          ? createHash("sha256").update(fingerprint).digest("hex")
          : null);

      const inserted = await insertGuestIdentity({
        user_id: auth.userId,
        device_id: deviceId,
        fingerprint: fingerprint ?? "",
        ...(computedHash ? { fingerprint_hash: computedHash } : {}),
        is_primary: true,
      });

      if (!inserted) {
        return NextResponse.json(
          { error: "identity_insert_failed" },
          { status: 500 },
        );
      }

      return NextResponse.json({
        registered: true,
        alreadyExists: false,
      });
    }

    // User already has an identity on a different device. register-device
    // does not move it — that's link-identity's job.
    return NextResponse.json({
      registered: false,
      reason: "identity_on_other_device",
    });
  } catch (error) {
    console.error("[RegisterDevice] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
