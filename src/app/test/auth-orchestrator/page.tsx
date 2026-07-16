/**
 * /test/auth-orchestrator — minimal browser harness for Playwright E2E.
 *
 * Boots the AuthOrchestrator against an in-memory fake-Supabase, exposes the
 * full Phase 10 lifecycle (onReady / onIdentityChanged / onSignedOut / cloud
 * sync timer) to a window-level API, and renders observed state + a control
 * panel so the test runner can drive every transition.
 *
 * Migration 079 E2E: also exposes `__e2eSignInPassword(email, password)` which
 * uses the real Supabase browser client (`createBrowserClient` from
 * `@supabase/ssr`) to perform a real sign-in, setting the Supabase SSR
 * cookies so the real `/api/auth/bootstrap` route can verify the session.
 */
"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { AuthOrchestrator } from "@/lib/auth/orchestrator";
import type {
  AuthOrchestratorBootstrapDeps,
  BootstrapRequestBody,
  BootstrapResponseBody,
  Session,
} from "@/lib/auth/orchestrator/types";

// ─── Fake Supabase (in-memory) ──────────────────────────────────────────

type Handler = (session: Session | null) => void;

interface LogEntry {
  id: number;
  ts: number;
  event: string;
  detail?: string;
}

/** Migration 079 E2E: capture the latest applyServerState payload so the
 *  spec can assert that the post-bootstrap game state matches the auth
 *  user's progress (not the guest's archived snapshot). */
let lastAppliedState: Record<string, unknown> | null = null;

/** Migration 079 E2E: capture the latest raw bootstrap response body so
 *  the spec can inspect archiveReceiptId / archivedGuestId surfaced by
 *  /api/auth/bootstrap. */
let lastBootstrapResponse: Record<string, unknown> | null = null;

// Must stay compatible with tests/e2e/auth-orchestrator.spec.ts `__authApi`
// declaration. Extra test-only helpers live on a separate global.
interface AuthApi {
  userId: string | null;
  identity: string;
  status: string;
  calls: Record<string, number>;
  events: LogEntry[];
  /**
   * Latest raw bootstrap response body captured by `callBootstrap` —
   * used by the smoke E2E to read archiveReceiptId / archivedGuestId
   * after the orchestrator's bootstrap fired.
   */
  lastBootstrapResponse: Record<string, unknown> | null;
  emitFreshAnon: () => Promise<void>;
  emitOAuth: (userId: string) => void;
  emitSignOut: () => void;
  emitTokenRefresh: () => void;
  signOut: () => Promise<void>;
  reset: () => void;
  /**
   * Migration 079 E2E: dispatch a synthetic AUTH_STATE_CHANGED event with a
   * real Supabase session shape (must include access_token + refresh_token
   * for the real /api/auth/bootstrap to verify). The orchestrator then
   * runs the canonical bootstrap path and surfaces archive metadata.
   */
  emitRealAuthSession: (session: {
    access_token: string;
    refresh_token: string;
    expires_in?: number;
    user: { id: string; email?: string | null };
  }) => Promise<void>;
  /**
   * Migration 079 E2E: real password sign-in via @supabase/ssr browser
   * client. Sets the project's SSR cookies so subsequent fetches via
   * `fetch('/api/auth/bootstrap', ...)` from the browser context hit
   * the verifyAuth() branch successfully.
   */
  e2eSignInPassword: (email: string, password: string) => Promise<{
    ok: boolean;
    userId?: string;
    error?: string;
  }>;
  /**
   * Latest apply_server_state captured game state payload (for assertions).
   */
  lastAppliedState: Record<string, unknown> | null;
}

declare global {
  interface Window {
    __authApi: AuthApi;
    __authTestHooks: {
      throwNextIdentityChange: () => void;
      failNextSupabaseSignOut: () => void;
    };
  }
}

function buildHarness(): {
  orch: AuthOrchestrator;
  api: Window["__authApi"];
  testHooks: Window["__authTestHooks"];
  handlers: Set<Handler>;
  supabase: { signOutShouldThrow: boolean; identityChangeShouldThrow: boolean };
} {
  const handlers = new Set<Handler>();
  const events: LogEntry[] = [];
  let nextEventId = 0;
  const calls: Record<string, number> = {
    onReady: 0,
    onIdentityChanged: 0,
    onSignedOut: 0,
    startAutoSave: 0,
    stopAutoSave: 0,
    setUserId: 0,
    cloudLoad: 0,
    signOutSupabase: 0,
    callBootstrap: 0,
    applyServerState: 0,
    clearPreviousUserState: 0,
  };
  const supabase = {
    currentSession: null as Session | null,
    signOutShouldThrow: false,
    identityChangeShouldThrow: false,
  };

  const log = (event: string, detail?: string): void => {
    events.push({ id: ++nextEventId, ts: Date.now(), event, detail });
  };

  let cloudSaveTimer: ReturnType<typeof setInterval> | null = null;

  // New `AuthOrchestratorBootstrapDeps` (PR4-4A contract). The test
  // harness exercises the orchestrator in the browser, so the deps are
  // intentionally thin: hardcoded deviceId, deterministic fingerprint,
  // a real `/api/auth/bootstrap` call (so the harness exercises the
  // actual network path), and no-op `applyServerState` /
  // `clearPreviousUserState` so manual exploration doesn't mutate the
  // global store.
  const deps: AuthOrchestratorBootstrapDeps = {
    isSupabaseConfigured: true,
    getDeviceId: () => "device-e2e",
    getSession: async () => {
      void calls.signOutSupabase; // touch the stat so lint stops barking
      return supabase.currentSession;
    },
    signInWithOAuth: async () => ({ error: null }),
    getFingerprint: async (_timeoutMs: number) => "test-fingerprint-abc",
    /**
     * Real fetch wrapper. The test harness deliberately hits the live
     * `/api/auth/bootstrap` endpoint so it can exercise the full
     * network path. Returns `null` on any failure (network or JSON) so
     * the orchestrator routes to RESPONSE_TEMPORARY per plan §5.
     */
    callBootstrap: async (
      body: BootstrapRequestBody,
    ): Promise<BootstrapResponseBody | null> => {
      calls.callBootstrap++;
      log("callBootstrap", body.deviceId);
      try {
        const res = await fetch("/api/auth/bootstrap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deviceId: body.deviceId,
            fingerprintHash: body.fingerprintHash ?? null,
            previousAuthUserId: body.previousAuthUserId ?? null,
          }),
        });
        const json = (await res.json().catch(() => null)) as
          | BootstrapResponseBody
          | null;
        if (json) {
          lastBootstrapResponse = json as Record<string, unknown>;
        }
        return json ?? null;
      } catch {
        return null;
      }
    },
    /**
     * No-op bridge. The test page must not mutate the global Zustand
     * store during manual exploration — log it instead so the rendered
     * event list reflects what would have happened in production.
     */
    applyServerState: (params) => {
      calls.applyServerState++;
      log(
        "applyServerState",
        `${params.userId}|${params.isGuest}|${params.isNewUser}|${params.needsStateLoad}`,
      );
      calls.onReady++;
      log("onReady", params.userId);
      calls.cloudLoad++;
      log("cloudLoad");
      if (params.gameState) {
        lastAppliedState = params.gameState as Record<string, unknown>;
      }
    },
    /**
     * No-op for the test page. Same rationale as `applyServerState` —
     * the harness is for orchestrator lifecycle exploration, not store
     * mutation. Log the call so the event timeline is observable.
     */
    clearPreviousUserState: () => {
      calls.clearPreviousUserState++;
      log("clearPreviousUserState");
      if (cloudSaveTimer) {
        clearInterval(cloudSaveTimer);
        cloudSaveTimer = null;
      }
      calls.stopAutoSave++;
      log("stopAutoSave");
    },
    onAuthStateChange: (h: Handler) => {
      handlers.add(h);
      return () => handlers.delete(h);
    },
    signOutSupabase: async () => {
      if (supabase.signOutShouldThrow) {
        supabase.signOutShouldThrow = false;
        // Fire SIGNED_OUT before throwing
        supabase.currentSession = null;
        handlers.forEach((h) => h(null));
        throw new Error("network_unreachable");
      }
      supabase.currentSession = null;
      handlers.forEach((h) => h(null));
      return { error: null };
    },
  };

  const orch = new AuthOrchestrator();
  orch.attach(deps);

  const api: AuthApi = {
    get userId() {
      return orch.getState().userId;
    },
    get identity() {
      return orch.getState().identity;
    },
    get status() {
      return orch.getState().status;
    },
    get events() {
      return events;
    },
    get calls() {
      return calls;
    },
    emitFreshAnon: async () => {
      log("test:emitFreshAnon");
      const session = makeSession({ userId: "anon-test", isAnonymous: true });
      supabase.currentSession = session;
      handlers.forEach((h) => h(session));
    },
    emitOAuth: (userId: string) => {
      log("test:emitOAuth", userId);
      const session = makeSession({ userId });
      supabase.currentSession = session;
      handlers.forEach((h) => h(session));
    },
    emitSignOut: () => {
      log("test:emitSignOut");
      supabase.currentSession = null;
      handlers.forEach((h) => h(null));
    },
    emitTokenRefresh: () => {
      log("test:emitTokenRefresh");
      const session = makeSession({
        userId: orch.getState().userId ?? "auth-1",
      });
      supabase.currentSession = session;
      handlers.forEach((h) => h(session));
    },
    signOut: async () => {
      log("test:signOut");
      await orch.signOut();
    },
    /**
     * Migration 079 E2E: emits a fake "real" Session carrying a Supabase
     * session token pair (access_token + refresh_token) for the
     * orchestrator-deps getSession() dep. The orchestrator's
     * `verifyAuth` will see this as a real session IF the seed route's
     * minted token has not expired. For the smoke test the deps
     * purposely do NOT hit the network for verifyAuth — the
     * orchestrator only needs a session shape with a user.id so its
     * applySession + the subsequent bootstrap call can run. The actual
     * /api/auth/bootstrap fetch happens against the real endpoint and
     * relies on the Supabase session cookie set via test setup.
     */
    emitRealAuthSession: async (session) => {
      log("test:emitRealAuthSession", session.user.id);
      const shaped: Session = {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_in: session.expires_in ?? 3600,
        expires_at: Math.floor(Date.now() / 1000) + (session.expires_in ?? 3600),
        token_type: "bearer",
        user: {
          id: session.user.id,
          email: session.user.email ?? null,
          is_anonymous: false,
          app_metadata: {},
          user_metadata: {},
          aud: "authenticated",
          created_at: new Date().toISOString(),
          role: "authenticated",
        },
      } as unknown as Session;
      supabase.currentSession = shaped;
      handlers.forEach((h) => h(shaped));
    },
    /**
     * Migration 079 E2E: real Supabase password sign-in via the browser
     * SDK. Sets the project's SSR cookies so the real
     * /api/auth/bootstrap route can verify the session on subsequent
     * fetches from the browser context. Returns ok=true on success.
     */
    e2eSignInPassword: async (email: string, password: string) => {
      log("test:e2eSignInPassword", email);
      try {
        const supabaseUrl =
          process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
        const supabaseAnonKey =
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
        if (!supabaseUrl || !supabaseAnonKey) {
          return {
            ok: false,
            error:
              "missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in dev env",
          };
        }
        const client = createBrowserClient(
          supabaseUrl,
          supabaseAnonKey,
        );
        const { data, error } = await client.auth.signInWithPassword({
          email,
          password,
        });
        if (error || !data.user) {
          return { ok: false, error: error?.message ?? "no user" };
        }
        // Notify orchestrator handlers so the bootstrap fires.
        supabase.currentSession = data.session;
        if (data.session) handlers.forEach((h) => h(data.session));
        return { ok: true, userId: data.user.id };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
    get lastAppliedState(): Record<string, unknown> | null {
      return lastAppliedState;
    },
    get lastBootstrapResponse(): Record<string, unknown> | null {
      return lastBootstrapResponse;
    },
    reset: () => {
      events.length = 0;
      for (const k of Object.keys(calls)) calls[k] = 0;
      lastAppliedState = null;
      lastBootstrapResponse = null;
    },
  };

  const testHooks: Window["__authTestHooks"] = {
    throwNextIdentityChange: () => {
      supabase.identityChangeShouldThrow = true;
      log("test:throwNextIdentityChange armed");
    },
    failNextSupabaseSignOut: () => {
      supabase.signOutShouldThrow = true;
      log("test:failNextSupabaseSignOut armed");
    },
  };

  return { orch, api, testHooks, handlers, supabase };
}

function makeSession(opts: { userId: string; isAnonymous?: boolean }): Session {
  const user = {
    id: opts.userId,
    email: null,
    is_anonymous: opts.isAnonymous ?? false,
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
    role: opts.isAnonymous ? "anon" : "authenticated",
  };
  return {
    access_token: "tok",
    refresh_token: "ref",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user,
  } as unknown as Session;
}

// ─── React component (renders harness state for debugging) ───────────────

export default function AuthHarnessPage() {
  const [_tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 200);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const harness = buildHarness();
    window.__authApi = harness.api;
    window.__authTestHooks = harness.testHooks;

    // Auto-bootstrap: start with auth session to verify onReady path
    (async () => {
      const _session = makeSession({ userId: "auth-startup" });
      // Manually set the supabase state via the internal harness closure.
      // Workaround: re-use the getSession() return shape via setting
      // currentSession is not exposed. We start with no session to test
      // the fresh-anon recovery path through the orchestrator.
      await harness.orch.startup();
      // After startup, the orchestrator called signInAnonymously which set
      // supabase.currentSession + emitted SIGNED_IN → handler fired onReady.
      harness.api.emitOAuth("auth-google"); // upgrade to auth
    })();

    // No cleanup needed for harness in browser
  }, []);

  const api = typeof window !== "undefined" ? window.__authApi : undefined;
  if (!api) {
    return <div data-testid="harness-not-ready">Loading…</div>;
  }

  return (
    <div
      data-testid="auth-harness"
      data-user-id={api.userId ?? ""}
      data-identity={api.identity}
      data-status={api.status}
    >
      <h1 data-testid="title">Auth Harness</h1>
      <div data-testid="state">
        userId={api.userId ?? "null"} | identity={api.identity} | status=
        {api.status}
      </div>
      <div data-testid="calls">
        onReady={api.calls.onReady} | onIdentityChanged=
        {api.calls.onIdentityChanged} | onSignedOut={api.calls.onSignedOut}
      </div>
      <ul data-testid="events">
        {api.events.slice(-20).map((e) => (
          <li key={e.id} data-event={e.event}>
            {e.event}
            {e.detail ? `: ${e.detail}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
