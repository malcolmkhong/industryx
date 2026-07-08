"use client";
import { useRouter } from "next/navigation";
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";

import {
  initServerValidation,
  disableServerValidation,
} from "@/lib/game/serverActions";
import type { User, Session } from "@supabase/supabase-js";
import { getFingerprint, getFingerprintResult } from "@/lib/auth/fingerprint";
import { DEVICE_ID_STORAGE_KEY } from "@/lib/auth/orchestrator/storage";
import { AuthOrchestrator } from "@/lib/auth/orchestrator";
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
import { useGameStore, applyServerState } from "@/lib/game/store";
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

const DEVICE_ID_KEY = DEVICE_ID_STORAGE_KEY;

function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

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
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );

      orchestrator.attach({
        isSupabaseConfigured,
        getDeviceId: getOrCreateDeviceId,
        getFingerprint: async (): Promise<string | null> => {
          try {
            // getFingerprint() returns either a real visitorId or the
            // __fingerprint_unavailable__ sentinel. The literal "unknown"
            // is reserved for SSR (no window) and is mapped to null so
            // the orchestrator treats it as "skip quickstart" (the legacy
            // short-circuit behavior).
            const fp = await getFingerprint();
            if (!fp || fp === "unknown") return null;
            return fp;
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
        registerDevice: async (deviceId, fingerprint, fingerprintHash) => {
          try {
            const res = await fetch("/api/auth/register-device", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ deviceId, fingerprint, fingerprintHash }),
            });
            if (!res.ok) {
              return { ok: false, alreadyExists: false };
            }
            const data = (await res.json()) as {
              registered?: boolean;
              alreadyExists?: boolean;
              reason?: string;
            };
            return {
              ok: !!data.registered,
              alreadyExists: !!data.alreadyExists,
              reason: data.reason,
            };
          } catch {
            return { ok: false, alreadyExists: false };
          }
        },
        /** SINGLE entry point for anon startup. Server consolidates
         *  deviceId lookup, fingerprint fallback, user creation, identity
         *  registration, and game state init.
         *  The new contract accepts the __fingerprint_unavailable__
         *  sentinel; the server falls through to deviceId-only dedupe
         *  and reports `limited: true` in the response. */
        quickstart: async (
          deviceId: string,
          fingerprintHash: string | null,
        ) => {
          if (!fingerprintHash || fingerprintHash === "unknown") {
            // Only SSR ("unknown") short-circuits. The unavailable
            // sentinel is a real value and is forwarded to the server.
            return {
              userId: null,
              source: null,
              isNewUser: null,
              limited: null,
              error: "fingerprint_required",
            };
          }
          try {
            // Telemetry headers: send the failure reason + platform
            // (if the client knows) so the server can log them.
            const fpResult = await getFingerprintResult().catch(() => null);
            const reason =
              fpResult?.status === "unavailable" ? fpResult.reason : "unknown";
            const platform =
              typeof navigator !== "undefined"
                ? ((
                    navigator as Navigator & {
                      userAgentData?: { platform?: string };
                    }
                  ).userAgentData?.platform ??
                  navigator.platform ??
                  null)
                : null;

            const res = await fetch("/api/auth/quickstart", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-fp-reason": reason,
                ...(platform ? { "x-fp-platform": platform } : {}),
              },
              body: JSON.stringify({ deviceId, fingerprint: fingerprintHash }),
            });
            if (res.status === 503) {
              const body = await res.json().catch(() => ({}));
              if (body?.error === "capacity_full") {
                return {
                  userId: null,
                  source: null,
                  isNewUser: null,
                  limited: null,
                  error: "capacity_full",
                };
              }
            }
            const data = (await res.json()) as {
              userId?: string;
              source?: "deviceId" | "fingerprint" | "fresh";
              isNewUser?: boolean;
              limited?: boolean;
              error?: string;
            };
            if (data.error) {
              return {
                userId: null,
                source: data.source ?? null,
                isNewUser: data.isNewUser ?? null,
                limited: data.limited ?? null,
                error: data.error,
              };
            }
            return {
              userId: data.userId ?? null,
              source: data.source ?? null,
              isNewUser: data.isNewUser ?? null,
              limited: data.limited ?? null,
              error: null,
            };
          } catch (err) {
            return {
              userId: null,
              source: null,
              isNewUser: null,
              limited: null,
              error: err instanceof Error ? err.message : "unknown",
            };
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
        disableServerValidation,
        initServerValidation,
        onReady: (userId: string) => {
          cloudSync.setUserId(userId);
          cloudSync.startAutoSave(
            () => useGameStore.getState().gameTick,
            () => extractGameState(),
          );
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
        },
        onIdentityChanged: (userId: string) => {
          cloudSync.setUserId(userId);
          cloudSync.startAutoSave(
            () => useGameStore.getState().gameTick,
            () => extractGameState(),
          );
        },
        onSignedOut: () => {
          cloudSync.stopAutoSave();
          cloudSync.setUserId(null);
        },
        runMergeCheck: async (userId: string, deviceId: string) => {
          mergeFlow.setContext(userId, deviceId);
          await mergeFlow.startMergeCheck();
        },
        resetMerge: () => {
          mergeFlow.reset();
        },
        startLoginPrompts: (requestLogin) => {
          loginPrompt.start(requestLogin);
        },
        stopLoginPrompts: () => {
          loginPrompt.stop();
          loginPrompt.reset();
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

      // Cleanup on unmount
      return () => {
        cancelled = true;
        unsubState();
        unsubEvents();
        cleanupStartup();
      };
    };

    const cleanupPromise = init();
    return () => {
      cancelled = true;
      cleanupPromise.then((fn) => fn?.());
    };
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
