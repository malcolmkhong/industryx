// ============================================
// useAdminPresence Hook
// ============================================
//
// Thin React wrapper around AdminPresenceManager. Preserves the
// existing API:
//   const { onlineCount, loggedInCount, presenceState, isConnected } = useAdminPresence();
//   (onlineCount is `number | null` — null when not yet loaded)
//
// Excludes the admin's own presence from the count.
// ============================================

'use client';

import { useEffect, useState } from 'react';
import { AdminPresenceManager, type AdminPresenceState } from './presence/AdminPresenceManager';

const adminManager = typeof window !== 'undefined' ? new AdminPresenceManager() : null;

export function useAdminPresence(): AdminPresenceState {
  const [state, setState] = useState<AdminPresenceState>({
    onlineCount: null,
    loggedInCount: 0,
    presenceState: {},
    isConnected: false,
  });

  useEffect(() => {
    if (!adminManager) return;
    const unsubscribe = adminManager.subscribe(setState, { current: null });
    return unsubscribe;
  }, []);

  return state;
}
