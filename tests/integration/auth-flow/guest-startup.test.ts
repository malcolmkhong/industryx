/**
 * Integration Test: Guest (anonymous) startup flow.
 *
 * Architecture under test (matches the flowchart in handoff-ARCHITECTURE-REFACTOR.md):
 *
 *   Browser mount → no session → POST /api/auth/guest/quickstart(deviceId, fingerprint)
 *     ↳ Step 1: device_id primary lookup against guest_identities
 *     ↳ Step 2: fingerprint fallback lookup (active identities only,
 *                gated by migration 054 partial unique index)
 *     ↳ Step 3: supabase.auth.admin.createUser (new anon user)
 *                 ↳ handle_new_user trigger (migration 055)
 *                    → INSERT INTO profiles (is_guest=true, device_fingerprint=fp)
 *     ↳ Step 4: initializeGuestGameState (only if isNewUser)
 *     ↳ Step 5: insertGuestIdentity / touchIdentityLastUsed
 *     ↳ Response: { userId, source, isNewUser }
 *
 * What this test does NOT cover:
 *   - The actual signInAnonymously() browser round-trip (we have no session
 *     creation path on the server side, by design — Supabase doesn't expose
 *   - Autosave and beforeunload flush. Game time is server-owned and covered by
 *     applyElapsedTicks / runServerTicks tests.
 *     client-side Zustand concerns and unit-tested in tests/unit/store.baseline.test.ts.
 *
 * Live dependencies (must be up):
 *   - Dev server at http://localhost:3000  (bun run dev)
 *   - Supabase project wkkzqtseqwcyyyezroqq
 *   - .env vars NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *
 * If dev server is unreachable, this file skips network assertions gracefully
 * and only validates import-time correctness.
 */

import { describe, it, before, after, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Load .env (Node 20.6+). The `tsx --test` runner starts the process
// without reading .env — without this, we see only placeholder URLs.
// process.loadEnvFile() reads from process.cwd() by default; CI runners
// set cwd to project root.
try {
  process.loadEnvFile();
} catch {
  /* .env missing in CI — fall back to existing process.env */
}

// Env: tests/integration runs against project's .env
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const SERVER = "http://localhost:3000";

let supabase: SupabaseClient;
let serverReachable = false;

const fp = (seed: string) => `it-fp-${seed}-${randomUUID()}`;
const dev = (seed: string) => `it-dev-${seed}-${randomUUID()}`;

async function quickstart(deviceId: string, fingerprint: string) {
  const res = await fetch(`${SERVER}/api/auth/guest/quickstart`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId, fingerprint }),
  });
  return {
    status: res.status,
    body: (await res.json()) as Record<string, unknown>,
  };
}

async function cleanupUser(uid: string): Promise<void> {
  try {
    await supabase.auth.admin.deleteUser(uid);
  } catch {
    // best-effort; test cleanup is observational
  }
}

describe("Auth Flow — Guest (anon) startup", () => {
  const createdUserIds: string[] = [];
  let pingStatus: number | null = null;

  before(async () => {
    if (!SUPABASE_URL || !SERVICE_KEY) {
      console.warn(
        "[guest-startup] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — skipping",
      );
      return;
    }
    supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    try {
      const r = await fetch(`${SERVER}/api/auth/session/me`, {
        signal: AbortSignal.timeout(3000),
      });
      pingStatus = r.status;
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

  // afterEach: clean up immediately after each test so an interrupted run
  // (or a long suite) does not leave rows in auth.users / profiles /
  // guest_identities / server_game_state. The after() block above stays as
  // a safety net for any it() that forgot to push the user id.
  afterEach(async () => {
    for (const uid of createdUserIds) {
      await cleanupUser(uid);
    }
    createdUserIds.length = 0;
  });

  // ────────────────────────────────────────────────────────────────────
  // Flowchart node: Mount → FP + DeviceId → Session check (null) →
  //                 POST /api/auth/guest/quickstart
  // ────────────────────────────────────────────────────────────────────
  describe("Fresh visitor (no session, no prior identity)", () => {
    it("Step 3+4+5: creates anon user + game_state + identity in one round-trip", async (t) => {
      if (!serverReachable) {
        t.skip("dev server not reachable at localhost:3000");
        return;
      }
      const fingerprint = fp("fresh");
      const deviceId = dev("fresh");
      const res = await quickstart(deviceId, fingerprint);
      assert.equal(
        res.status,
        200,
        `quickstart status ${res.status} ${JSON.stringify(res.body)}`,
      );
      const userId = res.body.userId as string;
      assert.ok(userId, "userId missing from response");
      assert.equal(res.body.source, "fresh");
      assert.equal(res.body.isNewUser, true);
      createdUserIds.push(userId);

      // ── Verify chart-flow downstream DB state ──

      // server_game_state was initialized with money=1000, tick=0, etc.
      const { data: sgs, error: sgsErr } = await supabase
        .from("server_game_state")
        .select(
          "user_id, money, game_tick, game_speed, total_money_earned, research_points",
        )
        .eq("user_id", userId)
        .single();
      assert.equal(
        sgsErr,
        null,
        `server_game_state missing: ${sgsErr?.message}`,
      );
      assert.ok(sgs, "server_game_state row missing for new guest");
      assert.equal(sgs.user_id, userId);
      assert.equal(sgs.money, 1000);
      assert.equal(sgs.game_tick, 0);
      assert.equal(sgs.game_speed, 1);
      // total_money_earned starts at 1000 (lifetime baseline = starting money)
      assert.equal(sgs.total_money_earned, 1000);
      assert.equal(sgs.research_points, 0);

      // guest_identities row carries the fingerprint + sha256(fingerprint) hash
      const { data: gi, error: giErr } = await supabase
        .from("guest_identities")
        .select("user_id, fingerprint, fingerprint_hash, is_primary, device_id")
        .eq("user_id", userId)
        .single();
      assert.equal(giErr, null);
      assert.ok(gi, "guest_identity row missing for new guest");
      assert.equal(gi.fingerprint, fingerprint);
      assert.equal(gi.is_primary, true);
      assert.equal(gi.device_id, deviceId);
      assert.equal(
        gi.fingerprint_hash,
        createHash("sha256").update(fingerprint).digest("hex"),
        "fingerprint_hash must equal sha256(fingerprint)",
      );

      // handle_new_user trigger (migration 055) wrote fingerprint to profiles
      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("id, is_guest, device_fingerprint")
        .eq("id", userId)
        .single();
      assert.equal(profErr, null);
      assert.ok(prof, "profile row missing for new guest");
      assert.equal(prof.is_guest, true);
      assert.equal(prof.device_fingerprint, fingerprint);
    });

    it("Step 1: second visit with same deviceId reuses existing user", async (t) => {
      if (!serverReachable) {
        t.skip("dev server not reachable at localhost:3000");
        return;
      }
      const fingerprint = fp("revisit-device");
      const deviceId = dev("revisit-device");
      const r1 = await quickstart(deviceId, fingerprint);
      const r2 = await quickstart(deviceId, fingerprint);
      assert.equal(r1.status, 200);
      assert.equal(r2.status, 200);
      assert.equal(r1.body.userId, r2.body.userId);
      assert.equal(r2.body.source, "deviceId");
      assert.equal(r2.body.isNewUser, false);
      createdUserIds.push(r1.body.userId as string);

      // Only one guest_identity row exists for this user
      const { data: gis } = await supabase
        .from("guest_identities")
        .select("id")
        .eq("user_id", r1.body.userId);
      assert.ok(gis, "guest_identities query returned null");
      assert.equal(
        gis.length,
        1,
        "must not create duplicate identity rows on revisit",
      );

      // Only one server_game_state row exists
      const { data: sgs } = await supabase
        .from("server_game_state")
        .select("user_id")
        .eq("user_id", r1.body.userId);
      assert.ok(sgs, "server_game_state query returned null");
      assert.equal(sgs.length, 1);
    });

    it("Step 2: new deviceId + same fingerprint reuses via fingerprint fallback (localStorage-wipe recovery)", async (t) => {
      if (!serverReachable) {
        t.skip("dev server not reachable at localhost:3000");
        return;
      }
      const fingerprint = fp("recover-fp");
      const devA = dev("fp-fallback-a");
      const devB = dev("fp-fallback-b");
      const r1 = await quickstart(devA, fingerprint);
      const r2 = await quickstart(devB, fingerprint);
      assert.equal(r1.status, 200);
      assert.equal(r2.status, 200);
      assert.equal(
        r1.body.userId,
        r2.body.userId,
        "fingerprint fallback must reuse user",
      );
      assert.equal(r2.body.source, "fingerprint");
      assert.equal(r2.body.isNewUser, false);
      createdUserIds.push(r1.body.userId as string);
    });

    it("two completely fresh visitors get two distinct users (no global dedup)", async (t) => {
      if (!serverReachable) {
        t.skip("dev server not reachable at localhost:3000");
        return;
      }
      const r1 = await quickstart(dev("distinct-a"), fp("distinct-a"));
      const r2 = await quickstart(dev("distinct-b"), fp("distinct-b"));
      assert.notEqual(r1.body.userId, r2.body.userId);
      assert.equal(r1.body.source, "fresh");
      assert.equal(r2.body.source, "fresh");
      createdUserIds.push(r1.body.userId as string);
      createdUserIds.push(r2.body.userId as string);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Architecture regression: the deleted routes must not exist
  // ────────────────────────────────────────────────────────────────────
  describe("Architecture invariants", () => {
    it("/api/auth/recover-by-device is gone (single-endpoint refactor)", async (t) => {
      if (!serverReachable) {
        t.skip("dev server not reachable at localhost:3000");
        return;
      }
      const r = await fetch(`${SERVER}/api/auth/recover-by-device`, {
        method: "POST",
      });
      assert.notEqual(
        r.status,
        200,
        "recover-by-device must not exist anymore",
      );
    });

    it("/api/auth/claim-guest is gone (merged into quickstart)", async (t) => {
      if (!serverReachable) {
        t.skip("dev server not reachable at localhost:3000");
        return;
      }
      const r = await fetch(`${SERVER}/api/auth/claim-guest`, {
        method: "POST",
      });
      assert.notEqual(r.status, 200, "claim-guest must not exist anymore");
    });

    it("idempotent: 5 sequential quickstart calls produce 1 userId, 1 server_game_state, 1 guest_identity", async (t) => {
      if (!serverReachable) {
        t.skip("dev server not reachable at localhost:3000");
        return;
      }
      const fingerprint = fp("idem");
      const deviceId = dev("idem");
      // Sequential (not parallel) so each call sees the prior state.
      // Parallel calls race before the partial unique index registers,
      // which would surface as N distinct anonymous users — a separate
      // scenario worth testing if needed.
      const responses: Array<{
        status: number;
        body: Record<string, unknown>;
      }> = [];
      for (let i = 0; i < 5; i++) {
        responses.push(await quickstart(deviceId, fingerprint));
      }
      const userIds = new Set(responses.map((r) => r.body.userId));
      assert.equal(
        userIds.size,
        1,
        "all 5 sequential calls must yield same userId",
      );
      const uid = responses[0].body.userId as string;
      createdUserIds.push(uid);

      const { data: sgs } = await supabase
        .from("server_game_state")
        .select("user_id")
        .eq("user_id", uid);
      const { data: gis } = await supabase
        .from("guest_identities")
        .select("id")
        .eq("user_id", uid);
      assert.ok(sgs, "server_game_state query returned null");
      assert.ok(gis, "guest_identities query returned null");
      assert.equal(sgs.length, 1, "exactly one server_game_state row");
      assert.equal(gis.length, 1, "exactly one guest_identity row");
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Input validation
  // ────────────────────────────────────────────────────────────────────
  describe("Input validation", () => {
    it("missing deviceId → 400", async (t) => {
      if (!serverReachable) {
        t.skip("dev server not reachable at localhost:3000");
        return;
      }
      const r = await fetch(`${SERVER}/api/auth/guest/quickstart`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fingerprint: fp("no-dev") }),
      });
      assert.equal(r.status, 400);
    });

    it("missing fingerprint → 400", async (t) => {
      if (!serverReachable) {
        t.skip("dev server not reachable at localhost:3000");
        return;
      }
      const r = await fetch(`${SERVER}/api/auth/guest/quickstart`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: dev("no-fp") }),
      });
      assert.equal(r.status, 400);
    });

    it('fingerprint="unknown" → 400 (avoids polluting guest_identities.unique partial index)', async (t) => {
      if (!serverReachable) {
        t.skip("dev server not reachable at localhost:3000");
        return;
      }
      const r = await fetch(`${SERVER}/api/auth/guest/quickstart`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: dev("unknown-fp"),
          fingerprint: "unknown",
        }),
      });
      assert.equal(r.status, 400);
    });

    it("empty body → 400", async (t) => {
      if (!serverReachable) {
        t.skip("dev server not reachable at localhost:3000");
        return;
      }
      const r = await fetch(`${SERVER}/api/auth/guest/quickstart`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      assert.equal(r.status, 400);
    });
  });
});
