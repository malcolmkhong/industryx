# Phase 06 - Release Readiness

## Status: PENDING
## Predecessor: Phase 05 UI System Foundation
## References: RULES.md section 8, AGENT.md Deployment Workflow, ARCHITECTURE_BASELINE_REPORT.md Appendix B

---

## Background

The project is a live production game. Release readiness requires:

From RULES.md section 8 (Before Any Feature Is Considered Complete):
  - Lint passes with 0 errors
  - Dev server starts, serves / with HTTP 200
  - No JavaScript errors in browser console
  - Feature works in browser (tested, not assumed)
  - Server-side validation implemented
  - Rate limiting implemented
  - Auth checks implemented
  - Admin audit logging implemented
  - Database migration created (if schema changed)
  - RLS policies created (for new tables)
  - Store version incremented (if state shape changed)
  - No secrets in code or committed files
  - Zustand selectors are specific
  - Input validation with bounds checking
  - worklog.md updated

Open operational gaps (not yet covered by prior phases):
  - Sentry SDK is now integrated but no project setup verified
  - No monitoring playbook exists
  - No rollback procedure documented
  - No migration safety checklist
  - No incident escalation path
  - worklog.md was deleted and never recreated
  - CHECKSUM_SECRET deployment verification not documented

---

## Objective

Establish explicit, verifiable release quality gates and operational procedures
so every future deployment is safe and recoverable.

---

## Task Breakdown

### 06.1 Recreate worklog.md

worklog.md was the project timeline anchor. It was deleted.

Create a new worklog.md format:
  Each entry: Task ID | Agent | Date | Summary | Files Changed | Status

Reconstruct known history from phase reports:
  - Phase 0: selector migration, dead code removal (2025-06-10)
  - Phase 1B: security hardening C1-C6, H3, H8 (2025-03-04)
  - Phase 1B-followup: H3 fail-closed, trading investigation
  - Phase 1C: /api/game/trade route (2025-06-10)
  - June 2025: Sentry integration, bun installation, planning folder

### 06.2 Sentry Verification

Sentry SDK was installed (June 2025):
  sentry.client.config.ts, sentry.server.config.ts, sentry.edge.config.ts
  src/instrumentation.ts, src/app/global-error.tsx
  next.config.ts wrapped with withSentryConfig

Verify:
  1. NEXT_PUBLIC_SENTRY_DSN is set in .env (do not commit)
  2. SENTRY_ORG and SENTRY_PROJECT are set
  3. SENTRY_AUTH_TOKEN is set for source map upload
  4. Trigger a test error in browser, verify it appears in Sentry dashboard
  5. Set up Sentry MCP (enable_all_context_servers: true in Zed settings)

Sentry alert setup:
  - Alert: any new issue severity=error -> notify immediately
  - Alert: issue spike (>10x normal rate in 1 hour) -> notify immediately
  - Alert: p95 latency > 5s on /api/game/state -> notify

### 06.3 CHECKSUM_SECRET Production Verification

From RULES.md Appendix C and AGENT.md:
  CHECKSUM_SECRET must be set in production. If not set, checksum generation throws.
  This is intentional fail-closed but must be verified before production launch.

Action:
  1. Verify CHECKSUM_SECRET is in production environment variables
  2. Document where it is set (Vercel/server env, not in code)
  3. Add to deployment checklist

### 06.4 Migration Safety Checklist

Create planning/MIGRATION_SAFETY_CHECKLIST.md:

Pre-migration:
  - Backup current schema (Supabase dashboard -> Settings -> Backups)
  - Test migration in development first
  - Verify migration is idempotent (can run twice without error)
  - Check RLS policies are included in migration
  - Check indexes are included in migration

Post-migration:
  - Verify all expected tables and columns exist
  - Verify RLS policies active (query pg_policies)
  - Run health check endpoint /api/health
  - Verify game loads and saves correctly

Rollback:
  - Identify if migration is reversible
  - Write reverse migration before deploying forward migration
  - Document data loss risk of rollback

### 06.5 Release Gate Checklist

Create planning/RELEASE_CHECKLIST.md:

Security gate:
  - [ ] No hardcoded secrets in code (grep for API keys, passwords)
  - [ ] .env not committed (check .gitignore)
  - [ ] CHECKSUM_SECRET set in production
  - [ ] All critical routes have auth + rate limiting
  - [ ] Account lock is fail-closed on DB error

Data integrity gate:
  - [ ] All new tables have RLS enabled
  - [ ] All new tables have user_id index
  - [ ] Migrations run successfully in dev
  - [ ] No Prisma commands run against production DB (RULES.md FORBIDDEN)

API/Auth gate:
  - [ ] bun run lint: 0 errors
  - [ ] Dev server: GET / returns 200
  - [ ] No console errors on page load
  - [ ] Admin panel loads (/admin/)
  - [ ] Cloud sync save works (authenticated user)

Performance gate:
  - [ ] No full-store subscriptions in game components
  - [ ] No N+1 queries introduced

Monitoring gate:
  - [ ] Sentry DSN set and tested
  - [ ] At least one test error confirmed in Sentry dashboard

### 06.6 Rollback Playbook

Create planning/ROLLBACK_PLAYBOOK.md:

For each high-risk deployment type:
  1. Migration rollback: git revert migration file + run reverse SQL
  2. API route rollback: git revert specific route file
  3. Store change rollback: SAVE_VERSION must be incremented; rollback requires migration
  4. Full deployment rollback: git revert + redeploy previous commit

### 06.7 Monitoring Playbook

Create planning/MONITORING_PLAYBOOK.md:

Daily checks:
  - Sentry: any new error spikes?
  - /api/health: DB connection OK?

Incident response:
  1. Identify: what endpoint/action is failing?
  2. Contain: is the issue causing data corruption or just errors?
  3. Fix: minimal targeted fix or rollback?
  4. Verify: confirm fix works in production
  5. Document: add to worklog.md

Specific scenarios:
  - DB outage: isAccountLocked returns locked=true (fail-closed). Players blocked from sync.
    Expected behavior. No action needed unless outage >30 min.
  - CHECKSUM_SECRET missing: all checksum generation throws.
    Fix: set env var and redeploy.
  - Rate limit storm: players hitting 429.
    Fix: identify source (bot, bug, genuine spike), adjust limits or block.

---

## Deliverables

1. worklog.md recreated with reconstructed history
2. Sentry verified working in production
3. Sentry alert rules configured
4. planning/RELEASE_CHECKLIST.md
5. planning/MIGRATION_SAFETY_CHECKLIST.md
6. planning/ROLLBACK_PLAYBOOK.md
7. planning/MONITORING_PLAYBOOK.md

---

## Dependencies

- All prior phases complete or explicitly deferred with risk acceptance
- Sentry DSN set in .env

---

## Validation

- Trigger test error in browser -> confirm appears in Sentry within 30 seconds
- Run RELEASE_CHECKLIST and all gates pass
- bun run lint: 0 errors
- Dev server starts and serves /

## Exit Criteria

- worklog.md exists and is up to date
- Sentry confirmed working (test error received)
- Release gate artifacts are complete and usable by team
- CHECKSUM_SECRET verified in production environment
