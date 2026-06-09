# RULES.md — IndustriaX Project Engineering Rules

*Derived from a full audit of the codebase on 2025-01-17. These rules exist because real vulnerabilities and architectural weaknesses were found.*

---

## 1. ALLOWED

### General
- Adding new game features through the full stack (database → API → state → UI)
- Extending existing panels with new sections
- Adding new API routes with proper auth and validation
- Creating new Supabase migrations for schema changes
- Refactoring code to improve architecture without behavioral changes
- Adding new admin pages and API routes with proper role checks

### Database
- Adding new tables via Supabase SQL migrations
- Adding new columns to existing tables via migrations
- Adding new RLS policies
- Adding indexes for query optimization
- Using `createServiceRoleClient()` for server-side operations that need elevated access

### Frontend
- Adding new panels/components following existing patterns
- Using shadcn/ui components from `src/components/ui/`
- Using Framer Motion for animations
- Using `useGameStore` with proper selectors (subscribe to specific slices, not the entire store)
- Using `GameIcon` component for all game icons

### API
- Adding new action types to `/api/game/action` (with validation)
- Adding rate limiting to unprotected endpoints
- Adding auth checks to existing unprotected endpoints
- Extending `gameStateValidator.ts` with new validation rules

---

## 2. FORBIDDEN

### Security
- **NEVER** push `.env` or `.env.local` to GitHub — contains production secrets (C2)
- **NEVER** use hardcoded secrets as fallbacks — the `CHECKSUM_SECRET` fallback `'industriax-server-secret-2024'` must be removed (C3)
- **NEVER** create an API route without auth checks if it accesses sensitive data (C6)
- **NEVER** allow admin actions without `canWrite()` role check (C4)
- **NEVER** implement game-affecting mutations as client-only operations (C5)
- **NEVER** return `{ valid: true }` when server validation fails or is unreachable (C5)
- **NEVER** trust client-sent game state without server-side verification
- **NEVER** expose the Supabase service role key to the client

### Database
- **NEVER** run `prisma db:push` or `prisma migrate` — the Prisma schema is stale (SQLite) and will corrupt the Supabase PostgreSQL database (C7)
- **NEVER** remove RLS policies from existing tables
- **NEVER** add `"Service role can do everything"` policies without justification
- **NEVER** create a new table without RLS enabled
- **NEVER** write raw SQL outside of migration files

### Architecture
- **NEVER** add game logic to React components — it belongs in the Zustand store or server-side
- **NEVER** create a new Zustand store for game state — use the existing `useGameStore`
- **NEVER** directly mutate `store.resources` without going through store actions
- **NEVER** bypass the `debouncedPersistStorage` for save operations
- **NEVER** create a new Supabase client inside a React component body — use `createClient()` from `@/lib/supabase/client`

### API
- **NEVER** create an API route that modifies game state without validation
- **NEVER** create an admin API route without `verifyAdmin()` check
- **NEVER** create a write admin API route without `canWrite()` check
- **NEVER** omit rate limiting on new API routes
- **NEVER** use `setImmediate` in server-side code — not available in all environments (M7)

### Caddy/Gateway
- **NEVER** modify the `XTransformPort` logic in Caddyfile without security review — it's an SSRF vector (C1)
- **NEVER** add internal service ports to the Caddyfile without restricting access

---

## 3. REQUIRED REVIEWS

Before any code is accepted, these checks MUST pass:

### Pre-Implementation Review
| Check | Question |
|-------|----------|
| Rule compliance | Does this violate any FORBIDDEN rule? |
| Database impact | Does this need a migration? If so, has it been written? |
| Security impact | Does this need server-side validation? Auth? Rate limiting? |
| API impact | Does this need a new endpoint? Or modification to an existing one? |
| Admin impact | Does this need audit logging? Role checks? |
| State impact | Which store slices are affected? Are selectors efficient? |
| Offline impact | How does this behave when the server is unreachable? |

### Post-Implementation Review
| Check | Tool/Method |
|-------|-------------|
| Lint | `npx eslint src/` — must pass with 0 errors |
| Server start | Dev server must start and serve `/` with HTTP 200 |
| Console | No JavaScript errors in browser console |
| Feature | Feature works as expected in browser |
| Security | No auth bypass, no data leak, no unvalidated input |
| Database | Data persists correctly (if applicable) |
| Admin | Admin actions logged (if applicable) |
| Responsive | Works on mobile and desktop layouts |
| Worklog | `/home/z/my-project/worklog.md` updated |

---

## 4. DATABASE RULES

### Schema Changes
- All schema changes MUST be in Supabase SQL migration files under `supabase/migrations/`
- Migrations MUST be idempotent where possible
- Migrations MUST NOT be combined — one logical change per migration
- Migration files MUST have a descriptive filename (e.g., `007_add_trade_history.sql`)
- **NEVER** use Prisma to manage the database schema (C7)

### RLS (Row Level Security)
- Every new table MUST have RLS enabled: `ALTER TABLE xxx ENABLE ROW LEVEL SECURITY;`
- Every new table MUST have policies for:
  - Users can read their own data: `USING (user_id = auth.uid())`
  - Users can insert their own data: `WITH CHECK (user_id = auth.uid())`
  - Service role can do everything (for server-side API operations)
- Admin-only tables MUST have policies restricting access to service role only

### Write Frequency
- Player state saves happen every 2 minutes via cloud sync — do NOT increase this frequency
- `player_actions` table receives a write on every validated action — do NOT add unnecessary action types
- `admin_actions` table receives a write on every admin mutation — this is correct and must be preserved
- Game tick updates are client-side only — do NOT send tick data to the server

### Data Integrity
- All monetary values MUST be stored as integers (cents) or DECIMAL — never FLOAT
- All timestamps MUST use `TIMESTAMPTZ` — never `TIMESTAMP` without timezone
- All UUIDs MUST use the `uuid` type — never `text` or `varchar`
- All foreign keys MUST have `ON DELETE CASCADE` or `ON DELETE SET NULL` as appropriate
- `player_progress.money` has a check constraint `CHECK (money >= 0)` — new tables must follow this pattern

### Indexes
- Every table MUST have an index on `user_id` (for RLS policy performance)
- Every table MUST have an index on `created_at` (for time-range queries)
- Composite indexes SHOULD be added for common query patterns
- Index creation MUST be in migration files, not in application code

---

## 5. SECURITY RULES

### Authentication
- All game API routes MUST use `verifyAuth()` or `verifyAuthAndOwnership()` from `@/lib/auth/admin.ts`
- Admin API routes MUST use `verifyAdmin()` from `@/lib/auth/admin.ts`
- Admin write operations MUST additionally use `canWrite()` from `@/lib/auth/admin-helpers.ts`
- Auth failures MUST return 401, not redirect
- Session refresh is handled by middleware — do NOT duplicate in API routes

### Authorization — Admin Roles
| Role | Can Read | Can Write |
|------|----------|-----------|
| `viewer` | ✅ All admin data | ❌ No mutations |
| `admin` | ✅ All admin data | ✅ All mutations |
| `super_admin` | ✅ All admin data | ✅ All mutations + manage admins |

- `ADMIN_UIDS` env var users are implicitly `super_admin`
- `admin_users` table can override roles
- **NEVER** create an admin endpoint that checks `verifyAdmin()` but not `canWrite()` for mutations

### Validation
- Every game-affecting mutation MUST be validated server-side in `/api/game/action`
- The `gameStateValidator.ts` MUST be updated for new game mechanics
- `importSave()` MUST validate the imported data against server-side rules
- **CRITICAL**: `serverActions.ts` MUST NOT return `{ valid: true }` on auth failures, rate limits, or network errors (C5). This is the #1 security gap.

### Abuse Prevention
- Every new API route MUST have rate limiting via `checkRateLimit()` from `@/lib/auth/rateLimiter.ts`
- Rate limit profiles are defined in `rateLimiter.ts` — add new profiles as needed
- Cheat detection thresholds are in `gameStateValidator.ts` — update for new mechanics
- Account auto-locking at 3 cheat flags must be preserved

### Attack Surface Reduction
- `/api/game/definitions` MUST add at minimum a rate limit (currently no auth, no rate limit) (C6)
- `/api/news-llm` MUST add auth or rate limiting (currently open proxy to Cloudflare Worker) (C6)
- `/api/icons` MUST add rate limiting (currently open proxy to Iconify) (C6)
- `/api/config` root route MUST add auth (currently exposes table names) (C6)
- `XTransformPort` in Caddyfile MUST be restricted to known ports only (C1)

---

## 6. PERFORMANCE RULES

### Database Efficiency
- All queries MUST use indexed columns in WHERE clauses
- All queries MUST have a LIMIT clause for list endpoints
- Avoid SELECT * — specify needed columns
- Use `createServiceRoleClient()` only when RLS bypass is required — use regular client otherwise
- Batch inserts are preferred over individual inserts for audit logs

### API Efficiency
- Every API route MUST return within 5 seconds under normal load
- Every API route MUST have a rate limit
- Avoid N+1 queries — use JOINs or batch queries
- Cache game config server-side — it rarely changes (`configCache.ts` pattern)
- Use `Response.json()` for simple responses — avoid unnecessary serialization

### Frontend Rendering Efficiency
- Use Zustand selectors — NEVER subscribe to the entire store: `useGameStore(s => s.specificField)`
- Memoize expensive computations with `useMemo`
- Debounce rapid state updates (the store already uses 5s debounced persistence)
- Use `AnimatePresence` for lists that change frequently
- Set `max-h-96 overflow-y-auto` on long lists with `game-scrollbar` styling
- Keep panel components focused — do not create god components

### Realtime Efficiency
- Supabase Presence is used for online tracking — do NOT add new Presence channels without justification
- The Presence channel name is `industriax-online` — do not create per-user channels
- Presence refresh interval is 30s — do NOT reduce below 10s

---

## 7. ARCHITECTURE RULES

### System Interaction Pattern

```
Browser (React + Zustand)
  ↕ (API calls with auth)
Next.js API Routes
  ↕ (Supabase client)
Supabase (PostgreSQL + Auth + Presence)
```

- The game loop runs CLIENT-SIDE — this is by design for responsiveness
- The SERVER is advisory — it validates, logs, and detects cheats
- **This architecture is a tradeoff** — the client is authoritative for gameplay, the server is authoritative for validation and persistence
- Any new mutation MUST follow: client action → server validation → server persistence → client confirmation

### State Management
- `useGameStore` is the SINGLE source of truth for game state
- Do NOT create additional Zustand stores for game data
- `useSettingsStore` is acceptable for UI-only preferences
- Store actions MUST be the only way to modify game state from components
- Store version migrations are in `migrateSaveState()` — add new versions incrementally

### Save System
- Local saves use `debouncedPersistStorage` with 5s debounce
- Cloud saves use `/api/game/state` with 2-minute auto-save interval
- `beforeunload` flush ensures data is written on page close
- **NEVER** remove the `beforeunload` listener
- **NEVER** increase the auto-save frequency (would overload the server)
- Save version MUST be incremented (`SAVE_VERSION`) when adding new state fields

### API Design
- Game routes go under `/api/game/`
- Admin routes go under `/api/admin/`
- Config routes go under `/api/config/`
- Auth routes go under `/api/auth/`
- Each route file MUST have a clear purpose comment
- Error responses MUST use consistent format: `{ error: string, code?: string }`

### Frontend Architecture
- Game panels go in `src/components/game/`
- Shared components go in `src/components/game/shared/`
- UI primitives go in `src/components/ui/` (shadcn/ui — do not modify these directly)
- Providers go in `src/components/providers/`
- Each game panel MUST be a self-contained component
- Panels receive data from the store — NOT from props (except for rare composition patterns)

### Admin Dashboard
- Admin pages go under `src/app/admin/`
- Admin pages MUST have sidebar navigation consistent with other admin pages
- Admin pages MUST use `verifyAdmin()` on their API calls
- Admin mutations MUST be logged to `admin_actions` table

---

## 8. PRODUCTION RULES

### Before Any Feature Is Considered Complete

- [ ] Lint passes with 0 errors on `src/`
- [ ] Dev server starts and serves `/` with HTTP 200
- [ ] No JavaScript errors in browser console
- [ ] Feature works in browser (tested, not assumed)
- [ ] Responsive layout works on mobile and desktop
- [ ] Sticky footer rule respected (if applicable)
- [ ] Server-side validation implemented (for game mutations)
- [ ] Rate limiting implemented (for new API routes)
- [ ] Auth checks implemented (for protected routes)
- [ ] Admin audit logging implemented (for admin mutations)
- [ ] Database migration created (if schema changed)
- [ ] RLS policies created (for new tables)
- [ ] Store version incremented (if state shape changed)
- [ ] No secrets in code or committed files
- [ ] worklog.md updated

### Deployment Checklist
- [ ] All lint checks pass
- [ ] Dev server starts without errors
- [ ] Critical pages load (game `/` and admin `/admin/`)
- [ ] No new console errors
- [ ] `.env` is NOT being pushed
- [ ] Migration files are included in the commit
- [ ] `worklog.md` is updated

---

## APPENDIX: Current Systems Requiring Immediate Attention

### Priority 1 — Critical Security (Fix Immediately)

| ID | Issue | Why It Matters |
|----|-------|----------------|
| C1 | Caddyfile SSRF via `XTransformPort` | Any visitor can proxy to any localhost port, exposing internal services |
| C2 | Production secrets in `.env` committed to repo | Service role key and access token are publicly accessible |
| C3 | Hardcoded HMAC secret in `gameStateValidator.ts` | The checksum used for anti-cheat can be forged by anyone who reads the source |
| C5 | Server validation is advisory-only | `serverActions.ts` returns `{ valid: true }` on all errors, making the anti-cheat system theater |
| C4 | Admin escalation via `/api/admins` POST | A viewer-role admin can add themselves as super_admin |

### Priority 2 — High Risk (Fix Soon)

| ID | Issue | Why It Matters |
|----|-------|----------------|
| C6 | Four unauthenticated API endpoints | `/api/game/definitions`, `/api/news-llm`, `/api/icons`, `/api/config` have no auth or rate limiting |
| H1 | In-memory rate limiting | Breaks completely with horizontal scaling |
| H2 | Fake security headers | `withSecurityHeaders()` returns static values, misleading consumers |
| H3 | Compute endpoint ownership bypass | Omitting `userId` from request body skips the ownership check |
| H4 | Cloud sync fallback after rejection | A failed validation still attempts a save through the legacy endpoint |

### Priority 3 — Technical Debt (Plan to Address)

| ID | Issue | Why It Matters |
|----|-------|----------------|
| M1 | Monolithic store (3500+ lines) | Hard to maintain, test, and reason about |
| M2 | Massive page component (800+ lines) | Too many concerns in one component |
| C7 | Stale Prisma schema | `prisma db:push` would corrupt the Supabase database |

---

## APPENDIX: Why Each Major Rule Exists

| Rule | Origin |
|------|--------|
| "Never use Prisma for schema" | Prisma schema defines SQLite with a `User`/`Post` model that doesn't match the real Supabase PostgreSQL schema. Running `prisma db:push` would attempt to create wrong tables. |
| "Never return valid:true on errors" | `serverActions.ts` lines 50-51, 81, 87, 99 all return `{ valid: true }` on auth failures, rate limits, and network errors. This makes the entire anti-cheat system ineffective. |
| "Admin mutations need canWrite()" | `/api/admins` POST route (lines 85-161) calls `verifyAdmin()` but never checks `canWrite()`, allowing viewer-role admins to escalate to super_admin. |
| "All new tables need RLS" | The existing tables all have RLS enabled and policies defined. This is a defense-in-depth measure that must be maintained. |
| "Never create client-only mutations" | The Trading Post feature was implemented as client-only, directly modifying `store.resources` without server validation. This allows cheating via browser console. |
| "Use Zustand selectors" | The store has 100+ fields. Subscribing to the entire store causes re-renders on every tick (~10/second at 10x speed), destroying UI performance. |
| "Increment SAVE_VERSION on state changes" | Past migrations from V1→V19 show that adding state fields without version increments causes player data loss on update. |
| "5s debounce on persistence" | Writing to localStorage on every tick (up to 10/sec) would block the main thread and cause frame drops. |
| "2-minute cloud save interval" | More frequent saves would overload the `/api/game/state` endpoint. Less frequent saves risk more data loss. |
| "Never modify shadcn/ui components directly" | These are managed by the shadcn CLI. Direct modifications will be overwritten on update. |
