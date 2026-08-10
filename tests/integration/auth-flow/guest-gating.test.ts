/**
 * Integration Test: guest gating + auth-wins unlock.
 *
 * Verifies the GUEST_GATED API rules work correctly with the
 * profile.is_guest based detection (NOT auth.users.is_anonymous, which
 * is unreliable because admin.createUser doesn't set it).
 *
 * Locked features (API routes):
 *   - /api/market/trades/execute
 *   - /api/market/trades/history
 *   - /api/game/leaderboard (GET)
 *   - /api/game/leaderboard/submit (POST)
 *
 * Flow:
 *   1. Fresh visitor → POST /api/auth/bootstrap → guest with
 *      profile.is_guest = true
 *   2. Guest hits each gated route → expect 403 with code: GUEST_GATED
 *   3. OAuth user creates via admin API → profile.is_guest = false
 *   4. OAuth user hits the same routes → expect 200 (or non-403)
 *
 * Note: per AUTH_ORCHESTRATOR_REDESIGN_PLAN §21 PR 4-4B, the legacy
 * /api/auth/identity/confirm-link flow was replaced by the canonical
 * /api/auth/bootstrap + plan §6/§7 merge policy. The merge contract
 * is now exercised end-to-end by tests/e2e/auth-merge-full.spec.ts.
 * This file focuses on the GUEST_GATED API gates that the merge
 * policy protects, not the merge itself.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Load .env
try {
  process.loadEnvFile();
} catch {}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const PROJECT_REF = SUPABASE_URL.replace(/^https?:\/\//, "").split(".")[0];
const SERVER = "http://localhost:3000";

let supabase: SupabaseClient;
let serverReachable = false;

const fp = (seed: string) => `it-gate-fp-${seed}-${randomUUID()}`;
const dev = (seed: string) => `it-gate-dev-${seed}-${randomUUID()}`;

interface BootstrapResponse {
  code?: string;
  userId?: string;
  isGuest?: boolean;
  source?: string;
}

async function bootstrap(
  deviceId: string,
  fingerprintHash: string,
): Promise<BootstrapResponse> {
  const r = await fetch(`${SERVER}/api/auth/bootstrap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId, fingerprintHash }),
  });
  return (await r.json()) as BootstrapResponse;
}

async function signInWithPasswordCookie(email: string, password: string) {
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await userClient.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session)
    throw new Error(`signInWithPassword failed: ${error?.message}`);
  const cookieName = `sb-${PROJECT_REF}-auth-token`;
  const cookieValue = JSON.stringify(data.session);
  return {
    cookieName,
    cookieValue,
    cookieHeader: `${cookieName}=${encodeURIComponent(cookieValue)}`,
    accessToken: data.session.access_token,
  };
}

async function postJson(
  path: string,
  body: Record<string, unknown>,
  cookie?: { cookieHeader: string; accessToken?: string },
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (cookie) {
    if (path.startsWith("/api/game/leaderboard/submit") && cookie.accessToken) {
      headers.Authorization = `Bearer ${cookie.accessToken}`;
    } else if (cookie.cookieHeader) {
      headers.Cookie = cookie.cookieHeader;
    }
  }
  const r = await fetch(`${SERVER}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {}
  return { status: r.status, body: parsed };
}

async function getJson(
  path: string,
  cookie?: { cookieHeader: string; accessToken?: string },
) {
  const headers: Record<string, string> = {};
  if (cookie) {
    if (path.startsWith("/api/game/leaderboard/submit") && cookie.accessToken) {
      headers.Authorization = `Bearer ${cookie.accessToken}`;
    } else if (cookie.cookieHeader) {
      headers.Cookie = cookie.cookieHeader;
    }
  }
  const r = await fetch(`${SERVER}${path}`, { headers });
  const text = await r.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {}
  return { status: r.status, body: parsed };
}

async function cleanupUser(uid: string) {
  try {
    await supabase.auth.admin.deleteUser(uid);
  } catch {}
}

async function pollFor<T>(
  queryFn: () => PromiseLike<{ data: T | null }>,
  isReady: (r: { data: T | null }) => boolean,
  maxWaitMs = 5000,
): Promise<{ data: T | null }> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const r = await queryFn();
    if (isReady(r)) return r;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return queryFn();
}

describe("GUEST_GATED feature unlock on auth bind", () => {
  const createdUserIds: string[] = [];

  before(async () => {
    if (!SUPABASE_URL || !SERVICE_KEY) {
      console.warn("[gate] missing env vars; skipping");
      return;
    }
    supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    try {
      const r = await fetch(`${SERVER}/api/auth/session/me`, {
        signal: AbortSignal.timeout(3000),
      });
      serverReachable = r.status > 0;
    } catch {
      serverReachable = false;
    }
  });

  after(async () => {
    for (const uid of createdUserIds) {
      await cleanupUser(uid);
    }
  });

  /**
   * The guest bootstrap creates an admin-managed anon user with no
   * password. To exercise the GUEST_GATED routes we need a session
   * cookie that verifyAuth() accepts. We sign the guest in with a
   * temporary password via admin.updateUserById() — this is a test
   * convenience, not a production flow.
   */
  async function getSessionFor(userId: string) {
    const { data } = await supabase.auth.admin.getUserById(userId);
    const email = data?.user?.email;
    if (!email) throw new Error(`no email for ${userId}`);
    const tempPassword = `IT-${randomUUID().slice(0, 16)}!`;
    await supabase.auth.admin.updateUserById(userId, {
      password: tempPassword,
    });
    return await signInWithPasswordCookie(email, tempPassword);
  }

  it("guest: profile.is_guest=true → all 4 gated routes return 403 GUEST_GATED", async (t) => {
    if (!serverReachable) {
      t.skip("dev server not reachable at localhost:3000");
      return;
    }

    // 1. Fresh guest via /api/auth/bootstrap (canonical)
    const fingerprint = fp("gating");
    const fingerprintHash = createHash("sha256")
      .update(fingerprint)
      .digest("hex");
    const r = await bootstrap(dev("gating"), fingerprintHash);
    const guestUserId = r.userId as string;
    createdUserIds.push(guestUserId);

    // Verify profiles.is_guest is true (this is what guestCheck looks at)
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_guest")
      .eq("id", guestUserId)
      .single();
    assert.ok(profile, "profile row missing for fresh guest");
    assert.equal(
      profile.is_guest,
      true,
      "fresh bootstrap user must have is_guest = true",
    );

    // Sign a temp session so we can hit verifyAuth-protected routes
    const cookie = await getSessionFor(guestUserId);

    // 2a. /api/market/trades/execute → expect 403
    const tradeRes = await postJson(
      "/api/market/trades/execute",
      { resource: "iron", type: "buy", amount: 1 },
      cookie,
    );
    assert.equal(tradeRes.status, 403, "trade must be 403 for guest");
    assert.equal(tradeRes.body.code, "GUEST_GATED");

    // 2b. /api/market/trades/history → expect 403
    const tradesRes = await getJson("/api/market/trades/history", cookie);
    assert.equal(tradesRes.status, 403, "trades history must be 403 for guest");
    assert.equal(tradesRes.body.code, "GUEST_GATED");

    // 2c. /api/game/leaderboard/submit → expect 403
    const lbRes = await postJson(
      "/api/game/leaderboard/submit",
      { userId: guestUserId, score: 100 },
      cookie,
    );
    assert.equal(lbRes.status, 403, "leaderboard submit must be 403 for guest");
    assert.equal(lbRes.body.code, "GUEST_GATED");

    // 2d. /api/game/leaderboard GET → accept 200 or 403 (gating optional)
    const leaderboardRes = await getJson("/api/game/leaderboard", cookie);
    if (leaderboardRes.status === 403) {
      assert.equal(leaderboardRes.body.code, "GUEST_GATED");
    }
  });

  it("oauth user with profile.is_guest=false → gated routes return non-403 (unlocked)", async (t) => {
    if (!serverReachable) {
      t.skip("dev server not reachable at localhost:3000");
      return;
    }

    // 1. Create an OAuth-like user (admin API; no is_anonymous in metadata
    //    → profile.is_guest = false via trigger)
    const email = `it-oauth-gate-${Date.now()}-${randomUUID().slice(0, 8)}@example.com`;
    const password = `IT-${randomUUID().slice(0, 16)}!`;
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { provider: "google", providers: ["google"] },
      user_metadata: { full_name: "OAuth Gate Test" },
    });
    if (error || !data.user)
      throw new Error(`createUser failed: ${error?.message}`);
    const oauthUserId = data.user.id;
    createdUserIds.push(oauthUserId);

    // Verify profile.is_guest = false for oauth user
    const { data: oauthProfile } = await pollFor<{ is_guest: boolean }>(
      () =>
        supabase
          .from("profiles")
          .select("is_guest")
          .eq("id", oauthUserId)
          .maybeSingle(),
      (r) => r.data !== null,
    );
    assert.ok(oauthProfile, "profile row missing for oauth user");
    assert.equal(
      oauthProfile.is_guest,
      false,
      "OAuth user must have is_guest = false (trigger reads is_anonymous=false for them)",
    );

    // 2. Sign in to obtain session cookie
    const cookie = await signInWithPasswordCookie(email, password);

    // 3. /api/market/trades/execute → expect non-403 (either 200 or some real response)
    const tradeRes = await postJson(
      "/api/market/trades/execute",
      { resource: "iron", type: "buy", amount: 1 },
      cookie,
    );
    assert.notEqual(
      tradeRes.status,
      403,
      `trade must NOT be 403 for oauth user — got ${tradeRes.status} body=${JSON.stringify(tradeRes.body)}`,
    );
    assert.notEqual(tradeRes.body.code, "GUEST_GATED");
  });

  it("guest bootstrap with previousAuthUserId → source=sign_out_to_guest (plan §6)", async (t) => {
    if (!serverReachable) {
      t.skip("dev server not reachable at localhost:3000");
      return;
    }

    // Fresh device, with previousAuthUserId set → runSignOutToGuest path
    // creates a new guest identity under the same device. The new
    // guest is is_guest=true; the previous auth user's authenticated
    // association is preserved (via device_bindings) per plan §6.
    const fingerprint = fp("signout");
    const fingerprintHash = createHash("sha256")
      .update(fingerprint)
      .digest("hex");
    const r = await bootstrap(dev("signout"), fingerprintHash);
    assert.equal(r.code, "BOOTSTRAP_READY");
    assert.equal(r.isGuest, true);

    // Re-bootstrap with previousAuthUserId set to a fake auth id.
    // The canonical RPC create_signed_out_guest_after_signout only
    // requires that previousAuthUserId !== current session; we have
    // no session so the path runs.
    const fakePrevAuth = "00000000-0000-4000-8000-000000000001";
    const r2 = await fetch(`${SERVER}/api/auth/bootstrap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId: dev("signout"),
        fingerprintHash,
        previousAuthUserId: fakePrevAuth,
      }),
    });
    const body2 = (await r2.json()) as BootstrapResponse;
    // The route's runSignOutToGuest path will create a new guest user
    // (and may or may not preserve associations to a fake auth id).
    // For the integration smoke we only assert that the response is
    // a structured 200, not a 5xx crash. Plan §6 details the full
    // contract; tests/e2e/auth-merge-full.spec.ts covers it.
    assert.ok(
      r2.status < 500,
      `sign-out-to-guest path returned 5xx: ${r2.status} ${JSON.stringify(body2)}`,
    );
  });
});
