/**
 * Integration Test: Supabase Connectivity & Auth Status
 *
 * Tests the actual Supabase project (wkkzqtseqwcyyyezroqq) for:
 * 1. REST API reachability
 * 2. Anonymous sign-in status (enabled/disabled)
 * 3. Auth provider availability
 * 4. Session management
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

// ─── Constants from the actual codebase ──────────────────────────────

const SUPABASE_URL = "https://wkkzqtseqwcyyyezroqq.supabase.co";
// SECURITY: read anon key from env so the test never embeds production credentials.
// Falls back to a placeholder so the test is still importable in CI without secrets.
// The connectivity check will skip network assertions if the env var is missing.
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "test-placeholder-key";
const LIVE = process.env.RUN_LIVE_TESTS === "1" || process.env.RUN_LIVE_TESTS === "true";
const liveDescribe = LIVE ? describe : describe.skip;

function supabaseHeaders(extra: Record<string, string> = {}) {
  return { apikey: ANON_KEY, "Content-Type": "application/json", ...extra };
}

// ─── Test Suite ──────────────────────────────────────────────────────

// CI must be hermetic. These checks exercise mutable production auth state,
// so run them only in an explicitly opted-in live validation job.
liveDescribe("Supabase Connectivity", () => {
  let projectReachable = false;

  before(async () => {
    // Quick smoke test
    try {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
        headers: supabaseHeaders(),
      });
      projectReachable = r.ok || r.status === 401; // 401 = requires auth but IS reachable
    } catch {
      projectReachable = false;
    }
  });

  // ── Test 1: Project is reachable ──

  it("REST API is reachable", { skip: !projectReachable }, async () => {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
      headers: supabaseHeaders(),
    });
    assert.ok(r.ok || r.status < 500, `Expected 2xx/4xx, got ${r.status}`);
  });

  // ── Test 2: Anonymous sign-in status ──

  it("anonymous signup endpoint is reachable (legacy path; not used by current auth)", async () => {
    // Note: per AUTH_ORCHESTRATOR_REDESIGN_PLAN §3, the production
    // auth flow no longer calls supabase.auth.signInAnonymously().
    // Anon users are now created server-side via the
    // bootstrap_guest RPC (migration 074). This test remains as a
    // connectivity smoke — it verifies the Supabase auth endpoint
    // is reachable, but no longer asserts the anon provider must
    // be enabled for production auth to work.
    const r = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: "POST",
      headers: supabaseHeaders(),
      body: JSON.stringify({
        data: {},
        email: "",
        password: "",
        gotrue_meta_security: {},
      }),
    });

    const body = await r.json().catch(() => ({}));

    // Accept any non-5xx response — the connectivity check is the goal.
    assert.ok(
      r.status < 500,
      `Supabase auth signup returned ${r.status}: ${JSON.stringify(body).slice(0, 200)}`,
    );

    if (body.error_code === "anonymous_provider_disabled") {
      // Informational only — anon is no longer a production path.
      console.log(
        "  ℹ️  Supabase anon provider is disabled (expected — plan §3 uses server-side RPC).",
      );
    }
  });

  // ── Test 3: Auth providers ──

  it("auth settings are accessible", async () => {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
      headers: supabaseHeaders(),
    });
    const body = await r.json();

    assert.ok(body, "Auth settings returned empty");
    console.log("  External providers:", JSON.stringify(body.external));
    console.log(
      "  Disable signup:",
      body.disable_signup,
      "| Mailer autoconfirm:",
      body.mailer_autoconfirm,
    );
  });

  // ── Test 4: Session retrieval (simulates getSession()) ──

  it("getSession returns valid response for unauthenticated user", async () => {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: supabaseHeaders(),
    });

    // Unauthenticated → 401 is expected (no session cookie)
    assert.equal(r.status, 401, "Expected 401 for unauthenticated getSession");
    console.log(
      "  ✅ getSession responds (401 = no session, which is correct for first visit)",
    );
  });

  // ── Test 5: Health check / REST API endpoints used by the app ──

  it("REST API (used by supabase-js) is reachable", async () => {
    // The Supabase client library calls this on init
    const urls = [
      "/rest/v1/", // PostgREST
      "/auth/v1/settings", // Auth config
    ];

    for (const path of urls) {
      const r = await fetch(`${SUPABASE_URL}${path}`, {
        headers: supabaseHeaders(),
      });
      assert.ok(
        r.status < 500,
        `${path} returned ${r.status} — service may be down`,
      );
    }
    console.log("  ✅ All Supabase REST endpoints reachable");
  });
});

// ─── Auth Flow Simulation ────────────────────────────────────────────

// Gate the simulated flow test behind RUN_LIVE_TESTS — it always hits
// the live Supabase project, which can flap on rate limits / anon
// config drift. Connectivity is already covered by the live suite above.
const liveTest = LIVE ? it : it.skip;

describe("Supabase Auth Flow (simulated)", () => {
  /**
   * This test simulates the exact flow that AuthProvider.initAuth executes:
   *
   * 1. createBrowserClient(SUPABASE_URL, ANON_KEY)
   * 2. supabase.auth.getSession() — checks for existing session cookies
   * 3. If no session → supabase.auth.signInAnonymously()
   * 4. If anonymous fails → fallback to null user
   */

  liveTest("traces the complete AuthProvider initAuth code path", async () => {
    const results: string[] = [];

    // Step 1: getSession (simulated via REST)
    const sessionRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: supabaseHeaders(),
    });

    if (sessionRes.status === 200) {
      const user = await sessionRes.json();
      results.push(`✅ getSession: user found (id=${user.id?.slice(0, 8)}...)`);
    } else {
      results.push(`⚠️  getSession: no session (status ${sessionRes.status})`);
    }

    // Step 2: Try anonymous sign-in (what AuthProvider does on first visit)
    const signupRes = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: "POST",
      headers: supabaseHeaders(),
      body: JSON.stringify({
        data: {},
        email: "",
        password: "",
        gotrue_meta_security: {},
      }),
    });

    const signupBody = await signupRes.json().catch(() => ({}));

    if (signupBody.error_code === "anonymous_provider_disabled") {
      results.push(
        "❌ signInAnonymously: FAILED — anonymous_provider_disabled",
      );
      results.push("   → user = null, isGuest = false, loading = false");
      results.push(
        "   → LoginFloatingPanel SHOULD open via !user && !loading gate",
      );
    } else if (signupRes.ok) {
      results.push(
        `✅ signInAnonymously: SUCCESS (user id=${signupBody.id?.slice(0, 8)}...)`,
      );
      results.push("   → user = anonUser, isGuest = true, loading = false");
      results.push("   → LoginFloatingPanel SHOULD open via isGuest gate");
    } else {
      results.push(
        `⚠️  signInAnonymously: unexpected status ${signupRes.status}`,
      );
    }

    console.log("\n  Auth Flow Trace:");
    results.forEach((r) => {
      console.log(`    ${r}`);
    });
  });
});
