## Project Overview

Project: IndustryX

This repository is developed using cloud AI agents. The AI must assume it is operating in a production environment and should always prefer production-ready solutions.

---

## Infrastructure

### Source Control

GitHub Repository

### Deployment

Vercel

### Database

Supabase

### Authentication

Supabase Auth

### Primary Login Method

* Anonymous Authentication
* Google OAuth

---

## Environment Variables

Environment variables are NOT stored in the repository.

All required secrets are already configured in:

* GitHub Repository Secrets
* Vercel Environment Variables

Do NOT ask for API keys, tokens, or secret values unless a new integration is being introduced.

Assume required secrets already exist.

Do NOT create `.env` files containing real secrets.

Do NOT commit secrets into the repository.

Use environment variables only.

Example:

```ts
process.env.SUPABASE_SERVICE_ROLE_KEY
process.env.GROQ_API_KEY
process.env.OPENAI_API_KEY
```

Never hardcode credentials.

---

## AI Permissions

The AI may:

* Create files
* Modify files
* Refactor architecture
* Create migrations
* Create scripts
* Install dependencies
* Add npm packages
* Update package.json
* Create GitHub Actions
* Create deployment scripts
* Create database migrations
* Create SQL functions
* Create RLS policies

The AI should perform work autonomously whenever possible.

---

## AI Restrictions

Do NOT:

* Commit secrets
* Expose secrets in logs
* Print secret values
* Store tokens in source files
* Store credentials in documentation

---

## Database Rules

Supabase is the source of truth.

Server state is authoritative.

Client state must never override validated server state.

Prefer migrations over manual database changes.

---

## Architecture

This project follows a **server-first** architecture. AI agents must respect these boundaries:

### Public Pages → Server Components

All non-interactive public pages (landing, marketing, docs, error pages) must be implemented as **React Server Components (RSC)** — no `'use client'` directive, no client-side data fetching. Benefits: smaller JS bundle, better SEO, streaming SSR.

Examples:
- `/` (home/marketing) — RSC
- `/admin/login` — RSC (with client islands for OAuth only)
- Error pages (`error.tsx`, `not-found.tsx`, `global-error.tsx`) — RSC

### Game UI → Client Components

All interactive game UI must be **Client Components** with `'use client'`. Zustand store, hot-reloaded state, real-time interactions all require client-side execution.

Examples:
- `/` game page after auth → Client Component tree under `/src/components/game/**`
- LoginFloatingPanel, AccountSettingsModal, all panels under `/src/components/game/**`

### Game State → Server Authoritative

Game state lives in **Supabase** (`server_game_state` table) as the single source of truth. The Zustand store on the client is a **local cache + optimistic layer** only. All mutations go through `/api/game/*` endpoints which:
1. Load authoritative server state
2. Validate the action server-side
3. Apply the mutation with `state_version` optimistic lock
4. Return the new authoritative state

The client never wins a conflict — server state is final. The Zustand store is updated to match the server response, not the other way around.

### Database → Supabase (Source of Truth)

Supabase Postgres is the only database. All schemas, migrations, RLS policies, and functions live in `supabase/migrations/` (gitignored by default, force-added). Every schema change requires a numbered migration file.

**Never:**
- Create ad-hoc tables via the Supabase dashboard without writing a migration
- Bypass RLS by using service role in client code
- Query the database directly from client components (only via `/api/*` routes)
- Use `localStorage`/`IndexedDB` for authoritative state (only for offline cache)

### Cross-cutting Rules

- **Auth gates** — `stock_market`, `trade_post`, `leaderboard`, `mega_project` require non-guest authenticated users. Both client UI (LoginFloatingPanel) and server API routes (`verifyAuth` + `getUserGuestStatus`) enforce this.
- **Admin auth** — `/admin/*` requires membership in `admin_users` table (with `ADMIN_UIDS` env var bootstrap). Middleware + API routes both check.
- **Sentry** — error tracking is wired across client/server/edge runtimes. Don't bypass.
- **Sentry traces sample rate** — 0.1 (10%). Adjust only if explicit need.

---

## Deployment Rules

Vercel is the deployment target.

All production configuration should be compatible with Vercel.

Assume production environment variables already exist.

Only request manual intervention when:

* OAuth provider setup requires owner action
* DNS configuration requires owner action
* Third-party account verification requires owner action
* Payment provider onboarding requires owner action

Otherwise perform changes automatically.

---

## Development Rules

* Production-ready only
* No placeholders
* No mock implementations
* No temporary solutions
* No demo code
* No hardcoded secrets
* Enterprise-grade architecture
* Backward compatible migrations whenever possible

---

## Decision Rule

Before asking the owner to perform a task:

1. Determine whether it can be solved through code.
2. Determine whether it can be solved through migration.
3. Determine whether it can be solved through automation.
4. Only ask the owner if external platform access is genuinely required.

Default behavior:

Implement first.
Ask later only when necessary.
