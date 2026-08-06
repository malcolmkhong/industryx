// ============================================
// POST /api/test/seed-auth-merge
//
// E2E-only fixture seeder for the auth-merge audit regression (BUG-075).
// Creates a deterministic "user has both auth progress and an active
// guest binding with progress on the same device" scenario so the
// migration 079 `upgrade_guest_to_auth` RPC exercises the
// `OK_ARCHIVED_GUEST` branch when AuthProvider.bootstrap() calls
// /api/auth/bootstrap.
//
// Gated by NODE_ENV !== 'production' (and the /test/* path is only
// accessible in non-prod deploys per the route prefix).
//
// What's seeded:
//   1. Auth user via supabase.auth.admin.createUser (email confirmed).
//   2. Anonymous guest user via the same admin path.
//   3. server_game_state for auth: money=1000, game_tick=100.
//   4. server_game_state for guest: money=500, game_tick=50.
//   5. device_bindings row (active_guest) binding the guest to the test
//      device.
//
// Response shape:
//   {
//     deviceId: 'dev-e2e-<rand>',
//     authUserId: '<uuid>',
//     guestUserId: '<uuid>',
//     authSession: { access_token, refresh_token, expires_in },
//     projectRef: '<ref from NEXT_PUBLIC_SUPABASE_URL>',
//     authState: { money, game_tick },  // what auth progress looked like
//     guestState: { money, game_tick }, // what guest progress looked like
//   }
//
// The Playwright spec uses `authSession` + `projectRef` to set the
// Supabase session cookie via the test sign-in helper page, then drives
// the real bootstrap.
// ============================================

import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { getDbClient } from '@/lib/db/access';
import { checkRateLimit, RATE_LIMITS } from "@/lib/auth/rateLimiter";

export const dynamic = "force-dynamic";

interface SeedBody {
  /** Optional deviceId suffix for test re-runs. */
  tag?: string;
  /**
   * Full merge E2E spec support:
   *  - omitGuest=false (default): seed auth + guest + binding + both states (dual-progress fixture → archive path).
   *  - omitGuest=true: skip guest + binding + guest state. Used for "clean sign-in, no upgradeable guest" specs.
   */
  omitGuest?: boolean;
  /**
   * If true, the auth progress is the only state seeded. Useful for the
   * "fresh user, no guest" case.
   */
  omitAuthProgress?: boolean;
}

interface SeedResponse {
  ok: boolean;
  deviceId: string;
  authUserId: string;
  guestUserId: string;
  authSession: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  /** Password grant for the smoke E2E browser sign-in. */
  authCredentials: { email: string; password: string };
  projectRef: string;
  authState: { money: number; game_tick: number };
  guestState: { money: number; game_tick: number };
  /** When true, the seeded device+guest should trigger the archive path. */
  archiveTriggerExpected: boolean;
  /** Whether the guest user + binding + state were created. */
  omitGuest: boolean;
}

function isProductionEnv(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Best-effort project-ref extraction from the Supabase URL.
 * URL shape: https://<project-ref>.supabase.co
 */
function extractProjectRef(supabaseUrl: string | undefined): string {
  if (!supabaseUrl) return "e2e-unknown";
  try {
    const u = new URL(supabaseUrl);
    // host has the form "<ref>.supabase.co" or "<ref>.supabase.in".
    const host = u.hostname;
    const firstDot = host.indexOf(".");
    return firstDot > 0 ? host.slice(0, firstDot) : host;
  } catch {
    return "e2e-unknown";
  }
}

function jsonError(message: string, status = 503): NextResponse {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Fail-closed: never let this run in production builds.
  if (isProductionEnv()) {
    return NextResponse.json(
      { ok: false, error: "test endpoint disabled in production" },
      { status: 404 },
    );
  }

  const supabase = getDbClient();
  if (!supabase) {
    return jsonError("service-role client not configured");
  }

  // Best-effort rate limit. We expect this endpoint to be called a few
  // times per E2E run; tests/users cannot hit it because NODE_ENV gates it.
  const rateLimited = await checkRateLimit(
    "test-seed-auth-merge",
    RATE_LIMITS.config,
    "/api/test/seed-auth-merge",
  );
  if (rateLimited) return rateLimited;

  let body: SeedBody = {};
  try {
    body = (await request.json().catch(() => ({}))) as SeedBody;
  } catch {
    // ignore parse errors; tag is optional
  }
  const tag = (body.tag ?? "e2e").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 16);
  const deviceId = `dev-${tag}-${randomUUID().slice(0, 8)}`;
  const omitGuest = body.omitGuest === true;
  const omitAuthProgress = body.omitAuthProgress === true;

  // ── 1. Auth user ────────────────────────────────────────────────────
  // Use a memorable suffix so test reruns with same `tag` don't collide
  // on email uniqueness (which Supabase auth schema enforces).
  const authEmail = `e2e-auth-${tag}-${Date.now()}-${randomUUID().slice(0, 6)}@e2e.local`;
  const authPassword = `pw-e2e-${randomUUID().slice(0, 12)}`;
  const { data: authCreated, error: authCreateError } =
    await supabase.auth.admin.createUser({
      email: authEmail,
      password: authPassword,
      email_confirm: true,
      user_metadata: { e2e_seed: true, role: "auth" },
    });
  if (authCreateError || !authCreated.user) {
    return jsonError(
      `auth create failed: ${authCreateError?.message ?? "unknown"}`,
    );
  }
  const authUserId = authCreated.user.id;

  // ── 2. Anonymous guest user ─────────────────────────────────────────
  // We create the guest as a real auth.users row (not anonymous via
  // signInAnonymously, which uses cookie-only identity and lacks a
  // persistent user.id we can write server_game_state against). This
  // matches the migration-074 guest pattern (anonymous user with a
  // device_binding record).
  const guestEmail = `e2e-guest-${tag}-${Date.now()}@e2e.local`;
  const { data: guestCreated, error: guestCreateError } =
    await supabase.auth.admin.createUser({
      email: guestEmail,
      password: `pw-${randomUUID().slice(0, 12)}`,
      email_confirm: true,
      user_metadata: { e2e_seed: true, role: "guest" },
    });
  if (guestCreateError || !guestCreated.user) {
    return jsonError(
      `guest create failed: ${guestCreateError?.message ?? "unknown"}`,
    );
  }
  const guestUserId = guestCreated.user.id;

  // ── 3. Auth server_game_state with progress ────────────────────────
  // Migration 069 initial-state columns + 070 backfill. Money=1000,
  // game_tick=100 → v_auth_has_state=true. last_tick_at / last_saved_at
  // are NOT NULL columns per the schema — use the current ISO timestamp
  // (the seed is for runtime assertions, not historical replay).
  const nowIso = new Date().toISOString();
  const authProgress = { money: 1000, game_tick: 100 };
  if (!omitAuthProgress) {
    const { error: authStateError } = await supabase
      .from("server_game_state")
      .upsert(
        {
          user_id: authUserId,
          money: authProgress.money,
          total_money_earned: 5000,
          research_points: 0,
          buildings: [],
          buildings_count: 0,
          completed_research: [],
          resources: { iron: 50, copper: 30, coal: 20 },
          workers: [],
          game_tick: authProgress.game_tick,
          game_speed: 1,
          state_hash: `e2e-auth-${tag}`,
          state_version: 1,
          last_tick_at: nowIso,
          last_saved_at: nowIso,
          cheat_flag_count: 0,
          full_state: {
            money: authProgress.money,
            resources: { iron: 50, copper: 30, coal: 20 },
            buildings: [],
            workers: [],
            gameTick: authProgress.game_tick,
            gameSpeed: 1,
          },
        },
        { onConflict: "user_id" },
      );
    if (authStateError) {
      return jsonError(
        `auth state upsert failed: ${authStateError.message}`,
      );
    }
  } else {
    // Still need a server_game_state row so `bootstrap_authenticated`
    // doesn't fall into STATE_RECOVERY_REQUIRED. Insert a near-empty one.
    const { error: authStateError } = await supabase
      .from("server_game_state")
      .upsert(
        {
          user_id: authUserId,
          money: 0,
          total_money_earned: 0,
          research_points: 0,
          buildings: [],
          buildings_count: 0,
          completed_research: [],
          resources: {},
          workers: [],
          game_tick: 0,
          game_speed: 1,
          state_hash: `e2e-auth-${tag}`,
          state_version: 1,
          last_tick_at: nowIso,
          last_saved_at: nowIso,
          cheat_flag_count: 0,
          full_state: { money: 0, resources: {}, buildings: [], workers: [], gameTick: 0, gameSpeed: 1 },
        },
        { onConflict: "user_id" },
      );
    if (authStateError) {
      return jsonError(
        `auth state stub upsert failed: ${authStateError.message}`,
      );
    }
  }

  // ── 4. Guest server_game_state with progress ───────────────────────
  // Money=500, game_tick=50 → v_guest_has_state=true. Default
  // migration 079 policy: this triggers OK_ARCHIVED_GUEST.
  const guestProgress = { money: 500, game_tick: 50 };
  if (!omitGuest) {
    const { error: guestStateError } = await supabase
      .from("server_game_state")
      .upsert(
        {
          user_id: guestUserId,
          money: guestProgress.money,
          total_money_earned: 2500,
          research_points: 0,
          buildings: [],
          buildings_count: 0,
          completed_research: [],
          resources: { iron: 25 },
          workers: [],
          game_tick: guestProgress.game_tick,
          game_speed: 1,
          state_hash: `e2e-guest-${tag}`,
          state_version: 1,
          last_tick_at: nowIso,
          last_saved_at: nowIso,
          cheat_flag_count: 0,
          full_state: {
            money: guestProgress.money,
            resources: { iron: 25 },
            buildings: [],
            workers: [],
            gameTick: guestProgress.game_tick,
            gameSpeed: 1,
          },
        },
        { onConflict: "user_id" },
      );
    if (guestStateError) {
      return jsonError(
        `guest state upsert failed: ${guestStateError.message}`,
      );
    }
  }

  // ── 5. device_bindings active_guest for our device ────────────────
  // Skip when omitGuest=true (no guest, no binding to create).
  if (!omitGuest) {
    const { error: bindingError } = await supabase
      .from("device_bindings")
      .insert({
        device_id: deviceId,
        user_id: guestUserId,
        binding_type: "active_guest",
        status: "active",
      });
    if (bindingError && !bindingError.message.includes("duplicate")) {
      return jsonError(`binding insert failed: ${bindingError.message}`);
    }
  }

  // ── 5. device_bindings active_guest for our device ────────────────
  const { error: bindingError } = await supabase
    .from("device_bindings")
    .insert({
      device_id: deviceId,
      user_id: guestUserId,
      binding_type: "active_guest",
      status: "active",
    });
  if (bindingError && !bindingError.message.includes("duplicate")) {
    return jsonError(
      `binding insert failed: ${bindingError.message}`,
    );
  }

  // ── 6. Mint a session token for the auth user ─────────────────────
  // supabase.auth.admin.createSession would be ideal but isn't part of
  // the public admin API on every release. Use generateLink +
  // verifyOtp pattern? Too heavy. Instead we mint a session by using
  // signInWithPassword service-side via the admin endpoint. For the
  // E2E spec, the access_token is consumed via the test sign-in helper
  // which writes it to localStorage; we don't need to ship it back
  // through cookies.
  let authSession: SeedResponse["authSession"] = {
    access_token: "",
    refresh_token: "",
    expires_in: 0,
  };
  try {
    // Use the generated admin link pattern: ask Supabase to mint a
    // recovery link, then exchange it. Or use the GoTrueAdmin
    // password-grant endpoint directly.
    const grantRes = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`,
        },
        body: JSON.stringify({ email: authEmail, password: authPassword }),
      },
    );
    if (grantRes.ok) {
      const json = (await grantRes.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
      };
      authSession = {
        access_token: json.access_token ?? "",
        refresh_token: json.refresh_token ?? "",
        expires_in: json.expires_in ?? 3600,
      };
    }
  } catch {
    // Session mint is best-effort. The spec will fail loudly if access_token
    // is empty; we still return the user ids so callers can debug.
  }

  const projectRef = extractProjectRef(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  );

  return NextResponse.json(
    {
      ok: true,
      deviceId,
      authUserId,
      guestUserId,
      authSession,
      authCredentials: { email: authEmail, password: authPassword },
      projectRef,
      authState: authProgress,
      guestState: guestProgress,
      // Default policy auto-archives ONLY when both auth + guest have
      // progress. omitGuest suppresses the archive trigger expectation.
      archiveTriggerExpected: !omitGuest,
      omitGuest,
    } satisfies SeedResponse,
    { status: 200 },
  );
}
