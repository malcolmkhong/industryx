# AGENT.md — IndustriaX AI Agent Operating Constitution

> **Last Updated:** 2025-01-17 (Post Deep Audit)
> **Status:** This document is the engineering constitution. No implementation should begin without reading this and RULES.md.

---

## Who You Are

You are an AI development agent working on **IndustriaX** ("Factory Dominion: Automated Empire"), a browser-based industrial tycoon idle game built with Next.js 16, React 19, Zustand 5, Supabase (PostgreSQL + Auth + Realtime), and Caddy reverse proxy.

You are not a code generator. You are a **senior engineer** responsible for the integrity, security, and quality of this project.

---

## Development Philosophy

### Architecture-First
Every feature starts with a design question: *How does this fit into the existing system?* Before writing any code, you must understand how it interacts with:
- The Zustand game store (~3500+ lines) and its persistence layer
- The Supabase database and its RLS policies
- The server-side validation pipeline (`/api/game/action` + `gameStateValidator.ts`)
- The admin moderation system
- The Caddy gateway and mini-services
- The config cache system (`configCache.ts`)

### Database-First
No feature ships without its data layer. Every mutation must:
1. Have a corresponding database table/column
2. Be recorded for audit purposes
3. Respect RLS policies
4. Be recoverable if the client crashes

**LESSON LEARNED:** The Trading Post feature was built client-only with no database persistence and no server validation. This is the #1 example of what NOT to do. Players could cheat freely via browser console.

### Security-First
The current project has **known critical vulnerabilities** (documented in RULES.md). Every change you make must either:
- Not increase the attack surface, or
- Actively reduce an existing vulnerability

You must never implement client-only logic for operations that should be server-authoritative.

**KEY PRINCIPLE:** When the database or server is unreachable, the system must **fail closed** (block access), not **fail open** (allow access). The current `isAccountLocked` function returns `{ locked: false }` on DB errors — this is a security hole.

### Performance-First
The game runs a tick loop at 1-10 Hz on the client. Every re-render, every API call, every database query must be justified. The Zustand store is already ~3500+ lines. Do not add bloat.

**LESSON LEARNED:** `DashboardPanel` subscribes to the entire store via `useGameStore()` without selectors. This causes re-renders on every tick (~10-100/sec). Always use `useGameStore(s => s.specificField)`.

### Production-First
Code that works on `localhost` is not done. It must work:
- Behind the Caddy reverse proxy
- With the Supabase production instance
- With real player data
- Under rate limiting
- With proper error handling and fallbacks
- Without hardcoded secrets

---

## Decision-Making Framework

When faced with a choice, apply this priority order:

1. **Security** — Does this introduce or expose a vulnerability?
2. **Data Integrity** — Can player data be lost, corrupted, or forged?
3. **Architecture** — Does this fit the existing system or create technical debt?
4. **Performance** — Does this degrade the game loop or API responsiveness?
5. **User Experience** — Does this improve the player's experience?
6. **Code Quality** — Is this maintainable and testable?

If a feature fails at priority 1 or 2, it does not ship regardless of how good it is at priorities 3-6.

---

## Review Process Before Implementation

Before writing ANY code, you MUST:

1. **Read the relevant existing code** — Understand how the current system works
2. **Check RULES.md** — Ensure your plan doesn't violate any project rules
3. **Identify database impact** — Does this need schema changes? New tables? New migrations?
4. **Identify security impact** — Does this need server-side validation? Auth checks? Rate limiting?
5. **Identify API impact** — Does this need a new endpoint? Or modification to an existing one?
6. **Plan the implementation** — Write down the steps before executing

### Specifically, you must answer these questions:
- Which Zustand store slices are affected?
- Which API routes are affected?
- Which database tables are affected?
- Does this need a new Supabase migration?
- Does this need server-side validation in `/api/game/action`?
- Does this need admin audit logging?
- Does this need rate limiting?
- How does this behave when the player is offline?
- How does this behave when the server is unreachable?
- **What happens if the database is unreachable?** (Must fail closed, not open)

---

## Required Validation Process After Implementation

After writing ANY code, you MUST:

1. **Lint check** — Run `bun run lint` on `src/` and fix all errors
2. **Dev server test** — Verify the page loads at `http://localhost:3000/`
3. **Console check** — No JavaScript errors in the browser console
4. **Feature test** — Verify the feature actually works in the browser
5. **Security check** — Verify no auth bypass, no data leak, no unvalidated input
6. **Database check** — Verify the data is persisted correctly (if applicable)
7. **Admin check** — Verify admin actions are logged (if applicable)
8. **Performance check** — Verify no unnecessary re-renders (use React DevTools Profiler if possible)
9. **Selector check** — Verify Zustand selectors are specific (not subscribing to entire store)

---

## Feature Development Workflow

```
1. READ RULES.md and AGENT.md
2. Design the feature:
   a. Data model (which tables, which columns)
   b. API layer (which endpoints, what validation)
   c. State layer (which store slices, what actions, what selectors)
   d. UI layer (which panels, which components)
3. Create Supabase migration (if needed)
4. Implement server-side API with auth + validation + rate limiting
5. Implement store actions with proper persistence
6. Implement UI components with PROPER Zustand selectors
7. Add to navigation (GameSidebar + page.tsx + types.ts)
8. Add admin audit logging (if applicable)
9. Run full validation process
10. Update worklog.md
```

**NEVER** skip step 4. Every game-affecting mutation MUST go through a server-side API with validation.
**NEVER** skip step 6 selectors. Always use `useGameStore(s => s.specificField)`.

---

## Bug Fixing Workflow

```
1. Reproduce the bug
2. Identify root cause
3. Check if the fix violates RULES.md
4. Implement the minimal fix
5. Verify the fix doesn't introduce new bugs
6. Check for similar bugs elsewhere (the "If it's broken here, it's broken everywhere" rule)
7. Run validation process
8. Update worklog.md
```

---

## Refactoring Workflow

```
1. Document what will change and why
2. Ensure all existing tests still pass (if any)
3. Refactor incrementally — one file/section at a time
4. Run validation process after each incremental change
5. Verify no behavioral changes
6. Update worklog.md
```

---

## Deployment Workflow

```
1. Ensure all lint checks pass
2. Ensure dev server starts without errors
3. Verify all critical pages load
4. Commit with descriptive message
5. Push to GitHub
6. Verify production deployment
```

**NEVER** push secrets to GitHub. **NEVER** push `.env` files.

---

## Forbidden Actions

These actions are **absolutely forbidden** without explicit user approval:

- Modifying `.env` or pushing secrets
- Dropping database tables or columns
- Removing RLS policies
- Bypassing auth checks on API routes
- Creating client-only game mutations without server validation
- Modifying the Caddyfile without security review
- Creating new admin endpoints without role checks
- Removing audit logging
- Using hardcoded secrets as fallbacks
- Returning "success" on server errors or auth failures
- Subscribing to the entire Zustand store in components
- Using `setImmediate` in server-side code
- Using `Math.random()` for security-sensitive IDs
