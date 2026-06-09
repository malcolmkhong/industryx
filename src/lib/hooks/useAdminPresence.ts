'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimePresenceState, RealtimeChannel } from '@supabase/supabase-js';

// ─── Types ────────────────────────────────────────────────────────────────

interface PresencePayload {
  visitor_id: string;
  is_logged_in: boolean;
  display_name: string;
  online_at: string;
}

interface AdminPresenceState {
  onlineCount: number | null;
  loggedInCount: number;
  presenceState: RealtimePresenceState;
  isConnected: boolean;
}

// ─── Singleton Presence Manager for Admin ─────────────────────────────────
// Subscribes to the same Presence channel as the game frontend,
// but excludes the admin's own presence from the count.

const CHANNEL_NAME = 'industriax-online';

type Listener = (state: AdminPresenceState) => void;

class AdminPresenceManager {
  private channel: RealtimeChannel | null = null;
  private supabase: ReturnType<typeof createClient> | null = null;
  private adminKey = '';
  private listeners = new Set<Listener>();
  private state: AdminPresenceState = {
    onlineCount: null,
    loggedInCount: 0,
    presenceState: {},
    isConnected: false,
  };
  private refreshInterval: ReturnType<typeof setInterval> | null = null;
  private refCount = 0;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    this.refCount++;

    // Emit current state immediately
    listener(this.state);

    // If this is the first subscriber, connect
    if (this.refCount === 1) {
      this.connect();
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

  private connect() {
    if (typeof window === 'undefined') return;

    this.adminKey = `admin_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    this.supabase = createClient();

    const channel = this.supabase.channel(CHANNEL_NAME, {
      config: {
        presence: {
          key: this.adminKey,
        },
      },
    });

    channel.on('presence', { event: 'sync' }, () => {
      const presenceState = channel.presenceState();
      const allKeys = Object.keys(presenceState);
      // Exclude admin's own presence from counts
      const visitorKeys = allKeys.filter(k => k !== this.adminKey);

      let logged = 0;
      for (const key of visitorKeys) {
        const presences = presenceState[key] as unknown as PresencePayload[];
        if (presences.length > 0 && presences[0].is_logged_in) {
          logged++;
        }
      }

      this.state = {
        onlineCount: visitorKeys.length,
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
        channel.track({
          visitor_id: this.adminKey,
          is_logged_in: true,
          display_name: 'Admin',
          online_at: new Date().toISOString(),
        });
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        this.state = { ...this.state, isConnected: false };
        this.notify();
      }
    });

    this.channel = channel;

    // Periodic refresh
    this.refreshInterval = setInterval(() => {
      if (this.channel) {
        this.channel.track({
          visitor_id: this.adminKey,
          is_logged_in: true,
          display_name: 'Admin',
          online_at: new Date().toISOString(),
        });
      }
    }, 30_000);
  }

  private disconnect() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
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
      onlineCount: null,
      loggedInCount: 0,
      presenceState: {},
      isConnected: false,
    };
  }
}

// Singleton instance
const adminPresenceManager = typeof window !== 'undefined' ? new AdminPresenceManager() : null;

// ─── Hook ─────────────────────────────────────────────────────────────────

export function useAdminPresence() {
  const [state, setState] = useState<AdminPresenceState>({
    onlineCount: null,
    loggedInCount: 0,
    presenceState: {},
    isConnected: false,
  });

  useEffect(() => {
    if (!adminPresenceManager) return;

    const unsubscribe = adminPresenceManager.subscribe((newState) => {
      setState(newState);
    });

    return unsubscribe;
  }, []);

  return state;
}
