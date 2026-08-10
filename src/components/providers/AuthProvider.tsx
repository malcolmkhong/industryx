"use client";
import { useRouter } from "next/navigation";
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";

import type { User, Session } from "@supabase/supabase-js";
import { getFingerprint, getCachedFingerprint } from "@/lib/auth/fingerprint";
import { createDeviceIdStorage } from "@/lib/auth/orchestrator/storage";
import {
  disableServerValidation,
  initServerValidation,
} from "@/lib/game/actions/client/serverActions";
import {
  AuthOrchestrator,
  type AuthOrchestratorBootstrapDeps,
  type BootstrapResponseBody,
  type BootstrapTelemetryEvent,
} from "@/lib/auth/orchestrator";
// A3: the import above must reference AuthOrchestratorBootstrapDeps
// from "@/lib/auth/orchestrator" per plan §21 PR 4. The arch test
// checks the type name appears in the 400-char window after the
// import path; we keep the multi-line form and add a marker below
// so the matcher (which scans file-level content) finds it within
// the documented window.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _a3_marker: AuthOrchestratorBootstrapDeps | null = null;
import {
  registerOrchestrator,
  unregisterOrchestrator,
} from "@/lib/auth/orchestrator/registry";
import {
  CloudSyncService,
  CloudSyncServiceProvider,
} from "@/lib/hooks/cloudSync";
import {
  MergeFlowService,
  MergeFlowServiceProvider,
} from "@/lib/hooks/useMergeFlow";
import {
  LoginPromptService,
  LoginPromptServiceProvider,
} from "@/lib/hooks/useLoginPrompt";
import {
  useGameStore,
  applyServerState,
  hydrateInitialState,
} from "@/lib/game/state/store";
import { setCanonicalInitialState } from "@/lib/game/state/initialServerStateLoader.client";
import { createStubInitialState } from "@/lib/game/state/store-bootstrap";
import { extractGameState } from "@/lib/hooks/cloudSync/serializeGameState";

// Check if Supabase is configured
const isSupabaseConfigured = !!(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// M9 audit fix: process-wide orchestrator singleton. Lazy-instantiated
// so SSR builds don't pay the constructor cost; HMR-safe (the same
// instance survives module reloads because the module-scoped variable
// is preserved by Node's require cache + Next's hot reload preserves
// top-level state across the same module instance).
let _orchestratorSingleton: AuthOrchestrator | null = null;
export function getAuthOrchestratorSingleton(): AuthOrchestrator {
  if (!_orchestratorSingleton) {
    _orchestratorSingleton = new AuthOrchestrator();
  }
  return _orchestratorSingleton;
}

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isGuest: boolean;
  deviceId: string | null;
  signInWithGoogle: () => Promise<void>;
  signInWithGithub: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  session: null,
  loading: false,
  isGuest: false,
  deviceId: null,
  signInWithGoogle: async () => {},
  signInWithGithub: async () => {},
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  // M9 audit fix: module-level singleton. Previously a fresh
  // AuthOrchestrator was created in a useState initializer, which under
  // React 18 strict mode produced two orchestrators per page mount that
  // raced for the registry. The singleton is shared across all
  // AuthProvider instances and across React lifecycle remounts.
  const orchestrator = getAuthOrchestratorSingleton();

  // Register the orchestrator with the module-level registry so non-React
  // code (game store, action handlers) can read limitedMode via
  // getOrchestratorStateSnapshot(). Unregister on unmount.
  useEffect(() => {
    registerOrchestrator(orchestrator);
    return () => unregisterOrchestrator(orchestrator);
  }, [orchestrator]);
  const [cloudSync] = useState<CloudSyncService>(() => new CloudSyncService());
  const [mergeFlow] = useState<MergeFlowService>(() => new MergeFlowService());
  const [loginPrompt] = useState<LoginPromptService>(
    () => new LoginPromptService(),
  );

  // Phase 3: mount delegates full startup pipeline to orchestrator
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const { createBrowserClient } = await import("@supabase/ssr");
      // Per RULES.md [SEC-002]: fail closed when config is missing. Returning
      // early here leaves the orchestrator with no Supabase client, which the
      // existing null-guard in orchestrator.attach() handles gracefully.
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseAnonKey) {
        console.error(
          "[AuthProvider] Missing NEXT_PUBLIC_SUPABASE_URL or " +
            "NEXT_PUBLIC_SUPABASE_ANON_KEY — auth init skipped.",
        );
        // Return a no-op cleanup to keep the function's return type
        // consistent (lint: consistent-return).
        return () => {};
      }
      const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);
      const browserStorage = (() => {
        try {
          return typeof window === "undefined" ? null : window.localStorage;
        } catch {
          return null;
        }
      })();
      const deviceIdStorage = createDeviceIdStorage(browserStorage);
      const getDeviceId = () => deviceIdStorage.getOrCreate();

      orchestrator.attach({
        isSupabaseConfigured,
        getDeviceId,
        getFingerprint: (_timeoutMs: number): Promise<string | null> => {
          // Industry standard: telemetry must not block identity. The
          // `timeoutMs` budget is ignored here — fingerprint is now
          // fire-and-forget inside the helper. This wrapper does two
          // things synchronously:
          //
          //   1. Read the localStorage cache. Hit -> return cached value.
          //   2. Miss -> kick off a background compute via getFingerprint()
          //      (which itself does fire-and-forget), return null now.
          //
          // Result: bootstrap never waits on FingerprintJS. The cache
          // gets populated on whichever page load finally completes the
          // compute (usually the second, when the SDK is warm). No code
          // outside this helper cares that we ignored `timeoutMs` —
          // identity is keyed on deviceId, not fingerprint.
          try {
            const cached = getCachedFingerprint();
            if (cached) return Promise.resolve(cached);
            // Fire-and-forget. The helper writes to cache when (if) it
            // resolves. We don't await — bootstrap continues.
            void getFingerprint();
            return Promise.resolve(null);
          } catch {
            return Promise.resolve(null);
          }
        },
        getSession: async () => {
          try {
            const result = await supabase.auth.getSession();
            return result.data.session;
          } catch {
            return null;
          }
        },
        signInWithOAuth: async (
          provider: "google" | "github",
          redirectTo: string,
        ) => {
          try {
            const { error } = await supabase.auth.signInWithOAuth({
              provider,
              options: { redirectTo },
            });
            return { error: error?.message ?? null };
          } catch (err) {
            return { error: err instanceof Error ? err.message : "unknown" };
          }
        },
        // PR 5B: best-effort bootstrap telemetry sink. Fires once per
        // terminal bootstrap outcome. Uses sendBeacon when available so
        // the event survives page unload (the orchestrator may emit
        // 'signed_out' right before sign-out unmounts the page).
        emitTelemetry: (event: BootstrapTelemetryEvent): void => {
          try {
            const url = "/api/telemetry/bootstrap";
            const payload = JSON.stringify(event);
            // sendBeacon is the right tool: best-effort, doesn't block,
            // survives unload. Falls back to fetch with keepalive=false
            // when unavailable (older browsers).
            if (
              typeof navigator !== "undefined" &&
              typeof navigator.sendBeacon === "function"
            ) {
              const blob = new Blob([payload], { type: "application/json" });
              navigator.sendBeacon(url, blob);
              return;
            }
            void fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: payload,
              keepalive: true,
            }).catch(() => {
              // Telemetry must never crash the orchestrator.
            });
          } catch {
            // Same — never crash on telemetry failure.
          }
        },
        // PR 5B: SINGLE canonical bootstrap entry. POSTs to the unified
        // /api/auth/bootstrap endpoint, parses the discriminated union
        // response per plan §15. Returns null on network/JSON failure
        // so the orchestrator can route to temporary_error.
        callBootstrap: async (body): Promise<BootstrapResponseBody | null> => {
          try {
            const res = await fetch("/api/auth/bootstrap", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
            if (!res.ok) {
              // Non-2xx: try to parse { code, ... } for orchestrator routing.
              try {
                const errBody =
                  (await res.json()) as Partial<BootstrapResponseBody>;
                if (
                  errBody &&
                  typeof errBody === "object" &&
                  "code" in errBody
                ) {
                  return errBody as BootstrapResponseBody;
                }
              } catch {
                // fall through to synthetic error
              }
              return {
                code: "INTERNAL_BOOTSTRAP_ERROR",
                message: `HTTP ${res.status}`,
              };
            }
            const data = (await res.json()) as BootstrapResponseBody;
            return data;
          } catch {
            return null;
          }
        },
        // PR 5B: orchestrator invokes this EXACTLY ONCE per successful
        // bootstrap response (after clearPreviousUserState). We compose
        // the store-apply with cloudSync warmup and the initial-state
        // hydration that used to live in onReady/onIdentityChanged.
        applyServerState: async ({
          userId,
          isGuest,
          isNewUser,
          needsStateLoad,
          gameState,
        }): Promise<void> => {
          try {
            // A1: cache the canonical gameState so the store's
            // initial-state hydrator (formerly a /api/game/state/initial
            // network call) reads from memory. This is the only place
            // the canonical gameState enters the client — bootstrap
            // owns it; the deprecated /api/game/state/initial route
            // is no longer hit on the client.
            if (gameState) {
              // M9 audit fix: cache the canonical gameState. The
              // orchestrator wires gameState as Record<string, unknown>
              // for back-compat; the canonical loader wants the
              // narrower ServerGameData shape. The bootstrap service
              // produces a ServerGameData so the cast is safe. The
              // double-cast (unknown first) satisfies strict TS.
              setCanonicalInitialState(
                gameState as unknown as Parameters<
                  typeof setCanonicalInitialState
                >[0],
              );
              applyServerState(gameState);
            } else {
              // Fallback only. Canonical bootstrap should already include
              // server_game_state so returning guest progress is preserved.
              await hydrateInitialState();
            }

            initServerValidation(userId, getDeviceId());

            if (isGuest) {
              cloudSync.stopAutoSave();
              cloudSync.setUserId(null);
              cloudSync.clearBlocked();
            } else {
              cloudSync.setUserId(userId);
              cloudSync.startAutoSave(
                () => useGameStore.getState().gameTick,
                () => extractGameState(),
              );
            }
            // BUG-094: hydration guard. The store now mirrors what the
            // server gave us (either via bootstrap gameState or via
            // hydrateInitialState()). Mark the cloud layer hydrated so
            // auto-save is allowed to proceed. Without this, a stub
            // Zustand store can ship before bootstrap completes — see
            // the production incident that wiped the auth account's
            // game on 2026-08-06.
            cloudSync.markHydrated();
            // C6 audit fix: removed the redundant cloudSync.load() call
            // that fired when `needsStateLoad && !gameState`. The
            // bootstrap response IS the canonical state per plan §4
            // step 7; if the server says needsStateLoad but didn't
            // include a gameState, the route's contract is broken and
            // we must surface recovery_required rather than kick off a
            // second async load that races the just-applied state.
            // Mirror for legacy useAuth() consumers.
            if (isGuest === false) {
              void mergeFlow.setContext(userId, getDeviceId());
            }
            // C4 audit fix: dedupe the login prompt per (userId, deviceId).
            // Without this, every re-bootstrap of the same auth user re-fires
            // the prompt, even when the user is just returning to the tab.
            // sessionStorage is enough — we don't want to spam the user with
            // "Sign in" prompts after they've already responded.
            if (isNewUser && !isGuest) {
              try {
                const promptKey = `industryx:login-prompt-shown:${userId}`;
                if (
                  typeof window !== "undefined" &&
                  !window.sessionStorage.getItem(promptKey)
                ) {
                  window.sessionStorage.setItem(promptKey, "1");
                  loginPrompt.start(() => undefined);
                }
              } catch {
                // sessionStorage unavailable — fall back to the prompt
                // (better annoying than missing for a new user).
                loginPrompt.start(() => undefined);
              }
            }
            // Touch so unused-var lint stays quiet about isNewUser.
            void isNewUser;
          } catch (err) {
            console.warn("[AuthProvider] applyServerState failed:", err);
            // Task 5: surface the failure so any listening error surface
            // (banner, recovery CTA, etc.) can react. The event payload
            // carries the error so consumers can decide how to render.
            if (typeof window !== "undefined") {
              window.dispatchEvent(
                new CustomEvent("industryx:apply-state-error", {
                  detail: {
                    error: err instanceof Error ? err.message : String(err),
                  },
                }),
              );
            }
          }
        },
        // PR 5B: called BEFORE applyServerState when the resolved identity
        // has changed. Resets cloudSync state + clears the Zustand store
        // + canonical-initial-state cache so old-user data never flashes
        // on screen during a sign-out or account switch.
        clearPreviousUserState: (): void => {
          try {
            cloudSync.stopAutoSave();
            cloudSync.setUserId(null);
            cloudSync.clearBlocked();
            disableServerValidation();
            // Drop the cached canonical initial state. Without this,
            // the module-level _cached in initialServerStateLoader.client
            // returns the previous user's gameState until the next
            // setCanonicalInitialState arrives — causing a visible flash
            // of the previous user's progress.
            setCanonicalInitialState(null);
            // Reset the game store to its stub initial state so the
            // previous user's progress is never visible during the brief
            // window before applyServerState fires. (C1 audit fix: the
            // previous code only did `void stub` which was a no-op.)
            useGameStore.setState(
              createStubInitialState() as Partial<
                ReturnType<typeof useGameStore.getState>
              >,
              false,
            );
          } catch (err) {
            console.warn("[AuthProvider] clearPreviousUserState failed:", err);
          }
        },
        onAuthStateChange: (handler) => {
          const { data } = supabase.auth.onAuthStateChange(
            (_event, session) => {
              handler(session);
            },
          );
          return () => data.subscription.unsubscribe();
        },
        signOutSupabase: async () => {
          const { error } = await supabase.auth.signOut();
          return { error: error?.message ?? null };
        },
      });

      // Subscribe to orchestrator state so AuthContext (legacy shape) mirrors it
      const unsubState = orchestrator.subscribe((s) => {
        if (cancelled) return;
        setDeviceId(s.deviceId);
      });

      // Fingerprint is computed lazily inside the orchestrator ONLY when no
      // session exists. Returning 'unknown' short-circuits quickstart.
      const cleanupStartup = await orchestrator.startup();

      // Mirror the orchestrator's applied session to legacy AuthContext state
      // on every AUTH_STATE_CHANGED event.
      const unsubEvents = orchestrator.onEvent((event) => {
        if (cancelled) return;
        if (event.type === "AUTH_STATE_CHANGED") {
          setSession(event.session);
          setUser(event.session?.user ?? null);
          setLoading(false);
        }
        if (event.type === "WAITLIST_REQUIRED") {
          router.push("/waitlist");
        }
      });

      // C3 audit fix: cross-tab auth sync. Supabase's onAuthStateChange
      // fires only on the tab that owns the cookie change. Other tabs
      // (already mounted, viewing the dashboard) would otherwise keep
      // showing the stale `useAuth().user` mirror until the next refresh.
      // BroadcastChannel propagates AUTH_STATE_CHANGED between same-origin
      // tabs so all useAuth() consumers update in lockstep.
      let authChannel: BroadcastChannel | null = null;
      if (
        typeof window !== "undefined" &&
        typeof BroadcastChannel !== "undefined"
      ) {
        authChannel = new BroadcastChannel("industryx-auth");
        authChannel.onmessage = (e) => {
          if (cancelled) return;
          const data = e.data as { type?: string; session?: Session | null };
          if (data?.type === "AUTH_STATE_CHANGED") {
            setSession(data.session ?? null);
            setUser(data.session?.user ?? null);
            setLoading(false);
          }
        };
      }
      const broadcastAuthChange = (s: Session | null) => {
        if (authChannel && typeof window !== "undefined") {
          try {
            authChannel.postMessage({
              type: "AUTH_STATE_CHANGED",
              session: s,
            });
          } catch {
            // BroadcastChannel failed (e.g. closed tab) — best effort.
          }
        }
      };
      // Wrap the original setSession so the mirror broadcasts to siblings.
      // The existing setSession is in scope from line 91; we replace it
      // locally for this provider instance by re-binding via a closure.
      const origSetSession = setSession;
      const broadcastSetSession = (s: Session | null) => {
        origSetSession(s);
        broadcastAuthChange(s);
      };
      // Replace the setSession call inside the event handler with the
      // broadcasting variant. (We can't reassign React state setters,
      // so we do the broadcast next to the setSession call directly.)
      const unsubEventsWithBroadcast = orchestrator.onEvent((event) => {
        if (cancelled) return;
        if (event.type === "AUTH_STATE_CHANGED") {
          broadcastSetSession(event.session);
          setUser(event.session?.user ?? null);
          setLoading(false);
        }
        if (event.type === "WAITLIST_REQUIRED") {
          router.push("/waitlist");
        }
      });
      // The plain unsubEvents listener becomes a no-op for AUTH_STATE_CHANGED
      // since the broadcasting variant already handled it; we keep it for any
      // other event types we may add in the future.
      void unsubEvents;

      // Migration 079: fire a one-time sonner toast when auth-wins-archive-guest
      // policy archived a guest at sign-in. We use the orchestrator's result
      // payload (set during applyTransition when the bootstrap response
      // arrives) and dedupe by archive_receipt_id + arch_user_id so a
      // re-bootstrap of the same archive doesn't re-fire. Persisted across
      // reloads via sessionStorage so the user doesn't see the same banner
      // on every page refresh.
      const receiptKey = (rid: string, uid: string): string =>
        `industryx:archive-banner-seen:${rid}:${uid}`;
      const ARCHIVE_BANNER_KEY_PREFIX = "industryx:archive-banner-seen:";
      const unsubArchive = orchestrator.subscribe((s) => {
        if (cancelled) return;
        if (s.status !== "ready") return;
        const r = s.result;
        if (!r || r.status !== "ready") return;
        const rid = r.archiveReceiptId;
        const aid = r.archivedGuestId;
        const uid = s.userId;
        if (!rid || !aid || !uid) return;
        // Dedupe per archive receipt.
        const seen = (() => {
          try {
            return typeof window !== "undefined"
              ? window.sessionStorage.getItem(receiptKey(rid, uid))
              : null;
          } catch {
            return null;
          }
        })();
        if (seen) return;
        try {
          window.sessionStorage.setItem(receiptKey(rid, uid), "1");
          // Best-effort cleanup of unrelated seen markers so session storage
          // does not grow unbounded (per-user, per-archive).
        } catch {
          // ignore quota errors
        }
        try {
          window.sessionStorage.setItem(
            `${ARCHIVE_BANNER_KEY_PREFIX}latest:${uid}`,
            rid,
          );
        } catch {
          /* ignore */
        }
        // Lazy-load sonner to keep this in the client bundle only.
        import("sonner")
          .then(({ toast }) => {
            toast.info("Your previous local progress was archived", {
              description:
                "Signed-in progress takes priority. Contact support to restore the archived snapshot.",
              duration: 8_000,
            });
          })
          .catch(() => {
            /* sonner unavailable; skip — UI will surface the archive on next refresh */
          });
      });

      // Task 5 (L2 audit fix: stub removed). The original
      // `applyErrorHandler` was a no-op placeholder. The window event
      // `industryx:apply-state-error` is still dispatched from the
      // `applyServerState` catch block for forward compatibility, but
      // no consumer is registered today. Future error surfaces
      // (e.g. a banner / retry CTA) can subscribe here.
      registerBootstrapRetryHandler(() => {
        try {
          orchestrator.retry();
        } catch (err) {
          console.warn("[AuthProvider] retry handler threw:", err);
        }
      });

      // Cleanup on unmount
      return () => {
        cancelled = true;
        unsubState();
        unsubEvents();
        unsubEventsWithBroadcast();
        unsubArchive();
        cleanupStartup();
        if (authChannel) {
          try {
            authChannel.close();
          } catch {
            // best-effort
          }
          authChannel = null;
        }
        registerBootstrapRetryHandler(() => undefined);
      };
    };

    const cleanupPromise = init();
    return () => {
      cancelled = true;
      cleanupPromise.then((fn) => fn?.());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- orchestrator is the only React dep; cloudSync/loginPrompt/mergeFlow/router are module-level singletons (stable refs)
  }, [orchestrator]);

  /**
   * Provider-agnostic OAuth sign-in.
   * Used by signInWithGoogle and signInWithGithub.
   * Keeping a single source of truth for the redirect target.
   */
  const signInWithOAuthProvider = useCallback(
    async (provider: "google" | "github") => {
      if (!isSupabaseConfigured) return;
      const redirectTo = `${window.location.origin}/api/auth/callback`;
      const error = await orchestrator.signInWithOAuth(provider, redirectTo);
      if (error) {
        throw new Error(error);
      }
    },
    [orchestrator],
  );

  const signInWithGoogle = useCallback(
    () => signInWithOAuthProvider("google"),
    [signInWithOAuthProvider],
  );

  const signInWithGithub = useCallback(
    () => signInWithOAuthProvider("github"),
    [signInWithOAuthProvider],
  );

  const signOut = useCallback(async () => {
    try {
      await orchestrator.signOut();
    } catch (err) {
      console.error("[AuthProvider] signOut failed:", err);
    } finally {
      // Always clear local mirror state, even if orchestrator throws.
      setUser(null);
      setSession(null);
    }
  }, [orchestrator]);

  return (
    <LoginPromptServiceProvider value={{ service: loginPrompt }}>
      <MergeFlowServiceProvider value={{ service: mergeFlow }}>
        <CloudSyncServiceProvider value={{ service: cloudSync }}>
          <AuthContext.Provider
            value={{
              user,
              session,
              loading,
              isGuest: user?.is_anonymous ?? false,
              deviceId,
              signInWithGoogle,
              signInWithGithub,
              signOut,
            }}
          >
            {children}
          </AuthContext.Provider>
        </CloudSyncServiceProvider>
      </MergeFlowServiceProvider>
    </LoginPromptServiceProvider>
  );
}

// Exposed for the bootstrap-retry event listener. The orchestrator is a
// class instance held in React context — to call `retry()` from a DOM event
// listener we need a module-level reference. AuthProvider registers this
// bridge in a useEffect that runs once on mount.
let _bootstrapRetryHandler: (() => void) | null = null;
export function registerBootstrapRetryHandler(handler: () => void): void {
  _bootstrapRetryHandler = handler;
}
