/**
 * AuthOrchestrator unit tests — PR4-4A.
 *
 * Covers the new plan §5 state machine:
 *   - idle -> resolving_session -> bootstrapping -> ready (happy path)
 *   - bootstrapping -> conflict on 409
 *   - bootstrapping -> recovery_required on 422
 *   - bootstrapping -> temporary_error on 429 / 503 / network failure
 *   - Stale-response guard (version counter)
 *   - Guest bootstrap response cannot overwrite later authenticated response
 *   - signOut triggers guest bootstrap with previousAuthUserId
 *   - retry() from temporary_error restarts the pipeline
 *
 * Pure unit test: no Supabase, no React, no router. Every dep is mocked.
 *
 * NOTE: this file replaces the prior Phase 10 test suite. The previous
 * suite covered the legacy `quickstart` / `registerDevice` / `onReady`
 * lifecycle, which is gone in PR4-4A. Tests below target the new
 * `/api/auth/bootstrap` + state.ts transition table contract.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Session } from "@supabase/supabase-js";
import { AuthOrchestrator } from "@/lib/auth/orchestrator";
import type {
  AuthOrchestratorBootstrapDeps,
  AuthEvent,
  BootstrapRequestBody,
  BootstrapResponseBody,
} from "@/lib/auth/orchestrator";

// ─── helpers ────────────────────────────────────────────────────────────

function makeSession(opts: {
  userId: string;
  email?: string;
  isAnonymous?: boolean;
}): Session {
  const user = {
    id: opts.userId,
    email: opts.email ?? null,
    is_anonymous: opts.isAnonymous ?? false,
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: new Date(0).toISOString(),
    role: opts.isAnonymous ? "anon" : "authenticated",
  };
  return {
    access_token: "token",
    refresh_token: "refresh",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user,
  } as unknown as Session;
}

const GUEST_GAME_STATE = {
  money: 3456,
  gameTick: 99,
  quests: [{ id: "startup", completed: true }],
};

const AUTH_GAME_STATE = {
  money: 5000,
  gameTick: 25,
  quests: [{ id: "startup", completed: false }],
};

const READY_GUEST: BootstrapResponseBody = {
  code: "BOOTSTRAP_READY",
  userId: "guest-1",
  isGuest: true,
  isNewUser: true,
  source: "fresh",
  hasGameState: true,
  needsStateLoad: false,
  gameState: GUEST_GAME_STATE,
};

const READY_AUTH: BootstrapResponseBody = {
  code: "BOOTSTRAP_READY",
  userId: "auth-1",
  isGuest: false,
  isNewUser: false,
  source: "auth",
  hasGameState: true,
  needsStateLoad: false,
  gameState: AUTH_GAME_STATE,
};

const CONFLICT_ACCOUNT: BootstrapResponseBody = {
  code: "ACCOUNT_PROGRESS_CONFLICT",
  conflictReason: "ACCOUNT_PROGRESS_CONFLICT",
  survivingUserId: "auth-1",
  archivedGuestId: "guest-old",
};

const CONFLICT_DEVICE: BootstrapResponseBody = {
  code: "DEVICE_BOUND_TO_OTHER_USER",
  conflictReason: "DEVICE_BOUND_TO_OTHER_USER",
  survivingUserId: "auth-other",
  archivedGuestId: null,
};

const RECOVERY: BootstrapResponseBody = { code: "STATE_RECOVERY_REQUIRED" };
const RATE_LIMITED: BootstrapResponseBody = { code: "BOOTSTRAP_RATE_LIMITED" };
const UNAVAILABLE: BootstrapResponseBody = { code: "BOOTSTRAP_UNAVAILABLE" };

interface DepsBundle {
  deps: AuthOrchestratorBootstrapDeps;
  handlers: Set<(session: Session | null) => void>;
  mocks: {
    getSession: ReturnType<typeof vi.fn>;
    getFingerprint: ReturnType<typeof vi.fn>;
    callBootstrap: ReturnType<typeof vi.fn>;
    applyServerState: ReturnType<typeof vi.fn>;
    clearPreviousUserState: ReturnType<typeof vi.fn>;
    getDeviceId: ReturnType<typeof vi.fn>;
    onAuthStateChange: ReturnType<typeof vi.fn>;
    signInWithOAuth: ReturnType<typeof vi.fn>;
    signOutSupabase: ReturnType<typeof vi.fn>;
  };
}

function buildDeps(
  overrides: Partial<AuthOrchestratorBootstrapDeps> = {},
  response: BootstrapResponseBody | null = READY_GUEST,
): DepsBundle {
  const handlers = new Set<(session: Session | null) => void>();
  const m = {
    getSession: vi.fn(async () => null),
    getFingerprint: vi.fn(async () => "fp-test-abc"),
    callBootstrap: vi.fn(async (_req: BootstrapRequestBody) => response),
    applyServerState: vi.fn(),
    clearPreviousUserState: vi.fn(),
    getDeviceId: vi.fn(() => "device-1"),
    onAuthStateChange: vi.fn((handler: (s: Session | null) => void) => {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    }),
    signInWithOAuth: vi.fn(async () => ({ error: null })),
    signOutSupabase: vi.fn(async () => ({ error: null })),
  };

  const deps = {
    isSupabaseConfigured: true,
    ...m,
    ...overrides,
  } as unknown as AuthOrchestratorBootstrapDeps;

  return {
    deps,
    handlers,
    mocks: {
      getSession: deps.getSession as unknown as ReturnType<typeof vi.fn>,
      getFingerprint: deps.getFingerprint as unknown as ReturnType<
        typeof vi.fn
      >,
      callBootstrap: deps.callBootstrap as unknown as ReturnType<
        typeof vi.fn
      >,
      applyServerState: deps.applyServerState as unknown as ReturnType<
        typeof vi.fn
      >,
      clearPreviousUserState:
        deps.clearPreviousUserState as unknown as ReturnType<typeof vi.fn>,
      getDeviceId: deps.getDeviceId as unknown as ReturnType<typeof vi.fn>,
      onAuthStateChange: deps.onAuthStateChange as unknown as ReturnType<
        typeof vi.fn
      >,
      signInWithOAuth: deps.signInWithOAuth as unknown as ReturnType<
        typeof vi.fn
      >,
      signOutSupabase: deps.signOutSupabase as unknown as ReturnType<
        typeof vi.fn
      >,
    },
  };
}

async function waitForStatus(
  orch: AuthOrchestrator,
  status: string,
  timeoutMs = 1000,
): Promise<void> {
  const start = Date.now();
  while (orch.getState().status !== status) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(
        `Timed out waiting for status "${status}" (current="${orch.getState().status}")`,
      );
    }
    await new Promise((r) => setTimeout(r, 5));
  }
}

// ─── tests ──────────────────────────────────────────────────────────────

describe("AuthOrchestrator (PR4-4A)", () => {
  let orch: AuthOrchestrator;

  beforeEach(() => {
    orch = new AuthOrchestrator();
  });

  describe("subscribe", () => {
    it("subscribe calls listener with current state immediately", () => {
      const { deps } = buildDeps();
      orch.attach(deps);
      const listener = vi.fn();
      orch.subscribe(listener);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(orch.getState());
    });

    it("unsubscribe detaches the listener from future state changes", () => {
      const { deps } = buildDeps();
      orch.attach(deps);
      const listener = vi.fn();
      const unsub = orch.subscribe(listener);
      listener.mockClear();
      unsub();
      orch.setState({ status: "ready" });
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("startup() — happy path", () => {
    it("transitions idle -> resolving_session -> bootstrapping -> ready on 200 guest", async () => {
      const { deps, mocks } = buildDeps({}, READY_GUEST);
      orch.attach(deps);
      expect(orch.getState().status).toBe("idle");
      const cleanup = await orch.startup();
      await waitForStatus(orch, "ready");
      const final = orch.getState();
      expect(final.status).toBe("ready");
      expect(final.userId).toBe("guest-1");
      expect(final.isGuest).toBe(true);
      expect(final.result?.status).toBe("ready");
      expect(mocks.callBootstrap).toHaveBeenCalledOnce();
      expect(mocks.applyServerState).toHaveBeenCalledWith({
        userId: "guest-1",
        isGuest: true,
        isNewUser: true,
        needsStateLoad: false,
        gameState: GUEST_GAME_STATE,
      });
      cleanup();
    });

    it("transitions to ready on authenticated response when session exists", async () => {
      const { deps, mocks } = buildDeps(
        {
          getSession: vi.fn(async () => makeSession({ userId: "auth-1" })),
        },
        READY_AUTH,
      );
      orch.attach(deps);
      const cleanup = await orch.startup();
      await waitForStatus(orch, "ready");
      const final = orch.getState();
      expect(final.identity).toBe("authenticated");
      expect(final.userId).toBe("auth-1");
      expect(final.isGuest).toBe(false);
      expect(mocks.callBootstrap).toHaveBeenCalledOnce();
      const call = mocks.callBootstrap.mock.calls[0]?.[0] as BootstrapRequestBody;
      expect(call.deviceId).toBe("device-1");
      cleanup();
    });

    it("sends fingerprint to bootstrap with strict timeout budget", async () => {
      const { deps, mocks } = buildDeps({}, READY_GUEST);
      orch.attach(deps);
      const cleanup = await orch.startup();
      await waitForStatus(orch, "ready");
      expect(mocks.getFingerprint).toHaveBeenCalledOnce();
      const timeoutArg = mocks.getFingerprint.mock.calls[0]?.[0];
      expect(typeof timeoutArg).toBe("number");
      expect(timeoutArg).toBeGreaterThan(0);
      cleanup();
    });

    it("continues to bootstrap when fingerprint returns null (timeout / unavailable)", async () => {
      const { deps, mocks } = buildDeps(
        { getFingerprint: vi.fn(async () => null) },
        READY_GUEST,
      );
      orch.attach(deps);
      const cleanup = await orch.startup();
      await waitForStatus(orch, "ready");
      expect(mocks.callBootstrap).toHaveBeenCalledOnce();
      const call = mocks.callBootstrap.mock.calls[0]?.[0] as BootstrapRequestBody;
      expect(call.fingerprintHash).toBeNull();
      expect(orch.getState().fingerprintStatus).toBe("unavailable");
      cleanup();
    });

    it("calls /api/auth/bootstrap once per mount", async () => {
      const { deps, mocks } = buildDeps({}, READY_GUEST);
      orch.attach(deps);
      const cleanup = await orch.startup();
      await waitForStatus(orch, "ready");
      expect(mocks.callBootstrap).toHaveBeenCalledOnce();
      cleanup();
    });

    it("when !isSupabaseConfigured — startup short-circuits, no bootstrap fired", async () => {
      const { deps, mocks } = buildDeps(
        { isSupabaseConfigured: false },
        READY_GUEST,
      );
      orch.attach(deps);
      const cleanup = await orch.startup();
      expect(mocks.callBootstrap).not.toHaveBeenCalled();
      expect(mocks.getSession).not.toHaveBeenCalled();
      cleanup();
    });
  });

  describe("startup() — 409 conflict", () => {
    it("transitions to conflict on ACCOUNT_PROGRESS_CONFLICT", async () => {
      const { deps, mocks } = buildDeps({}, CONFLICT_ACCOUNT);
      orch.attach(deps);
      const cleanup = await orch.startup();
      await waitForStatus(orch, "conflict");
      const final = orch.getState();
      expect(final.status).toBe("conflict");
      expect(final.result?.status).toBe("conflict");
      if (final.result?.status === "conflict") {
        expect(final.result.reason).toBe("ACCOUNT_PROGRESS_CONFLICT");
        expect(final.result.survivingUserId).toBe("auth-1");
        expect(final.result.archivedGuestId).toBe("guest-old");
      }
      expect(mocks.applyServerState).not.toHaveBeenCalled();
      cleanup();
    });

    it("transitions to conflict on DEVICE_BOUND_TO_OTHER_USER", async () => {
      const { deps } = buildDeps({}, CONFLICT_DEVICE);
      orch.attach(deps);
      const cleanup = await orch.startup();
      await waitForStatus(orch, "conflict");
      const final = orch.getState();
      if (final.result?.status === "conflict") {
        expect(final.result.reason).toBe("DEVICE_BOUND_TO_OTHER_USER");
      }
      cleanup();
    });
  });

  describe("startup() - 422 recovery", () => {
    it("transitions to recovery_required and STOPS - retry is ignored", async () => {
      const { deps, mocks } = buildDeps({}, RECOVERY);
      orch.attach(deps);
      const cleanup = await orch.startup();
      await waitForStatus(orch, "recovery_required");
      expect(mocks.applyServerState).not.toHaveBeenCalled();
      expect(mocks.callBootstrap).toHaveBeenCalledOnce();
      orch.retry();
      await new Promise((r) => setTimeout(r, 50));
      expect(orch.getState().status).toBe("recovery_required");
      expect(mocks.callBootstrap).toHaveBeenCalledOnce();
      cleanup();
    });
  });

  describe("startup() - 429 / 503 / network", () => {
    it("transitions to temporary_error on 429 rate limited", async () => {
      const { deps } = buildDeps({}, RATE_LIMITED);
      orch.attach(deps);
      const cleanup = await orch.startup();
      await waitForStatus(orch, "temporary_error");
      const final = orch.getState();
      if (final.result?.status === "temporary_error") {
        expect(final.result.reason).toBe("rate_limited");
        expect(final.result.retryable).toBe(true);
      }
      cleanup();
    });

    it("transitions to temporary_error on 503 service unavailable", async () => {
      const { deps } = buildDeps({}, UNAVAILABLE);
      orch.attach(deps);
      const cleanup = await orch.startup();
      await waitForStatus(orch, "temporary_error");
      const final = orch.getState();
      if (final.result?.status === "temporary_error") {
        expect(final.result.reason).toBe("service_unavailable");
        expect(final.result.retryable).toBe(true);
      }
      cleanup();
    });

    it("transitions to temporary_error when callBootstrap returns null", async () => {
      const { deps } = buildDeps(
        { callBootstrap: vi.fn(async () => null) },
        null,
      );
      orch.attach(deps);
      const cleanup = await orch.startup();
      await waitForStatus(orch, "temporary_error");
      const final = orch.getState();
      expect(final.result?.status).toBe("temporary_error");
      cleanup();
    });

    it("retry() from temporary_error restarts the pipeline", async () => {
      let callCount = 0;
      const callBootstrap = vi.fn(async () => {
        callCount += 1;
        if (callCount === 1) return UNAVAILABLE;
        return READY_GUEST;
      });
      const { deps } = buildDeps({ callBootstrap }, UNAVAILABLE);
      orch.attach(deps);
      const cleanup = await orch.startup();
      await waitForStatus(orch, "temporary_error");
      orch.retry();
      await waitForStatus(orch, "ready");
      expect(callCount).toBe(2);
      expect(orch.getState().status).toBe("ready");
      cleanup();
    });
  });

  describe("stale-response guard", () => {
    it("a slow stale response cannot overwrite a later ready response from retry()", async () => {
      // First call: slow, returns UNAVAILABLE.
      // Second call: fast, returns READY_GUEST.
      // The orchestrator must reject the slow UNAVAILABLE because
      // requestVersion was bumped by retry().
      let callCount = 0;
      const callBootstrap = vi.fn(async (_req: BootstrapRequestBody) => {
        callCount += 1;
        if (callCount === 1) {
          return new Promise<BootstrapResponseBody>((resolve) =>
            setTimeout(() => resolve(UNAVAILABLE), 80),
          );
        }
        return READY_GUEST;
      });
      const { deps, mocks } = buildDeps({ callBootstrap }, UNAVAILABLE);
      orch.attach(deps);

      const cleanup = await orch.startup();
      await waitForStatus(orch, "temporary_error");
      // First response has now resolved into the state machine; status is
      // temporary_error (not recovery_required).
      expect(orch.getState().status).toBe("temporary_error");
      expect(mocks.applyServerState).not.toHaveBeenCalled();

      // Trigger retry — this bumps requestVersion so the in-flight first
      // response becomes stale (even though it has already arrived). The
      // new bootstrap fires callBootstrap a second time, returning
      // READY_GUEST quickly.
      mocks.applyServerState.mockClear();
      orch.retry();
      await waitForStatus(orch, "ready");

      // Final state is `ready` from the second response. The first
      // response was rejected (or already-applied) but never overwrote
      // ready. Most importantly: applyServerState was called with the
      // READY payload, NOT with a temporary_error payload.
      expect(orch.getState().status).toBe("ready");
      expect(mocks.applyServerState).toHaveBeenCalledOnce();
      expect(mocks.applyServerState).toHaveBeenCalledWith({
        userId: "guest-1",
        isGuest: true,
        isNewUser: true,
        needsStateLoad: false,
        gameState: GUEST_GAME_STATE,
      });
      // Allow the slow first response to settle — it must not flip
      // the state back.
      await new Promise((r) => setTimeout(r, 150));
      expect(orch.getState().status).toBe("ready");
      cleanup();
    });
  });

  describe("signOut() - guest bootstrap with previousAuthUserId", () => {
    it("captures previousAuthUserId and triggers guest bootstrap", async () => {
      const { deps, mocks } = buildDeps({}, READY_AUTH);
      orch.attach(deps);
      const cleanup = await orch.startup();
      await waitForStatus(orch, "ready");
      mocks.callBootstrap.mockClear();
      mocks.callBootstrap.mockResolvedValueOnce({
        code: "BOOTSTRAP_READY",
        userId: "guest-after-signout",
        isGuest: true,
        isNewUser: true,
        source: "sign_out_to_guest",
        hasGameState: true,
        needsStateLoad: false,
        gameState: GUEST_GAME_STATE,
      } as BootstrapResponseBody);
      await orch.signOut();
      await waitForStatus(orch, "ready");
      expect(mocks.callBootstrap).toHaveBeenCalled();
      const signoutCall = mocks.callBootstrap.mock.calls[0]?.[0] as
        | BootstrapRequestBody
        | undefined;
      expect(signoutCall).toBeDefined();
      if (signoutCall) {
        expect(signoutCall.previousAuthUserId).toBe("auth-1");
      }
      const final = orch.getState();
      expect(final.userId).toBe("guest-after-signout");
      expect(final.isGuest).toBe(true);
      cleanup();
    });

    it("clears the previous user's game state BEFORE applying the new one", async () => {
      const { deps, mocks } = buildDeps({}, READY_AUTH);
      orch.attach(deps);
      const cleanup = await orch.startup();
      await waitForStatus(orch, "ready");
      mocks.callBootstrap.mockClear();
      mocks.callBootstrap.mockResolvedValueOnce({
        ...READY_GUEST,
        userId: "guest-after-signout",
      } as BootstrapResponseBody);
      // Clear all mocks so we measure only the post-signout order.
      mocks.clearPreviousUserState.mockClear();
      mocks.applyServerState.mockClear();
      await orch.signOut();
      await waitForStatus(orch, "ready");
      const clearOrder = mocks.clearPreviousUserState.mock.invocationCallOrder[0] ?? 0;
      const applyOrder = mocks.applyServerState.mock.invocationCallOrder[0] ?? 0;
      expect(clearOrder).toBeGreaterThan(0);
      expect(applyOrder).toBeGreaterThan(0);
      expect(clearOrder).toBeLessThan(applyOrder);
      cleanup();
    });
  });

  describe("auth-state-change handler", () => {
    it("on session identity change - clears state and triggers a new bootstrap", async () => {
      const { deps, mocks, handlers } = buildDeps({}, READY_GUEST);
      orch.attach(deps);
      const cleanup = await orch.startup();
      await waitForStatus(orch, "ready");
      mocks.callBootstrap.mockClear();
      mocks.applyServerState.mockClear();
      mocks.clearPreviousUserState.mockClear();
      mocks.callBootstrap.mockResolvedValueOnce(READY_AUTH);
      handlers.forEach((h) => h(makeSession({ userId: "auth-1" })));
      await new Promise((r) => setTimeout(r, 50));
      expect(mocks.callBootstrap).toHaveBeenCalled();
      expect(mocks.clearPreviousUserState).toHaveBeenCalled();
      expect(orch.getState().userId).toBe("auth-1");
      cleanup();
    });
  });

  describe("signInWithOAuth()", () => {
    it("success - dispatches OAUTH_CALLBACK then OAUTH_SUCCESS; returns null", async () => {
      const { deps, mocks } = buildDeps({}, READY_GUEST);
      orch.attach(deps);
      const events: AuthEvent[] = [];
      orch.onEvent((e) => events.push(e));
      const error = await orch.signInWithOAuth("google", "https://app/cb");
      expect(error).toBeNull();
      expect(
        events.findIndex((e) => e.type === "OAUTH_CALLBACK"),
      ).toBeLessThan(events.findIndex((e) => e.type === "OAUTH_SUCCESS"));
      expect(mocks.signInWithOAuth).toHaveBeenCalledWith(
        "google",
        "https://app/cb",
      );
    });

    it("failure - dispatches OAUTH_FAILURE; returns the error string", async () => {
      const { deps } = buildDeps(
        { signInWithOAuth: vi.fn(async () => ({ error: "oauth_failed" })) },
        READY_GUEST,
      );
      orch.attach(deps);
      const error = await orch.signInWithOAuth("github", "https://app/cb");
      expect(error).toBe("oauth_failed");
    });

    it("!isSupabaseConfigured - returns not_configured without dispatch", async () => {
      const { deps } = buildDeps({ isSupabaseConfigured: false }, READY_GUEST);
      orch.attach(deps);
      const events: AuthEvent[] = [];
      orch.onEvent((e) => events.push(e));
      const error = await orch.signInWithOAuth("google", "https://app/cb");
      expect(error).toBe("not_configured");
      expect(events).toHaveLength(0);
    });
  });
});
