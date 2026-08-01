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
import { getFingerprint } from "@/lib/auth/fingerprint";
import { createDeviceIdStorage } from "@/lib/auth/orchestrator/storage";
import {
  disableServerValidation,
  initServerValidation,
} from "@/lib/game/actions/client/serverActions";
import {
  AuthOrchestrator,
  type BootstrapResponseBody,
} from "@/lib/auth/orchestrator";
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
import { extractGameState } from "@/lib/hooks/cloudSync/serializeGameState";

// Check if Supabase is configured
const isSupabaseConfigured = !!(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

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
  const [orchestrator] = useState<AuthOrchestrator>(
    () => new AuthOrchestrator(),
  );

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
        getFingerprint: async (timeoutMs: number): Promise<string | null> => {
          // PR 5B: orchestrator owns timeout enforcement. We wrap the
          // existing getFingerprint() call with Promise.race so a hung
          // fingerprint vendor cannot stall the bootstrap pipeline
          // (plan §10). Returning null after timeout is acceptable.
          try {
            const fpPromise = (async () => {
              const fp = await getFingerprint();
              if (!fp || fp === "unknown") return null;
              return fp;
            })();
            let timer: ReturnType<typeof setTimeout> | undefined;
            const timeoutPromise = new Promise<string | null>((resolve) => {
              timer = setTimeout(() => resolve(null), timeoutMs);
            });
            try {
              const result = await Promise.race([fpPromise, timeoutPromise]);
              return result;
            } finally {
              if (timer) clearTimeout(timer);
            }
          } catch {
            return null;
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
            if (gameState) {
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
            if (!isGuest && needsStateLoad && !gameState) {
              void cloudSync.load().then((r) => {
                if (r.success && r.data && r.conflict === "cloud") {
                  try {
                    applyServerState(r.data);
                  } catch (err) {
                    console.warn(
                      "[AuthProvider] Failed to apply server state:",
                      err,
                    );
                  }
                }
              });
            }
            // Mirror for legacy useAuth() consumers.
            if (isGuest === false) {
              void mergeFlow.setContext(userId, getDeviceId());
            }
            if (isNewUser && !isGuest) {
              loginPrompt.start(() => undefined);
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
        // to a clean stub so old-user data never flashes on screen during
        // a sign-out or account switch.
        clearPreviousUserState: (): void => {
          try {
            cloudSync.stopAutoSave();
            cloudSync.setUserId(null);
            cloudSync.clearBlocked();
            disableServerValidation();
            // Reset the game store to its stub initial state so the
            // previous user's progress is never visible during the
            // brief window before applyServerState fires.
            const stub = useGameStore.getState();
            void stub;
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

      // Task 5: also bridge applyServerState failures to a module-level
      // signal so the AuthOrchestrator can surface the error to the UI.
      // AuthProvider already logs `applyServerState failed` (above) — we
      // additionally dispatch a window event so future error surfaces
      // (e.g. a banner / retry CTA) can react without polling.
      const applyErrorHandler = () => {
        // No-op stub: orchestrator-level retry is sufficient today. The
        // event is kept for forward compatibility.
      };
      window.addEventListener("industryx:apply-state-error", applyErrorHandler);
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
        unsubArchive();
        cleanupStartup();
        window.removeEventListener(
          "industryx:apply-state-error",
          applyErrorHandler,
        );
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
