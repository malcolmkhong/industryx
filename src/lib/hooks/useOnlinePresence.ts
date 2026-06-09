'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/AuthProvider';
import type { RealtimePresenceState, RealtimeChannel } from '@supabase/supabase-js';

// ─── Types ────────────────────────────────────────────────────────────────

interface PresencePayload {
  visitor_id: string;
  is_logged_in: boolean;
  display_name: string;
  online_at: string;
}

interface OnlinePresenceState {
  onlineCount: number;
  loggedInCount: number;
  presenceState: RealtimePresenceState;
  isConnected: boolean;
}

// ─── Stable visitor ID (persists in localStorage, no PII) ────────────────

function getOrCreateVisitorId(): string {
  if (typeof window === 'undefined') return '';

  const KEY = 'industriax_visitor_id';
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(KEY, id);
  }
  return id;
}

// ─── Singleton Presence Manager ───────────────────────────────────────────
// Multiple hook instances share one channel. This prevents two channels from
// fighting each other (create → cleanup → create → cleanup race).

const CHANNEL_NAME = 'industriax-online';

type Listener = (state: OnlinePresenceState) => void;

class PresenceManager {
  private channel: RealtimeChannel | null = null;
  private supabase: ReturnType<typeof createClient> | null = null;
  private visitorId = '';
  private listeners = new Set<Listener>();
  private state: OnlinePresenceState = {
    onlineCount: 0,
    loggedInCount: 0,
    presenceState: {},
    isConnected: false,
  };
  private refreshInterval: ReturnType<typeof setInterval> | null = null;
  private refCount = 0;

  subscribe(listener: Listener, userRef: { current: typeof useAuth extends () => { user: infer U } ? U : never }): () => void {
    this.listeners.add(listener);
    this.refCount++;

    // Emit current state immediately
    listener(this.state);

    // If this is the first subscriber, connect
    if (this.refCount === 1) {
      this.connect(userRef);
    }

    return () => {
      this.listeners.delete(listener);
      this.refCount--;
      if (this.refCount <= 0) {
        this.refCount = 0;
        this.disconnect();
      }
    };
  }

  private notify() {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  private connect(userRef: { current: any }) {
    if (typeof window === 'undefined') return;

    this.visitorId = getOrCreateVisitorId();
    this.supabase = createClient();

    const channel = this.supabase.channel(CHANNEL_NAME, {
      config: {
        presence: {
          key: this.visitorId,
        },
      },
    });

    channel.on('presence', { event: 'sync' }, () => {
      const presenceState = channel.presenceState();
      const totalKeys = Object.keys(presenceState).length;

      let logged = 0;
      for (const key of Object.keys(presenceState)) {
        const presences = presenceState[key] as unknown as PresencePayload[];
        if (presences.length > 0 && presences[0].is_logged_in) {
          logged++;
        }
      }

      this.state = {
        onlineCount: totalKeys,
        loggedInCount: logged,
        presenceState,
        isConnected: true,
      };
      this.notify();
    });

    channel.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        this.state = { ...this.state, isConnected: true };
        this.notify();
        this.track(userRef.current);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        this.state = { ...this.state, isConnected: false };
        this.notify();
      }
    });

    this.channel = channel;

    // Periodic refresh
    this.refreshInterval = setInterval(() => {
      this.track(userRef.current);
    }, 30_000);

    // Re-track on visibility change
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibility);
    }
  }

  private disconnect() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibility);
    }
    if (this.channel) {
      this.channel.untrack().catch(() => {});
    }
    if (this.supabase && this.channel) {
      this.supabase.removeChannel(this.channel);
    }
    this.channel = null;
    this.supabase = null;
    this.state = {
      onlineCount: 0,
      loggedInCount: 0,
      presenceState: {},
      isConnected: false,
    };
  }

  private handleVisibility = () => {
    if (document.visibilityState === 'visible') {
      // We don't have userRef here, but track will use last known state
      this.track(null);
    }
  };

  track(user: any) {
    if (!this.channel) return;
    this.channel.track({
      visitor_id: this.visitorId,
      is_logged_in: !!user,
      display_name: user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Anonymous',
      online_at: new Date().toISOString(),
    });
  }
}

// Singleton instance
const presenceManager = typeof window !== 'undefined' ? new PresenceManager() : null;

// ─── Hook ─────────────────────────────────────────────────────────────────

export function useOnlinePresence(): OnlinePresenceState {
  const { user } = useAuth();
  const [state, setState] = useState<OnlinePresenceState>({
    onlineCount: 0,
    loggedInCount: 0,
    presenceState: {},
    isConnected: false,
  });
  const userRef = useRef(user);

  // Keep ref in sync with user (must be in effect per React 19 rules)
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    if (!presenceManager) return;

    const unsubscribe = presenceManager.subscribe(
      (newState) => setState(newState),
      userRef
    );

    return unsubscribe;
  }, []);

  // Re-track when user logs in/out
  useEffect(() => {
    if (presenceManager && state.isConnected) {
      presenceManager.track(user);
    }
  }, [user, state.isConnected]);

  return state;
}
