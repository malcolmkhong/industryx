# IMPLEMENTATION PROGRESS — Security & Architecture Hardening

**Source audit:** `planning/PRODUCTION_SECURITY_AUDIT.md`
**Source plan:** `planning/IMPLEMENTATION_PLAN.md`
**Source spec:** Enterprise Authentication Flow
**Last updated:** June 15, 2026 (post Phase 1.5)

---

## Overall Status

| Phase | Status | Commits | Time Spent |
|---|---|---|---|
| **Phase 0** — Database Hardening | ✅ **Complete** | 260033b, 343415f | 0.5 day |
| **Phase 1** — Anonymous Identity + Linking | ✅ **Complete** | ffbf45d, 2e70a4e | 1.5 days |
| **Phase 1.5** — Auth UI Surface | ✅ **Complete** | 78b6b4d, 1930fde | 3 days |
| **Phase 2** — Server-Authoritative Actions | 🟡 **In Progress** | 7799972, 48ba05a | 1-2 days so far |
| **Phase 3** — Auth & API Hardening | ⏳ **Not Started** | — | 1 week est |
| **Phase 4** — Anti-Cheat | ⏳ **Not Started** | — | 3 days est |
| **Phase 5** — Production Hygiene | ⏳ **Not Started** | — | 2 days est |
| **Phase 6** — Docs & Process | ⏳ **Not Started** | — | 1 day est |
| **Phase 7** — Server-Side Tick Validation | ⏳ **Not Started** | — | 1-1.5 weeks est |

**Total elapsed:** ~6 days of focused work
**Total remaining:** ~5-6 weeks of work

> **Note:** Phase 7 was added in response to a user question about gradual client-side cheating. Phases 0-6 prevent sudden cheating, fake leaderboard, and fake offline, but do NOT prevent gradual inflation via repeated small `__gameStore.setState` calls. Phase 7 adds periodic server-side validation that catches the "slow poison" cheater pattern.

---

## Phase 0 — Database Hardening ✅ Complete

**Goal:** Lock down security, fix RLS, capture uncommitted schema.

**Deliverables (all applied to live Supabase project `wkkzqtseqwcyyyezroqq`):**

| Migration | Purpose | Status |
|---|---|---|
| `018_admin_function_fix.sql` | Fix `is_game_admin()` to query `admin_users`, lock down `guest_identities` RLS, lock down `increment_cheat_flag` grants, seed `admin_users` | ✅ Applied & verified |
| `019_dedup_triggers.sql` | Drop 15 duplicate `updated_at` triggers on `game_config_*` tables | ✅ Applied & verified |
| `020_profiles_and_guest_identities.sql` | Capture `profiles` + `guest_identities` tables and `handle_new_user` trigger | ✅ Applied & verified |
| `021_merge_and_link_tables.sql` | Capture `pending_link_operations`, `merge_receipts`, `merge_audit_log` tables and `expire_stale_pending_operations` function | ✅ Applied & verified |
| `022_uncommitted_functions.sql` | Capture `auto_update_timestamp` function with locked grants | ✅ Applied & verified |
| `023_profiles_display_name.sql` | Add missing `display_name` column to `profiles` (was in migration 020's CREATE TABLE but missing from live table) | ✅ Applied & verified |

**Live verification queries run:**
- `is_game_admin()` now queries `admin_users` with `EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))` + bootstrap UID fallback
- `guest_identities` uses `auth.role() = 'service_role'` instead of `USING (true)` — 0 cross-user reads possible
- `increment_cheat_flag` grants locked to `{postgres, service_role}` only — no PUBLIC, no anon, no authenticated
- `admin_users` seeded with bootstrap admin `1b4d0dc3-...` as super_admin
- 0 duplicate `trg_gcX_updated_at` triggers remaining
- `on_auth_user_created` trigger wired to `handle_new_user()` — creates `profiles` row on new signup
- `profiles.display_name` backfilled for bootstrap admin as "Malcolm Khong" (from `raw_user_meta_data.full_name`)

**Key discovery:** The `display_name` column was missing from the live `profiles` table even though migration 020 had it — the table was created earlier. Fixed with migration 023.

---

## Phase 1 — Anonymous Identity + Linking ✅ Complete

**Goal:** Every visitor gets a Supabase Auth UUID automatically. Guests can upgrade to Google with a safe merge flow.

**Deliverables:**

### 1.1-1.3 AuthProvider + Auto-Anon Signin + Initialize

| File | Purpose |
|---|---|
| `src/components/providers/AuthProvider.tsx` | Added `signInAnonymously`, `isGuest`, `deviceId` to context. Auto-signin on first pageload. Device recovery attempt before anon. |
| `src/app/api/auth/initialize-guest/route.ts` | Creates `server_game_state` row + `guest_identities` mapping after anon signin. Idempotent. Rate-limited 30/min. |

### 1.4-1.5 Link-Identity + Confirm-Link (the merge transaction)

| File | Purpose |
|---|---|
| `src/app/api/auth/link-identity/route.ts` | Detects conflict (Google user has existing progress). Creates `pending_link_operations` with 24h expiry. Returns preview data. |
| `src/app/api/auth/confirm-link/route.ts` | Executes the merge transaction. Save-freeze check. Copies state. Creates receipt + audit log. Returns receiptId. |

### 1.6 Recover by Device

| File | Purpose |
|---|---|
| `src/app/api/auth/recover-by-device/route.ts` | `device_id` is the primary recovery signal (fingerprint never used for recovery). Returns `recoveredAs: 'recovered' | 'linked_to' | 'not_found'`. |

### 1.7-1.8 Merge Flow + Save Freeze

| File | Purpose |
|---|---|
| `src/lib/hooks/useMergeFlow.ts` | Hook that drives the merge dialog state (idle / confirming / success / failure). Sets guest_uid cookie. Triggers link check on Google signin. |
| `src/lib/hooks/useSaveFreeze.ts` | Cross-tab save freeze state via localStorage + custom events. Prevents saves during pending merges. |

**Known limitation:** Supabase Auth does not expose `createSession` for anonymous users. The recovery flow returns the userId but the client must establish a session via `signInAnonymously` separately. Full recovery requires custom JWT approach (deferred to Phase 3+).

---

## Phase 1.5 — Auth UI Surface ✅ Complete

**Goal:** Make the auth flow visible to users. Rename "Sign In" to "Bind Account" for guests. Disable guest access to gated features. Provide an account menu.

### 1.5.1 Header button rename ✅

| File | Change |
|---|---|
| `src/components/game/headers/DesktopHeader.tsx` | Added `isGuest` from `useAuth`. "Sign In" button now shows "Bind Account" for guests. |
| `src/components/game/headers/MobileHeader.tsx` | Same. |
| `src/components/game/GameHeader.tsx` | Both desktop and mobile sections. |

### 1.5.2 Avatar + display name in header ✅ (partial)

- DesktopHeader: shows avatar from `user.user_metadata.avatar_url` with initial-fallback circle, plus display name
- Added `(Guest)` badge next to name when `isGuest === true`
- MobileHeader/GameHeader mobile: show "Bind Account" button only (not full account menu — deferred)

### 1.5.3 Merge dialog rendering ✅

| File | Change |
|---|---|
| `src/components/game/LoginFloatingPanel.tsx` | Added `MergePreview` type export. Extended `LoginPromptReason` with 5 merge modes (`merge_conflict`, `merge_confirm_keep_guest`, `merge_confirm_keep_google`, `merge_success`, `merge_failure`). Added `StatRow` and `formatNum` helpers. Added rendering for all 5 merge dialog modes (side-by-side comparison, confirm dialogs, success/failure screens). |
| `src/app/page.tsx` | Wired up `useMergeFlow` to drive the dialog. Passes merge props to LoginFloatingPanel. |

### 1.5.4 Guest gating (UI + API) ✅

**UI side** (`src/lib/hooks/page/useTabChange.ts`):
- **Critical bug fix**: Changed `if (!user && !authLoading && ...)` to `if (isGuest || (!user && !authLoading))`. After Phase 1.2, every visitor is auto-signed-in as anonymous so `!user` was never true. Guests were bypassing the gate.
- Now correctly intercepts `leaderboard`, `tradePost`, `megaprojects` tabs for guests and calls `promptLogin(reason)`
- `stock_market` added to the gated tab type for future use (tab doesn't exist yet)

**API side** — 4 routes return 403 with `code: 'GUEST_GATED'`:

| Route | Method |
|---|---|
| `/api/game/trade` | POST |
| `/api/game/trades` | GET (was public, now requires Google auth) |
| `/api/leaderboard` | GET (was public, now requires Google auth) |
| `/api/leaderboard/submit` | POST |

New helper: `src/lib/auth/guestCheck.ts` — queries `auth.users.is_anonymous` via service role

### 1.5.5 ?auth=error toast ✅

- `src/app/page.tsx` has a `useEffect` that reads `?auth=error` URL param on mount, shows `toast.error`, and strips the param from the URL

### 1.5.6 Account menu in header ✅ (DesktopHeader only)

- Replaced the Tooltip-based "hover menu" with a proper `DropdownMenu` (click-to-open)
- Menu items: **Manage Account** (triggers `AccountSettingsModal`), Save to Cloud, Reload Config, Sign Out
- For guests: label shows "Playing as Guest" and `(Guest)` badge is visible
- `onManageAccount` prop added to `DesktopHeaderProps`; wired from page.tsx via `() => setAccountSettingsOpen(true)`
- **MobileHeader still uses Tooltip** — the DropdownMenu pattern was only applied to DesktopHeader

### 1.5.7 Account settings modal ✅

| File | Purpose |
|---|---|
| `src/app/api/auth/update-profile/route.ts` | POST with `{userId, displayName}`. Sanitizes display name (strips control chars, angle brackets, max 32 chars). Uses `verifyAuthAndOwnership` for auth. Rate-limited 5/min. |
| `src/components/game/AccountSettingsModal.tsx` | Modal with display name editor, Guest/Google account type badge, Sign Out button. |

---

## Phase 2 — Server-Authoritative Game Actions 🟡 IN PROGRESS

**Goal:** Convert the dead server validation API into a real safety net. Remove `window.__gameStore` exposure. Make game state server-authoritative.

**Sub-tasks (from IMPLEMENTATION_PLAN.md):**

| # | Task | Status | Estimated Time |
|---|---|---|---|
| 2.1 | Remove `window.__gameStore` exposure in production | ✅ **Done** | 10 min |
| 2.2 | Wire `submitActionToServer` into every store action (buildBuilding, sellResource, buyResource, startResearch, setGameSpeed, toggleBuilding, hireWorker, assignWorker, doPrestige, etc.) | 🟡 1/15 done | 3-4 hours |
| 2.3 | Make `/api/game/action` load `server_game_state` for validation (not client state) | ⏳ Not Started | 1 hour |
| 2.4 | Make `/api/game/compute` load `server_game_state` as the base (not client state) | ⏳ Not Started | 1 hour |
| 2.5 | Modify existing `/api/game/offline` to accept POST and apply resources (revised — don't create new route) | ⏳ Not Started | 2 hours |
| 2.6 | Make `/api/leaderboard/submit` use `server_game_state` for scoring (not client) | ⏳ Not Started | 1 hour |
| 2.7 | Tighten `GAME_LIMITS` static bounds in `gameStateValidator.ts` | ⏳ Not Started | 30 min |

### Phase 2.1 ✅ Done

**File:** `src/lib/game/store.ts:3560-3562`

```ts
// Before:
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__gameStore = useGameStore;
}

// After:
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  (window as unknown as Record<string, unknown>).__gameStore = useGameStore;
}
```

**What this prevents:** `__gameStore.setState({money: 1e15})` from DevTools console in production builds.

**What this does NOT prevent:**
- Cheater still sees fake money locally until the next save attempt fails
- Gradual cheating (10%/save) still works because delta checks pass
- Visual-only cheating (cheater sees fake money for ~2 min between saves)

### Phase 2.2 🟡 Partial (1/15 done)

**New file:** `src/lib/game/actionValidator.ts`

Created a helper that wraps `submitActionToServer()` from `serverActions.ts`:

```ts
export async function validateActionWithServer(
  actionType: ValidatedActionType,
  payload: Record<string, unknown>
): Promise<ValidatedActionResult> {
  const validation = await submitActionToServer(actionType, payload);
  if (!validation.valid) {
    return { approved: false, error: validation.error ?? 'Action rejected by server' };
  }
  return { approved: true };
}
```

**Wired into:** `buildBuilding` (the highest-impact action)

**Pattern used in buildBuilding:**
```ts
// Phase 2.2: Server validation (fire-and-forget, server catches cheating on next save)
// Phase 2.3 will make this blocking; for now it's advisory
void (async () => {
  try {
    await import('./actionValidator').then(m =>
      m.validateActionWithServer('build', { buildingType: type })
    );
  } catch {}
})();
```

**Why fire-and-forget (not blocking)?** Because the current `/api/game/action` route still uses client-sent state (Phase 2.3 will fix). Until then, the validation just records what the client sent. After 2.3, the call can become blocking (`await ... if (!approved) return`).

**Not yet wired (remaining 14):**
- sellResource, buyResource, startResearch, setGameSpeed
- toggleBuilding, hireWorker, assignWorker, doPrestige
- bulkBuild, bulkSell, buyMarket, sellMarket
- startDroneMission, collectDrone, claimQuest
- upgradeBuilding

All follow the same pattern as buildBuilding. ~3-4 hours of repetitive edits.

### What's NOT complete in Phase 2

1. **2.2: 14 more store actions** need the same fire-and-forget pattern
2. **2.3: `/api/game/action` route** still trusts client-sent gameState — this is the critical gap
3. **2.4: `/api/game/compute`** still uses client-sent state as the base for tick computation
4. **2.5: `/api/game/offline`** exists but only calculates ticks; needs POST handling to apply resources
5. **2.6: `/api/leaderboard/submit`** still uses client `gameState.totalMoneyEarned` for scoring
6. **2.7: GAME_LIMITS** still has loose constants (MAX_MONEY: 1e15)

### Known architectural limitation (cannot fix in this plan)

Even with all of Phase 2 complete, **the game tick itself still runs in the browser**. The client runs `gameTickAction` locally every tick — builds multipliers, computes production, applies to local Zustand state. The server only sees the result during auto-save (every 2 minutes via `/api/game/state`).

For 1,000 players, this is acceptable. For PvP or competitive integrity, you'd need:
- Server-side tick computation (server runs production for every active player periodically)
- WebSocket-based state sync (client is just a view layer)
- Expected value bounds (server knows theoretical max money given buildings + ticks)

These are Phase 7 (Server-Side Tick Validation) — adds 1-1.5 weeks of work.

---

## Phase 3 — Auth & API Route Hardening ⏳ NOT STARTED

**Goal:** Fix the C2/C3/C4/C5/C6 critical issues identified in the audit.

**Sub-tasks:**

| # | Task | Status | Estimated Time |
|---|---|---|---|
| 3.1 | Add `verifyAuthAndOwnership` to `/api/auth/migrate-guest` | ⏳ | 15 min |
| 3.2 | Add rate limiting to `/api/auth/migrate-guest` | ⏳ | 15 min |
| 3.3 | Sanitize `displayName` (already done in update-profile, extend to migrate-guest) | ⏳ | 10 min |
| 3.4 | Add mutex + error throwing to `signInWithGoogle` (prevent rapid-click double OAuth) | ⏳ | 30 min |
| 3.5 | Reset `initialLoadDone` ref on sign-out (in cloudSync/index.ts) | ⏳ | 20 min |
| 3.6 | Read `?auth=error` param on page load (already done in 1.5.5) | ✅ | — |
| 3.7 | Add ownership check to `/api/game/action` (require `userId` in body) | ⏳ | 20 min |
| 3.8 | Add `state_version` conflict check to `/api/player` POST | ⏳ | 30 min |
| 3.9 | Admin OAuth callback should query `admin_users` table | ⏳ | 30 min |

**Estimated total:** 1 week

---

## Phase 4 — Anti-Cheat Modernization ⏳ NOT STARTED

| # | Task | Status | Estimated Time |
|---|---|---|---|
| 4.1 | Replace `flagCheatAttempt` with atomic RPC call to `increment_cheat_flag` | ⏳ | 1 hour |
| 4.2 | Tighten `GAME_LIMITS` static bounds (MAX_MONEY 1e15 → lower based on actual max) | ⏳ | 30 min |
| 4.3 | Add nonce protection to action validation (prevent replay) | ⏳ | 2 hours |
| 4.4 | Add server-side timestamp to all save events | ⏳ | 1 hour |

**Estimated total:** 3 days

---

## Phase 5 — Production Hygiene ⏳ NOT STARTED

| # | Task | Status | Estimated Time |
|---|---|---|---|
| 5.1 | Add security headers (CSP, HSTS, X-Frame-Options) in `next.config.ts` | ⏳ | 1 hour |
| 5.2 | Remove `typescript.ignoreBuildErrors: true` (add `tsc --noEmit` to CI) | ⏳ | 30 min |
| 5.3 | Add `CHECKSUM_SECRET` startup guard (crash server if missing) | ⏳ | 20 min |
| 5.4 | Fix `admin.ts` to not query non-existent `is_active` column | ⏳ | 10 min |
| 5.5 | Reduce `GENEROSITY_MULTIPLIER` from 3 to 1.5 in `guestMigrationValidator.ts` | ⏳ | 10 min |

**Estimated total:** 2 days

---

## Phase 6 — Documentation & Process ⏳ NOT STARTED

| # | Task | Status | Estimated Time |
|---|---|---|---|
| 6.1 | Update `CLAIM_VERIFICATION_MATRIX.md` with Phase 0-1.5 verification commands | ⏳ | 2 hours |
| 6.2 | Update `MIGRATION_SAFETY_CHECKLIST.md` | ⏳ | 30 min |
| 6.3 | Update `MONITORING_PLAYBOOK.md` (cheat flags, pending links, rate limits) | ⏳ | 1 hour |
| 6.4 | Add `RELEASE_CHECKLIST.md` entries (is_game_admin, migrations tracked, window.__gameStore) | ⏳ | 1 hour |

**Estimated total:** 1 day

---

## What's NOT Complete

### From IMPLEMENTATION_PLAN.md (remaining)

1. **All of Phase 2** (7 sub-tasks) — the biggest remaining chunk
2. **All of Phase 3** (9 sub-tasks) — auth route hardening
3. **All of Phase 4** (4 sub-tasks) — anti-cheat
4. **All of Phase 5** (5 sub-tasks) — production hygiene
5. **All of Phase 6** (4 sub-tasks) — documentation
6. **MobileHeader/GameHeader** DropdownMenu replacement (1.5.6 partial — small)
7. **Custom JWT approach for anon user session creation** (deferred from 1.6 — known limitation)

### From PRODUCTION_SECURITY_AUDIT.md (remaining critical issues)

| Issue | Phase |
|---|---|
| C2 Server action validation is dead code (still true — `submitActionToServer` is called by `useMergeFlow` but not by store actions) | Phase 2 |
| `window.__gameStore` still exposed in production | Phase 2.1 |
| `/api/game/compute` and `/api/game/action` still trust client state | Phase 2.3, 2.4 |
| Offline progress still client-computed | Phase 2.5 |
| Leaderboard scoring still uses client values | Phase 2.6 |
| `flagCheatAttempt` still has TOCTOU race in app code | Phase 4.1 |
| No nonce for action replay protection | Phase 4.3 |
| No CSP/HSTS security headers | Phase 5.1 |
| `typescript.ignoreBuildErrors: true` still hides type errors | Phase 5.2 |
| `CHECKSUM_SECRET` has no startup crash | Phase 5.3 |

---

## File-by-File Status (new files this session)

### New API routes
- ✅ `src/app/api/auth/initialize-guest/route.ts`
- ✅ `src/app/api/auth/recover-by-device/route.ts`
- ✅ `src/app/api/auth/link-identity/route.ts`
- ✅ `src/app/api/auth/confirm-link/route.ts`
- ✅ `src/app/api/auth/update-profile/route.ts`

### New hooks
- ✅ `src/lib/hooks/useMergeFlow.ts`
- ✅ `src/lib/hooks/useSaveFreeze.ts`

### New helpers
- ✅ `src/lib/auth/guestCheck.ts`

### New components
- ✅ `src/components/game/AccountSettingsModal.tsx`

### Modified files
- ✅ `src/components/providers/AuthProvider.tsx` (Phase 1.1, 1.2)
- ✅ `src/components/game/LoginFloatingPanel.tsx` (Phase 1.5.3)
- ✅ `src/components/game/headers/DesktopHeader.tsx` (Phase 1.5.1, 1.5.6)
- ✅ `src/components/game/headers/MobileHeader.tsx` (Phase 1.5.1)
- ✅ `src/components/game/GameHeader.tsx` (Phase 1.5.1)
- ✅ `src/app/page.tsx` (Phase 1.5.5, 1.5.7, 1.5.6 wiring)
- ✅ `src/lib/hooks/page/useTabChange.ts` (Phase 1.5.4 bug fix)
- ✅ `src/app/api/game/trade/route.ts` (Phase 1.5.4 API gate)
- ✅ `src/app/api/game/trades/route.ts` (Phase 1.5.4 API gate)
- ✅ `src/app/api/leaderboard/route.ts` (Phase 1.5.4 API gate)
- ✅ `src/app/api/leaderboard/submit/route.ts` (Phase 1.5.4 API gate)

### New SQL migrations
- ✅ `supabase/migrations/018_admin_function_fix.sql`
- ✅ `supabase/migrations/019_dedup_triggers.sql`
- ✅ `supabase/migrations/020_profiles_and_guest_identities.sql`
- ✅ `supabase/migrations/021_merge_and_link_tables.sql`
- ✅ `supabase/migrations/022_uncommitted_functions.sql`
- ✅ `supabase/migrations/023_profiles_display_name.sql`

### New planning docs
- ✅ `planning/PRODUCTION_SECURITY_AUDIT.md`
- ✅ `planning/IMPLEMENTATION_PLAN.md`
- ✅ `planning/PHASE_1_5_AUDIT.md`
- ✅ `planning/IMPLEMENTATION_PROGRESS.md` (this file)
