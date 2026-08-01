# Rollback Playbook

> **Date:** 2026-06-11
> **Purpose:** Procedures for rolling back different types of production changes
> **Authority:** RULES.md §2.4 (FORBIDDEN: prisma db:push / prisma migrate)
> **Reference:** planning/MIGRATION_SAFETY_CHECKLIST.md (companion)

---

## When to Rollback

Rollback if:
- **Build fails** in production deploy
- **500 error rate > 5%** for 15+ minutes
- **Data corruption detected** (impossible state, negative resources, etc.)
- **Security vulnerability introduced** (auth bypass, unvalidated input, etc.)
- **Performance regression > 20%** vs baseline
- **Critical feature broken** (e.g., can't log in, can't save, can't trade)

Don't rollback for:
- **Single non-critical endpoint broken** — disable via feature flag instead
- **Cosmetic bug** — fix forward in next release
- **Single Sentry issue** — investigate next business day

---

## Decision Tree

```
Issue detected
├── Is it CRITICAL (security/data loss/5xx spike)?
│   ├── YES → ROLLBACK IMMEDIATELY
│   └── NO → Continue
├── Is it 1 endpoint broken?
│   ├── YES → Feature flag / disable endpoint, fix forward
│   └── NO → Continue
├── Is it 1 Sentry issue?
│   ├── YES → Track for next release
│   └── NO → Continue
└── Investigate root cause first
```

---

## Type 1: Migration Rollback

### When

- Migration fails to apply (constraint violation, syntax error)
- New RLS policy blocks legitimate users
- New CHECK constraint rejects valid data
- New column default breaks existing queries

### Procedure

**Step 1: Stop new requests (optional)**
- If migration is in progress: wait for completion, then decide
- If app code change requires rollback too: do both together

**Step 2: Write reverse migration** (if not pre-written)
- See `planning/MIGRATION_SAFETY_CHECKLIST.md` for reverse template
- Use `IF EXISTS` for safety
- Test in dev first if possible

**Step 3: Apply reverse migration via Supabase dashboard**
```sql
-- Example: revert 012_trade_history_columns.sql
ALTER TABLE trade_history DROP COLUMN IF EXISTS server_state_version;
ALTER TABLE trade_history DROP COLUMN IF EXISTS exchange_rate_used;
DROP INDEX IF EXISTS idx_trade_history_state_version;
DROP POLICY IF EXISTS "service_role_full_access_trade_history" ON trade_history;
```

**Step 4: Verify schema**
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'trade_history'
ORDER BY ordinal_position;
```

**Step 5: Rollback app code if needed**
- Git revert the code change that introduced the migration dependency
- Redeploy

**Step 6: Verify application works**
- Manual smoke test of affected features
- Watch Sentry for 30 minutes

**Data Loss Risk**: HIGH if migration added new columns with data
- Document in incident report
- Communicate to team

---

## Type 2: API Route Rollback

### When

- New route returns 500 errors
- New route breaks auth or rate limiting
- New route has security vulnerability
- Route's downstream dependencies unavailable

### Procedure

**Step 1: Identify affected commit**
```bash
git log --oneline -- src/app/api/game/trade/route.ts | head -5
```

**Step 2: Revert via git**
```bash
git revert <commit-hash>
git push origin main
```

Vercel auto-deploys on push. Monitor build for success.

**Step 3: Verify rollback**
- `curl https://<prod>/api/game/trade` returns 405 (or appropriate non-200)
- Or returns the OLD behavior (depending on revert target)

**Step 4: Alternative: Feature flag**
- If the new route is gated by a feature flag, disable the flag instead
- Faster than deploy (no git push needed)

**Step 5: Verify dependent features**
- If route was called by client, verify client still works
- May need client rollback too if route change was breaking

**Data Loss Risk**: LOW (routes don't typically modify schema)

---

## Type 3: Store Change Rollback

### When

- Store action breaks game state (corruption, infinite loop, etc.)
- Store migration V20+ breaks existing saves
- Store selector change causes performance regression
- New state field causes infinite re-renders

### Procedure

**Step 1: Identify store change**
- Store is in `src/lib/game/store.ts`
- Check git log: `git log --oneline -- src/lib/game/store.ts | head -10`

**Step 2: Revert via git**
```bash
git revert <commit-hash>
git push origin main
```

**Step 3: Bump SAVE_VERSION (if needed)**
- If store change includes new state fields, bump `SAVE_VERSION` constant
- This forces players' saves to migrate or be reset
- See `src/lib/game/store.ts` migrateSaveState()

**Step 4: Handle player save compatibility**
- If saves have new field → automatic migration via migrateSaveState
- If saves have OLD field that was removed → set to default in migration
- If migration fails → save is reset (data loss for affected players)

**Step 5: Verify with multiple save states**
- Test with: empty save, mid-game save, late-game save
- Verify: no crashes, no data loss, no visual bugs

**Data Loss Risk**: MEDIUM-HIGH
- Saves with new format may not load after rollback
- Document affected players
- Provide migration path if possible

---

## Type 4: Full Deployment Rollback

### When

- Multiple issues from different commits
- Unclear which commit caused issue
- Need to restore to known-good state quickly

### Procedure

**Step 1: Identify last good deploy**
- Vercel: Deployments tab → find last green build
- Or: `git log --oneline -20` and find last "verified good" tag

**Step 2: Revert to last good commit**
```bash
# Option A: Revert all since last good
git revert <last-good-commit>..HEAD --no-commit
git commit -m "revert: rollback to last good state"
git push origin main

# Option B: Force push to last good (destructive)
git reset --hard <last-good-commit>
git push --force-with-lease origin main
```

**WARNING**: Option B is destructive. Use only if you understand the consequences.

**Step 3: Monitor build and deploy**
- Vercel will rebuild from new HEAD
- Watch for green deploy

**Step 4: Verify application**
- Run smoke tests
- Check Sentry for resolved errors
- Check /api/health

**Step 5: If migration was involved**
- See Type 1: Migration Rollback
- May need to revert migration too

**Data Loss Risk**: HIGH
- All commits between bad and good are reverted
- Migrations in that range may be partially applied
- Communicate to team and users

---

## Type 5: Emergency Hotfix

### When

- Critical security vulnerability
- Data corruption in progress
- Cannot wait for normal git flow

### Procedure

**Step 1: Hotfix branch from main**
```bash
git checkout main
git pull origin main
git checkout -b hotfix/critical-issue
```

**Step 2: Apply minimal fix**
- Smallest possible change to address issue
- Add tests if possible
- Document WHY in commit message

**Step 3: Emergency deploy**
- Push to main (or merge to main then push)
- Vercel auto-deploys

**Step 4: Notify team**
- #incidents channel
- Brief description: "Hotfix for [issue], deployed at [time]"

**Step 5: Post-incident**
- Write up in worklog.md
- Schedule proper fix for next release
- Schedule post-mortem if critical

**Data Loss Risk**: LOW (hotfix is additive, not destructive)

---

## Communication Templates

### Rollback Started

```
🚨 ROLLBACK IN PROGRESS

Issue: [brief description]
Affected: [component/route/version]
Action: Rolling back to [commit/version]
ETA: [time estimate]
Lead: @[name]

Updates in this thread.
```

### Rollback Complete

```
✅ ROLLBACK COMPLETE

Rolled back: [commit/version] → [last-good-commit/version]
Verified: [what was verified]
Affected users: [estimate]
Data loss: [none/estimated]

Next steps:
- [ ] Document in worklog.md
- [ ] Root cause analysis
- [ ] Schedule fix-forward
```

### Incident Report

```markdown
# Incident: [Brief Title]

**Date**: YYYY-MM-DD HH:MM UTC
**Severity**: CRITICAL / HIGH / MEDIUM
**Detected by**: [monitoring/user/team]
**Resolved by**: [name]

## Timeline
- HH:MM — Issue detected
- HH:MM — Investigation started
- HH:MM — Rollback initiated
- HH:MM — Rollback complete
- HH:MM — Verified resolved

## Root Cause
[Brief explanation]

## Impact
- Users affected: [count/percentage]
- Data loss: [yes/no, what data]
- Duration: [minutes/hours]

## Resolution
[What was done to fix]

## Prevention
- [ ] Action item 1
- [ ] Action item 2
```

---

## Pre-Rollback Checklist (ALWAYS DO)

Before any rollback:

- [ ] **Root cause identified** (don't rollback blindly)
- [ ] **Data loss risk assessed** and documented
- [ ] **Team notified** of rollback plan
- [ ] **Rollback procedure reviewed** for this type
- [ ] **Post-rollback verification plan** ready
- [ ] **Communication template** prepared
- [ ] **Backup timestamp** recorded (if migration involved)

---

## Post-Rollback (ALWAYS DO)

After any rollback:

- [ ] **Application verified working** (smoke tests)
- [ ] **Sentry clean** (no new errors related to rollback)
- [ ] **worklog.md updated** with incident entry
- [ ] **Incident report written** (if CRITICAL/HIGH)
- [ ] **Root cause identified** (for fix-forward)
- [ ] **Fix-forward scheduled** (in next sprint)
- [ ] **Post-mortem scheduled** (if CRITICAL)
- [ ] **Team notified** of resolution

---

## References

- **RULES.md §8** — Before Any Feature Is Considered Complete
- **planning/MIGRATION_SAFETY_CHECKLIST.md** — Migration-specific procedures
- **planning/RELEASE_CHECKLIST.md** — Pre-release gates
- **planning/MONITORING_PLAYBOOK.md** — Detection and response
- **Vercel docs** — Rollback a deployment (https://vercel.com/docs)
- **Supabase docs** — Revert a migration (https://supabase.com/docs)
