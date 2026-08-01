# Release Checklist

> **Date:** 2026-06-11
> **Purpose:** Go/no-go criteria for production releases
> **Authority:** RULES.md §8 (Before Any Feature Is Considered Complete)

---

## Pre-Release Gates

### 1. Security Gate

- [ ] **No hardcoded secrets in code**
  - Verify: `rg -i "secret|password|key|token" src/ | rg -v "test|spec|example" | rg -v "//\s*"`
  - Exception: `process.env.X` references
- [ ] **.env not committed**
  - Verify: `cat .gitignore | rg "^\.env"`
- [ ] **CHECKSUM_SECRET set in production env** (not in code)
  - Verify: `vercel env ls | rg CHECKSUM_SECRET` (or platform equivalent)
- [ ] **All critical routes have auth checks**
  - `/api/game/*` — verify auth middleware
  - `/api/admin/*` — verify `verifyAdmin()` + `canWrite()` for mutations
- [ ] **All new routes have rate limiting**
  - Verify: new route file has `checkRateLimit()` call
- [ ] **Account lock is fail-closed on DB error**
  - Verify: `isAccountLocked()` returns `{ locked: true }` in catch block
- [ ] **HMAC secret has no fallback** (C1 fix verified)
  - Verify: `process.env.CHECKSUM_SECRET` with no `||` fallback
- [ ] **Trading Post uses server-authoritative** (C5 fix verified)
  - Verify: `validateTradeWithServer` returns `{ valid: false }` on error

### 2. Data Integrity Gate

- [ ] **All new tables have RLS enabled**
  - Verify: `pg_class WHERE relname = 'new_table' → relrowsecurity = true`
- [ ] **All new tables have user_id index**
  - Verify: `pg_indexes WHERE tablename = 'new_table' AND indexdef LIKE '%user_id%'`
- [ ] **All migrations run successfully in dev**
  - Verify: `bun run build` + run all migrations
- [ ] **No Prisma commands run against production DB** (RULES.md FORBIDDEN)
  - Verify: `prisma` only in devDependencies or removed
- [ ] **Monetary values are INTEGER (cents) or DECIMAL**
  - Verify: `information_schema.columns WHERE data_type = 'numeric' OR data_type = 'integer'`
- [ ] **Timestamps use TIMESTAMPTZ**
  - Verify: `data_type NOT LIKE 'timestamp%' WITHOUT timezone`
- [ ] **Foreign keys have ON DELETE** clause
  - Verify: `information_schema.referential_constraints WHERE delete_rule IN ('CASCADE', 'SET NULL')`

### 3. API/Auth Gate

- [ ] **bun run lint — 0 errors**
  - Run: `bun run lint`
  - Allowed: pre-existing warnings (e.g., cloudflare-worker.js anonymous default export)
- [ ] **Dev server starts and serves GET / with 200**
  - Run: `bun run dev` then `curl -I http://localhost:3000/`
- [ ] **No JavaScript errors on page load**
  - Manual check: open dev tools, watch console on game load
- [ ] **Admin panel loads (/admin/)**
  - Manual check: navigate to admin dashboard, verify no 500s
- [ ] **Cloud sync save works (authenticated user)**
  - Manual check: log in, build something, verify save indicator
- [ ] **Cloud sync load works (new device)**
  - Manual check: log in on different browser, verify state loads
- [ ] **Trading Post executes via /api/game/trade**
  - Manual check: make a trade, verify resources update, verify trade_history row
- [ ] **All action types in validActions have handlers** (H4)
  - Verify: `grep "case '.*':" route.ts` matches `validActions` list

### 4. Performance Gate

- [ ] **No full-store subscriptions in game components** (H1)
  - Run: `rg "useGameStore\(\)" src/components/` should return 0 matches
  - Exception: allowed for game config provider if guarded
- [ ] **No N+1 queries introduced**
  - Manual review of new API routes + Supabase query patterns
- [ ] **useMemo on expensive derived values** in changed panels
  - Manual review of `.filter()` / `.map()` / `.reduce()` chains in render
- [ ] **React.memo on high-frequency leaf components**
  - Verify: `PanelStatCard`, `GameIcon` wrapped in `memo()`

### 5. UI/UX Gate

- [ ] **Layout works on mobile (375px) and desktop (1280px+)**
  - Manual check: Chrome dev tools responsive mode
- [ ] **No console errors during normal play**
  - Manual check: play for 5 minutes, watch console
- [ ] **All text ≥14px on mobile**
  - Manual check: no `text-[10px]` or smaller
- [ ] **Touch targets ≥44px on mobile**
  - Manual check: all buttons/taps large enough

### 6. Monitoring Gate

- [ ] **Sentry DSN set in production env**
  - Verify: `NEXT_PUBLIC_SENTRY_DSN` in Vercel env
- [ ] **At least one test error confirmed in Sentry dashboard**
  - Trigger: throw test error in any API route
  - Verify: appears in Sentry within 30s
- [ ] **Sentry alert rules configured**
  - New issue severity=error → notify
  - Issue spike (>10x normal) → notify
  - p95 latency > 5s on /api/game/state → notify
- [ ] **/api/health returns 200**
  - Manual check: `curl https://<prod>/api/health`

### 7. Database Gate

- [ ] **Migrations run successfully in production**
  - Verify via Supabase dashboard
- [ ] **No migration left in "pending" state**
  - Verify: Supabase dashboard → Migrations
- [ ] **Backup taken before migration** (if migration deployed)
  - Verify: Supabase dashboard → Backups

---

## Production Hardening (Phases 0-5)

> **These checks must pass BEFORE deploying.** The startup guards (Phase 5.3) and NODE_ENV guards (Phase 2.1) will crash the server at boot if these are misconfigured, so a green build is the first signal.

- [ ] **`is_game_admin()` queries `admin_users` (not hardcoded)**
  - Run in Supabase SQL editor: `SELECT prosrc FROM pg_proc WHERE proname = 'is_game_admin';`
  - Should contain `FROM public.admin_users`

- [ ] **All migrations applied**
  - Run: `SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 5;`
  - Verify versions include 018 (admin function fix) and 024 (now_iso RPC)

- [ ] **`window.__gameStore` is NOT in production bundle**
  - Run in browser DevTools console: `typeof window.__gameStore`
  - Should return `"undefined"` in production (Phase 2.1 NODE_ENV guard strips it)

- [ ] **`CHECKSUM_SECRET` is set**
  - Run in production env: `echo $CHECKSUM_SECRET` (or check deployment env vars)
  - Must NOT be empty (Phase 5.3 startup guard will crash server at boot if missing)

- [ ] **Security headers present**
  - Run: `curl -I https://your-app.com`
  - Should include: `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy`

- [ ] **`now_iso()` RPC is callable**
  - Run in Supabase SQL editor: `SELECT now_iso();`
  - Should return ISO 8601 timestamp (e.g., `"2026-06-15T10:30:00.123Z"`)

- [ ] **`GENEROSITY_MULTIPLIER` is 1.5 (not 3)**
  - Grep: `git log --all -p -- src/lib/auth/guestMigrationValidator.ts | grep "GENEROSITY_MULTIPLIER = "`
  - Latest commit should show `1.5`

---

## Code Review Checklist

### State Management

- [ ] **Specific Zustand selectors** (not `useGameStore()`)
  - Verify: `rg "useGameStore\(s =>" src/components/` (specific selectors)
- [ ] **No `store.xxx` direct access** in components
  - Verify: `rg "store\.\w+" src/components/game/` should return 0 matches
- [ ] **Store actions used** (not direct state mutation)
  - Verify: no `useGameStore.setState({ ... })` outside store actions

### Type Safety

- [ ] **No `any` types introduced**
  - Run: `rg ": any\b" src/` (should not increase)
- [ ] **No type assertion abuse** (`as any`, `@ts-ignore`)
  - Run: `rg "@ts-ignore|@ts-expect-error|as any" src/`
- [ ] **No `as Record<string, number>`** for save migrations (known issue)
  - Review save migration code for type safety

### Error Handling

- [ ] **No empty catch blocks**
  - Run: `rg "catch.*{}" src/` (should not increase)
- [ ] **No silent error swallowing**
  - Review catch blocks for proper error logging
- [ ] **Fail-closed on security-critical errors**
  - isAccountLocked → `{ locked: true }` on error
  - Rate limit check → fail-open OK
  - Cheat detection → fail-closed (creates investigation)

### Security

- [ ] **No new client-only game mutations** (C5 lesson)
  - Verify: all mutations go through `/api/game/*` with server validation
- [ ] **No unvalidated input in actions**
  - Verify: server validation in `/api/game/action` for new actions
- [ ] **No new admin endpoints without role checks**
  - Verify: `verifyAdmin()` + `canWrite()` for mutations

---

## Deployment Procedure

### Pre-Deploy

- [ ] **All feature branches merged to main**
- [ ] **CI green** on main branch
- [ ] **Release notes drafted** (user-facing changes)
- [ ] **Team notified** of release window
- [ ] **Backup verified** (Supabase dashboard)

### Deploy

- [ ] **Deploy via Vercel** (or platform) — main branch push triggers build
- [ ] **Monitor build logs** for errors
- [ ] **Verify deploy succeeded** — production URL responds
- [ ] **Run smoke tests** in production

### Post-Deploy

- [ ] **Monitor error rate** for 30 minutes
- [ ] **Check Sentry** for new errors
- [ ] **Check /api/health** latency
- [ ] **Update worklog.md** with release entry
- [ ] **Notify team** of completion
- [ ] **Update release notes** with actual deployment time

---

## Rollback Decision Matrix

| Symptom | Severity | Action |
|---------|----------|--------|
| Build fails | CRITICAL | Revert commit, redeploy |
| 500 error rate > 5% | CRITICAL | Rollback to last good deploy |
| 500 error rate 1-5% | HIGH | Investigate; rollback if not resolved in 15min |
| 4xx error rate spike | MEDIUM | Investigate; usually auth issue |
| Single endpoint broken | MEDIUM | Disable endpoint (feature flag) or rollback |
| Sentry new issue | LOW | Investigate next business day |
| Performance regression | MEDIUM | Profile; rollback if >20% slowdown |

---

## Sign-off Template

```
Release: v[VERSION]
Date: YYYY-MM-DD
Released by: ___________

Pre-Release Gates:
- [ ] Security Gate — Verified by: ___________
- [ ] Data Integrity Gate — Verified by: ___________
- [ ] API/Auth Gate — Verified by: ___________
- [ ] Performance Gate — Verified by: ___________
- [ ] UI/UX Gate — Verified by: ___________
- [ ] Monitoring Gate — Verified by: ___________
- [ ] Database Gate — Verified by: ___________

Deployment:
- [ ] Pre-deploy checklist complete
- [ ] Deploy executed
- [ ] Post-deploy verification passed
- [ ] worklog.md updated

Notes:
```

---

## References

- **RULES.md §8** — Before Any Feature Is Considered Complete
- **AGENT.md** — Required Validation Process After Implementation
- **PROJECT_STATUS_SOURCE_OF_TRUTH.md** — Current 25-issue status
- **planning/MIGRATION_SAFETY_CHECKLIST.md** — Database-specific checks
- **planning/ROLLBACK_PLAYBOOK.md** — Detailed rollback procedures
- **planning/MONITORING_PLAYBOOK.md** — Post-release monitoring
