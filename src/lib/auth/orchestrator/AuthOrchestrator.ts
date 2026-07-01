/**
 * AuthOrchestrator — Phase 3.
 *
 * Central state machine for frontend authentication. Phase 3 adds the
 * startup() pipeline. Orchestrator owns:
 *   1. device-id read
 *   2. session check
 *   3. recover-by-device + claim-guest (if no session)
 *   4. quickstart (anon user + game state in one server call)
 *   5. onAuthStateChange subscription (state stays in sync)
 *
 * Behavior change: none visible. Code path: now one place.
 */

import type {
  AuthEvent,
  AuthEventListener,
  AuthOrchestratorDeps,
  IdentityKind,
  OrchestratorState,
  Session,
  StateListener,
} from './types';

export class AuthOrchestrator {
  private state: OrchestratorState;
  private listeners = new Set<StateListener>();
  private eventListeners = new Set<AuthEventListener>();
  private deps: AuthOrchestratorDeps | null = null;
  private authSubscription: (() => void) | null = null;

  constructor(initial: Partial<OrchestratorState> = {}) {
    this.state = {
      status: 'idle',
      identity: 'unauthenticated',
      userId: null,
      deviceId: null,
      isGuest: false,
      ...initial,
    };
  }

  attach(deps: AuthOrchestratorDeps): void {
    this.deps = deps;
  }

  getState(): OrchestratorState {
    return this.state;
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  onEvent(listener: AuthEventListener): () => void {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  dispatch(event: AuthEvent): void {
    for (const l of this.eventListeners) {
      try {
        l(event);
      } catch (err) {
        console.warn('[AuthOrchestrator] event listener threw:', err);
      }
    }
  }

  setState(patch: Partial<OrchestratorState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) {
      try {
        l(this.state);
      } catch (err) {
        console.warn('[AuthOrchestrator] state listener threw:', err);
      }
    }
  }

  /**
   * Sign in via OAuth (Google or GitHub). Provider-agnostic — same pipeline
   * for both. Pipeline:
   *   1. dispatch OAUTH_CALLBACK
   *   2. supabase.auth.signInWithOAuth (browser redirect)
   *   3. dispatch OAUTH_SUCCESS or OAUTH_FAILURE
   *
   * Returns the error string if sign-in failed, null on success.
   * Note: on success the browser redirects away — no further orchestration
   * runs in this method. Post-OAuth pipeline (register-device) is triggered
   * by the auth state change listener after the callback returns.
   */
  async signInWithOAuth(
    provider: 'google' | 'github',
    redirectTo: string,
  ): Promise<string | null> {
    const deps = this.deps;
    if (!deps || !deps.isSupabaseConfigured) return 'not_configured';
    if (this.state.status === 'initializing') return 'initializing';

    this.dispatch({ type: 'OAUTH_CALLBACK', provider });

    const { error } = await deps.signInWithOAuth(provider, redirectTo);
    if (error) {
      this.dispatch({ type: 'OAUTH_FAILURE', provider, error });
      return error;
    }

    this.dispatch({ type: 'OAUTH_SUCCESS', provider });
    return null;
  }

  /**
   * Post-OAuth pipeline. Called from onAuthStateChange when a non-anonymous
   * session arrives for the first time after OAUTH_SUCCESS. Runs:
   *   1. register-device (idempotent — same-device re-login is a no-op)
   */
  async runPostOAuth(fingerprintHash: string | null = null): Promise<void> {
    const deps = this.deps;
    if (!deps) return;

    const deviceId = deps.getDeviceId();
    try {
      const result = await deps.registerDevice(deviceId, null, fingerprintHash);
      if (!result.ok) {
        console.warn('[AuthOrchestrator] register-device non-ok:', result.reason);
      }
    } catch (err) {
      console.warn('[AuthOrchestrator] register-device threw:', err);
    }
  }

  async signOut(): Promise<void> {
    this.dispatch({ type: 'SIGN_OUT' });
    this.setState({ status: 'signing_out' });

    const deps = this.deps;
    if (!deps) {
      console.warn('[AuthOrchestrator] signOut called before attach()');
      this.setState({
        status: 'idle',
        identity: 'unauthenticated',
        userId: null,
        isGuest: false,
      });
      return;
    }

    // Snapshot priorUserId BEFORE applySession (for handleSignedOut idempotency).
    const priorUserId = this.state.userId;

    // Apply null session FIRST — clears state.userId via setState (sole owner).
    // Sets status to 'idle'; we override to 'signing_out' immediately after.
    this.applySession(null);
    this.setState({ status: 'signing_out' });

    // Run cleanup via shared method (idempotent via priorUserId snapshot).
    this.handleSignedOut(priorUserId);

    if (!deps.isSupabaseConfigured) {
      this.setState({ status: 'idle' });
      return;
    }

    // Server-side invalidation. Supabase emits SIGNED_OUT SYNCHRONOUSLY during
    // this call. Handler's prevUserId snapshot will be null (cleared above) →
    // dispatch's third branch is FALSE → no double-fire of handleSignedOut.
    // Wrap in try/catch: local state is already cleared, server failure must
    // not propagate to the caller (UI button / dispatch).
    let signOutError: string | null = null;
    try {
      const { error } = await deps.signOutSupabase();
      if (error) {
        console.error('[AuthOrchestrator] Sign-out error:', error);
        signOutError = error;
      }
    } catch (err) {
      console.error('[AuthOrchestrator] signOutSupabase threw:', err);
      signOutError = err instanceof Error ? err.message : 'unknown';
    }

    this.setState({ status: 'idle' });
    // Return ignored by callers today, but kept for future telemetry.
    void signOutError;
  }

  /**
   * Shared cleanup method for sign-out. Routes through the dep callbacks
   * (disableServerValidation, stopLoginPrompts, resetMerge, onSignedOut).
   *
   * Idempotency derived from priorUserId (caller's pre-apply snapshot of
   * state.userId). Does NOT read this.state.userId. Does NOT mutate auth
   * state. No new flag.
   *
   * Each dep callback is wrapped in try/catch so a buggy provider cannot
   * prevent subsequent cleanup steps from running.
   *
   * @param priorUserId - state.userId captured BEFORE applySession ran.
   *                      If null, no prior session existed or it was already
   *                      cleaned — skip cleanup.
   */
  private handleSignedOut(priorUserId: string | null): void {
    const deps = this.deps;
    if (!deps) return;
    if (priorUserId === null) return; // no prior session to clean
    try { deps.disableServerValidation(); } catch (err) {
      console.warn('[AuthOrchestrator] disableServerValidation threw:', err);
    }
    try { deps.stopLoginPrompts(); } catch (err) {
      console.warn('[AuthOrchestrator] stopLoginPrompts threw:', err);
    }
    try { deps.resetMerge(); } catch (err) {
      console.warn('[AuthOrchestrator] resetMerge threw:', err);
    }
    try { deps.onSignedOut(); } catch (err) {
      console.warn('[AuthOrchestrator] onSignedOut threw:', err);
    }
  }

  /**
   * Apply a session to orchestrator state. Public so AuthProvider can mirror
   * the legacy AuthContext shape (user/session/loading/isGuest).
   */
  applySession(session: Session | null): { loading: boolean } {
    const identity: IdentityKind = session?.user
      ? session.user.is_anonymous
        ? 'anonymous'
        : 'authenticated'
      : 'unauthenticated';
    const wasLoading = this.state.status === 'initializing';
    this.setState({
      status: session ? 'ready' : 'idle',
      identity,
      userId: session?.user?.id ?? null,
      isGuest: session?.user?.is_anonymous ?? false,
    });
    this.dispatch({ type: 'AUTH_STATE_CHANGED', session });
    return { loading: wasLoading };
  }

  /**
   * Startup pipeline — replaces the inline AuthProvider mount flow.
   * Returns a cleanup function that unsubscribes from auth changes.
   */
  async startup(fingerprintHash: string | null = null): Promise<() => void> {
    this.dispatch({ type: 'STARTUP' });
    this.setState({ status: 'initializing' });

    const deps = this.deps;
    if (!deps) {
      console.warn('[AuthOrchestrator] startup called before attach()');
      this.setState({ status: 'idle' });
      return () => {};
    }

    if (!deps.isSupabaseConfigured) {
      this.setState({ status: 'idle' });
      return () => {};
    }

    const deviceId = deps.getDeviceId();
    this.setState({ deviceId });

    let session: Session | null = null;
    try {
      session = await deps.getSession();
    } catch (err) {
      console.warn('[Auth] getSession failed (Supabase unreachable?):', err);
    }

    this.applySession(session);

    if (session?.user?.id) {
      deps.initServerValidation(session.user.id);
      // Per Decision 12: on READY state (anon or auth), trigger load.
      // Both paths reach server_game_state because initialize-guest already
      // created the row for anon.
      deps.onReady(session.user.id);
      if (session.user.is_anonymous) {
        deps.startLoginPrompts((reason, tab) =>
          this.dispatch({ type: 'BIND_REQUEST', reason, ...(tab ? { pendingTab: tab } : {}) }),
        );
      }
    }

    // No session → quickstart (creates anon user + initializes game state in one call)
    if (!session) {
      let shouldClaim = false;
      let recoveredUserId: string | null = null;

      try {
        const result = await deps.recoverByDevice(deviceId, fingerprintHash);
        if (result.recovered) {
          shouldClaim = true;
          recoveredUserId = result.userId;
          this.dispatch({ type: 'RECOVERED', userId: result.userId ?? '' });
        } else {
          this.dispatch({ type: 'NO_RECOVERY' });
        }
      } catch (err) {
        console.warn('[Auth] Device recovery failed:', err);
        this.dispatch({ type: 'NO_RECOVERY' });
      }

      try {
        const result = await deps.quickstart(deviceId, fingerprintHash, recoveredUserId);
        if (result.error === 'capacity_full') {
          this.dispatch({ type: 'WAITLIST_REQUIRED' });
        } else if (result.error) {
          console.warn('[Auth] quickstart failed:', result.error);
        } else if (result.userId) {
          if (shouldClaim && recoveredUserId) {
            try {
              const claim = await deps.claimGuest(recoveredUserId, deviceId);
              if (!claim.ok) {
                console.warn('[Auth] claim-guest failed:', claim.error);
              }
            } catch (err) {
              console.warn('[Auth] claim-guest threw:', err);
            }
          }
        }
      } catch (err) {
        console.warn('[Auth] quickstart threw:', err);
      }

    }

    // Subscribe to auth state changes
    this.authSubscription = deps.onAuthStateChange((s) => {
      // Snapshot pre-apply state (used for both lifecycle dispatch and existing gates).
      const prevUserId = this.state.userId;
      const prevIdentity = this.state.identity;

      // Apply session FIRST — sole owner of state.userId mutation.
      this.applySession(s);

      // Read current userId from state (post-apply).
      const currentUserId = this.state.userId;

      // Lifecycle dispatch (after applySession; uses pre-apply snapshot for idempotency).
      // Each dep callback wrapped so a buggy provider cannot break the rest of
      // the dispatch (existing gates, listeners).
      if (prevUserId === null && currentUserId !== null) {
        try { deps.onReady(currentUserId); } catch (err) {
          console.warn('[AuthOrchestrator] onReady threw:', err);
        }
      } else if (
        prevUserId !== null &&
        currentUserId !== null &&
        prevUserId !== currentUserId
      ) {
        try { deps.onIdentityChanged(currentUserId); } catch (err) {
          console.warn('[AuthOrchestrator] onIdentityChanged threw:', err);
        }
      } else if (prevUserId !== null && currentUserId === null) {
        this.handleSignedOut(prevUserId);
      }

      // Existing transition gates (preserve verbatim — use pre-apply snapshot).
      const wasAnon = prevIdentity === 'anonymous';
      const isNowAuth = !!s?.user && !s.user.is_anonymous;
      const wasAuth = prevUserId !== null && prevIdentity === 'authenticated';

      // Server validation is managed by handleSignedOut() on sign-out.
      // For non-sign-out transitions, init/refresh per-user validation.
      if (s?.user?.id) {
        try { deps.initServerValidation(s.user.id); } catch (err) {
          console.warn('[AuthOrchestrator] initServerValidation threw:', err);
        }
      }
      // (Sign-out case: state already cleared by applySession; handleSignedOut
      //  has fired disableServerValidation via the lifecycle dispatch above.)
      // Transition from anon → authenticated (OAuth just completed): run
      // post-OAuth pipeline. Same-account re-login also passes through here,
      // but register-device is idempotent.
      if (wasAnon && isNowAuth) {
        void this.runPostOAuth(null);
      }
      // Auth transitions
      if (isNowAuth && !wasAuth && s?.user?.id) {
        // onAuthenticated removed — replaced by onIdentityChanged lifecycle dispatch above.
        try { deps.stopLoginPrompts(); } catch (err) {
          console.warn('[AuthOrchestrator] stopLoginPrompts threw:', err);
        }
        // Phase 6: merge check fires on every anon→auth transition.
        // Per Q3: auto-open panel on conflict. No more triggeredRef bug —
        // same-account re-login only fires this if there was a state reset.
        void deps.runMergeCheck(s.user.id, this.state.deviceId ?? '');
      }
    });

    return () => {
      this.authSubscription?.();
      this.authSubscription = null;
    };
  }
}