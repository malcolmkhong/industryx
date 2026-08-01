# Monitoring Playbook

> **Date:** 2026-06-11
> **Purpose:** Daily monitoring + incident response for production operations
> **Authority:** RULES.md §2.5, §6.2, §7 (operational rules)
> **Reference:** Sentry, Supabase, Vercel

---

## Daily Checks (5 minutes)

### Morning Routine

Run through this checklist each morning:

- [ ] **Sentry dashboard** — Any new issues in last 24h?
  - Filter by `level:error` and `is:unresolved`
  - Look for: new issue types, spike in frequency, regressions
  - Action: Triage new issues, assign to backlog
- [ ] **Sentry performance** — Any p95 latency spikes?
  - Filter by `/api/game/state` and `/api/game/action`
  - Baseline: p95 < 200ms
  - Action: Investigate if p95 > 1s
- [ ] **Supabase dashboard** — DB connection health?
  - Check: Connection count, query latency, active sessions
  - Baseline: < 50 connections, < 100ms query latency
  - Action: Investigate if connections > 100 or queries > 1s
- [ ] **`/api/health` endpoint** — Returns 200?
  - `curl https://<prod>/api/health`
  - Should return: `{ status: "ok", db: "connected", uptime: <seconds> }`
  - Action: Investigate if non-200
- [ ] **Vercel dashboard** — Deploys green?
  - Last deploy: status, build time, errors
  - Baseline: < 5min build, 0 errors
  - Action: Check failed deploys

### Weekly Checks (30 minutes, Monday morning)

- [ ] **Sentry issue cleanup** — Close resolved issues, update linked PRs
- [ ] **Supabase backups** — Verify last 7 daily backups exist
- [ ] **Rate limit table size** — `SELECT COUNT(*) FROM rate_limits;` (if Option A implemented)
- [ ] **Cloud sync conflict rate** — Check for STATE_VERSION_CONFLICT spikes
- [ ] **Trade rejection rate** — Check for unusual trade rejection patterns
- [ ] **Admin actions audit** — Review recent admin actions for anomalies
- [ ] **Dependency updates** — Check for security advisories in `bun audit`
- [ ] **worklog.md** — Verify all deploys logged

---

## Real-Time Alerts (Sentry)

### Required Alert Rules

Configure in Sentry → Settings → Alerts:

#### Rule 1: New Critical Issue

```
When: A new issue is first seen
Filter: level:error
Threshold: 1 occurrence
Action: Notify #alerts channel
```

**Rationale**: Catch new issues immediately, not after they pile up.

#### Rule 2: Issue Spike

```
When: An issue's frequency > 10x baseline in 1 hour
Filter: is:unresolved
Threshold: 10x increase vs 1h rolling average
Action: Notify #alerts channel
```

**Rationale**: Catches both regressions and DDoS patterns.

#### Rule 3: API Latency Spike

```
When: p95 latency for /api/game/state > 5s in 5min window
Filter: transaction:/api/game/state
Threshold: p95 > 5000ms
Action: Notify #alerts channel
```

**Rationale**: Cloud sync is critical for player experience. Slow sync = churn.

#### Rule 4: Trade Error Spike

```
When: 50+ trade failures in 5min window
Filter: transaction:/api/game/trade level:error
Threshold: 50 errors in 5min
Action: Notify #alerts channel
```

**Rationale**: Trade is revenue-critical. Spikes indicate DB or auth issues.

#### Rule 5: Health Check Failure

```
When: /api/health returns non-200
Filter: transaction:/api/health
Threshold: 3 consecutive failures
Action: Notify #incidents channel (CRITICAL)
```

**Rationale**: Health check is the canary. 3 failures = systemic issue.

---

## Database-Level Alerts

These alerts are triggered by database state (cron jobs or scheduled checks), not Sentry events.

### Alert 1: Cheat Flag Threshold

**Severity:** MEDIUM

**Trigger:**
```sql
SELECT user_id, cheat_flag_count
FROM server_game_state
WHERE cheat_flag_count >= 2;
```

**Why:** Accounts auto-lock at 3 flags (`lock_cheater_account()` is called at threshold 3 in the cheat-detection flow, per migration 005). Admin should review users at 2 flags before the auto-lock engages.

**Action:**
1. Query `cheat_investigations` table for the flagged user to see what triggered the flags
2. Review evidence (event type, timestamp, any prior flags)
3. Decide: is this legitimate cheating or a false positive?

**Escalation:** If evidence indicates legitimate cheating, force-lock early via:
```sql
SELECT lock_cheater_account('<user_id>', 'manual-lock-at-2-flags');
```
Otherwise, note the review in `cheat_investigations` and leave the account active.

**Schedule:** Check daily (part of morning routine).

---

### Alert 2: Abandoned Link Operation

**Severity:** LOW

**Trigger:**
```sql
SELECT operation_id, user_id, created_at
FROM pending_link_operations
WHERE status = 'pending'
  AND created_at < NOW() - INTERVAL '1 hour';
```

**Why:** A user started a guest-to-auth account merge but never completed the confirmation step (e.g., clicked the link in email then closed the tab, or the confirmation window expired). These rows are harmless but indicate a broken UX flow.

**Action:**
1. Review count: how many abandoned links?
2. If < 5: no action (expected noise)
3. If spike (> 20 in one hour): investigate — possible bug in the link flow, email delivery issue, or bot traffic spamming the link endpoint

**Cleanup (optional):** Rows eventually expire, but can be cleaned up manually:
```sql
-- Delete links abandoned for > 24 hours
DELETE FROM pending_link_operations
WHERE status = 'pending'
  AND created_at < NOW() - INTERVAL '24 hours';
```

**Escalation:** If spike detected, ping the `#alerts` channel for investigation. Check Sentry for errors from the `/api/auth/link` endpoint.

**Schedule:** Check on weekly review.

---

### Alert 3: Rate Limits Table Bloat

**Severity:** LOW

**Trigger:**
```sql
SELECT count(*) AS row_count FROM rate_limits;
```
Alert when `row_count > 100000`.

**Why:** The `rate_limits` table grows unbounded without periodic cleanup. At > 100k rows, query performance may degrade and storage costs increase.

**Action:**
1. Run cleanup function (from migration 016):
```sql
SELECT cleanup_rate_limits();
```
2. Verify row count dropped:
```sql
SELECT count(*) FROM rate_limits;
```

**Escalation:** If cleanup fails or row count continues growing rapidly (> 50k new rows/day), investigate for:
- Bot/automated attack triggering rate limits
- Rate limit configuration too aggressive (too many entries created)
- Cleanup function not scheduled

Escalate to `#alerts` if growth exceeds 50k/day.

**Schedule:** Check weekly (already on weekly checklist — this alert formalizes the threshold).

---

## Incident Response

### Severity Levels

| Severity | Definition | Response Time | Notification |
|----------|-----------|---------------|--------------|
| **CRITICAL** | Service down, data loss, security breach | < 15 min | All hands + #incidents |
| **HIGH** | Major feature broken, significant user impact | < 1 hour | On-call + #alerts |
| **MEDIUM** | Single endpoint broken, workaround exists | < 4 hours | On-call + #alerts |
| **LOW** | Minor issue, no immediate user impact | Next business day | Backlog |

### Response Procedure

1. **Acknowledge** — Reply in #alerts that you're investigating
2. **Assess** — Determine severity using matrix above
3. **Investigate** — Follow specific scenario procedures (below)
4. **Mitigate** — Stop bleeding (rollback, feature flag, hotfix)
5. **Resolve** — Fix root cause
6. **Document** — Update worklog.md + write incident report if CRITICAL/HIGH
7. **Post-mortem** — Schedule for CRITICAL incidents

---

## Specific Scenarios

### Scenario 1: Database Outage (Supabase)

**Detection**: `/api/health` returns 503, Sentry shows Supabase connection errors

**Expected Behavior** (per RULES.md §2.5 fail-closed):
- `isAccountLocked()` returns `{ locked: true }` on DB error
- Players blocked from sync (intentional)
- Cloud sync fails with clear error
- Game continues locally (store + persist)

**Response**:
1. Check Supabase status: https://status.supabase.com
2. If Supabase-wide outage: monitor, no action needed
3. If project-specific: check Supabase dashboard for project issues
4. If prolonged (>30 min): add incident banner to game UI ("Sync temporarily unavailable")
5. After recovery: verify all data syncs correctly
6. Document in worklog.md

**Don't**: Try to bypass auth or rate limits during outage. Fail-closed is correct.

### Scenario 2: CHECKSUM_SECRET Missing

**Detection**: Sentry shows "CHECKSUM_SECRET not set" errors

**Expected Behavior** (per RULES.md C1):
- `generateChecksum()` throws if `CHECKSUM_SECRET` is not set
- `verifyChecksum()` returns false (fail-closed)
- All cheat detection events fail
- Game state validation rejects all saves
- Massive spike in Sentry

**Response**:
1. Verify env var in production: `vercel env ls | rg CHECKSUM_SECRET`
2. If missing: Set immediately in Vercel env
3. Redeploy (env var change requires redeploy for new runtime)
4. Verify in Sentry that errors stop
5. Post-mortem: How did env var get unset? (Check git log for env changes)
6. Document in worklog.md

**Don't**: Add fallback secret. Fix the env var.

### Scenario 3: Rate Limit Storm

**Detection**: Sentry shows spike in 429 errors, players report "action failed"

**Possible Causes**:
- Bot/automated attack
- Legitimate player with bug (e.g., infinite loop in client)
- DDoS attempt
- Actual player spike (e.g., event, new feature launch)

**Response**:
1. Identify source: Supabase logs → look for high-frequency users
2. If single user/IP: rate-limit that user/IP, contact if legitimate
3. If multiple: check if legitimate spike (event) or attack
4. If attack: enable Cloudflare protection, increase rate limits if needed
5. If bug: investigate client code causing excess requests
6. Document in worklog.md

**Don't**: Disable rate limits globally. The protection is correct.

### Scenario 4: Cloud Sync Conflict Spike

**Detection**: Sentry shows spike in STATE_VERSION_CONFLICT (409) responses

**Possible Causes**:
- Player logged in on multiple devices simultaneously
- Race condition in code (multiple cloud saves in flight)
- Bug in conflict resolution (merge losing data)

**Response**:
1. Check Supabase logs: are conflicts from single user (multi-device) or many users?
2. If single user multi-device: expected, may need UX improvement
3. If many users: investigate code for race condition
4. Check Sentry for "data loss" reports (merge bug?)
5. If data loss: CRITICAL, rollback, document

**Don't**: Disable state_version conflict detection. Data corruption risk is higher.

### Scenario 5: Trade Rejection Spike

**Detection**: Sentry shows spike in trade 400/403/409 errors

**Possible Causes**:
- Server resources out of sync with client (UI shows wrong amounts)
- INSUFFICIENT_RESOURCES (player tried to trade what they don't have)
- CONCURRENT_MODIFICATION (legitimate race)
- Capacity cap (player tried to receive more than storage allows)

**Response**:
1. Sample 10-20 trade errors in Sentry
2. Categorize: validation vs race vs capacity
3. If validation: check for client desync bug
4. If race: check if state_version flow is working
5. If capacity: check if capacity calc is correct (new buildings may have changed it)
6. Document in worklog.md

**Don't**: Allow trades to proceed without validation. Security risk.

### Scenario 6: Admin Auth Issue

**Detection**: Admins report 403 errors on /admin/* routes

**Possible Causes**:
- ADMIN_UIDS env var changed accidentally
- admin_users table migration broke
- RLS policy changed

**Response**:
1. Check Vercel env: `vercel env ls | rg ADMIN_UIDS`
2. Check Supabase: `SELECT * FROM admin_users;`
3. If env var missing: restore (compare to git history)
4. If table broken: check recent migrations
5. CRITICAL: If locked out, use `admin_users` table (RULES.md §5) as fallback
6. Document in worklog.md

**Don't**: Disable admin auth checks. CRITICAL security risk.

### Scenario 7: Sentry SDK Down

**Detection**: Sentry SDK errors in browser, no events received in dashboard

**Possible Causes**:
- Sentry service outage (check https://status.sentry.io)
- DSN misconfigured
- Browser blocking Sentry (ad blocker, etc.)
- SDK version issue

**Response**:
1. Verify Sentry status: https://status.sentry.io
2. Verify DSN in production env: `vercel env ls | rg SENTRY_DSN`
3. Test in browser: trigger test error, check console
4. If outage: monitor, no action (errors queue locally)
5. If misconfig: fix DSN, redeploy
6. Document in worklog.md

**Don't**: Disable error handling. Sentry is critical for incident response.

---

## Key Metrics Dashboard

### Player Experience

| Metric | Baseline | Alert Threshold |
|--------|----------|-----------------|
| p95 page load | < 2s | > 5s |
| p95 `/api/game/state` | < 200ms | > 1s |
| p95 `/api/game/trade` | < 500ms | > 2s |
| Cloud sync success rate | > 99% | < 95% |
| Trade success rate | > 95% | < 90% |
| JS console errors (per session) | 0 | > 5 |

### Operational

| Metric | Baseline | Alert Threshold |
|--------|----------|-----------------|
| DB connection count | < 50 | > 100 |
| DB query latency p95 | < 100ms | > 500ms |
| Vercel build time | < 5min | > 10min |
| Sentry event volume | 1k/day | > 10k/day |
| Failed deploys | 0/week | > 1/week |

### Security

| Metric | Baseline | Alert Threshold |
|--------|----------|-----------------|
| 401 responses (unauth) | < 1% of auth-required | > 5% |
| 403 responses (forbidden) | < 0.1% of admin | > 1% |
| Rate limit 429s | < 0.1% of requests | > 1% |
| Cheat detection events | < 5/day | > 20/day |
| New Sentry security issues | 0/week | > 1/week |

---

## Reference Runbooks

### On-Call Rotation

- [ ] Primary on-call: [name/team]
- [ ] Secondary on-call: [name/team]
- [ ] Escalation: [manager/team-lead]
- [ ] Customer support liaison: [name/team]

### Communication Channels

- `#alerts` — Sentry alerts, low/medium severity
- `#incidents` — High/critical severity, requires immediate attention
- `#deploys` — Deploy notifications
- `#worklog` — General team updates

### External Status Pages

- Vercel: https://vercel-status.com
- Supabase: https://status.supabase.com
- Sentry: https://status.sentry.io
- Cloudflare (if used): https://www.cloudflarestatus.com

---

## References

- **RULES.md §2.5** — Authentication + Validation (fail-closed)
- **RULES.md §6** — Performance Rules
- **AGENT.md** — Engineering constitution
- **PROJECT_STATUS_SOURCE_OF_TRUTH.md** — Current 25-issue status
- **planning/RELEASE_CHECKLIST.md** — Pre-release verification
- **planning/ROLLBACK_PLAYBOOK.md** — Detailed rollback procedures
- **Sentry MCP** — Issue investigation (`mcp__sentry__*` tools)
- **Supabase MCP** — Database investigation (`mcp__supabase__*` tools)
