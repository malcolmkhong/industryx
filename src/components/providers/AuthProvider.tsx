'use client';

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
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
    const signInAnonymouslyRef: { fn: (() => Promise<void>) | null } = { fn: null };

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

      // Phase 1.2: If no session, try device-based recovery, then auto-signin anon
      if (mounted && !session) {
        try {
          const recoverRes = await fetch('/api/auth/recover-by-device', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId: devId }),
          });
          if (recoverRes.ok) {
            const { recoveredAs } = await recoverRes.json();
            if (recoveredAs === 'recovered') {
              const { data: { session: newSession } } = await supabase.auth.getSession();
              if (mounted && newSession) {
                setSession(newSession);
                setUser(newSession.user ?? null);
                if (newSession.user?.id) {
                  initServerValidation(newSession.user.id);
                }
                return;
              }
            }
          }
        } catch (err) {
          console.warn('[Auth] Device recovery failed:', err);
        }

        if (mounted && signInAnonymouslyRef.fn) {
          try {
            await signInAnonymouslyRef.fn();
          } catch (err) {
            console.warn('[Auth] Anonymous sign-in failed:', err);
          }
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
        await fetch('/api/auth/initialize-guest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId: devId }),
        });
      } catch (err) {
        console.warn('[Auth] initialize-guest failed (non-fatal):', err);
      }
    }
  }, [deviceId]);

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
