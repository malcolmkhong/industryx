# Audit Fixes — 2026-06-18

## Source

Continuation of the comprehensive audit performed against `a:\industryx\industryx`
on 2026-06-18. Full audit report delivered in two parts (initial findings +
deeper audit addendum). This document tracks the **execution** of the P0
(Phase 1) fixes identified during the audit.

## Audit context

| Aspect | Value |
|---|---|
| Codebase | IndustriaX — Next.js 16.1 + React 19 idle game |
| Audit date | 2026-06-18 |
| Source files read | 60+ (~12,000 lines) |
| Audit method | Direct file reads (subagents unavailable — credit limit) |
| Phase 0 status | Database + capacity protection already in place from previous session |

## Prior state (from previous session)

- `supabase/migrations/040_capacity_and_waitlist.sql` applied to cloud
- `/api/capacity`, `/api/waitlist`, `/waitlist`, `WaitlistForm.tsx` exist
- `capacity.ts` created (with the line-9 broken import bug)
- Capacity gate added to `initialize-guest` (returns 503 + redirect)
- `AuthProvider` updated to handle 503 → push to `/waitlist`
- Admin monitoring API + page created

---

## P0 issues identified (Phase 1 work)

### #1 — Dead code path: `validation_warning` contract mismatch
- **Severity:** High (silent — looks wired but never fires)
- **Client:** [src/lib/hooks/cloudSync/useCloudSave.ts:99](src/lib/hooks/cloudSync/useCloudSave.ts) reads `data.validation_warning`
- **Server:** [src/app/api/game/state/route.ts:373](src/app/api/game/state/route.ts) returns `data.validation.{isValid, riskLevel, violations}` — no top-level `validation_warning` field
- **Root cause:** Refactor leftover — client was never updated when server response shape changed
- **Fix:** Update client to read `data.validation?.riskLevel` and surface a warning for `medium`/`high`/`critical` risk levels; surface `validation.violations` in the notification
- **Files to modify:**
  - `src/lib/hooks/cloudSync/useCloudSave.ts`

### #2 — `recover-by-device` does not actually establish a session
- **Severity:** Critical (users lose data on cookie clear)
- **File:** [src/app/api/auth/recover-by-device/route.ts](src/app/api/auth/recover-by-device/route.ts)
- **Root cause:** Comment in code explicitly admits "Supabase does not expose createSession for anon users. Session establishment requires client-side flow." — this is a known Phase 1.6 limitation never resolved.
- **Impact:** When user clears cookies, recovery endpoint returns `recoveredAs: 'recovered'` but the client has no valid session, so the user's `server_game_state` is invisible until they sign in anonymously again (which creates a new user)
- **Fix strategy:** Add a `claim-guest` flow:
  1. Client signs in anonymously (creates a new `auth.users` row with `is_anonymous=true`)
  2. Client calls a new `POST /api/auth/claim-guest` with the new `userId` + `deviceId`
  3. Server finds the old guest identity by `device_id`
  4. Server re-assigns `server_game_state`, `guest_identities`, and any other per-user rows to the new anon user
  5. Client now sees their old save
- **Files to create/modify:**
  - New: `src/app/api/auth/claim-guest/route.ts`
  - Modify: `src/components/providers/AuthProvider.tsx` (call claim-guest after anon sign-in if device-recovery hint exists)
  - Modify: `src/app/api/auth/recover-by-device/route.ts` (return `recoveredAs: 'claim_required'` for this flow)
- **Scope note:** This is a substantial change. Will implement the **minimal viable claim flow** and document any limitations.

### #3 — `link-identity` depends on a cookie that may be missing
- **Severity:** Critical (guest progress lost on Google sign-in after cookie clear)
- **File:** [src/app/api/auth/link-identity/route.ts:43](src/app/api/auth/link-identity/route.ts)
- **Root cause:** Reads `factory-dominion-guest-uid` cookie. If user has cleared cookies, the link returns `no_guest_to_link` and the guest state is silently abandoned.
- **Fix strategy:** Add a fallback: accept `deviceId` in the request body and query `guest_identities` by device_id to find the old guest user.
- **Files to modify:**
  - `src/app/api/auth/link-identity/route.ts`
- **Schema check:** `guest_identities.device_id` should already exist (confirmed in `recover-by-device` SELECT).

### #4 — `serverMarket` may be undefined on first render
- **Severity:** Medium (potential crash on MarketPanel first render)
- **File:** [src/lib/game/store.ts](src/lib/game/store.ts) — `createInitialState()`
- **Root cause:** The `serverMarket` field is set by `useServerMarket` polling; before the first poll completes (up to 10s), it may be undefined. The safe-guard at `getGlobalPrice` (line 52) uses `?.`, but other code paths may not.
- **Fix:** Initialize `serverMarket: { prices: [], news: [], tick: 0, volatility: 0 }` in `createInitialState()`.
- **Files to modify:**
  - `src/lib/game/store.ts`

### #5 — `not-found.tsx` missing for root and `/admin`
- **Severity:** Medium (bad UX on 404)
- **Files to create:**
  - `src/app/not-found.tsx`
  - `src/app/admin/not-found.tsx`
- **Fix:** Branded 404 page using existing design tokens (`bg-card`, `text-white`, `text-muted-label`)

### #6 — `error.tsx` boundaries for game and admin
- **Severity:** Medium (unhandled errors crash the whole tree)
- **Files to create:**
  - `src/app/error.tsx` (root boundary — note: already exists per `app/global-error.tsx` and `app/admin/error.tsx`)
  - `src/app/error.tsx` is missing — only `global-error.tsx` exists
- **Fix:** Create `src/app/error.tsx` (root error boundary). The `global-error.tsx` only fires when the root layout itself crashes.

### #7 — Cloudflare GraphQL uses legacy field names
- **Severity:** High (monitoring always shows 0 for CF metrics)
- **File:** [src/app/api/admin/monitoring/route.ts:44-60](src/app/api/admin/monitoring/route.ts)
- **Root cause:** Query uses `workersInvocationsAdaptive` and `aiInferenceAdaptiveGroupsByDate` (legacy). Current Cloudflare Analytics uses `workersInvocationsAdaptiveGroups` (note the `Groups` suffix and the distinct structure).
- **Fix:** Update the GraphQL query to use the current schema. Will use a simpler, more conservative query and document the version.
- **Files to modify:**
  - `src/app/api/admin/monitoring/route.ts`
- **Note:** Cannot test against the live API without a real `CLOUDFLARE_API_TOKEN`. Will add a clear comment explaining the schema and a fallback when the query returns 0.

---

## Phase 1 execution plan

```
Task #1 (P0-#1): Fix validation_warning contract mismatch
  - Read useCloudSave.ts in full
  - Update field reads to data.validation.{isValid, riskLevel, violations}
  - Surface riskLevel as a warning when medium/high/critical
  - Verify lint + types

Task #2 (P0-#4): Initialize serverMarket in createInitialState
  - Read store.ts createInitialState()
  - Find the serverMarket field initialization
  - Add safe defaults
  - Verify lint + types

Task #3 (P0-#5): Create not-found.tsx for / and /admin
  - Create src/app/not-found.tsx
  - Create src/app/admin/not-found.tsx
  - Branded 404 UI

Task #4 (P0-#6): Create error.tsx boundary
  - Create src/app/error.tsx
  - Root error boundary with branded UI

Task #5 (P0-#7): Fix Cloudflare GraphQL field names
  - Update src/app/api/admin/monitoring/route.ts
  - Use current schema (workersInvocationsAdaptiveGroups)
  - Document the version
  - Add fallback handling

Task #6 (P0-#3): Fix link-identity to accept deviceId fallback
  - Modify src/app/api/auth/link-identity/route.ts
  - Accept deviceId in body
  - Query guest_identities by device_id as fallback
  - Document the change

Task #7 (P0-#2): Implement claim-guest recovery flow
  - Create src/app/api/auth/claim-guest/route.ts
  - Modify AuthProvider.tsx to call it after anon sign-in
  - Modify recover-by-device to return claim_required hint
  - Document any limitations
```

## Out of scope for Phase 1 (deferred to P1+)

- Mobile admin sidebar (`pl-0 lg:pl-[240px]`)
- `<a href>` → `<Link>` in admin pages
- Tailwind v4 two-segment opacity class fixes (151 hits)
- Test refactor to import real modules
- `useGameStore` (3,637 lines) split into domain stores
- `data.ts` (203KB) lazy-load
- Dead dep removal (`@tanstack/react-query`, `vaul`, possibly `embla-carousel-react`, `recharts`)

## Verification after Phase 1

- `npm run lint` — no new errors
- `npx tsc --noEmit` — no new errors
- Smoke test:
  - `GET /api/admin/monitoring` returns valid JSON (admin-only)
  - `GET /nonexistent` shows branded 404
  - `POST /api/auth/link-identity` with deviceId body works
- Browser: visit `/`, `/admin`, navigate, confirm no regressions
