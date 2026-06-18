'use client';

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { User, Session } from '@supabase/supabase-js';
import { initServerValidation, disableServerValidation } from '@/lib/game/serverActions';

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
  signInAnonymously: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  session: null,
  loading: false,
  isGuest: false,
  deviceId: null,
  signInAnonymously: async () => {},
  signInWithGoogle: async () => {},
  signOut: async () => {},
});

const DEVICE_ID_KEY = 'factory-dominion-device-id';

function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return '';
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
  const signingInRef = useRef(false);

  // Phase 1.2: Auto-create anonymous identity on first pageload (zero clicks)
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    const devId = getOrCreateDeviceId();
    setDeviceId(devId);

    let mounted = true;

    const initAuth = async () => {
      const { createBrowserClient } = await import('@supabase/ssr');
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );

      let session: Session | null = null;
      try {
        const result = await supabase.auth.getSession();
        session = result.data.session;
      } catch (err) {
        console.warn('[Auth] getSession failed (Supabase unreachable?):', err);
      }

      if (mounted) {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);

        if (session?.user?.id) {
          initServerValidation(session.user.id);
        }
      }

      // Phase 1.2 + AUDIT_FIXES_2026_06_18.md P0-#2:
      // If no session, try device-based recovery. Supabase can't createSession
      // for an existing anon user, so the recovery flow is:
      //   1. recover-by-device → tells us "yes, a guest for this device exists"
      //   2. signInAnonymously() → creates a fresh auth.users row
      //   3. claim-guest → re-assigns the old guest's server data to the new user
      //   4. onAuthStateChange (subscribed below) picks up the new session and
      //      updates context state.
      if (mounted && !session) {
        let shouldClaim = false;
        try {
          const recoverRes = await fetch('/api/auth/recover-by-device', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId: devId }),
          });
          if (recoverRes.ok) {
            const data = (await recoverRes.json()) as {
              recovered?: boolean;
              recoveredAs?: string;
              userId?: string;
            };
            if (data.recoveredAs === 'recovered' || data.recovered === true) {
              shouldClaim = true;
            }
          }
        } catch (err) {
          console.warn('[Auth] Device recovery failed:', err);
        }

        // Inline anon sign-in (was previously delegated to a never-assigned
        // signInAnonymouslyRef.fn, leaving the fallback dead).
        try {
          const { data, error } = await supabase.auth.signInAnonymously({
            options: { data: { device_id: devId } },
          });
          if (error) {
            console.warn('[Auth] Anonymous sign-in failed:', error.message);
          } else if (data.user && shouldClaim) {
            // Attach the device's prior data to the new anon user.
            try {
              const claimRes = await fetch('/api/auth/claim-guest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newUserId: data.user.id, deviceId: devId }),
              });
              if (claimRes.ok) {
                console.log('[Auth] Guest data claimed for new anon user');
              } else {
                console.warn('[Auth] claim-guest non-ok:', claimRes.status);
              }
            } catch (err) {
              console.warn('[Auth] claim-guest failed:', err);
            }
          }
        } catch (err) {
          console.warn('[Auth] Anonymous sign-in threw:', err);
        }
      }

      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (_event, session) => {
          if (!mounted) return;
          setSession(session);
          setUser(session?.user ?? null);
          setLoading(false);

          if (session?.user?.id) {
            initServerValidation(session.user.id);
          } else {
            disableServerValidation();
          }
        }
      );

      return () => {
        mounted = false;
        subscription.unsubscribe();
      };
    };

    const cleanup = initAuth();
    return () => {
      mounted = false;
      cleanup.then(fn => fn?.());
    };
  }, []);

  const signInAnonymously = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    const devId = deviceId || getOrCreateDeviceId();
    if (!deviceId) setDeviceId(devId);

    const { createBrowserClient } = await import('@supabase/ssr');
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data, error } = await supabase.auth.signInAnonymously({
      options: { data: { device_id: devId } },
    });
    if (error) {
      console.error('Anonymous sign-in error:', error.message);
      throw error;
    }
    if (data.user) {
      // Phase 1.3: Initialize guest profile + server_game_state + device mapping
      try {
        const res = await fetch('/api/auth/initialize-guest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId: devId }),
        });
        // Capacity gate: if at MAX_TOTAL_PLAYERS, redirect to waitlist.
        // Server returns 503 + { error: 'capacity_full', redirect: '/waitlist' }.
        if (res.status === 503) {
          const body = await res.json().catch(() => ({}));
          if (body?.error === 'capacity_full') {
            router.push('/waitlist');
            return;
          }
        }
      } catch (err) {
        console.warn('[Auth] initialize-guest failed (non-fatal):', err);
      }
    }
  }, [deviceId, router]);

  const signInWithGoogle = useCallback(async () => {
    if (!isSupabaseConfigured || signingInRef.current) return;
    signingInRef.current = true;
    try {
      const { createBrowserClient } = await import('@supabase/ssr');
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/api/auth/callback`,
        },
      });
      if (error) throw new Error(error.message);
    } finally {
      setTimeout(() => { signingInRef.current = false; }, 1000);
    }
  }, []);

  const signOut = useCallback(async () => {
    disableServerValidation();
    if (!isSupabaseConfigured) {
      setUser(null);
      setSession(null);
      return;
    }
    const { createBrowserClient } = await import('@supabase/ssr');
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Sign-out error:', error.message);
    }
    setUser(null);
    setSession(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        isGuest: user?.is_anonymous ?? false,
        deviceId,
        signInAnonymously,
        signInWithGoogle,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
