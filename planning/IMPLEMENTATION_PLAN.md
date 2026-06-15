# IMPLEMENTATION PLAN — Security & Architecture Hardening

**Source audit:** `planning/PRODUCTION_SECURITY_AUDIT.md`
**Date:** June 2026
**Estimated effort:** 3–5 weeks of focused engineering
**Target:** Production-ready for 1,000+ active players

---

## Overview

This plan turns the security audit into a sequence of shippable phases. Each phase is independently verifiable and produces a deployable artifact. Phases 0 and 1 are DB-only and ship first; Phases 2 and 3 are the bulk of the work; Phases 4–6 are hardening and hygiene.

**Critical sequencing rule:** Do not start Phase 2 (server-authoritative actions) before Phase 1 (account linking) is at least stubbed — because removing the `window.__gameStore` exposure will break the offline progress flow if the server-side replacement isn't ready.

---

## Phase 0 — Database Hardening (Day 1, 4–6 hours)

**Why first:** All other phases touch code that calls the DB. Locking down RLS and functions now means every later commit is exercising the post-hardening surface.

### 0.1 Fix `is_game_admin()` to actually consult `admin_users`
**Action:** Replace function body via a new migration.

**New file:** `supabase/migrations/018_admin_function_fix.sql`

```sql
CREATE OR REPLACE FUNCTION public.is_game_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid()
      AND role IN ('admin', 'super_admin')
  )
  OR auth.uid()::text = '1b4d0dc3-e4d2-4fc0-b731-9782243ad061';  -- bootstrap env-var UID
END;
$$;

REVOKE EXECUTE ON FUNCTION public.is_game_admin() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_game_admin() TO service_role;
```

**Why:** Today the function compares the caller UUID to a hardcoded literal and never touches `admin_users`. Every RLS policy that gates `game_config_*` writes only succeeds for the developer UID. The `admin_users` table is decorative. After this change, adding an admin row actually grants admin powers.

### 0.2 Lock down `guest_identities` RLS
**Action:** Replace the insecure `USING (true)` policy.

**Same file:** append to `supabase/migrations/018_admin_function_fix.sql` (or split into `019_guest_identities_rls.sql`)

```sql
DROP POLICY IF EXISTS "Service role full access on guest_identities" ON guest_identities;
CREATE POLICY "Service role full access on guest_identities" ON guest_identities
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
```

**Why:** This table stores device fingerprints, account links, and `superseded_by` metadata. The current `USING (true)` lets any anon or authenticated user read or write every row — they could read every player's device fingerprint, or break account links by overwriting `superseded_by`. The fix mirrors the migration 007 pattern that the rest of the schema already follows.

### 0.3 Lock down `increment_cheat_flag` grants
**Action:** Revoke public execute.

**Same file:** append

```sql
REVOKE EXECUTE ON FUNCTION public.increment_cheat_flag(uuid, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_cheat_flag(uuid, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_cheat_flag(uuid, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.increment_cheat_flag(uuid, text, text, text) TO service_role;
```

**Why:** Defense in depth. The function is not currently exploitable thanks to RLS, but it's callable by anyone, and the only thing protecting us is the downstream RLS. If a future migration accidentally grants a write policy, the lockout attack becomes real. Lock it down now so we don't depend on RLS for this specific attack surface.

### 0.4 Drop duplicate `updated_at` triggers
**Action:** Keep one trigger function and one trigger per table.

**New file:** `supabase/migrations/020_dedup_triggers.sql`

For each `game_config_*` table and `player_progress`:
- Keep one of `set_updated_at` (uses `auto_update_timestamp()`) OR `trg_gcX_updated_at` (uses `update_updated_at_column()`)
- Drop the other trigger
- Keep BOTH functions installed (harmless), but only one trigger per table

**Why:** Two triggers firing on every UPDATE does redundant work, and they can drift. Each table should have exactly one.

### 0.5 Generate migrations for uncommitted live schema
**Action:** Dump the live schema and create migration files.

**New files to generate:**
- `supabase/migrations/021_profiles_and_guest_identities.sql` — `profiles`, `guest_identities`
- `supabase/migrations/022_merge_and_link_tables.sql` — `merge_audit_log`, `merge_receipts`, `pending_link_operations`
- `supabase/migrations/023_uncommitted_functions.sql` — `is_game_admin` (current), `handle_new_user` (current), `expire_stale_pending_operations`, `auto_update_timestamp`
- `supabase/migrations/024_admin_users_policies.sql` — the corrected policies from C3

**Why:** Five migrations were applied to the live DB that aren't in the repo. A fresh project, or a disaster recovery restore, would not get these tables. The `guest_identities` table from migration 021 already contains the buggy `USING (true)` policy — so the migration must include the fix from 0.2.

**How:** Use `pg_dump --schema-only --no-owner --no-acl` against the live DB, then split the output into the logical migrations above.

### 0.6 Seed `admin_users` table
**Action:** Insert the bootstrap admin so the new `is_game_admin()` actually returns true for non-bootstrap admins going forward.

**Same file:** append to 0.1

```sql
INSERT INTO public.admin_users (user_id, email, role)
VALUES ('1b4d0dc3-e4d2-4fc0-b731-9782243ad061', 'malcolmkhong@gmail.com', 'super_admin')
ON CONFLICT (user_id) DO NOTHING;
```

**Why:** Migration 004 claimed to seed this row but the live DB has zero rows. Without it, the only admin is the env-var UID.

### Phase 0 Verification

- Run: `SELECT has_function_privilege('authenticated', 'public.increment_cheat_flag(uuid,text,text,text)', 'EXECUTE');` — should be `false`
- Run: `SELECT * FROM pg_policies WHERE tablename = 'guest_identities';` — only service-role policy should remain
- Run: `SELECT proname, prosecdef FROM pg_proc WHERE proname = 'is_game_admin';` — should be `true`
- Test: as anon user, attempt `SELECT * FROM guest_identities` — should return 0 rows

---

## Phase 1 — Account Linking Infrastructure (Days 2–5, 1.5 weeks)

**Why second:** The linking tables already exist in the DB. Wiring them up gives guests a real Supabase identity (which is what makes everything else more secure — rate limits, audits, and cheat detection all need a stable user_id).

### 1.1 Add `signInAnonymously` to AuthProvider
**File to update:** `src/components/providers/AuthProvider.tsx`

Add to the `AuthState` interface (lines 13-19):
- `signInAnonymously: () => Promise<void>;`

Add a new `useCallback` (sibling of `signInWithGoogle`, around line 96):
- Calls `supabase.auth.signInAnonymously()`
- On success, persists the returned user.id to localStorage under a new key (e.g., `factory-dominion-guest-uid`)
- On success, calls `initServerValidation(user.id)`
- On error, logs and surfaces to caller (does NOT silently swallow — see H10)

Add to the context provider value (around line 135):
- `signInAnonymously`

**Why:** The audit confirmed the user wants anonymous accounts, the DB supports them (`auth.users.is_anonymous` exists, `profiles.is_guest` exists, `handle_new_user` reads `is_anonymous`), and the merge infrastructure is built around them. Without this, there is no Supabase identity to link.

### 1.2 Auto-create anonymous identity on first pageload
**File to update:** `src/components/providers/AuthProvider.tsx` (in the existing `useEffect` around line 38)

In the init effect, after `getSession()` returns no session, if no `factory-dominion-guest-uid` exists in localStorage, call `signInAnonymously()`.

**Why:** Guests need an identity before they can accumulate progress that survives sign-in. Currently they play with zero server identity, so the cloud save flow always treats them as new.

### 1.3 Create `/api/auth/anonymous-signin` route
**New file:** `src/app/api/auth/anonymous-signin/route.ts`

POST handler:
- Validates request body (just an empty POST is fine)
- Calls `supabase.auth.admin.createUser({ email: undefined, email_confirm: true })` (server-side admin API)
- Returns the new user.id
- Rate-limited at 5/min per IP

**Why:** Allows the client to request a fresh anonymous identity for testing or recovery flows. Optional but matches the spec's "anonymous login" expectation.

### 1.4 Create `/api/auth/link-identity` route (the guest → Google merge)
**New file:** `src/app/api/auth/link-identity/route.ts`

POST handler:
- Body: `{ guestUserId, idempotencyKey, preference: 'keep_guest' | 'keep_google' }`
- Verify session matches an authenticated Google user
- Verify `guestUserId` is in `auth.users.is_anonymous = true`
- Rate limit 5/min per Google user
- Insert into `pending_link_operations` (idempotent on `idempotency_key`)
- Compute `risk_score` from server-side analysis of both users' `server_game_state` (sum of money + total_money_earned, count of buildings, total research)
- Compute `preview_version` (a 3-tick simulated state from each side)
- Return the operation ID + preview
- Caller is then expected to either confirm or cancel

### 1.5 Create `/api/auth/confirm-link` route
**New file:** `src/app/api/auth/confirm-link/route.ts`

POST handler:
- Body: `{ operationId, idempotencyKey }`
- Verify session matches the Google user in the operation
- Load the pending operation
- Check `status === 'pending'` and `expires_at > now()`
- If `preference === 'keep_guest'`: copy the guest's `server_game_state` to the Google user; insert into `merge_receipts` with `kept_user_id = guestUserId, archived_user_id = googleUserId`; set `profiles.linked_account_id`; sign the guest out
- If `preference === 'keep_google'`: discard guest state; mark operation `completed`; archive the guest
- In both cases, write to `merge_audit_log` with full before/after state snapshots
- Use a single transaction

**Why:** This is the actual merge operation. The schema is already built for it (idempotency key, risk score, expires_at, audit log, receipts).

### 1.6 Create `/api/auth/recover-guest` route
**New file:** `src/app/api/auth/recover-guest/route.ts`

POST handler:
- Body: `{ fingerprint }`
- Rate limit 3/min per IP
- Look up `guest_identities` by `fingerprint_hash` (SHA-256 of the device fingerprint)
- If found and `is_primary = true` and `superseded_at IS NULL` and the linked auth.users still exists: return a magic-link-style recovery flow (call `supabase.auth.admin.generateLink({ type: 'magiclink', email: ... })` — but anonymous users have no email, so use a custom token)
- **Open question:** the recovery flow for anonymous users is not natively supported by Supabase. Likely needs a custom token system. For now, return a "use your last device to recover" message.

**Why:** Spec requires "recover-guest" but the underlying flow is non-trivial for anonymous users (they have no email to magic-link to). The first iteration can be a "re-link on same device via fingerprint" flow.

### 1.7 Update AuthProvider `linkIdentity` helper
**File to update:** `src/components/providers/AuthProvider.tsx`

Add a `linkIdentity` method to the context that:
- Reads the persisted guest UID from localStorage
- After Google sign-in completes, calls `/api/auth/link-identity` with the guest UID
- Routes to the confirmation flow

**Why:** Today the spec says "use `supabase.auth.linkIdentity()`" but since we have no anonymous user, there's nothing to link. After 1.1, we have a real anon identity, and we can either use `linkIdentity()` (which links the anon user's identities) or do the full custom merge via 1.4/1.5. **The custom merge is better** because it preserves both sides' state and gives the user a choice.

### 1.8 Wire signInWithGoogle to trigger the link flow
**File to update:** `src/components/providers/AuthProvider.tsx` (`signInWithGoogle` callback)

After the Google OAuth callback sets the user, if there's a stored `factory-dominion-guest-uid` AND the new Google user's id != the guest UID, call `/api/auth/link-identity`.

**Why:** This is the moment when the user explicitly said "I want to keep my guest progress." Triggering the flow automatically makes it a one-click experience.

### Phase 1 Verification

- `SELECT count(*) FROM pending_link_operations;` — should be > 0 after one test flow
- `SELECT count(*) FROM merge_receipts;` — should be > 0 after a confirmed merge
- `SELECT count(*) FROM merge_audit_log;` — should be > 0 (one per attempt)
- Manual test: open incognito → play 100 ticks → sign in with Google → confirm "keep guest" → verify cloud state matches what was on the device

---

## Phase 2 — Server-Authoritative Game Actions (Days 6–10, 1.5 weeks)

**Why third:** With Phase 1 complete, every player has a stable user_id, which means rate limiting, cheat detection, and audit logs are now meaningful. This phase converts the dead server validation API into a real safety net.

### 2.1 Remove `window.__gameStore` exposure in production
**File to update:** `src/lib/game/store.ts:3561-3563`

Current code:
```ts
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__gameStore = useGameStore;
}
```

Replace with:
```ts
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  (window as unknown as Record<string, unknown>).__gameStore = useGameStore;
}
```

**Why:** Direct `__gameStore.setState({ money: 1e15 })` from DevTools is the single biggest cheat vector. The exposure was probably added for debugging; the fix is to keep it dev-only.

### 2.2 Wire `submitActionToServer` into `buildBuilding`
**File to update:** `src/lib/game/store.ts:1858-1901` (`buildBuilding`)

Currently does client-side money/unlock checks. Wrap with:
```ts
const validation = await validateBuildAction({ buildingType: type, gameState: get() });
if (!validation.valid) return;
set((s) => ({ ...applyBuild(s, type) }));
```

Where `validateBuildAction` is imported from `@/lib/game/serverActions` (already exists).

**Same pattern for:** `sellResource` (line 2118), `buyResource` (line 2146), `startResearch` (line 2038), `setGameSpeed` (line 1846), `toggleBuilding` (line 1928), `hireWorker` (line 2075), `assignWorker` (line 2104), `doPrestige` (line 2269), `bulkBuild`, `bulkSell` (if they exist), `buyMarket`, `sellMarket`, `startDroneMission`, `collectDrone`, `claimQuest`.

**Why:** These are the actions that should require server approval. Today the server has a validator but nothing calls it. After this change, every action goes through `/api/game/action` first.

### 2.3 Make `/api/game/action` load `server_game_state` for validation
**File to update:** `src/app/api/game/action/route.ts:331-488`

Currently the handler receives `gameState` from the client and validates the action against it. Add a step:
1. Auth → rate limit → ownership check (as today)
2. **NEW:** Load authoritative `server_game_state` for the authenticated user
3. If client-sent `gameState.gameTick` is more than X ticks behind server tick, reject (delta check)
4. Validate the action against the **server's** state, not the client's
5. If valid, apply the action to the server state and return the new state

**Why:** Today the validator answers "can the client afford this?" against the client's claimed money. After this, it answers "can the user actually afford this?" against the actual saved money.

### 2.4 Make `/api/game/compute` load `server_game_state` as the base
**File to update:** `src/app/api/game/compute/route.ts:225-304`

Current behavior: runs `runServerTicks(gameState, ticks)` on client-sent state.
New behavior:
1. Auth + rate limit + ownership check (as today)
2. Load `server_game_state.full_state` for the user
3. If client-sent `gameState.gameTick` differs from `server_game_state.game_tick` by more than ~10 ticks, reject (the client is using stale or tampered state)
4. Run `runServerTicks(serverGameState, ticks, config)`
5. Return the new state

**Why:** This is the "bless my fake state" vector the audit identified. With the base loaded from the server, the client cannot inject starting money.

### 2.5 Verify offline progress via server
**File to update:** `src/lib/hooks/page/useOfflineProgressCheck.ts`

Currently calls `calculateOfflineProgress()` from the store (client-only).
New behavior:
1. Compute offline ticks locally (as today)
2. Send `{claimedOfflineTicks, gameState}` to a new `/api/game/claim-offline` route
3. The route runs `runServerTicks` from the server's authoritative state and returns the result
4. Apply the server-computed result to the local store
5. Show the user the result

**New file:** `src/app/api/game/claim-offline/route.ts`
- POST handler
- Body: `{userId, claimedTicks, claimedState}`
- Loads `server_game_state`, validates `claimedTicks` against elapsed time, runs `runServerTicks` from server state, returns result

**Why:** Audit H4. Today a player can set `lastOnlineTimestamp: 0` and get 10 hours of free offline progress.

### 2.6 Use `server_game_state` for leaderboard scoring
**File to update:** `src/app/api/leaderboard/submit/route.ts:94-100`

Currently:
```ts
const calculatedScore = Math.floor(
  Number(gameState.totalMoneyEarned || 0) + ...
);
```

New behavior:
1. Load `server_game_state` for the authenticated user
2. Use `total_money_earned`, `buildings_count`, etc. from the server, NOT from `gameState`
3. Recalculate the score from server values
4. Reject if client's `gameState` numbers differ by more than a tolerance (delta check)

**Why:** Audit H5. A client can submit any `totalMoneyEarned` and get a corresponding score. Cross-reference with the server.

### 2.7 Tighten `GAME_LIMITS` in `gameStateValidator.ts`
**File to update:** `src/lib/auth/gameStateValidator.ts:33-52`

- Reduce `MAX_MONEY` from `1e15` to a value informed by the actual max legitimate earnings (probe live data, set to e.g., `1e10`)
- Reduce `MAX_RESOURCE_AMOUNT` from `1e12` to a more sensible cap
- Reduce `MAX_TICK_RATE_PER_SECOND` from 50 to 10 (matches max game speed)
- Add resource-type-specific caps in `game_config_resources` if needed

**Why:** The static bounds are loose enough that a slow cheater can reach them legitimately and then no one notices the cheat.

### Phase 2 Verification

- Try `__gameStore.setState({ money: 1e15 })` in production build — should be a no-op
- Try the same in dev build — verify the value gets rejected by the server on next save
- Build a building you can't afford via the UI — verify the action is rejected by the server even if the client somehow allowed it
- Submit a leaderboard entry with inflated `totalMoneyEarned` — verify server-side recalculation produces a different (lower) score

---

## Phase 3 — Auth & API Route Hardening (Days 11–14, 1 week)

### 3.1 Add `verifyAuthAndOwnership` to `/api/auth/migrate-guest`
**File to update:** `src/app/api/auth/migrate-guest/route.ts:23-55`

Replace the existing `supabase.auth.admin.getUserById(userId)` check with the proper ownership check. Add a call to `verifyAuthAndOwnership(userId)` from `@/lib/auth/verifyAuth` — same pattern used by `/api/game/state` and `/api/player`.

**Why:** Audit C2 (now renumbered). Today any authenticated user can submit `{userId: victim_id, gameState: {money: 1e15}}` and the route accepts it.

### 3.2 Add rate limiting to `/api/auth/migrate-guest`
**File to update:** `src/app/api/auth/migrate-guest/route.ts`

Add at the top of POST:
```ts
const rateLimitResponse = await checkRateLimit(userId, RATE_LIMITS.action, '/api/auth/migrate-guest');
if (rateLimitResponse) return rateLimitResponse;
```

**Why:** Audit H9. Today the route has no rate limit. An attacker can spam it trying to find users without cloud state.

### 3.3 Sanitize `displayName`
**File to update:** `src/app/api/auth/migrate-guest/route.ts:160`

Wrap the `displayName` value with a sanitizer before storing:
```ts
const safeDisplayName = String(displayName || 'Commander')
  .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')  // strip control chars
  .replace(/[<>]/g, '')                            // strip angle brackets
  .slice(0, 32);                                    // cap length
```

**Why:** Audit M9. User-controlled display name is stored as-is and later shown in the UI. Could be used for XSS, impersonation, or control character injection.

### 3.4 Add mutex + error throwing to `signInWithGoogle`
**File to update:** `src/components/providers/AuthProvider.tsx:96-112`

```ts
const signingInRef = useRef(false);
const signInWithGoogle = useCallback(async () => {
  if (!isSupabaseConfigured || signingInRef.current) return;
  signingInRef.current = true;
  try {
    const supabase = createBrowserClient(...);
    const { error } = await supabase.auth.signInWithOAuth({...});
    if (error) throw new Error(error.message);
  } finally {
    setTimeout(() => { signingInRef.current = false; }, 1000);
  }
}, []);
```

**Why:** Audit H10. Rapid clicks open multiple OAuth popups. Errors are silent. The setTimeout ensures the mutex releases after the OAuth redirect begins.

### 3.5 Reset `initialLoadDone` ref on sign-out
**File to update:** `src/lib/hooks/cloudSync/index.ts:70-91`

Add a separate `useEffect`:
```ts
useEffect(() => {
  if (!user) initialLoadDone.current = false;
}, [user]);
```

**Why:** Audit H11. A second sign-in within the same session doesn't trigger cloud load.

### 3.6 Read `?auth=error` param on page load
**File to update:** `src/app/page.tsx`

In a `useEffect` on mount, check `window.location.search` for `?auth=error` and surface a toast/notification that the user can dismiss.

**Why:** Audit H10. The OAuth callback writes `?auth=error` on failure, but no code reads it. Users never know their sign-in failed.

### 3.7 Add ownership check to `/api/game/action`
**File to update:** `src/app/api/game/action/route.ts:358-370`

Change the conditional:
```ts
if (userId && userId !== auth.userId) { ... }
```

To:
```ts
if (!userId) {
  return NextResponse.json({ valid: false, error: "userId required" }, { status: 400 });
}
if (userId !== auth.userId) { ... }
```

**Why:** Audit M8. Today if `userId` is missing from the body, the route proceeds without ownership check.

### 3.8 Add `state_version` conflict check to `/api/player` POST
**File to update:** `src/app/api/player/route.ts:121-291`

Mirror the logic from `/api/game/state` route: accept `clientStateVersion` in body, compare with `currentServerState.state_version`, return 409 if server is newer.

**Why:** Audit M3. Two concurrent saves to `/api/player` can silently overwrite each other.

### 3.9 Admin OAuth callback should query `admin_users`
**File to update:** `src/app/admin/auth/callback/route.ts:26-30`

After code exchange, in addition to the env-var check, query `admin_users` via service role. The `is_game_admin()` function should be used if available, but since middleware runs before this, the direct query is acceptable here.

**Why:** Audit M4. The env-var check in middleware is fast but stale. The callback is the second-line check.

### Phase 3 Verification

- As User A, attempt to migrate state to User B's UID — should return 403
- Hit `/api/auth/migrate-guest` 10 times in 30s — should be rate-limited
- Submit `displayName: "<script>alert(1)</script>"` — should be sanitized in DB
- Click sign-in 5 times rapidly — should open only 1 OAuth popup
- Sign out, then sign in again — should trigger cloud load

---

## Phase 4 — Anti-Cheat Modernization (Days 15–17, 3 days)

### 4.1 Replace `flagCheatAttempt` with atomic RPC
**File to update:** `src/lib/auth/gameStateValidator.ts:353-425`

Replace the read-then-write pattern with:
```ts
await supabase.rpc('increment_cheat_flag', {
  p_user_id: userId,
  p_flag_type: detectionType,
  p_description: description,
  p_severity: severity,
});
```

**Why:** Audit H1 (revised). The app's read-then-write has a TOCTOU race. The SQL function is atomic. Note: the live function is the migration 005 version, not 012 — but it's still atomic for the single increment.

### 4.2 Tighten `GAME_LIMITS` static bounds
Done in 2.7. Verify here.

### 4.3 Add nonce protection to action validation
**File to update:** `src/app/api/game/action/route.ts`

Add `requestId` (UUID v4 from client) to the body. Store recent request IDs in `server_game_state.full_state._action_history` (capped at 100). Reject duplicates.

**Why:** Audit found that action endpoints have no nonce. Replay of the same action within seconds should be rejected.

### 4.4 Add server-side timestamp to all save events
**File to update:** `src/app/api/game/state/route.ts:282-301`

Use `new Date(serverTimestamp).toISOString()` instead of `new Date().toISOString()` from the local clock. Source the server timestamp from `select now()` at the start of the request.

**Why:** Audit C6. The time used for delta checks should not be client-influenced.

### Phase 4 Verification

- Trigger two cheat flags simultaneously — should result in count = 2, not 1 (atomic increment)
- Replay a save request — second should be rejected as duplicate
- Tamper with a timestamp — should be ignored

---

## Phase 5 — Production Hygiene (Days 18–20, 2 days)

### 5.1 Add security headers in next.config.ts
**File to update:** `next.config.ts`

```ts
async headers() {
  return [{
    source: '/(.*)',
    headers: [
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://*.supabase.co; frame-ancestors 'none'" },
    ],
  }];
}
```

**Why:** Audit M5. No CSP, HSTS, or other security headers.

### 5.2 Remove `typescript.ignoreBuildErrors`
**File to update:** `next.config.ts:7`

Set `typescript.ignoreBuildErrors: false` (the default). Run `tsc --noEmit` in CI.

**Why:** Audit M6. Type errors are hidden, including potentially security-relevant ones.

### 5.3 Add `CHECKSUM_SECRET` startup guard
**File to update:** `src/lib/auth/gameStateValidator.ts:58-63`

At module load time, if `HMAC_SECRET` is not set, call `process.exit(1)` (or throw, depending on context).

**Why:** Audit M1. Today the system runs with a soft error.

### 5.4 Fix `admin.ts` to not query non-existent `is_active` column
**File to update:** `src/lib/auth/admin.ts:57`

Remove the `.eq("is_active", true)` filter, since the column doesn't exist.

**Why:** Audit M2. The query always fails. This is redundant with C3 (after C3, the function is the source of truth anyway).

### 5.5 Reduce `GENEROSITY_MULTIPLIER` in guest migration validator
**File to update:** `src/lib/auth/guestMigrationValidator.ts:107`

Change from `3` to `1.5`.

**Why:** Audit M10. A 3x multiplier is too forgiving.

### Phase 5 Verification

- `npm run build` — should fail on any TS error
- `curl -I https://your-app.com` — should include all security headers
- Start the server without `CHECKSUM_SECRET` — should fail to boot

---

## Phase 6 — Documentation & Process (Day 21, 1 day)

### 6.1 Update `CLAIM_VERIFICATION_MATRIX.md`
Add rows for each phase of this plan with the verification commands.

### 6.2 Update `MIGRATION_SAFETY_CHECKLIST.md`
Add a section on the new `is_game_admin()` function and the requirement to add it to migrations.

### 6.3 Update `MONITORING_PLAYBOOK.md`
Add alerts for:
- `cheat_flag_count >= 2` (admin should review before lockout)
- `pending_link_operations.status = 'pending'` for > 1 hour (link abandoned)
- `rate_limits` table growing without periodic cleanup (run `cleanup_rate_limits`)

### 6.4 Add `RELEASE_CHECKLIST.md` entries
- Verify `is_game_admin()` is correct in production
- Verify all migrations from `supabase/migrations/` are applied
- Verify `window.__gameStore` is not in production bundle
- Verify `CHECKSUM_SECRET` is set in production env

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Phase 2 breaks existing gameplay (server validation rejects legit actions) | High | High | Run integration tests; soft-launch to 10% of users first |
| Phase 1 link flow loses user data | Medium | Critical | Test with snapshots; allow rollback via `merge_receipts` |
| Phase 0 migration 0.5 (dump live schema) generates bad migrations | Medium | High | Apply to a fresh project, verify it boots before applying to live |
| Removing `window.__gameStore` breaks dev tooling | Low | Low | Only remove in production; keep for dev (already planned in 2.1) |
| AuthProvider mutex blocks legitimate sign-ins | Low | Medium | Use `setTimeout(..., 1000)` to release; add Escape key to cancel |
| Phase 4 nonce storage grows unbounded | Low | Low | Cap `_action_history` at 100 in `full_state` |

---

## File Index (what to touch, by phase)

### Files to UPDATE
- `supabase/migrations/018_admin_function_fix.sql` (NEW)
- `supabase/migrations/019_guest_identities_rls.sql` (NEW)
- `supabase/migrations/020_dedup_triggers.sql` (NEW)
- `supabase/migrations/021_profiles_and_guest_identities.sql` (NEW)
- `supabase/migrations/022_merge_and_link_tables.sql` (NEW)
- `supabase/migrations/023_uncommitted_functions.sql` (NEW)
- `supabase/migrations/024_admin_users_policies.sql` (NEW)
- `src/components/providers/AuthProvider.tsx` (Phases 1, 3)
- `src/app/api/auth/anonymous-signin/route.ts` (NEW — Phase 1)
- `src/app/api/auth/link-identity/route.ts` (NEW — Phase 1)
- `src/app/api/auth/confirm-link/route.ts` (NEW — Phase 1)
- `src/app/api/auth/recover-guest/route.ts` (NEW — Phase 1)
- `src/app/api/game/claim-offline/route.ts` (NEW — Phase 2)
- `src/app/api/auth/migrate-guest/route.ts` (Phases 3)
- `src/app/api/game/action/route.ts` (Phases 2, 3, 4)
- `src/app/api/game/compute/route.ts` (Phase 2)
- `src/app/api/game/state/route.ts` (Phases 3, 4)
- `src/app/api/player/route.ts` (Phase 3)
- `src/app/api/leaderboard/submit/route.ts` (Phase 2)
- `src/app/admin/auth/callback/route.ts` (Phase 3)
- `src/app/page.tsx` (Phase 3)
- `src/lib/game/store.ts` (Phases 2, 4)
- `src/lib/auth/gameStateValidator.ts` (Phases 4, 5)
- `src/lib/auth/admin.ts` (Phase 5)
- `src/lib/auth/guestMigrationValidator.ts` (Phase 5)
- `src/lib/hooks/cloudSync/index.ts` (Phase 3)
- `src/lib/hooks/page/useOfflineProgressCheck.ts` (Phase 2)
- `next.config.ts` (Phase 5)
- `planning/CLAIM_VERIFICATION_MATRIX.md` (Phase 6)
- `planning/MIGRATION_SAFETY_CHECKLIST.md` (Phase 6)
- `planning/MONITORING_PLAYBOOK.md` (Phase 6)
- `planning/RELEASE_CHECKLIST.md` (Phase 6)

### Files to DELETE
None. The existing files are correct in shape; we add to or replace within them.

### Files to KEEP but not modify
- `src/lib/auth/rateLimiter.ts` — already good
- `src/lib/auth/verifyAuth.ts` — already good
- `supabase/migrations/001-017_*.sql` — historical, leave as-is

---

## Effort Estimate

| Phase | Calendar Time | Engineer-Days |
|-------|--------------|----------------|
| Phase 0: DB hardening | 1 day | 0.5 |
| Phase 1: Account linking | 4 days | 3.5 |
| Phase 2: Server-authoritative | 5 days | 4 |
| Phase 3: Auth & API hardening | 4 days | 3 |
| Phase 4: Anti-cheat | 3 days | 2 |
| Phase 5: Hygiene | 2 days | 1.5 |
| Phase 6: Docs | 1 day | 0.5 |
| **Total** | **~3.5 weeks calendar** | **15 engineer-days** |

Assuming 1 senior engineer + 1 junior for review/testing, the calendar time is 3-4 weeks. The Phase 1 → Phase 2 dependency means the project should be staffed for at least 4 continuous weeks.

---

## Success Criteria

The plan is "done" when:

1. A player in production cannot set `__gameStore.setState({...})` and have the result persist on the server
2. A guest user can sign in with Google, see their progress, and explicitly choose to keep or discard it
3. The `is_game_admin()` function correctly grants admin to anyone in `admin_users` with role admin/super_admin
4. The migrations in `supabase/migrations/` are sufficient to recreate the live database from scratch
5. The `guest_identities` RLS does not allow cross-user reads
6. Production headers include CSP, HSTS, X-Frame-Options
7. A leaderboard entry cannot be inflated by client-side modifications
8. Offline progress is computed server-side and capped by elapsed time

After all phases ship, re-run the audit checklist. The new grade should be B or better.
