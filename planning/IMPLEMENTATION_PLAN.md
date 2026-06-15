# IMPLEMENTATION PLAN — Security & Architecture Hardening

**Source audit:** `planning/PRODUCTION_SECURITY_AUDIT.md`
**Source spec:** Enterprise Authentication Flow (this document, § Authority)
**Date:** June 2026
**Estimated effort:** 3–5 weeks of focused engineering
**Target:** Production-ready for 1,000+ active players

---

## Authority & Trust Chain

```
Supabase Auth
  ↓
auth.users                    ← no synthetic creds, no shadow auth
  ↓
profiles                     ← one row per auth.user; is_guest flag
  ↓
server_game_state            ← authoritative game state
  ↓
guest_identities             ← device_id ↔ auth.user_id mapping
  ↓
pending_link_operations      ← in-flight merges (idempotent)
  ↓
merge_receipts               ← post-merge audit
  ↓
merge_audit_log              ← full before/after state snapshots
```

**No synthetic emails. No synthetic password hashes. No shadow auth system. No localStorage-only accounts. No client-authoritative progress. No direct `auth.identities` mutation. No merge-progress logic in the client.**

---

## Forbidden Patterns

The following are explicitly banned in this codebase:

- **`synthetic_email`** — never generate a fake email to satisfy Supabase's required field
- **`synthetic_pwd_hash`** — never store a hashed "password" in our tables to simulate auth
- **Hidden password accounts** — Supabase Auth is the only path to create an account
- **localStorage-only accounts** — every player must have a row in `auth.users`
- **Client-authoritative progress** — every tick, every building, every dollar flows through the server
- **Direct `auth.identities` mutation** — use `supabase.auth.linkIdentity()` or the merge transaction; never raw `UPDATE`
- **Merge-progress logic in the client** — the merge outcome is decided by a single transaction in the service-role layer
- **Fingerprint-based ownership recovery** — `device_id` is the primary recovery signal; fingerprint is for risk-scoring only

Any new code or PR that introduces one of these patterns is automatically rejected in review.

---

## Overview

This plan turns the security audit into a sequence of shippable phases. Each phase is independently verifiable and produces a deployable artifact. Phases 0 and 1 are DB/backend and ship first; Phase 1.5 adds the visible UI surface that consumes the Phase 1 APIs; Phases 2 and 3 are the bulk of the work; Phases 4–6 are hardening and hygiene.

**Critical sequencing rule:** Do not start Phase 2 (server-authoritative actions) before Phase 1 (account linking) is at least stubbed — because removing the `window.__gameStore` exposure will break the offline progress flow if the server-side replacement isn't ready. Likewise, Phase 1.5 (UI) ships immediately after Phase 1 (API) so the merge dialog has a server to call.

**Authority rule:** Every user has a `auth.users` UUID by the time they finish the loading screen. There is no "guest-only" mode. Guests are simply anonymous `auth.users` whose profile has `is_guest = true`.

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

## Phase 1 — Anonymous Identity + Linking Infrastructure (Days 2–5, 1.5 weeks)

**Why second:** The linking tables already exist in the DB. Wiring them up gives every visitor a real Supabase identity by the time they finish the loading screen. This is what makes rate limits, audits, and cheat detection meaningful — they all need a stable `auth.users.id`.

**Spec invariant:** Every new visitor gets a Supabase Auth UUID automatically. There is no button to click. The "Sign In" / "Bind Account" button is the only path to upgrade to a Google identity.

### 1.1 Add `signInAnonymously` to AuthProvider
**File to update:** `src/components/providers/AuthProvider.tsx`

Add to the `AuthState` interface (lines 13-19):
- `signInAnonymously: () => Promise<void>;`
- `isGuest: boolean` (derived from `user?.is_anonymous`)
- `deviceId: string | null` (from localStorage)

Add a new `useCallback` (sibling of `signInWithGoogle`):
- Reads `factory-dominion-device-id` from localStorage; if missing, generates a UUID v4 and stores it
- Calls `supabase.auth.signInAnonymously()` with `options.data = { device_id }`
- The `handle_new_user` trigger already creates a `profiles` row with `is_guest = true`
- The client then POSTs to `/api/auth/initialize-guest` (Phase 1.3) to create the `guest_identities` mapping and the `server_game_state` row
- On error: surface to caller (do NOT silently swallow)

Add to the context provider value:
- `signInAnonymously`
- `isGuest` (memo: `user?.is_anonymous ?? false`)
- `deviceId`

**Why:** This is the entry point. Every visitor gets a UUID automatically.

### 1.2 Auto-create anonymous identity on first pageload (zero clicks)
**File to update:** `src/components/providers/AuthProvider.tsx` (existing `useEffect` around line 38)

Init sequence (strict order):
1. `supabase.auth.getSession()` — if session exists, load user, done
2. If no session, check `localStorage['factory-dominion-device-id']`:
   - If missing, generate UUID v4, store
   - If exists, call `/api/auth/recover-by-device` (Phase 1.7) with the device_id
3. If no session and recovery failed: call `signInAnonymously()`
4. After successful anon sign-in: call `/api/auth/initialize-guest` (Phase 1.3) to create the `guest_identities` row and `server_game_state` row

**Why:** Visitors never see a "Sign In to play" gate. They play, with a real UUID, immediately. The "Bind Account" button is opt-in for upgrading.

### 1.3 Create `/api/auth/initialize-guest` route
**New file:** `src/app/api/auth/initialize-guest/route.ts`

POST handler:
- Body: `{ deviceId, fingerprint? }`
- Verify session exists (the anon user from 1.1)
- Verify the user has no existing `server_game_state` row (idempotency)
- Verify the user has no existing `guest_identities` row
- Create `server_game_state` row (money=1000, defaults)
- Create `guest_identities` row: `{ user_id, device_id, fingerprint_hash (nullable), is_primary: true }`
- Fingerprint (if provided) is hashed (SHA-256) and stored as `fingerprint_hash` — used for risk scoring, NEVER for ownership
- Rate limit 10/min per user

**Why:** Creates the authoritative game state and the device mapping. This is what makes the "returning visitor" flow work.

### 1.4 Create `/api/auth/link-identity` route
**New file:** `src/app/api/auth/link-identity/route.ts`

POST handler:
- Body: `{ idempotencyKey, previewOnly?: boolean }`
- Auth: must be a Google-authenticated user (not anonymous)
- Read the persisted `factory-dominion-guest-uid` from a cookie or the request body's signed token
- Look up the guest user's `server_game_state` (full preview payload)
- Look up the Google user's `server_game_state` (full preview payload)
- **Conflict detection:** if the Google user has its own `server_game_state` with non-trivial progress (game_tick > 100 OR money > 10000), then we have a true merge situation. Create a `pending_link_operations` row with status='pending' and a 24h expiry.
- If no conflict (Google user is fresh), directly link the Google identity to the anon user's UUID using `supabase.auth.admin.linkIdentity()` and copy the guest's state to the Google user.
- Compute `risk_score` from both states
- Compute `preview_version` = both states with their comparison panel data
- Return the operationId + preview (or success if no conflict)

**Why:** Two paths: clean link (Google is fresh → just upgrade the anon) OR conflict (Google already has progress → show merge dialog).

### 1.5 Create `/api/auth/confirm-link` route (the merge transaction)
**New file:** `src/app/api/auth/confirm-link/route.ts`

POST handler:
- Body: `{ operationId, idempotencyKey, preference: 'keep_guest' | 'keep_google' }`
- Auth: must be a Google-authenticated user matching `google_user_id` in the operation
- **Save freeze check:** if any other resolution is `status='pending'` for this device, return 409
- Load the pending operation
- Check `status === 'pending'` and `expires_at > now()`
- **Single transaction:**
  - If `preference === 'keep_guest'`:
    - Copy guest's `server_game_state` row → Google user's `server_game_state` (overwrite)
    - Link the Google identity to the guest's UUID (the guest UUID survives)
    - `merge_receipts`: `kept_user_id = guestUserId, archived_user_id = googleUserId`
    - `guest_identities.superseded_by = googleUserId` (the Google identity is linked, but the user record is the guest)
    - `profiles.linked_account_id = googleUserId`
    - `profiles.is_guest = false`
    - Mark the Google user's old profile as archived
  - If `preference === 'keep_google'`:
    - Keep the Google user's state
    - Discard the guest's state (delete the `server_game_state` row for the guest)
    - `merge_receipts`: `kept_user_id = googleUserId, archived_user_id = guestUserId`
    - `guest_identities.superseded_by = googleUserId, superseded_at = now()`
  - `merge_audit_log`: full before/after snapshots
  - Update `pending_link_operations` status to `completed`, completed_at = now()
- Return `{ receiptId, survivingUserId }`

**Why:** The single transaction guarantees atomicity. Save freeze + single-active-resolution prevents two tabs from racing.

### 1.6 Create `/api/auth/recover-by-device` route
**New file:** `src/app/api/auth/recover-by-device/route.ts`

POST handler:
- Body: `{ deviceId }`
- Rate limit 3/min per deviceId
- Look up `guest_identities` by `device_id` (primary, not superseded)
- If found and not superseded: sign the user in as anon with the recovered UUID
  - **Implementation:** use `supabase.auth.admin.generateLink({ type: 'magiclink', email: '...' })` does NOT work for anon users. Alternative: call `supabase.auth.admin.createSession({ user_id, fresh: false })` — returns a refresh token. Set it via SSR cookies.
- If found but superseded: return `{ recoveredAs: 'linked_to', googleUserId }` and instruct the client to also sign in with Google
- If not found: return 404

**Why:** This is the **device_id-based recovery** (the primary signal per spec). Fingerprint is never used for recovery.

### 1.7 Update AuthProvider to detect conflict and open merge dialog
**File to update:** `src/components/providers/AuthProvider.tsx` + new file `src/lib/hooks/useMergeFlow.ts`

New hook `useMergeFlow` exposes:
- `pendingMerge: { operationId, preview } | null`
- `openMergeDialog(preview)` — called by `signInWithGoogle` callback when 1.4 returns a conflict
- `confirmMerge(preference)` — POST to `/api/auth/confirm-link`
- `cancelMerge()` — DELETE the pending operation

`signInWithGoogle` flow update:
1. OAuth starts, user completes Google
2. After `onAuthStateChange` fires with the new Google user, check if `localStorage['factory-dominion-guest-uid']` exists and != new Google user.id
3. If so, POST `/api/auth/link-identity` with `idempotencyKey = uuid()` from client
4. If response is `conflict: true`, set `pendingMerge` and show the merge dialog
5. If response is `linked: true` (no conflict), proceed to load game

**Why:** The flow must auto-trigger when the conflict is detected, not require the user to click anything beyond the Google sign-in.

### 1.8 Save freeze during pending merge
**New file:** `src/lib/hooks/useSaveFreeze.ts`

Exposes `isSaveFrozen: boolean`.

The hook listens for `pendingMerge != null` (from `useMergeFlow`) and freezes the cloud save flow:
- `useCloudSave.saveToCloud()` returns `{ success: false, error: 'merge_in_progress' }` while `isSaveFrozen === true`
- The offline progress computation in `useOfflineProgressCheck` is also gated
- The save indicator in the header shows a "Merge in progress" badge

The freeze is released when:
- The merge is confirmed (success)
- The merge is cancelled
- The pending operation expires (24h)

**Why:** Prevents a save during merge from corrupting state. Per spec: "Save Freeze During Merge."

### Phase 1 Verification

- Open incognito → see auto-signin happen with no button click → check `auth.users` for new anon row
- Play 100 ticks → click "Bind Account" → confirm "Keep Guest" → verify the guest UUID remains the surviving account, Google is linked
- Open 2 tabs in the same browser, both sign in with Google using a different Google account than the guest → verify only one merge dialog appears, the other gets a 409
- Clear localStorage → reload → verify "no device_id → new anon" path
- Open 2 devices with same device_id, one with progress, one fresh → verify recovery returns the user's data

---

## Phase 1.5 — Auth UI Surface (Days 6–8, 3 days)

**Why this phase:** Phase 1 ships the API. This phase makes it visible to users. The merge dialog is the user's most high-stakes moment in the app — a wrong button loses their progress forever. The UI must be clear, accessible, and reuse existing primitives per spec.

**Spec constraint:** Use existing UI primitives (`Dialog / Modal / Card / Button / Badge / StatRow`). Do NOT create a brand-new design system. Do NOT create a separate page.

### 1.5.1 Rename the header button based on auth state
**Files to update:**
- `src/components/game/headers/DesktopHeader.tsx`
- `src/components/game/headers/MobileHeader.tsx`
- `src/components/game/GameHeader.tsx`

The "Sign In" button (around line 407 in DesktopHeader) becomes:
- `user === null` → "Sign In" (but with Phase 1.2 in place, this state should be impossible — guarded with a fallback message)
- `user && isGuest` → "Bind Account" (calls `promptLogin('manual')` → opens `LoginFloatingPanel` for Google)
- `user && !isGuest` → hide the button (replaced by the account menu)

The button should be near the user's display name / avatar. Add a small `(Guest)` badge next to the name when `isGuest === true`.

**Why:** The spec is explicit: "the current login button should change the text name to bind account." Visitors who are guests see "Bind Account" (not "Sign In") because they're already signed in — they just need to upgrade to Google.

### 1.5.2 Add user avatar / display name to header
**Files to update:** Same three header files

When `user !== null`:
- Show `user.user_metadata.picture` as a small avatar (32px circle)
- If `picture` is null (anon user), show a generated initial in a colored circle (consistent with shadcn `Avatar` component)
- Show display name (from `profiles.display_name` or `user.email?.split('@')[0]`)

When `isGuest === true`:
- Show "Guest" instead of email
- Show the `factory-dominion-guest-uid` shortened (`aaa-111...`) in the tooltip on hover (for support)

**Why:** Right now the header shows "Sign In" as if the user isn't authenticated, even after Phase 1.2 has made them authenticated. The avatar/name surface is what makes the account feel real.

### 1.5.3 Reuse LoginFloatingPanel as the merge dialog
**Files to update:**
- `src/components/game/LoginFloatingPanel.tsx` (add a new `mode: 'merge_conflict' | 'merge_confirm_keep_guest' | 'merge_confirm_keep_google' | 'merge_success' | 'merge_failure'`)
- `src/lib/hooks/useLoginPrompt.ts` (extend `LoginPromptReason` to include merge-specific reasons)

The panel already has:
- `Dialog / Modal` structure (lines 220-360)
- `Card` for content blocks
- `Button` for actions
- A `mode: 'hard_gate' | 'soft_prompt'` discriminator (line 31)

Add new modes for the merge flow. The new `merge_conflict` mode renders:
- A 2-column comparison panel on desktop, stacked cards on mobile (per spec)
- Each column shows: UUID (truncated), Created, Last Active, Prestige, Industry Level, Total Money, Total Ticks, Buildings, Research, Achievements
- Three actions: "Keep Guest" / "Keep Google" / "Cancel"

The `merge_confirm_*` modes show a single confirmation dialog with a Back button.
The `merge_success` mode shows the receipt ID and a Continue button.
The `merge_failure` mode shows a Retry / Cancel pair.

Use the existing `useLoginPrompt` to drive the panel — extend the `LoginPromptReason` union:
- `'merge_conflict'`
- `'merge_confirm_keep_guest'`
- `'merge_confirm_keep_google'`
- `'merge_success'`
- `'merge_failure'`

The merge dialog is invoked from the new `useMergeFlow` hook (Phase 1.7), not from a hard-gate trigger.

**Why:** The spec is explicit: "Use existing: Dialog / Modal / Card / Button / Badge / StatRow. Do NOT create a brand-new design system. Do NOT create a separate page." Reusing the existing panel matches the existing UI inventory and avoids divergence.

### 1.5.4 Restrict guest from features that require Google identity
**Files to update (UI side):**
- Stock market tab (find via grep on `src/components/game/tabs/`)
- Trading Post tab
- Leaderboard tab
- Mega Projects tab

For each of the four gated tabs, when `isGuest === true`:
- Render a `Badge` at the top: "Bind Account to access this feature"
- Disable all interactive controls
- Show a "Bind Account" button that opens `LoginFloatingPanel` with `reason: 'trading_post' | 'leaderboard' | 'mega_project' | 'stock_market'`
- API routes that back these tabs return 403 with `code: 'GUEST_GATED'` for anon users

**Files to update (API side):**
- `src/app/api/game/trade/route.ts`
- `src/app/api/game/trades/route.ts`
- `src/app/api/leaderboard/route.ts`
- `src/app/api/leaderboard/submit/route.ts`
- (Mega project routes — find via grep)

For each: at the top of POST/GET, after auth, check `if (auth.user?.is_anonymous) return 403`.

**Why:** Spec: "The guest profile are disable for stock market, trade post, leaderboard and mega project." A guest sees the tab but cannot use it. The Bind Account button is the only escape.

### 1.5.5 Add `?auth=error` toast on page load
**File to update:** `src/app/page.tsx` (new `useEffect` on mount)

```ts
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('auth') === 'error') {
    toast.error('Sign-in failed. Please try again.');
    // Strip the param from the URL
    window.history.replaceState({}, '', window.location.pathname);
  }
}, []);
```

Use the `sonner` library which is already in `package.json` (line 59: `"sonner": "^2.0.6"`).

**Why:** Audit H10. Today the OAuth callback writes `?auth=error` on failure but no code reads it. Users never know.

### 1.5.6 Show account menu with Sign Out + Manage Account
**Files to update:** Three header files

Replace the current "Sign Out" button location with a dropdown menu (use shadcn `DropdownMenu`):
- Display name + email (or "Guest" + truncated UUID)
- "Manage Account" → opens a settings modal (Phase 1.5.7)
- "Sign Out" → calls `signOut()` from AuthProvider
- If `isGuest`, add a "Bind Account" item at the top

**Why:** Consistent with the "Bind Account" rename — the user's account actions live in one place.

### 1.5.7 Account settings modal
**New file:** `src/components/game/AccountSettingsModal.tsx`

A modal opened from the account menu. Shows:
- Account type badge: "Guest" / "Google" / "Linked"
- Email (if Google) or truncated UUID (if guest)
- Linked accounts (if any)
- "Edit display name" → input + save (calls `/api/auth/update-profile`)
- "Sign Out" button
- If guest: "Bind Account" button at the top

**New route:** `src/app/api/auth/update-profile/route.ts`
- POST, body: `{ displayName }`
- Auth + ownership
- Sanitize `displayName` (same as 3.3)
- Update `profiles.display_name` and `auth.users.user_metadata.display_name`
- Rate limit 5/min

**Why:** Users need a place to see and edit their account. The current app has no profile page at all.

### Phase 1.5 Verification

- Anonymous user logs in → header shows "Guest" + truncated UUID + "Bind Account" button (NOT "Sign In")
- Guest clicks "Bind Account" → Google sign-in → conflict modal appears with side-by-side comparison
- Click "Keep Guest" → confirmation modal → success screen with receipt ID → header now shows "Google" + email
- Try to open Trading Post tab as guest → see "Bind Account to access this feature" badge, controls disabled
- OAuth callback fails → page-load toast appears
- Open account menu → see display name, edit it, see the change persist

---

## Phase 2 — Server-Authoritative Game Actions (Days 9–13, 1.5 weeks)

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

## Phase 7 — Server-Side Tick Validation (1–2 weeks)

**Why this phase:** The current plan (Phases 0–6) prevents sudden cheating, fake leaderboard scores, and fake offline progress. However, it does NOT prevent **gradual client-side cheating** — a player who inflates money by 10% per save (keeping within delta check thresholds) can accumulate unlimited money over time.

This phase adds **server-side tick validation** that runs periodically for each active player, computing the theoretical maximum money the player should have based on their buildings, research, and elapsed ticks. Any divergence between client's saved state and server-computed state is flagged.

**Spec invariant:** At any point in time, the server can answer: "Given this player's buildings, research, workers, and time elapsed, the maximum possible money is $X." If the client claims more than X, it's cheating.

### 7.1 Theoretical maximum computation function
**New file:** `src/lib/game/serverTickValidator.ts`

Create a new module with a function that computes the theoretical maximum money a player should have:

```typescript
export function computeMaxPossibleMoney(
  gameState: GameState,
  elapsedTicks: number,
  config: GameConfig
): number {
  // Compute theoretical max based on:
  // - Number of each building type × max production rate per tick
  // - All research effects (production multipliers)
  // - All worker effects (efficiency bonuses)
  // - Weather effects (production multipliers)
  // - Prestige bonuses (production multipliers)
  // - Cap by elapsedTicks × max_rate_per_tick × max_multiplier
}
```

This function uses the **same** `buildMultipliers` and `computeProduction` from `productionCalculator.ts` that the client uses, so the server's expectation matches what the client should have produced.

**Why:** This is the core of the validation. The server can compare client's claimed money against this theoretical max.

### 7.2 Periodic server-side tick validation job
**New file:** `src/app/api/cron/validate-ticks/route.ts`

A cron-triggered endpoint (via Supabase pg_cron or external scheduler) that:

1. Queries all `server_game_state` rows where `last_tick_at` is within the last 5 minutes (active players)
2. For each active player:
   - Load their `server_game_state.full_state`
   - Compute elapsed ticks since last validation
   - Call `computeMaxPossibleMoney(state, elapsedTicks, config)`
   - If `state.money > computedMax * 1.1` (10% tolerance for rounding), flag the account
3. Flagged accounts: increment `cheat_flag_count`, insert `cheat_investigations` row with `detection_type: 'gradual_money_inflation'`

**Schedule:** Every 5 minutes via Supabase pg_cron:
```sql
SELECT cron.schedule('validate-active-players', '*/5 * * * *',
  $$SELECT net.http_post('https://your-app.com/api/cron/validate-ticks')$$);
```

**Why:** Without periodic validation, a gradual cheater can accumulate money indefinitely as long as they stay under the per-save delta check threshold. This catches the "slow poison" cheater.

### 7.3 Client-side divergence detection
**File to update:** `src/lib/game/store.ts`

Add a new method `divergesFromExpected` to the store:

```typescript
divergesFromExpected: (serverComputedMax: number) => {
  const state = get();
  const ratio = state.money / serverComputedMax;
  return ratio > 1.1; // 10% tolerance
},
```

**Also update:** `src/lib/hooks/cloudSync/useCloudSave.ts`

When the server returns a `validation_warning` (e.g., "your money is higher than theoretical max"), the client:
- Shows a warning toast: "Your game state may be out of sync. Reloading..."
- Triggers a forced reload from server
- Logs the divergence to console for debugging

**Why:** Provides immediate user feedback when the server detects divergence. Forces the user to sync, preventing them from continuing with fake state.

### 7.4 Tighten the per-save delta check threshold
**File to update:** `src/lib/auth/gameStateValidator.ts:228-233`

Current delta check:
```typescript
if (moneyDelta > 0 && earnedDelta >= 0 && 
    moneyDelta > earnedDelta * 1.5 + 100000) {
  // Flag
}
```

Tighten to:
```typescript
if (moneyDelta > earnedDelta * 1.1 + 50000) {  // was 1.5 + 100000
  // Flag with severity: medium (suspicious), not critical
}
```

The looser threshold (1.5x) allowed gradual cheaters to blend in. The tighter threshold (1.1x) catches inflation attempts but still allows for legitimate market price fluctuations.

**Note:** This is a **conservative change** that may increase false positives. Test with the actual player base before rolling out.

**Why:** Closes the delta check gap that gradual cheaters exploit.

### 7.5 Admin investigation workflow for gradual cheaters
**File to update:** `src/app/api/admin/investigations/route.ts` (existing)

The `cheat_investigations` table now gets a new `detection_type`: `'gradual_money_inflation'`. The admin investigation UI needs to:

1. Display this new detection type with a clear explanation
2. Show the player's money-over-time graph (if available)
3. Provide a "Reset money to theoretical max" action
4. Provide a "Ban account" action

**Why:** Automated flagging is only useful if admins can act on it. The current investigation UI only handles `state_tampering` and similar.

### 7.6 Expected value bounds for buildings and research
**New file:** `src/lib/game/serverTickValidator.ts` (extended)

Add similar theoretical-max functions for:
- `computeMaxPossibleBuildings(state, elapsedTicks)`: given the player's research and elapsed time, max buildings they could have built
- `computeMaxPossibleResearch(state)`: given prerequisites completed, max research they could have unlocked
- `computeMaxPossibleResources(state, elapsedTicks)`: max resource amounts given production rate

These run alongside `computeMaxPossibleMoney` in the periodic validation job.

**Why:** Money is the primary exploit target, but buildings, research, and resources can also be inflated. The same pattern catches all of them.

### Phase 7 Verification

- Test gradual cheat: `__gameStore.setState({money: 5000})` on a fresh account (legitimate: $1000)
- Wait 5 minutes for the validation cron
- Verify the account is flagged with `cheat_flag_count` increment
- Verify `cheat_investigations` has a new row with `detection_type: 'gradual_money_inflation'`
- Verify the admin can see this in the investigation panel

### Estimated effort

- 7.1 Theoretical max function: 1 day
- 7.2 Periodic validation job: 1-2 days  
- 7.3 Client-side divergence detection: 0.5 day
- 7.4 Tighten delta check: 0.5 day
- 7.5 Admin investigation UI update: 1 day
- 7.6 Extended value bounds: 1-2 days

**Total: 5-7 days (1-1.5 weeks)**

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
- `supabase/migrations/018_admin_function_fix.sql` (NEW — Phase 0)
- `supabase/migrations/019_guest_identities_rls.sql` (NEW — Phase 0)
- `supabase/migrations/020_dedup_triggers.sql` (NEW — Phase 0)
- `supabase/migrations/021_profiles_and_guest_identities.sql` (NEW — Phase 0)
- `supabase/migrations/022_merge_and_link_tables.sql` (NEW — Phase 0)
- `supabase/migrations/023_uncommitted_functions.sql` (NEW — Phase 0)
- `supabase/migrations/024_admin_users_policies.sql` (NEW — Phase 0)
- `src/components/providers/AuthProvider.tsx` (Phases 1, 1.5, 3)
- `src/lib/hooks/useLoginPrompt.ts` (Phase 1.5 — add merge reasons)
- `src/lib/hooks/useMergeFlow.ts` (NEW — Phase 1.7)
- `src/lib/hooks/useSaveFreeze.ts` (NEW — Phase 1.8)
- `src/components/game/LoginFloatingPanel.tsx` (Phase 1.5 — new modes)
- `src/components/game/AccountSettingsModal.tsx` (NEW — Phase 1.5.7)
- `src/components/game/headers/DesktopHeader.tsx` (Phase 1.5)
- `src/components/game/headers/MobileHeader.tsx` (Phase 1.5)
- `src/components/game/GameHeader.tsx` (Phase 1.5)
- `src/components/game/tabs/StockMarketTab.tsx` (Phase 1.5.4 — disable for guest)
- `src/components/game/tabs/TradingPostTab.tsx` (Phase 1.5.4)
- `src/components/game/tabs/LeaderboardTab.tsx` (Phase 1.5.4)
- `src/components/game/tabs/MegaProjectsTab.tsx` (Phase 1.5.4)
- `src/app/api/auth/anonymous-signin/route.ts` (NEW — Phase 1)
- `src/app/api/auth/initialize-guest/route.ts` (NEW — Phase 1.3)
- `src/app/api/auth/link-identity/route.ts` (NEW — Phase 1.4)
- `src/app/api/auth/confirm-link/route.ts` (NEW — Phase 1.5)
- `src/app/api/auth/recover-by-device/route.ts` (NEW — Phase 1.6)
- `src/app/api/auth/update-profile/route.ts` (NEW — Phase 1.5.7)
- `src/app/api/game/claim-offline/route.ts` (NEW — Phase 2)
- `src/app/api/auth/migrate-guest/route.ts` (Phases 3)
- `src/app/api/game/action/route.ts` (Phases 2, 3, 4)
- `src/app/api/game/compute/route.ts` (Phase 2)
- `src/app/api/game/state/route.ts` (Phases 3, 4)
- `src/app/api/player/route.ts` (Phase 3)
- `src/app/api/leaderboard/submit/route.ts` (Phase 2)
- `src/app/api/game/trade/route.ts` (Phase 1.5.4 — guest gate)
- `src/app/api/game/trades/route.ts` (Phase 1.5.4)
- `src/app/api/leaderboard/route.ts` (Phase 1.5.4)
- `src/app/api/leaderboard/submit/route.ts` (Phase 1.5.4 + Phase 2)
- `src/app/admin/auth/callback/route.ts` (Phase 3)
- `src/app/page.tsx` (Phases 1.5, 3)
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
| Phase 1: Account linking (backend) | 4 days | 3.5 |
| Phase 1.5: Auth UI Surface | 3 days | 2.5 |
| Phase 2: Server-authoritative | 5 days | 4 |
| Phase 3: Auth & API hardening | 4 days | 3 |
| Phase 4: Anti-cheat | 3 days | 2 |
| Phase 5: Hygiene | 2 days | 1.5 |
| Phase 6: Docs | 1 day | 0.5 |
| **Total** | **~4 weeks calendar** | **17.5 engineer-days** |

Assuming 1 senior engineer + 1 junior for review/testing, the calendar time is 4-5 weeks. The Phase 1 → Phase 1.5 → Phase 2 dependency means the project should be staffed for at least 5 continuous weeks.

---

## Success Criteria

The plan is "done" when:

1. A new visitor loads the site, is automatically signed in as an anonymous Supabase user, and never sees a "Sign In" gate before playing
2. The header shows "Bind Account" (not "Sign In") for guests, with an avatar/guest badge
3. A guest can click "Bind Account" → Google sign-in → see the side-by-side merge dialog → choose "Keep Guest" or "Keep Google" → confirmation → success with receipt ID
4. Returning on the same device (same `device_id`) restores the same `auth.users.id` even after a session expiry
5. A guest who clears localStorage and returns on a new device gets a fresh anonymous account (NOT the old one — that requires explicit recovery)
6. Guest cannot access Stock Market, Trade Post, Leaderboard, or Mega Projects (disabled with "Bind Account" gate)
7. A player in production cannot set `__gameStore.setState({...})` and have the result persist on the server
8. The `is_game_admin()` function correctly grants admin to anyone in `admin_users` with role admin/super_admin
9. The migrations in `supabase/migrations/` are sufficient to recreate the live database from scratch
10. The `guest_identities` RLS does not allow cross-user reads
11. Production headers include CSP, HSTS, X-Frame-Options
12. A leaderboard entry cannot be inflated by client-side modifications
13. Offline progress is computed server-side and capped by elapsed time

After all phases ship, re-run the audit checklist. The new grade should be B or better.
