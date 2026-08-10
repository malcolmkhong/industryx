/**
 * Integration Test: Guest (anon) startup flow.
 *
 * Architecture under test (post-PR4-4B / plan §4, §5, §6):
 *
 *   Browser mount → no session → POST /api/auth/bootstrap({ deviceId, fingerprintHash? })
 *     ↳ Step 1: bootstrap_guest RPC (migration 074)
 *                 ↳ device_id lookup against device_bindings
 *                 ↳ if no binding: insert anon user + device_binding + profiles + server_game_state
 *     ↳ Step 2: loadServerGameStateLite(user_id) → buildCompleteFullStateForServerRow
 *                 ↳ BUG-093 placeholder detection: skip denormalized values
 *     ↳ Response: { code: "BOOTSTRAP_READY", userId, isGuest, isNewUser,
 *                    source: "fresh" | "deviceId", gameState: { money, gameTick, ... } }
 *
 * Live dependencies (must be up):
 *   - Dev server at http://localhost:3000  (npm run dev)
 *   - Supabase project + migrations 073/074/075 applied
 *   - .env vars NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *
 * If dev server is unreachable, this file skips network assertions gracefully
 * and only validates import-time correctness.
 */

import { describe, it, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Load .env (Node 20.6+). The `tsx --test` runner starts the process
// without reading .env — without this, we see only placeholder URLs.
try {
  process.loadEnvFile();
} catch {
  /* .env missing in CI — fall back to existing process.env */
}

// Canonical starting money per game_config_balance (PR 4A).
const CANONICAL_STARTING_MONEY = 2000;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const SERVER = "http://localhost:3000";

let supabase: SupabaseClient;
let serverReachable = false;

const fp = (seed: string) => `it-fp-${seed}-${randomUUID()}`;
const dev = (seed: string) => `it-dev-${seed}-${randomUUID()}`;

interface BootstrapResponse {
  code?: string;
  userId?: string;
  isGuest?: boolean;
  isNewUser?: boolean;
  source?: string;
  gameState?: {
    money?: number;
    gameTick?: number;
    gameSpeed?: number;
    quests?: unknown[];
  };
}

async function bootstrap(
  deviceId: string,
  options: { fingerprintHash?: string; previousAuthUserId?: string } = {},
): Promise<{ status: number; body: BootstrapResponse }> {
  const res = await fetch(`${SERVER}/api/auth/bootstrap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deviceId,
      fingerprintHash: options.fingerprintHash ?? null,
      previousAuthUserId: options.previousAuthUserId ?? null,
    }),
  });
  return {
    status: res.status,
    body: (await res.json()) as BootstrapResponse,
  };
}

async function cleanupUser(uid: string): Promise<void> {
  try {
    await supabase.auth.admin.deleteUser(uid);
  } catch {
    // best-effort; test cleanup is observational
  }
}

describe("Auth Flow — Guest (anon) startup via /api/auth/bootstrap", () => {
  const createdUserIds: string[] = [];

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
    for (const uid of createdUserIds) {
      await cleanupUser(uid);
    }
    createdUserIds.length = 0;
  });

  describe("Fresh visitor (no session, no prior identity)", () => {
    it("returns 200 BOOTSTRAP_READY for new guest with canonical gameState", async (t) => {
      if (!serverReachable) {
        t.skip("dev server not reachable at localhost:3000");
        return;
      }
      const deviceId = dev("fresh");
      const fingerprint = fp("fresh");
      const fpHash = createHash("sha256").update(fingerprint).digest("hex");
      const res = await bootstrap(deviceId, { fingerprintHash: fpHash });

      assert.equal(
        res.status,
        200,
        `bootstrap status ${res.status} ${JSON.stringify(res.body)}`,
      );
      assert.equal(res.body.code, "BOOTSTRAP_READY");
      assert.equal(res.body.isGuest, true);
      assert.equal(res.body.isNewUser, true);
      assert.equal(res.body.source, "fresh");
      assert.ok(res.body.userId, "userId missing from response");
      createdUserIds.push(res.body.userId);

      // §17 hydration guarantee: the response carries a usable gameState
      // (money>0, quests non-empty) on first paint.
      assert.ok(
        (res.body.gameState?.money ?? 0) > 0,
        "new-guest gameState.money must be > 0",
      );
      assert.equal(
        res.body.gameState?.money,
        CANONICAL_STARTING_MONEY,
        "new-guest gameState.money must equal canonical starting_money",
      );
      assert.ok(
        (res.body.gameState?.quests ?? []).length > 0,
        "new-guest gameState.quests must be non-empty",
      );
    });

    it("writes server_game_state row with canonical starting_money", async (t) => {
      if (!serverReachable) {
        t.skip("dev server not reachable at localhost:3000");
        return;
      }
      const deviceId = dev("fresh-sgs");
      const fingerprint = fp("fresh-sgs");
      const fpHash = createHash("sha256").update(fingerprint).digest("hex");
      const res = await bootstrap(deviceId, { fingerprintHash: fpHash });
      assert.equal(res.status, 200);
      const userId = res.body.userId!;
      createdUserIds.push(userId);

      const { data: sgs, error: sgsErr } = await supabase
        .from("server_game_state")
        .select("user_id, money, game_tick, game_speed, total_money_earned, research_points")
        .eq("user_id", userId)
        .single();
      assert.equal(
        sgsErr,
        null,
        `server_game_state missing: ${sgsErr?.message}`,
      );
      assert.ok(sgs, "server_game_state row missing for new guest");
      assert.equal(sgs.user_id, userId);
      assert.equal(
        sgs.money,
        CANONICAL_STARTING_MONEY,
        "new guest money must equal canonical starting_money",
      );
      assert.equal(sgs.game_tick, 0);
      assert.equal(sgs.game_speed, 1);
    });

    it("writes a profiles row with is_guest=true", async (t) => {
      if (!serverReachable) {
        t.skip("dev server not reachable at localhost:3000");
        return;
      }
      const deviceId = dev("fresh-prof");
      const fingerprint = fp("fresh-prof");
      const fpHash = createHash("sha256").update(fingerprint).digest("hex");
      const res = await bootstrap(deviceId, { fingerprintHash: fpHash });
      assert.equal(res.status, 200);
      const userId = res.body.userId!;
      createdUserIds.push(userId);

      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("id, is_guest")
        .eq("id", userId)
        .single();
      assert.equal(profErr, null);
      assert.ok(prof, "profile row missing for new guest");
      assert.equal(
        prof.is_guest,
        true,
        "fresh bootstrap user must have is_guest = true",
      );
    });

    it("second visit with same deviceId reuses the same user (source=deviceId)", async (t) => {
      if (!serverReachable) {
        t.skip("dev server not reachable at localhost:3000");
        return;
      }
      const deviceId = dev("revisit-device");
      const fingerprint = fp("revisit-device");
      const fpHash = createHash("sha256").update(fingerprint).digest("hex");
      const r1 = await bootstrap(deviceId, { fingerprintHash: fpHash });
      const r2 = await bootstrap(deviceId, { fingerprintHash: fpHash });
      assert.equal(r1.status, 200);
      assert.equal(r2.status, 200);
      assert.equal(r1.body.userId, r2.body.userId);
      assert.equal(r2.body.source, "deviceId");
      assert.equal(r2.body.isNewUser, false);
      createdUserIds.push(r1.body.userId!);
    });

    it("two fresh visitors get two distinct userIds", async (t) => {
      if (!serverReachable) {
        t.skip("dev server not reachable at localhost:3000");
        return;
      }
      const r1 = await bootstrap(dev("distinct-a"), {
        fingerprintHash: createHash("sha256")
          .update(fp("distinct-a"))
          .digest("hex"),
      });
      const r2 = await bootstrap(dev("distinct-b"), {
        fingerprintHash: createHash("sha256")
          .update(fp("distinct-b"))
          .digest("hex"),
      });
      assert.notEqual(r1.body.userId, r2.body.userId);
      assert.equal(r1.body.source, "fresh");
      assert.equal(r2.body.source, "fresh");
      createdUserIds.push(r1.body.userId!);
      createdUserIds.push(r2.body.userId!);
    });

    it("idempotent: 5 sequential bootstrap calls produce 1 userId, 1 server_game_state row", async (t) => {
      if (!serverReachable) {
        t.skip("dev server not reachable at localhost:3000");
        return;
      }
      const deviceId = dev("idem");
      const fingerprint = fp("idem");
      const fpHash = createHash("sha256").update(fingerprint).digest("hex");
      const responses: Array<{ status: number; body: BootstrapResponse }> = [];
      for (let i = 0; i < 5; i++) {
        responses.push(await bootstrap(deviceId, { fingerprintHash: fpHash }));
      }
      const userIds = new Set(responses.map((r) => r.body.userId));
      assert.equal(
        userIds.size,
        1,
        "all 5 sequential calls must yield same userId",
      );
      const uid = responses[0].body.userId!;
      createdUserIds.push(uid);

      const { data: sgs } = await supabase
        .from("server_game_state")
        .select("user_id")
        .eq("user_id", uid);
      assert.ok(sgs, "server_game_state query returned null");
      assert.equal(sgs.length, 1, "exactly one server_game_state row");
    });
  });

  describe("Input validation", () => {
    it("missing deviceId → 400 INVALID_BOOTSTRAP_REQUEST", async (t) => {
      if (!serverReachable) {
        t.skip("dev server not reachable at localhost:3000");
        return;
      }
      const r = await fetch(`${SERVER}/api/auth/bootstrap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      assert.equal(r.status, 400);
      const body = (await r.json()) as { code?: string };
      assert.equal(body.code, "INVALID_BOOTSTRAP_REQUEST");
    });

    it("empty deviceId → 400 INVALID_BOOTSTRAP_REQUEST", async (t) => {
      if (!serverReachable) {
        t.skip("dev server not reachable at localhost:3000");
        return;
      }
      const r = await fetch(`${SERVER}/api/auth/bootstrap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: "" }),
      });
      assert.equal(r.status, 400);
    });
  });
});
