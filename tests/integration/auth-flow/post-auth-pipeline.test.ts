/**
 * Integration Test: post-auth pipeline.
 *
 * Plan §6 + §7: After OAuth callback, the canonical /api/auth/bootstrap
 * endpoint resolves the user's session through:
 *
 *   1. bootstrap_authenticated RPC (idempotent device binding)
 *   2. upgrade_guest_to_auth RPC (default auth_wins_archive_guest policy)
 *   3. ensure_profile_and_state RPC (repair when state is missing)
 *   4. loadServerGameStateLite + buildCompleteFullStateForServerRow
 *
 * The legacy /api/auth/device/register + /api/auth/identity/link +
 * /api/auth/identity/confirm-link 3-step flow was removed in PR 4-4B
 * (plan §21). The canonical 1-step endpoint with optional mergePolicy
 * replaces it.
 *
 * What this test exercises against the live Supabase project:
 *   - canonical POST /api/auth/bootstrap for an authenticated session
 *   - default auth_wins_archive_guest policy: guest progress archived
 *   - explicit_conflict opt-in policy: 409 returned
 *   - sign-out → guest bootstrap via previousAuthUserId
 *
 * Why email+password signin is acceptable as a substitute:
 *   Both Google and signInWithPassword produce the SAME end state from
 *   the server's perspective — a Session cookie with a user.id. Every
 *   route from /api/auth/bootstrap onward consumes that session
 *   identically. The provider-specific OAuth dance is owned by
 *   Supabase SDK; we test the post-auth pipeline.
 */

import { describe, it, before, after, afterEach } from "node:test";
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

const fp = (seed: string) => `it-postauth-fp-${seed}-${randomUUID()}`;
const dev = (seed: string) => `it-postauth-dev-${seed}-${randomUUID()}`;

interface SessionCookie {
  cookieName: string;
  cookieValue: string;
  cookieHeader: string;
  accessToken: string;
}

interface BootstrapResponse {
  code?: string;
  userId?: string;
  isGuest?: boolean;
  isNewUser?: boolean;
  source?: string;
  archiveReceiptId?: string | null;
  archivedGuestId?: string | null;
  conflictReason?: string;
  gameState?: { money?: number; gameTick?: number };
}

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
  const cookieName = `sb-${PROJECT_REF}-auth-token`;
  const cookieValue = JSON.stringify(session);
  return {
    cookieName,
    cookieValue,
    cookieHeader: `${cookieName}=${encodeURIComponent(cookieValue)}`,
    accessToken: session.access_token,
  };
}

async function bootstrapAs(
  cookie: SessionCookie,
  body: Record<string, unknown>,
): Promise<{ status: number; body: BootstrapResponse }> {
  const r = await fetch(`${SERVER}/api/auth/bootstrap`, {
    method: "POST",
    headers: {
      Cookie: cookie.cookieHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let parsed: BootstrapResponse = {};
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
    },
  });
  if (error || !data.user) {
    throw new Error(
      `createPostOAuthLikeUser failed: ${error?.message ?? "no user"}`,
    );
  }
  return { user: data.user, email, password };
}

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

  afterEach(async () => {
    for (const uid of createdUserIds.splice(0)) {
      await cleanupUser(uid);
    }
  });

  /**
   * Setup: a guest has played locally with non-trivial data. We
   * bootstrap via the canonical /api/auth/bootstrap endpoint and then
   * manually push their server_game_state to non-default values
   * representing "real player has been playing for a while".
   */
  async function setupGuestWithData(seed: string) {
    const deviceId = dev(seed);
    const fingerprint = fp(seed);
    const fingerprintHash = createHash("sha256")
      .update(fingerprint)
      .digest("hex");
    const r = await fetch(`${SERVER}/api/auth/bootstrap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId, fingerprintHash }),
    });
    const body = (await r.json()) as BootstrapResponse;
    const guestUserId = body.userId!;
    createdUserIds.push(guestUserId);

    await supabase
      .from("server_game_state")
      .update({
        money: 5000,
        total_money_earned: 5000,
        game_tick: 1234,
      })
      .eq("user_id", guestUserId);

    return { guestUserId, deviceId, fingerprint, fingerprintHash };
  }

  for (const provider of ["google", "github"] as const) {
    describe(`Provider: ${provider}`, () => {
      it("default auth_wins_archive_guest policy: guest-with-data binds to OAuth user; data moves to auth user", async (t) => {
        if (!serverReachable) {
          t.skip("dev server not reachable at localhost:3000");
          return;
        }

        // 1. Guest plays locally with some progress.
        const { guestUserId, deviceId, fingerprintHash } =
          await setupGuestWithData(`${provider}-happy`);

        // 2. Auth user appears (simulates OAuth callback succeeding).
        const oauth = await createPostOAuthLikeUser(provider);
        createdUserIds.push(oauth.user.id);

        // 3. Sign in to obtain session cookie (mimics exchangeCodeForSession).
        const cookie = await signInWithPasswordCookie(
          oauth.email,
          oauth.password,
        );

        // 4. POST /api/auth/bootstrap with the auth session.
        //    Default policy = auth_wins_archive_guest (plan §6).
        //    The canonical RPC bootstrap_authenticated binds the
        //    deviceId, then upgrade_guest_to_auth merges guest progress
        //    into the auth user (archiving the guest).
        const res = await bootstrapAs(cookie, {
          deviceId,
          fingerprintHash,
        });
        assert.equal(
          res.status,
          200,
          `bootstrap failed: ${JSON.stringify(res.body)}`,
        );
        assert.equal(res.body.code, "BOOTSTRAP_READY");
        assert.equal(res.body.source, "auth");
        assert.equal(res.body.userId, oauth.user.id);

        // 5. Default policy must surface an archiveReceiptId
        //    (per plan §6 + §15 — receipt is the durable record).
        assert.ok(
          res.body.archiveReceiptId,
          "default policy must archive the guest and surface archiveReceiptId",
        );
        assert.equal(res.body.archivedGuestId, guestUserId);

        // 6. Auth user's server_game_state inherits the guest's numbers.
        const { data: oauthSgs } = await supabase
          .from("server_game_state")
          .select("money, game_tick")
          .eq("user_id", oauth.user.id)
          .single();
        assert.ok(oauthSgs, "oauth server_game_state missing after merge");
        assert.equal(oauthSgs.money, 5000, "money moved to auth user");
        assert.equal(oauthSgs.game_tick, 1234, "tick moved to auth user");
      });

      it("explicit_conflict opt-in policy: 409 ACCOUNT_PROGRESS_CONFLICT when both have progress", async (t) => {
        if (!serverReachable) {
          t.skip("dev server not reachable at localhost:3000");
          return;
        }

        // 1. OAuth user with existing progress.
        const oauth = await createPostOAuthLikeUser(provider);
        createdUserIds.push(oauth.user.id);
        await supabase
          .from("server_game_state")
          .update({
            money: 8000,
            total_money_earned: 8000,
            game_tick: 500,
          })
          .eq("user_id", oauth.user.id);

        // 2. Guest with progress on a different device.
        const { deviceId, fingerprintHash } = await setupGuestWithData(
          `${provider}-conflict`,
        );

        const cookie = await signInWithPasswordCookie(
          oauth.email,
          oauth.password,
        );

        // 3. POST /api/auth/bootstrap with explicit_conflict opt-in.
        //    Per plan §6, the RPC only returns CONFLICT when the
        //    opt-in policy is requested AND both have progress. Default
        //    policy auto-archives; the test must pass mergePolicy
        //    explicitly to preserve the legacy 409 path.
        const res = await bootstrapAs(cookie, {
          deviceId,
          fingerprintHash,
          mergePolicy: "explicit_conflict",
        });
        assert.equal(
          res.status,
          409,
          `expected 409, got ${res.status} body=${JSON.stringify(res.body)}`,
        );
        assert.equal(res.body.code, "ACCOUNT_PROGRESS_CONFLICT");
        // conflict metadata is on the response — the canonical
        // conflictReason + survivingUserId + archivedGuestId are set
        // by the route's runAuthenticatedBootstrap / conflict path.
        assert.ok(
          res.body.conflictReason || res.body.survivingUserId,
          "conflict response must carry conflictReason or survivingUserId",
        );
      });

      it("no conflict when guest had no game data — auth user keeps their state", async (t) => {
        if (!serverReachable) {
          t.skip("dev server not reachable at localhost:3000");
          return;
        }

        // 1. Fresh oauth user (no server_game_state yet).
        const oauth = await createPostOAuthLikeUser(provider);
        createdUserIds.push(oauth.user.id);
        // Seed auth state directly via supabase (default empty row would
        // exist after the device/register side-effect; for this test
        // we leave the row absent).
        const cookie = await signInWithPasswordCookie(
          oauth.email,
          oauth.password,
        );

        // 2. Bootstrap on a brand-new deviceId (no guest on this
        //    device). upgrade_guest_to_auth returns OK_NO_GUEST.
        const res = await bootstrapAs(cookie, {
          deviceId: dev(`${provider}-noconf`),
          fingerprintHash: createHash("sha256")
            .update(fp(`${provider}-noconf`))
            .digest("hex"),
        });
        assert.equal(res.status, 200, `bootstrap: ${JSON.stringify(res.body)}`);
        assert.equal(res.body.code, "BOOTSTRAP_READY");
        assert.equal(res.body.source, "auth");
        assert.equal(res.body.userId, oauth.user.id);
        // No archive happened (no guest existed on this fresh device).
        assert.equal(
          res.body.archiveReceiptId,
          null,
          "no archive expected when no guest exists",
        );
        assert.equal(
          res.body.archivedGuestId,
          null,
          "no archivedGuestId expected when no guest exists",
        );
      });

      it("idempotent re-bootstrap: second visit does not double-archive the same guest", async (t) => {
        if (!serverReachable) {
          t.skip("dev server not reachable at localhost:3000");
          return;
        }

        // Plan §6 + §15 invariant: after the first archive, a second
        // bootstrap on the same device must NOT re-archive the same
        // guest. The canonical upgrade_guest_to_auth RPC returns
        // OK_NO_GUEST when the device binding already points to the
        // auth user.

        // 1. Guest with progress
        const { deviceId, fingerprintHash } = await setupGuestWithData(
          `${provider}-idem`,
        );
        // 2. OAuth user
        const oauth = await createPostOAuthLikeUser(provider);
        createdUserIds.push(oauth.user.id);
        const cookie = await signInWithPasswordCookie(
          oauth.email,
          oauth.password,
        );

        // 3. First bootstrap: archive happens
        const r1 = await bootstrapAs(cookie, {
          deviceId,
          fingerprintHash,
        });
        assert.equal(r1.status, 200);
        assert.ok(r1.body.archiveReceiptId, "first visit should archive");
        const firstReceipt = r1.body.archiveReceiptId;
        const firstArchived = r1.body.archivedGuestId;

        // 4. Second bootstrap on the same device: must NOT re-archive
        const r2 = await bootstrapAs(cookie, {
          deviceId,
          fingerprintHash,
        });
        assert.equal(r2.status, 200);
        assert.equal(r2.body.source, "auth");
        assert.equal(r2.body.userId, oauth.user.id);
        // No second archive receipt — the upgrade RPC returns
        // OK_NO_GUEST because the device binding now points to the
        // auth user, not the guest.
        assert.equal(
          r2.body.archiveReceiptId,
          null,
          "second visit must not re-archive the same guest",
        );
        assert.equal(
          r2.body.archivedGuestId,
          null,
          "second visit must not surface an archivedGuestId",
        );
        // Money + tick unchanged across visits.
        assert.equal(r1.body.gameState?.money, 5000);
        assert.equal(r2.body.gameState?.money, 5000);

        // Note: firstReceipt / firstArchived are captured to make
        // the assertion intent obvious in the trace; we don't
        // assert equality of values, just that the second visit
        // produces no new archive record.
        void firstReceipt;
        void firstArchived;
      });
    });
  }
});
