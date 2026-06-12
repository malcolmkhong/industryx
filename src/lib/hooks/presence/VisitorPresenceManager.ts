// ============================================
// Visitor Presence Manager
// ============================================
//
// Used by the game frontend (useOnlinePresence). Counts the user
// themselves in the online count, tracks real user data, and re-tracks
// on tab visibility change.
// ============================================

import type { RealtimePresenceState } from '@supabase/supabase-js';
import { BasePresenceManager, isSupabaseConfigured, type PresencePayload } from './BasePresenceManager';

export interface VisitorPresenceState {
  onlineCount: number;
  loggedInCount: number;
  presenceState: RealtimePresenceState;
  isConnected: boolean;
}

const VISITOR_KEY_STORAGE = 'industriax_visitor_id';

function getOrCreateVisitorId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem(VISITOR_KEY_STORAGE);
  if (!id) {
    id = `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(VISITOR_KEY_STORAGE, id);
  }
  return id;
}

export class VisitorPresenceManager extends BasePresenceManager<VisitorPresenceState> {
  protected state: VisitorPresenceState = {
    onlineCount: 0,
    loggedInCount: 0,
    presenceState: {},
    isConnected: false,
  };

  private visitorId = '';

  protected getChannelName(): string {
    return 'industriax-online';
  }

  protected getKey(): string {
    if (!this.visitorId) {
      this.visitorId = getOrCreateVisitorId();
    }
    return this.visitorId;
  }

  protected createPayload(user: any): PresencePayload {
    return {
      visitor_id: this.getKey(),
      is_logged_in: !!user,
      display_name:
        user?.user_metadata?.full_name ||
        user?.email?.split('@')[0] ||
        'Anonymous',
      online_at: new Date().toISOString(),
    };
  }

  protected onSync(state: VisitorPresenceState): VisitorPresenceState {
    const presenceState = this.channel?.presenceState() ?? {};
    const totalKeys = Object.keys(presenceState).filter(k => this.filterKey(k)).length;
    let logged = 0;
    for (const key of Object.keys(presenceState)) {
      if (!this.filterKey(key)) continue;
      const presences = presenceState[key] as unknown as PresencePayload[];
      if (presences.length > 0 && presences[0].is_logged_in) {
        logged++;
      }
    }
    return { ...state, onlineCount: totalKeys, loggedInCount: logged, presenceState };
  }

  protected onAfterSubscribe(user: unknown): void {
    if (!this.channel) return;
    this.track(this.createPayload(user));
  }

  protected onBeforeDisconnect(): void {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibility);
    }
  }

  private handleVisibility = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      this.onAfterSubscribe(null);
    }
  };

  // Override connect to also set up visibility listener
  subscribe(listener: (state: VisitorPresenceState) => void, userRef: { current: unknown }): () => void {
    const cleanup = super.subscribe(listener, userRef);
    if (typeof document !== 'undefined' && this.refCount === 1) {
      document.addEventListener('visibilitychange', this.handleVisibility);
    }
    return () => {
      cleanup();
    };
  }
}
