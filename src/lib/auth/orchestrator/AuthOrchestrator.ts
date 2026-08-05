/**
 * AuthOrchestrator — PR4-4A.
 *
 * Rewritten around the single `/api/auth/bootstrap` endpoint per
 * AUTH_ORCHESTRATOR_REDESIGN_PLAN.md §4-§6 + §15. The state machine lives
 * in `./state.ts` (8 states, decision table). The orchestrator is the
 * caller; it:
 *
 *   1. Reads the persistent deviceId (creates one if missing).
 *   2. Collects the fingerprint with a STRICT timeout (telemetry only —
 *      plan §10).
 *   3. POSTs `/api/auth/bootstrap` once per mount with
 *      `{ deviceId, fingerprintHash, previousAuthUserId? }`.
 *   4. Dispatches the response into the state machine via
 *      `transition(currentStatus, event)`.
 *   5. Assigns `applyServerState` only to the latest response (version
 *      guard — stale responses are dropped before they reach the state
 *      machine).
 *   6. On sign-out, captures the previous auth user id and re-bootstraps
 *      with `previousAuthUserId` set in the body — the server routes that
 *      to `create_signed_out_guest_after_signout`.
 *
 * Hard rules (plan §5):
 *   - Only the latest in-flight request may apply state.
 *   - When the resolved user changes, immediately block gameplay + clear
 *     previous user's game state before applying new state.
 *   - Never render one user's state while another is bootstrapping.
 *   - Guest bootstrap response must not overwrite later authenticated
 *     response.
 *
 * Out of scope: legacy `/api/auth/guest/quickstart`,
 * `/api/auth/device/register`, the merged `onReady/onIdentityChanged/
 * onSignedOut` lifecycle, and the post-OAuth `registerDevice` pipeline.
 * Those become thin wrappers in PR4-4B.
 */

import { responseBodyToEvent, transition, type TransitionEvent } from "./state";
import type {
  AuthEvent,
  AuthEventListener,
  AuthOrchestratorBootstrapDeps,
  BootstrapTelemetryEvent,
  BootstrapReadyResult,
  BootstrapResponseBody,
  BootstrapTemporaryErrorResult,
  IdentityKind,
  OrchestratorState,
  OrchestratorStatus,
  Session,
  StateListener,
} from "./types";

// ─── Defaults ──────────────────────────────────────────────────────────

/**
 * Maximum time (ms) the orchestrator will wait for fingerprint collection
 * before continuing without it. Per plan §10 fingerprint must NEVER delay
 * bootstrap indefinitely.
 */
const FINGERPRINT_TIMEOUT_MS = 1500;

/**
 * Maximum time (ms) for the session resolution phase. Mirrors the
 * fingerprint budget so a slow Supabase round-trip does not stall startup.
 */
const SESSION_TIMEOUT_MS = 5000;

/**
 * Maximum time (ms) for the bootstrap HTTP request itself.
 */
const BOOTSTRAP_TIMEOUT_MS = 10_000;

const INITIAL_STATE: OrchestratorState = {
  status: "idle",
  identity: "unauthenticated",
  userId: null,
  deviceId: null,
  isGuest: false,
  result: null,
  previousAuthUserId: null,
  fingerprintStatus: "pending",
  limitedMode: false,
  limitedReason: null,
};

// ─── Helpers ───────────────────────────────────────────────────────────

/** Race a promise against a timeout. Resolves to the fallback if timeout
 *  fires first. The original promise continues running but its result is
 *  discarded. */
function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T,
): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(fallback);
    }, ms);
    void promise
      .then((value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(fallback);
      });
  });
}

/** Wraps a fetch call in an AbortController timeout. Returns null on
 *  timeout / network failure so the caller can route to RESPONSE_TEMPORARY.
 *  The deps implementation is expected to do this internally, but we
 *  add a defensive layer here in case the dep does not. */
function withAbortTimeout<T>(
  factory: (signal: AbortSignal) => Promise<T>,
  ms: number,
): Promise<T | null> {
  // Defensive check: if AbortController isn't available, fall back to a
  // manual timer that swallows late results.
  if (typeof globalThis.AbortController === "undefined") {
    return withTimeout(factory({ aborted: false } as AbortSignal), ms, null);
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return factory(ctrl.signal)
    .then((value) => {
      clearTimeout(timer);
      return value;
    })
    .catch(() => {
      clearTimeout(timer);
      return null;
    });
}

// ─── Orchestrator ──────────────────────────────────────────────────────

export class AuthOrchestrator {
  private state: OrchestratorState;
  private listeners = new Set<StateListener>();
  private eventListeners = new Set<AuthEventListener>();
  private deps: AuthOrchestratorBootstrapDeps | null = null;
  private authSubscription: (() => void) | null = null;

  /**
   * Latest in-flight request version. Each call to bootstrap() bumps it.
   * Stale responses check this counter and bail out before mutating
   * state — implementing plan §5 hard rule #1.
   */
  private requestVersion = 0;

  /**
   * Timestamp (Date.now()) of the most recent runBootstrap() entry. Used
   * by buildTelemetry() to report total bootstrap duration_ms. Reset to
   * 0 whenever no bootstrap is in flight (the field is read-only from
   * outside this module — telemetry skips events when it's 0).
   */
  private bootstrapStartedAt = 0;

  constructor(initial: Partial<OrchestratorState> = {}) {
    this.state = { ...INITIAL_STATE, ...initial };
  }

  // ─── Public surface ─────────────────────────────────────────────────

  attach(deps: AuthOrchestratorBootstrapDeps): void {
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
        console.warn("[AuthOrchestrator] event listener threw:", err);
      }
    }
  }

  setState(patch: Partial<OrchestratorState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) {
      try {
        l(this.state);
      } catch (err) {
        console.warn("[AuthOrchestrator] state listener threw:", err);
      }
    }
  }

  // ─── Sign-in / sign-out ─────────────────────────────────────────────

  /**
   * OAuth entry point. Triggers Supabase's signInWithOAuth which redirects
   * the browser to the provider. The post-callback path comes back via
   * `onAuthStateChange` which then triggers a re-bootstrap.
   *
   * Returns null on success (browser redirect follows) or the error string
   * when sign-in failed locally.
   */
  async signInWithOAuth(
    provider: "google" | "github",
    redirectTo: string,
  ): Promise<string | null> {
    const deps = this.deps;
    if (!deps || !deps.isSupabaseConfigured) return "not_configured";
    if (!deps.signInWithOAuth) return "not_configured";
    if (this.state.status === "bootstrapping") return "bootstrapping";

    this.dispatch({ type: "OAUTH_CALLBACK", provider });

    const { error } = await deps.signInWithOAuth(provider, redirectTo);
    if (error) {
      this.dispatch({ type: "OAUTH_FAILURE", provider, error });
      return error;
    }

    this.dispatch({ type: "OAUTH_SUCCESS", provider });
    return null;
  }

  /**
   * Sign-out pipeline (plan §6 step 1-5):
   *   1. Capture previousAuthUserId on state.
   *   2. Transition ready -> signed_out (block gameplay).
   *   3. Notify Supabase (optional — server can resolve without it, but
   *      the OAuth cookie must be cleared to prevent stale-session
   *      replay).
   *   4. Transition signed_out -> resolving_session and trigger guest
   *      bootstrap with previousAuthUserId set in body.
   */
  async signOut(): Promise<void> {
    const deps = this.deps;
    const priorUserId = this.state.userId;
    const priorIdentity = this.state.identity;

    this.dispatch({ type: "SIGN_OUT_STARTED" });

    // Step 1: capture previous auth user id BEFORE state mutation. The
    // next bootstrap request must carry this so the server routes to the
    // create_signed_out_guest_after_signout RPC (plan §6 step 4).
    if (priorIdentity === "authenticated" && priorUserId) {
      this.setState({ previousAuthUserId: priorUserId });
    }

    // Step 2: ready -> signed_out (blocks gameplay via transition effect).
    this.applyTransition({ type: "SIGN_OUT" });

    // Step 3: clear previous user's game state synchronously. This MUST
    // happen BEFORE the next applyServerState — plan §5 hard rule.
    try {
      deps?.clearPreviousUserState();
    } catch (err) {
      console.warn("[AuthOrchestrator] clearPreviousUserState threw:", err);
    }

    // Step 4: notify Supabase (best-effort — local state is already cleared).
    if (deps?.signOutSupabase) {
      try {
        const { error } = await deps.signOutSupabase();
        if (error) {
          console.warn("[AuthOrchestrator] signOutSupabase failed:", error);
        }
      } catch (err) {
        console.warn("[AuthOrchestrator] signOutSupabase threw:", err);
      }
    }

    // Step 5: dispatch SIGN_OUT_COMPLETE and trigger the sign-out bootstrap.
    this.dispatch({ type: "SIGN_OUT_COMPLETE" });
    this.applyTransition({ type: "SIGN_OUT_COMPLETE" });

    void this.runBootstrap({
      reason: "sign_out",
      previousAuthUserId:
        priorIdentity === "authenticated" && priorUserId ? priorUserId : null,
    });
  }

  /**
   * Apply a Supabase session snapshot to orchestrator state. Public so
   * PR4-4B's AuthProvider can mirror the legacy AuthContext shape (user,
   * session, loading, isGuest). Internally this only updates the
   * identity/userId fields and dispatches AUTH_STATE_CHANGED — it does
   * NOT trigger bootstrap. Bootstrap is owned by startup() and the
   * auth-state-change subscription below.
   */
  applySession(session: Session | null): void {
    const identity: IdentityKind = session?.user
      ? session.user.is_anonymous
        ? "anonymous"
        : "authenticated"
      : "unauthenticated";
    this.setState({
      identity,
      userId: session?.user?.id ?? null,
      isGuest: session?.user?.is_anonymous ?? false,
    });
    this.dispatch({ type: "AUTH_STATE_CHANGED", session });
  }

  // ─── Main entry point ───────────────────────────────────────────────

  /**
   * Startup pipeline (plan §4 steps 1-12):
   *   1. Ensure deps attached.
   *   2. Read deviceId (create if missing).
   *   3. Subscribe to auth state changes (optional dep).
   *   4. Run the bootstrap pipeline (resolving_session -> bootstrapping -> ready).
   *
   * Returns a cleanup function that unsubscribes auth changes.
   */
  // eslint-disable-next-line require-await -- startup returns a cleanup function and triggers background bootstrap; the async signature is required by callers awaiting startup().
  async startup(): Promise<() => void> {
    this.dispatch({ type: "STARTUP" });

    const deps = this.deps;
    if (!deps) {
      console.warn("[AuthOrchestrator] startup called before attach()");
      // Stay in idle — no bootstrap can run without deps. The state
      // machine refuses STARTUP from non-idle states, so we deliberately
      // do NOT transition here.
      return () => {};
    }

    if (!deps.isSupabaseConfigured) {
      // SEC-002: fail closed on misconfiguration — do not pretend to be
      // authenticated. Stay in idle so the UI surfaces a config error
      // rather than rendering a half-hydrated game.
      return () => {};
    }

    // Step 1: deviceId (plan §4 step 2).
    const deviceId = deps.getDeviceId();
    this.setState({ deviceId });

    // Step 3: subscribe to auth state changes (plan §6 OAuth callback
    // timing). Optional — test harnesses may omit it.
    if (deps.onAuthStateChange) {
      this.authSubscription = deps.onAuthStateChange((session) => {
        const prevUserId = this.state.userId;
        this.applySession(session);
        const currentUserId = this.state.userId;
        // Plan §5: ready -> resolving_session when the auth user changes.
        if (prevUserId !== currentUserId) {
          // Identity changed (e.g., OAuth completed, account switched).
          // Trigger a fresh bootstrap. Stale-response guard ensures the
          // previous bootstrap's result (if any) cannot win.
          this.applyTransition({
            type: "AUTH_USER_CHANGED",
            userId: currentUserId,
          });
          // Clear previous user's state before the new bootstrap applies.
          try {
            deps.clearPreviousUserState();
          } catch (err) {
            console.warn(
              "[AuthOrchestrator] clearPreviousUserState threw:",
              err,
            );
          }
          void this.runBootstrap({
            reason: "auth_state_change",
            previousAuthUserId: this.state.previousAuthUserId,
          });
        }
      });
    }

    // Step 4: run the bootstrap pipeline.
    void this.runBootstrap({
      reason: "mount",
      previousAuthUserId: this.state.previousAuthUserId,
    });

    return () => {
      this.authSubscription?.();
      this.authSubscription = null;
      // Bump the request version so any in-flight bootstrap is invalidated.
      this.requestVersion += 1;
    };
  }

  /** Manually retry from a `temporary_error` state. */
  retry(): void {
    if (this.state.status !== "temporary_error") return;
    this.applyTransition({ type: "RETRY" });
    void this.runBootstrap({
      reason: "retry",
      previousAuthUserId: this.state.previousAuthUserId,
    });
  }

  // ─── Bootstrap pipeline (private) ───────────────────────────────────

  /**
   * Drive the bootstrap state machine. Bumps the request version so any
   * in-flight response can be recognized as stale. Reads the deviceId
   * from state (already populated by startup()), collects the fingerprint
   * with a strict timeout, resolves the session, then POSTs to
   * /api/auth/bootstrap.
   *
   * The result flows through `responseBodyToEvent` -> `transition()` ->
   * state mutation. Side effects (applyServerState, block gameplay, etc.)
   * are wired here, NOT inside `state.ts`, so the state machine stays
   * pure.
   */
  private async runBootstrap(args: {
    reason: "mount" | "auth_state_change" | "sign_out" | "retry";
    previousAuthUserId: string | null;
  }): Promise<void> {
    const deps = this.deps;
    if (!deps) return;

    // Stale-response guard: bump the version. Any response that arrives
    // after this point will check the version and bail if it doesn't
    // match.
    const version = ++this.requestVersion;
    // Telemetry: capture start time so we can report total bootstrap
    // duration. Per-call — overwritten on each new runBootstrap.
    this.bootstrapStartedAt = Date.now();

    // Resolve session + collect fingerprint IN PARALLEL (plan §4 step 3).
    // The session result is required before the request body is built;
    // the fingerprint is telemetry-only and now fire-and-forget in the
    // dep (returns synchronously via Promise.resolve). The timeout
    // wrapper remains as a defensive no-op — if a future dep returns an
    // async fingerprint, this still bounds it.
    const fingerprintPromise = withTimeout(
      deps
        .getFingerprint(FINGERPRINT_TIMEOUT_MS)
        .then((value) => ({
          status: value ? ("available" as const) : ("unavailable" as const),
          value,
        }))
        .catch(() => ({ status: "timeout" as const, value: null })),
      FINGERPRINT_TIMEOUT_MS + 250,
      { status: "timeout" as const, value: null },
    );

    const sessionPromise = withTimeout(
      deps.getSession(),
      SESSION_TIMEOUT_MS,
      null as Session | null,
    );

    const [fingerprint, session] = await Promise.all([
      fingerprintPromise,
      sessionPromise,
    ]);

    // Update fingerprint telemetry status on state (does not change status).
    this.setState({ fingerprintStatus: fingerprint.status });

    // If a newer request started while we were collecting input, abort.
    if (version !== this.requestVersion) return;

    // transitioning idle -> resolving_session. Only valid from idle. If
    // we're already mid-flow (e.g., another bootstrap is running), skip.
    if (this.state.status === "idle") {
      this.applyTransition({ type: "STARTUP" });
    } else if (
      this.state.status === "ready" ||
      this.state.status === "signed_out"
    ) {
      // Plan §5: ready -> resolving_session on auth change. The transition
      // is only meaningful if the user has actually changed. The caller
      // (signOut / onAuthStateChange) is responsible for that decision.
      this.applyTransition({
        type: "AUTH_USER_CHANGED",
        userId: session?.user?.id ?? null,
      });
    }

    // resolving_session -> bootstrapping (after session resolved).
    this.applyTransition({ type: "SESSION_RESOLVED" });

    // Stale-response guard redux: a retry or sign-out fired during the
    // session/fingerprint wait must invalidate us.
    if (version !== this.requestVersion) return;

    const deviceId = this.state.deviceId ?? "";
    if (!deviceId) {
      // SEC-002 fail closed — without a deviceId we cannot resolve
      // identity. Block gameplay; this is a permanent error.
      this.setState({
        status: "recovery_required",
        result: { status: "recovery_required" },
        previousAuthUserId: null,
      });
      return;
    }

    // Build request body. previousAuthUserId is the only field that
    // changes between bootstrap reasons — for `mount` and `retry` we
    // pass whatever the orchestrator remembers; for `sign_out` the
    // caller supplies it explicitly.
    const previousAuthUserId =
      args.reason === "sign_out"
        ? args.previousAuthUserId
        : this.state.previousAuthUserId;

    const body = {
      deviceId,
      fingerprintHash: fingerprint.value,
      previousAuthUserId,
      // Migration 079: orchestrator does NOT set mergePolicy — the server
      // resolves it from profiles.auth_merge_policy per user, falling back
      // to the default 'auth_wins_archive_guest'. We deliberately do not
      // forward a client-supplied value here to keep the trust boundary
      // server-side.
    };

    // Issue the bootstrap request. The dep is responsible for fetch +
    // parsing; we wrap in an abort-timeout defensively so a misbehaving
    // dep can't hang startup forever.
    const response = await withAbortTimeout(
      () => deps.callBootstrap(body),
      BOOTSTRAP_TIMEOUT_MS,
    );

    // Stale-response guard: drop responses for old versions.
    if (version !== this.requestVersion) return;

    const event = responseBodyToEvent(response);
    if (!event) {
      // Unknown response shape — treat as temporary error.
      this.applyTransition({
        type: "RESPONSE_TEMPORARY",
        response: { code: "INTERNAL_BOOTSTRAP_ERROR" },
      });
      return;
    }

    this.applyTransition(event);
  }

  // ─── State machine wiring ───────────────────────────────────────────

  /**
   * Apply a transition event to the current state. Drives `transition()`
   * (pure) and then applies the side effects it requested.
   *
   * IMPORTANT: this is the SOLE place where side effects fire in response
   * to a bootstrap response. The state machine itself is pure.
   */
  private applyTransition(event: TransitionEvent): void {
    const current = this.state.status;
    const outcome = transition(current, event);
    const deps = this.deps;

    // Apply state patch. We always update `status` and `result` (when the
    // event is a response). Identity / userId are derived from the
    // response payload for response events.
    const patch: Partial<OrchestratorState> = { status: outcome.nextStatus };

    if (event.type === "RESPONSE_BOOTSTRAP_READY") {
      patch.identity = event.response.isGuest ? "anonymous" : "authenticated";
      patch.userId = event.response.userId;
      patch.isGuest = event.response.isGuest;
      const readyResult: BootstrapReadyResult = {
        status: "ready",
        userId: event.response.userId,
        isGuest: event.response.isGuest,
        isNewUser: event.response.isNewUser,
        source: this.normalizeSource(event.response.source),
        hasGameState: event.response.hasGameState,
        needsStateLoad: event.response.needsStateLoad,
        gameState: event.response.gameState,
        // Migration 079: archive receipt / archived guest id propagate
        // through to the orchestrator state for one-time UI banner.
        archiveReceiptId: event.response.archiveReceiptId ?? null,
        archivedGuestId: event.response.archivedGuestId ?? null,
      };
      patch.result = readyResult;
      // Bootstrap consumed any pending previousAuthUserId. Clear it so
      // subsequent requests don't accidentally include it.
      patch.previousAuthUserId = null;
    } else if (event.type === "RESPONSE_CONFLICT") {
      patch.result = {
        status: "conflict",
        reason: event.response.code,
        survivingUserId: event.response.survivingUserId,
        archivedGuestId: event.response.archivedGuestId,
      };
    } else if (event.type === "RESPONSE_RECOVERY") {
      patch.result = { status: "recovery_required" };
    } else if (event.type === "RESPONSE_TEMPORARY") {
      const reason = this.mapTemporaryReason(event.response.code);
      patch.result = {
        status: "temporary_error",
        reason,
        retryable:
          event.response.code === "BOOTSTRAP_RATE_LIMITED" ||
          event.response.code === "BOOTSTRAP_UNAVAILABLE",
      };
    } else if (event.type === "STARTUP") {
      patch.result = null;
    } else if (event.type === "AUTH_USER_CHANGED") {
      // Identity is about to change — clear result. The actual identity
      // update happens via applySession() before this transition fires,
      // so we only need to clear the result + block gameplay here.
      patch.result = null;
    }

    this.setState(patch);

    // Telemetry: fire-and-forget on terminal bootstrap outcomes. The dep
    // is optional; callers that don't wire telemetry simply don't
    // receive these events. Errors are swallowed inside the dep impl.
    // We compute the outcome string from the terminal-state branch the
    // patch already filled in (patch.result.status carries the
    // orchestrator's `result` shape, which we use for the API contract).
    if (deps?.emitTelemetry) {
      const telemetry = this.buildTelemetry(event);
      if (telemetry) {
        try {
          deps.emitTelemetry(telemetry);
        } catch (err) {
          console.warn("[AuthOrchestrator] emitTelemetry threw:", err);
        }
      }
    }

    // Apply side effects.
    for (const effect of outcome.effects) {
      switch (effect) {
        case "apply_ready_response":
          if (event.type === "RESPONSE_BOOTSTRAP_READY") {
            try {
              deps?.applyServerState({
                userId: event.response.userId,
                isGuest: event.response.isGuest,
                isNewUser: event.response.isNewUser,
                needsStateLoad: event.response.needsStateLoad,
                gameState: event.response.gameState,
              });
            } catch (err) {
              console.warn("[AuthOrchestrator] applyServerState threw:", err);
            }
            this.dispatch({
              type: "BOOTSTRAP_READY",
              userId: event.response.userId,
              isGuest: event.response.isGuest,
              isNewUser: event.response.isNewUser,
              source: this.normalizeSource(event.response.source),
            });
          }
          break;
        case "apply_conflict_response":
          if (event.type === "RESPONSE_CONFLICT") {
            this.dispatch({
              type: "BOOTSTRAP_CONFLICT",
              reason: event.response.code,
              survivingUserId: event.response.survivingUserId,
              archivedGuestId: event.response.archivedGuestId,
            });
          }
          break;
        case "apply_recovery_response":
          this.dispatch({ type: "BOOTSTRAP_RECOVERY_REQUIRED" });
          break;
        case "apply_temporary_error_response":
          if (event.type === "RESPONSE_TEMPORARY") {
            const retryable =
              event.response.code === "BOOTSTRAP_RATE_LIMITED" ||
              event.response.code === "BOOTSTRAP_UNAVAILABLE";
            this.dispatch({
              type: "BOOTSTRAP_TEMPORARY_ERROR",
              retryable,
            });
          }
          break;
        case "block_gameplay":
          // The store + UI listen for status changes; nothing extra to
          // do here. Kept as an explicit effect for clarity / future
          // hooks (e.g., showing a loading overlay).
          break;
        case "clear_previous_user_state":
          // Done at the call site (signOut / onAuthStateChange). Listed
          // here as a documented effect so the state machine stays the
          // single source of truth for what must happen.
          break;
        case "trigger_sign_out_bootstrap":
          // Triggered by signOut() itself. Listed here for documentation
          // completeness; the call site runs the bootstrap directly.
          break;
        default: {
          const _exhaustive: never = effect;
          void _exhaustive;
        }
      }
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  private normalizeSource(raw: string): BootstrapReadyResult["source"] {
    if (
      raw === "deviceId" ||
      raw === "auth" ||
      raw === "fresh" ||
      raw === "sign_out_to_guest"
    ) {
      return raw;
    }
    return "fresh";
  }

  /**
   * Build a telemetry event from a transition + the state patch that
   * was about to be applied. Returns null for non-terminal transitions
   * (STARTUP, SESSION_RESOLVED, etc.) and for AUTH_USER_CHANGED which
   * is not an outcome of bootstrap.
   *
   * Telemetry outcomes (matches `/api/telemetry/bootstrap` whitelist):
   *   ready             → RESPONSE_BOOTSTRAP_READY
   *   conflict          → RESPONSE_CONFLICT
   *   recovery_required → RESPONSE_RECOVERY
   *   temporary_error   → RESPONSE_TEMPORARY
   *   signed_out        → emitted by signOut() flow (no terminal event here)
   *   signed_in         → emitted by onAuthStateChange (no terminal event here)
   *
   * Duration is captured from the latest runBootstrap entry. Fingerprint
   * status is read off the live state (set by runBootstrap when the
   * fingerprint race resolves).
   */
  private buildTelemetry(
    event: TransitionEvent,
  ): BootstrapTelemetryEvent | null {
    const deviceId = this.state.deviceId;
    if (!deviceId) return null;

    const durationMs =
      this.bootstrapStartedAt > 0
        ? Math.min(60_000, Date.now() - this.bootstrapStartedAt)
        : null;

    const fingerprintStatus = this.normalizeFingerprintStatus(
      this.state.fingerprintStatus,
    );

    // Build the per-event fields in one place. Default (unknown event)
    // is null — the caller (`applyTransition`) skips emission for
    // non-terminal transitions like STARTUP / AUTH_USER_CHANGED.
    const fields: Pick<
      BootstrapTelemetryEvent,
      "outcome" | "source" | "isGuest"
    > = (() => {
      switch (event.type) {
        case "RESPONSE_BOOTSTRAP_READY":
          return {
            outcome: "ready",
            source: this.normalizeSource(event.response.source),
            isGuest: event.response.isGuest,
          };
        case "RESPONSE_CONFLICT":
          // RESPONSE_CONFLICT payload has no `source` field (it's only
          // on BOOTSTRAP_READY). Telemetry gets null here — fine, the
          // server side accepts null.
          return { outcome: "conflict", source: null, isGuest: null };
        case "RESPONSE_RECOVERY":
          return { outcome: "recovery_required", source: null, isGuest: null };
        case "RESPONSE_TEMPORARY":
          return { outcome: "temporary_error", source: null, isGuest: null };
        default:
          return { outcome: null as never, source: null, isGuest: null };
      }
    })();

    if (fields.outcome === null) return null;

    return {
      deviceId,
      ...fields,
      durationMs,
      fingerprintStatus,
      stateAtEmit: this.state.status,
    };
  }

  private normalizeFingerprintStatus(
    raw: string | null | undefined,
  ): BootstrapTelemetryEvent["fingerprintStatus"] {
    // Maps the orchestrator's FingerprintStatus enum to the server
    // telemetry whitelist (ok | unavailable | timeout | null).
    if (raw === "available") return "ok";
    if (raw === "timeout" || raw === "blocked") return "timeout";
    if (raw === "unavailable" || raw === "pending") return "unavailable";
    return null;
  }

  private mapTemporaryReason(
    code: Extract<
      BootstrapResponseBody,
      {
        code:
          | "BOOTSTRAP_RATE_LIMITED"
          | "BOOTSTRAP_UNAVAILABLE"
          | "INTERNAL_BOOTSTRAP_ERROR"
          | "INVALID_BOOTSTRAP_REQUEST"
          | "INVALID_SESSION";
      }
    >["code"],
  ): BootstrapTemporaryErrorResult["reason"] {
    switch (code) {
      case "BOOTSTRAP_RATE_LIMITED":
        return "rate_limited";
      case "BOOTSTRAP_UNAVAILABLE":
        return "service_unavailable";
      case "INTERNAL_BOOTSTRAP_ERROR":
        return "internal_error";
      case "INVALID_BOOTSTRAP_REQUEST":
        return "invalid_request";
      case "INVALID_SESSION":
        return "invalid_session";
      default: {
        const _exhaustive: never = code;
        void _exhaustive;
        return "internal_error";
      }
    }
  }

  // Exposed for tests so the orchestrator's status can be asserted
  // against the §5 names without leaking the private field.
  getStatus(): OrchestratorStatus {
    return this.state.status;
  }
}
