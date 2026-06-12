// ============================================
// Admin Presence Manager
// ============================================
//
// Used by the admin panel (useAdminPresence). Excludes the admin's
// own presence from the count using a unique ephemeral key, so the
// admin doesn't see themselves in the online count.
// ============================================

import type { RealtimePresenceState } from '@supabase/supabase-js';
import { BasePresenceManager, type PresencePayload } from './BasePresenceManager';

export interface AdminPresenceState {
  onlineCount: number | null;
  loggedInCount: number;
  presenceState: RealtimePresenceState;
  isConnected: boolean;
}

export class AdminPresenceManager extends BasePresenceManager<AdminPresenceState> {
  protected state: AdminPresenceState = {
    onlineCount: null,
    loggedInCount: 0,
    presenceState: {},
    isConnected: false,
  };

  private adminKey = '';

  protected getChannelName(): string {
    return 'industriax-online';
  }

  protected getKey(): string {
    if (!this.adminKey) {
      this.adminKey = `admin_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    }
    return this.adminKey;
  }

  protected createPayload(_user: unknown): PresencePayload {
    return {
      visitor_id: this.getKey(),
      is_logged_in: true,
      display_name: 'Admin',
      online_at: new Date().toISOString(),
    };
  }

  protected filterKey(key: string): boolean {
    return key !== this.adminKey;
  }

  protected onSync(state: AdminPresenceState): AdminPresenceState {
    const presenceState = this.channel?.presenceState() ?? {};
    const allKeys = Object.keys(presenceState);
    const visitorKeys = allKeys.filter(k => this.filterKey(k));
    let logged = 0;
    for (const key of visitorKeys) {
      const presences = presenceState[key] as unknown as PresencePayload[];
      if (presences.length > 0 && presences[0].is_logged_in) {
        logged++;
      }
    }
    return { ...state, onlineCount: visitorKeys.length, loggedInCount: logged, presenceState };
  }

  protected onAfterSubscribe(_user: unknown): void {
    if (!this.channel) return;
    this.track(this.createPayload(null));
  }
}
