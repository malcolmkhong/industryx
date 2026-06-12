// ============================================
// useOnlinePresence Hook
// ============================================
//
// Thin React wrapper around VisitorPresenceManager. Preserves the
// existing API:
//   const { onlineCount, loggedInCount, presenceState, isConnected } = useOnlinePresence();
//
// Counts the user themselves in the online total.
// ============================================

'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { VisitorPresenceManager, type VisitorPresenceState } from './presence/VisitorPresenceManager';

const visitorManager = typeof window !== 'undefined' ? new VisitorPresenceManager() : null;

export function useOnlinePresence(): VisitorPresenceState {
  const { user } = useAuth();
  const [state, setState] = useState<VisitorPresenceState>({
    onlineCount: 0,
    loggedInCount: 0,
    presenceState: {},
    isConnected: false,
  });
  const userRef = useRef(user);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    if (!visitorManager) return;
    const unsubscribe = visitorManager.subscribe(setState, userRef);
    return unsubscribe;
  }, []);

  // Re-track when user logs in/out
  useEffect(() => {
    if (visitorManager && state.isConnected) {
      visitorManager.track(visitorManager['createPayload'](user));
    }
  }, [user, state.isConnected]);

  return state;
}
