/**
 * /test/auth-orchestrator — minimal browser harness for Playwright E2E.
 *
 * Boots the AuthOrchestrator against an in-memory fake-Supabase, exposes the
 * full Phase 10 lifecycle (onReady / onIdentityChanged / onSignedOut / cloud
 * sync timer) to a window-level API, and renders observed state + a control
 * panel so the test runner can drive every transition.
 *
 * This page is build-time included only when PLAYWRIGHT=1, never linked from
 * production routes.
 */
'use client';

import { useEffect, useState } from 'react';
import { AuthOrchestrator } from '@/lib/auth/orchestrator';
import type { AuthOrchestratorDeps, Session } from '@/lib/auth/orchestrator/types';

// ─── Fake Supabase (in-memory) ──────────────────────────────────────────

type Handler = (session: Session | null) => void;

interface LogEntry {
  ts: number;
  event: string;
  detail?: string;
}

declare global {
  interface Window {
    __authApi: AuthApi;
  }
}

// Must stay compatible with tests/e2e/auth-orchestrator.spec.ts `__authApi`
// declaration. Extra test-only helpers live on a separate global.
interface AuthApi {
  userId: string | null;
  identity: string;
  status: string;
  calls: Record<string, number>;
  events: LogEntry[];
  emitFreshAnon: () => Promise<void>;
  emitOAuth: (userId: string) => void;
  emitSignOut: () => void;
  emitTokenRefresh: () => void;
  signOut: () => Promise<void>;
  reset: () => void;
}

declare global {
  interface Window {
    __authTestHooks: {
      throwNextIdentityChange: () => void;
      failNextSupabaseSignOut: () => void;
    };
  }
}

function buildHarness(): { orch: AuthOrchestrator; api: Window['__authApi']; testHooks: Window['__authTestHooks']; handlers: Set<Handler>; supabase: { signOutShouldThrow: boolean; identityChangeShouldThrow: boolean } } {
  const handlers = new Set<Handler>();
  const events: LogEntry[] = [];
  const calls: Record<string, number> = {
    onReady: 0,
    onIdentityChanged: 0,
    onSignedOut: 0,
    startAutoSave: 0,
    stopAutoSave: 0,
    setUserId: 0,
    cloudLoad: 0,
    signOutSupabase: 0,
  };
  const supabase = {
    currentSession: null as Session | null,
    signOutShouldThrow: false,
    identityChangeShouldThrow: false,
  };

  const log = (event: string, detail?: string): void => {
    events.push({ ts: Date.now(), event, detail });
  };

  let cloudSaveTimer: ReturnType<typeof setInterval> | null = null;

  const deps: AuthOrchestratorDeps = {
    isSupabaseConfigured: true,
    getDeviceId: () => 'device-e2e',
    getSession: async () => {
      void calls.signOutSupabase; // touch the stat so lint stops barking
      return supabase.currentSession;
    },
    signInWithOAuth: async () => ({ error: null }),
    recoverByDevice: async () => ({ recovered: false, userId: null }),
    claimGuest: async () => ({ ok: true, error: null }),
    quickstart: async () => ({ userId: 'anon-fresh', error: null }),
    registerDevice: async () => ({ ok: true, alreadyExists: false }),
    onAuthStateChange: (h: Handler) => {
      handlers.add(h);
      return () => handlers.delete(h);
    },
    signOutSupabase: async () => {
      if (supabase.signOutShouldThrow) {
        supabase.signOutShouldThrow = false;
        // Fire SIGNED_OUT before throwing
        supabase.currentSession = null;
        handlers.forEach((h) => h(null));
        throw new Error('network_unreachable');
      }
      supabase.currentSession = null;
      handlers.forEach((h) => h(null));
      return { error: null };
    },
    disableServerValidation: () => log('disableServerValidation'),
    initServerValidation: (uid: string) => log('initServerValidation', uid),
    onReady: (uid: string) => {
      calls.onReady++;
      log('onReady', uid);
      calls.cloudLoad++;
      log('cloudLoad');
    },
    onIdentityChanged: (uid: string) => {
      if (supabase.identityChangeShouldThrow) {
        supabase.identityChangeShouldThrow = false;
        throw new Error('provider_bug');
      }
      calls.onIdentityChanged++;
      log('onIdentityChanged', uid);
      // Restart auto-save timer (matches AuthProvider behavior)
      if (cloudSaveTimer) clearInterval(cloudSaveTimer);
      cloudSaveTimer = setInterval(() => log('autoSaveTick'), 2000);
      calls.startAutoSave++;
      log('startAutoSave');
    },
    onSignedOut: () => {
      calls.onSignedOut++;
      log('onSignedOut');
      if (cloudSaveTimer) {
        clearInterval(cloudSaveTimer);
        cloudSaveTimer = null;
      }
      calls.stopAutoSave++;
      log('stopAutoSave');
    },
    runMergeCheck: async () => log('runMergeCheck'),
    resetMerge: () => log('resetMerge'),
    startLoginPrompts: () => log('startLoginPrompts'),
    stopLoginPrompts: () => log('stopLoginPrompts'),
  };

  const orch = new AuthOrchestrator();
  orch.attach(deps);

  const api: AuthApi = {
    get userId() { return orch.getState().userId; },
    get identity() { return orch.getState().identity; },
    get status() { return orch.getState().status; },
    get events() { return events; },
    get calls() { return calls; },
    emitFreshAnon: async () => {
      log('test:emitFreshAnon');
      const session = makeSession({ userId: 'anon-test', isAnonymous: true });
      supabase.currentSession = session;
      handlers.forEach((h) => h(session));
    },
    emitOAuth: (userId: string) => {
      log('test:emitOAuth', userId);
      const session = makeSession({ userId });
      supabase.currentSession = session;
      handlers.forEach((h) => h(session));
    },
    emitSignOut: () => {
      log('test:emitSignOut');
      supabase.currentSession = null;
      handlers.forEach((h) => h(null));
    },
    emitTokenRefresh: () => {
      log('test:emitTokenRefresh');
      const session = makeSession({ userId: orch.getState().userId ?? 'auth-1' });
      supabase.currentSession = session;
      handlers.forEach((h) => h(session));
    },
    signOut: async () => {
      log('test:signOut');
      await orch.signOut();
    },
    reset: () => {
      events.length = 0;
      for (const k of Object.keys(calls)) calls[k] = 0;
    },
  };

  const testHooks: Window['__authTestHooks'] = {
    throwNextIdentityChange: () => {
      supabase.identityChangeShouldThrow = true;
      log('test:throwNextIdentityChange armed');
    },
    failNextSupabaseSignOut: () => {
      supabase.signOutShouldThrow = true;
      log('test:failNextSupabaseSignOut armed');
    },
  };

  return { orch, api, testHooks, handlers, supabase };
}

function makeSession(opts: { userId: string; isAnonymous?: boolean }): Session {
  const user = {
    id: opts.userId,
    email: null,
    is_anonymous: opts.isAnonymous ?? false,
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: new Date().toISOString(),
    role: opts.isAnonymous ? 'anon' : 'authenticated',
  };
  return {
    access_token: 'tok',
    refresh_token: 'ref',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user,
  } as unknown as Session;
}

// ─── React component (renders harness state for debugging) ───────────────

export default function AuthHarnessPage() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 200);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const harness = buildHarness();
    window.__authApi = harness.api;
    window.__authTestHooks = harness.testHooks;

    // Auto-bootstrap: start with auth session to verify onReady path
    (async () => {
      const session = makeSession({ userId: 'auth-startup' });
      // Manually set the supabase state via the internal harness closure.
      // Workaround: re-use the getSession() return shape via setting
      // currentSession is not exposed. We start with no session to test
      // the fresh-anon recovery path through the orchestrator.
      await harness.orch.startup();
      // After startup, the orchestrator called signInAnonymously which set
      // supabase.currentSession + emitted SIGNED_IN → handler fired onReady.
      harness.api.emitOAuth('auth-google'); // upgrade to auth
    })();

    return () => {
      // No cleanup needed for harness in browser
    };
  }, []);

  const api = typeof window !== 'undefined' ? window.__authApi : undefined;
  if (!api) {
    return <div data-testid="harness-not-ready">Loading…</div>;
  }

  return (
    <div data-testid="auth-harness" data-user-id={api.userId ?? ''} data-identity={api.identity} data-status={api.status}>
      <h1 data-testid="title">Auth Harness</h1>
      <div data-testid="state">
        userId={api.userId ?? 'null'} | identity={api.identity} | status={api.status}
      </div>
      <div data-testid="calls">
        onReady={api.calls.onReady} | onIdentityChanged={api.calls.onIdentityChanged} | onSignedOut={api.calls.onSignedOut}
      </div>
      <ul data-testid="events">
        {api.events.slice(-20).map((e, i) => (
          <li key={i} data-event={e.event}>
            {e.event}{e.detail ? `: ${e.detail}` : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}