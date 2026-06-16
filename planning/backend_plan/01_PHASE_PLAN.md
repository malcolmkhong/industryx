# Admin Backend Restructure — Phase Plan

**Date:** 2026-06-16
**Companion Doc:** [00_AUDIT_REPORT.md](./00_AUDIT_REPORT.md)
**Format:** Sequential phases, each with checkboxes, status, and per-task detail

---

## Legend

| Status | Meaning |
|---|---|
| `[ ]` | Not started |
| `[~]` | In progress |
| `[x]` | Complete |
| `[!]` | Blocked |
| `[-]` | Cancelled / out of scope |

| Priority | Severity |
|---|---|
| **P0** | Critical — production blocker |
| **P1** | High — should fix in restructure |
| **P2** | Medium — polish |
| **P3** | Low — future |

---

## Phase 2A — Security Blockers (P0)

**Goal:** Close all 6 critical security gaps. Estimated: 1-2 days. Must complete before any other admin work.

### Task 2A.1 — Create `/admin/forbidden` page
- **Status:** `[x]` — Done (`ab131a9`)
- **Severity:** P0 — Critical
- **Location:** `src/app/admin/forbidden/page.tsx` (does not exist)
- **Why:** Auth callback at `src/app/admin/auth/callback/route.ts:36` redirects to `/admin/forbidden` when a user authenticates via Google but is not in the `admin_users` table or `ADMIN_UIDS` env. Currently 404.
- **Required features:**
  - Display "Access Denied" message
  - Show authenticated user's email
  - Link back to `/admin/login` (sign out + retry)
  - Link to player game (`/`)
  - Use same visual design as login page
- **Verification:**
  - Trigger redirect (sign in with non-admin Google account)
  - Confirm page loads with 200
  - Confirm "Sign out" button calls `supabase.auth.signOut()` and redirects to `/admin/login`
- **Files to create:**
  - `src/app/admin/forbidden/page.tsx`

### Task 2A.2 — Add `verifyAdmin()` to `/api/config` (root)
- **Status:** `[x]` — Done (`ab131a9`)
- **Severity:** P0 — Critical
- **Location:** `src/app/api/config/route.ts:27-65`
- **Why:** The top-level `/api/config` GET handler returns table lists and data for all 19 `game_config_*` tables using the service role client. No admin auth check. Public read of game economy data.
- **Required changes:**
  - Import `verifyAdmin` from `@/lib/auth/admin`
  - Call at top of GET handler
  - Return `authResult.error` on failure
- **Verification:**
  - `curl http://localhost:3000/api/config` without auth → 401
  - `curl -H "Cookie: sb-..." http://localhost:3000/api/config` as non-admin → 403
  - `curl -H "Cookie: sb-..." http://localhost:3000/api/config` as admin → 200
- **Files to modify:**
  - `src/app/api/config/route.ts`

### Task 2A.3 — Revoke `authenticated` grant on `increment_cheat_flag` RPC
- **Status:** `[x]` — Done (`ab131a9`)
- **Severity:** P0 — Critical
- **Location:** Supabase migration `012_atomic_cheat_flag.sql` (line ~127)
- **Why:** Function takes `p_user_id` as parameter and does NOT check `auth.uid()` against target. Any logged-in user can flag any other user. DoS/harassment vector.
- **Required changes:**
  - New migration: `031_revoke_increment_cheat_flag_from_authenticated.sql`
  - `REVOKE EXECUTE ON FUNCTION public.increment_cheat_flag FROM authenticated;`
  - `GRANT EXECUTE ON FUNCTION public.increment_cheat_flag TO service_role;`
  - Update `src/lib/auth/gameStateValidator.ts` to use service role client when calling this RPC
  - Update `src/app/api/cron/validate-ticks/route.ts` to use service role client (already does)
- **Verification:**
  - Sign in as player A, call `supabase.rpc('increment_cheat_flag', { p_user_id: '<player-B-uuid>', ... })` → 403 / permission denied
  - Service role call still works
- **Files to create / modify:**
  - `supabase/migrations/031_revoke_increment_cheat_flag_from_authenticated.sql` (NEW)
  - `src/lib/auth/gameStateValidator.ts` (use service role for this RPC)

### Task 2A.4 — Add `super_admin` guard to `POST /api/admins`
- **Status:** `[x]` — Done (`ab131a9`)
- **Severity:** P0 — Critical
- **Location:** `src/app/api/admins/route.ts:91-173`
- **Why:** Any admin (including `viewer`) can add another admin. Self-promotion to `super_admin` possible. No role check.
- **Required changes:**
  - Import `getAdminRole` from `@/lib/auth/admin-helpers`
  - After `verifyAdmin()`, check `getAdminRole(authResult.admin)`
  - Reject with 403 if `role !== 'super_admin'`
  - Same check on `DELETE /api/admins/[id]`
  - Add `requireRole('super_admin')` helper to `admin-helpers.ts`
- **Verification:**
  - Sign in as `admin` role, POST `/api/admins` → 403
  - Sign in as `super_admin`, POST `/api/admins` → 201
  - Sign in as `viewer`, DELETE `/api/admins/[id]` → 403
- **Files to modify:**
  - `src/app/api/admins/route.ts`
  - `src/app/api/admins/[id]/route.ts`
  - `src/lib/auth/admin-helpers.ts` (add `requireRole`)

### Task 2A.5 — Add audit logging to config table writes
- **Status:** `[x]` — Done (`ab131a9`)
- **Severity:** P0 — Critical
- **Location:** `src/app/api/config/[table]/route.ts` POST, `src/app/api/config/[table]/[id]/route.ts` PUT/DELETE
- **Why:** Game config changes are untraceable. No record of who changed what, when, or what the old value was.
- **Required changes:**
  - Import `logAdminAction` from `@/lib/auth/admin-helpers`
  - On POST: log `action_type: 'edit_state'` (or new `'create_config_row'`) with table name + new row
  - On PUT: log `action_type: 'edit_state'` with table name + row id + before/after diff
  - On DELETE: log `action_type: 'edit_state'` (or new `'delete_config_row'`) with table name + row id
  - Add new action types to migration `006_admin_moderation_system.sql` CHECK constraint (or create new migration)
- **Verification:**
  - PUT a config row → `admin_actions` has new entry with `action_type='edit_state'`, `details.json` contains table + row + before/after
  - DELETE a config row → `admin_actions` has new entry
  - POST a new row → `admin_actions` has new entry
- **Files to modify:**
  - `src/app/api/config/[table]/route.ts`
  - `src/app/api/config/[table]/[id]/route.ts`
  - `supabase/migrations/032_add_config_action_types.sql` (NEW — extend CHECK constraint)
  - `src/lib/auth/admin-helpers.ts` (add new action types)

### Task 2A.6 — Add audit logging to admin management
- **Status:** `[x]` — Done (`ab131a9`)
- **Severity:** P0 — Critical
- **Location:** `src/app/api/admins/route.ts` POST, `src/app/api/admins/[id]/route.ts` DELETE
- **Why:** Admin user add/remove operations are untraceable. No record of who added/removed which admin.
- **Required changes:**
  - On POST `/api/admins`: log `action_type: 'add_admin'` with `target_user_id` + role
  - On DELETE `/api/admins/[id]`: log `action_type: 'remove_admin'` with `target_user_id`
  - Add new action types to admin_actions CHECK constraint
- **Verification:**
  - Add admin → `admin_actions` has new entry with `action_type='add_admin'`
  - Remove admin → `admin_actions` has new entry with `action_type='remove_admin'`
- **Files to modify:**
  - `src/app/api/admins/route.ts`
  - `src/app/api/admins/[id]/route.ts`
  - `supabase/migrations/032_add_admin_action_types.sql` (NEW)

### Task 2A.7 — Fix `X-RateLimit-Remaining` hardcoded value
- **Status:** `[x]` — Done (`ab131a9`)
- **Severity:** P0 — Critical
- **Location:** `src/lib/auth/admin.ts:124-135`
- **Why:** `withSecurityHeaders()` sets `X-RateLimit-Remaining: 99` regardless of actual usage. Misleading clients. Potential security audit issue.
- **Required changes:**
  - Either:
    - (A) Remove the `X-RateLimit-Remaining` header entirely (since we don't track it)
    - (B) Implement actual rate limit tracking per-admin and return real remaining count
  - Recommend (A) for P0; (B) when rate limiting is added in P1
- **Verification:**
  - `curl -I http://localhost:3000/api/admin/stats` → no `X-RateLimit-Remaining` header (or accurate value)
- **Files to modify:**
  - `src/lib/auth/admin.ts`

### Task 2A.8 — Flush in-memory admin cache on admin add/remove
- **Status:** `[x]` — Done (`ab131a9`)
- **Severity:** P0 — Critical
- **Location:** `src/lib/auth/admin.ts:18-20` (cache), `src/app/api/admins/route.ts` (no flush)
- **Why:** `isAdminUserDb()` caches all admin IDs for 60s. Adding/removing an admin takes up to 60s to propagate. Stale authorization.
- **Required changes:**
  - Export `clearAdminCache()` from `src/lib/auth/admin.ts`
  - Call from `POST /api/admins` after successful insert
  - Call from `DELETE /api/admins/[id]` after successful delete
  - Also flush `is_game_admin()` in-memory state if any (currently RPC, so no cache)
- **Verification:**
  - Add admin → within 1s, the new admin can call `/api/admin/stats` and get 200
  - Remove admin → within 1s, the removed admin gets 403
- **Files to modify:**
  - `src/lib/auth/admin.ts` (export `clearAdminCache`)
  - `src/app/api/admins/route.ts` (call after insert)
  - `src/app/api/admins/[id]/route.ts` (call after delete)

---

## Phase 2B — Refactor + System Status (P1)

**Goal:** Eliminate code duplication, normalize API paths, build 3 high-priority new pages. Estimated: 3-4 days.

### Task 2B.1 — Create `src/app/admin/layout.tsx` (Compact Navigation Tree Sidebar)
- **Status:** `[x]` — Done (`ce51b3d`)
- **Severity:** P1 — High
- **Why:** 3,150 lines of sidebar/header duplication across 7 pages. Maintenance burden. The current per-page sidebar is a flat list — doesn't scale to 14+ admin pages.
- **Required features:**
  - Server-side `verifyAdmin()` (use `createServerClient` from `@/lib/supabase/server`)
  - If not admin → redirect to `/admin/login` (middleware already does this, but defense-in-depth)
  - Render `<AdminNavigationTree>` + `<AdminHeader>` + `{children}`
  - Use `getAdminRole()` to show/hide write actions and entire tree branches
  - Include toast provider (Sonner from `@/components/ui/sonner`)
  - **Sidebar style: Compact Navigation Tree** (see spec below)
- **Compact Navigation Tree Design Spec:**
  - **Layout:** Vertical tree, fixed left column (240px wide, collapsible to 64px icon-only)
  - **Density:** Compact — 32px row height, 8px horizontal padding, 12px icon-label gap
  - **Hierarchy:** Up to 3 levels deep (Group → Category → Page)
  - **Visual style:**
    - Indentation: 16px per level (compact vs 24px standard)
    - Group headers: 11px uppercase tracking-wide, muted color, no icon, sticky
    - Category rows: 13px medium weight, chevron rotates on expand
    - Page rows: 13px regular weight, icon + label, indented under category
    - Active page: 2px left border (primary color) + subtle background tint
    - Hover: subtle background tint
  - **Behavior:**
    - Expand/collapse state persisted in `localStorage` (key: `admin-nav-expanded`)
    - Multiple groups can be expanded simultaneously
    - Current page's parent groups auto-expand on first load
    - Smooth height transition (200ms ease-in-out) on expand/collapse
    - Click row to navigate, click chevron to toggle expand
  - **Badges:** Right-aligned slot per row (e.g., "5" badge for open investigations)
  - **Keyboard nav:** Arrow keys to move focus, Enter to activate, Space to toggle expand
  - **Tree structure (default expanded):**
    ```
    OVERVIEW
    ├─ Dashboard                  [icon: LayoutDashboard]
    └─ System Status              [icon: Activity]  [badge: live dot]
    
    PLAYERS
    ├─ Player List                [icon: Users]
    └─ Compare                    [icon: GitCompare]  [P2]
    
    INVESTIGATIONS
    ├─ Queue                      [icon: AlertTriangle]  [badge: count]
    └─ Reports                    [icon: Flag]  [P2]
    
    ACTIONS
    ├─ Player Audit               [icon: ScrollText]
    ├─ Admin Audit                [icon: ShieldCheck]
    └─ Export                     [icon: Download]  [P2]
    
    OPERATIONS
    ├─ Jobs                       [icon: Cog]  [P1]
    ├─ Market                     [icon: TrendingUp]  [P1]
    └─ Economy                    [icon: BarChart3]  [P2]
    
    CONFIGURATION
    ├─ Config Tables              [icon: Database]
    └─ Roles                      [icon: KeyRound]  [P2]
    
    ADMIN
    ├─ Admin Users                [icon: UserCog]
    ├─ Permissions                [icon: Lock]  [P3]
    └─ Support                    [icon: LifeBuoy]  [P3]
    ```
- **Files to create:**
  - `src/app/admin/layout.tsx`
  - `src/components/admin/AdminNavigationTree.tsx` (the tree sidebar)
  - `src/components/admin/AdminHeader.tsx`
  - `src/components/admin/NavigationTreeNode.tsx` (recursive tree node component)
  - `src/components/admin/NavigationTreeGroup.tsx` (group header)
  - `src/lib/admin/navTree.ts` (tree data + role-based filtering)
- **Files to modify (remove duplicated code):**
  - `src/app/admin/page.tsx` (remove sidebar/header JSX, ~400 lines)
  - `src/app/admin/players/page.tsx` (remove sidebar/header JSX)
  - `src/app/admin/players/[id]/page.tsx` (remove sidebar/header JSX)
  - `src/app/admin/investigations/page.tsx` (remove sidebar/header JSX)
  - `src/app/admin/audit/page.tsx` (remove sidebar/header JSX)
  - `src/app/admin/admin-audit/page.tsx` (remove sidebar/header JSX)
  - `src/app/admin/config/page.tsx` (remove sidebar/header JSX)
  - `src/app/admin/admins/page.tsx` (remove sidebar/header JSX)
  - **Estimated reduction:** 3,150 → ~300 lines per page

### Task 2B.2 — Create `src/app/admin/loading.tsx` and `src/app/admin/error.tsx`
- **Status:** `[x]` — Done (`ce51b3d`)
- **Severity:** P1 — High
- **Why:** Every page handles loading/error client-side, causing flash of spinner. No error boundary.
- **Required features:**
  - `loading.tsx`: Branded spinner with admin layout skeleton
  - `error.tsx`: Admin-styled error page with "Try again" button (`reset()`)
- **Files to create:**
  - `src/app/admin/loading.tsx`
  - `src/app/admin/error.tsx`

### Task 2B.3 — Move `/api/admins/*` to `/api/admin/admins/*`
- **Status:** `[x]` — Done (`8489296`)
- **Severity:** P1 — High
- **Why:** Architectural inconsistency. All other admin APIs under `/api/admin/*`.
- **Required changes:**
  - Create `src/app/api/admin/admins/route.ts` (copy from `/api/admins/route.ts`)
  - Create `src/app/api/admin/admins/[id]/route.ts` (copy from `/api/admins/[id]/route.ts`)
  - Update `src/app/admin/admins/page.tsx` to call new paths
  - **Keep** old `/api/admins/*` for 1 release as deprecated, then remove
- **Files to create:**
  - `src/app/api/admin/admins/route.ts`
  - `src/app/api/admin/admins/[id]/route.ts`
- **Files to modify:**
  - `src/app/admin/admins/page.tsx` (3 fetch calls)

### Task 2B.4 — Remove duplicate `/api/config` (root)
- **Status:** `[x]` — Done (`8489296`)
- **Severity:** P1 — High
- **Why:** `/api/config` (root) duplicates `/api/tables` functionality but with different response format. Not called by config page.
- **Required changes:**
  - Verify no external consumer calls `/api/config` (root path)
  - Delete `src/app/api/config/route.ts`
  - Keep `src/app/api/config/[table]/route.ts` and `[id]/route.ts`
- **Files to delete:**
  - `src/app/api/config/route.ts`

### Task 2B.5 — Create `src/components/admin/` shared library
- **Status:** `[~]` — Partial (`ce51b3d`): tree components + AdminHeader done; DataTable, Pagination, ConfirmModal, StatusBadge, EmptyState pending
- **Severity:** P1 — High
- **Components to create:**
  - `AdminIcons.tsx` — extracted from inline SVGs in 7 pages
  - `AdminNavigationTree.tsx` — compact navigation tree sidebar (see 2B.1 design spec)
  - `NavigationTreeNode.tsx` — recursive tree node (handles expand/collapse/active state)
  - `NavigationTreeGroup.tsx` — group header (sticky, muted)
  - `DataTable.tsx` — generic table with sort/paginate
  - `Pagination.tsx` — generic pagination control
  - `ConfirmModal.tsx` — generic confirmation dialog
  - `StatusBadge.tsx` — generic status badge (color-coded)
  - `AdminEmptyState.tsx` — generic empty state
  - `AdminToast.tsx` — toast helpers (or just use Sonner directly)
- **Files to create:**
  - `src/components/admin/AdminIcons.tsx`
  - `src/components/admin/AdminNavigationTree.tsx`
  - `src/components/admin/NavigationTreeNode.tsx`
  - `src/components/admin/NavigationTreeGroup.tsx`
  - `src/components/admin/DataTable.tsx`
  - `src/components/admin/Pagination.tsx`
  - `src/components/admin/ConfirmModal.tsx`
  - `src/components/admin/StatusBadge.tsx`
  - `src/components/admin/AdminEmptyState.tsx`
  - `src/lib/admin/navTree.ts` (tree data + role-based visibility filter)

### Task 2B.6 — Add admin entrance in game UI
- **Status:** `[x]` — Done (`8489296`)
- **Severity:** P1 — High
- **Why:** Admin users have no way to discover the admin panel from the game UI.
- **Required changes:**
  - Add `isAdminUserDb()` check to `src/components/game/GameSidebar.tsx` (or `BottomNavigationBar.tsx`)
  - Show "Admin" link if true
  - Place in system/settings group
  - Use `Shield` icon from lucide-react
- **Files to modify:**
  - `src/components/game/GameSidebar.tsx`
  - `src/components/game/GameSidebar.tsx` (add shield icon link to NAV_GROUPS)
- **Alternative:** Add to `FloatingActionButton.tsx` shortcuts (gated by admin check)

### Task 2B.7 — Build `/admin/system-status` page
- **Status:** `[x]` — Done (`fb1be07`)
- **Severity:** P1 — High
- **New page**
- **Route:** `/admin/system-status`
- **Data sources:**
  - `/api/health` — Supabase DB connectivity
  - Cloudflare `markettick` worker — last tick from `server_market_state.updated_at`
  - Cloudflare `newsgenerator` worker — last successful news generation
  - `validate-ticks` cron — last run timestamp from logs or new `system_health` table
  - `useAdminPresence` — online admins
  - `/api/admin/stats` — admin user count, active investigations
- **Required features:**
  - Overall health banner (green/yellow/red)
  - Service status grid: Supabase, Cloudflare Worker, Cloudflare Cron, AI Provider, DB, Auth
  - Cron jobs table: name, last run, next run, duration, success rate, failure count
  - Internal APIs table: endpoint, response time, error rate
  - Alerts section: offline services, failed jobs, elevated errors
  - Actions: "Run Health Check", "Retry Failed Job", "Force Job Execution"
- **Files to create:**
  - `src/app/admin/system-status/page.tsx`
  - `src/app/api/admin/system-status/route.ts` (aggregates all status sources)
  - `src/app/api/admin/system-status/refresh/route.ts` (force refresh)
  - `supabase/migrations/033_create_system_health_table.sql` (track last run timestamps)

### Task 2B.8 — Build `/admin/jobs` page
- **Status:** `[x]` — Done (`fb1be07`)
- **Severity:** P1 — High
- **New page**
- **Route:** `/admin/jobs`
- **Data sources:**
  - New `admin_jobs_history` table
  - Cloudflare worker schedules (from `wrangler.toml`)
  - `validate-ticks` cron (last run from logs)
- **Required features:**
  - List of all jobs: markettick, newsgenerator, validate-ticks, cleanup-rate-limits
  - Each job: status, last run, next run, duration, success rate, failure count, last error
  - "Run Now" button (calls manual trigger endpoint)
  - "View History" drill-down
- **Files to create:**
  - `src/app/admin/jobs/page.tsx`
  - `src/app/api/admin/jobs/route.ts` (list jobs)
  - `src/app/api/admin/jobs/run/route.ts` (manual trigger)
  - `supabase/migrations/034_create_admin_jobs_history_table.sql`

### Task 2B.9 — Build `/admin/market` page
- **Status:** `[x]` — Done (`fb1be07`)
- **Severity:** P1 — High
- **New page**
- **Route:** `/admin/market`
- **Data sources:**
  - `server_market_state` — current prices, volatility, circuit breakers
  - `game_config_market` — base prices, config
  - `market_player_pressure` — current pending pressure
- **Required features:**
  - Market status overview: tick, last update, total volume
  - Asset table: resource, current price, base price, % change, volume, circuit breaker state
  - Recent market events (news)
  - Controls: "Override Price" (super_admin), "Inject Event" (super_admin), "Clear Circuit Breaker" (super_admin), "Force Tick" (admin)
  - Real-time updates via Supabase Realtime subscription to `server_market_state`
- **Files to create:**
  - `src/app/admin/market/page.tsx`
  - `src/app/api/admin/market/state/route.ts` (GET current state)
  - `src/app/api/admin/market/override/route.ts` (POST override)
  - `src/app/api/admin/market/force-tick/route.ts` (POST force)

### Task 2B.10 — Add `PUT /api/admin/admins/[id]/role` endpoint
- **Status:** `[x]` — Done (`8489296`)
- **Severity:** P1 — High
- **Why:** No way to change an admin's role. Must delete and re-add.
- **Required features:**
  - Body: `{ role: 'viewer' | 'admin' | 'super_admin' }`
  - Auth: super_admin only
  - Log to `admin_actions` (action_type='change_admin_role')
  - Validate target admin exists
  - Prevent self-demotion from super_admin if last one
- **Files to create:**
  - `src/app/api/admin/admins/[id]/role/route.ts`
- **Files to modify:**
  - `src/app/admin/admins/page.tsx` (add role change UI)

---

## Phase 2C — New Features + Polish (P2)

**Goal:** Build 3 medium-priority new pages, fix polish issues, improve performance. Estimated: 3-5 days.

### Task 2C.1 — Build `/admin/economy` page
- **Status:** `[ ]`
- **Severity:** P2 — Medium
- **New page**
- **Route:** `/admin/economy`
- **Data sources:**
  - `player_actions` — transaction log
  - `server_market_state` — market volume
  - `game_config_*` — economy config
- **Required features:**
  - Currency flow chart (money in vs out per day)
  - Reward grants log (daily_rewards, achievements, contracts)
  - Transaction review (filter by user, amount, action type)
  - Economy analytics: top earners, money velocity, inflation rate
- **Files to create:**
  - `src/app/admin/economy/page.tsx`
  - `src/app/api/admin/economy/overview/route.ts`
  - `src/app/api/admin/economy/transactions/route.ts`

### Task 2C.2 — Build `/admin/reports` page
- **Status:** `[ ]`
- **Severity:** P2 — Medium
- **New page**
- **Route:** `/admin/reports`
- **Data sources:**
  - New `admin_reports` table
  - `cheat_investigations` (linked)
  - `player_actions` (evidence)
- **Required features:**
  - Report queue: abuse, fraud, harassment, exploit
  - Linked evidence (player_actions, game state snapshots)
  - Status: open, investigating, resolved, dismissed
  - Resolution workflow: take action on linked player, dismiss, escalate
- **Files to create:**
  - `src/app/admin/reports/page.tsx`
  - `src/app/api/admin/reports/route.ts`
  - `src/app/api/admin/reports/[id]/route.ts`
  - `src/app/api/admin/reports/[id]/resolve/route.ts`
  - `supabase/migrations/035_create_admin_reports_table.sql`

### Task 2C.3 — Build `/admin/support` page (P3)
- **Status:** `[ ]`
- **Severity:** P2 — Medium
- **New page**
- **Route:** `/admin/support`
- **Data sources:**
  - New `admin_tickets` table
- **Required features:**
  - Ticket queue
  - Player appeals
  - User requests (account recovery, name change)
  - Resolution workflow
  - Email integration (Phase 2D)
- **Files to create:**
  - `src/app/admin/support/page.tsx`
  - `src/app/api/admin/support/route.ts`
  - `src/app/api/admin/support/[id]/route.ts`
  - `supabase/migrations/036_create_admin_tickets_table.sql`

### Task 2C.4 — DB-side player search (replace in-memory filter)
- **Status:** `[ ]`
- **Severity:** P2 — Medium
- **Location:** `src/app/api/admin/players/route.ts:131-155`
- **Why:** Current code fetches ALL auth users via `supabase.auth.admin.listUsers()` and filters in memory. Performance issue at scale.
- **Required changes:**
  - Use Supabase admin `listUsers({ page, perPage })` with `emailFilter` parameter (if available)
  - Or query `auth.users` via service role with proper WHERE clause
  - Implement pagination at the DB level
  - Add `email` column to `server_game_state` (denormalized, sync on auth users change) for indexed search
  - Or use `player_progress.display_name` for search
- **Files to modify:**
  - `src/app/api/admin/players/route.ts`

### Task 2C.5 — Per-endpoint rate limiting on admin APIs
- **Status:** `[ ]`
- **Severity:** P2 — Medium
- **Why:** Admin endpoints have no per-endpoint rate limiting. DoS risk.
- **Required changes:**
  - Add `checkRateLimit()` call to all admin API routes
  - Use `admin` rate limit profile (new): 100 req/min per admin user
  - Use `RATE_LIMITS.admin` constant
  - Add to `src/lib/auth/rateLimiter.ts`
- **Files to modify:**
  - `src/lib/auth/rateLimiter.ts` (add `admin` profile)
  - All `src/app/api/admin/*/route.ts` files

### Task 2C.6 — Fix `as any` casts
- **Status:** `[ ]`
- **Severity:** P2 — Medium
- **Locations:**
  - `src/app/api/config/route.ts:46` — `if (!ALLOWED_TABLES.includes(table as any))`
  - `src/lib/game/store.ts:538` — `state.buildings = migrateSaveBuildings(state.buildings as any[]);`
- **Required changes:**
  - Define proper types: `type AllowedTable = keyof typeof TABLE_CONFIGS`
  - Use type guard functions
  - For `store.ts`, properly type the migration function
- **Files to modify:**
  - `src/app/api/config/route.ts`
  - `src/lib/game/store.ts`

### Task 2C.7 — Add CSV export for admin audit log
- **Status:** `[ ]`
- **Severity:** P2 — Medium
- **New endpoint:** `GET /api/admin/audit/export?format=csv&date_from=...&date_to=...`
- **Required features:**
  - Generate CSV from `admin_actions` table
  - Stream response (don't buffer in memory)
  - Log export to `admin_actions` (action_type='export_audit_log')
  - Permission: viewer+ can export
- **Files to create:**
  - `src/app/api/admin/audit/export/route.ts`
- **Files to modify:**
  - `src/app/admin/admin-audit/page.tsx` (add "Export CSV" button)
  - `supabase/migrations/032_add_export_action_types.sql` (add 'export_audit_log' to CHECK)

### Task 2C.8 — Rename audit routes for consistency
- **Status:** `[ ]`
- **Severity:** P2 — Medium
- **Why:** `/admin/audit` (Player Actions) and `/admin/admin-audit` (Admin Actions) have confusing names.
- **Required changes:**
  - Move `src/app/admin/audit/page.tsx` → `src/app/admin/actions/player/page.tsx`
  - Move `src/app/admin/admin-audit/page.tsx` → `src/app/admin/actions/admin/page.tsx`
  - Update sidebar nav labels: "Player Actions" → "Player Audit", "Admin Actions" → "Admin Audit"
  - Add redirects from old paths to new (for backward compat)
- **Files to create:**
  - `src/app/admin/actions/player/page.tsx`
  - `src/app/admin/actions/admin/page.tsx`
- **Files to delete:**
  - `src/app/admin/audit/page.tsx`
  - `src/app/admin/admin-audit/page.tsx`
- **Files to modify:**
  - `src/components/admin/AdminNavigationTree.tsx` (nav items + group labels)

---

## Phase 2D — Future (P3)

**Goal:** Long-term improvements. Estimated: TBD.

### Task 2D.1 — Email integration for support tickets
- **Status:** `[ ]`
- **Severity:** P3 — Low
- **Why:** Players currently have no way to contact admins.
- **Required features:**
  - Email intake form on player side
  - Auto-create ticket in `admin_tickets`
  - Email notifications to admins
  - Player reply via email
- **Files to create:**
  - `src/app/api/email/ticket-intake/route.ts`
  - `src/app/api/email/ticket-reply/route.ts`
  - Email template files

### Task 2D.2 — CSRF tokens for mutating endpoints
- **Status:** `[ ]`
- **Severity:** P3 — Low
- **Why:** Defense-in-depth against CSRF attacks.
- **Required changes:**
  - Generate CSRF token in layout
  - Include in meta tag + cookie
  - Validate on POST/PUT/DELETE in API routes
  - Skip for API routes using Bearer auth
- **Files to create:**
  - `src/lib/auth/csrf.ts`
  - `src/middleware.ts` (add CSRF validation)

### Task 2D.3 — Advanced RBAC (custom roles per page)
- **Status:** `[ ]`
- **Severity:** P3 — Low
- **Why:** Current 3-role model (viewer/admin/super_admin) is coarse. Some admins should only access specific pages.
- **Required changes:**
  - Add `admin_permissions` table (admin_user_id, permission)
  - Permission values: `view_players`, `lock_players`, `edit_config`, `manage_admins`, `view_audit`, `manage_market`, etc.
  - Update `verifyAdmin()` to check permissions
  - Add permission management UI in `/admin/admins`
- **Files to create:**
  - `supabase/migrations/037_create_admin_permissions_table.sql`
  - `src/lib/auth/permissions.ts`
  - `src/app/admin/admins/permissions/page.tsx`

---

## Cross-Cutting Items (Nice-to-Have / P2)

### Task CC.1 — Fix empty catch blocks (3 locations)
- **Status:** `[ ]`
- **Severity:** P2 — Medium
- **Locations:**
  - `src/lib/auth/admin-helpers.ts:76-78` — `logAdminAction` catch silently logs
  - `src/lib/auth/admin.ts:64-66` — admin_users query catch silently warns
  - `src/app/admin/config/page.tsx:562-564` — `refreshTableCounts` silently ignores
- **Required changes:**
  - Add user-facing error toast
  - Send error to logging endpoint
  - Or re-throw if operation is critical
- **Files to modify:**
  - `src/lib/auth/admin-helpers.ts`
  - `src/lib/auth/admin.ts`
  - `src/app/admin/config/page.tsx`

### Task CC.2 — Cache `/api/admin/stats` response
- **Status:** `[ ]`
- **Severity:** P2 — Medium
- **Why:** Stats endpoint called by dashboard + players page. Duplicate queries if user navigates between them.
- **Required changes:**
  - Add `Cache-Control: private, max-age=30` to `/api/admin/stats` response
  - Or use SWR/React Query on client to dedupe
- **Files to modify:**
  - `src/app/api/admin/stats/route.ts`

### Task CC.3 — Fix investigations stats to be server-computed
- **Status:** `[ ]`
- **Severity:** P2 — Medium
- **Location:** `src/app/admin/investigations/page.tsx:350-358`
- **Why:** "Resolved Today" stat is computed client-side from current page of results only. Misleading.
- **Required changes:**
  - Add `resolved_today` field to `GET /api/admin/investigations` response
  - Server-side SQL: `COUNT(*) WHERE status IN ('resolved', 'dismissed') AND resolved_at >= today`
- **Files to modify:**
  - `src/app/api/admin/investigations/route.ts`
  - `src/app/admin/investigations/page.tsx` (use server-computed value)

### Task CC.4 — Add loading skeletons to admin tables
- **Status:** `[ ]`
- **Severity:** P2 — Medium
- **Why:** Current "Loading..." text is jarring. Skeleton UI is better UX.
- **Required changes:**
  - Create `<TableSkeleton>` in `src/components/admin/`
  - Use in all admin pages during data fetch
- **Files to create:**
  - `src/components/admin/TableSkeleton.tsx`
- **Files to modify:**
  - All admin pages with tables

### Task CC.5 — Improve error messages on failed admin actions
- **Status:** `[ ]`
- **Severity:** P2 — Medium
- **Why:** Generic "Failed to load" messages don't help admins diagnose issues.
- **Required changes:**
  - API routes return structured error: `{ error: code, message: user_message, details: technical }`
  - Client displays `message` to user, logs `details` to console
- **Files to modify:**
  - All admin API routes (standardize error response)
  - All admin pages (display error.message)

### Task CC.6 — Add admin command palette (Cmd+K)
- **Status:** `[ ]`
- **Severity:** P2 — Medium
- **Why:** Power-user feature. Quick navigation between admin pages.
- **Required changes:**
  - Add `cmdk` package (or build custom)
  - Command palette mounted in admin layout
  - Commands: Navigate to [page], Search player by ID, Run job [name], etc.
- **Files to create:**
  - `src/components/admin/CommandPalette.tsx`
- **Files to modify:**
  - `src/app/admin/layout.tsx`

### Task CC.7 — Add bulk actions to player list
- **Status:** `[ ]`
- **Severity:** P2 — Medium
- **Why:** Currently can only act on one player at a time.
- **Required features:**
  - Multi-select checkboxes in player list
  - Bulk lock, bulk unlock, bulk send notification
  - Confirm dialog with player count
- **Files to create:**
  - `src/app/api/admin/players/bulk-lock/route.ts`
  - `src/app/api/admin/players/bulk-notify/route.ts`
- **Files to modify:**
  - `src/app/admin/players/page.tsx`

### Task CC.8 — Add player comparison view
- **Status:** `[ ]`
- **Severity:** P2 — Medium
- **Why:** Useful for investigating multi-account abuse.
- **Required features:**
  - Select 2-4 players, view side-by-side stats
  - Highlight suspicious similarities
- **Files to create:**
  - `src/app/admin/players/compare/page.tsx`
  - `src/app/api/admin/players/compare/route.ts`

### Task CC.9 — Add investigation timeline visualization
- **Status:** `[ ]`
- **Severity:** P2 — Medium
- **Why:** Current investigation detail is a table. Timeline view makes patterns obvious.
- **Files to modify:**
  - `src/app/admin/investigations/page.tsx` (add timeline tab)

### Task CC.10 — Add dark mode to admin
- **Status:** `[ ]`
- **Severity:** P2 — Medium
- **Why:** Admins often work long hours. Dark mode reduces eye strain.
- **Required changes:**
  - Ensure all admin components use Tailwind `dark:` variants
  - Test color contrast in both modes
- **Files to modify:**
  - All `src/components/admin/*.tsx` (audit + add `dark:` classes)

---

## Summary Checklist (Quick View)

### Phase 2A — Security Blockers (P0) — 1-2 days ✅ COMPLETE (`ab131a9`)
- [x] **2A.1** — Create `/admin/forbidden` page
- [x] **2A.2** — Add `verifyAdmin()` to `/api/config` (root)
- [x] **2A.3** — Revoke `authenticated` grant on `increment_cheat_flag` RPC
- [x] **2A.4** — Add `super_admin` guard to `POST /api/admins`
- [x] **2A.5** — Add audit logging to config table writes
- [x] **2A.6** — Add audit logging to admin management
- [x] **2A.7** — Fix `X-RateLimit-Remaining` hardcoded value
- [x] **2A.8** — Flush in-memory admin cache on admin add/remove

### Phase 2B — Refactor + System Status (P1) — 3-4 days ✅ COMPLETE (`ce51b3d`, `8489296`, `fb1be07`)
- [x] **2B.1** — Create `src/app/admin/layout.tsx` (with **Compact Navigation Tree** sidebar — see design spec in task) (`ce51b3d`)
- [x] **2B.2** — Create `loading.tsx` and `error.tsx` (`ce51b3d`)
- [x] **2B.3** — Move `/api/admins/*` to `/api/admin/admins/*` (`8489296`)
- [x] **2B.4** — Remove duplicate `/api/config` (root) (`8489296`)
- [x] **2B.5** — Create `src/components/admin/` shared library (tree components, AdminHeader, StatusBadge, ConfirmModal, Pagination, EmptyState) (`ce51b3d`, `8489296`)
- [x] **2B.6** — Add admin entrance in game UI (Shield icon in GameSidebar) (`8489296`)
- [x] **2B.7** — Build `/admin/system-status` page (`fb1be07`)
- [x] **2B.8** — Build `/admin/jobs` page (`fb1be07`)
- [x] **2B.9** — Build `/admin/market` page (`fb1be07`)
- [x] **2B.10** — Add `PUT /api/admin/admins/[id]/role` endpoint (`8489296`)

### Phase 2C — New Features + Polish (P2) — 3-5 days ✅ COMPLETE (`8844be1`, `aa44158`)
- [x] **2C.1** — Build `/admin/economy` page
- [x] **2C.2** — Build `/admin/reports` page
- [x] **2C.3** — Build `/admin/support` page — **replaced with full in-app ticket system** (`aa44158`)
- [x] **2C.4** — DB-side player search
- [x] **2C.5** — Per-endpoint rate limiting on admin APIs
- [x] **2C.6** — Fix `as any` casts
- [x] **2C.7** — Add CSV export for admin audit log
- [x] **2C.8** — Rename audit routes for consistency

### Phase 2D — Future (P3) — TBD 🔄 Partial
- [-] **2D.1** — ~~Email integration for support tickets~~ — **CANCELLED** — replaced by in-app chat system (`aa44158`). No email needed.
- [ ] **2D.2** — CSRF tokens for mutating endpoints
- [ ] **2D.3** — Advanced RBAC (custom roles per page)

### Cross-Cutting Nice-to-Have (P2) — 🔄 5/10 Complete
- [x] **CC.1** — Fix empty catch blocks (3 locations) (`75bacf5`)
- [x] **CC.2** — Cache `/api/admin/stats` response (`75bacf5`)
- [x] **CC.3** — Fix investigations stats to be server-computed (`75bacf5`)
- [x] **CC.4** — Add loading skeletons to admin tables (`75bacf5`)
- [x] **CC.5** — Improve error messages on failed admin actions (`d47fe6e`)
- [x] **CC.6** — Add admin command palette (Cmd+K) (`9e39bb1`)
- [x] **CC.7** — Add bulk actions to player list — API done (`ea1e49b`)
- [ ] **CC.8** — Add player comparison view
- [ ] **CC.9** — Add investigation timeline visualization
- [ ] **CC.10** — Add dark mode to admin

---

## Effort Summary

| Phase | Days | Tasks | Risk |
|---|---|---|---|
| 2A | 1-2 | 8 | ✅ Complete (`ab131a9`) |
| 2B | 3-4 | 10 | ✅ Complete (`ce51b3d`, `8489296`, `fb1be07`) |
| 2C | 3-5 | 8 | ✅ Complete (`8844be1`, `aa44158`) |
| 2D | TBD | 3 | 🔄 1/3 (email cancelled, CSRF + RBAC remain) |
| CC | 2-3 | 10 | 🔄 7/10 complete |
| **Total** | **9-14 days** | **39 tasks** | **33/39 — 85%** |

---
### Also completed (not in original plan)
| Feature | Commit | Description |
|---|---|---|
| In-app support tickets | `aa44158` | Player ↔ Admin chat, ticket lifecycle (open→accepted→resolved), 2 DB tables, 7 API routes |

---

## Approval Required

- [ ] Approve Phase 2A (P0 security fixes) — **recommended to start immediately**
- [ ] Approve Phase 2B (refactor + System Status + Jobs + Market)
- [ ] Approve Phase 2C (new features + polish)
- [ ] Approve Phase 2D (future work)
- [ ] Approve Cross-Cutting items (CC.1-CC.10)
- [ ] Modify phase plan before proceeding
