// ============================================
// Base Presence Manager
// ============================================
//
// Abstract class that owns all shared Supabase Realtime Presence
// subscription/notification infrastructure. Subclasses customize:
//   - getChannelName(): the Supabase channel to join
//   - getKey():         the unique presence key for this client
//   - createPayload(user): the presence payload this client broadcasts
//   - filterKey(key):   optional — exclude keys from count (admin only)
//   - onSync(state):    optional — post-process the presence state on sync
//   - onAfterSubscribe(): optional — e.g., track presence on SUBSCRIBED
//
// Both useOnlinePresence and useAdminPresence share:
//   - refCounted subscription (multiple hook instances → 1 channel)
//   - listener notification pattern
//   - periodic presence refresh (30s)
//   - graceful disconnect
//   - lazy Supabase client creation
//   - SSR safety (typeof window guard)
// ============================================

import type { RealtimePresenceState, RealtimeChannel } from '@supabase/supabase-js';

export interface PresencePayload {
  visitor_id: string;
  is_logged_in: boolean;
  display_name: string;
  online_at: string;
}

export interface BasePresenceState {
  presenceState: RealtimePresenceState;
  isConnected: boolean;
}

const REFRESH_INTERVAL_MS = 30_000;

type Listener<S extends BasePresenceState> = (state: S) => void;

export abstract class BasePresenceManager<S extends BasePresenceState> {
  protected channel: RealtimeChannel | null = null;
  protected supabase: any | null = null;
  protected listeners = new Set<Listener<S>>();
  protected refreshInterval: ReturnType<typeof setInterval> | null = null;
  protected refCount = 0;

  // Abstract — subclasses must define
  protected abstract getChannelName(): string;
  protected abstract getKey(): string;
  protected abstract createPayload(user: unknown): PresencePayload;

  // Optional — subclasses may override
  protected filterKey(_key: string): boolean {
    return true; // include by default
  }

  protected onSync(_state: S): S {
    return this.state; // no-op by default
  }

  protected onAfterSubscribe(_user: unknown): void {
    // no-op by default
  }

  protected onBeforeDisconnect(): void {
    // no-op by default
  }

  // Shared state — subclasses initialize in constructor
  protected abstract readonly state: S;

  subscribe(listener: Listener<S>, userRef: { current: unknown }): () => void {
    this.listeners.add(listener);
    this.refCount++;

    // Emit current state immediately
    listener(this.state);

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

  protected notify() {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  private connect(userRef: { current: unknown }) {
    if (typeof window === 'undefined') return;

    // Lazy import Supabase to avoid SSR bundling
    import('@supabase/ssr').then(({ createBrowserClient }) => {
      if (!isSupabaseConfigured()) {
        this.state.isConnected = false;
        this.notify();
        return;
      }
      this.supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      this.setupChannel(userRef);
    }).catch(() => {
      this.state.isConnected = false;
      this.notify();
    });
  }

  private setupChannel(userRef: { current: unknown }) {
    if (!this.supabase) return;

    const channel = this.supabase.channel(this.getChannelName(), {
      config: { presence: { key: this.getKey() } },
    });

    channel.on('presence', { event: 'sync' }, () => {
      this.state = this.onSync(this.state);
      this.state.isConnected = true;
      this.notify();
    });

    channel.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        this.state.isConnected = true;
        this.notify();
        this.onAfterSubscribe(userRef.current);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        this.state.isConnected = false;
        this.notify();
      }
    });

    this.channel = channel;

    // Periodic refresh
    this.refreshInterval = setInterval(() => {
      this.onAfterSubscribe(userRef.current);
    }, REFRESH_INTERVAL_MS);
  }

  protected disconnect() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    this.onBeforeDisconnect();
    if (this.channel) {
      this.channel.untrack().catch(() => {});
    }
    if (this.supabase && this.channel) {
      this.supabase.removeChannel(this.channel);
    }
    this.channel = null;
    this.supabase = null;
    this.state.isConnected = false;
  }

  /** Broadcast a presence payload to the channel. */
  track(payload: PresencePayload) {
    if (!this.channel) return;
    this.channel.track(payload);
  }
}

// ─── Shared env check (same as AuthProvider) ──────────────────────────

export function isSupabaseConfigured(): boolean {
  return !!(
    typeof process !== 'undefined' &&
    process.env?.NEXT_PUBLIC_SUPABASE_URL &&
    process.env?.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
