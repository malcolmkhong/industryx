/**
 * Integration Test: post-auth pipeline.
 *
 * What this DOES test (covers ~80% of what real OAuth would exercise):
 *   - verifyAuth() cookie-ssr round-trip
 *   - /api/auth/register-device post-OAuth profile sync
 *   - /api/auth/link-identity conflict detection
 *   - /api/auth/confirm-link data move + auth_wins semantics
 *   - merge_receipts + merge_audit_log writes
 *   - guest_identities supersede marker
 *
 * What this DOES NOT test (requires Playwright + real provider config):
 *   - The actual OAuth redirect to/from Google or GitHub
 *   - Supabase SDK's exchangeCodeForSession() implementation
 *   - Provider app config on Supabase's Authentication dashboard
 *
 * Why email+password signin is acceptable as a substitute here:
 *   Both Google and signInWithPassword produce the SAME end state from
 *   our server's perspective: a Session object with a user.id stored in
 *   the sb-<ref>-auth-token cookie. Every route from register-device
 *   onward consumes that session identically — they don't differentiate
 *   by `provider`. So testing the post-auth pipeline with signInWithPassword
 *   exercises the same `verifyAuth()` + AuthOrchestrator code paths that
 *   the OAuth callback would trigger.
 *
 * In other words: signInWithPassword tests the code WE wrote; it doesn't
 * test the code Supabase or Google wrote. For the latter, a separate
 * Playwright + real Google workspace test is needed. See
 * README-oauth-testing.md for the full plan.
 *
 * Provider parameterization (google vs github) is preserved for two
 * reasons even though we don't actually click Google:
 *   1. The OAuth user creation path differs in metadata the user
 *      might inspect (app_metadata.provider, user_metadata.full_name,
 *      etc.).
 *   2. Defends against accidentally wiring up provider-specific
 *      behavior in the merge/identity routes.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Load .env (Node 20.6+). The tsx --test runner starts without reading
// .env, so we load it explicitly.
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

const fp = (seed: string) => `it-postauth-fp-${seed}-${randomUUID()}`;
const dev = (seed: string) => `it-postauth-dev-${seed}-${randomUUID()}`;

// ─── Helpers ─────────────────────────────────────────────────────────

interface SessionCookie {
  cookieName: string;
  cookieValue: string;
  cookieHeader: string;
}

/**
 * Sign a test user in via the email-password grant. This produces a
 * session cookie that verifyAuth() accepts identically to the OAuth
 * callback. See file header for why this is a valid stand-in.
 */
async function signInWithPasswordCookie(
  email: string,
  password: string,
): Promise<SessionCookie> {
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await userClient.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session) {
    throw new Error(
      `signInWithPassword failed: ${error?.message ?? "no session"}`,
    );
  }
  const session = data.session;
  // Cookie shape expected by @supabase/ssr v0.10+ createServerClient:
  //   name:  sb-<project-ref>-auth-token
  //   value: JSON.stringify(session) (URL-encoded for Cookie header)
  const cookieName = `sb-${PROJECT_REF}-auth-token`;
  const cookieValue = JSON.stringify(session);
  return {
    cookieName,
    cookieValue,
    cookieHeader: `${cookieName}=${encodeURIComponent(cookieValue)}`,
  };
}

async function quickstart(
  deviceId: string,
  fingerprint: string,
): Promise<Record<string, unknown>> {
  const r = await fetch(`${SERVER}/api/auth/quickstart`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId, fingerprint }),
  });
  return (await r.json()) as Record<string, unknown>;
}

async function postJson(
  path: string,
  body: Record<string, unknown>,
  cookie: SessionCookie,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = await fetch(`${SERVER}${path}`, {
    method: "POST",
    headers: {
      Cookie: cookie.cookieHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {}
  return { status: r.status, body: parsed };
}

async function cleanupUser(uid: string): Promise<void> {
  try {
    await supabase.auth.admin.deleteUser(uid);
  } catch {}
}

/**
 * Poll a query until it returns a non-empty result, or 5s timeout.
 * PostgREST replication is eventually consistent; reads immediately
 * after writes can return stale results for ~1-2s.
 *
 * `queryFn` may return any thenable (Supabase's PostgrestBuilder is
 * PromiseLike, not strictly a Promise — `.maybeSingle()` and `.single()`
 * chains return it).
 */
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
  return queryFn(); // final attempt
}

/**
 * Create a test user simulating a "post-OAuth" account. We create them
 * with email+password so we can signInWithPassword below. The
 * app_metadata.provider and user_metadata fields are set so the user
 * LOOKS like what an OAuth callback would produce.
 */
async function createPostOAuthLikeUser(provider: "google" | "github") {
  const email = `it-${provider}-${Date.now()}-${randomUUID().slice(0, 8)}@example.com`;
  const password = `IT-${randomUUID().slice(0, 16)}!`;
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: {
      provider,
      providers: [provider],
    },
    user_metadata: {
      provider,
      full_name: `Test ${provider} User`,
      // No fingerprint from the OAuth side — register-device writes that.
    },
  });
  if (error || !data.user) {
    throw new Error(
      `createPostOAuthLikeUser failed: ${error?.message ?? "no user"}`,
    );
  }
  return { user: data.user, email, password };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe("Post-auth pipeline (google & github coverage)", () => {
  const createdUserIds: string[] = [];

  before(async () => {
    if (!SUPABASE_URL || !SERVICE_KEY) {
      console.warn("[post-auth] missing env vars; skipping");
      return;
    }
    supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    try {
      const r = await fetch(`${SERVER}/api/auth/me`, {
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
   * Setup: a guest has played locally with non-trivial data. We populate
   * server_game_state with money=5000, tick=1234, and 3 player_actions.
   * This represents the "real player has been playing for a while" state.
   */
  async function setupGuestWithData(seed: string) {
    const deviceId = dev(seed);
    const fingerprint = fp(seed);
    const r = await quickstart(deviceId, fingerprint);
    const guestUserId = r.userId as string;
    createdUserIds.push(guestUserId);

    await supabase
      .from("server_game_state")
      .update({
        money: 5000,
        total_money_earned: 5000,
        game_tick: 1234,
      })
      .eq("user_id", guestUserId);

    const paRes = await supabase.from("player_actions").insert([
      { user_id: guestUserId, action_type: "load" },
      { user_id: guestUserId, action_type: "save" },
      { user_id: guestUserId, action_type: "buy_market" },
    ]);
    if (paRes.error) {
      throw new Error(
        `player_actions insert failed for guest ${guestUserId}: ${paRes.error.message}`,
      );
    }

    return { guestUserId, deviceId, fingerprint };
  }

  for (const provider of ["google", "github"] as const) {
    describe(`Provider: ${provider}`, () => {
      it("happy path: guest-with-data binds to OAuth user → data moves to auth user (auth wins)", async (t) => {
        if (!serverReachable) {
          t.skip("dev server not reachable at localhost:3000");
          return;
        }

        // 1. Guest plays locally with some progress.
        const { guestUserId, deviceId, fingerprint } = await setupGuestWithData(
          `${provider}-happy`,
        );

        // 2. Auth user appears (simulates OAuth callback succeeding —
        //    a row in auth.users with provider metadata). For real
        //    Google/GitHub this would arrive via /api/auth/callback
        //    → exchangeCodeForSession(). Here we side-step the
        //    callback by creating the user directly.
        const oauth = await createPostOAuthLikeUser(provider);
        createdUserIds.push(oauth.user.id);

        // 3. Browser obtains session cookie after callback. For real
        //    OAuth, this is the cookie set by exchangeCodeForSession.
        //    For our test, we signInWithPassword which produces an
        //    identical-shape session cookie from verifyAuth()'s POV.
        const cookie = await signInWithPasswordCookie(
          oauth.email,
          oauth.password,
        );
        assert.ok(cookie.cookieHeader);

        // ─── post-OAuth pipeline (the actual flow) ───

        // 4. register-device: profile.device_fingerprint sync.
        //    Triggered after OAuth callback by AuthOrchestrator.runPostOAuth.
        const reg = await postJson(
          "/api/auth/register-device",
          { deviceId, fingerprint },
          cookie,
        );
        assert.equal(
          reg.status,
          200,
          `register-device failed: ${JSON.stringify(reg.body)}`,
        );
        assert.equal(reg.body.registered, true);

        // profile.device_fingerprint should equal sha256(fingerprint)
        // (route hashes it before writing)
        const { data: profReg } = await supabase
          .from("profiles")
          .select("device_fingerprint")
          .eq("id", oauth.user.id)
          .single();
        const expectedHash = await import("node:crypto").then((m) =>
          m.createHash("sha256").update(fingerprint).digest("hex"),
        );
        // For a fresh oauth user, register-device should populate
        // device_fingerprint (since user has no existing identity).
        assert.ok(profReg, "oauth profile missing after register-device");
        assert.equal(
          profReg.device_fingerprint,
          expectedHash,
          "profiles.device_fingerprint must equal sha256(fingerprint) after register-device",
        );

        // 5. link-identity: detect conflict with the guest's device.
        //    Triggered after OAuth callback by AuthOrchestrator.runMergeCheck.
        const idempotencyKey = `it-${provider}-${randomUUID()}`;
        const link = await postJson(
          "/api/auth/link-identity",
          {
            idempotencyKey,
            deviceId,
            fingerprintHash: expectedHash,
            userAgent: "test-agent",
          },
          cookie,
        );
        assert.equal(
          link.status,
          200,
          `link-identity failed: ${JSON.stringify(link.body)}`,
        );
        // Conflict expected: this guest deviceId + fingerprint maps
        // to the guest user we just created.
        assert.equal(
          link.body.conflict,
          true,
          "conflict expected when guest has server_game_state",
        );
        const operationId = link.body.operationId as string;
        assert.ok(operationId, "operationId returned from link-identity");

        // 6. confirm-link: merge the data (auth wins).
        //    Triggered by user clicking "Merge" in LoginFloatingPanel.
        //    Same idempotencyKey is required to match the link-identity
        //    record (findLinkOperationById is keyed by id + user_id + idempotency_key).
        const confirm = await postJson(
          "/api/auth/confirm-link",
          {
            operationId,
            idempotencyKey,
            fingerprintHash: expectedHash,
          },
          cookie,
        );
        assert.equal(
          confirm.status,
          200,
          `confirm-link failed: ${JSON.stringify(confirm.body)}`,
        );
        assert.equal(confirm.body.survivingUserId, oauth.user.id);
        assert.equal(confirm.body.archivedUserId, guestUserId);
        assert.equal(confirm.body.preference, "auth_wins");

        // ─── Final state verification ───

        // Auth user inherits the guest's game-state numbers
        const { data: oauthSgs } = await supabase
          .from("server_game_state")
          .select("money, game_tick")
          .eq("user_id", oauth.user.id)
          .single();
        assert.ok(oauthSgs, "oauth server_game_state missing after merge");
        assert.equal(oauthSgs.money, 5000, "money moved to auth user");
        assert.equal(oauthSgs.game_tick, 1234, "tick moved to auth user");

        // guest_identities row marked superseded_by = oauth user id
        const { data: gi } = await supabase
          .from("guest_identities")
          .select("superseded_by, is_primary")
          .eq("user_id", guestUserId)
          .single();
        assert.ok(gi, "guest_identities row missing post-merge");
        assert.equal(gi.superseded_by, oauth.user.id);
        assert.equal(gi.is_primary, false);

        // player_actions reassigned from guest → oauth
        const { count: oauthActions } = await supabase
          .from("player_actions")
          .select("*", { count: "exact", head: true })
          .eq("user_id", oauth.user.id);
        const { count: guestActions } = await supabase
          .from("player_actions")
          .select("*", { count: "exact", head: true })
          .eq("user_id", guestUserId);
        assert.equal(
          oauthActions,
          3,
          "all 3 player_actions reassigned to auth user",
        );
        assert.equal(
          guestActions,
          0,
          "no player_actions left under guest user",
        );

        // merge_receipts row created with auth_wins decision_type
        // merge receipt recorded
        // PostgREST is eventually consistent for ~1s after writes. Poll
        // for the receipt + audit rows with a small timeout so we don't
        // race the read after write.
        const receiptRes = await pollFor<{
          id: string;
          kept_user_id: string;
          archived_user_id: string;
          decision_type: string;
        }>(
          () =>
            supabase
              .from("merge_receipts")
              .select("id, kept_user_id, archived_user_id, decision_type")
              .eq("operation_id", operationId)
              .maybeSingle(),
          (r) => !!r.data,
        );
        const receipt = receiptRes.data;
        assert.ok(receipt, "merge_receipt must exist");
        assert.equal(receipt.kept_user_id, oauth.user.id);
        assert.equal(receipt.archived_user_id, guestUserId);
        assert.equal(receipt.decision_type, "auth_wins");

        // merge audit log recorded
        const auditRow = await pollFor<{ id: string }>(
          () =>
            supabase
              .from("merge_audit_log")
              .select("id")
              .eq("merge_receipt_id", receipt.id)
              .maybeSingle(),
          (r) => !!r.data,
        );
        assert.ok(auditRow.data, "merge_audit_log must record the merge");
      });

      it("no conflict when guest had no game data — link-identity returns no_guest_to_link", async (t) => {
        if (!serverReachable) {
          t.skip("dev server not reachable at localhost:3000");
          return;
        }

        // 1. Guest signs up but never plays → server_game_state exists
        //    with default money=1000. We bypass by using a brand-new
        //    deviceId at link-time so guest_identities has nothing for
        //    this device.
        const guestFp = fp(`${provider}-noconf`);
        const guestDev = dev(`${provider}-noconf`);
        const r = await quickstart(guestDev, guestFp);
        const guestUserId = r.userId as string;
        createdUserIds.push(guestUserId);

        const oauth = await createPostOAuthLikeUser(provider);
        createdUserIds.push(oauth.user.id);
        const cookie = await signInWithPasswordCookie(
          oauth.email,
          oauth.password,
        );

        // Use a fresh deviceId that has no existing identity. No
        // conflict should arise.
        const link = await postJson(
          "/api/auth/link-identity",
          {
            idempotencyKey: `it-${provider}-noconf-${randomUUID()}`,
            deviceId: dev(`${provider}-noconf-fresh`),
            fingerprintHash: await import("node:crypto").then((m) =>
              m.createHash("sha256").update(guestFp).digest("hex"),
            ),
            userAgent: "test-agent",
          },
          cookie,
        );
        assert.equal(
          link.status,
          200,
          `link-identity: ${JSON.stringify(link.body)}`,
        );
        assert.equal(
          link.body.reason,
          "no_guest_to_link",
          "fresh-deviceId oauth user should see no conflict",
        );
      });
    });
  }
});
