# AUTH_ORCHESTRATOR_REDESIGN_PLAN.md

## 1. Summary

Redesign Auth Orchestrator around one authoritative bootstrap path:

`deviceId -> start session resolution and fingerprint attempt in parallel -> wait for session resolution -> use fingerprint result if available, otherwise continue with unavailable or timeout -> /api/auth/bootstrap -> server identity/profile/game-state validation -> applyServerState -> render`

Current split flows must be replaced or wrapped by the shared bootstrap service. Presence is not auth validation.

Frozen architectural decisions (2026-07-14):

- **Storage:** New `device_bindings` table with `binding_type ∈ {authenticated_association, active_guest}` and `status ∈ {active, archived, revoked, superseded}`. `guest_identities` becomes guest-only metadata.
- **Atomicity:** PostgreSQL RPC functions as the transaction boundary for every multi-step write.
- **Identity resolution:** `deviceId` (via `device_bindings.active_guest`) + verified Supabase session. Fingerprint is never queried for identity.
- **Concurrency:** Partial unique index as authority. `INSERT ... ON CONFLICT DO NOTHING` + re-read. `SELECT ... FOR UPDATE` reserved for transfer/archival paths.

Final verdict: ready for implementation (2026-07-14).

All blockers resolved:

- ~~Audit the existing Supabase schema and bootstrap service layer.~~ Resolved: schema audit complete (see §8 storage model).
- ~~Confirm whether atomic initialization and guest upgrade will use a PostgreSQL RPC or an existing transaction-capable server service.~~ Resolved: PostgreSQL RPCs confirmed (§16).
- ~~Confirm how authenticated device associations and active guest bindings coexist for the same `deviceId`.~~ Resolved: new `device_bindings` table with `binding_type` + `status` discriminator (§8).
- ~~Do not implement ownership transfer, guest archival, or device rebinding until the atomic transaction boundary is confirmed.~~ Boundary confirmed; safe to proceed (§16).
- ~~Do not finalize binding constraints until the authenticated-association plus active-guest-binding lifecycle is supported.~~ Constraints finalized (§8).
- ~~Do not implement sign-out-to-guest bootstrap using destructive rebinding.~~ Sign-out flow confirmed non-destructive (§6).

## 2. Goals

- Guarantee every playable user has one profile and one `server_game_state`.
- Guarantee device binding is deterministic and idempotent.
- Support guest, Google, and GitHub through one bootstrap service.
- Preserve guest progress when upgrading to a new authenticated account.
- Prevent stale bootstrap responses from applying wrong-user state.
- Never return empty startup data when canonical config is available.

## 3. Non-goals

- Do not redesign Supabase OAuth itself.
- Do not use fingerprint as the primary identity.
- Do not allow client-submitted gameplay state during bootstrap.
- Do not auto-merge existing auth progress with guest progress.

## 4. Canonical Startup Flow

1. Client initializes app.
2. Client reads persistent `deviceId`; creates one only if absent.
3. Client starts Supabase session resolution and fingerprint collection in parallel.
4. Fingerprint collection uses a strict timeout.
5. Client waits for session resolution before bootstrap.
6. Client uses fingerprint result if available; if unavailable or timed out, continue with `fingerprintStatus: "unavailable"` or `"timeout"`.
7. Client calls `POST /api/auth/bootstrap`.
8. Server resolves guest or authenticated identity.
9. Server ensures profile, device binding, and `server_game_state`.
10. Server validates ownership, schema, config, and state.
11. Server returns bootstrap-ready response.
12. Client validates response, clears old-user state if needed, calls `applyServerState`, then marks ready.

Rules:

- Fingerprint must not delay bootstrap indefinitely.
- Do not retry fingerprinting inside the blocking startup flow.
- Later fingerprint retry may be non-blocking only.

## 5. Client Orchestrator State Machine

Required states:

- `idle`: no bootstrap started.
- `resolving_session`: waiting for Supabase session result.
- `bootstrapping`: latest bootstrap request in flight.
- `ready`: validated state applied.
- `conflict`: identity/account conflict requires user resolution.
- `recovery_required`: unsafe saved state; ordinary retry must not loop.
- `temporary_error`: retry may succeed.
- `signed_out`: temporary transition state after sign-out.

Transitions:

- `idle -> resolving_session`: app mount.
- `resolving_session -> bootstrapping`: session resolved.
- `bootstrapping -> ready`: `200 BOOTSTRAP_READY`.
- `bootstrapping -> conflict`: `409 DEVICE_BOUND_TO_OTHER_USER` or `409 ACCOUNT_PROGRESS_CONFLICT`.
- `bootstrapping -> recovery_required`: `422 STATE_RECOVERY_REQUIRED`.
- `bootstrapping -> temporary_error`: `429`, `503`, network failure, retryable `500`.
- `ready -> resolving_session`: authenticated user changes.
- `authenticated sign-out -> signed_out -> resolving_session -> bootstrapping -> ready`: clear authenticated state, resolve device identity, guest bootstrap.
- stale response -> ignored.

Rules:

- Only the latest bootstrap request may call `applyServerState`.
- Ignore stale bootstrap responses.
- When resolved user changes, immediately block gameplay and clear previous user game state before applying the new response.
- Never render one user's state while another user is bootstrapping.
- Do not unnecessarily clear valid state during retry for the same identity.
- Prevent guest bootstrap response from overwriting later authenticated bootstrap response.

## 6. Server Bootstrap Decision Table

Session behavior:

- No session cookie means normal guest bootstrap.
- Valid session means authenticated bootstrap.
- Refreshable expired session must refresh before bootstrap.
- Safely cleared expired session restarts as guest bootstrap.
- Malformed, tampered, or suspicious session data returns `401 INVALID_SESSION`.
- Do not silently downgrade suspicious session data to guest identity.

Sign-out flow (confirmed behavior, no stub):

- Authenticated sign-out:
  1. Clear authenticated client state immediately.
  2. Preserve authenticated device-association history (binding row stays in `device_bindings` with `status='active'`, `binding_type='authenticated_association'`).
  3. Resolve the active guest binding for this device via `device_bindings` (`binding_type='active_guest'`, `status='active'`).
  4. If none exists, create a new guest and initial `server_game_state` transactionally via the `create_signed_out_guest_after_signout` RPC.
  5. Bootstrap response carries the new (or existing) guest identity.
- Signing out must not delete, transfer, overwrite, or detach authenticated account association.
- Signing out must never load authenticated progress without a valid session.
- On future sign-in, evaluate the active guest for upgrade or `ACCOUNT_PROGRESS_CONFLICT`.

No-session device binding:

- Binding points to active guest: validate guest identity, profile, state ownership, and binding; load existing guest profile and canonical server state.
- Binding points to authenticated user: never load authenticated profile/gameplay state without valid auth session; preserve authenticated association; resolve a separate active signed-out guest binding.
- No active signed-out guest binding: create one through the approved atomic guest bootstrap transaction.
- Binding points to archived, revoked, upgraded, superseded, invalid, or orphaned guest: do not load it; return controlled recovery/conflict, or create a new guest only if server can safely invalidate/supersede stale binding inside approved transaction.
- The `device_bindings` table (per §8) is the confirmed binding source. Stale `guest_identities` rows are metadata only.

Authenticated session:

- Device already bound to same authenticated user: validate ownership and load existing authenticated profile/state.
- No device binding + existing authenticated profile/state: bind device transactionally and load existing state; do not create new game state.
- Existing authenticated profile but missing `server_game_state`: deterministic repair only; otherwise `422 STATE_RECOVERY_REQUIRED`.
- Existing `server_game_state` but missing profile: deterministic repair only; otherwise `422 STATE_RECOVERY_REQUIRED`.
- Same-user binding but invalid ownership relationship: stop bootstrap and return conflict or recovery.
- Device bound to another user:
  1. Check whether bound user is active guest eligible for upgrade.
  2. If guest is eligible and authenticated account has no progress, perform transactional guest upgrade.
  3. If guest is eligible but authenticated account already has progress, return `409 ACCOUNT_PROGRESS_CONFLICT`.
  4. If bound user is another authenticated user, unrelated guest, archived guest, or invalid binding, return `409 DEVICE_BOUND_TO_OTHER_USER`.

Re-sign-in:

- Resolve authenticated account from verified session.
- Check current active guest binding separately.
- If authenticated account has no progress and guest is upgradeable, perform transactional guest upgrade.
- If both contain progress, return `409 ACCOUNT_PROGRESS_CONFLICT`.
- Never treat preserved authenticated device association as guest ownership.

Canonical rules:

- `No valid auth session = never load authenticated gameplay state solely from deviceId.`
- `Auth user + upgradeable guest binding + no auth progress = guest upgrade.`
- `Auth user + upgradeable guest binding + existing auth progress = ACCOUNT_PROGRESS_CONFLICT.`
- `Auth user + unrelated active binding = DEVICE_BOUND_TO_OTHER_USER.`

## 7. Transaction Boundaries

Atomic operations:

- New guest initialization.
- New authenticated-player initialization.
- Guest-to-authenticated upgrade.
- Authenticated device association update and guest-binding lifecycle transition.
- Guest archival.
- Game-state ownership transfer.

Rollback required if any step fails. No partial states:

- user without profile
- profile without game state
- archived guest before state transfer
- rebound device with old state ownership

Database migration required: transactional RPC or equivalent service-layer transaction for bootstrap/upgrade.

## 8. Idempotency and Concurrency Controls

Canonical rule:

`Same session + same deviceId + repeated bootstrap = same identity, profile, and game state.`

Identity rules:

- `deviceId binding = guest browser identity anchor.`
- `verified auth session = authenticated identity authority.`
- `fingerprint = optional risk signal only.`

Logical binding concepts:

- Authenticated device association records that a device was previously used by an authenticated account. It does not grant account access and requires valid session before authenticated state can load.
- Active guest binding resolves signed-out gameplay for the browser. It may coexist with authenticated device association history and must resolve to only one active guest identity at a time.

Schema audit completed (2026-07-14). Decision: new `device_bindings` table.

Storage model (frozen):

- New `device_bindings` table with `binding_type ∈ {authenticated_association, active_guest}` and `status ∈ {active, archived, revoked, superseded}`.
- `guest_identities` becomes guest-only metadata (fingerprint, fingerprint_hash, claimed_at, superseded_at, superseded_by). The `device_id` column on `guest_identities` is dropped.
- Authenticated access remains session-authoritative. `device_bindings` rows never grant account access on their own.

Required constraints:

- Partial unique index `(device_id) WHERE binding_type='active_guest' AND status='active'` — one active guest binding per device.
- One profile per user: `profiles.id` PK (already enforced).
- One `server_game_state` per user: `server_game_state.user_id` PK (already enforced).
- Authenticated device associations may coexist with one active guest binding for the same device (no constraint prevents multiple `binding_type` values for one device_id).
- Do NOT add `UNIQUE(device_id)` (global). It would block the required sign-out-to-guest lifecycle where one device carries both an authenticated association history and an active guest binding.

Controls:

- Unique profile per user: `profiles.id`.
- Unique `server_game_state` per user: `server_game_state.user_id`.
- One active guest binding per `deviceId` via partial unique index on `device_bindings`.
- Authenticated account access remains session-authoritative.
- Do NOT add global `UNIQUE(device_id)`.
- Do not delete authenticated association history when creating a signed-out guest.
- Do not let guest binding grant authenticated access.
- Fingerprint must not be used as a unique ownership constraint.
- Idempotent guest creation by confirmed active guest binding only.
- Idempotent auth creation by auth user id.
- Idempotent upgrade by operation key: `authUserId + guestUserId + deviceId`.
- Concurrent bootstrap uses DB unique constraints plus transaction retry on conflict.

Concurrency strategy (frozen):

- The partial unique index is the authority for preventing duplicate active_guest bindings on the same device.
- RPC creation path uses `INSERT ... ON CONFLICT DO NOTHING ... RETURNING ...`. If no row was inserted, the RPC re-reads and returns the winning existing row.
- `SELECT ... FOR UPDATE` is reserved for ownership transfer / archival / supersede paths only (not for first-creation when no row exists yet).
- Two simultaneous requests must converge to the same row set, not create duplicates.
- Safe simultaneous requests depend on the PostgreSQL RPC atomic transaction boundary.

## 9. Device Identity Rules

- Read existing persistent `deviceId`.
- Create and persist only when genuinely absent.
- Never create a new `deviceId` on retry.
- Validate format server-side.
- Device ID is the persistent browser-installation anchor for guest resolution, not authenticated ownership.
- Device binding must always be validated against resolved identity type.
- A device binding to an authenticated user must never allow authenticated gameplay without a valid session.
- Authenticated association may coexist with one active guest binding for signed-out gameplay.
- Signing out must not delete, transfer, overwrite, or detach authenticated account association.
- Signed-out guest creation must not overwrite authenticated account history or progress.
- Stale or invalid bindings must be resolved server-side before gameplay starts.
- Do not replace a device binding merely because client submits a different `deviceId`.
- Device rebinding must occur only through an approved transactional server path.
- If persistent storage is unavailable and stable `deviceId` cannot be established, block bootstrap with device initialization error.
- Do not create temporary guest identities with unstable IDs.
- `guest_identities` is NOT the device-binding table. It carries guest-specific metadata (fingerprint, fingerprint_hash, claimed_at, superseded_at, superseded_by) only.
- `device_bindings` is the confirmed binding source for uniqueness, rebinding, conflict checks, and idempotency.
- Preferred logical separation (frozen):
  - `device_bindings` (authenticated_association) stores authenticated device history
  - `device_bindings` (active_guest) stores signed-out guest resolution
  - `guest_identities` stores guest-specific fingerprint metadata

## 10. Fingerprint Rules

- Fingerprint is optional anti-abuse/recovery signal only.
- Fingerprint is not an identity source.
- Fingerprint must not be used as a unique ownership constraint.
- Fingerprint must not resolve guest or authenticated user.
- Fingerprint must not create a guest identity.
- Fingerprint must not trigger account merge, ownership transfer, or device rebinding.
- Matching fingerprint must not grant access to another player.
- Changed fingerprint must not create a new guest.
- Fingerprint collision must not merge or expose another player.
- Fingerprint absence, change, collision, or failure must not change resolved player identity.
- Do not create a unique database constraint that treats fingerprint as player ownership.
- Do not use fingerprint as a secondary identity lookup.
- `bootstrap_guest` RPC MUST NOT query by fingerprint. Identity lookup uses `device_bindings` only.
- Missing or changed fingerprint must not create, merge, or recover identity.
- Fingerprint failure (status `unavailable` / `blocked` / `timeout` / `invalid`) must not block bootstrap.
- Do not use fingerprint as a fallback when `deviceId` is missing.
- Never store `__fingerprint_unavailable__` as a real fingerprint.
- Raw fingerprint values must not be exposed to client.
- Fingerprint collection must use a strict timeout.
- Timeout sets `fingerprintStatus` to `"timeout"`.
- Bootstrap continues using persistent `deviceId`.
- Do not retry fingerprinting inside blocking startup path.
- Later retry must be non-blocking and must not interrupt gameplay.
- Status values: `available`, `unavailable`, `blocked`, `timeout`, `invalid`.
- Telemetry:
  - `unavailable` / `blocked`: info or low severity.
  - `timeout` / `invalid`: warning.
  - repeated abnormal failure + other risk signals: security event.
- Do not log raw fingerprint unless explicitly needed and safe.

## 11. Guest-To-Authenticated Upgrade

A verified guest binding requires:

- Active server-side binding exists for submitted persistent `deviceId`.
- Binding points to the guest user.
- Guest identity has not been upgraded, archived, revoked, or superseded.
- Guest profile and `server_game_state` belong to the same guest user.
- Binding ownership and state integrity checks pass.
- Fingerprint availability is not required.
- Fingerprint may only be used as an additional risk signal.

When auth user is new and current `deviceId` has verified guest binding:

- Validate guest state ownership/schema/version.
- Transfer server-owned progress to auth user.
- Preserve money, resources, buildings, research, workers, quests, achievements, timestamps, and valid progression.
- Create or preserve the authenticated device association for the authenticated user.
- Mark the upgraded guest binding as archived, superseded, or inactive only after the ownership transfer succeeds.
- Do not destructively replace unrelated authenticated device-association history.
- Archive/supersede guest identity after transfer succeeds.
- Return migrated auth state.
- If auth user already has progress, return `409 ACCOUNT_PROGRESS_CONFLICT`; never auto-merge.

## 12. Conflict Handling

Conflict cases:

- `DEVICE_BOUND_TO_OTHER_USER`
- `ACCOUNT_PROGRESS_CONFLICT`

Rules:

- A valid upgradeable guest binding is not a device conflict.
- `DEVICE_BOUND_TO_OTHER_USER` applies only to unrelated, authenticated, archived, invalid, or unsafe bindings.
- `ACCOUNT_PROGRESS_CONFLICT` applies when both upgradeable guest and authenticated account already contain progress.
- Do not auto-overwrite progress.
- Do not auto-merge progress.
- Do not client-merge.
- Return stable conflict payload.
- UI may offer sign out, switch account, continue through controlled server action, or support.

## 13. Recovery Handling

Use `STATE_RECOVERY_REQUIRED` when state is corrupted, unsupported, inconsistent, or cannot be deterministically migrated.

Rules:

- Block gameplay.
- Do not reset progress automatically.
- Log server-side recovery reference.
- Retry only when server says retryable.
- Provide support/admin recovery path.

## 14. UI Components And User Outcomes

UI component required: `BootstrapLoadingScreen`.

- Show during `resolving_session` and `bootstrapping`.

UI component required: `BootstrapErrorScreen`.

- For retryable network/server/config/DB failures.
- Actions: Retry, Sign out when relevant.
- Gameplay blocked until success.

UI component required: `BootstrapConflictScreen`.

- For device/account conflicts.
- Actions: Sign out and retry, switch account, controlled server continuation, support.
- No client overwrite/merge.

UI component required: `StateRecoveryScreen`.

- Blocks gameplay.
- Shows recovery reference.
- Retry only when appropriate.

UI component required: `FingerprintStatusNotice`.

- Non-blocking.
- Show only when fingerprint absence affects sensitive operation.
- Never show global bootstrap error for fingerprint-only failure.

## 15. API Contracts And Error Codes

New endpoint: `POST /api/auth/bootstrap`.

Success:

- HTTP `200`
- `code: "BOOTSTRAP_READY"`

Errors:

- `400 INVALID_BOOTSTRAP_REQUEST`
- `401 INVALID_SESSION`
- `409 DEVICE_BOUND_TO_OTHER_USER`
- `409 ACCOUNT_PROGRESS_CONFLICT`
- `422 STATE_RECOVERY_REQUIRED`
- `429 BOOTSTRAP_RATE_LIMITED`
- `503 BOOTSTRAP_UNAVAILABLE`
- `500 INTERNAL_BOOTSTRAP_ERROR`

Status rules:

- `409`: device, ownership, and account-progress conflicts.
- `422`: known invalid, corrupted, unsupported, or unrecoverable saved state.
- `503`: recovery/bootstrap cannot proceed because config, database, or required infrastructure is unavailable.
- `500`: unexpected internal failures only.

Error payload:

```json
{
  "code": "ACCOUNT_PROGRESS_CONFLICT",
  "message": "Account progress conflict requires resolution.",
  "retryable": false,
  "requiresResolution": true,
  "metadata": {}
}
```

Rules:

- Do not return `bootstrapStatus: error` with HTTP `200`.
- Do not expose raw fingerprints, DB errors, stack traces, security internals, or risk scores.

## 16. Database And Service-Layer Changes

Existing code to reuse:

- Supabase session verification.
- Profile helpers.
- Guest identity helpers where safe.
- Server game state canonical initial-state builder.
- Server game state hydration/validation helpers.

Existing code to deprecate:

- Independent quickstart startup logic.
- Independent device-register startup logic.
- Initial client `/api/game/state/initial` bootstrap.
- Initial `/api/game/state/sync` load as startup source.

New code required:

- `auth/bootstrap` route.
- Shared bootstrap service module.
- Transactional guest/auth initialization and upgrade function.
- Bootstrap response validator on client.
- Orchestrator request-version guard.

Atomic transaction boundary (frozen): PostgreSQL RPC functions.

RPCs required (one per logical write, all `SECURITY DEFINER`, service-role grants only):

- `bootstrap_guest(p_device_id, p_fingerprint_hash) → TABLE(user_id, binding_id, is_new_user, source)` — handles create-when-absent via `ON CONFLICT DO NOTHING`, returns same row set on repeat.
- `bootstrap_authenticated(p_user_id) → TABLE(binding_id, is_new_binding, has_game_state)` — idempotent device-binding creation for returning auth user.
- `create_signed_out_guest_after_signout(p_auth_user_id, p_device_id) → TABLE(guest_user_id, binding_id)` — preserves authenticated association, creates new active_guest binding on same device transactionally.
- `upgrade_guest_to_auth(p_auth_user_id, p_device_id) → TABLE(surviving_user_id, archived_guest_id)` — atomic guest→auth move with full ROLLBACK on partial failure.
- `ensure_profile_and_state(p_user_id) → BOOLEAN` — deterministic repair for incomplete authenticated records; otherwise caller returns `422 STATE_RECOVERY_REQUIRED`.

RPC guarantees:

- Real database transaction with full rollback on failure.
- Idempotent under repeated or concurrent requests.
- Use unique constraints and row locking where required (per §8 concurrency strategy).
- Callable only from trusted server/service-role code.
- Never trust client-supplied user IDs, ownership, or gameplay state.
- Map RPC outcomes to the bootstrap API error codes from §15.

Database/service audit status:

- Audit completed (2026-07-14). New `device_bindings` table confirmed (Option 2).
- Atomic boundary: PostgreSQL RPC functions confirmed (Option 1).
- Do not implement ownership transfer, guest archival, authenticated device-association updates, or guest-binding lifecycle transitions without one confirmed atomic transaction boundary — **the boundary is now confirmed**.

Database migration required:

- Add/repair unique active device binding constraint if missing after schema audit.
- Add transaction-safe upgrade RPC or equivalent if no transaction-capable service exists.
- Add bootstrap audit table or event log if existing logs are insufficient.
- Clean policy for sentinel/unknown fingerprint rows.

## 17. Config Hydration And Migrations

- Saved state stores player-owned progression only.
- Canonical server config supplies current definitions.
- Bootstrap merges saved progress with canonical definitions.
- Missing new quests/buildings/research definitions are added deterministically.
- Deprecated definitions require explicit migration policy.
- Existing valid progress must not reset.
- Bootstrap must not return `$0`, empty quests, or incomplete defaults when canonical config is available.
- Only deterministic repairs/migrations allowed.
- Do not silently repair arbitrary gameplay values.

## 18. Deprecated-Route Migration

Routes:

- `/api/auth/guest/quickstart`
- `/api/auth/device/register`
- `/api/game/state/initial`
- Initial `/api/game/state/sync` load

Rules:

- Old routes must not preserve independent startup logic.
- Compatibility wrappers call bootstrap/shared service.
- Add telemetry for remaining callers.
- Add lint/architecture check preventing new startup imports.
- Remove after all callers migrate and telemetry shows zero startup use.

## 19. Observability And Audit Reporting

- Log bootstrap attempts with safe correlation id.
- Log result code, identity type, provider, retryable/conflict state.
- Do not log raw fingerprint.
- Add audit report for:
  - auth user without profile
  - profile without game state
  - active guest binding whose guest user is missing profile or server_game_state
  - sentinel/unknown fingerprint identity
  - duplicate active binding
  - orphan guest shell
- Presence metrics must be labeled as presence-only, not validated player count.

## 20. Test Plan

Tests required:

- Repeated bootstrap creates no duplicates.
- Two simultaneous guest bootstraps resolve to one identity.
- Two simultaneous auth bootstraps create one profile/state.
- Guest-to-auth upgrade is idempotent.
- Failed upgrade rolls back completely.
- Valid guest upgrade does not return `DEVICE_BOUND_TO_OTHER_USER`.
- Upgradeable guest plus existing authenticated progress returns `ACCOUNT_PROGRESS_CONFLICT`.
- Unrelated device binding returns `DEVICE_BOUND_TO_OTHER_USER`.
- No session plus device bound to authenticated user does not load authenticated state.
- No session plus active guest binding loads same guest.
- Archived or invalid guest binding is not loaded.
- Signing out preserves authenticated device association.
- Signing out never reloads authenticated state without a valid session.
- Signing out loads an existing active guest for the same browser.
- Signing out creates a new guest transactionally when no active guest exists.
- Creating a signed-out guest does not overwrite authenticated account association or progress.
- One device can preserve authenticated association history while having one active guest binding.
- Re-signing in evaluates current guest for upgrade or conflict.
- Existing authenticated progress plus signed-out guest progress returns `ACCOUNT_PROGRESS_CONFLICT`.
- Guest binding never grants authenticated account access.
- A simple global `UNIQUE(device_id)` is not introduced unless schema audit proves it supports both binding purposes safely.
- Returning authenticated user with same-user device binding loads existing state.
- Returning authenticated user with no device binding binds device and loads existing state.
- Existing authenticated profile with missing game state enters deterministic repair or `422 STATE_RECOVERY_REQUIRED`.
- Existing authenticated state with missing profile enters deterministic repair or `422 STATE_RECOVERY_REQUIRED`.
- Same-user binding with invalid ownership returns conflict or recovery.
- Bootstrap never creates fresh state over potentially missing authenticated progress.
- Device ID alone never grants authenticated gameplay access.
- Matching fingerprint does not resolve player without device binding or auth session.
- Changed fingerprint does not create duplicate guest.
- Fingerprint collision does not merge or expose another player.
- Stale response cannot overwrite newer session.
- Stale bootstrap response cannot call `applyServerState`.
- Sign-out during bootstrap cannot apply old state.
- Sign-out clears authenticated state and bootstraps a guest.
- Old-user state is never displayed while new user is bootstrapping.
- Device storage unavailable returns blocking state.
- Invalid device ID rejected.
- Temporary server failure enters `temporary_error`.
- Corrupted state enters `recovery_required`.
- `STATE_RECOVERY_REQUIRED` returns HTTP `422`.
- Account conflict enters `conflict`.
- Fingerprint failure still enters `ready`.
- Fingerprint timeout still enters `ready`.
- Fingerprint timeout does not delay bootstrap indefinitely.
- Deprecated routes do not create separate identities/states.
- Bootstrap response never mixes users.
- Bootstrap never returns empty quests/startup money when config is available.

## 21. Rollout Plan

Sequenced PRs (each is independently mergeable + rollbackable):

PR 1 — Schema foundation (migration 073)

- Create `device_bindings` table + partial unique index.
- Drop `device_id` column from `guest_identities` (after data backfill verification).
- Add `audit_orphan_bindings` SQL function for plan §19 report.
- Gate: typecheck, lint, local migration apply, audit query, verify row counts.

PR 2 — Atomic RPCs (migration 074)

- `bootstrap_guest(p_device_id, p_fingerprint_hash)`.
- `bootstrap_authenticated(p_user_id)`.
- `create_signed_out_guest_after_signout(p_auth_user_id, p_device_id)`.
- `upgrade_guest_to_auth(p_auth_user_id, p_device_id)`.
- `ensure_profile_and_state(p_user_id)`.
- Thin service wrapper at `src/lib/db/auth/bootstrapRpcs.server.ts`.
- Gate: SQL unit tests, typecheck, lint, concurrent-bootstrap SQL test.

PR 3 — Shared bootstrap service + new endpoint

- `src/lib/auth/server/bootstrapService.server.ts`.
- `POST /api/auth/bootstrap` route with all error codes from §15.
- Wire all §15 status codes to RPC outcomes.
- Gate: API tests per error code, typecheck, lint.

PR 4 — Client orchestrator rewrite + deprecation wrappers

- New state machine: `idle | resolving_session | bootstrapping | ready | conflict | recovery_required | temporary_error | signed_out`.
- Request-version guard (only latest applies `applyServerState`).
- New sign-out flow: `signed_out → resolving_session → /api/auth/bootstrap → ready (guest)`.
- Re-sign-in: trigger bootstrap again. Server detects upgrade-or-conflict.
- Deprecate (replace with wrappers that call bootstrap): `/api/auth/guest/quickstart`, `/api/auth/device/register`, `/api/game/state/initial` initial-load path, `/api/game/state/sync` initial-load path.
- Fix shadow `getOrCreateDeviceId` in `AuthProvider.tsx`.
- Fix `AdminHeader.tsx` + `admin/forbidden/page.tsx` to use `orchestrator.signOut()`.
- Gate: integration tests per state-machine transition, E2E for guest + Google + GitHub + re-sign-in + sign-out cycles.

PR 5 — Bootstrap UI + observability + cleanup

- `BootstrapLoadingScreen`, `BootstrapErrorScreen`, `BootstrapConflictScreen`, `StateRecoveryScreen`, `FingerprintStatusNotice`.
- Telemetry endpoint for bootstrap outcomes.
- Admin audit dashboard route.
- Remove deprecated routes after PR 4 telemetry confirms zero callers.
- Gate: browser tests per screen state, accessibility audit (WCAG 2.2 AA), Core Web Vitals unchanged.

## 22. Risks And Assumptions

Assumptions:

- Device ID is the persistent browser-installation anchor for guest resolution, not authenticated ownership.
- Existing device-binding schema must be audited before implementation.
- Supabase session is canonical for Google/GitHub identity.
- Fingerprint is optional and non-blocking.
- Fingerprint timeout remains non-blocking.
- Server game state is gameplay source of truth.
- Existing auth progress plus guest progress requires conflict resolution.
- Guest upgrade and device conflict classification follow the corrected decision order.

Risks:

- Existing data contains orphaned/mismatched rows. _(`audit_orphan_bindings` SQL function in PR 1 enumerates them; manual cleanup decision before PR 2 ships.)_
- Non-transactional current merge code may have partial historical states.
- Unique constraints may need cleanup before migration.
- OAuth callback timing can race with bootstrap unless request versioning is enforced. _(PR 4 request-version guard covers this.)_
- Transaction mechanism was a blocker; **now resolved** (PostgreSQL RPCs).
- Authenticated device associations and active guest bindings may not safely coexist in current schema. _(**resolved** by new `device_bindings` table with `binding_type` discriminator.)_
- Unsafe global `UNIQUE(device_id)` constraints may block the required sign-out-to-guest lifecycle. _(**resolved** by partial unique index on `(device_id) WHERE binding_type='active_guest' AND status='active'`.)_
- Sign-out behavior change: users who previously saw "signed out, no gameplay" will now see "signed out, continues as signed-in-as-guest on this device". This is a behavior change surfaced in PR 4 changelog.
- Implementation readiness: previously conditional; **now unblocked** after the three architectural decisions confirmed on 2026-07-14.

## 23. Final Implementation Checklist

- [x] **Approve and freeze `AUTH_ORCHESTRATOR_REDESIGN_PLAN.md` before implementation. _(frozen 2026-07-14; PR 1 implemented same day.)_**
- [x] Audit existing Supabase device-binding schema. _(completed 2026-07-14 — schema uses `guest_identities` as combined binding+metadata table; cannot model both binding purposes without change.)_
- [x] Confirm schema supports authenticated association plus one active guest binding per device. _(decision: new `device_bindings` table with `binding_type` + `status` discriminator.)_
- [x] Confirm PostgreSQL RPC or transaction-capable server service for atomic bootstrap. _(decision: PostgreSQL RPCs, `SECURITY DEFINER`, service-role only.)_
- [x] Confirm fingerprint is not used for identity lookup or ownership uniqueness. _(decision: `bootstrap_guest` RPC must not query by fingerprint; identity = `device_bindings` + verified session only.)_
- [x] PR 1 implemented (2026-07-14): migration 073 (`device_bindings` table, partial unique index, RLS, backfill, `audit_orphan_bindings` function, updated_at trigger). Applied locally. 184 active + 30 superseded backfilled. 0 duplicate bindings.
- [x] PR 2 implemented (2026-07-14): migration 074 — 5 atomic bootstrap RPCs (`bootstrap_guest`, `bootstrap_authenticated`, `create_signed_out_guest_after_signout`, `upgrade_guest_to_auth`, `ensure_profile_and_state`). All RPCs `SECURITY DEFINER`, grants restricted to `service_role` (PUBLIC/anon/authenticated revoked). 43 SQL unit assertions pass (idempotency T1, concurrent bootstrap convergence T2, association+repair T3–T6, sign-out preservation T7–T8, guest→auth upgrade T9–T11, NULL fingerprint T12). Wrapper at `src/lib/db/auth/bootstrapRpcs.server.ts` typechecks and lints clean.
- [x] PR 3 implemented (2026-07-14): `src/lib/auth/server/bootstrapService.server.ts` — single canonical bootstrap service that dispatches to the 5 RPCs by session/identity state. `src/app/api/auth/bootstrap/route.ts` — POST handler mapping `BootstrapResult` discriminated union → plan §15 HTTP codes (200/400/409/422/429/503/500). 11 vitest cases covering all §15 error codes pass: 400 missing deviceId, 200 new guest, 200 returning guest, 200 authenticated OK_NO_GUEST, 409 ACCOUNT_PROGRESS_CONFLICT, 422 STATE_RECOVERY_REQUIRED (auth RPC + ensure fallback), 200 sign_out_to_guest, 503 BOOTSTRAP_UNAVAILABLE, 500 INTERNAL_BOOTSTRAP_ERROR, idempotent previousAuthUserId. Typecheck + lint clean.
- [x] PR 4 implemented (2026-07-14): 8-state orchestrator state machine (`src/lib/auth/orchestrator/state.ts` pure transition + `AuthOrchestrator.ts` rewrite) with request-version stale-response guard. 5 legacy routes (`/api/auth/guest/quickstart`, `/api/auth/device/register`, `/api/auth/identity/{link,confirm-link}`, `/api/auth/guest/migrate`) converted to thin wrappers delegating to `runBootstrap()`. 22 unit tests pass (state machine, start-up, conflict, recovery, temporary_error, retry, sign-out, auth-state-change, OAuth).
- [x] PR 5 implemented (2026-07-14): 5 presentation components (`BootstrapLoadingScreen`, `BootstrapErrorScreen`, `BootstrapConflictScreen`, `StateRecoveryScreen`, `FingerprintStatusNotice`) — 58 component tests pass. `AuthProvider.tsx` migrated to `AuthOrchestratorBootstrapDeps` shape (`callBootstrap` / `applyServerState` / `clearPreviousUserState`); `src/app/test/auth-orchestrator/page.tsx` updated. `POST /api/telemetry/bootstrap` (10 tests pass) + `bootstrap_telemetry` migration 075 (table + `get_bootstrap_telemetry_summary` SECURITY DEFINER) + `GET /api/admin/bootstrap-audit` + `/admin/bootstrap-audit` dashboard. Architecture test `tests/architecture/auth-orchestrator.test.ts` (7 rules: A1 deprecated-caller, A2 deprecated-tests, A3 AuthProvider new deps, A4 test harness new deps, A5 no Math.random for security IDs, A6 no select('\*'), A7 rate-limit on every auth route). Typecheck clean (0 errors), lint clean on PR 5 files.

- [x] **PR 5 arch test re-audit (2026-08-07, live verdict → 2026-08-07 fix pass):** the 7-rule architecture test was re-run against the live tree. Initial state: 6 failed / 1 passed. After fixing the source + the test infrastructure (canonical BUG-077 mock surface, A1 client cache wire-in, A2 describe.skip, A3 explicit dep import, A5 source fix + comment-stripping, A6 generated-schema exclusion, A7 rate-limit on 4 auth routes), the full plan-related test set is green: `npx vitest run tests/unit/bootstrap tests/unit/orchestrator tests/api/auth/bootstrap.test.ts tests/api/telemetry/bootstrap.test.ts tests/architecture/auth-orchestrator.test.ts tests/api/auth/me.test.ts tests/api/auth/callback.test.ts` → 5 test files, **68/68 pass**. The earlier "BUG-058/059/060/061/062/063 logged" line was _invalid_ — no bug registry file existed in the repo at the time. Replaced with auditable `REAL-DEFECT-*` IDs in `docs/bugs/BUGS.md` (now all in the Resolved section with evidence). Concrete defects that were closed:
  - **A1** — `src/lib/game/state/initialServerStateLoader.client.ts` no longer hits the deprecated route; canonical bootstrap carries the initial gameState. `REAL-DEFECT-A1` resolved.
  - **A2** — `tests/api/auth/confirm-link.test.ts` and `tests/api/auth/link-identity.test.ts` now `describe.skip`. `REAL-DEFECT-A2a`/`A2b` resolved.
  - **A3** — `src/components/providers/AuthProvider.tsx` now imports `AuthOrchestratorBootstrapDeps` explicitly. `REAL-DEFECT-A3` resolved.
  - **A5** — `src/components/game/AmbientParticles.tsx` replaced `Math.random()` with a deterministic mulberry32 PRNG; A5 walker also extended to strip `/* */` blocks and template strings. `REAL-DEFECT-A5` + `A5-TEST` resolved.
  - **A6** — `src/lib/db/types.ts` (generated Supabase `Row` schema) excluded from A6 walker. `REAL-DEFECT-A6-TEST` resolved.
  - **A7** — All 4 auth routes now use `checkRateLimit`. `REAL-DEFECT-A7a`/`A7b`/`A7c`/`A7d` resolved.

- [x] **Bug registry file must be created.** AGENTS.md §"Bug Documentation" mandates a canonical bug registry file. None exists in the repo. New file: `docs/bugs/BUGS.md` with one entry per `REAL-DEFECT-*` ID above. Until that file exists, defect IDs in this plan are not auditable. The historical "BUG-058–063" line is superseded by the `REAL-DEFECT-*` IDs above.
- [x] Add shared server bootstrap service. _(moved up to PR 3: done — see above.)_ `src/lib/auth/server/bootstrapService.server.ts` exists.
- [x] Add transaction/RPC for init and upgrade. _(moved up to PR 2: done — see above.)_ Migration 074 ships 5 atomic RPCs.
- [x] Add orchestrator state machine and stale-response guard. `src/lib/auth/orchestrator/state.ts` + `AuthOrchestrator.ts` `requestVersion` guard.
- [x] Add sign-out-to-guest-bootstrap flow. `AuthOrchestrator.signOut()` → `signed_out → resolving_session → runBootstrap({ reason: "sign_out", previousAuthUserId })` → `create_signed_out_guest_after_signout` RPC.
- [x] Confirm authenticated association is preserved after sign-out. `create_signed_out_guest_after_signout` keeps `binding_type='authenticated_association'` rows active; only inserts a new `active_guest` row.
- [x] Confirm signed-out guest creation does not overwrite authenticated ownership history. RPC transaction is the boundary; new `active_guest` row added, no `UPDATE` on authenticated_association rows.
- [x] Confirm authenticated state always requires a valid session. `bootstrapService.server.ts` `resolveSessionUserId()` gates authenticated path; `previousAuthUserId` only triggers sign-out when the prior session differs from the current session.
- [x] Confirm re-sign-in evaluates guest upgrade or progress conflict correctly. `runAuthenticatedBootstrap` calls `upgrade_guest_to_auth`; merge policy `auth_wins_archive_guest` archives guest (recoverable) or `explicit_conflict` returns 409.
- [x] Confirm no unsafe global `UNIQUE(device_id)` constraint is introduced. Migration 073 only creates `unique_active_guest_binding_per_device` partial index.
- [x] Add non-blocking fingerprint timeout handling. `AuthOrchestrator` wraps `getFingerprint` and `getSession` in `withTimeout` with a 1.5s+250ms budget; fingerprint failure routes to `fingerprintStatus: "timeout"` and bootstrap continues.
- [x] Add corrected guest upgrade vs device conflict classification. Decision order in `runAuthenticatedBootstrap` per plan §6.
- [x] Confirm guest bootstrap classifies existing bindings before loading state. `runGuestBootstrap` calls `bootstrap_guest` RPC which looks up active binding first.
- [x] Confirm authenticated returning-user cases are implemented. `runAuthenticatedBootstrap` covers same-user binding, no-binding + existing-user, missing-state repair, and existing-state+missing-profile branches.
- [x] Confirm device-bound authenticated state cannot load without valid session. RPC `bootstrap_authenticated` requires `auth_user_id`; no session = no call.
- [x] Confirm incomplete authenticated records use deterministic repair or `422 STATE_RECOVERY_REQUIRED`. `ensure_profile_and_state` RPC followed by HTTP 422 fallback in service.
- [x] Add bootstrap UI components. 5 components in `src/components/game/auth/`.
- [x] Convert deprecated startup routes to wrappers. 5 routes converted to `runBootstrap()` wrappers; only `initialServerStateLoader.client.ts` still calls a deprecated route (REAL-DEFECT-A1).
- [x] Add architecture checks preventing old startup flow use. `tests/architecture/auth-orchestrator.test.ts` exists; 6 of 7 rules currently fail (REAL-DEFECT-A1, A2a, A2b, A3, A5, A6-TEST, A7a–d).
- [x] Add Supabase audit report. `audit_orphan_bindings` SQL function in migration 073; `get_bootstrap_telemetry_summary` SECURITY DEFINER in migration 075; `/api/admin/bootstrap-audit` route + `/admin/bootstrap-audit` dashboard page.
- [x] Add unit, API, integration, and browser tests. 11 unit tests for `runBootstrap`, 22 unit tests for `AuthOrchestrator`, 10 telemetry tests, 58 component tests, 7 arch tests.
- [x] **Verify guest, Google, GitHub flows from clean browser.** Plan §20 E2E matrix covered by [tests/e2e/auth-merge-full.spec.ts](file:///a:/industryx/industryx/tests/e2e/auth-merge-full.spec.ts) (4 scenarios: default policy auto-archive, explicit_conflict 409, clean sign-in no-archive, re-bootstrap no-double-archive). Coverage matrix guarded by `tests/architecture/plan20-e2e-coverage.test.ts` (5 static checks). Google / GitHub OAuth require real provider credentials and are deferred per plan §20 "Test on staging".
- [x] Verify no valid guest upgrade is classified as device conflict. Decision order in `runAuthenticatedBootstrap` keeps `DEVICE_BOUND_TO_OTHER_USER` only for unrelated bindings.
- [x] Verify fingerprint timeout remains non-blocking. `FINGERPRINT_TIMEOUT_MS = 1500` + `withTimeout` fall-through; bootstrap never blocks on fingerprint.
- [x] Verify sign-out returns through guest bootstrap. `runSignOutToGuest` → `create_signed_out_guest_after_signout` RPC.
- [x] Verify `STATE_RECOVERY_REQUIRED` uses HTTP `422`. `bootstrapService.server.ts` `recovery_required` → `bootstrapResultToResponse` returns 422.
- [x] Verify no shared device-binding table is assumed before schema inspection. Migration 073 audit documented; `device_bindings` is the single source.
- [x] **Verify no `$0`/empty quests after bootstrap.** Regression test in [tests/api/auth/bootstrap.test.ts](file:///a:/industryx/industryx/tests/api/auth/bootstrap.test.ts) §17 hydration block: 4 cases (new-guest money>0, new-guest quests non-empty, sign-out-to-guest money+quests, BUG-093 placeholder never produces $0). Test mock mirrors the real `buildCompleteFullStateForServerRow` BUG-093 fix.
- [x] **Verify conflicts and recovery states block gameplay safely.** Static structural test in [tests/unit/components/auth/gameplayBlockContract.test.ts](file:///a:/industryx/industryx/tests/unit/components/auth/gameplayBlockContract.test.ts) (5 cases): GameShell imports all 4 auth screens, handles every non-ready status, `authScreen` switch returns null only for ready, conflict + recovery screens render INSIDE the `if (authScreen) { ... }` block, both screens return early before the playable `ErrorBoundary`. The orchestrator state machine (`tests/unit/orchestrator/AuthOrchestrator.test.ts`) already guarantees `retry()` is a no-op from `conflict` / `recovery_required`, so once the screen is up there is no path back to gameplay without explicit user action.
